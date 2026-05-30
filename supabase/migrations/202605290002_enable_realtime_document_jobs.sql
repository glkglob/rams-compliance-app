-- Enable Supabase Realtime for document_processing_jobs.
--
-- This is the DB-side counterpart to the opt-in useDocumentJobStatus() hook
-- (src/lib/realtime/use-document-job-status.ts). Adding the table to the
-- `supabase_realtime` publication is what lets clients receive INSERT/UPDATE
-- events. RLS still governs which rows each user can see, so this does not widen
-- access — it only enables push delivery of rows the user could already read.
--
-- Safe to run repeatedly: we only add the table if it isn't already published.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'document_processing_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.document_processing_jobs;
  END IF;
END$$;
