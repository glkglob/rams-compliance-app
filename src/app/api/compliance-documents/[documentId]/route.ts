import { NextResponse } from "next/server";

import { createAuditLog } from "@/lib/audit/audit-log";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { logger } from "@/lib/logging";
import { handleAPIError, internalServerErrorResponse, UnauthorizedError } from "@/lib/error-handling";

type DocumentRouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function DELETE(_request: Request, { params }: DocumentRouteContext) {
  try {
    const { documentId } = await params;
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new UnauthorizedError();
    }

    const { data: document, error: docError } = await supabase
      .from("compliance_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { error: storageError } = await supabase.storage
      .from("documents")
      .remove([document.storage_path]);

    if (storageError) {
      logger.error("Failed to delete from storage", { error: String(storageError) });
    }

    const { error: deleteError } = await supabase
      .from("compliance_documents")
      .delete()
      .eq("id", documentId);

    if (deleteError) {
      logger.error("Failed to delete compliance document", { error: deleteError.message, documentId });
      return internalServerErrorResponse();
    }

    // Use centralized audit helper (fire-and-forget)
    await createAuditLog("DELETE_COMPLIANCE_DOCUMENT", "compliance_document", documentId, {
      userId: user.id,
      details: { fileName: document.file_name },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
