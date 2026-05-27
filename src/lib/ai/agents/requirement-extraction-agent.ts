import { generateCompletion } from '@/lib/ai/openai-client';
import { REQUIREMENT_EXTRACTION_PROMPT } from '@/lib/ai/prompts';
import { logger } from '@/lib/logging';
import {
  RequirementExtractionOutputSchema,
  type RequirementExtractionInput,
  type RequirementExtractionOutput,
} from '@/lib/ai/schemas';

export async function extractRequirements(
  input: RequirementExtractionInput
): Promise<RequirementExtractionOutput> {
  const requirements: RequirementExtractionOutput['requirements'] = [];

  for (const doc of input.documents) {
    try {
      const prompt = REQUIREMENT_EXTRACTION_PROMPT
        .replace('{category}', doc.category)
        .replace('{documentName}', doc.fileName)
        .replace('{documentText}', doc.text.substring(0, 8000));

      const response = await generateCompletion(
        'You are a construction compliance expert. Always return valid JSON.',
        prompt,
        { temperature: 0.2, maxTokens: 3000 }
      );

      const parsed = JSON.parse(response);
      const rawItems = Array.isArray(parsed.requirements) ? parsed.requirements : Array.isArray(parsed) ? parsed : [];

      const docRequirements = rawItems
        .map((req: Record<string, unknown>) => {
          // Normalise: GPT-4o returns varying key names (requirementText, requirement_text, text, excerpt, etc.)
          const text = (req.requirementText ?? req.requirement_text ?? req.text ?? req.description ?? req.excerpt ?? '') as string;
          return {
            requirementCode: (req.requirementCode ?? req.requirement_code ?? req.code ?? req.id ?? `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`) as string,
            requirementText: text,
            category: (req.category as string) || doc.category,
            severity: (req.severity as string) || 'major',
            sourceDocumentId: doc.documentId,
            sourceDocumentName: doc.fileName,
            sourceExcerpt: (req.sourceExcerpt ?? req.source_excerpt ?? req.excerpt ?? text) as string,
          };
        })
        .filter((req: { requirementText: string }) => req.requirementText.trim().length > 0);

      requirements.push(...docRequirements);
    } catch (error) {
      logger.error('Failed to extract requirements from document', {
        fileName: doc.fileName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return RequirementExtractionOutputSchema.parse({ requirements });
}
