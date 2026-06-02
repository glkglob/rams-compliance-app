-- ── Daily site reports ────────────────────────────────────────────────────────
--
-- One report per project per day. Captures weather conditions, workforce,
-- activities, delays, and safety observations. Weather data is fetched from
-- the Met Office DataPoint API and stored as JSONB.

SET search_path TO public, extensions;

-- ── 1. Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date     DATE        NOT NULL,
  -- Weather (fetched from Met Office or entered manually)
  weather_data    JSONB,      -- { temp_c, humidity, wind_mph, description, icon, source }
  weather_summary TEXT,       -- human-readable one-liner
  -- Site activity
  workforce_count INTEGER,
  activities      TEXT,       -- free-text summary of work done
  plant_on_site   TEXT,       -- machinery/plant list
  -- Issues
  delays          TEXT,
  safety_observations TEXT,
  visitors        TEXT,
  -- Status
  status          TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'approved')),
  -- Metadata
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One report per project per date
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_reports_project_date
  ON public.daily_reports (project_id, report_date);

CREATE INDEX IF NOT EXISTS idx_daily_reports_project
  ON public.daily_reports (project_id);

DROP TRIGGER IF EXISTS handle_daily_reports_updated_at ON public.daily_reports;
CREATE TRIGGER handle_daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_reports' AND policyname='Members can view daily reports') THEN
    CREATE POLICY "Members can view daily reports" ON public.daily_reports
      FOR SELECT TO authenticated
      USING (public.is_project_member(project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_reports' AND policyname='Members can create daily reports') THEN
    CREATE POLICY "Members can create daily reports" ON public.daily_reports
      FOR INSERT TO authenticated
      WITH CHECK (public.is_project_member(project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_reports' AND policyname='Authors and managers can update daily reports') THEN
    CREATE POLICY "Authors and managers can update daily reports" ON public.daily_reports
      FOR UPDATE TO authenticated
      USING (created_by = auth.uid() OR public.can_manage_project(project_id))
      WITH CHECK (created_by = auth.uid() OR public.can_manage_project(project_id));
  END IF;
END $$;
