import { NextResponse } from "next/server";

import { createAuditLog } from "@/lib/audit/audit-log";
import { hasPermission } from "@/lib/auth/roles";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { logger } from "@/lib/logging";
import { createServerSupabaseWithTimeout } from "@/lib/db/supabase-with-timeout";
import { handleAPIError, internalServerErrorResponse, UnauthorizedError, ForbiddenError } from "@/lib/error-handling";
import { toProjectInsert } from "@/lib/projects/project-mappers";
import { createProjectSchema } from "@/lib/validations/project.schema";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseWithTimeout(6000);
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
    const profile =
      !profileError && rawProfile
        ? rawProfile
        : await ensureProfile(user.id, user.email ?? "", user.user_metadata?.full_name as string | undefined);

    if (!profile) {
      logger.warn("Profile not found for project creation", { userId: user.id });
      throw new ForbiddenError("Unable to verify permissions for project creation.");
    }

    if (!hasPermission(profile.role, "create:projects")) {
      logger.warn("Project creation denied", { role: profile.role, userId: user.id });
      // Generic message to avoid leaking the user's internal role value to the client.
      throw new ForbiddenError("You do not have permission to create projects.");
    }

    const body = await request.json();
    const validatedData = createProjectSchema.parse(body);

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert(toProjectInsert(validatedData, user.id))
      .select("*")
      .single();

    if (projectError || !project) {
      logger.error("Failed to create project", { error: projectError?.message });
      return NextResponse.json(
        { error: "Failed to create project" },
        { status: 500 }
      );
    }

    const { error: memberError } = await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: user.id,
      role: profile.role,
    });

    if (memberError) {
      logger.error("Failed to add project member", { error: memberError.message });
      return internalServerErrorResponse();
    }

    // Centralized audit helper (never blocks the response)
    await createAuditLog("CREATE_PROJECT", "project", project.id, {
      userId: user.id,
      details: validatedData,
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseWithTimeout(6000);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: rawProfile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // Defensive fallback for users whose profile wasn't created by the trigger.
    const profile =
      !profileError && rawProfile
        ? rawProfile
        : await ensureProfile(user.id, user.email ?? "", user.user_metadata?.full_name as string | undefined);

    if (!profile) {
      return NextResponse.json({ error: "Unable to load user profile" }, { status: 403 });
    }

    if (profile.role === "admin") {
      const { data: projects, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        logger.error("Failed to fetch projects", { error: error.message });
        return internalServerErrorResponse();
      }

      return NextResponse.json(projects ?? [], { status: 200 });
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    if (membershipError) {
      logger.error("Failed to fetch memberships", { error: membershipError.message });
      return internalServerErrorResponse();
    }

    const projectIds = memberships?.map((membership: { project_id: string }) => membership.project_id) ?? [];

    if (projectIds.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    const { data: projects, error } = await supabase
      .from("projects")
      .select("*")
      .in("id", projectIds)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to fetch projects", { error: error.message });
      return internalServerErrorResponse();
    }

    return NextResponse.json(projects ?? [], { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
