import { NextResponse } from "next/server";

import { createAuditLog } from "@/lib/audit/audit-log";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { handleAPIError, UnauthorizedError } from "@/lib/error-handling";

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
      console.error("Failed to delete from storage:", storageError);
    }

    const { error: deleteError } = await supabase
      .from("compliance_documents")
      .delete()
      .eq("id", documentId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Use centralized audit helper (fire-and-forget)
    createAuditLog("DELETE_COMPLIANCE_DOCUMENT", "compliance_document", documentId, {
      userId: user.id,
      details: { fileName: document.file_name },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
