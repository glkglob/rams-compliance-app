import { createServerSupabaseWithTimeout } from '@/lib/db/supabase-with-timeout';
import { logger } from '@/lib/logging';
import { createAuditLog } from '@/lib/audit/audit-log';
import { extractRequirements } from '@/lib/ai/agents/requirement-extraction-agent';
import { compareCompliance } from '@/lib/ai/agents/compliance-comparison-agent';
import { generateExplanation } from '@/lib/ai/agents/explanation-agent';
import { generateEmail } from '@/lib/ai/agents/email-generation-agent';
import { calculateComplianceScore } from '@/lib/scoring/calculate-compliance-score';
import type {
  ComplianceRequirement,
  ComplianceCheck,
  ComplianceComparisonOutput,
  RiskScoringOutput,
} from '@/lib/ai/schemas';

interface ReviewResult {
  success: boolean;
  reviewId?: string;
  error?: string;
  decision?: 'approved' | 'rejected' | 'manual_review';
  complianceScore?: number;
  confidenceScore?: number;
}

// Local row types to avoid `any` when mapping Supabase results
interface RequirementRow {
  id: string;
  requirement_code: string;
  requirement_text: string;
  category: string;
  severity: string;
  source_document_id: string | null;
  source_excerpt: string | null;
}

interface ComplianceDocRow {
  id: string;
  file_name: string;
  document_category: string;
  extracted_text: string | null;
}

interface InsertedRequirementRow {
  id: string;
  requirement_code: string;
}

export async function orchestrateRAMSReview(
  ramsSubmissionId: string,
  performedByUserId?: string
): Promise<ReviewResult> {
  const supabase = await createServerSupabaseWithTimeout(20000);

  try {
    // 1. Load RAMS + Project
    const { data: rams, error: ramsError } = await supabase
      .from('rams_submissions')
      .select('*, projects(*)')
      .eq('id', ramsSubmissionId)
      .single();

    if (ramsError || !rams) {
      return { success: false, error: 'RAMS submission not found' };
    }

    if (!rams.extracted_text || rams.extracted_text.trim().length < 80) {
      return { success: false, error: 'RAMS document has insufficient extracted text' };
    }

    const project = rams.projects;

    // 2. Load compliance documents
    const { data: complianceDocs } = await supabase
      .from('compliance_documents')
      .select('id, file_name, document_category, extracted_text')
      .eq('project_id', project.id)
      .eq('extraction_status', 'complete');

    if (!complianceDocs?.length) {
      await supabase.from('rams_submissions').update({ review_status: 'manual_review' }).eq('id', ramsSubmissionId);
      return { success: true, decision: 'manual_review', error: 'No compliance documents available' };
    }

    // 3. Load or extract requirements
    let requirements: ComplianceRequirement[] = [];
    const requirementDbIds = new Map<string, string>();

    const { data: existingReqs } = await supabase
      .from('compliance_requirements')
      .select('*')
      .eq('project_id', project.id);

    if (existingReqs?.length) {
      requirements = (existingReqs as RequirementRow[]).map((r) => {
        requirementDbIds.set(r.requirement_code, r.id);
        return {
          requirementCode: r.requirement_code,
          requirementText: r.requirement_text,
          category: r.category,
          severity: r.severity as 'critical' | 'major' | 'minor',
          sourceDocumentId: r.source_document_id ?? '',
          sourceDocumentName: '',
          sourceExcerpt: r.source_excerpt ?? '',
        };
      });
    } else {
      const extractionResult = await extractRequirements({
        projectId: project.id,
        documents: (complianceDocs as ComplianceDocRow[]).map((d) => ({
          documentId: d.id,
          fileName: d.file_name,
          category: d.document_category,
          text: d.extracted_text || '',
        })),
      });

      requirements = extractionResult.requirements.filter((r) => r.requirementText?.trim());

      if (requirements.length > 0) {
        const { data: inserted } = await supabase
          .from('compliance_requirements')
          .insert(requirements.map((req) => ({
            project_id: project.id,
            source_document_id: req.sourceDocumentId || null,
            requirement_code: req.requirementCode,
            requirement_text: req.requirementText,
            category: req.category,
            severity: req.severity,
            source_excerpt: req.sourceExcerpt || null,
          })))
          .select('id, requirement_code');

        (inserted as InsertedRequirementRow[] | null)?.forEach((row) =>
          requirementDbIds.set(row.requirement_code, row.id)
        );
      }
    }

    if (requirements.length === 0) {
      return { success: false, error: 'No requirements available for comparison' };
    }

    // 4. Run comparison
    const comparison: ComplianceComparisonOutput = await compareCompliance(requirements, rams.extracted_text);

    // 5. Score
    const scoring: RiskScoringOutput = calculateComplianceScore(
      comparison.checks,
      project.compliance_threshold,
      rams.extraction_confidence ?? undefined
    );

    // 6. Explanation + Email
    const explanation = await generateExplanation(
      scoring.complianceScore,
      scoring.threshold,
      scoring.decision,
      comparison.checks
    );

    const emailDraft = await generateEmail(scoring.decision, {
      projectName: project.name,
      subcontractorName: rams.subcontractor_name,
      subcontractorEmail: rams.subcontractor_email,
      complianceScore: scoring.complianceScore,
      threshold: scoring.threshold,
      summary: explanation.summary,
      reason: scoring.reason,
      corrections: explanation.requiredCorrections,
    });

    // 7. Persist review
    const { data: review } = await supabase
      .from('rams_reviews')
      .insert({
        rams_submission_id: ramsSubmissionId,
        review_status: scoring.decision,
        compliance_score: scoring.complianceScore,
        confidence_score: scoring.confidenceScore,
        decision_explanation: explanation.summary,
        email_generated: true,
        email_sent: false,
      })
      .select()
      .single();

    if (!review) {
      return { success: false, error: 'Failed to persist review' };
    }

    // 8. Persist checks
    if (comparison.checks.length > 0) {
      const checkRows = comparison.checks
        .map((check: ComplianceCheck) => ({
          rams_review_id: review.id,
          requirement_id: requirementDbIds.get(check.requirementId) ?? null,
          status: check.status,
          severity: check.severity,
          score: check.score,
          rams_evidence: check.ramsEvidence,
          explanation: check.explanation,
        }))
        .filter((r) => r.requirement_id !== null);

      if (checkRows.length > 0) {
        await supabase.from('review_checks').insert(checkRows);
      }
    }

    // 9. Persist email draft
    await supabase.from('generated_emails').insert({
      rams_submission_id: ramsSubmissionId,
      subject: emailDraft.subject,
      body: emailDraft.body,
      sent: false,
    });

    // 10. Update RAMS summary
    await supabase.from('rams_submissions').update({
      review_status: scoring.decision,
      compliance_score: scoring.complianceScore,
      confidence_score: scoring.confidenceScore,
      decision_explanation: explanation.summary,
    }).eq('id', ramsSubmissionId);

    // 11. Audit
    await createAuditLog('REVIEW_RAMS', 'rams_submission', ramsSubmissionId, {
      userId: performedByUserId,
      details: {
        decision: scoring.decision,
        score: scoring.complianceScore,
        checks: comparison.checks.length,
      },
    });

    return {
      success: true,
      reviewId: review.id,
      decision: scoring.decision,
      complianceScore: scoring.complianceScore,
      confidenceScore: scoring.confidenceScore,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('orchestrateRAMSReview failed', { ramsSubmissionId, error: message });

    await supabase.from('rams_submissions').update({ review_status: 'failed' }).eq('id', ramsSubmissionId);

    return { success: false, error: message };
  }
}
