-- Fix RLS policy performance: wrap auth.<function>() calls with (select ...)
--
-- The Supabase Performance linter reports that certain RLS policies directly
-- reference auth.uid() (or similar) in their USING / WITH CHECK clauses.
-- Postgres re-evaluates these for every candidate row, which is expensive at scale.
--
-- Official recommendation:
--   https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Fix: replace `auth.uid()` with `(select auth.uid())` (and same for other auth.* calls).
-- This allows the planner to treat the result as a constant per-statement rather than
-- per-row function evaluation.
--
-- Only the 6 policies explicitly flagged by the linter are updated here.
-- Other policies delegate to helper functions (is_project_member, can_manage_project, etc.)
-- which internally call auth.uid(); those were not part of this linter batch.

-- 1. profiles ─ "Users can update own profile"
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- 2. projects ─ "Authenticated users can create their own projects"
-- Regular authenticated users (including role 'user' and default 'viewer') may create
-- projects. Ownership is enforced by created_by = auth.uid(). More privileged roles
-- (admin/project_manager) are still used for management policies elsewhere.
DROP POLICY IF EXISTS "Managers can create projects" ON public.projects;

CREATE POLICY "Authenticated users can create their own projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (select auth.uid()));

-- 3. project_members ─ "Managers can insert project memberships"
DROP POLICY IF EXISTS "Managers can insert project memberships" ON public.project_members;

CREATE POLICY "Managers can insert project memberships" ON public.project_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_project(project_id)
    OR (
      user_id = (select auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.projects
        WHERE id = project_id
          AND created_by = (select auth.uid())
      )
    )
  );

-- 4. rams_submissions ─ "Users can view RAMS submissions"
DROP POLICY IF EXISTS "Users can view RAMS submissions" ON public.rams_submissions;

CREATE POLICY "Users can view RAMS submissions" ON public.rams_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_project_member(project_id)
    OR submitted_by = (select auth.uid())
  );

-- 5. rams_submissions ─ "Users can create RAMS submissions"
DROP POLICY IF EXISTS "Users can create RAMS submissions" ON public.rams_submissions;

CREATE POLICY "Users can create RAMS submissions" ON public.rams_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(project_id)
    OR submitted_by = (select auth.uid())
  );

-- 6. audit_logs ─ "Users can view their audit logs"
DROP POLICY IF EXISTS "Users can view their audit logs" ON public.audit_logs;

CREATE POLICY "Users can view their audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.is_admin());
