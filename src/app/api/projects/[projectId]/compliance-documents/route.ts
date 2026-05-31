import { NextResponse } from "next/server";

import { createAuditLog } from "@/lib/audit/audit-log";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { canManageProject } from "@/lib/auth/permissions";
import { handleAPIError, internalServerErrorResponse, UnauthorizedError } from "@/lib/error-handling";
import { logger } from "@/lib/logging";
import { validateFile } from "@/lib/documents/file-validation";
import { getDocumentSignedUrl } from "@/lib/documents/storage";
import { enqueueDocumentProcessing, isQStashConfigured } from "@/lib/jobs/document-queue";
import { complianceDocumentCdmMetadataFromFormData } from "@/lib/cdm/metadata";

export const maxDuration = 300;

type ProjectDocsContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, { params }: ProjectDocsContext) {
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const category = formData.get("category") as string;
    const cdmMetadata = complianceDocumentCdmMetadataFromFormData(formData);

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const validation = validateFile(file.name, file.type, file.size);
    if (!validation.isSupported) {
      return NextResponse.json(
        { error: "File validation failed", issues: validation.issues },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '_')
      .slice(0, 200);
    const storagePath = `${projectId}/compliance-docs/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      logger.error("Supabase storage upload failed", {
        error: uploadError.message,
        statusCode: (uploadError as { statusCode?: number }).statusCode,
        storagePath,
        bucket: "documents",
      });
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    // Persist only the storage_path — signed URLs are minted on demand (GET)
    // so we never store a stale, short-lived URL.
    const { data: document, error: insertError } = await supabase
      .from("compliance_documents")
      .insert({
        project_id: projectId,
        file_name: file.name,
        file_type: validation.normalisedFileType,
        file_size: file.size,
        file_url: null,
        storage_path: storagePath,
        document_category: category,
        extraction_status: "pending",
        ...cdmMetadata,
      })
      .select()
      .single();

    if (insertError) {
      logger.error("Failed to insert compliance document", { error: insertError.message });
      return internalServerErrorResponse();
    }

    // Create a processing job and hand the heavy work off to the background
    // worker via QStash. Nothing CPU-bound runs in this request.
    const { data: job, error: jobError } = await supabase
      .from("document_processing_jobs")
      .insert({ document_id: document.id, status: "pending" })
      .select()
      .single();

    if (jobError || !job) {
      logger.error("Failed to create processing job", { error: jobError?.message });
      return internalServerErrorResponse();
    }

    if (isQStashConfigured()) {
      try {
        await enqueueDocumentProcessing({
          documentId: document.id,
          jobId: job.id,
          projectId,
        });
      } catch (error) {
        // The upload succeeded; leave the job `pending` so it can be retried.
        logger.error("Failed to enqueue document processing", {
          documentId: document.id,
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      logger.warn("QStash not configured — document left pending", {
        documentId: document.id,
        jobId: job.id,
      });
    }

    await createAuditLog("UPLOAD_COMPLIANCE_DOCUMENT", "compliance_document", document.id, {
      userId: user.id,
      details: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      },
    });

    return NextResponse.json(
      { ...document, job_id: job.id, job_status: job.status },
      { status: 201 }
    );
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function GET(_request: Request, { params }: ProjectDocsContext) {
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

    const { data: documents, error } = await supabase
      .from("compliance_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to fetch compliance documents", { error: error.message });
      return internalServerErrorResponse();
    }

    const documentsWithUrls = await Promise.all(
      (documents ?? []).map(async (doc: { storage_path: string; [key: string]: unknown }) => ({
        ...doc,
        file_url: await getDocumentSignedUrl(supabase, doc.storage_path),
      }))
    );

    return NextResponse.json(documentsWithUrls, { status: 200 });
  } catch (error) {
    logger.error("Error fetching documents", { error: error instanceof Error ? error.message : String(error) });
    return internalServerErrorResponse();
  }
}
