export interface TextChunk {
  text: string;
  index: number;
  metadata?: Record<string, unknown>;
}

export function chunkText(
  text: string,
  maxChunkSize: number = 1000,
  overlap: number = 200
): TextChunk[] {
  const chunks: TextChunk[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];

  let currentChunk = "";
  let chunkIndex = 0;

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
        metadata: {
          charCount: currentChunk.length,
          sentenceCount: currentChunk.split(/[.!?]+/).length - 1,
        },
      });
      chunkIndex++;

      const words = currentChunk.split(" ");
      const overlapWords = words.slice(-Math.floor(overlap / 5)).join(" ");
      currentChunk = overlapWords + " " + sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      metadata: {
        charCount: currentChunk.length,
        sentenceCount: currentChunk.split(/[.!?]+/).length - 1,
      },
    });
  }

  return chunks;
}
