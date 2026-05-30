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
import { withRequestContext } from '@/lib/request-context';

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

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

type ProcessingJobRow = {
  id: string;
  document_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count: number;
};

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

async function postProcessDocument(request: Request) {
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
  let job: ProcessingJobRow | null = null;

  const { data: loadedJob, error: jobLoadError } = await supabase
    .from('document_processing_jobs')
    .select('id, document_id, status, retry_count')
    .eq('id', jobId)
    .single();

  if (jobLoadError || !loadedJob) {
    logger.error('Document processing job not found', {
      jobId,
      documentId,
      error: jobLoadError?.message,
    });
    return NextResponse.json({ error: 'Invalid processing request' }, { status: 400 });
  }

  job = loadedJob as ProcessingJobRow;

  if (job.document_id !== documentId) {
    logger.warn('Document processing payload documentId mismatch', {
      jobId,
      payloadDocumentId: documentId,
      jobDocumentId: job.document_id,
    });

    await recordProcessingFailure(
      supabase,
      jobId,
      documentId,
      'Payload documentId does not match job document_id',
      job.retry_count,
      false,
    );

    return NextResponse.json({ error: 'Invalid processing request' }, { status: 400 });
  }

  if (job.status === 'completed') {
    logger.info('Document processing job already completed; treating retry as idempotent', {
      jobId,
      documentId,
    });
    return NextResponse.json({ success: true, documentId, idempotent: true });
  }

  // Integrity gate: do not process until the job row has been loaded and its
  // document_id matches the signed payload.
  const { error: startJobError } = await supabase
    .from('document_processing_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString(), error_message: null })
    .eq('id', jobId);

  if (startJobError) {
    logger.error('Failed to mark document processing job as processing', {
      jobId,
      documentId,
      error: startJobError.message,
    });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

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

    // Ownership / payload validation: the projectId in the QStash payload must match
    // the document's actual project. This is a non-retriable client error.
    if (document.project_id !== projectId) {
      logger.warn('Document processing payload projectId mismatch', {
        documentId,
        jobId,
        payloadProjectId: projectId,
        documentProjectId: document.project_id,
      });

      await recordProcessingFailure(
        supabase,
        jobId,
        documentId,
        'Payload projectId does not match document project_id',
        job.retry_count,
        true,
      );

      return NextResponse.json({ error: 'Invalid processing request' }, { status: 400 });
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

    const { error: documentUpdateError } = await supabase
      .from('compliance_documents')
      .update({
        extracted_text: extractedText || null,
        extraction_status: extractionResult.status === 'complete' ? 'complete' : 'failed',
        extraction_confidence: extractionResult.confidence,
      })
      .eq('id', documentId);

    if (documentUpdateError) {
      throw new Error(`Failed to save extraction result: ${documentUpdateError.message}`);
    }

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
    const { error: deleteChunksError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    if (deleteChunksError) {
      throw new Error(`Failed to replace existing chunks: ${deleteChunksError.message}`);
    }

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
    const { error: deleteReqError } = await supabase
      .from('compliance_requirements')
      .delete()
      .eq('project_id', projectId)
      .eq('source_document_id', documentId);

    if (deleteReqError) {
      throw new Error(`Failed to replace existing requirements: ${deleteReqError.message}`);
    }

    if (structuring.requirements.length > 0) {
      const { error: reqError } = await supabase.from('compliance_requirements').insert(
        structuring.requirements.map((req) => ({
          project_id: projectId,
          // The worker processes one verified document at a time; pin the source
          // to the loaded document instead of trusting model-generated IDs.
          source_document_id: documentId,
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

    await createProcessingAuditLog(supabase, 'DOCUMENT_PROCESSING_COMPLETED', documentId, {
      jobId,
      projectId,
      chunks: chunks.length,
      requirements: structuring.requirements.length,
    });

    // 8. Mark the job complete.
    const { error: completeJobError } = await supabase
      .from('document_processing_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', jobId);

    if (completeJobError) {
      throw new Error(`Failed to mark processing job completed: ${completeJobError.message}`);
    }

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

    // Record the failure + bump retry_count. Returning 500 lets QStash retry,
    // while the response body remains generic so internal document details are
    // not exposed to callers.
    await recordProcessingFailure(
      supabase,
      jobId,
      documentId,
      message,
      job?.retry_count ?? 0,
      true,
    );

    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

export const POST = withRequestContext(postProcessDocument, '/api/process-document');

async function recordProcessingFailure(
  supabase: SupabaseAdminClient,
  jobId: string,
  documentId: string,
  message: string,
  retryCount: number,
  markDocumentFailed: boolean,
) {
  const { error: jobUpdateError } = await supabase
    .from('document_processing_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: message,
      retry_count: retryCount + 1,
    })
    .eq('id', jobId);

  if (jobUpdateError) {
    logger.error('Failed to record document processing job failure', {
      jobId,
      documentId,
      error: jobUpdateError.message,
    });
  }

  if (markDocumentFailed) {
    const { error: documentUpdateError } = await supabase
      .from('compliance_documents')
      .update({ extraction_status: 'failed' })
      .eq('id', documentId);

    if (documentUpdateError) {
      logger.error('Failed to mark document extraction failed', {
        jobId,
        documentId,
        error: documentUpdateError.message,
      });
    }
  }

  await createProcessingAuditLog(supabase, 'DOCUMENT_PROCESSING_FAILED', documentId, {
    jobId,
    error: message,
    retryCount: retryCount + 1,
    documentMarkedFailed: markDocumentFailed,
  }).catch((auditError: unknown) => {
    logger.error('Failed to record document processing failure audit log', {
      jobId,
      documentId,
      error: auditError instanceof Error ? auditError.message : String(auditError),
    });
  });
}

async function createProcessingAuditLog(
  supabase: SupabaseAdminClient,
  action: 'DOCUMENT_PROCESSING_COMPLETED' | 'DOCUMENT_PROCESSING_FAILED',
  documentId: string,
  details: Record<string, unknown>,
) {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: null,
    action,
    entity_type: 'compliance_document',
    entity_id: documentId,
    details,
  });

  if (error) {
    throw new Error(`Failed to record ${action} audit log: ${error.message}`);
  }
}
