import { generateCompletion } from '@/lib/ai/openai-client';
import { EMAIL_APPROVAL_PROMPT, EMAIL_REJECTION_PROMPT, EMAIL_MANUAL_REVIEW_PROMPT } from '@/lib/ai/prompts';
import { EmailOutputSchema, type EmailOutput } from '@/lib/ai/schemas';

interface EmailData {
  projectName: string;
  subcontractorName: string;
  subcontractorEmail?: string;
  complianceScore: number;
  threshold: number;
  summary?: string;
  reason?: string;
  corrections?: string[];
}

export async function generateEmail(
  type: 'approved' | 'rejected' | 'manual_review',
  data: EmailData
): Promise<EmailOutput> {
  let prompt: string;

  switch (type) {
    case 'approved':
      prompt = EMAIL_APPROVAL_PROMPT
        .replace('{projectName}', data.projectName)
        .replace('{subcontractorName}', data.subcontractorName)
        .replace('{complianceScore}', data.complianceScore.toString())
        .replace('{threshold}', data.threshold.toString())
        .replace('{summary}', data.summary || 'RAMS submission meets compliance requirements.');
      break;

    case 'rejected':
      prompt = EMAIL_REJECTION_PROMPT
        .replace('{projectName}', data.projectName)
        .replace('{subcontractorName}', data.subcontractorName)
        .replace('{complianceScore}', data.complianceScore.toString())
        .replace('{threshold}', data.threshold.toString())
        .replace('{reason}', data.reason || 'RAMS does not meet minimum compliance requirements.')
        .replace('{corrections}', (data.corrections || []).join('\n'));
      break;

    case 'manual_review':
      prompt = EMAIL_MANUAL_REVIEW_PROMPT
        .replace('{projectName}', data.projectName)
        .replace('{subcontractorName}', data.subcontractorName)
        .replace('{reason}', data.reason || 'Manual review is required.');
      break;

    default:
      throw new Error(`Unsupported email type: ${type}`);
  }

  const response = await generateCompletion(
    'You are a professional construction project manager. Always return valid JSON.',
    prompt,
    { temperature: 0.3, maxTokens: 1000 }
  );

  const parsed = JSON.parse(response);

  return EmailOutputSchema.parse({
    subject: parsed.subject || `RAMS Review Update - ${data.projectName}`,
    body: parsed.body || 'Please contact the project team for more information.',
  });
}
