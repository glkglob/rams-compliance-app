-- Integrity-focused persistence for RAMS AI reviews.
-- The application previously inserted review rows, checks, email drafts, and the
-- submission summary in separate HTTP round trips. This RPC keeps the
-- compliance-critical write set atomic: either every review artifact is saved
-- and the submission is updated, or the database rolls the whole sequence back.

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
  -- interleave summary/email/check writes for the same RAMS record.
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
    explanation
  )
  SELECT
    v_review_id,
    check_row.requirement_id,
    check_row.status,
    check_row.severity,
    check_row.score,
    check_row.rams_evidence,
    check_row.explanation
  FROM jsonb_to_recordset(p_checks) AS check_row (
    requirement_id UUID,
    status public.check_status,
    severity public.requirement_severity,
    score NUMERIC,
    rams_evidence TEXT,
    explanation TEXT
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

REVOKE ALL ON FUNCTION public.persist_rams_review_result(
  UUID,
  public.review_status,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT,
  TEXT,
  UUID,
  JSONB,
  JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.persist_rams_review_result(
  UUID,
  public.review_status,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT,
  TEXT,
  UUID,
  JSONB,
  JSONB
) TO authenticated;

COMMENT ON FUNCTION public.persist_rams_review_result(
  UUID,
  public.review_status,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT,
  TEXT,
  UUID,
  JSONB,
  JSONB
) IS
  'Atomically persists RAMS review, checks, email draft, submission summary, and audit log so compliance decisions cannot be partially written.';
