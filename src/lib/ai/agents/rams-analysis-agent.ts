import { generateCompletion } from '@/lib/ai/openai-client';
import { RAMS_ANALYSIS_PROMPT } from '@/lib/ai/prompts';
import { RAMSAnalysisOutputSchema, type RAMSAnalysisOutput } from '@/lib/ai/schemas';

export async function analyzeRAMS(ramsText: string): Promise<RAMSAnalysisOutput> {
  const prompt = RAMS_ANALYSIS_PROMPT.replace('{ramsText}', ramsText.substring(0, 8000));

  const response = await generateCompletion(
    'You are a construction safety expert. Always return valid JSON.',
    prompt,
    { temperature: 0.2, maxTokens: 2000 }
  );

  const parsed = JSON.parse(response);

  return RAMSAnalysisOutputSchema.parse({
    ramsSummary: parsed.ramsSummary || 'Unable to analyze RAMS content',
    detectedSections: parsed.detectedSections || [],
    missingSections: parsed.missingSections || [],
    keyControls: parsed.keyControls || [],
    issues: parsed.issues || [],
  });
}
