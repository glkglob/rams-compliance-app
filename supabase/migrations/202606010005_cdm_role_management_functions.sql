-- Phase 0: Update project management and review functions for CDM 2015 roles.
--
-- can_manage_project: add principal_designer and principal_contractor
-- can_review_project: add principal_designer and principal_contractor
--
-- These CDM duty holders have management/review responsibility under the
-- CDM 2015 regulations and need the same project-level access as admin
-- and the legacy project_manager role.

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
      AND role IN ('admin', 'project_manager', 'principal_designer', 'principal_contractor')
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
      AND role IN ('admin', 'project_manager', 'reviewer', 'principal_designer', 'principal_contractor')
  );
$$;
