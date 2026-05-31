-- Add index on compliance_requirements.source_document_id for vector search joins
CREATE INDEX IF NOT EXISTS idx_compliance_requirements_source_doc
  ON compliance_requirements(source_document_id);

-- Add index on rams_submissions.review_status for dashboard stats queries
CREATE INDEX IF NOT EXISTS idx_rams_submissions_review_status
  ON rams_submissions(review_status);

-- Add index on rams_submissions.submitted_by for user-scoped queries
CREATE INDEX IF NOT EXISTS idx_rams_submissions_submitted_by
  ON rams_submissions(submitted_by);
