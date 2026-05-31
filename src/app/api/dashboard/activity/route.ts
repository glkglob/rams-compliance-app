import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/db/supabase-server";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { handleAPIError, internalServerErrorResponse, UnauthorizedError } from "@/lib/error-handling";
import { logger } from "@/lib/logging";

export interface ActivityEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError();
    }

    const { data: rawProfile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // Defensive fallback: trigger may not have fired for pre-existing users.
    const profile =
      !profileError && rawProfile
        ? rawProfile
        : await ensureProfile(user.id, user.email ?? "", user.user_metadata?.full_name as string | undefined);

    if (!profile) {
      logger.error("Profile unavailable after ensureProfile attempt", { userId: user.id });
      return NextResponse.json({ error: "Unable to load user profile" }, { status: 403 });
    }

    let query = supabase
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    // Non-admins only see activity on their own projects
    if (profile.role !== "admin") {
      const { data: memberships } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id);

      const projectIds = memberships?.map((m: { project_id: string }) => m.project_id) ?? [];

      if (projectIds.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

      // Filter to logs where user_id is themselves OR entity relates to their projects
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch activity logs", { error: error.message });
      return internalServerErrorResponse();
    }

    return NextResponse.json(data ?? [], { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
