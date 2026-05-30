-- Grant application owner/admin access.
--
-- d.krissolo@icloud.com owns/administers the RAMS Compliance App and must retain
-- full privileges. This migration is idempotent and only targets that user.

WITH target_user AS (
  SELECT
    u.id,
    u.email,
    u.raw_user_meta_data->>'full_name' AS full_name
  FROM auth.users u
  WHERE lower(u.email) = 'd.krissolo@icloud.com'
)
INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  id,
  email,
  full_name,
  'admin'::public.user_role
FROM target_user
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
  role = 'admin'::public.user_role;
