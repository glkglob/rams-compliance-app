import { createServerSupabaseWithTimeout } from '@/lib/db/supabase-with-timeout';
import { logger } from '@/lib/logging';
import { createAuditLog } from '@/lib/audit/audit-log';
import { extractRequirements } from '@/lib/ai/agents/requirement-extraction-agent';
import { compareCompliance } from '@/lib/ai/agents/compliance-comparison-agent';
import { generateExplanation } from '@/lib/ai/agents/explanation-agent';
import { generateEmail } from '@/lib/ai/agents/email-generation-agent';
import { calculateComplianceScore } from '@/lib/scoring/calculate-compliance-score';
import { generateEmbeddings } from '@/lib/ai/embeddings';
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

interface PersistedReviewCheckRow {
  requirement_id: string;
  status: ComplianceCheck['status'];
  severity: ComplianceCheck['severity'];
  score: number;
  rams_evidence: string;
  explanation: string;
}

/**
 * Semantic requirement retrieval using vector search (embeddings + pgvector).
 * Returns the most relevant requirements for the given RAMS text.
 * Falls back to empty array on failure (graceful degradation).
 */
async function getRelevantRequirements(
  supabase: Awaited<ReturnType<typeof createServerSupabaseWithTimeout>>,
  projectId: string,
  ramsText: string,
  requirementDbIds: Map<string, string>,
  topK = 30
): Promise<ComplianceRequirement[]> {
  try {
    // Embed a prefix of the RAMS text (sufficient for retrieval)
    const embeddings = await generateEmbeddings([ramsText.slice(0, 2000)]);
    if (!embeddings.length) return [];

    const queryEmbedding = embeddings[0];

    // Use existing vector search RPC on document_chunks
    const { data: chunks, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.68,
      match_count: topK,
      filter_project_id: projectId,
    });

    if (error || !chunks?.length) {
      logger.warn('Vector search returned no results or failed', { error });
      return [];
    }

    // Get unique source document IDs from the relevant chunks
    const typedChunks = chunks as Array<{ document_id?: string }>;
    const documentIds = [...new Set(typedChunks.map((c) => c.document_id).filter(Boolean))];

    if (documentIds.length === 0) return [];

    // Load requirements that originated from these relevant documents
    const { data: requirements, error: reqLoadError } = await supabase
      .from('compliance_requirements')
      .select('*')
      .eq('project_id', projectId)
      .in('source_document_id', documentIds);

    if (reqLoadError) {
      logger.warn('Failed to load requirements for vector-matched documents', { error: reqLoadError.message });
      return [];
    }
    if (!requirements?.length) return [];

    return (requirements as RequirementRow[]).map((r) => {
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
  } catch (err) {
    logger.warn('Vector requirement retrieval failed (graceful fallback)', { error: err });
    return [];
  }
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
    if (!project) {
      return { success: false, error: 'RAMS project not found' };
    }

    // Idempotency/concurrency guard: only one analysis may be in progress for a
    // RAMS record. The final review write set is persisted atomically later via
    // persist_rams_review_result().
    const { data: startedReview, error: startError } = await supabase
      .from('rams_submissions')
      .update({ review_status: 'processing' })
      .eq('id', ramsSubmissionId)
      .neq('review_status', 'processing')
      .select('id')
      .maybeSingle();

    if (startError) {
      throw new Error(`Failed to mark RAMS review as processing: ${startError.message}`);
    }

    if (!startedReview) {
      return { success: false, error: 'RAMS review is already processing' };
    }

    // 2. Load compliance documents
    const { data: complianceDocs, error: complianceDocsError } = await supabase
      .from('compliance_documents')
      .select('id, file_name, document_category, extracted_text')
      .eq('project_id', project.id)
      .eq('extraction_status', 'complete');

    if (complianceDocsError) {
      throw new Error(`Failed to load compliance documents: ${complianceDocsError.message}`);
    }

    if (!complianceDocs?.length) {
      const { error: statusErr } = await supabase
        .from('rams_submissions')
        .update({
          review_status: 'manual_review',
          decision_explanation: 'No extracted compliance documents were available for automated review.',
        })
        .eq('id', ramsSubmissionId);
      if (statusErr) {
        throw new Error(`Failed to set manual_review status: ${statusErr.message}`);
      }

      await createAuditLog('REVIEW_RAMS_FAILED', 'rams_submission', ramsSubmissionId, {
        userId: performedByUserId,
        details: {
          reason: 'No compliance documents available',
          integrityAction: 'manual_review_status_recorded',
        },
      });

      return { success: true, decision: 'manual_review', error: 'No compliance documents available' };
    }

    // 3. Get requirements using vector search (preferred) or fallback
    let requirements: ComplianceRequirement[] = [];
    const requirementDbIds = new Map<string, string>();

    // Try semantic retrieval first (P0 improvement)
    const vectorRequirements = await getRelevantRequirements(
      supabase,
      project.id,
      rams.extracted_text,
      requirementDbIds
    );

    if (vectorRequirements.length > 0) {
      requirements = vectorRequirements;
      logger.info('Using vector-based requirement retrieval', {
        ramsSubmissionId,
        requirementsFound: requirements.length,
      });
    } else {
      // Fallback: load existing or extract new
      const { data: existingReqs, error: existingReqsError } = await supabase
        .from('compliance_requirements')
        .select('*')
        .eq('project_id', project.id);

      if (existingReqsError) {
        throw new Error(`Failed to load compliance requirements: ${existingReqsError.message}`);
      }

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
          const { data: inserted, error: insertReqError } = await supabase
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

          if (insertReqError) {
            throw new Error(`Failed to persist extracted requirements: ${insertReqError.message}`);
          }

          const insertedRows = inserted as InsertedRequirementRow[] | null;
          if (!insertedRows?.length) {
            throw new Error('Persisted extracted requirements but no IDs were returned');
          }

          insertedRows.forEach((row) => requirementDbIds.set(row.requirement_code, row.id));
        }
      }
    }

    if (requirements.length === 0) {
      const { error: statusErr } = await supabase
        .from('rams_submissions')
        .update({
          review_status: 'manual_review',
          decision_explanation: 'No compliance requirements were available for automated review.',
        })
        .eq('id', ramsSubmissionId);

      if (statusErr) {
        throw new Error(`Failed to set manual_review status: ${statusErr.message}`);
      }

      await createAuditLog('REVIEW_RAMS_FAILED', 'rams_submission', ramsSubmissionId, {
        userId: performedByUserId,
        details: {
          reason: 'No requirements available for comparison',
          integrityAction: 'manual_review_status_recorded',
        },
      });

      return { success: false, error: 'No requirements available for comparison' };
    }

    // 4. Prepare RAMS text for comparison (P0: Chunked extraction for long documents)
    let ramsTextForAnalysis = rams.extracted_text;
    const MAX_ANALYSIS_CHARS = 12000; // ~3000 tokens safe limit for high-quality comparison

    if (ramsTextForAnalysis.length > MAX_ANALYSIS_CHARS) {
      // Use existing chunking utility for better context preservation
      const { chunkText } = await import('@/lib/documents/chunk-text');
      const chunks = chunkText(ramsTextForAnalysis, 3000, 400); // 3000 char chunks with 400 overlap

      // Take the first few most important chunks (beginning + middle for context)
      const selectedChunks = [
        chunks[0]?.text || '',
        chunks[Math.floor(chunks.length / 2)]?.text || '',
        chunks[chunks.length - 1]?.text || '',
      ].filter(Boolean);

      ramsTextForAnalysis = selectedChunks.join('\n\n[...]\n\n');
      logger.info('Long RAMS text chunked for analysis', {
        originalLength: rams.extracted_text.length,
        chunksUsed: selectedChunks.length,
      });
    }

    // 5. Run comparison (on potentially chunked/summarized text)
    const comparison: ComplianceComparisonOutput = await compareCompliance(requirements, ramsTextForAnalysis);

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

    const checkRows = comparison.checks.flatMap((check: ComplianceCheck): PersistedReviewCheckRow[] => {
      const requirementId = requirementDbIds.get(check.requirementId);
      if (!requirementId) return [];

      return [{
        requirement_id: requirementId,
        status: check.status,
        severity: check.severity,
        score: check.score,
        rams_evidence: check.ramsEvidence,
        explanation: check.explanation,
      }];
    });

    if (comparison.checks.length > 0 && checkRows.length === 0) {
      throw new Error('No comparison checks could be linked to persisted compliance requirements');
    }

    // Atomic integrity boundary: the database function writes the review,
    // checks, email draft, RAMS summary, and audit log in one transaction.
    const { data: reviewId, error: persistError } = await supabase.rpc('persist_rams_review_result', {
      p_rams_submission_id: ramsSubmissionId,
      p_review_status: scoring.decision,
      p_compliance_score: scoring.complianceScore,
      p_confidence_score: scoring.confidenceScore,
      p_decision_explanation: explanation.summary,
      p_email_subject: emailDraft.subject,
      p_email_body: emailDraft.body,
      p_reviewed_by: performedByUserId ?? null,
      p_checks: checkRows,
      p_audit_details: {
        decision: scoring.decision,
        score: scoring.complianceScore,
        checks: comparison.checks.length,
        persistedChecks: checkRows.length,
        vectorRetrievalUsed: vectorRequirements.length > 0,
        atomicPersistence: true,
      },
    });

    if (persistError || !reviewId) {
      throw new Error(`Failed to atomically persist RAMS review: ${persistError?.message ?? 'no review id returned'}`);
    }

    return {
      success: true,
      reviewId: String(reviewId),
      decision: scoring.decision,
      complianceScore: scoring.complianceScore,
      confidenceScore: scoring.confidenceScore,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('orchestrateRAMSReview failed', { ramsSubmissionId, error: message });

    const { error: failErr } = await supabase
      .from('rams_submissions')
      .update({ review_status: 'failed' })
      .eq('id', ramsSubmissionId);
    if (failErr) {
      logger.error('Also failed to mark RAMS as failed', { ramsSubmissionId, error: failErr.message });
    }

    try {
      await createAuditLog('REVIEW_RAMS_FAILED', 'rams_submission', ramsSubmissionId, {
        userId: performedByUserId,
        details: {
          error: message,
          integrityAction: failErr ? 'failed_status_update_failed' : 'failed_status_recorded',
        },
      });
    } catch (auditError) {
      logger.error('Failed to record RAMS review failure audit log', {
        ramsSubmissionId,
        error: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }

    return { success: false, error: message };
  }
}
