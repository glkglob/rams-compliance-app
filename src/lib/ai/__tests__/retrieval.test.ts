import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/ai/embeddings', () => ({
  generateEmbeddings: vi.fn(async (texts: string[]) =>
    texts.map(() => Array(1536).fill(0.1)),
  ),
}));

vi.mock('@/lib/observability/sentry-context', () => ({
  addOrchestratorBreadcrumb: vi.fn(),
}));

import { generateEmbeddings } from '@/lib/ai/embeddings';
import {
  retrieveRelevantRequirements,
  retrieveRamsEvidence,
  retrieveRamsEvidenceBatch,
} from '@/lib/ai/retrieval';

// ── Supabase mock builder ─────────────────────────────────────────────────────

function makeSupabase(overrides: {
  rpcData?: unknown;
  rpcError?: { message: string } | null;
  fromData?: unknown[] | null;
  fromError?: { message: string } | null;
} = {}) {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: overrides.rpcData ?? [],
      error: overrides.rpcError ?? null,
    }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: overrides.fromData ?? [],
            error: overrides.fromError ?? null,
          }),
        }),
      }),
    }),
  };
}

// ── retrieveRelevantRequirements ──────────────────────────────────────────────

describe('retrieveRelevantRequirements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when document chunk search finds nothing', async () => {
    const supabase = makeSupabase({ rpcData: [] });
    const result = await retrieveRelevantRequirements(supabase, 'proj-1', 'sample RAMS text');
    expect(result.requirements).toHaveLength(0);
    expect(result.requirementDbIds.size).toBe(0);
  });

  it('returns requirements when vector search returns matching chunks', async () => {
    const supabase = makeSupabase({
      rpcData: [
        { id: 'c1', document_id: 'doc-1', chunk_text: 'PPE requirements', chunk_index: 0, similarity: 0.85 },
      ],
      fromData: [
        {
          id: 'req-1',
          requirement_code: 'REQ-001',
          requirement_text: 'All workers must wear PPE',
          category: 'health_and_safety',
          severity: 'critical',
          source_document_id: 'doc-1',
          source_excerpt: 'PPE is mandatory',
        },
      ],
    });

    const result = await retrieveRelevantRequirements(supabase, 'proj-1', 'RAMS about PPE and safety');
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].requirementCode).toBe('REQ-001');
    expect(result.requirementDbIds.get('REQ-001')).toBe('req-1');
  });

  it('calls generateEmbeddings with a prefix of the text', async () => {
    const supabase = makeSupabase();
    const longText = 'x'.repeat(5000);
    await retrieveRelevantRequirements(supabase, 'proj-1', longText, { queryPrefixChars: 2000 });
    const [texts] = (generateEmbeddings as ReturnType<typeof vi.fn>).mock.calls[0] as [string[]];
    expect(texts[0]).toHaveLength(2000);
  });

  it('returns empty on RPC error without throwing', async () => {
    const supabase = makeSupabase({ rpcError: { message: 'timeout' } });
    const result = await retrieveRelevantRequirements(supabase, 'proj-1', 'text');
    expect(result.requirements).toHaveLength(0);
  });
});

// ── retrieveRamsEvidence ──────────────────────────────────────────────────────

describe('retrieveRamsEvidence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a chunk and evidence quote when match_rams_chunks finds a result', async () => {
    const supabase = makeSupabase({
      rpcData: [
        {
          id: 'chunk-1',
          rams_submission_id: 'rams-1',
          chunk_text: 'All operatives shall wear hard hats, high-vis jackets, and steel-toe boots on site.',
          chunk_index: 3,
          similarity: 0.82,
        },
      ],
    });

    const result = await retrieveRamsEvidence(supabase, 'rams-1', 'proj-1', 'PPE requirements');
    expect(result.chunk).not.toBeNull();
    expect(result.chunk!.id).toBe('chunk-1');
    expect(result.evidenceQuote).toContain('hard hats');
    expect(result.similarity).toBe(0.82);
  });

  it('returns null when no chunks match the submission', async () => {
    const supabase = makeSupabase({
      rpcData: [
        { id: 'chunk-other', rams_submission_id: 'different-rams', chunk_text: 'x', chunk_index: 0, similarity: 0.9 },
      ],
    });
    const result = await retrieveRamsEvidence(supabase, 'rams-1', 'proj-1', 'PPE');
    expect(result.chunk).toBeNull();
  });

  it('returns null on empty results without throwing', async () => {
    const supabase = makeSupabase({ rpcData: [] });
    const result = await retrieveRamsEvidence(supabase, 'rams-1', 'proj-1', 'PPE');
    expect(result.chunk).toBeNull();
    expect(result.similarity).toBe(0);
  });

  it('truncates evidence_quote to 400 chars', async () => {
    const supabase = makeSupabase({
      rpcData: [
        { id: 'c1', rams_submission_id: 'r1', chunk_text: 'A'.repeat(600), chunk_index: 0, similarity: 0.8 },
      ],
    });
    const result = await retrieveRamsEvidence(supabase, 'r1', 'p1', 'req');
    expect(result.evidenceQuote!.length).toBe(400);
  });
});

// ── retrieveRamsEvidenceBatch ─────────────────────────────────────────────────

describe('retrieveRamsEvidenceBatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a Map keyed by requirementCode', async () => {
    const supabase = makeSupabase({ rpcData: [] });
    const reqs = [
      { requirementCode: 'R1', requirementText: 'First requirement' },
      { requirementCode: 'R2', requirementText: 'Second requirement' },
    ];
    const map = await retrieveRamsEvidenceBatch(supabase, 'rams-1', 'proj-1', reqs);
    expect(map.size).toBe(2);
    expect(map.has('R1')).toBe(true);
    expect(map.has('R2')).toBe(true);
  });

  it('handles partial failures gracefully', async () => {
    const supabase = makeSupabase();
    // Override to throw on second call
    let callCount = 0;
    (supabase.rpc as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error('network error');
      return { data: [], error: null };
    });

    const reqs = [
      { requirementCode: 'R1', requirementText: 'ok' },
      { requirementCode: 'R2', requirementText: 'will fail' },
    ];
    const map = await retrieveRamsEvidenceBatch(supabase, 'rams-1', 'proj-1', reqs);
    expect(map.size).toBe(2);
    // R2 should have a fallback result
    expect(map.get('R2')!.chunk).toBeNull();
  });
});
