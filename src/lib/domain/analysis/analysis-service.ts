import { createServerSupabase } from "@/lib/db/supabase-server";
import { createAuditLog } from "@/lib/audit/audit-log";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service layer for the new compliant AnalysisRun + Finding + Decision model.
 * AnalysisRuns are intended to be immutable snapshots of AI output.
 * Decisions are the human final record and cause related Findings to become read-only.
 */

export interface CreateAnalysisRunInput {
  submissionId: string;
  runNumber?: number;
  aiModel?: string;
  promptVersion?: string;
  overallScore?: number;
  summary?: string;
  createdBy?: string;
}

export async function createAnalysisRun(input: CreateAnalysisRunInput) {
  const supabase = await createServerSupabase();

  const runNumber = input.runNumber ?? (await getNextRunNumber(supabase, input.submissionId));

  const { data, error } = await supabase
    .from("analysis_runs")
    .insert({
      submission_id: input.submissionId,
      run_number: runNumber,
      status: "complete",
      ai_model: input.aiModel,
      prompt_version: input.promptVersion,
      overall_score: input.overallScore,
      summary: input.summary,
      created_by: input.createdBy ?? null,
      completed_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create AnalysisRun: ${error?.message}`);
  }

  await createAuditLog("CREATE_ANALYSIS_RUN", "analysis_run", data.id, {
    userId: input.createdBy,
    details: { submissionId: input.submissionId, runNumber },
  });

  return data;
}

async function getNextRunNumber(supabase: SupabaseClient, submissionId: string): Promise<number> {
  const { data } = await supabase.rpc("next_analysis_run_number", { p_submission_id: submissionId });
  return (data as number) ?? 1;
}

export interface CreateFindingInput {
  analysisRunId: string;
  requirementId: string;
  status: string;
  severity?: string;
  score?: number;
  ramsEvidence?: string;
  explanation?: string;
  confidenceScore?: number;
  evidenceQuote?: string;
  sourceChunkId?: string;
}

export async function createFindings(runId: string, findings: CreateFindingInput[]) {
  const supabase = await createServerSupabase();

  if (!findings.length) return [];

  const rows = findings.map((f) => ({
    analysis_run_id: runId,
    requirement_id: f.requirementId,
    status: f.status,
    severity: f.severity,
    score: f.score,
    rams_evidence: f.ramsEvidence,
    explanation: f.explanation,
    confidence_score: f.confidenceScore,
    evidence_quote: f.evidenceQuote,
    source_chunk_id: f.sourceChunkId,
  }));

  const { data, error } = await supabase.from("findings").insert(rows).select("*");

  if (error) {
    throw new Error(`Failed to create Findings: ${error.message}`);
  }

  return data ?? [];
}

export interface RecordDecisionInput {
  submissionId: string;
  analysisRunId?: string;
  decisionStatus: "approved" | "rejected" | "manual_review";
  decidedBy: string;
  explanation?: string;
  thresholdUsed?: number;
}

export async function recordDecision(input: RecordDecisionInput) {
  const supabase = await createServerSupabase();

  // Create the decision (trigger will lock findings for the run)
  const { data, error } = await supabase
    .from("decisions")
    .insert({
      submission_id: input.submissionId,
      analysis_run_id: input.analysisRunId ?? null,
      decision_status: input.decisionStatus,
      decided_by: input.decidedBy,
      explanation: input.explanation,
      threshold_used: input.thresholdUsed,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to record Decision: ${error?.message}`);
  }

  // Also keep legacy fields on submission for UI compat (can be removed later)
  await supabase
    .from("rams_submissions")
    .update({
      review_status: input.decisionStatus,
      decision_explanation: input.explanation,
      reviewed_for_cdm: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.submissionId);

  await createAuditLog("RECORD_DECISION", "submission", input.submissionId, {
    userId: input.decidedBy,
    details: {
      decisionStatus: input.decisionStatus,
      analysisRunId: input.analysisRunId,
      explanation: input.explanation,
    },
  });

  return data;
}

export async function getAnalysisRunsForSubmission(submissionId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("analysis_runs")
    .select("*, findings(*)")
    .eq("submission_id", submissionId)
    .order("run_number", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getDecisionForSubmission(submissionId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("decisions")
    .select("* , profiles:decided_by (email, full_name)")
    .eq("submission_id", submissionId)
    .maybeSingle();
  return data;
}
