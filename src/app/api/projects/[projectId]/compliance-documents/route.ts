import { NextResponse } from "next/server";

import { createAuditLog } from "@/lib/audit/audit-log";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { handleAPIError, UnauthorizedError } from "@/lib/error-handling";
import { logger } from "@/lib/logging";
import { chunkText } from "@/lib/documents/chunk-text";
import { extractTextFromFile } from "@/lib/documents/extract-text";
import { validateFile, sanitiseFilename } from "@/lib/documents/file-validation";

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

    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const category = formData.get("category") as string;

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
    const safeName = sanitiseFilename(file.name);
    const storagePath = `${projectId}/compliance-docs/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    const { data: signedUrlData } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, 60 * 60);

    const { data: document, error: insertError } = await supabase
      .from("compliance_documents")
      .insert({
        project_id: projectId,
        file_name: file.name,
        file_type: validation.normalisedFileType,
        file_size: file.size,
        file_url: signedUrlData?.signedUrl ?? null,
        storage_path: storagePath,
        document_category: category,
        extraction_status: "processing",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    try {
      const extractionResult = await extractTextFromFile(fileBuffer, file.type, file.name);

      const { error: updateError } = await supabase
        .from("compliance_documents")
        .update({
          extracted_text: extractionResult.extractedText ?? null,
          extraction_status: extractionResult.status === "complete" ? "complete" : "failed",
          extraction_confidence: extractionResult.confidence,
        })
        .eq("id", document.id);

      if (updateError) {
        logger.error("Failed to update document with extraction results", { error: String(updateError) });
      }

      if (extractionResult.extractedText) {
        const chunks = chunkText(extractionResult.extractedText);
        const chunkRecords = chunks.map((chunk) => ({
          document_id: document.id,
          chunk_text: chunk.text,
          chunk_index: chunk.index,
        }));

        const { error: chunksError } = await supabase
          .from("document_chunks")
          .insert(chunkRecords);

        if (chunksError) {
          logger.error("Failed to create document chunks", { error: String(chunksError) });
        }
      }

      await createAuditLog("UPLOAD_COMPLIANCE_DOCUMENT", "compliance_document", document.id, {
        userId: user.id,
        details: {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          extractionStatus: extractionResult.status,
          extractionConfidence: extractionResult.confidence,
        },
      });

      return NextResponse.json(
        {
          ...document,
          extracted_text: extractionResult.extractedText,
          extraction_status: extractionResult.status === "complete" ? "complete" : "failed",
          extraction_confidence: extractionResult.confidence,
          requires_manual_review: extractionResult.requiresManualReview,
          issues: extractionResult.issues,
        },
        { status: 201 }
      );
    } catch (error) {
      await supabase
        .from("compliance_documents")
        .update({ extraction_status: "failed" })
        .eq("id", document.id);

      return NextResponse.json(
        { ...document, extraction_status: "failed", error: "Text extraction failed" },
        { status: 201 }
      );
    }
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

    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: documents, error } = await supabase
      .from("compliance_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const documentsWithUrls = await Promise.all(
      (documents ?? []).map(async (doc) => {
        const { data: signedUrlData } = await supabase.storage
          .from("documents")
          .createSignedUrl(doc.storage_path, 60 * 60);
        return { ...doc, file_url: signedUrlData?.signedUrl ?? null };
      })
    );

    return NextResponse.json(documentsWithUrls, { status: 200 });
  } catch (error) {
    logger.error("Error fetching documents", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
