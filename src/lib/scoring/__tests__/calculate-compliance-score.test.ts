import { describe, it, expect } from 'vitest';
import { calculateComplianceScore } from '../calculate-compliance-score';
import type { ComplianceCheck } from '@/lib/ai/schemas';

describe('Compliance Score Calculation', () => {
  const createCheck = (
    overrides: Partial<ComplianceCheck> = {}
  ): ComplianceCheck => ({
    requirementId: 'REQ-001',
    status: 'compliant',
    severity: 'major',
    requirement: 'Test requirement',
    ramsEvidence: 'Evidence found',
    sourceExcerpt: 'Source text',
    explanation: 'Test explanation',
    score: 1,
    ...overrides,
  });

  it('should return 100% for all compliant checks', () => {
    const checks = [
      createCheck({ severity: 'critical', status: 'compliant' }),
      createCheck({ severity: 'major', status: 'compliant' }),
      createCheck({ severity: 'minor', status: 'compliant' }),
    ];

    const result = calculateComplianceScore(checks, 80);
    expect(result.complianceScore).toBe(100);
    expect(result.decision).toBe('approved');
  });

  it('should return 0% for all non-compliant checks', () => {
    const checks = [
      createCheck({ severity: 'critical', status: 'non_compliant' }),
      createCheck({ severity: 'major', status: 'non_compliant' }),
    ];

    const result = calculateComplianceScore(checks, 80);
    expect(result.complianceScore).toBe(0);
    expect(result.decision).toBe('rejected');
  });

  it('should weight critical failures higher', () => {
    const checks = [
      createCheck({ severity: 'critical', status: 'non_compliant' }),
      createCheck({ severity: 'major', status: 'compliant' }),
      createCheck({ severity: 'minor', status: 'compliant' }),
      createCheck({ severity: 'minor', status: 'compliant' }),
    ];

    const result = calculateComplianceScore(checks, 80);
    // Critical (weight 3) failed, major (weight 2) passed, minors (weight 1x2) passed
    // Score = (0*3 + 1*2 + 1*1 + 1*1) / (3+2+1+1) = 4/7 ≈ 57%
    expect(result.complianceScore).toBe(57);
    expect(result.decision).toBe('rejected');
  });

  it('should handle partially compliant checks', () => {
    const checks = [
      createCheck({ severity: 'major', status: 'partially_compliant', score: 0.5 }),
      createCheck({ severity: 'minor', status: 'compliant', score: 1 }),
    ];

    const result = calculateComplianceScore(checks, 80);
    // (0.5*2 + 1*1) / (2+1) = 2/3 ≈ 67%
    expect(result.complianceScore).toBe(67);
  });

  it('should exclude not_applicable checks from scoring', () => {
    const checks = [
      createCheck({ severity: 'critical', status: 'compliant' }),
      createCheck({ severity: 'major', status: 'not_applicable' }),
    ];

    const result = calculateComplianceScore(checks, 80);
    expect(result.complianceScore).toBe(100);
  });

  it('should require manual review if critical extraction confidence is low', () => {
    const checks = [createCheck({ status: 'compliant' })];
    const result = calculateComplianceScore(checks, 80, 0.5);
    expect(result.decision).toBe('manual_review');
  });

  it('should require manual review if too many unclear checks', () => {
    const checks = [
      createCheck({ status: 'unclear' }),
      createCheck({ status: 'unclear' }),
      createCheck({ status: 'compliant' }),
      createCheck({ status: 'compliant' }),
    ];

    const result = calculateComplianceScore(checks, 80);
    // 2 out of 4 are unclear (50%)
    expect(result.decision).toBe('manual_review');
  });

  it('should auto-reject if any critical requirement is non-compliant', () => {
    const checks = [
      createCheck({ severity: 'critical', status: 'non_compliant' }),
      createCheck({ severity: 'major', status: 'compliant' }),
      createCheck({ severity: 'minor', status: 'compliant' }),
    ];

    const result = calculateComplianceScore(checks, 80);
    expect(result.decision).toBe('rejected');
  });

  it('should approve if score meets threshold', () => {
    const checks = [
      createCheck({ severity: 'major', status: 'compliant' }),
      createCheck({ severity: 'minor', status: 'compliant' }),
    ];

    const result = calculateComplianceScore(checks, 80);
    expect(result.complianceScore).toBe(100);
    expect(result.decision).toBe('approved');
  });

  it('should handle empty checks array', () => {
    const result = calculateComplianceScore([], 80);
    expect(result.decision).toBe('manual_review');
    expect(result.reason).toContain('No compliance requirements');
  });

  it('should require manual review for low AI confidence', () => {
    const checks = [createCheck({ status: 'compliant' })];
    const result = calculateComplianceScore(checks, 80, 0.9, 0.6);
    expect(result.decision).toBe('manual_review');
    expect(result.reason).toContain('AI confidence score is below 75%');
  });
});
