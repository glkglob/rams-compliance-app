import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  ensureProfile as _ensureProfile,
  type ProfileRow,
} from "@/lib/auth/ensure-profile";

export type { ProfileRow };

/**
 * Defensive profile guarantee for API routes.
 *
 * Wraps the underlying ensureProfile helper with a `{ user, supabase }` call
 * signature so routes can resolve a profile in one call without having to
 * destructure user fields themselves.
 *
 * The `supabase` argument is accepted for call-site symmetry with the rest of
 * the route pattern (where the caller already holds a server client), but
 * profile writes always use the service-role admin client to bypass RLS.
 */
export async function ensureProfile({
  user,
}: {
  user: User;
  supabase: SupabaseClient;
}): Promise<ProfileRow | null> {
  return _ensureProfile(
    user.id,
    user.email,
    user.user_metadata?.full_name as string | undefined,
  );
}
