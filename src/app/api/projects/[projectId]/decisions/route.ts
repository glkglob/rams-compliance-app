import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { handleAPIError, UnauthorizedError, ForbiddenError } from "@/lib/error-handling";
import { recordDecision, getDecisionForSubmission } from "@/lib/domain/analysis/analysis-service";
import { logger } from "@/lib/logging";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new UnauthorizedError();

    const { data: subs } = await supabase
      .from("rams_submissions")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!subs?.length) return NextResponse.json(null);

    const decision = await getDecisionForSubmission(subs[0].id);
    return NextResponse.json(decision);
  } catch (e) {
    return handleAPIError(e);
  }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new UnauthorizedError();

    // Basic authz: must be project member with reviewer+ role (simplified)
    const body = await req.json();
    const { submissionId, analysisRunId, decisionStatus, explanation } = body;

    if (!submissionId || !decisionStatus) {
      return NextResponse.json({ error: "submissionId and decisionStatus required" }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    const allowed = ["admin", "project_manager", "principal_designer", "principal_contractor", "reviewer"];
    if (!membership || !allowed.includes(membership.role)) {
      throw new ForbiddenError("Insufficient permissions to record decision");
    }

    const decision = await recordDecision({
      submissionId,
      analysisRunId,
      decisionStatus,
      decidedBy: user.id,
      explanation,
    });

    logger.info("Decision recorded", { decisionId: decision.id, submissionId, projectId });

    return NextResponse.json({ decision }, { status: 201 });
  } catch (e) {
    return handleAPIError(e);
  }
}
