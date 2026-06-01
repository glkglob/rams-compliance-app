-- ── Inspections ───────────────────────────────────────────────────────────────
--
-- inspection_templates  — reusable checklists (e.g. "Weekly scaffold check")
-- inspections           — filled instances of a template on a project
-- inspection_items      — per-question answers within an inspection
--
-- Photo attachments are stored via the existing polymorphic `attachments`
-- table with parent_type = 'inspection'. The CHECK constraint on attachments
-- is widened at the end of this migration.

SET search_path TO public, extensions;

-- ── 1. Inspection status enum ──────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspection_status') THEN
    CREATE TYPE public.inspection_status AS ENUM (
      'draft',
      'in_progress',
      'completed',
      'failed'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspection_item_result') THEN
    CREATE TYPE public.inspection_item_result AS ENUM (
      'pass',
      'fail',
      'na',
      'not_checked'
    );
  END IF;
END $$;

-- ── 2. Templates table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inspection_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        REFERENCES public.projects(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT,
  -- Ordered list of checklist questions stored as JSONB array.
  -- Each element: { "label": "...", "category": "...", "required": true }
  items        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_templates_project
  ON public.inspection_templates (project_id);

DROP TRIGGER IF EXISTS handle_inspection_templates_updated_at ON public.inspection_templates;
CREATE TRIGGER handle_inspection_templates_updated_at
  BEFORE UPDATE ON public.inspection_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Inspections table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inspections (
  id           UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID                     NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  template_id  UUID                     REFERENCES public.inspection_templates(id) ON DELETE SET NULL,
  title        TEXT                     NOT NULL,
  description  TEXT,
  status       public.inspection_status NOT NULL DEFAULT 'draft',
  location     TEXT,
  inspector_id UUID                     REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ              NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspections_project
  ON public.inspections (project_id);

CREATE INDEX IF NOT EXISTS idx_inspections_template
  ON public.inspections (template_id)
  WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inspections_inspector
  ON public.inspections (inspector_id);

DROP TRIGGER IF EXISTS handle_inspections_updated_at ON public.inspections;
CREATE TRIGGER handle_inspections_updated_at
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Inspection items table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inspection_items (
  id             UUID                         PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id  UUID                         NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  item_index     INTEGER                      NOT NULL,
  label          TEXT                         NOT NULL,
  category       TEXT,
  result         public.inspection_item_result NOT NULL DEFAULT 'not_checked',
  notes          TEXT,
  created_at     TIMESTAMPTZ                  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_items_inspection
  ON public.inspection_items (inspection_id);

-- ── 5. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.inspection_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_items ENABLE ROW LEVEL SECURITY;

-- Templates: project members can read; managers can write
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inspection_templates' AND policyname='Members can view inspection templates') THEN
    CREATE POLICY "Members can view inspection templates" ON public.inspection_templates
      FOR SELECT TO authenticated
      USING (public.is_project_member(project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inspection_templates' AND policyname='Managers can manage inspection templates') THEN
    CREATE POLICY "Managers can manage inspection templates" ON public.inspection_templates
      FOR ALL TO authenticated
      USING (public.can_manage_project(project_id))
      WITH CHECK (public.can_manage_project(project_id));
  END IF;
END $$;

-- Inspections: project members can read; members can create; inspector/managers can update
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inspections' AND policyname='Members can view inspections') THEN
    CREATE POLICY "Members can view inspections" ON public.inspections
      FOR SELECT TO authenticated
      USING (public.is_project_member(project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inspections' AND policyname='Members can create inspections') THEN
    CREATE POLICY "Members can create inspections" ON public.inspections
      FOR INSERT TO authenticated
      WITH CHECK (public.is_project_member(project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inspections' AND policyname='Inspectors and managers can update inspections') THEN
    CREATE POLICY "Inspectors and managers can update inspections" ON public.inspections
      FOR UPDATE TO authenticated
      USING (
        inspector_id = auth.uid()
        OR public.can_manage_project(project_id)
      )
      WITH CHECK (
        inspector_id = auth.uid()
        OR public.can_manage_project(project_id)
      );
  END IF;
END $$;

-- Inspection items: inherit from parent inspection
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inspection_items' AND policyname='Members can view inspection items') THEN
    CREATE POLICY "Members can view inspection items" ON public.inspection_items
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.inspections i
          WHERE i.id = inspection_items.inspection_id
            AND public.is_project_member(i.project_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inspection_items' AND policyname='Inspectors can manage inspection items') THEN
    CREATE POLICY "Inspectors can manage inspection items" ON public.inspection_items
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.inspections i
          WHERE i.id = inspection_items.inspection_id
            AND (i.inspector_id = auth.uid() OR public.can_manage_project(i.project_id))
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.inspections i
          WHERE i.id = inspection_items.inspection_id
            AND (i.inspector_id = auth.uid() OR public.can_manage_project(i.project_id))
        )
      );
  END IF;
END $$;

-- ── 6. Widen attachments CHECK constraint ──────────────────────────────────────
-- Add 'inspection' as an allowed parent_type so photos can be attached.

ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_parent_type_check;
ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_parent_type_check
  CHECK (parent_type IN ('rams_submission', 'inspection'));

-- Storage policies for inspection attachments (same bucket, different path prefix)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Members can download inspection attachments') THEN
    CREATE POLICY "Members can download inspection attachments"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = 'inspection'
        AND EXISTS (
          SELECT 1 FROM public.inspections i
          JOIN public.project_members pm ON pm.project_id = i.project_id
          WHERE i.id = ((storage.foldername(name))[2])::uuid
            AND pm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Members can upload inspection attachments') THEN
    CREATE POLICY "Members can upload inspection attachments"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = 'inspection'
        AND EXISTS (
          SELECT 1 FROM public.inspections i
          JOIN public.project_members pm ON pm.project_id = i.project_id
          WHERE i.id = ((storage.foldername(name))[2])::uuid
            AND pm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Inspectors can delete inspection attachments') THEN
    CREATE POLICY "Inspectors can delete inspection attachments"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = 'inspection'
        AND (
          owner = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.inspections i
            WHERE i.id = ((storage.foldername(name))[2])::uuid
              AND public.can_manage_project(i.project_id)
          )
        )
      );
  END IF;
END $$;

-- Attachments table RLS: add inspection policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='attachments' AND policyname='Members can view inspection attachments') THEN
    CREATE POLICY "Members can view inspection attachments"
      ON public.attachments FOR SELECT TO authenticated
      USING (
        parent_type = 'inspection'
        AND EXISTS (
          SELECT 1 FROM public.inspections i
          WHERE i.id = attachments.parent_id
            AND public.is_project_member(i.project_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='attachments' AND policyname='Members can add inspection attachments') THEN
    CREATE POLICY "Members can add inspection attachments"
      ON public.attachments FOR INSERT TO authenticated
      WITH CHECK (
        parent_type = 'inspection'
        AND uploaded_by = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.inspections i
          WHERE i.id = attachments.parent_id
            AND public.is_project_member(i.project_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='attachments' AND policyname='Inspectors can delete inspection attachments') THEN
    CREATE POLICY "Inspectors can delete inspection attachments"
      ON public.attachments FOR DELETE TO authenticated
      USING (
        parent_type = 'inspection'
        AND (
          uploaded_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.inspections i
            WHERE i.id = attachments.parent_id
              AND public.can_manage_project(i.project_id)
          )
        )
      );
  END IF;
END $$;
