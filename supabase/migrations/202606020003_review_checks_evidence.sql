-- ── Evidence enrichment for review_checks ─────────────────────────────────────
--
-- Adds structured provenance fields so each compliance check records:
--   confidence_score  — model's self-assessed certainty (0-1)
--   evidence_quote    — verbatim excerpt from the RAMS text that was matched
--   source_chunk_id   — FK to the rams_chunk used as evidence context
--
-- The persist_rams_review_result RPC is updated to accept the new fields
-- in its p_checks JSONB array. Old callers that omit them get NULLs (backward-compat).

SET search_path TO public, extensions;

-- ── 1. New columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.review_checks
  ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2)
    CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS evidence_quote TEXT,
  ADD COLUMN IF NOT EXISTS source_chunk_id UUID
    REFERENCES public.rams_chunks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_review_checks_source_chunk
  ON public.review_checks (source_chunk_id)
  WHERE source_chunk_id IS NOT NULL;

-- ── 2. Rebuild persist RPC to accept the new fields ───────────────────────────
--
-- The JSON array elements now include optional:
--   confidence_score NUMERIC
--   evidence_quote   TEXT
--   source_chunk_id  UUID
-- Old callers that omit these get NULLs — no breaking change.

CREATE OR REPLACE FUNCTION public.persist_rams_review_result(
  p_rams_submission_id UUID,
  p_review_status public.review_status,
  p_compliance_score NUMERIC,
  p_confidence_score NUMERIC,
  p_decision_explanation TEXT,
  p_email_subject TEXT,
  p_email_body TEXT,
  p_reviewed_by UUID DEFAULT NULL,
  p_checks JSONB DEFAULT '[]'::jsonb,
  p_audit_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_review_id UUID;
BEGIN
  IF jsonb_typeof(p_checks) <> 'array' THEN
    RAISE EXCEPTION 'p_checks must be a JSON array';
  END IF;

  -- Lock the parent submission so concurrent review completions cannot
  -- interleave writes for the same RAMS record.
  PERFORM 1
  FROM public.rams_submissions
  WHERE id = p_rams_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RAMS submission % not found', p_rams_submission_id;
  END IF;

  INSERT INTO public.rams_reviews (
    rams_submission_id,
    review_status,
    compliance_score,
    confidence_score,
    decision_explanation,
    email_generated,
    email_sent,
    reviewed_by
  )
  VALUES (
    p_rams_submission_id,
    p_review_status,
    p_compliance_score,
    p_confidence_score,
    p_decision_explanation,
    TRUE,
    FALSE,
    p_reviewed_by
  )
  RETURNING id INTO v_review_id;

  INSERT INTO public.review_checks (
    rams_review_id,
    requirement_id,
    status,
    severity,
    score,
    rams_evidence,
    explanation,
    confidence_score,
    evidence_quote,
    source_chunk_id
  )
  SELECT
    v_review_id,
    check_row.requirement_id,
    check_row.status,
    check_row.severity,
    check_row.score,
    check_row.rams_evidence,
    check_row.explanation,
    check_row.confidence_score,
    check_row.evidence_quote,
    check_row.source_chunk_id
  FROM jsonb_to_recordset(p_checks) AS check_row (
    requirement_id   UUID,
    status           public.check_status,
    severity         public.requirement_severity,
    score            NUMERIC,
    rams_evidence    TEXT,
    explanation      TEXT,
    confidence_score NUMERIC,
    evidence_quote   TEXT,
    source_chunk_id  UUID
  );

  INSERT INTO public.generated_emails (
    rams_submission_id,
    subject,
    body,
    sent
  )
  VALUES (
    p_rams_submission_id,
    p_email_subject,
    p_email_body,
    FALSE
  );

  UPDATE public.rams_submissions
  SET
    review_status = p_review_status,
    compliance_score = p_compliance_score,
    confidence_score = p_confidence_score,
    decision_explanation = p_decision_explanation,
    reviewed_for_cdm = TRUE,
    updated_at = NOW()
  WHERE id = p_rams_submission_id;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    p_reviewed_by,
    'REVIEW_RAMS',
    'rams_submission',
    p_rams_submission_id,
    p_audit_details
  );

  RETURN v_review_id;
END;
$$;

-- Keep grants identical to the original migration
REVOKE ALL ON FUNCTION public.persist_rams_review_result(
  UUID, public.review_status, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, JSONB, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.persist_rams_review_result(
  UUID, public.review_status, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, JSONB, JSONB
) TO authenticated;
