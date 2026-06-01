-- Supabase hosts the vector extension in the `extensions` schema on some plans.
-- Widen the search path so `vector` resolves without a schema qualifier.
SET search_path TO public, extensions;

-- ── rams_chunks ───────────────────────────────────────────────────────────────
--
-- Stores overlapping text chunks + vector embeddings for each RAMS submission.
-- Mirrors the document_chunks table used for compliance documents, but scoped
-- to rams_submissions so queries never cross entity types.
--
-- Embedding model: text-embedding-3-small (1536 dims) — same as document_chunks.
-- Vector index:    HNSW (cosine) — fast approximate nearest-neighbour search.

-- ── 1. Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rams_chunks (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rams_submission_id  UUID        NOT NULL
                        REFERENCES public.rams_submissions(id) ON DELETE CASCADE,
  chunk_text          TEXT        NOT NULL,
  chunk_index         INTEGER     NOT NULL,
  embedding           vector(1536),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rams_chunks IS
  'Overlapping text chunks with vector embeddings for each RAMS submission.';

-- B-tree index for fast submission look-ups (most queries filter by submission id)
CREATE INDEX IF NOT EXISTS idx_rams_chunks_submission
  ON public.rams_chunks (rams_submission_id);

-- HNSW vector index — cosine distance, balanced construction params
-- m=16 / ef_construction=64 gives good recall at low build cost for typical
-- RAMS doc sizes (< 500 chunks per submission).
CREATE INDEX IF NOT EXISTS idx_rams_chunks_embedding
  ON public.rams_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 2. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.rams_chunks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rams_chunks'
      AND policyname = 'Members can view RAMS chunks'
  ) THEN
    CREATE POLICY "Members can view RAMS chunks"
      ON public.rams_chunks
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.rams_submissions rs
          WHERE  rs.id = rams_chunks.rams_submission_id
            AND  public.is_project_member(rs.project_id)
        )
      );
  END IF;
END $$;

-- Writes always go through the service-role admin client (chunk pipeline).
-- No direct authenticated INSERT/UPDATE/DELETE needed.

-- ── 3. Vector search RPC ───────────────────────────────────────────────────────
--
-- Returns the most semantically similar RAMS chunks for a given query embedding.
-- filter_project_id is optional; pass NULL to search across all projects.
-- Mirrors the match_document_chunks interface used by the RAMS review orchestrator.

CREATE OR REPLACE FUNCTION public.match_rams_chunks(
  query_embedding   vector(1536),
  match_threshold   float       DEFAULT 0.68,
  match_count       int         DEFAULT 20,
  filter_project_id uuid        DEFAULT NULL
)
RETURNS TABLE (
  id                  uuid,
  rams_submission_id  uuid,
  chunk_text          text,
  chunk_index         int,
  similarity          float
)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT
    rc.id,
    rc.rams_submission_id,
    rc.chunk_text,
    rc.chunk_index,
    1 - (rc.embedding <=> query_embedding) AS similarity
  FROM public.rams_chunks rc
  JOIN public.rams_submissions rs ON rs.id = rc.rams_submission_id
  WHERE
    (filter_project_id IS NULL OR rs.project_id = filter_project_id)
    AND rc.embedding IS NOT NULL
    AND 1 - (rc.embedding <=> query_embedding) >= match_threshold
  ORDER BY rc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── 4. match_document_chunks (create if missing) ───────────────────────────────
--
-- The orchestrator calls this RPC. Define it here idempotently so fresh
-- deployments work even when the foundation migration predates its creation.

CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding   vector(1536),
  match_threshold   float       DEFAULT 0.68,
  match_count       int         DEFAULT 30,
  filter_project_id uuid        DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  document_id  uuid,
  chunk_text   text,
  chunk_index  int,
  similarity   float
)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_text,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  JOIN public.compliance_documents cd ON cd.id = dc.document_id
  WHERE
    (filter_project_id IS NULL OR cd.project_id = filter_project_id)
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) >= match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;
