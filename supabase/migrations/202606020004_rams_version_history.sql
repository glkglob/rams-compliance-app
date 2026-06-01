-- ── RAMS version history ──────────────────────────────────────────────────────
--
-- Links resubmissions as versions of the same logical RAMS.
--
--   parent_submission_id — points to the original (v1) submission. NULL for v1.
--   version_number       — monotonically increasing per chain. 1 for originals.
--
-- A version chain is: v1 (parent=NULL) ← v2 (parent=v1.id) ← v3 (parent=v1.id).
-- All versions point to the *same* parent (the original), not a linked list,
-- so querying the full history is a single WHERE parent_submission_id = :v1_id
-- OR id = :v1_id, ordered by version_number.

SET search_path TO public, extensions;

-- ── 1. New columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.rams_submissions
  ADD COLUMN IF NOT EXISTS parent_submission_id UUID
    REFERENCES public.rams_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1
    CHECK (version_number >= 1);

-- Backfill: all existing rows are v1 originals (parent=NULL, version=1).
-- The DEFAULT 1 handles this automatically for existing rows.

-- Index for fast version-chain queries
CREATE INDEX IF NOT EXISTS idx_rams_submissions_parent
  ON public.rams_submissions (parent_submission_id)
  WHERE parent_submission_id IS NOT NULL;

-- Unique: only one of each version number per chain
CREATE UNIQUE INDEX IF NOT EXISTS idx_rams_submissions_version_unique
  ON public.rams_submissions (parent_submission_id, version_number)
  WHERE parent_submission_id IS NOT NULL;

-- ── 2. Helper: get next version number ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.next_rams_version_number(p_parent_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(MAX(version_number), 1) + 1
  FROM public.rams_submissions
  WHERE parent_submission_id = p_parent_id
     OR id = p_parent_id;
$$;

COMMENT ON FUNCTION public.next_rams_version_number(UUID) IS
  'Returns the next version number for a RAMS resubmission chain.';
