-- Add 'user' role to support regular authenticated users who can create their own projects.
-- This complements the RLS policy update that allows any authenticated user to INSERT projects.
--
-- Existing roles remain: admin, project_manager, reviewer, viewer (default).
-- 'user' is treated similarly to a basic authenticated user with create + view permissions.

-- Add the new enum value (safe if already exists in some envs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'user'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'user';
  END IF;
END $$;

-- Note: After this migration, you may need to update any profiles that should use 'user'
-- via UPDATE public.profiles SET role = 'user' WHERE ... ;
-- The application code (roles.ts) now recognizes 'user' for create:projects etc.
