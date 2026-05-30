-- Audit Remediation Migration
-- Adds missing foreign key indexes and ensures updated_at triggers exist on all mutable tables.

-- ============================================
-- 1. Missing / recommended FK indexes
-- ============================================

-- rams_submissions
CREATE INDEX IF NOT EXISTS idx_rams_submissions_submitted_by ON rams_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_rams_submissions_review_status ON rams_submissions(review_status);

-- rams_reviews
CREATE INDEX IF NOT EXISTS idx_rams_reviews_reviewed_by ON rams_reviews(reviewed_by);

-- review_checks
CREATE INDEX IF NOT EXISTS idx_review_checks_requirement ON review_checks(requirement_id);
CREATE INDEX IF NOT EXISTS idx_review_checks_status ON review_checks(status);

-- compliance_requirements
CREATE INDEX IF NOT EXISTS idx_compliance_requirements_source_doc ON compliance_requirements(source_document_id);

-- document_chunks (for vector search performance)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- generated_emails
CREATE INDEX IF NOT EXISTS idx_generated_emails_rams ON generated_emails(rams_submission_id);

-- audit_logs (common query patterns)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================
-- 2. Ensure updated_at triggers exist
-- ============================================

-- Helper: create trigger if the table has an updated_at column but no trigger yet
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename IN ('projects', 'compliance_documents', 'rams_submissions', 'rams_reviews', 'profiles')
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger 
            WHERE tgname = 'handle_' || tbl || '_updated_at'
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER handle_%I_updated_at
                 BEFORE UPDATE ON %I
                 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
                tbl, tbl
            );
        END IF;
    END LOOP;
END $$;

-- Add comment for traceability
COMMENT ON TABLE rams_submissions IS 'RAMS submissions with AI-assisted review results. Part of audit remediation 2026-05-30.';