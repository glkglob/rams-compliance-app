-- ═══════════════════════════════════════════════════════════════════════════════
-- Epic A Backend: Compliant Domain Model Refactor
-- Adds Organisation as tenancy root + immutable AnalysisRun / Finding / Decision
-- + ExtractedDocument + append-only AuditEvent.
--
-- Core rules implemented at DB level where possible:
--   * AnalysisRun rows are append-only (no updates after creation via trigger).
--   * Decision recorded => related Findings become read-only (locked_at set + trigger blocks mutation).
--   * Changes to requirements, submissions (rams_submissions), decisions => AuditEvent row.
--   * Extracted text + evidence matches stored in immutable ExtractedDocument + Findings.
--
-- Existing tables (rams_submissions as Submission, compliance_requirements as Requirement,
-- rams_chunks for evidence) are kept for compatibility. New entities link to them.
-- Old review_checks / rams_reviews continue to work; new paths use AnalysisRun/Finding/Decision.
-- ═══════════════════════════════════════════════════════════════════════════════

SET search_path TO public, extensions;

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. ORGANISATION (tenancy root)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organisations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.organisations IS
  'Tenancy root. All Projects, Submissions, Requirements etc belong to exactly one Organisation.';

-- Backfill a default organisation for existing data (idempotent).
INSERT INTO public.organisations (id, name, slug)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, 'Default Organisation', 'default'
WHERE NOT EXISTS (SELECT 1 FROM public.organisations WHERE slug = 'default');

-- Add org linkage to projects (tenancy).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id) ON DELETE RESTRICT;

-- Backfill existing projects to default org (safe if column just added).
UPDATE public.projects
SET organisation_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organisation_id IS NULL;

-- Make non-null after backfill (for new data).
ALTER TABLE public.projects
  ALTER COLUMN organisation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_organisation ON public.projects(organisation_id);

-- Optional: org-level membership for direct tenancy (in addition to project_members).
-- For now we keep project_members as primary; org membership can be derived or added later.
CREATE TABLE IF NOT EXISTS public.organisation_members (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'member',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organisation_members_org ON public.organisation_members(organisation_id);
CREATE INDEX IF NOT EXISTS idx_organisation_members_user ON public.organisation_members(user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. EXTRACTED DOCUMENT (immutable extracted text for submissions / docs)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.extracted_documents (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Polymorphic owner (for now focused on RAMS submissions; can extend)
  submission_id      UUID REFERENCES public.rams_submissions(id) ON DELETE CASCADE,
  compliance_doc_id  UUID REFERENCES public.compliance_documents(id) ON DELETE CASCADE,
  extracted_text     TEXT NOT NULL,
  char_count         INTEGER,
  extraction_method  TEXT,                    -- e.g. 'pdf-parse+mammoth', 'ai-chunked'
  metadata           JSONB DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- No updated_at: immutable by design. Use trigger to prevent UPDATE on content.
  CHECK (
    (submission_id IS NOT NULL AND compliance_doc_id IS NULL) OR
    (submission_id IS NULL AND compliance_doc_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.extracted_documents IS
  'Immutable store for extracted text + provenance. Evidence in Findings references this.';

CREATE INDEX IF NOT EXISTS idx_extracted_documents_submission ON public.extracted_documents(submission_id) WHERE submission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_extracted_documents_compliance ON public.extracted_documents(compliance_doc_id) WHERE compliance_doc_id IS NOT NULL;

-- Prevent mutation of extracted content (append-only rows).
CREATE OR REPLACE FUNCTION public.prevent_extracted_document_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.extracted_text IS DISTINCT FROM OLD.extracted_text OR
       NEW.char_count IS DISTINCT FROM OLD.char_count THEN
      RAISE EXCEPTION 'extracted_documents is immutable (extracted_text/char_count cannot change)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_extracted_documents_immutable ON public.extracted_documents;
CREATE TRIGGER trg_extracted_documents_immutable
  BEFORE UPDATE ON public.extracted_documents
  FOR EACH ROW EXECUTE FUNCTION public.prevent_extracted_document_mutation();

-- Backfill example for existing rams_submissions (best-effort; production would be more careful).
-- We do not overwrite existing extracted_text on rams_submissions for compat.
INSERT INTO public.extracted_documents (submission_id, extracted_text, char_count, extraction_method)
SELECT id, extracted_text, length(extracted_text), 'legacy-migration'
FROM public.rams_submissions
WHERE extracted_text IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.extracted_documents WHERE submission_id = rams_submissions.id
  )
ON CONFLICT DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. ANALYSIS RUN (immutable AI analysis snapshot)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TYPE IF NOT EXISTS public.analysis_run_status AS ENUM ('pending', 'running', 'complete', 'failed');

CREATE TABLE IF NOT EXISTS public.analysis_runs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id    UUID NOT NULL REFERENCES public.rams_submissions(id) ON DELETE CASCADE,
  run_number       INTEGER NOT NULL DEFAULT 1,
  status           public.analysis_run_status NOT NULL DEFAULT 'pending',
  ai_model         TEXT,                 -- e.g. 'gpt-4o', versioned prompt etc.
  prompt_version   TEXT,
  overall_score    NUMERIC,
  summary          TEXT,
  created_by       UUID REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  -- Immutable after complete: trigger enforces no content changes post-creation for completed runs.
  UNIQUE (submission_id, run_number)
);

COMMENT ON TABLE public.analysis_runs IS
  'Immutable record of an AI analysis execution. Re-runs create new rows (new run_number). Does not mutate Decisions.';

CREATE INDEX IF NOT EXISTS idx_analysis_runs_submission ON public.analysis_runs(submission_id);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_created ON public.analysis_runs(created_at DESC);

-- Enforce append-only / immutability for completed runs.
CREATE OR REPLACE FUNCTION public.prevent_analysis_run_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'complete' THEN
    -- Allow only status/metadata that doesn't change results; block core fields.
    IF NEW.submission_id IS DISTINCT FROM OLD.submission_id OR
       NEW.run_number IS DISTINCT FROM OLD.run_number OR
       NEW.ai_model IS DISTINCT FROM OLD.ai_model OR
       NEW.overall_score IS DISTINCT FROM OLD.overall_score OR
       NEW.summary IS DISTINCT FROM OLD.summary THEN
      RAISE EXCEPTION 'analysis_runs row % is immutable once complete', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_analysis_runs_immutable ON public.analysis_runs;
CREATE TRIGGER trg_analysis_runs_immutable
  BEFORE UPDATE ON public.analysis_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_analysis_run_mutation();

-- Helper to get next run number (like the version helper).
CREATE OR REPLACE FUNCTION public.next_analysis_run_number(p_submission_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(MAX(run_number), 0) + 1
  FROM public.analysis_runs
  WHERE submission_id = p_submission_id;
$$;

-- ───────────────────────────────────────────────────────────────────────────────
-- 4. FINDING (gap / check linked to requirement + immutable evidence)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.findings (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  analysis_run_id    UUID NOT NULL REFERENCES public.analysis_runs(id) ON DELETE CASCADE,
  requirement_id     UUID NOT NULL REFERENCES public.compliance_requirements(id) ON DELETE CASCADE,
  status             public.check_status,
  severity           public.requirement_severity,
  score              NUMERIC CHECK (score IS NULL OR score BETWEEN 0 AND 1),
  rams_evidence      TEXT,                 -- original evidence text
  explanation        TEXT,
  confidence_score   NUMERIC CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1),
  evidence_quote     TEXT,                 -- verbatim match
  source_chunk_id    UUID REFERENCES public.rams_chunks(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at          TIMESTAMPTZ,          -- set when Decision recorded for the run/submission
  -- Evidence is immutable once locked.
  CHECK (locked_at IS NULL OR locked_at >= created_at)
);

COMMENT ON TABLE public.findings IS
  'Individual compliance finding (gap or pass) from an AnalysisRun. Linked to Requirement + evidence. Becomes read-only when Decision is recorded.';

CREATE INDEX IF NOT EXISTS idx_findings_run ON public.findings(analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_findings_requirement ON public.findings(requirement_id);
CREATE INDEX IF NOT EXISTS idx_findings_chunk ON public.findings(source_chunk_id) WHERE source_chunk_id IS NOT NULL;

-- Trigger: once locked, block mutation of finding content.
CREATE OR REPLACE FUNCTION public.prevent_finding_mutation_after_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.locked_at IS NOT NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR
       NEW.severity IS DISTINCT FROM OLD.severity OR
       NEW.score IS DISTINCT FROM OLD.score OR
       NEW.rams_evidence IS DISTINCT FROM OLD.rams_evidence OR
       NEW.explanation IS DISTINCT FROM OLD.explanation OR
       NEW.evidence_quote IS DISTINCT FROM OLD.evidence_quote OR
       NEW.source_chunk_id IS DISTINCT FROM OLD.source_chunk_id THEN
      RAISE EXCEPTION 'Finding % is read-only (locked by Decision at %)', OLD.id, OLD.locked_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_findings_readonly_after_lock ON public.findings;
CREATE TRIGGER trg_findings_readonly_after_lock
  BEFORE UPDATE ON public.findings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_finding_mutation_after_lock();

-- ───────────────────────────────────────────────────────────────────────────────
-- 5. DECISION (human final decision - append-only record)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.decisions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id     UUID NOT NULL REFERENCES public.rams_submissions(id) ON DELETE CASCADE,
  analysis_run_id   UUID REFERENCES public.analysis_runs(id) ON DELETE SET NULL,
  decision_status   public.review_status NOT NULL,
  decided_by        UUID NOT NULL REFERENCES public.profiles(id),
  decided_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  explanation       TEXT,
  threshold_used    INTEGER,
  -- audit details etc.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.decisions IS
  'Human final decision on a Submission. References the AnalysisRun used for support. Recording a Decision locks related Findings.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_decisions_submission ON public.decisions(submission_id); -- one active decision per submission (latest wins via app or add version if needed)
CREATE INDEX IF NOT EXISTS idx_decisions_run ON public.decisions(analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_decisions_decided_by ON public.decisions(decided_by);

-- After decision insert: lock the findings for the referenced run (if any).
CREATE OR REPLACE FUNCTION public.lock_findings_on_decision()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.analysis_run_id IS NOT NULL THEN
    UPDATE public.findings
    SET locked_at = NOW()
    WHERE analysis_run_id = NEW.analysis_run_id
      AND locked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_decisions_lock_findings ON public.decisions;
CREATE TRIGGER trg_decisions_lock_findings
  AFTER INSERT ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.lock_findings_on_decision();

-- ───────────────────────────────────────────────────────────────────────────────
-- 6. AUDIT EVENT (append-only, replaces/aligns with audit_logs)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id     UUID REFERENCES public.profiles(id),
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    UUID,
  before       JSONB,
  after        JSONB,
  details      JSONB
);

COMMENT ON TABLE public.audit_events IS
  'Append-only audit event log. All mutations to requirements, submissions, decisions (and critical actions) must produce a row.';

CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON public.audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON public.audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON public.audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_time ON public.audit_events(occurred_at DESC);

-- Optional: copy existing audit_logs data into audit_events (one-time).
INSERT INTO public.audit_events (id, occurred_at, actor_id, action, entity_type, entity_id, details)
SELECT id, created_at, user_id, action, entity_type, entity_id, details
FROM public.audit_logs
ON CONFLICT (id) DO NOTHING;

-- Enforce mandatory audit for certain tables via triggers (example for decisions, submissions, requirements).
-- These fire on INSERT/UPDATE/DELETE and call create_audit_event_if_missing or direct insert.
-- For simplicity we also keep the application-level createAuditLog (updated to target audit_events).

CREATE OR REPLACE FUNCTION public.record_mandatory_audit_event()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_entity_type TEXT := TG_TABLE_NAME;
  v_entity_id UUID;
  v_actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE_' || upper(TG_TABLE_NAME);
    v_entity_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE_' || upper(TG_TABLE_NAME);
    v_entity_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE_' || upper(TG_TABLE_NAME);
    v_entity_id := OLD.id;
  END IF;

  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_actor,
    v_action,
    v_entity_type,
    v_entity_id,
    jsonb_build_object('tg_op', TG_OP, 'old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach to the three key tables mentioned in requirements.
-- (Idempotent attach)
DROP TRIGGER IF EXISTS trg_requirements_audit ON public.compliance_requirements;
CREATE TRIGGER trg_requirements_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.compliance_requirements
  FOR EACH ROW EXECUTE FUNCTION public.record_mandatory_audit_event();

DROP TRIGGER IF EXISTS trg_submissions_audit ON public.rams_submissions;
CREATE TRIGGER trg_submissions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.rams_submissions
  FOR EACH ROW EXECUTE FUNCTION public.record_mandatory_audit_event();

DROP TRIGGER IF EXISTS trg_decisions_audit ON public.decisions;
CREATE TRIGGER trg_decisions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.record_mandatory_audit_event();

-- Also keep the legacy audit_logs table + policies for any code still writing directly (will be cleaned in follow-up).
-- The lib/audit will be pointed at audit_events.

-- ───────────────────────────────────────────────────────────────────────────────
-- 7. Update / recreate key RPCs to also populate new model (AnalysisRun + Finding)
-- ───────────────────────────────────────────────────────────────────────────────
-- We extend the existing persist function (re-create with new logic) so that an AI review
-- also creates an AnalysisRun + Findings rows. This keeps the orchestrator call site unchanged
-- while the new domain is populated.
--
-- NOTE: For full separation, future calls can target a new RPC, but this provides the basic flow.

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
  v_run_id UUID;
  v_run_number INTEGER;
BEGIN
  IF jsonb_typeof(p_checks) <> 'array' THEN
    RAISE EXCEPTION 'p_checks must be a JSON array';
  END IF;

  PERFORM 1 FROM public.rams_submissions WHERE id = p_rams_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RAMS submission % not found', p_rams_submission_id;
  END IF;

  -- Legacy path (kept for compat)
  INSERT INTO public.rams_reviews (
    rams_submission_id, review_status, compliance_score, confidence_score,
    decision_explanation, email_generated, email_sent, reviewed_by
  )
  VALUES (
    p_rams_submission_id, p_review_status, p_compliance_score, p_confidence_score,
    p_decision_explanation, TRUE, FALSE, p_reviewed_by
  )
  RETURNING id INTO v_review_id;

  INSERT INTO public.generated_emails (rams_submission_id, subject, body, sent)
  VALUES (p_rams_submission_id, p_email_subject, p_email_body, FALSE);

  UPDATE public.rams_submissions
  SET review_status = p_review_status,
      compliance_score = p_compliance_score,
      confidence_score = p_confidence_score,
      decision_explanation = p_decision_explanation,
      reviewed_for_cdm = TRUE,
      updated_at = NOW()
  WHERE id = p_rams_submission_id;

  -- NEW MODEL: create immutable AnalysisRun + Findings
  v_run_number := public.next_analysis_run_number(p_rams_submission_id);

  INSERT INTO public.analysis_runs (
    submission_id, run_number, status, overall_score, summary,
    created_by, completed_at
  )
  VALUES (
    p_rams_submission_id,
    v_run_number,
    'complete',
    p_compliance_score,
    p_decision_explanation,
    p_reviewed_by,
    NOW()
  )
  RETURNING id INTO v_run_id;

  -- Insert findings (new immutable findings table)
  INSERT INTO public.findings (
    analysis_run_id, requirement_id, status, severity, score,
    rams_evidence, explanation, confidence_score, evidence_quote, source_chunk_id
  )
  SELECT
    v_run_id,
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

  -- Audit via new table (the trigger on submissions will also fire, this is explicit)
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, details)
  VALUES (
    p_reviewed_by,
    'REVIEW_RAMS',
    'rams_submission',
    p_rams_submission_id,
    p_audit_details || jsonb_build_object('analysis_run_id', v_run_id, 'new_model', true)
  );

  -- Also keep legacy audit_logs for any consumers still selecting from it
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    p_reviewed_by,
    'REVIEW_RAMS',
    'rams_submission',
    p_rams_submission_id,
    p_audit_details || jsonb_build_object('analysis_run_id', v_run_id, 'new_model', true)
  );

  RETURN v_review_id;
END;
$$;

-- Re-grant (same as before)
REVOKE ALL ON FUNCTION public.persist_rams_review_result(UUID, public.review_status, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_rams_review_result(UUID, public.review_status, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, JSONB, JSONB) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────────
-- 8. Basic RLS for new tables (authenticated users see data via project/org membership)
--    (Simplified; real policies would join through organisation_members or project_members)
-- ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Very permissive for authenticated (refine in follow-up using existing is_project_member etc.).
-- In practice you would add org_id to more tables and use org-scoped policies.
CREATE POLICY "Authenticated can view organisations" ON public.organisations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view org members" ON public.organisation_members FOR SELECT TO authenticated USING (true);

-- Example: allow project members to see analysis/findings/decisions for their projects' submissions.
CREATE POLICY "Project members view analysis_runs" ON public.analysis_runs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rams_submissions s
    JOIN public.project_members pm ON pm.project_id = s.project_id
    WHERE s.id = analysis_runs.submission_id AND pm.user_id = auth.uid()
  ));

CREATE POLICY "Project members view findings" ON public.findings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.analysis_runs ar
    JOIN public.rams_submissions s ON s.id = ar.submission_id
    JOIN public.project_members pm ON pm.project_id = s.project_id
    WHERE ar.id = findings.analysis_run_id AND pm.user_id = auth.uid()
  ));

CREATE POLICY "Reviewers can insert decisions" ON public.decisions FOR INSERT TO authenticated
  WITH CHECK (
    decided_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.rams_submissions s
      JOIN public.project_members pm ON pm.project_id = s.project_id
      WHERE s.id = decisions.submission_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('admin', 'project_manager', 'principal_designer', 'principal_contractor', 'reviewer')
    )
  );

-- Audit events: members can view, inserts via trigger or service (service uses service_role or authenticated).
CREATE POLICY "Authenticated can view own audit events" ON public.audit_events FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR actor_id IS NULL);

-- (More policies can be added; RLS for INSERT on findings etc. would be via the persist RPC which runs as authenticated.)

-- End of compliant domain model migration.
-- Run: supabase db push or apply via your deploy process.
