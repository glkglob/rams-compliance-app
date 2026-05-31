-- ── Polymorphic attachments ────────────────────────────────────────────────────
--
-- A single attachments table serves any entity type via (parent_type, parent_id).
-- Starting with 'rams_submission'; add new parent_type values in future migrations
-- by updating the CHECK constraint.
--
-- Storage bucket: 'attachments' (private, 25 MB limit)
-- Path layout: {parent_type}/{parent_id}/{uuid}_{sanitized_filename}
-- e.g. rams_submission/abc-123/def-456_safety-plan.pdf
--
-- Migration is idempotent: IF NOT EXISTS / DO NOTHING guards on every statement.

-- ── 1. Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attachments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type  TEXT        NOT NULL CHECK (parent_type IN ('rams_submission')),
  parent_id    UUID        NOT NULL,
  file_name    TEXT        NOT NULL,
  storage_path TEXT        NOT NULL UNIQUE,
  file_size    BIGINT      NOT NULL CHECK (file_size > 0),
  mime_type    TEXT        NOT NULL,
  uploaded_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.attachments IS
  'Polymorphic file attachments. parent_type + parent_id identify the owning entity.';

CREATE INDEX IF NOT EXISTS idx_attachments_parent      ON public.attachments (parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by ON public.attachments (uploaded_by);

-- ── 2. Row-level security ──────────────────────────────────────────────────────

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'attachments'
      AND policyname = 'Members can view RAMS attachments'
  ) THEN
    CREATE POLICY "Members can view RAMS attachments"
      ON public.attachments
      FOR SELECT TO authenticated
      USING (
        parent_type = 'rams_submission'
        AND EXISTS (
          SELECT 1
          FROM   public.rams_submissions rs
          WHERE  rs.id = attachments.parent_id
            AND  public.is_project_member(rs.project_id)
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'attachments'
      AND policyname = 'Members can add RAMS attachments'
  ) THEN
    CREATE POLICY "Members can add RAMS attachments"
      ON public.attachments
      FOR INSERT TO authenticated
      WITH CHECK (
        parent_type = 'rams_submission'
        AND uploaded_by = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM   public.rams_submissions rs
          WHERE  rs.id = attachments.parent_id
            AND  public.is_project_member(rs.project_id)
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'attachments'
      AND policyname = 'Uploaders and managers can delete RAMS attachments'
  ) THEN
    CREATE POLICY "Uploaders and managers can delete RAMS attachments"
      ON public.attachments
      FOR DELETE TO authenticated
      USING (
        parent_type = 'rams_submission'
        AND (
          uploaded_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM   public.rams_submissions rs
            WHERE  rs.id = attachments.parent_id
              AND  public.can_manage_project(rs.project_id)
          )
        )
      );
  END IF;
END $$;

-- ── 3. Storage bucket ──────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  26214400,  -- 25 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Storage object policies ─────────────────────────────────────────────────
-- Path segments: [1] = parent_type, [2] = parent_id (UUID)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Members can download RAMS attachments'
  ) THEN
    CREATE POLICY "Members can download RAMS attachments"
      ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = 'rams_submission'
        AND EXISTS (
          SELECT 1
          FROM   public.rams_submissions rs
          JOIN   public.project_members  pm ON pm.project_id = rs.project_id
          WHERE  rs.id     = ((storage.foldername(name))[2])::uuid
            AND  pm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Members can upload RAMS attachments'
  ) THEN
    CREATE POLICY "Members can upload RAMS attachments"
      ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = 'rams_submission'
        AND EXISTS (
          SELECT 1
          FROM   public.rams_submissions rs
          JOIN   public.project_members  pm ON pm.project_id = rs.project_id
          WHERE  rs.id     = ((storage.foldername(name))[2])::uuid
            AND  pm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Uploaders can delete their RAMS attachments from storage'
  ) THEN
    CREATE POLICY "Uploaders can delete their RAMS attachments from storage"
      ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = 'rams_submission'
        AND (
          owner = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM   public.rams_submissions rs
            WHERE  rs.id = ((storage.foldername(name))[2])::uuid
              AND  public.can_manage_project(rs.project_id)
          )
        )
      );
  END IF;
END $$;
