import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit/audit-log";
import { OVERRIDE_ALLOWED_ROLES } from "@/lib/auth/roles";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { handleAPIError, UnauthorizedError, ForbiddenError } from "@/lib/error-handling";
import { logger } from "@/lib/logging";
import { z } from "zod";

const overrideSchema = z.object({
  decision: z.enum(["approved", "rejected", "manual_review"]),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

type Context = { params: Promise<{ ramsId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { ramsId } = await params;
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new UnauthorizedError();
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // CDM 2015: principal_designer and principal_contractor share override rights
    // with admin and the legacy project_manager role.
    if (!profile || !(OVERRIDE_ALLOWED_ROLES as readonly string[]).includes(profile.role)) {
      throw new ForbiddenError(
        "Forbidden – admin, principal_designer, or principal_contractor role required"
      );
    }

    const body = await request.json();
    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { decision, reason } = parsed.data;

    const { data: rams, error: ramsError } = await supabase
      .from("rams_submissions")
      .select("review_status, compliance_score, project_id")
      .eq("id", ramsId)
      .single();

    if (ramsError || !rams) {
      return NextResponse.json({ error: "RAMS not found" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", rams.project_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from("rams_submissions")
      .update({
        review_status: decision,
        decision_explanation: `[MANUAL OVERRIDE] ${reason}`,
        reviewed_for_cdm: true,
      })
      .eq("id", ramsId);

    if (updateError) {
      logger.error("Failed to update RAMS override", { error: updateError.message, ramsId });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    await supabase.from("rams_reviews").insert({
      rams_submission_id: ramsId,
      review_status: decision,
      compliance_score: rams.compliance_score ?? 0,
      confidence_score: 1.0,
      decision_explanation: `[MANUAL OVERRIDE by ${profile.role}] ${reason}`,
      reviewed_by: user.id,
      email_generated: false,
      email_sent: false,
    });

    await createAuditLog("OVERRIDE_RAMS_REVIEW", "rams_submission", ramsId, {
      userId: user.id,
      details: {
        previousStatus: rams.review_status,
        newStatus: decision,
        reason,
        overriddenByRole: profile.role,
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
