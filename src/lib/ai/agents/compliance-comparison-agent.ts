import { generateCompletion } from '@/lib/ai/openai-client';
import { COMPLIANCE_COMPARISON_PROMPT } from '@/lib/ai/prompts';
import {
  ComplianceComparisonOutputSchema,
  type ComplianceComparisonOutput,
  type ComplianceCheck,
  type ComplianceRequirement,
} from '@/lib/ai/schemas';

// GPT-4o context window: 128 K tokens ≈ 512 K chars.
// 100 K chars for RAMS text leaves ample room for requirements JSON,
// prompt overhead, and the completion. Most real RAMS documents are
// 20–60 pages (roughly 10 K–90 K chars), so the single-pass path
// handles the vast majority of submissions.
const CHUNK_SIZE_CHARS = 100_000;
// Overlap ensures sentences that straddle a chunk boundary are seen
// by both chunks and not silently dropped.
const CHUNK_OVERLAP_CHARS = 500;

// When merging multi-chunk results, prefer the finding that shows the
// most evidence of compliance — if a requirement is met anywhere in the
// document it should not be penalised because another chunk missed it.
const STATUS_RANK: Record<string, number> = {
  compliant: 5,
  partially_compliant: 4,
  unclear: 3,
  not_applicable: 2,
  non_compliant: 1,
};

export async function compareCompliance(
  requirements: ComplianceRequirement[],
  ramsText: string
): Promise<ComplianceComparisonOutput> {
  if (ramsText.length <= CHUNK_SIZE_CHARS) {
    return runSingleComparison(requirements, ramsText);
  }

  // Document exceeds single-pass limit — chunk and merge results.
  const chunks = splitIntoChunks(ramsText, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS);
  const chunkResults = await Promise.all(
    chunks.map(chunk => runSingleComparison(requirements, chunk))
  );
  return mergeResults(requirements, chunkResults);
}

function splitIntoChunks(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

async function runSingleComparison(
  requirements: ComplianceRequirement[],
  ramsText: string
): Promise<ComplianceComparisonOutput> {
  // Compact JSON — pretty-printing wastes tokens with no benefit here.
  const requirementsJson = JSON.stringify(requirements);

  const prompt = COMPLIANCE_COMPARISON_PROMPT
    .replace('{requirements}', requirementsJson)
    .replace('{ramsText}', ramsText);

  const response = await generateCompletion(
    'You are a construction compliance auditor. Always return valid JSON.',
    prompt,
    { temperature: 0.2, maxTokens: 8000 },
  );

  const parsed = JSON.parse(response);
  const rawChecks: Record<string, unknown>[] = parsed.checks ?? [];

  const checks = requirements.map(req => {
    const check = rawChecks.find(c => c.requirementId === req.requirementCode);
    return {
      requirementId: req.requirementCode,
      status: (check?.status as string) ?? 'unclear',
      severity: req.severity,
      requirement: req.requirementText,
      ramsEvidence: (check?.ramsEvidence as string) ?? 'No evidence found',
      sourceExcerpt: req.sourceExcerpt,
      explanation: (check?.explanation as string) ?? 'Unable to verify compliance',
      score: typeof check?.score === 'number' ? check.score : 0,
    };
  });

  return ComplianceComparisonOutputSchema.parse({ checks });
}

// For each requirement, keep the best result found across all chunks.
function mergeResults(
  requirements: ComplianceRequirement[],
  results: ComplianceComparisonOutput[]
): ComplianceComparisonOutput {
  const checks: ComplianceCheck[] = requirements.map(req => {
    const candidates = results.flatMap(r =>
      r.checks.filter(c => c.requirementId === req.requirementCode)
    );

    if (candidates.length === 0) {
      return {
        requirementId: req.requirementCode,
        status: 'unclear' as const,
        severity: req.severity,
        requirement: req.requirementText,
        ramsEvidence: 'No evidence found across document chunks',
        sourceExcerpt: req.sourceExcerpt,
        explanation: 'Unable to verify compliance',
        score: 0,
      };
    }

    return candidates.reduce((best, curr) => {
      const bestRank = STATUS_RANK[best.status] ?? 0;
      const currRank = STATUS_RANK[curr.status] ?? 0;
      if (currRank > bestRank) return curr;
      if (currRank === bestRank && curr.score > best.score) return curr;
      return best;
    });
  });

  return ComplianceComparisonOutputSchema.parse({ checks });
}
