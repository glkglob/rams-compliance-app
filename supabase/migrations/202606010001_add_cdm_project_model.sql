-- CDM 2015 data model foundation.
-- This migration keeps the UI/API surface light while making the core project
-- records explicit about dutyholder appointments, Construction Phase Plan links,
-- risk management, pre-construction information, and Health & Safety File inputs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cdm_dutyholder_type') THEN
    CREATE TYPE public.cdm_dutyholder_type AS ENUM (
      'client',
      'principal_designer',
      'principal_contractor',
      'designer',
      'contractor'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cdm_appointment_status') THEN
    CREATE TYPE public.cdm_appointment_status AS ENUM (
      'proposed',
      'appointed',
      'ended',
      'declined'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cdm_risk_category') THEN
    CREATE TYPE public.cdm_risk_category AS ENUM (
      'design',
      'construction',
      'temporary_works',
      'work_at_height',
      'excavation',
      'lifting',
      'plant_machinery',
      'electrical',
      'hazardous_substances',
      'fire',
      'public_interface',
      'environmental',
      'occupational_health',
      'other'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_risk_status') THEN
    CREATE TYPE public.project_risk_status AS ENUM (
      'open',
      'mitigated',
      'accepted',
      'closed'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.project_cdm_appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  dutyholder_type public.cdm_dutyholder_type NOT NULL,
  appointed_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  organisation_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  appointment_status public.cdm_appointment_status NOT NULL DEFAULT 'appointed',
  appointment_scope TEXT,
  appointed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  appointed_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (appointed_profile_id IS NOT NULL OR organisation_name IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_cdm_appointments_one_active_principal_idx
  ON public.project_cdm_appointments (project_id, dutyholder_type)
  WHERE dutyholder_type IN ('client', 'principal_designer', 'principal_contractor')
    AND appointment_status = 'appointed'
    AND ended_at IS NULL;

CREATE INDEX IF NOT EXISTS project_cdm_appointments_project_idx
  ON public.project_cdm_appointments (project_id);

CREATE INDEX IF NOT EXISTS project_cdm_appointments_profile_idx
  ON public.project_cdm_appointments (appointed_profile_id);

CREATE TABLE IF NOT EXISTS public.project_risks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  risk_category public.cdm_risk_category NOT NULL DEFAULT 'other',
  construction_phase_plan_section TEXT,
  mitigation_summary TEXT,
  owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_organisation_name TEXT,
  status public.project_risk_status NOT NULL DEFAULT 'open',
  risk_rating INTEGER CHECK (risk_rating BETWEEN 1 AND 25),
  contributes_to_construction_phase_plan BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_risks_project_idx
  ON public.project_risks (project_id);

CREATE INDEX IF NOT EXISTS project_risks_category_idx
  ON public.project_risks (project_id, risk_category);

ALTER TABLE public.rams_submissions
  ADD COLUMN IF NOT EXISTS construction_phase_plan_section TEXT,
  ADD COLUMN IF NOT EXISTS primary_risk_category public.cdm_risk_category,
  ADD COLUMN IF NOT EXISTS linked_project_risk_id UUID REFERENCES public.project_risks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contributes_to_health_safety_file BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS health_safety_file_section TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_for_cdm BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS rams_submissions_project_risk_idx
  ON public.rams_submissions (linked_project_risk_id);

CREATE INDEX IF NOT EXISTS rams_submissions_hsf_idx
  ON public.rams_submissions (project_id)
  WHERE contributes_to_health_safety_file = TRUE;

ALTER TABLE public.compliance_documents
  ADD COLUMN IF NOT EXISTS is_pre_construction_information BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pre_construction_information_section TEXT,
  ADD COLUMN IF NOT EXISTS contributes_to_health_safety_file BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS health_safety_file_section TEXT;

CREATE INDEX IF NOT EXISTS compliance_documents_pci_idx
  ON public.compliance_documents (project_id)
  WHERE is_pre_construction_information = TRUE;

CREATE INDEX IF NOT EXISTS compliance_documents_hsf_idx
  ON public.compliance_documents (project_id)
  WHERE contributes_to_health_safety_file = TRUE;

DROP TRIGGER IF EXISTS handle_project_cdm_appointments_updated_at ON public.project_cdm_appointments;
CREATE TRIGGER handle_project_cdm_appointments_updated_at
  BEFORE UPDATE ON public.project_cdm_appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS handle_project_risks_updated_at ON public.project_risks;
CREATE TRIGGER handle_project_risks_updated_at
  BEFORE UPDATE ON public.project_risks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.project_cdm_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view CDM appointments" ON public.project_cdm_appointments
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));

CREATE POLICY "Managers can manage CDM appointments" ON public.project_cdm_appointments
  FOR ALL TO authenticated
  USING (public.can_manage_project(project_id))
  WITH CHECK (public.can_manage_project(project_id));

CREATE POLICY "Members can view project risks" ON public.project_risks
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));

CREATE POLICY "Managers can manage project risks" ON public.project_risks
  FOR ALL TO authenticated
  USING (public.can_manage_project(project_id))
  WITH CHECK (public.can_manage_project(project_id));

COMMENT ON TYPE public.cdm_dutyholder_type IS
  'CDM 2015 dutyholder categories recorded as formal project appointments, separate from application access roles.';
COMMENT ON TYPE public.cdm_risk_category IS
  'Lightweight CDM risk taxonomy for project risk registers and RAMS categorisation.';
COMMENT ON TABLE public.project_cdm_appointments IS
  'Formal CDM 2015 dutyholder appointments for a project; preserves who held Client, Principal Designer, Principal Contractor, Designer, and Contractor duties.';
COMMENT ON TABLE public.project_risks IS
  'Project-level CDM risk register for significant risks that should inform planning, RAMS review, and Construction Phase Plan content.';
COMMENT ON COLUMN public.rams_submissions.construction_phase_plan_section IS
  'Links a RAMS submission to the relevant Construction Phase Plan section it supports or affects.';
COMMENT ON COLUMN public.rams_submissions.primary_risk_category IS
  'Classifies the main CDM risk addressed by the RAMS submission.';
COMMENT ON COLUMN public.rams_submissions.linked_project_risk_id IS
  'Connects a RAMS submission to a project risk register entry so controls can be traced from planning into method statements.';
COMMENT ON COLUMN public.rams_submissions.contributes_to_health_safety_file IS
  'Marks approved RAMS material as a potential Health & Safety File contribution for handover.';
COMMENT ON COLUMN public.compliance_documents.is_pre_construction_information IS
  'Identifies documents that provide CDM pre-construction information for designers and contractors.';
COMMENT ON COLUMN public.compliance_documents.contributes_to_health_safety_file IS
  'Marks documents that should be considered for the CDM Health & Safety File.';
