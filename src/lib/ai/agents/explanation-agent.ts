import { generateCompletion } from '@/lib/ai/openai-client';
import { EXPLANATION_PROMPT } from '@/lib/ai/prompts';
import { ExplanationOutputSchema, type ExplanationOutput } from '@/lib/ai/schemas';
import type { ComplianceCheck } from '@/lib/ai/schemas';

export async function generateExplanation(
  complianceScore: number,
  threshold: number,
  decision: string,
  checks: ComplianceCheck[]
): Promise<ExplanationOutput> {
  const criticalFailures = checks.filter(c => c.severity === 'critical' && c.status === 'non_compliant').length;
  const majorFailures = checks.filter(c => c.severity === 'major' && c.status === 'non_compliant').length;
  const unclearChecks = checks.filter(c => c.status === 'unclear').length;

  const prompt = EXPLANATION_PROMPT
    .replace('{complianceScore}', complianceScore.toString())
    .replace('{threshold}', threshold.toString())
    .replace('{decision}', decision)
    .replace('{criticalFailures}', criticalFailures.toString())
    .replace('{majorFailures}', majorFailures.toString())
    .replace('{unclearChecks}', unclearChecks.toString())
    .replace('{checks}', JSON.stringify(checks, null, 2));

  const response = await generateCompletion(
    'You are a construction compliance expert. Always return valid JSON.',
    prompt,
    { temperature: 0.3, maxTokens: 2000 }
  );

  const parsed = JSON.parse(response);
  const decisionLabel = decision.charAt(0).toUpperCase() + decision.slice(1);

  return ExplanationOutputSchema.parse({
    summary: parsed.summary || `${decisionLabel}. Compliance score: ${complianceScore}%`,
    passedItems: parsed.passedItems || [],
    failedItems: parsed.failedItems || [],
    unclearItems: parsed.unclearItems || [],
    requiredCorrections: parsed.requiredCorrections || [],
    disclaimer: 'This automated review is a compliance support tool. Final approval should be confirmed by a competent person before work starts.',
  });
}
