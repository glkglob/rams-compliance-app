import { Resend } from "resend";

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: "RAMS Compliance <noreply@rams-compliance.com>",
    to,
    subject,
    html: body.replace(/\n/g, "<br>"),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, messageId: data?.id };
}
