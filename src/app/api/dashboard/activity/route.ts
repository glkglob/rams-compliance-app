import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/db/supabase-server";
import { handleAPIError, internalServerErrorResponse, UnauthorizedError } from "@/lib/error-handling";
import { isAdminRole } from "@/lib/auth/roles";
import { logger } from "@/lib/logging";
import { ensureProfile } from "@/lib/profiles/ensure-profile";

export interface ActivityEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at?: string;
  occurred_at?: string;
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

    const { data: rawProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const profile = rawProfile ?? (await ensureProfile({ user, supabase }));

    let query = supabase
      .from("audit_events")
      .select("id, action, entity_type, entity_id, details, occurred_at, created_at")
      .order("occurred_at", { ascending: false })
      .limit(10);

    // Non-admins only see activity on their own projects
    if (!isAdminRole(profile?.role)) {
      const { data: memberships } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id);

      const projectIds = memberships?.map((m: { project_id: string }) => m.project_id) ?? [];

      if (projectIds.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

      // Filter to logs where actor_id is themselves OR entity relates to their projects
      query = query.eq("actor_id", user.id);
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
