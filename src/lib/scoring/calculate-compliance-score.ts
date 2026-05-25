import type { ComplianceCheck } from '@/lib/ai/schemas';

interface ScoringWeights {
  critical: number;
  major: number;
  minor: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  critical: 3,
  major: 2,
  minor: 1,
};

export interface ScoringResult {
  complianceScore: number;
  threshold: number;
  decision: 'approved' | 'rejected' | 'manual_review';
  criticalFailures: number;
  majorFailures: number;
  minorFailures: number;
  unclearChecks: number;
  confidenceScore: number;
  reason: string;
}

export function calculateComplianceScore(
  checks: ComplianceCheck[],
  threshold = 80,
  extractionConfidence?: number,
  aiConfidence?: number
): ScoringResult {
  const weights = DEFAULT_WEIGHTS;

  const criticalFailures = checks.filter(
    c => c.severity === 'critical' && c.status === 'non_compliant'
  ).length;

  const majorFailures = checks.filter(
    c => c.severity === 'major' && c.status === 'non_compliant'
  ).length;

  const minorFailures = checks.filter(
    c => c.severity === 'minor' && c.status === 'non_compliant'
  ).length;

  const unclearChecks = checks.filter(c => c.status === 'unclear').length;

  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const check of checks) {
    if (check.status === 'not_applicable') continue;

    const weight = weights[check.severity] ?? 1;
    totalWeight += weight;

    if (check.status === 'compliant') {
      totalWeightedScore += weight * 1;
    } else if (check.status === 'partially_compliant') {
      totalWeightedScore += weight * 0.5;
    }
    // non_compliant and unclear contribute 0
  }

  const complianceScore = totalWeight > 0
    ? Math.round((totalWeightedScore / totalWeight) * 100)
    : 0;

  const confidenceScore = Math.min(
    extractionConfidence ?? 1,
    aiConfidence ?? 1,
    checks.length > 0 ? 1 - (unclearChecks / checks.length) : 1
  );

  let decision: 'approved' | 'rejected' | 'manual_review' = 'manual_review';
  let reason = '';

  if (!checks || checks.length === 0) {
    decision = 'manual_review';
    reason = 'No compliance requirements found for comparison.';
  } else if (extractionConfidence !== undefined && extractionConfidence < 0.7) {
    decision = 'manual_review';
    reason = 'Document extraction confidence is too low for automatic review.';
  } else if (confidenceScore < 0.75) {
    decision = 'manual_review';
    reason = 'AI confidence score is below 75% threshold for automatic decisions.';
  } else if (unclearChecks > checks.length * 0.25) {
    decision = 'manual_review';
    reason = `More than 25% of checks are unclear (${unclearChecks} out of ${checks.length}).`;
  } else if (criticalFailures > 0) {
    decision = 'rejected';
    reason = `RAMS rejected due to ${criticalFailures} critical compliance failure(s).`;
  } else if (complianceScore >= threshold) {
    decision = 'approved';
    reason = `RAMS approved with ${complianceScore}% compliance score (threshold: ${threshold}%).`;
  } else {
    decision = 'rejected';
    reason = `RAMS rejected with ${complianceScore}% compliance score (threshold: ${threshold}%).`;
  }

  return {
    complianceScore,
    threshold,
    decision,
    criticalFailures,
    majorFailures,
    minorFailures,
    unclearChecks,
    confidenceScore,
    reason,
  };
}
