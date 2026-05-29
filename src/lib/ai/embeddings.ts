import { getOpenAIClient } from '@/lib/ai/openai-client';
import { withRetry } from '@/lib/ai/openai-resilience';
import { logger } from '@/lib/logging';

/** Model + dimensionality used for document_chunks.embedding (vector(1536)). */
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Max inputs per OpenAI embeddings request. The API accepts large arrays, but
 * keeping batches modest bounds per-request token usage and memory.
 */
const EMBEDDING_BATCH_SIZE = 96;

/**
 * Generate embeddings for a list of texts using text-embedding-3-small.
 * Returns one 1536-dim vector per input, in the same order. Requests are
 * batched and retried; empty input returns an empty array.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const client = getOpenAIClient();
  const embeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);

    const response = await withRetry(
      () =>
        client.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10_000, jitter: true },
    );

    // The API guarantees data is returned in input order, but sort defensively.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    for (const item of ordered) {
      embeddings.push(item.embedding);
    }
  }

  if (embeddings.length !== texts.length) {
    logger.warn('Embedding count mismatch', {
      expected: texts.length,
      received: embeddings.length,
    });
  }

  return embeddings;
}
