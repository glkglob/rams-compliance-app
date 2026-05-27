import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/db/supabase-server";
import { getSupabaseAdmin } from "@/lib/db/supabase-admin";
import { canManageProject } from "@/lib/auth/permissions";
import { handleAPIError, UnauthorizedError } from "@/lib/error-handling";
import { createAuditLog } from "@/lib/audit/audit-log";
import { logger } from "@/lib/logging";
import { sendEmail } from "@/lib/email/resend";

type Context = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, { params }: Context) {
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

    const canManage = await canManageProject(projectId);
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email, role = "viewer" } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Find user by email using admin client (bypasses RLS for lookup)
    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .eq("email", email.toLowerCase())
      .single();

    if (!profile) {
      // User doesn't exist yet - for Phase 1 we can still "invite" conceptually
      // but for now, require the user to have an account.
      return NextResponse.json(
        { error: "No account found with this email. User must sign up first." },
        { status: 404 }
      );
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", profile.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: "User is already a member of this project" }, { status: 400 });
    }

    // Add to project
    const { error: insertError } = await supabase.from("project_members").insert({
      project_id: projectId,
      user_id: profile.id,
      role,
    });

    if (insertError) {
      logger.error("Failed to add project member", { error: insertError.message, projectId });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    // Audit
    await createAuditLog("INVITE_PROJECT_MEMBER", "project", projectId, {
      userId: user.id,
      details: {
        invitedUserId: profile.id,
        invitedEmail: profile.email,
        role,
      },
    });

    // Send invitation email (best effort)
    try {
      await sendEmail(
        profile.email,
        `You've been invited to a project on RAMS Compliance`,
        `Hello ${profile.full_name || ""},\n\n` +
          `You have been added to a project on the RAMS Compliance platform.\n\n` +
          `Please log in to view the project details.\n\n` +
          `https://www.rams-compliance.com/projects`
      );
    } catch (emailErr) {
      console.warn("Failed to send invite email:", emailErr);
    }

    return NextResponse.json({ success: true, user: profile }, { status: 201 });
  } catch (error) {
    return handleAPIError(error);
  }
}
