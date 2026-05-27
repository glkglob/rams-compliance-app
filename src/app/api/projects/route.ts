import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit/audit-log";
import { hasPermission } from "@/lib/auth/roles";
import { logger } from "@/lib/logging";
import { createServerSupabaseWithTimeout } from "@/lib/db/supabase-with-timeout";
import { handleAPIError, UnauthorizedError, ForbiddenError } from "@/lib/error-handling";
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    if (!hasPermission(profile.role, "create:projects")) {
      throw new ForbiddenError();
    }

    const body = await request.json();
    const validatedData = createProjectSchema.parse(body);

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert(toProjectInsert(validatedData, user.id))
      .select("*")
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: projectError?.message ?? "Failed to create project" },
        { status: 500 }
      );
    }

    const { error: memberError } = await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: user.id,
      role: profile.role,
    });

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    if (profile.role === "admin") {
      const { data: projects, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(projects ?? [], { status: 200 });
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    const projectIds = memberships?.map((membership) => membership.project_id) ?? [];

    if (projectIds.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    const { data: projects, error } = await supabase
      .from("projects")
      .select("*")
      .in("id", projectIds)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(projects ?? [], { status: 200 });
  } catch (error) {
    logger.error("Error fetching projects", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
