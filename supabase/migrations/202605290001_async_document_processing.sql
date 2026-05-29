-- Async document processing pipeline.
--
-- 1. Creates the private "documents" storage bucket that the upload routes and
--    storage RLS policies (202605280002_storage_policies.sql) already assume
--    exists. Without this, every upload fails with "Bucket not found".
-- 2. Adds a document_processing_jobs table so background extraction / AI
--    structuring / embedding work can be tracked (pending -> processing ->
--    completed/failed) instead of running synchronously inside the HTTP request.

-- ---------------------------------------------------------------------------
-- 1. Private storage bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Processing-job tracking
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processing_job_status') THEN
    CREATE TYPE processing_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS document_processing_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES compliance_documents(id) ON DELETE CASCADE,
  status processing_job_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_document
  ON document_processing_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_status
  ON document_processing_jobs(status);

-- Keep updated_at fresh (reuses the trigger function defined in the foundation migration).
DROP TRIGGER IF EXISTS set_document_processing_jobs_updated_at ON document_processing_jobs;
CREATE TRIGGER set_document_processing_jobs_updated_at
  BEFORE UPDATE ON document_processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — mirror the document_chunks pattern (access flows through the parent
-- compliance_documents -> project membership). The background worker uses the
-- service-role key, which bypasses RLS, so these policies only govern end users.
-- ---------------------------------------------------------------------------
ALTER TABLE document_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view document processing jobs" ON document_processing_jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.compliance_documents
      WHERE id = document_processing_jobs.document_id
        AND public.is_project_member(project_id)
    )
  );

CREATE POLICY "Managers can manage document processing jobs" ON document_processing_jobs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.compliance_documents
      WHERE id = document_processing_jobs.document_id
        AND public.can_manage_project(project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.compliance_documents
      WHERE id = document_processing_jobs.document_id
        AND public.can_manage_project(project_id)
    )
  );
