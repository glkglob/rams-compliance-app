import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { extractTextFromFile } from "@/lib/documents/extract-text";
import { chunkText } from "@/lib/documents/chunk-text";
import { getMimeTypeForFileType } from "@/lib/documents/file-validation";

type ExtractRouteContext = {
  params: Promise<{ documentId: string }>;
};

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

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.storage_path);

    if (downloadError || !fileData) {
      return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());
    const mimeType = getMimeTypeForFileType(document.file_type);
    const extractionResult = await extractTextFromFile(fileBuffer, mimeType, document.file_name);

    const { error: updateError } = await supabase
      .from("compliance_documents")
      .update({
        extracted_text: extractionResult.extractedText ?? null,
        extraction_status: extractionResult.status === "complete" ? "complete" : "failed",
        extraction_confidence: extractionResult.confidence,
      })
      .eq("id", documentId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (extractionResult.extractedText) {
      await supabase.from("document_chunks").delete().eq("document_id", documentId);

      const chunks = chunkText(extractionResult.extractedText);
      const chunkRecords = chunks.map((chunk) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        chunk_index: chunk.index,
      }));

      await supabase.from("document_chunks").insert(chunkRecords);
    }

    return NextResponse.json(
      {
        ...document,
        extracted_text: extractionResult.extractedText,
        extraction_status: extractionResult.status === "complete" ? "complete" : "failed",
        extraction_confidence: extractionResult.confidence,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error re-extracting text:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
