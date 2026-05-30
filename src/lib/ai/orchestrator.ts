import { createServerSupabaseWithTimeout } from '@/lib/db/supabase-with-timeout';
import { logger } from '@/lib/logging';
import { createAuditLog } from '@/lib/audit/audit-log';
import { extractRequirements } from '@/lib/ai/agents/requirement-extraction-agent';
import { compareCompliance } from '@/lib/ai/agents/compliance-comparison-agent';
import { generateExplanation } from '@/lib/ai/agents/explanation-agent';
import { generateEmail } from '@/lib/ai/agents/email-generation-agent';
import { calculateComplianceScore } from '@/lib/scoring/calculate-compliance-score';
import { generateEmbeddings } from '@/lib/ai/embeddings';
import { chunkAndEmbedText } from '@/lib/ai/chunking';
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

/**
 * Semantic requirement retrieval using vector search (embeddings + pgvector).
 * Returns the most relevant requirements for the given RAMS text.
 * Falls back to empty array on failure (graceful degradation).
 */
async function getRelevantRequirements(
  supabase: Awaited<ReturnType<typeof createServerSupabaseWithTimeout>>,
  projectId: string,
  ramsText: string,
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
    const documentIds = [...new Set((chunks as any[]).map((c) => c.document_id).filter(Boolean))];

    if (documentIds.length === 0) return [];

    // Load requirements that originated from these relevant documents
    const { data: requirements } = await supabase
      .from('compliance_requirements')
      .select('*')
      .eq('project_id', projectId)
      .in('source_document_id', documentIds);

    if (!requirements?.length) return [];

    return (requirements as RequirementRow[]).map((r) => ({
      requirementCode: r.requirement_code,
      requirementText: r.requirement_text,
      category: r.category,
      severity: r.severity as 'critical' | 'major' | 'minor',
      sourceDocumentId: r.source_document_id ?? '',
      sourceDocumentName: '',
      sourceExcerpt: r.source_excerpt ?? '',
    }));
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

    // Store RAMS chunks with embeddings (if not already stored)
    if (rams.extracted_text && rams.extracted_text.length > 2000) {
      try {
        const { data: existingChunks } = await supabase
          .from('document_chunks')
          .select('id')
          .eq('rams_submission_id', ramsSubmissionId)
          .limit(1);

        if (!existingChunks?.length) {
          const chunked = await chunkAndEmbedText(rams.extracted_text);

          const chunkRows = chunked.map(({ chunk, embedding }) => ({
            rams_submission_id: ramsSubmissionId,
            chunk_text: chunk.text,
            chunk_index: chunk.index,
            embedding,
            created_at: new Date().toISOString(),
          }));

          const { error: chunkInsertError } = await supabase.from('document_chunks').insert(chunkRows);
          if (chunkInsertError) {
            throw new Error(`Failed to save RAMS chunks: ${chunkInsertError.message}`);
          }
          logger.info('Stored RAMS chunks with embeddings', {
            ramsSubmissionId,
            chunks: chunkRows.length,
          });
        }
      } catch (err) {
        logger.warn('Failed to store RAMS chunks (non-critical)', { error: err });
      }
    }

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

    // 3. Get requirements using vector search (preferred) or fallback
    let requirements: ComplianceRequirement[] = [];
    const requirementDbIds = new Map<string, string>();

    // Try semantic retrieval first (P0 improvement)
    const vectorRequirements = await getRelevantRequirements(supabase, project.id, rams.extracted_text);

    if (vectorRequirements.length > 0) {
      requirements = vectorRequirements;
      logger.info('Using vector-based requirement retrieval', {
        ramsSubmissionId,
        requirementsFound: requirements.length,
      });
    } else {
      // Fallback: load existing or extract new
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
    }

    if (requirements.length === 0) {
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
        vectorRetrievalUsed: vectorRequirements.length > 0,
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
