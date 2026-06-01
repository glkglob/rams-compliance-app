/**
 * Unified vector retrieval for the RAMS review pipeline.
 *
 * Searches both document_chunks (compliance docs) and rams_chunks (the
 * submitted RAMS itself) for the most semantically relevant passages to a
 * given query — typically a requirement or a section of the RAMS text.
 *
 * Two retrieval strategies:
 *   1. retrieveRelevantRequirements — given RAMS text, find the compliance
 *      requirements whose source document chunks are closest. Used at the
 *      start of the review to select which requirements to check.
 *   2. retrieveRamsEvidence — given a requirement, find the RAMS chunks
 *      that are most relevant as evidence. Used per-check to populate
 *      evidence_quote and source_chunk_id on review_checks.
 */

import { generateEmbeddings } from '@/lib/ai/embeddings';
import { addOrchestratorBreadcrumb } from '@/lib/observability/sentry-context';
import { logger } from '@/lib/logging';

type SupabaseClient = {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        in: (col: string, vals: string[]) => Promise<{
          data: unknown[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetrievedRamsChunk {
  id: string;
  ramsSubmissionId: string;
  chunkText: string;
  chunkIndex: number;
  similarity: number;
}

export interface RetrievedDocChunk {
  id: string;
  documentId: string;
  chunkText: string;
  chunkIndex: number;
  similarity: number;
}

export interface RamsEvidenceResult {
  /** The best-matching RAMS chunk (if any). */
  chunk: RetrievedRamsChunk | null;
  /** A verbatim evidence quote extracted from the chunk text. */
  evidenceQuote: string | null;
  /** Semantic similarity score (0-1) — maps to confidence_score on the check. */
  similarity: number;
}

// ── Requirement retrieval (document_chunks → requirements) ─────────────────────

/**
 * Embed a prefix of the RAMS text and search document_chunks for the most
 * relevant passages. Then load the compliance requirements that originated
 * from those documents.
 *
 * Returns { requirements, requirementDbIds } — the same shape the orchestrator
 * used to compute inline. Migrating this logic here keeps the orchestrator
 * focused on flow control.
 */
export async function retrieveRelevantRequirements(
  supabase: SupabaseClient,
  projectId: string,
  ramsText: string,
  options: { topK?: number; threshold?: number; queryPrefixChars?: number } = {},
): Promise<{
  requirements: Array<{
    requirementCode: string;
    requirementText: string;
    category: string;
    severity: 'critical' | 'major' | 'minor';
    sourceDocumentId: string;
    sourceDocumentName: string;
    sourceExcerpt: string;
  }>;
  requirementDbIds: Map<string, string>;
}> {
  const topK             = options.topK ?? 30;
  const threshold        = options.threshold ?? 0.68;
  const queryPrefixChars = options.queryPrefixChars ?? 2000;

  const empty = { requirements: [], requirementDbIds: new Map<string, string>() };

  try {
    const embeddings = await generateEmbeddings([ramsText.slice(0, queryPrefixChars)]);
    if (!embeddings.length) return empty;

    const { data: chunks, error } = await supabase.rpc('match_document_chunks', {
      query_embedding:   embeddings[0],
      match_threshold:   threshold,
      match_count:       topK,
      filter_project_id: projectId,
    });

    if (error || !chunks || !Array.isArray(chunks) || chunks.length === 0) {
      if (error) logger.warn('Document chunk vector search failed', { error: error.message });
      return empty;
    }

    const docIds = [
      ...new Set(
        (chunks as Array<{ document_id?: string }>)
          .map((c) => c.document_id)
          .filter(Boolean) as string[],
      ),
    ];
    if (docIds.length === 0) return empty;

    const { data: reqs, error: reqErr } = await supabase
      .from('compliance_requirements')
      .select('*')
      .eq('project_id', projectId)
      .in('source_document_id', docIds);

    if (reqErr || !reqs?.length) {
      if (reqErr) logger.warn('Failed to load requirements for vector-matched docs', { error: reqErr.message });
      return empty;
    }

    const requirementDbIds = new Map<string, string>();
    const requirements = (reqs as Array<{
      id: string;
      requirement_code: string;
      requirement_text: string;
      category: string;
      severity: string;
      source_document_id: string | null;
      source_excerpt: string | null;
    }>).map((r) => {
      requirementDbIds.set(r.requirement_code, r.id);
      return {
        requirementCode:  r.requirement_code,
        requirementText:  r.requirement_text,
        category:         r.category,
        severity:         r.severity as 'critical' | 'major' | 'minor',
        sourceDocumentId: r.source_document_id ?? '',
        sourceDocumentName: '',
        sourceExcerpt:    r.source_excerpt ?? '',
      };
    });

    addOrchestratorBreadcrumb('requirements_retrieved', {
      count: requirements.length,
      source: 'vector',
      docChunksMatched: chunks.length,
      uniqueDocs: docIds.length,
    });

    return { requirements, requirementDbIds };
  } catch (err) {
    logger.warn('retrieveRelevantRequirements failed (graceful fallback)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return empty;
  }
}

// ── RAMS evidence retrieval (rams_chunks) ──────────────────────────────────────

/**
 * For a single requirement, find the best-matching chunk in the RAMS
 * submission to use as evidence.
 *
 * The returned `evidenceQuote` is a trimmed prefix of the chunk text
 * (max 400 chars) suitable for storing directly on the review_check row.
 */
export async function retrieveRamsEvidence(
  supabase: SupabaseClient,
  ramsSubmissionId: string,
  projectId: string,
  requirementText: string,
  options: { topK?: number; threshold?: number } = {},
): Promise<RamsEvidenceResult> {
  const topK      = options.topK ?? 3;
  const threshold  = options.threshold ?? 0.55;

  const none: RamsEvidenceResult = { chunk: null, evidenceQuote: null, similarity: 0 };

  try {
    const embeddings = await generateEmbeddings([requirementText.slice(0, 1000)]);
    if (!embeddings.length) return none;

    const { data: rows, error } = await supabase.rpc('match_rams_chunks', {
      query_embedding:   embeddings[0],
      match_threshold:   threshold,
      match_count:       topK,
      filter_project_id: projectId,
    });

    if (error || !rows || !Array.isArray(rows) || rows.length === 0) {
      return none;
    }

    // Filter to chunks from this specific submission (the RPC searches project-wide).
    const typed = rows as Array<{
      id: string;
      rams_submission_id: string;
      chunk_text: string;
      chunk_index: number;
      similarity: number;
    }>;
    const match = typed.find((r) => r.rams_submission_id === ramsSubmissionId);
    if (!match) return none;

    return {
      chunk: {
        id:               match.id,
        ramsSubmissionId: match.rams_submission_id,
        chunkText:        match.chunk_text,
        chunkIndex:       match.chunk_index,
        similarity:       match.similarity,
      },
      evidenceQuote: match.chunk_text.trim().slice(0, 400),
      similarity:    match.similarity,
    };
  } catch (err) {
    logger.warn('retrieveRamsEvidence failed (non-fatal)', {
      ramsSubmissionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return none;
  }
}

/**
 * Batch retrieval: look up RAMS evidence for every requirement in the list.
 * Returns a Map keyed by requirementCode so the orchestrator can attach
 * evidence to each check row.
 */
export async function retrieveRamsEvidenceBatch(
  supabase: SupabaseClient,
  ramsSubmissionId: string,
  projectId: string,
  requirements: Array<{ requirementCode: string; requirementText: string }>,
): Promise<Map<string, RamsEvidenceResult>> {
  const results = new Map<string, RamsEvidenceResult>();

  // Run in parallel with modest concurrency — each call is one embedding + one RPC.
  const CONCURRENCY = 5;
  for (let i = 0; i < requirements.length; i += CONCURRENCY) {
    const batch = requirements.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((req) =>
        retrieveRamsEvidence(supabase, ramsSubmissionId, projectId, req.requirementText),
      ),
    );
    for (let j = 0; j < batch.length; j++) {
      const outcome = settled[j];
      results.set(
        batch[j].requirementCode,
        outcome.status === 'fulfilled'
          ? outcome.value
          : { chunk: null, evidenceQuote: null, similarity: 0 },
      );
    }
  }

  addOrchestratorBreadcrumb('rams_loaded', {
    ramsSubmissionId,
    evidenceLookups: requirements.length,
    evidenceFound: [...results.values()].filter((r) => r.chunk !== null).length,
  });

  return results;
}
