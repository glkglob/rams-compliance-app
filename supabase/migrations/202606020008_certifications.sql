-- ── Certification tracking with expiry reminders ──────────────────────────────
--
-- Tracks trade/safety certifications (CSCS, SSSTS, SMSTS, first aid, etc.)
-- for individual users. The daily cron job queries for certificates expiring
-- within the next 30/14/7 days and sends reminder emails via Resend.

SET search_path TO public, extensions;

-- ── 1. Certifications table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.certifications (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- What
  name             TEXT        NOT NULL,  -- e.g. "CSCS Gold Card", "SSSTS"
  issuing_body     TEXT,                  -- e.g. "CITB", "St John Ambulance"
  certificate_number TEXT,
  -- When
  issued_date      DATE,
  expiry_date      DATE,
  -- Reminder tracking — set by the cron job so the same email isn't sent twice
  reminder_30d_sent BOOLEAN   NOT NULL DEFAULT false,
  reminder_14d_sent BOOLEAN   NOT NULL DEFAULT false,
  reminder_7d_sent  BOOLEAN   NOT NULL DEFAULT false,
  -- Optional link to a project (null = personal / cross-project cert)
  project_id       UUID       REFERENCES public.projects(id) ON DELETE SET NULL,
  -- Metadata
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certifications_profile
  ON public.certifications (profile_id);

CREATE INDEX IF NOT EXISTS idx_certifications_expiry
  ON public.certifications (expiry_date)
  WHERE expiry_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_certifications_project
  ON public.certifications (project_id)
  WHERE project_id IS NOT NULL;

DROP TRIGGER IF EXISTS handle_certifications_updated_at ON public.certifications;
CREATE TRIGGER handle_certifications_updated_at
  BEFORE UPDATE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

-- Users can view/manage their own certifications
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='certifications' AND policyname='Users can view own certifications') THEN
    CREATE POLICY "Users can view own certifications" ON public.certifications
      FOR SELECT TO authenticated
      USING (profile_id = auth.uid() OR public.is_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='certifications' AND policyname='Users can manage own certifications') THEN
    CREATE POLICY "Users can manage own certifications" ON public.certifications
      FOR ALL TO authenticated
      USING (profile_id = auth.uid())
      WITH CHECK (profile_id = auth.uid());
  END IF;
END $$;

-- Project managers can view certifications of project members
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='certifications' AND policyname='Managers can view project member certifications') THEN
    CREATE POLICY "Managers can view project member certifications" ON public.certifications
      FOR SELECT TO authenticated
      USING (
        project_id IS NOT NULL
        AND public.can_manage_project(project_id)
      );
  END IF;
END $$;
