import { z } from 'zod';

export const DocumentIntakeInputSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  fileSizeBytes: z.number(),
});

export const DocumentIntakeOutputSchema = z.object({
  isSupported: z.boolean(),
  normalisedFileType: z.string().nullable(),
  requiresOcr: z.boolean(),
  issues: z.array(z.string()),
});

export type DocumentIntakeInput = z.infer<typeof DocumentIntakeInputSchema>;
export type DocumentIntakeOutput = z.infer<typeof DocumentIntakeOutputSchema>;

export const TextExtractionOutputSchema = z.object({
  status: z.enum(['complete', 'failed']),
  extractedText: z.string().optional(),
  confidence: z.number().min(0).max(1),
  requiresManualReview: z.boolean(),
  issues: z.array(z.string()),
});

export type TextExtractionOutput = z.infer<typeof TextExtractionOutputSchema>;

export const DocumentClassificationOutputSchema = z.object({
  documentType: z.string(),
  sections: z.array(z.object({
    name: z.string(),
    summary: z.string(),
  })),
  confidence: z.number().min(0).max(1),
});

export type DocumentClassificationOutput = z.infer<typeof DocumentClassificationOutputSchema>;

export const RequirementExtractionInputSchema = z.object({
  projectId: z.string().uuid(),
  documents: z.array(z.object({
    documentId: z.string().uuid(),
    fileName: z.string(),
    category: z.string(),
    text: z.string(),
  })),
});

export const ComplianceRequirementSchema = z.object({
  requirementCode: z.string(),
  requirementText: z.string(),
  category: z.string(),
  severity: z.enum(['critical', 'major', 'minor']),
  sourceDocumentId: z.string(),
  sourceDocumentName: z.string(),
  sourceExcerpt: z.string(),
});

export const RequirementExtractionOutputSchema = z.object({
  requirements: z.array(ComplianceRequirementSchema),
});

export type RequirementExtractionInput = z.infer<typeof RequirementExtractionInputSchema>;
export type RequirementExtractionOutput = z.infer<typeof RequirementExtractionOutputSchema>;
export type ComplianceRequirement = z.infer<typeof ComplianceRequirementSchema>;

export const RAMSAnalysisOutputSchema = z.object({
  ramsSummary: z.string(),
  detectedSections: z.array(z.string()),
  missingSections: z.array(z.string()),
  keyControls: z.array(z.string()),
  issues: z.array(z.string()),
});

export type RAMSAnalysisOutput = z.infer<typeof RAMSAnalysisOutputSchema>;

export const ComplianceCheckSchema = z.object({
  requirementId: z.string(),
  status: z.enum(['compliant', 'partially_compliant', 'non_compliant', 'not_applicable', 'unclear']),
  severity: z.enum(['critical', 'major', 'minor']),
  requirement: z.string(),
  ramsEvidence: z.string(),
  sourceExcerpt: z.string(),
  explanation: z.string(),
  score: z.number().min(0).max(1),
});

export const ComplianceComparisonOutputSchema = z.object({
  checks: z.array(ComplianceCheckSchema),
});

export type ComplianceCheck = z.infer<typeof ComplianceCheckSchema>;
export type ComplianceComparisonOutput = z.infer<typeof ComplianceComparisonOutputSchema>;

export const RiskScoringOutputSchema = z.object({
  complianceScore: z.number(),
  threshold: z.number(),
  decision: z.enum(['approved', 'rejected', 'manual_review']),
  criticalFailures: z.number(),
  majorFailures: z.number(),
  minorFailures: z.number(),
  unclearChecks: z.number(),
  confidenceScore: z.number(),
  reason: z.string(),
});

export type RiskScoringOutput = z.infer<typeof RiskScoringOutputSchema>;

export const ExplanationOutputSchema = z.object({
  summary: z.string(),
  passedItems: z.array(z.string()),
  failedItems: z.array(z.string()),
  unclearItems: z.array(z.string()),
  requiredCorrections: z.array(z.string()),
  disclaimer: z.string(),
});

export type ExplanationOutput = z.infer<typeof ExplanationOutputSchema>;

export const EmailOutputSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

export type EmailOutput = z.infer<typeof EmailOutputSchema>;
