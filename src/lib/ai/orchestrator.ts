import { createServerSupabase } from '@/lib/db/supabase-server';
import { extractRequirements } from '@/lib/ai/agents/requirement-extraction-agent';
import { analyzeRAMS } from '@/lib/ai/agents/rams-analysis-agent';
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
  ramsSubmissionId: string
): Promise<ReviewResult> {
  const supabase = await createServerSupabase();

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

    const { data: existingRequirements } = await supabase
      .from('compliance_requirements')
      .select('*')
      .eq('project_id', project.id);

    if (existingRequirements && existingRequirements.length > 0) {
      requirements = existingRequirements.map(r => ({
        requirementCode: r.requirement_code,
        requirementText: r.requirement_text,
        category: r.category,
        severity: r.severity,
        sourceDocumentId: r.source_document_id,
        sourceDocumentName: '',
        sourceExcerpt: r.source_excerpt,
      }));
    } else {
      const extractionResult = await extractRequirements({
        projectId: project.id,
        documents: complianceDocs.map(doc => ({
          documentId: doc.id,
          fileName: doc.file_name,
          category: doc.document_category,
          text: doc.extracted_text || '',
        })),
      });

      requirements = extractionResult.requirements;

      for (const req of requirements) {
        await supabase.from('compliance_requirements').insert({
          project_id: project.id,
          source_document_id: req.sourceDocumentId,
          requirement_code: req.requirementCode,
          requirement_text: req.requirementText,
          category: req.category,
          severity: req.severity,
          source_excerpt: req.sourceExcerpt,
        });
      }
    }

    if (requirements.length === 0) {
      return { success: false, error: 'No requirements could be extracted' };
    }

    // 4. Analyze RAMS content
    await analyzeRAMS(rams.extracted_text);

    // 5. Compare RAMS against requirements
    const comparison = await compareCompliance(requirements, rams.extracted_text);

    // 6. Calculate compliance score
    const scoringResult = calculateComplianceScore(
      comparison.checks,
      project.compliance_threshold,
      rams.extraction_confidence ?? undefined
    );

    // 7. Generate explanation
    const explanation = await generateExplanation(
      scoringResult.complianceScore,
      scoringResult.threshold,
      scoringResult.decision,
      comparison.checks
    );

    // 8. Generate email draft
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

    // 9. Save review results
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

    // 10. Save review checks
    for (const check of comparison.checks) {
      const matchedReq = requirements.find(r => r.requirementCode === check.requirementId);
      await supabase.from('review_checks').insert({
        rams_review_id: review.id,
        requirement_id: matchedReq?.requirementCode,
        status: check.status,
        severity: check.severity,
        score: check.score,
        rams_evidence: check.ramsEvidence,
        explanation: check.explanation,
      });
    }

    // 11. Save email draft
    const { error: emailError } = await supabase.from('generated_emails').insert({
      rams_submission_id: ramsSubmissionId,
      subject: email.subject,
      body: email.body,
      sent: false,
    });

    if (emailError) {
      console.error('Failed to save email draft:', emailError);
    }

    // 12. Update RAMS submission
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
    await supabase.from('audit_logs').insert({
      action: 'REVIEW_RAMS',
      entity_type: 'rams_submission',
      entity_id: ramsSubmissionId,
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
    console.error('Orchestrator error:', error);

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
