import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit/audit-log";
import { hasPermission } from "@/lib/auth/roles";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { handleAPIError, UnauthorizedError, ForbiddenError } from "@/lib/error-handling";
import { toProjectUpdate } from "@/lib/projects/project-mappers";
import { updateProjectSchema } from "@/lib/validations/project.schema";

type ProjectRouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(_request: Request, { params }: ProjectRouteContext) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError();
    }

    const [{ data: membership, error: membershipError }, { data: profile, error: profileError }] =
      await Promise.all([
        supabase
          .from("project_members")
          .select("role")
          .eq("project_id", projectId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("profiles").select("role").eq("id", user.id).single(),
      ]);

    if (membershipError || profileError || !profile) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!membership && profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: project, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project, { status: 200 });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: ProjectRouteContext) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();
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

    if (!hasPermission(profile.role, "manage:projects")) {
      throw new ForbiddenError();
    }

    const body = await request.json();
    const validatedData = updateProjectSchema.parse(body);
    const updatePayload = toProjectUpdate(validatedData);

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No changes submitted" }, { status: 400 });
    }

    const { data: project, error } = await supabase
      .from("projects")
      .update({
        ...updatePayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    createAuditLog("UPDATE_PROJECT", "project", project.id, {
      userId: user.id,
      details: validatedData,
    });

    return NextResponse.json(project, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function DELETE(_request: Request, { params }: ProjectRouteContext) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();
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

    if (profileError || !profile || profile.role !== "admin") {
      throw new ForbiddenError();
    }

    const { error } = await supabase.from("projects").delete().eq("id", projectId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    createAuditLog("DELETE_PROJECT", "project", projectId, {
      userId: user.id,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
