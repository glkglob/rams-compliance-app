import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit/audit-log";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { handleAPIError, UnauthorizedError } from "@/lib/error-handling";
import { sendEmail } from "@/lib/email/resend";

type Context = { params: Promise<{ ramsId: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { ramsId } = await params;
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new UnauthorizedError();
    }

    const { data: rams, error: ramsError } = await supabase
      .from("rams_submissions")
      .select("subcontractor_email, subcontractor_name, project_id")
      .eq("id", ramsId)
      .single();

    if (ramsError || !rams) {
      return NextResponse.json({ error: "RAMS not found" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", rams.project_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!rams.subcontractor_email) {
      return NextResponse.json(
        { error: "No subcontractor email provided" },
        { status: 400 }
      );
    }

    const { data: emailDraft, error: emailError } = await supabase
      .from("generated_emails")
      .select("*")
      .eq("rams_submission_id", ramsId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (emailError || !emailDraft) {
      return NextResponse.json(
        { error: "No email draft found. Generate an email first." },
        { status: 400 }
      );
    }

    const result = await sendEmail(
      rams.subcontractor_email,
      emailDraft.subject,
      emailDraft.body
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    await supabase
      .from("generated_emails")
      .update({ sent: true, sent_at: new Date().toISOString() })
      .eq("id", emailDraft.id);

    const { data: review } = await supabase
      .from("rams_reviews")
      .select("id")
      .eq("rams_submission_id", ramsId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (review) {
      await supabase
        .from("rams_reviews")
        .update({ email_sent: true })
        .eq("id", review.id);
    }

    await createAuditLog("SEND_EMAIL", "rams_submission", ramsId, {
      userId: user.id,
      details: {
        to: rams.subcontractor_email,
        subject: emailDraft.subject,
        messageId: result.messageId,
      },
    });

    return NextResponse.json({ success: true, messageId: result.messageId }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
