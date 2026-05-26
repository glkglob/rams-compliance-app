import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { generateEmail } from "@/lib/ai/agents/email-generation-agent";
import { checkRateLimit, rateLimitExceeded } from "@/lib/rate-limit";

type Context = { params: Promise<{ ramsId: string }> };

export async function POST(_request: Request, { params }: Context) {
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

    const rl = await checkRateLimit(user.id, 'generate-email');
    if (!rl.allowed) {
      return rateLimitExceeded(rl.resetMs);
    }

    const { data: rams, error: ramsError } = await supabase
      .from("rams_submissions")
      .select("*, projects!inner (name, compliance_threshold)")
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

    const { data: review, error: reviewError } = await supabase
      .from("rams_reviews")
      .select("*, review_checks (*)")
      .eq("rams_submission_id", ramsId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (reviewError || !review) {
      return NextResponse.json(
        { error: "No review found. Run review first." },
        { status: 400 }
      );
    }

    const nonCompliantChecks = (review.review_checks ?? [])
      .filter((c: { status: string }) => c.status === "non_compliant")
      .map((c: { explanation: string }) => c.explanation);

    const emailData = {
      projectName: rams.projects.name,
      subcontractorName: rams.subcontractor_name,
      subcontractorEmail: rams.subcontractor_email ?? undefined,
      complianceScore: review.compliance_score ?? 0,
      threshold: rams.projects.compliance_threshold,
      summary: review.decision_explanation ?? undefined,
      reason: review.decision_explanation ?? undefined,
      corrections: nonCompliantChecks,
    };

    const emailType = review.review_status as "approved" | "rejected" | "manual_review";
    const email = await generateEmail(emailType, emailData);

    const { data: savedEmail, error: saveError } = await supabase
      .from("generated_emails")
      .insert({
        rams_submission_id: ramsId,
        subject: email.subject,
        body: email.body,
        sent: false,
      })
      .select()
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    await supabase
      .from("rams_reviews")
      .update({ email_generated: true })
      .eq("id", review.id);

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "GENERATE_EMAIL",
      entity_type: "rams_submission",
      entity_id: ramsId,
      details: { reviewStatus: review.review_status, subject: email.subject },
    });

    return NextResponse.json(savedEmail, { status: 200 });
  } catch (error) {
    console.error("Error generating email:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
