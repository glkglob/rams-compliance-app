import { describe, it, expect } from 'vitest';
import {
  DocumentIntakeOutputSchema,
  TextExtractionOutputSchema,
  RequirementExtractionOutputSchema,
  ComplianceComparisonOutputSchema,
  RiskScoringOutputSchema,
  ExplanationOutputSchema,
  EmailOutputSchema,
} from '../schemas';

describe('AI Agent Schemas', () => {
  describe('DocumentIntakeOutputSchema', () => {
    it('should validate correct output', () => {
      const valid = {
        isSupported: true,
        normalisedFileType: 'pdf',
        requiresOcr: false,
        issues: [],
      };
      expect(() => DocumentIntakeOutputSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid output', () => {
      const invalid = {
        isSupported: 'yes',
        normalisedFileType: 'pdf',
        requiresOcr: false,
        issues: [],
      };
      expect(() => DocumentIntakeOutputSchema.parse(invalid)).toThrow();
    });
  });

  describe('TextExtractionOutputSchema', () => {
    it('should validate complete extraction', () => {
      const valid = {
        status: 'complete',
        extractedText: 'Sample text',
        confidence: 0.95,
        requiresManualReview: false,
        issues: [],
      };
      expect(() => TextExtractionOutputSchema.parse(valid)).not.toThrow();
    });

    it('should validate failed extraction', () => {
      const valid = {
        status: 'failed',
        confidence: 0,
        requiresManualReview: true,
        issues: ['Failed to extract text'],
      };
      expect(() => TextExtractionOutputSchema.parse(valid)).not.toThrow();
    });
  });

  describe('RequirementExtractionOutputSchema', () => {
    it('should validate requirements array', () => {
      const valid = {
        requirements: [
          {
            requirementCode: 'REQ-001',
            requirementText: 'All workers must wear PPE',
            category: 'health_and_safety',
            severity: 'critical',
            sourceDocumentId: '123e4567-e89b-12d3-a456-426614174000',
            sourceDocumentName: 'Safety Policy.pdf',
            sourceExcerpt: 'All workers must wear appropriate PPE at all times',
          },
        ],
      };
      expect(() => RequirementExtractionOutputSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid severity', () => {
      const invalid = {
        requirements: [
          {
            requirementCode: 'REQ-001',
            requirementText: 'Test',
            category: 'health_and_safety',
            severity: 'extreme',
            sourceDocumentId: '123e4567-e89b-12d3-a456-426614174000',
            sourceDocumentName: 'Test.pdf',
            sourceExcerpt: 'Test',
          },
        ],
      };
      expect(() => RequirementExtractionOutputSchema.parse(invalid)).toThrow();
    });
  });

  describe('ComplianceComparisonOutputSchema', () => {
    it('should validate all check statuses', () => {
      const validStatuses = ['compliant', 'partially_compliant', 'non_compliant', 'not_applicable', 'unclear'];

      validStatuses.forEach(status => {
        const check = {
          checks: [{
            requirementId: 'REQ-001',
            status,
            severity: 'major',
            requirement: 'Test',
            ramsEvidence: 'Evidence',
            sourceExcerpt: 'Source',
            explanation: 'Explanation',
            score: status === 'compliant' ? 1 : 0,
          }],
        };
        expect(() => ComplianceComparisonOutputSchema.parse(check)).not.toThrow();
      });
    });
  });

  describe('RiskScoringOutputSchema', () => {
    it('should validate all decision types', () => {
      const decisions = ['approved', 'rejected', 'manual_review'];

      decisions.forEach(decision => {
        const valid = {
          complianceScore: 85,
          threshold: 80,
          decision,
          criticalFailures: 0,
          majorFailures: 1,
          minorFailures: 2,
          unclearChecks: 0,
          confidenceScore: 0.9,
          reason: 'Test reason',
        };
        expect(() => RiskScoringOutputSchema.parse(valid)).not.toThrow();
      });
    });
  });

  describe('ExplanationOutputSchema', () => {
    it('should validate explanation output', () => {
      const valid = {
        summary: 'Overall compliant',
        passedItems: ['PPE requirement met'],
        failedItems: [],
        unclearItems: [],
        requiredCorrections: [],
        disclaimer: 'This is automated analysis only.',
      };
      expect(() => ExplanationOutputSchema.parse(valid)).not.toThrow();
    });
  });

  describe('EmailOutputSchema', () => {
    it('should validate email output', () => {
      const valid = {
        subject: 'RAMS Approved - Project X',
        body: 'Dear Subcontractor, Your RAMS has been approved...',
      };
      expect(() => EmailOutputSchema.parse(valid)).not.toThrow();
    });
  });
});
