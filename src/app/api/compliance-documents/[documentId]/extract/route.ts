import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { canManageProject } from "@/lib/auth/permissions";
import { internalServerErrorResponse } from "@/lib/error-handling";
import { logger } from "@/lib/logging";
import { enqueueDocumentProcessing, isQStashConfigured } from "@/lib/jobs/document-queue";

export const maxDuration = 300;

type ExtractRouteContext = {
  params: Promise<{ documentId: string }>;
};

/**
 * Re-run the async processing pipeline for an existing document (e.g. after a
 * previous failure). Creates a fresh processing job and enqueues it via QStash;
 * the heavy work happens in /api/process-document, not here.
 */
export async function POST(_request: Request, { params }: ExtractRouteContext) {
  try {
    const { documentId } = await params;
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: document, error: docError } = await supabase
      .from("compliance_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const canManage = await canManageProject(document.project_id);
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Idempotency: if a job is already queued or running for this document, don't
    // create a duplicate — just report the in-flight job back to the caller.
    const { data: activeJob } = await supabase
      .from("document_processing_jobs")
      .select("id, status")
      .eq("document_id", documentId)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeJob) {
      return NextResponse.json(
        { ...document, extraction_status: "pending", job_id: activeJob.id, job_status: activeJob.status },
        { status: 202 }
      );
    }

    await supabase
      .from("compliance_documents")
      .update({ extraction_status: "pending" })
      .eq("id", documentId);

    const { data: job, error: jobError } = await supabase
      .from("document_processing_jobs")
      .insert({ document_id: documentId, status: "pending" })
      .select()
      .single();

    if (jobError || !job) {
      logger.error("Failed to create re-processing job", { error: jobError?.message });
      return internalServerErrorResponse();
    }

    if (isQStashConfigured()) {
      try {
        await enqueueDocumentProcessing({
          documentId,
          jobId: job.id,
          projectId: document.project_id,
        });
      } catch (error) {
        logger.error("Failed to enqueue re-processing", {
          documentId,
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      logger.warn("QStash not configured — document left pending", { documentId, jobId: job.id });
    }

    return NextResponse.json(
      { ...document, extraction_status: "pending", job_id: job.id, job_status: job.status },
      { status: 202 }
    );
  } catch (error) {
    logger.error("Error re-extracting text", { error: error instanceof Error ? error.message : String(error) });
    return internalServerErrorResponse();
  }
}
