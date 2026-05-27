-- Soft-delete RLS hardening
--
-- Ensures that regular users cannot see soft-deleted profiles.
-- Only admins can see deleted profiles (for recovery purposes).
-- This complements the soft-delete columns added in 202605270001_soft_delete_accounts.sql

-- Replace the overly permissive "Users can view all profiles" policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view active profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

-- Note: The existing "Users can update own profile" policy remains unchanged.
-- Soft-deleted users should not be able to update their profile anyway (they are signed out).

COMMENT ON POLICY "Users can view active profiles" ON public.profiles IS
  'Regular users can only see active (non-deleted) profiles. Admins can see all profiles for recovery purposes.';
