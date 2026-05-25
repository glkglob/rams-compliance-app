import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { validateFile } from "@/lib/documents/file-validation";
import { extractTextFromFile } from "@/lib/documents/extract-text";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const subcontractorName = formData.get("subcontractorName") as string;
    const subcontractorEmail = formData.get("subcontractorEmail") as string | null;
    const tradePackage = formData.get("tradePackage") as string | null;

    if (!file || !subcontractorName) {
      return NextResponse.json(
        { error: "File and subcontractor name are required" },
        { status: 400 }
      );
    }

    const validation = validateFile(file.name, file.type, file.size);
    if (!validation.isSupported) {
      return NextResponse.json(
        { error: "File validation failed", issues: validation.issues },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `${projectId}/rams/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    const { data: signedUrlData } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, 60 * 60);

    const { data: submission, error: insertError } = await supabase
      .from("rams_submissions")
      .insert({
        project_id: projectId,
        subcontractor_name: subcontractorName,
        subcontractor_email: subcontractorEmail || null,
        trade_package: tradePackage || null,
        file_name: file.name,
        file_type: validation.normalisedFileType,
        file_size: file.size,
        file_url: signedUrlData?.signedUrl ?? null,
        storage_path: storagePath,
        submitted_by: user.id,
        review_status: "processing",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    try {
      const extractionResult = await extractTextFromFile(fileBuffer, file.type, file.name);

      await supabase
        .from("rams_submissions")
        .update({
          extracted_text: extractionResult.extractedText ?? null,
          review_status: extractionResult.status === "complete" ? "pending" : "failed",
          confidence_score: extractionResult.confidence,
        })
        .eq("id", submission.id);

      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "UPLOAD_RAMS",
        entity_type: "rams_submission",
        entity_id: submission.id,
        details: {
          fileName: file.name,
          subcontractor: subcontractorName,
          trade: tradePackage,
          extractionStatus: extractionResult.status,
        },
      });

      return NextResponse.json(
        { ...submission, review_status: extractionResult.status === "complete" ? "pending" : "failed" },
        { status: 201 }
      );
    } catch {
      await supabase
        .from("rams_submissions")
        .update({ review_status: "failed" })
        .eq("id", submission.id);

      return NextResponse.json(
        { ...submission, review_status: "failed" },
        { status: 201 }
      );
    }
  } catch (error) {
    console.error("Error uploading RAMS:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: submissions, error } = await supabase
      .from("rams_submissions")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(submissions ?? [], { status: 200 });
  } catch (error) {
    console.error("Error fetching RAMS:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
