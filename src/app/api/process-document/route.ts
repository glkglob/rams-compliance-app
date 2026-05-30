import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';

import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { extractTextFromFile } from '@/lib/documents/extract-text';
import { chunkText } from '@/lib/documents/chunk-text';
import { DOCUMENTS_BUCKET } from '@/lib/documents/storage';
import { generateEmbeddings } from '@/lib/ai/embeddings';
import { extractRequirements } from '@/lib/ai/agents/requirement-extraction-agent';
import { logger } from '@/lib/logging';
import type { DocumentProcessingPayload } from '@/lib/jobs/document-queue';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Chunk sizing is token-aware: we target ~800 tokens per chunk with ~100 tokens
// of overlap. chunkText() works in characters, so we convert using the standard
// ~4 chars/token heuristic (see estimateTokens in chunk-text.ts). This keeps
// each chunk comfortably inside text-embedding-3-small's 8191-token input limit.
const TARGET_CHUNK_TOKENS = 800;
const CHUNK_OVERLAP_TOKENS = 100;
const CHARS_PER_TOKEN = 4;
const CHUNK_SIZE_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN; // 3200
const CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN; // 400

/**
 * Authorize the incoming request. Accepts either a valid QStash signature
 * (production path) or a `Authorization: Bearer <CRON_SECRET>` header (manual /
 * cron retriggering). Returns null when authorized, or a NextResponse to return.
 */
async function authorize(request: Request, rawBody: string): Promise<NextResponse | null> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader === `Bearer ${cronSecret}`) {
      return null;
    }
  }

  const signature = request.headers.get('upstash-signature');
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (signature && currentSigningKey && nextSigningKey) {
    try {
      const receiver = new Receiver({ currentSigningKey, nextSigningKey });
      const isValid = await receiver.verify({ signature, body: rawBody });
      if (isValid) {
        return null;
      }
    } catch (error) {
      logger.warn('QStash signature verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const unauthorized = await authorize(request, rawBody);
  if (unauthorized) {
    return unauthorized;
  }

  let payload: DocumentProcessingPayload;
  try {
    payload = JSON.parse(rawBody) as DocumentProcessingPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { documentId, jobId, projectId } = payload;
  if (!documentId || !jobId || !projectId) {
    return NextResponse.json({ error: 'Missing documentId, jobId or projectId' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Mark the job as processing.
  await supabase
    .from('document_processing_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', jobId);

  try {
    // 1. Load the document record.
    const { data: document, error: docError } = await supabase
      .from('compliance_documents')
      .select('id, project_id, file_name, file_type, document_category, storage_path')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message ?? documentId}`);
    }
    if (document.project_id !== projectId) {
      throw new Error(
        `Payload projectId (${projectId}) does not match document project_id (${document.project_id})`,
      );
    }
    if (!document.storage_path) {
      throw new Error('Document has no storage_path');
    }

    // 2. Download the file from Storage.
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(document.storage_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download file: ${downloadError?.message ?? 'unknown error'}`);
    }

    const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());

    // 3. Extract text (reuses existing per-format extraction + OCR).
    const mimeType = fileBlob.type || document.file_type;
    const extractionResult = await extractTextFromFile(fileBuffer, mimeType, document.file_name);
    const extractedText = extractionResult.extractedText ?? '';

    await supabase
      .from('compliance_documents')
      .update({
        extracted_text: extractedText || null,
        extraction_status: extractionResult.status === 'complete' ? 'complete' : 'failed',
        extraction_confidence: extractionResult.confidence,
      })
      .eq('id', documentId);

    if (extractionResult.status !== 'complete' || !extractedText.trim()) {
      throw new Error(
        `Text extraction failed: ${extractionResult.issues?.join('; ') || 'no text extracted'}`,
      );
    }

    // 4. Chunk the extracted text.
    const chunks = chunkText(extractedText, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS);

    // 5. Generate embeddings for each chunk (text-embedding-3-small, 1536 dims).
    const embeddings = await generateEmbeddings(chunks.map((c) => c.text));

    // 6. Replace this document's chunks with the freshly-embedded set.
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    if (chunks.length > 0) {
      const { error: chunkError } = await supabase.from('document_chunks').insert(
        chunks.map((chunk, i) => ({
          document_id: documentId,
          chunk_text: chunk.text,
          chunk_index: chunk.index,
          embedding: embeddings[i] ?? null,
        })),
      );
      if (chunkError) {
        throw new Error(`Failed to save chunks: ${chunkError.message}`);
      }
    }

    // 7. AI structuring → compliance_requirements (GPT-4o + JSON mode + Zod).
    const structuring = await extractRequirements({
      projectId,
      documents: [
        {
          documentId,
          fileName: document.file_name,
          category: document.document_category ?? 'general',
          text: extractedText,
        },
      ],
    });

    // Replace only this document's requirements (don't clobber other docs').
    await supabase
      .from('compliance_requirements')
      .delete()
      .eq('project_id', projectId)
      .eq('source_document_id', documentId);

    if (structuring.requirements.length > 0) {
      const { error: reqError } = await supabase.from('compliance_requirements').insert(
        structuring.requirements.map((req) => ({
          project_id: projectId,
          source_document_id: req.sourceDocumentId,
          requirement_code: req.requirementCode,
          requirement_text: req.requirementText,
          // Prefer the LLM's per-requirement category, falling back to the
          // document-level category and finally 'other'.
          category: req.category ?? document.document_category ?? 'other',
          severity: req.severity,
          source_excerpt: req.sourceExcerpt,
        })),
      );
      if (reqError) {
        throw new Error(`Failed to save requirements: ${reqError.message}`);
      }
    }

    // 8. Mark the job complete.
    await supabase
      .from('document_processing_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', jobId);

    logger.info('Document processing completed', {
      documentId,
      jobId,
      chunks: chunks.length,
      requirements: structuring.requirements.length,
    });

    return NextResponse.json({
      success: true,
      documentId,
      chunks: chunks.length,
      requirements: structuring.requirements.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Document processing failed', { documentId, jobId, error: message });

    // Record the failure + bump retry_count. Returning 500 lets QStash retry.
    const { data: jobRow } = await supabase
      .from('document_processing_jobs')
      .select('retry_count')
      .eq('id', jobId)
      .single();

    await supabase
      .from('document_processing_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: message,
        retry_count: (jobRow?.retry_count ?? 0) + 1,
      })
      .eq('id', jobId);

    await supabase
      .from('compliance_documents')
      .update({ extraction_status: 'failed' })
      .eq('id', documentId);

    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
