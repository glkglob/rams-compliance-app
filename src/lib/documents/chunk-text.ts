export interface TextChunk {
  text: string;
  index: number;
  metadata?: Record<string, unknown>;
}

/**
 * Rough token estimate without pulling in a tokenizer dependency. OpenAI's
 * embedding/chat models average ~4 characters per token for English prose, so
 * `chars / 4` is a good-enough heuristic for sizing chunks and logging usage.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into overlapping, sentence-aware chunks.
 *
 * Sizes are expressed in characters. Because we don't bundle a tokenizer, the
 * worker derives these char limits from a token target using the ~4 chars/token
 * heuristic (see {@link estimateTokens}). Two safeguards keep chunks within the
 * embedding model's input limit:
 *   1. sentences accumulate until adding the next one would exceed `maxChunkSize`;
 *   2. any single segment longer than `maxChunkSize` (e.g. OCR output with no
 *      punctuation) is hard-split so no chunk can blow the token ceiling.
 */
export function chunkText(
  text: string,
  maxChunkSize: number = 1000,
  overlap: number = 200
): TextChunk[] {
  const chunks: TextChunk[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];

  let currentChunk = "";
  let chunkIndex = 0;

  const pushChunk = (content: string) => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;
    chunks.push({
      text: trimmed,
      index: chunkIndex,
      metadata: {
        charCount: trimmed.length,
        estimatedTokens: estimateTokens(trimmed),
        sentenceCount: trimmed.split(/[.!?]+/).length - 1,
      },
    });
    chunkIndex++;
  };

  for (const rawSentence of sentences) {
    // A single sentence can exceed maxChunkSize (long tables, OCR noise). Break
    // it into hard slices so it never produces an over-limit chunk.
    const segments =
      rawSentence.length > maxChunkSize
        ? (rawSentence.match(new RegExp(`[\\s\\S]{1,${maxChunkSize}}`, "g")) ?? [rawSentence])
        : [rawSentence];

    for (const sentence of segments) {
      if ((currentChunk + sentence).length > maxChunkSize && currentChunk.length > 0) {
        pushChunk(currentChunk);

        // Carry over the last `overlap` characters for context. Bounding by
        // characters (not words) keeps the overlap finite even for space-less
        // text (e.g. OCR/long tables); trim a leading partial word for cleanliness.
        const overlapText = currentChunk.slice(-overlap).replace(/^\S+\s/, "");
        currentChunk = (overlapText ? overlapText + " " : "") + sentence;
      } else {
        currentChunk += (currentChunk ? " " : "") + sentence;
      }
    }
  }

  pushChunk(currentChunk);

  return chunks;
}
