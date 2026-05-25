import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/supabase-server";

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

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "DELETE_COMPLIANCE_DOCUMENT",
      entity_type: "compliance_document",
      entity_id: documentId,
      details: { fileName: document.file_name },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
