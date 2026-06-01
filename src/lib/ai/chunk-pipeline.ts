/**
 * Shared chunk-and-embed pipeline for RAMS submissions.
 *
 * Orchestrates the three-step process:
 *   1. Split extracted text into overlapping sentence-aware chunks
 *   2. Generate vector embeddings for each chunk (text-embedding-3-small)
 *   3. Upsert chunk rows into public.rams_chunks via the service-role admin client
 *
 * Design notes:
 * - Uses the same chunk sizes, model, and token heuristic as process-document
 *   so both compliance documents and RAMS submissions are in the same embedding
 *   space and can be compared via match_rams_chunks / match_document_chunks.
 * - Always deletes + reinserts on reprocessing so chunks stay in sync with
 *   re-extracted text (idempotent at the submission level).
 * - Chunking failures are non-fatal at the upload layer — the submission is
 *   usable without embeddings (semantic search just degrades gracefully).
 */

import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { chunkText, type TextChunk } from '@/lib/documents/chunk-text';
import { generateEmbeddings, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@/lib/ai/embeddings';
import { addOrchestratorBreadcrumb } from '@/lib/observability/sentry-context';
import { logger } from '@/lib/logging';

// ── Chunk-size constants (mirrors process-document/route.ts) ──────────────────

const TARGET_CHUNK_TOKENS  = 800;
const CHUNK_OVERLAP_TOKENS = 100;
const CHARS_PER_TOKEN      = 4;

export const RAMS_CHUNK_SIZE_CHARS    = TARGET_CHUNK_TOKENS  * CHARS_PER_TOKEN; // 3200
export const RAMS_CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN; // 400

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChunkWithEmbedding {
  chunk:     TextChunk;
  embedding: number[];
}

export interface ChunkPipelineResult {
  ramsSubmissionId: string;
  chunksStored:     number;
  model:            string;
  dimensions:       number;
}

// ── Core pipeline function ────────────────────────────────────────────────────

/**
 * Chunk a text string and generate embeddings for each chunk.
 * Returns paired { chunk, embedding } objects ready for storage.
 *
 * Returns an empty array when the input text is empty or whitespace-only.
 */
export async function chunkAndEmbed(
  text: string,
  options: {
    chunkSize?: number;
    overlap?:   number;
  } = {},
): Promise<ChunkWithEmbedding[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const chunkSize = options.chunkSize ?? RAMS_CHUNK_SIZE_CHARS;
  const overlap   = options.overlap   ?? RAMS_CHUNK_OVERLAP_CHARS;

  const chunks = chunkText(trimmed, chunkSize, overlap);
  if (chunks.length === 0) return [];

  const embeddings = await generateEmbeddings(chunks.map((c) => c.text));

  return chunks.map((chunk, i) => ({
    chunk,
    embedding: embeddings[i] ?? [],
  }));
}

// ── Storage ───────────────────────────────────────────────────────────────────

/**
 * Replace all chunks for a RAMS submission with a fresh set.
 *
 * Uses the service-role admin client (bypasses RLS) because chunk rows are
 * managed exclusively by background pipeline workers — no authenticated user
 * INSERT policy is defined for rams_chunks.
 */
export async function storeRamsChunks(
  ramsSubmissionId: string,
  pairs: ChunkWithEmbedding[],
): Promise<void> {
  const admin = getSupabaseAdmin();

  // Delete existing chunks first so reprocessing is always idempotent.
  const { error: deleteError } = await admin
    .from('rams_chunks')
    .delete()
    .eq('rams_submission_id', ramsSubmissionId);

  if (deleteError) {
    throw new Error(`Failed to clear old RAMS chunks: ${deleteError.message}`);
  }

  if (pairs.length === 0) return;

  const { error: insertError } = await admin.from('rams_chunks').insert(
    pairs.map(({ chunk, embedding }) => ({
      rams_submission_id: ramsSubmissionId,
      chunk_text:         chunk.text,
      chunk_index:        chunk.index,
      embedding,
    })),
  );

  if (insertError) {
    throw new Error(`Failed to insert RAMS chunks: ${insertError.message}`);
  }
}

// ── Top-level orchestrator ────────────────────────────────────────────────────

/**
 * Full end-to-end pipeline: chunk → embed → store.
 *
 * Designed to be called as a fire-and-forget background task from the RAMS
 * upload route (failures are logged but do not fail the upload response).
 *
 * Returns a result summary on success; throws on unrecoverable errors so the
 * caller can decide whether to surface the error or swallow it.
 */
export async function processRamsChunks(
  ramsSubmissionId: string,
  extractedText: string,
): Promise<ChunkPipelineResult> {
  logger.info('Starting RAMS chunk pipeline', { ramsSubmissionId });

  const pairs = await chunkAndEmbed(extractedText);

  addOrchestratorBreadcrumb('rams_loaded', {
    ramsSubmissionId,
    chunks: pairs.length,
    textLength: extractedText.length,
  });

  await storeRamsChunks(ramsSubmissionId, pairs);

  logger.info('RAMS chunk pipeline complete', {
    ramsSubmissionId,
    chunksStored: pairs.length,
  });

  return {
    ramsSubmissionId,
    chunksStored:  pairs.length,
    model:         EMBEDDING_MODEL,
    dimensions:    EMBEDDING_DIMENSIONS,
  };
}
