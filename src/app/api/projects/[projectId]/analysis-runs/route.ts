import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { handleAPIError, UnauthorizedError } from "@/lib/error-handling";
import { createAnalysisRun, createFindings, getAnalysisRunsForSubmission } from "@/lib/domain/analysis/analysis-service";
import { logger } from "@/lib/logging";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new UnauthorizedError();

    // For demo: find latest submission in project and return its runs
    const { data: subs } = await supabase
      .from("rams_submissions")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!subs?.length) return NextResponse.json([]);

    const runs = await getAnalysisRunsForSubmission(subs[0].id);
    return NextResponse.json(runs);
  } catch (e) {
    return handleAPIError(e);
  }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const body = await req.json();
    // Basic payload for creating a run (in real flow this would be called from orchestrator after AI)
    const { submissionId, overallScore, summary, findings = [] } = body;

    if (!submissionId) {
      return NextResponse.json({ error: "submissionId required" }, { status: 400 });
    }

    const run = await createAnalysisRun({
      submissionId,
      overallScore,
      summary,
      createdBy: user.id,
    });

    if (Array.isArray(findings) && findings.length) {
      await createFindings(run.id, findings);
    }

    logger.info("AnalysisRun created via API", { runId: run.id, projectId, submissionId });

    return NextResponse.json({ run }, { status: 201 });
  } catch (e) {
    return handleAPIError(e);
  }
}
