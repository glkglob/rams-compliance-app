import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/db/supabase-server";
import { canManageProject } from "@/lib/auth/permissions";
import { handleAPIError, UnauthorizedError } from "@/lib/error-handling";
import { createAuditLog } from "@/lib/audit/audit-log";
import { logger } from "@/lib/logging";

type Context = {
  params: Promise<{
    projectId: string;
    memberId: string;
  }>;
};

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { projectId, memberId } = await params;
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError();
    }

    // Only project managers/admins can remove members
    const canManage = await canManageProject(projectId);
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get the member being removed for audit
    const { data: memberToRemove } = await supabase
      .from("project_members")
      .select("user_id, role")
      .eq("id", memberId)
      .single();

    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("id", memberId)
      .eq("project_id", projectId);

    if (error) {
      logger.error("Failed to remove project member", { error: error.message, projectId, memberId });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    // Log the removal
    await createAuditLog("REMOVE_PROJECT_MEMBER", "project", projectId, {
      userId: user.id,
      details: {
        removedUserId: memberToRemove?.user_id,
        removedRole: memberToRemove?.role,
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { projectId, memberId } = await params;
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError();
    }

    const canManage = await canManageProject(projectId);
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { role } = body;

    if (!role) {
      return NextResponse.json({ error: "Role is required" }, { status: 400 });
    }

    // Get current member for audit
    const { data: currentMember } = await supabase
      .from("project_members")
      .select("user_id, role")
      .eq("id", memberId)
      .single();

    const { data: updated, error } = await supabase
      .from("project_members")
      .update({ role })
      .eq("id", memberId)
      .eq("project_id", projectId)
      .select()
      .single();

    if (error) {
      logger.error("Failed to update member role", { error: error.message, projectId, memberId });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    await createAuditLog("UPDATE_PROJECT_MEMBER_ROLE", "project", projectId, {
      userId: user.id,
      details: {
        memberUserId: currentMember?.user_id,
        oldRole: currentMember?.role,
        newRole: role,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
