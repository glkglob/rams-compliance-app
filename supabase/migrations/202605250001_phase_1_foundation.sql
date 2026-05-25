CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TYPE user_role AS ENUM ('admin', 'project_manager', 'reviewer', 'viewer');
CREATE TYPE document_category AS ENUM (
  'terms_and_conditions',
  'company_policy',
  'project_policy',
  'health_and_safety',
  'site_rules',
  'client_requirements',
  'other'
);
CREATE TYPE extraction_status AS ENUM ('pending', 'processing', 'complete', 'failed');
CREATE TYPE review_status AS ENUM ('pending', 'processing', 'approved', 'rejected', 'manual_review', 'failed');
CREATE TYPE requirement_severity AS ENUM ('critical', 'major', 'minor');
CREATE TYPE check_status AS ENUM ('compliant', 'partially_compliant', 'non_compliant', 'not_applicable', 'unclear');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role user_role DEFAULT 'viewer'::user_role,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  client_name TEXT,
  site_address TEXT,
  description TEXT,
  compliance_threshold INTEGER DEFAULT 80 CHECK (compliance_threshold BETWEEN 0 AND 100),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role user_role DEFAULT 'viewer'::user_role,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE compliance_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT,
  file_url TEXT,
  storage_path TEXT,
  document_category document_category,
  extracted_text TEXT,
  extraction_status extraction_status DEFAULT 'pending',
  extraction_confidence DECIMAL(3, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES compliance_documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE compliance_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  source_document_id UUID REFERENCES compliance_documents(id),
  requirement_code TEXT NOT NULL,
  requirement_text TEXT NOT NULL,
  category document_category,
  severity requirement_severity DEFAULT 'major',
  source_excerpt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rams_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  subcontractor_name TEXT NOT NULL,
  subcontractor_email TEXT,
  trade_package TEXT,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT,
  file_url TEXT,
  storage_path TEXT,
  extracted_text TEXT,
  review_status review_status DEFAULT 'pending',
  compliance_score DECIMAL(5, 2),
  confidence_score DECIMAL(3, 2),
  decision_explanation TEXT,
  submitted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rams_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rams_submission_id UUID REFERENCES rams_submissions(id) ON DELETE CASCADE,
  review_status review_status,
  compliance_score DECIMAL(5, 2),
  confidence_score DECIMAL(3, 2),
  decision_explanation TEXT,
  email_generated BOOLEAN DEFAULT FALSE,
  email_sent BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE review_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rams_review_id UUID REFERENCES rams_reviews(id) ON DELETE CASCADE,
  requirement_id UUID REFERENCES compliance_requirements(id),
  status check_status,
  severity requirement_severity,
  score DECIMAL(3, 2) CHECK (score BETWEEN 0 AND 1),
  rams_evidence TEXT,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE generated_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rams_submission_id UUID REFERENCES rams_submissions(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_compliance_documents_project ON compliance_documents(project_id);
CREATE INDEX idx_document_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_compliance_requirements_project ON compliance_requirements(project_id);
CREATE INDEX idx_rams_submissions_project ON rams_submissions(project_id);
CREATE INDEX idx_rams_reviews_submission ON rams_reviews(rams_submission_id);
CREATE INDEX idx_review_checks_review ON review_checks(rams_review_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_member(target_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = target_project_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_project(target_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = target_project_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'project_manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_review_project(target_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = target_project_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'project_manager', 'reviewer')
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'viewer')::user_role
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS handle_profiles_updated_at ON profiles;
CREATE TRIGGER handle_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS handle_projects_updated_at ON projects;
CREATE TRIGGER handle_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS handle_compliance_documents_updated_at ON compliance_documents;
CREATE TRIGGER handle_compliance_documents_updated_at
  BEFORE UPDATE ON compliance_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS handle_rams_submissions_updated_at ON rams_submissions;
CREATE TRIGGER handle_rams_submissions_updated_at
  BEFORE UPDATE ON rams_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rams_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rams_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Members can view projects" ON projects
  FOR SELECT TO authenticated
  USING (public.is_project_member(id));

CREATE POLICY "Managers can create projects" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'project_manager')
    )
  );

CREATE POLICY "Managers can update projects" ON projects
  FOR UPDATE TO authenticated
  USING (public.can_manage_project(id))
  WITH CHECK (public.can_manage_project(id));

CREATE POLICY "Admins can delete projects" ON projects
  FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "Members can view project memberships" ON project_members
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));

CREATE POLICY "Managers can insert project memberships" ON project_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_project(project_id)
    OR (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.projects
        WHERE id = project_id
          AND created_by = auth.uid()
      )
    )
  );

CREATE POLICY "Managers can update project memberships" ON project_members
  FOR UPDATE TO authenticated
  USING (public.can_manage_project(project_id))
  WITH CHECK (public.can_manage_project(project_id));

CREATE POLICY "Managers can delete project memberships" ON project_members
  FOR DELETE TO authenticated
  USING (public.can_manage_project(project_id));

CREATE POLICY "Members can view compliance documents" ON compliance_documents
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));

CREATE POLICY "Managers can manage compliance documents" ON compliance_documents
  FOR ALL TO authenticated
  USING (public.can_manage_project(project_id))
  WITH CHECK (public.can_manage_project(project_id));

CREATE POLICY "Members can view document chunks" ON document_chunks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.compliance_documents
      WHERE id = document_chunks.document_id
        AND public.is_project_member(project_id)
    )
  );

CREATE POLICY "Managers can manage document chunks" ON document_chunks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.compliance_documents
      WHERE id = document_chunks.document_id
        AND public.can_manage_project(project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.compliance_documents
      WHERE id = document_chunks.document_id
        AND public.can_manage_project(project_id)
    )
  );

CREATE POLICY "Members can view compliance requirements" ON compliance_requirements
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));

CREATE POLICY "Managers can manage compliance requirements" ON compliance_requirements
  FOR ALL TO authenticated
  USING (public.can_manage_project(project_id))
  WITH CHECK (public.can_manage_project(project_id));

CREATE POLICY "Users can view RAMS submissions" ON rams_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_project_member(project_id)
    OR submitted_by = auth.uid()
  );

CREATE POLICY "Users can create RAMS submissions" ON rams_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id)
    OR submitted_by = auth.uid()
  );

CREATE POLICY "Reviewers can update RAMS submissions" ON rams_submissions
  FOR UPDATE TO authenticated
  USING (public.can_review_project(project_id))
  WITH CHECK (public.can_review_project(project_id));

CREATE POLICY "Reviewers can delete RAMS submissions" ON rams_submissions
  FOR DELETE TO authenticated
  USING (public.can_review_project(project_id));

CREATE POLICY "Members can view RAMS reviews" ON rams_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rams_submissions
      WHERE id = rams_reviews.rams_submission_id
        AND public.is_project_member(project_id)
    )
  );

CREATE POLICY "Reviewers can manage RAMS reviews" ON rams_reviews
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rams_submissions
      WHERE id = rams_reviews.rams_submission_id
        AND public.can_review_project(project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rams_submissions
      WHERE id = rams_reviews.rams_submission_id
        AND public.can_review_project(project_id)
    )
  );

CREATE POLICY "Members can view review checks" ON review_checks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rams_reviews
      JOIN public.rams_submissions
        ON rams_submissions.id = rams_reviews.rams_submission_id
      WHERE rams_reviews.id = review_checks.rams_review_id
        AND public.is_project_member(rams_submissions.project_id)
    )
  );

CREATE POLICY "Reviewers can manage review checks" ON review_checks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rams_reviews
      JOIN public.rams_submissions
        ON rams_submissions.id = rams_reviews.rams_submission_id
      WHERE rams_reviews.id = review_checks.rams_review_id
        AND public.can_review_project(rams_submissions.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rams_reviews
      JOIN public.rams_submissions
        ON rams_submissions.id = rams_reviews.rams_submission_id
      WHERE rams_reviews.id = review_checks.rams_review_id
        AND public.can_review_project(rams_submissions.project_id)
    )
  );

CREATE POLICY "Members can view generated emails" ON generated_emails
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rams_submissions
      WHERE id = generated_emails.rams_submission_id
        AND public.is_project_member(project_id)
    )
  );

CREATE POLICY "Reviewers can manage generated emails" ON generated_emails
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rams_submissions
      WHERE id = generated_emails.rams_submission_id
        AND public.can_review_project(project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rams_submissions
      WHERE id = generated_emails.rams_submission_id
        AND public.can_review_project(project_id)
    )
  );

CREATE POLICY "Users can view their audit logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can create their audit logs" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
