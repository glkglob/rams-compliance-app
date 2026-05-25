import { generateCompletion } from '@/lib/ai/openai-client';
import { COMPLIANCE_COMPARISON_PROMPT } from '@/lib/ai/prompts';
import {
  ComplianceComparisonOutputSchema,
  type ComplianceComparisonOutput,
  type ComplianceRequirement,
} from '@/lib/ai/schemas';

export async function compareCompliance(
  requirements: ComplianceRequirement[],
  ramsText: string
): Promise<ComplianceComparisonOutput> {
  const requirementsJson = JSON.stringify(requirements, null, 2);

  const prompt = COMPLIANCE_COMPARISON_PROMPT
    .replace('{requirements}', requirementsJson)
    .replace('{ramsText}', ramsText.substring(0, 8000));

  const response = await generateCompletion(
    'You are a construction compliance auditor. Always return valid JSON.',
    prompt,
    { temperature: 0.2, maxTokens: 4000 }
  );

  const parsed = JSON.parse(response);
  const rawChecks: Record<string, unknown>[] = parsed.checks || [];

  const checks = requirements.map(req => {
    const check = rawChecks.find(c => c.requirementId === req.requirementCode);

    return {
      requirementId: req.requirementCode,
      status: (check?.status as string) || 'unclear',
      severity: req.severity,
      requirement: req.requirementText,
      ramsEvidence: (check?.ramsEvidence as string) || 'No evidence found',
      sourceExcerpt: req.sourceExcerpt,
      explanation: (check?.explanation as string) || 'Unable to verify compliance',
      score: typeof check?.score === 'number' ? check.score : 0,
    };
  });

  return ComplianceComparisonOutputSchema.parse({ checks });
}
