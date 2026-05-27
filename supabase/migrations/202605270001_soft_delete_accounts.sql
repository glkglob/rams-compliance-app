-- Soft-delete support for account deletion with recovery window.
--
-- profiles: new columns to track when deletion was requested and when
--           permanent removal is scheduled.
-- projects: already has a `status` column (TEXT DEFAULT 'active') —
--           no schema change needed, just new value 'pending_deletion'.

-- 1. Add soft-delete columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at TIMESTAMPTZ;

-- 2. Index for the hard-delete cron job (find accounts past their window)
CREATE INDEX IF NOT EXISTS idx_profiles_hard_delete_due
  ON profiles (scheduled_hard_delete_at)
  WHERE deleted_at IS NOT NULL
    AND scheduled_hard_delete_at IS NOT NULL;

-- 3. Optional: prevent soft-deleted users from appearing in normal queries
--    by adding a WHERE filter to the existing RLS policy.
--    (Soft-deleted profiles should still be visible to admins for recovery.)
COMMENT ON COLUMN profiles.deleted_at IS
  'Set when the user requests account deletion. NULL = active account.';
COMMENT ON COLUMN profiles.scheduled_hard_delete_at IS
  'Timestamp after which permanent deletion should occur (30 days after deleted_at).';
