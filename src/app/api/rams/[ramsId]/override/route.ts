import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "project_manager"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Forbidden – admin or project_manager role required" },
        { status: 403 }
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
      })
      .eq("id", ramsId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
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

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "OVERRIDE_RAMS_REVIEW",
      entity_type: "rams_submission",
      entity_id: ramsId,
      details: {
        previousStatus: rams.review_status,
        newStatus: decision,
        reason,
        overriddenByRole: profile.role,
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error overriding review:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
