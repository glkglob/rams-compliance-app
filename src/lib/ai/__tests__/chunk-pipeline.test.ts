import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDeleteBuilder = {
  delete:  vi.fn(),
  eq:      vi.fn(),
  insert:  vi.fn(),
  from:    vi.fn(),
};
mockDeleteBuilder.delete.mockReturnValue(mockDeleteBuilder);
mockDeleteBuilder.eq.mockResolvedValue({ error: null });
mockDeleteBuilder.insert.mockResolvedValue({ error: null });

vi.mock('@/lib/db/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => mockDeleteBuilder),
  })),
}));

vi.mock('@/lib/ai/embeddings', () => ({
  generateEmbeddings: vi.fn(async (texts: string[]) =>
    texts.map(() => Array(1536).fill(0.1)),
  ),
  EMBEDDING_MODEL:      'text-embedding-3-small',
  EMBEDDING_DIMENSIONS: 1536,
}));

vi.mock('@/lib/observability/sentry-context', () => ({
  addOrchestratorBreadcrumb: vi.fn(),
}));

import { generateEmbeddings } from '@/lib/ai/embeddings';
import {
  chunkAndEmbed,
  processRamsChunks,
  storeRamsChunks,
  RAMS_CHUNK_SIZE_CHARS,
  RAMS_CHUNK_OVERLAP_CHARS,
} from '@/lib/ai/chunk-pipeline';

// ── chunkAndEmbed ─────────────────────────────────────────────────────────────

describe('chunkAndEmbed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array for empty text', async () => {
    const result = await chunkAndEmbed('');
    expect(result).toEqual([]);
    expect(generateEmbeddings).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only text', async () => {
    const result = await chunkAndEmbed('   \n   ');
    expect(result).toEqual([]);
  });

  it('returns one chunk+embedding per chunk', async () => {
    const text = 'This is a test sentence. It has enough content to be chunked properly.';
    const result = await chunkAndEmbed(text);
    expect(result.length).toBeGreaterThan(0);
    for (const { chunk, embedding } of result) {
      expect(typeof chunk.text).toBe('string');
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding).toHaveLength(1536);
    }
  });

  it('passes custom chunk size and overlap to chunkText', async () => {
    const longText = 'Word '.repeat(500);
    const result = await chunkAndEmbed(longText, { chunkSize: 200, overlap: 20 });
    // With a 200-char chunk size, 2500-char text should produce multiple chunks
    expect(result.length).toBeGreaterThan(1);
  });

  it('calls generateEmbeddings with the chunk texts', async () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    await chunkAndEmbed(text);
    expect(generateEmbeddings).toHaveBeenCalledOnce();
    const [texts] = (generateEmbeddings as ReturnType<typeof vi.fn>).mock.calls[0] as [string[]];
    expect(texts.every((t) => typeof t === 'string')).toBe(true);
  });
});

// ── storeRamsChunks ───────────────────────────────────────────────────────────

describe('storeRamsChunks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes existing rows then inserts new ones', async () => {
    const pairs = [
      { chunk: { text: 'chunk text', index: 0 }, embedding: Array(1536).fill(0) },
    ];
    await storeRamsChunks('rams-1', pairs);
    expect(mockDeleteBuilder.delete).toHaveBeenCalled();
    expect(mockDeleteBuilder.eq).toHaveBeenCalledWith('rams_submission_id', 'rams-1');
    expect(mockDeleteBuilder.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          rams_submission_id: 'rams-1',
          chunk_text:         'chunk text',
          chunk_index:        0,
        }),
      ]),
    );
  });

  it('skips insert when pairs is empty (still deletes)', async () => {
    await storeRamsChunks('rams-2', []);
    expect(mockDeleteBuilder.delete).toHaveBeenCalled();
    expect(mockDeleteBuilder.insert).not.toHaveBeenCalled();
  });

  it('throws when delete fails', async () => {
    mockDeleteBuilder.eq.mockResolvedValueOnce({ error: { message: 'db error' } });
    await expect(storeRamsChunks('rams-3', [])).rejects.toThrow('Failed to clear old RAMS chunks');
  });

  it('throws when insert fails', async () => {
    // Delete succeeds, insert fails
    mockDeleteBuilder.eq.mockResolvedValueOnce({ error: null });
    mockDeleteBuilder.insert.mockResolvedValueOnce({ error: { message: 'insert error' } });
    const pairs = [{ chunk: { text: 'x', index: 0 }, embedding: [] }];
    await expect(storeRamsChunks('rams-4', pairs)).rejects.toThrow('Failed to insert RAMS chunks');
  });
});

// ── processRamsChunks ─────────────────────────────────────────────────────────

describe('processRamsChunks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a result summary with stored count', async () => {
    const text = 'This is a RAMS document. It covers site safety.';
    const result = await processRamsChunks('rams-99', text);
    expect(result.ramsSubmissionId).toBe('rams-99');
    expect(typeof result.chunksStored).toBe('number');
    expect(result.model).toBe('text-embedding-3-small');
    expect(result.dimensions).toBe(1536);
  });

  it('stores zero chunks when text is empty', async () => {
    const result = await processRamsChunks('rams-empty', '');
    expect(result.chunksStored).toBe(0);
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('chunk size constants', () => {
  it('RAMS_CHUNK_SIZE_CHARS matches 800 tokens × 4 chars/token', () => {
    expect(RAMS_CHUNK_SIZE_CHARS).toBe(800 * 4);
  });
  it('RAMS_CHUNK_OVERLAP_CHARS matches 100 tokens × 4 chars/token', () => {
    expect(RAMS_CHUNK_OVERLAP_CHARS).toBe(100 * 4);
  });
});
