import { generateEmbeddings } from './embeddings';
import { logger } from '@/lib/logging';

export interface TextChunk {
  text: string;
  index: number;
}

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

/**
 * Split text into overlapping chunks.
 */
export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): TextChunk[] {
  if (!text || text.length <= chunkSize) {
    return [{ text: text.trim(), index: 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push({ text: chunk, index });
      index++;
    }

    start += chunkSize - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Chunk text + generate embeddings in batches.
 */
export async function chunkAndEmbedText(text: string): Promise<{ chunk: TextChunk; embedding: number[] }[]> {
  const chunks = chunkText(text);
  const results: { chunk: TextChunk; embedding: number[] }[] = [];

  const texts = chunks.map(c => c.text);
  const embeddings = await generateEmbeddings(texts);

  for (let i = 0; i < chunks.length; i++) {
    if (embeddings[i]) {
      results.push({
        chunk: chunks[i],
        embedding: embeddings[i],
      });
    }
  }

  logger.info('Chunked and embedded text', {
    inputLength: text.length,
    chunks: chunks.length,
    embeddingsGenerated: results.length,
  });

  return results;
}
