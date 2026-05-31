import { createServerSupabase } from "@/lib/db/supabase-server";
import type { UserRole } from "./roles";
import { hasPermission } from "./roles";
import { ensureProfile } from "./ensure-profile";

/**
 * Centralized permission service for Phase 1.
 *
 * Combines:
 * - Role-based permissions (from roles.ts)
 * - Project-scoped checks via database functions (RLS-aware)
 *
 * All application-level authorization should go through this module.
 */

export async function getCurrentUserRole(): Promise<UserRole | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profileError && profile?.role) {
    return profile.role as UserRole;
  }

  const ensuredProfile = await ensureProfile(
    user.id,
    user.email,
    user.user_metadata?.full_name as string | undefined
  );
  return ensuredProfile?.role ?? null;
}

/**
 * Check if the current user has a global permission.
 */
export async function hasGlobalPermission(permission: string): Promise<boolean> {
  const role = await getCurrentUserRole();
  if (!role) return false;
  return hasPermission(role, permission);
}

/**
 * Check if current user can manage a specific project
 * (CDM management roles or legacy project_manager on that project).
 */
export async function canManageProject(projectId: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("can_manage_project", {
    target_project_id: projectId,
  });

  if (error) {
    console.error("canManageProject RPC error:", error);
    return false;
  }

  return !!data;
}

/**
 * Check if current user can view a specific project.
 */
export async function canViewProject(projectId: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("is_project_member", {
    target_project_id: projectId,
  });

  if (error) {
    console.error("canViewProject RPC error:", error);
    return false;
  }

  return !!data;
}

/**
 * Check if current user is an admin.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("is_admin");

  if (error) {
    console.error("isAdmin RPC error:", error);
    return false;
  }

  return !!data;
}

/**
 * Check if current user can review a specific project.
 */
export async function canReviewProject(projectId: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("can_review_project", {
    target_project_id: projectId,
  });

  if (error) {
    console.error("canReviewProject RPC error:", error);
    return false;
  }

  return !!data;
}

/**
 * Helper to require a permission or throw.
 * Useful in API routes.
 */
export async function requirePermission(permission: string) {
  const allowed = await hasGlobalPermission(permission);
  if (!allowed) {
    throw new Error(`Missing required permission: ${permission}`);
  }
}

/**
 * Helper to require project management rights or throw.
 */
export async function requireCanManageProject(projectId: string) {
  const allowed = await canManageProject(projectId);
  if (!allowed) {
    throw new Error("Insufficient permissions to manage this project");
  }
}
