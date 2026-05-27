import { createServerSupabaseWithTimeout } from '@/lib/db/supabase-with-timeout';
import { createAuditLog } from '@/lib/audit/audit-log';
import { logger } from '@/lib/logging';
import { extractRequirements } from '@/lib/ai/agents/requirement-extraction-agent';
import { compareCompliance } from '@/lib/ai/agents/compliance-comparison-agent';
import { generateExplanation } from '@/lib/ai/agents/explanation-agent';
import { generateEmail } from '@/lib/ai/agents/email-generation-agent';
import { calculateComplianceScore } from '@/lib/scoring/calculate-compliance-score';
import type { ComplianceRequirement } from '@/lib/ai/schemas';

interface ReviewResult {
  success: boolean;
  reviewId?: string;
  error?: string;
  decision?: 'approved' | 'rejected' | 'manual_review';
  complianceScore?: number;
}

export async function orchestrateRAMSReview(
  ramsSubmissionId: string,
  performedByUserId?: string
): Promise<ReviewResult> {
  // Use a longer timeout for the orchestrator as it performs multiple sequential queries
  const supabase = await createServerSupabaseWithTimeout(15000); // 15 seconds

  try {
    // 1. Get RAMS submission
    const { data: rams, error: ramsError } = await supabase
      .from('rams_submissions')
      .select('*, projects(*)')
      .eq('id', ramsSubmissionId)
      .single();

    if (ramsError || !rams) {
      return { success: false, error: 'RAMS submission not found' };
    }

    if (!rams.extracted_text) {
      return { success: false, error: 'RAMS document has no extracted text' };
    }

    const project = rams.projects;

    // 2. Validate project has compliance documents
    const { data: complianceDocs, error: docsError } = await supabase
      .from('compliance_documents')
      .select('*')
      .eq('project_id', project.id)
      .eq('extraction_status', 'complete');

    if (docsError || !complianceDocs || complianceDocs.length === 0) {
      await supabase
        .from('rams_submissions')
        .update({ review_status: 'manual_review' })
        .eq('id', ramsSubmissionId);

      return {
        success: true,
        decision: 'manual_review',
        error: 'No compliance documents available for comparison',
      };
    }

    // 3. Extract or retrieve requirements
    let requirements: ComplianceRequirement[] = [];
    // Maps requirement_code → DB UUID for foreign-key references in review_checks
    const requirementDbIds = new Map<string, string>();

    const { data: existingRequirements } = await supabase
      .from('compliance_requirements')
      .select('*')
      .eq('project_id', project.id);

    if (existingRequirements && existingRequirements.length > 0) {
      requirements = existingRequirements.map((r: any) => {
        requirementDbIds.set(r.requirement_code, r.id);
        return {
          requirementCode: r.requirement_code,
          requirementText: r.requirement_text,
          category: r.category,
          severity: r.severity,
          sourceDocumentId: r.source_document_id,
          sourceDocumentName: '',
          sourceExcerpt: r.source_excerpt,
        };
      });
    } else {
      const extractionResult = await extractRequirements({
        projectId: project.id,
        documents: complianceDocs.map((doc: any) => ({
          documentId: doc.id,
          fileName: doc.file_name,
          category: doc.document_category,
          text: doc.extracted_text || '',
        })),
      });

      // Filter out any requirements with missing text (LLM can return nulls)
      requirements = extractionResult.requirements.filter(
        (r) => r.requirementText && r.requirementText.trim().length > 0
      );

      if (requirements.length > 0) {
        const { data: insertedReqs, error: reqInsertError } = await supabase
          .from('compliance_requirements')
          .insert(
            requirements.map((req: any) => ({
              project_id: project.id,
              source_document_id: req.sourceDocumentId,
              requirement_code: req.requirementCode,
              requirement_text: req.requirementText,
              category: req.category,
              severity: req.severity,
              source_excerpt: req.sourceExcerpt,
            }))
          )
          .select('id, requirement_code');

        if (reqInsertError) {
          logger.error('Failed to batch-insert requirements', { error: String(reqInsertError) });
        }

        // Build a lookup from requirement_code → DB UUID so review_checks
        // can reference the correct foreign key.
        if (insertedReqs) {
          for (const row of insertedReqs as { id: string; requirement_code: string }[]) {
            requirementDbIds.set(row.requirement_code, row.id);
          }
        }
      }
    }

    if (requirements.length === 0) {
      return { success: false, error: 'No requirements could be extracted' };
    }

    // 4. Compare RAMS against requirements
    const comparison = await compareCompliance(requirements, rams.extracted_text);

    // 5. Calculate compliance score
    const scoringResult = calculateComplianceScore(
      comparison.checks,
      project.compliance_threshold,
      rams.extraction_confidence ?? undefined
    );

    // 6. Generate explanation
    const explanation = await generateExplanation(
      scoringResult.complianceScore,
      scoringResult.threshold,
      scoringResult.decision,
      comparison.checks
    );

    // 7. Generate email draft
    const email = await generateEmail(scoringResult.decision, {
      projectName: project.name,
      subcontractorName: rams.subcontractor_name,
      subcontractorEmail: rams.subcontractor_email,
      complianceScore: scoringResult.complianceScore,
      threshold: scoringResult.threshold,
      summary: explanation.summary,
      reason: scoringResult.reason,
      corrections: explanation.requiredCorrections,
    });

    // 8. Save review results
    const { data: review, error: reviewError } = await supabase
      .from('rams_reviews')
      .insert({
        rams_submission_id: ramsSubmissionId,
        review_status: scoringResult.decision,
        compliance_score: scoringResult.complianceScore,
        confidence_score: scoringResult.confidenceScore,
        decision_explanation: explanation.summary,
        email_generated: true,
        email_sent: false,
      })
      .select()
      .single();

    if (reviewError) {
      return { success: false, error: 'Failed to save review' };
    }

    // 9. Save review checks
    if (comparison.checks.length > 0) {
      const checkRows = comparison.checks
        .map((check: any) => {
          // Look up the DB UUID for this requirement code
          const dbId = requirementDbIds.get(check.requirementId) ?? null;
          return {
            rams_review_id: review.id,
            requirement_id: dbId,
            status: check.status,
            severity: check.severity,
            score: check.score,
            rams_evidence: check.ramsEvidence,
            explanation: check.explanation,
          };
        })
        // Only insert checks that resolved to a valid DB requirement
        .filter((row: any) => row.requirement_id !== null);

      if (checkRows.length > 0) {
        const { error: checksInsertError } = await supabase
          .from('review_checks')
          .insert(checkRows);
        if (checksInsertError) {
          logger.error('Failed to batch-insert review checks', { error: String(checksInsertError) });
        }
      }

      if (checkRows.length < comparison.checks.length) {
        logger.warn('Some review checks skipped — requirement_id not found in DB', {
          total: comparison.checks.length,
          inserted: checkRows.length,
          skipped: comparison.checks.length - checkRows.length,
        });
      }
    }

    // 10. Save email draft
    const { error: emailError } = await supabase.from('generated_emails').insert({
      rams_submission_id: ramsSubmissionId,
      subject: email.subject,
      body: email.body,
      sent: false,
    });

    if (emailError) {
      logger.error('Failed to save email draft', { error: String(emailError) });
    }

    // 11. Update RAMS submission
    await supabase
      .from('rams_submissions')
      .update({
        review_status: scoringResult.decision,
        compliance_score: scoringResult.complianceScore,
        confidence_score: scoringResult.confidenceScore,
        decision_explanation: explanation.summary,
      })
      .eq('id', ramsSubmissionId);

    // 13. Audit log
    await createAuditLog('REVIEW_RAMS', 'rams_submission', ramsSubmissionId, {
      userId: performedByUserId,
      details: {
        decision: scoringResult.decision,
        score: scoringResult.complianceScore,
        checks: comparison.checks.length,
      },
    });

    return {
      success: true,
      reviewId: review.id,
      decision: scoringResult.decision,
      complianceScore: scoringResult.complianceScore,
    };
  } catch (error) {
    logger.error('Orchestrator error', {
      ramsSubmissionId,
      error: error instanceof Error ? error.message : String(error),
    });

    await supabase
      .from('rams_submissions')
      .update({ review_status: 'failed' })
      .eq('id', ramsSubmissionId);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Review orchestration failed',
    };
  }
}
