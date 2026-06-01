-- ── RIDDOR-aligned incident reporting ──────────────────────────────────────────
--
-- incidents          — the core report (what happened, when, where, severity)
-- incident_parties   — people involved (injured person, witness, first aider)
--
-- Each incident can optionally link to a RAMS submission via
-- related_rams_submission_id so investigations can reference the H&S controls
-- that were (or should have been) in place.
--
-- Photo/document attachments reuse the polymorphic `attachments` table with
-- parent_type = 'incident'.

SET search_path TO public, extensions;

-- ── 1. Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_severity') THEN
    CREATE TYPE public.incident_severity AS ENUM (
      'near_miss',
      'minor',
      'major',              -- RIDDOR "over-7-day"
      'specified_injury',   -- RIDDOR specified injury
      'dangerous_occurrence',
      'fatality'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_status') THEN
    CREATE TYPE public.incident_status AS ENUM (
      'draft',
      'reported',
      'under_investigation',
      'closed',
      'riddor_notified'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_party_role') THEN
    CREATE TYPE public.incident_party_role AS ENUM (
      'injured_person',
      'witness',
      'first_aider',
      'reporter',
      'investigator'
    );
  END IF;
END $$;

-- ── 2. Incidents table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.incidents (
  id                         UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                 UUID                    NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  related_rams_submission_id UUID                    REFERENCES public.rams_submissions(id) ON DELETE SET NULL,
  -- What happened
  title                      TEXT                    NOT NULL,
  description                TEXT,
  severity                   public.incident_severity NOT NULL DEFAULT 'near_miss',
  status                     public.incident_status   NOT NULL DEFAULT 'draft',
  -- When & where
  occurred_at                TIMESTAMPTZ             NOT NULL DEFAULT now(),
  location                   TEXT,
  -- RIDDOR fields
  riddor_reportable          BOOLEAN                 NOT NULL DEFAULT false,
  riddor_reference           TEXT,                   -- HSE reference number if notified
  -- Investigation
  root_cause                 TEXT,
  corrective_actions         TEXT,
  -- Metadata
  reported_by                UUID                    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ             NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ             NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_project
  ON public.incidents (project_id);

CREATE INDEX IF NOT EXISTS idx_incidents_rams
  ON public.incidents (related_rams_submission_id)
  WHERE related_rams_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_status
  ON public.incidents (status);

DROP TRIGGER IF EXISTS handle_incidents_updated_at ON public.incidents;
CREATE TRIGGER handle_incidents_updated_at
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Incident parties ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.incident_parties (
  id            UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id   UUID                       NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  role          public.incident_party_role  NOT NULL,
  full_name     TEXT                       NOT NULL,
  company       TEXT,
  contact       TEXT,                      -- phone or email
  notes         TEXT,
  created_at    TIMESTAMPTZ                NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_parties_incident
  ON public.incident_parties (incident_id);

-- ── 4. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_parties ENABLE ROW LEVEL SECURITY;

-- Incidents: project members can view/create; managers can update
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='incidents' AND policyname='Members can view incidents') THEN
    CREATE POLICY "Members can view incidents" ON public.incidents
      FOR SELECT TO authenticated USING (public.is_project_member(project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='incidents' AND policyname='Members can create incidents') THEN
    CREATE POLICY "Members can create incidents" ON public.incidents
      FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='incidents' AND policyname='Reporters and managers can update incidents') THEN
    CREATE POLICY "Reporters and managers can update incidents" ON public.incidents
      FOR UPDATE TO authenticated
      USING (reported_by = auth.uid() OR public.can_manage_project(project_id))
      WITH CHECK (reported_by = auth.uid() OR public.can_manage_project(project_id));
  END IF;
END $$;

-- Parties: inherit from parent incident
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='incident_parties' AND policyname='Members can view incident parties') THEN
    CREATE POLICY "Members can view incident parties" ON public.incident_parties
      FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_parties.incident_id AND public.is_project_member(i.project_id))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='incident_parties' AND policyname='Reporters and managers can manage parties') THEN
    CREATE POLICY "Reporters and managers can manage parties" ON public.incident_parties
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_parties.incident_id AND (i.reported_by = auth.uid() OR public.can_manage_project(i.project_id))))
      WITH CHECK (EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_parties.incident_id AND (i.reported_by = auth.uid() OR public.can_manage_project(i.project_id))));
  END IF;
END $$;

-- ── 5. Widen attachments CHECK constraint ──────────────────────────────────────

ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_parent_type_check;
ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_parent_type_check
  CHECK (parent_type IN ('rams_submission', 'inspection', 'incident'));

-- Attachments RLS for incidents
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='attachments' AND policyname='Members can view incident attachments') THEN
    CREATE POLICY "Members can view incident attachments" ON public.attachments
      FOR SELECT TO authenticated USING (
        parent_type = 'incident' AND EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = attachments.parent_id AND public.is_project_member(i.project_id))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='attachments' AND policyname='Members can add incident attachments') THEN
    CREATE POLICY "Members can add incident attachments" ON public.attachments
      FOR INSERT TO authenticated WITH CHECK (
        parent_type = 'incident' AND uploaded_by = auth.uid()
        AND EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = attachments.parent_id AND public.is_project_member(i.project_id))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='attachments' AND policyname='Reporters can delete incident attachments') THEN
    CREATE POLICY "Reporters can delete incident attachments" ON public.attachments
      FOR DELETE TO authenticated USING (
        parent_type = 'incident' AND (
          uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = attachments.parent_id AND public.can_manage_project(i.project_id))
        )
      );
  END IF;
END $$;

-- Storage policies for incident attachments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Members can download incident attachments') THEN
    CREATE POLICY "Members can download incident attachments" ON storage.objects
      FOR SELECT TO authenticated USING (
        bucket_id = 'attachments' AND (storage.foldername(name))[1] = 'incident'
        AND EXISTS (SELECT 1 FROM public.incidents i JOIN public.project_members pm ON pm.project_id = i.project_id WHERE i.id = ((storage.foldername(name))[2])::uuid AND pm.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Members can upload incident attachments') THEN
    CREATE POLICY "Members can upload incident attachments" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'attachments' AND (storage.foldername(name))[1] = 'incident'
        AND EXISTS (SELECT 1 FROM public.incidents i JOIN public.project_members pm ON pm.project_id = i.project_id WHERE i.id = ((storage.foldername(name))[2])::uuid AND pm.user_id = auth.uid())
      );
  END IF;
END $$;
