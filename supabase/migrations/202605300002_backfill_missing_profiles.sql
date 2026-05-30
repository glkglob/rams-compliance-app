-- Backfill missing profiles and harden the profile-creation trigger.
--
-- Root cause: users who signed up before the on_auth_user_created trigger
-- was applied to the live database have no row in public.profiles. All API
-- routes that query profiles return 403 "Profile not found" for these users.
--
-- Two-part fix:
--   1. Harden the trigger function with ON CONFLICT DO NOTHING so re-runs
--      and edge cases (e.g. email confirmation re-inserts) never fail.
--   2. Backfill a profile row for every auth.users entry that currently
--      has no corresponding profiles row.

-- ============================================================
-- 1. Harden handle_new_user trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _role user_role := 'viewer';
BEGIN
  -- Safely cast the role from metadata; fall back to 'viewer' on any
  -- invalid value (e.g. an enum label that doesn't exist yet).
  BEGIN
    _role := COALESCE(
      (NEW.raw_user_meta_data->>'role')::user_role,
      'viewer'::user_role
    );
  EXCEPTION WHEN invalid_text_representation THEN
    _role := 'viewer'::user_role;
  END;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    _role
  )
  -- Idempotent: a duplicate insert (e.g. trigger re-applied) is silently ignored.
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. Backfill: create profile rows for pre-existing auth users
-- ============================================================
-- Migrations run as the database superuser and bypass RLS, so no INSERT
-- policy on profiles is needed here.
INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  u.id,
  u.email,
  u.raw_user_meta_data->>'full_name',
  'viewer'::user_role          -- safe default; admins can promote roles afterwards
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
  AND u.email IS NOT NULL;
