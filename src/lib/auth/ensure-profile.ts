import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import { logger } from "@/lib/logging";
import type { UserRole } from "./roles";

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
}

/**
 * Defensive safety net for profile creation.
 *
 * The primary creation path is the on_auth_user_created Postgres trigger.
 * This function exists for users who were created before the trigger was
 * applied and therefore have no row in public.profiles. It is called only
 * after a normal SELECT on profiles returns nothing.
 *
 * Uses the service-role client to bypass RLS: there is intentionally no
 * INSERT policy on profiles for regular users, so only SECURITY DEFINER
 * paths (the trigger and this server-only helper) can create profile rows.
 */
export async function ensureProfile(
  userId: string,
  email?: string | null,
  fullName?: string | null
): Promise<ProfileRow | null> {
  const admin = getSupabaseAdmin();

  // First try to read the profile — it may already exist (e.g. created by the
  // trigger between the route's initial read and this call, or soft-deleted).
  const { data: existing, error: readError } = await admin
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .single();

  if (existing) {
    return existing as ProfileRow;
  }

  // PGRST116 = "no rows found" — expected when profile is genuinely missing.
  // Any other error is unexpected and should not be silently swallowed.
  if (readError && readError.code !== "PGRST116") {
    logger.error("Unexpected error reading profile in ensureProfile", {
      userId,
      error: readError.message,
      code: readError.code,
    });
    return null;
  }

  // If auth.getUser() did not provide an email (rare, but can happen in some
  // provider/account states), resolve it via admin API so profile creation is
  // still reliable and idempotent.
  let resolvedEmail = email?.trim().toLowerCase();
  if (!resolvedEmail) {
    const { data: authUserResult, error: authUserError } = await admin.auth.admin.getUserById(userId);
    if (authUserError) {
      logger.error("Failed to resolve auth user email in ensureProfile", {
        userId,
        error: authUserError.message,
      });
      return null;
    }

    resolvedEmail = authUserResult.user.email?.trim().toLowerCase();
  }

  if (!resolvedEmail) {
    logger.error("Cannot create profile without email", { userId });
    return null;
  }

  // Profile doesn't exist — create it with safe defaults.
  logger.warn("Profile missing for authenticated user; creating via ensureProfile", {
    userId,
    email: resolvedEmail,
  });

  const { data: created, error: insertError } = await admin
    .from("profiles")
    .insert({
      id: userId,
      email: resolvedEmail,
      full_name: fullName ?? null,
      // Use 'viewer' as the safest default; admins can promote roles via the UI.
      role: "viewer" as UserRole,
    })
    .select("id, email, full_name, role")
    .single();

  if (insertError) {
    // Handle the race where another concurrent request already inserted the row.
    if (insertError.code === "23505") {
      const { data: raceWinner } = await admin
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("id", userId)
        .single();
      return (raceWinner as ProfileRow | null) ?? null;
    }

    logger.error("Failed to create profile via ensureProfile", {
      userId,
      error: insertError.message,
    });
    return null;
  }

  return created as ProfileRow;
}
