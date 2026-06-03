import { createServerSupabase } from "@/lib/db/supabase-server";
import { createAuditLog } from "@/lib/audit/audit-log";

/**
 * Submission (RAMS) service updates for the refactored model.
 * Submissions can have multiple immutable AnalysisRuns.
 * Extracted text should be moved to ExtractedDocument for immutability.
 */

export async function attachExtractedDocument(submissionId: string, extractedText: string, method = "server-extract") {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("extracted_documents")
    .insert({
      submission_id: submissionId,
      extracted_text: extractedText,
      char_count: extractedText.length,
      extraction_method: method,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to attach ExtractedDocument: ${error.message}`);

  // Optionally clear or keep legacy extracted_text on rams_submissions for compat.
  await createAuditLog("ATTACH_EXTRACTED_DOCUMENT", "submission", submissionId, {
    details: { extractedDocumentId: data.id, method },
  });

  return data;
}

export async function createSubmission(projectId: string, payload: Record<string, unknown>) {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("rams_submissions")
    .insert({ project_id: projectId, ...payload })
    .select("*")
    .single();

  if (error) throw error;

  await createAuditLog("CREATE_SUBMISSION", "submission", data.id, {
    details: { projectId },
  });

  return data;
}
