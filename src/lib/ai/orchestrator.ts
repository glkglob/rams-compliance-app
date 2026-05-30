import { createServerSupabaseWithTimeout } from '@/lib/db/supabase-with-timeout';
import { logger } from '@/lib/logging';
import { createAuditLog } from '@/lib/audit/audit-log';
import { extractRequirements } from '@/lib/ai/agents/requirements-extraction-agent';
import { compareCompliance } from '@/lib/ai/agents/compliance-comparison-agent';
import { generateEmbeddings } from '@/lib/ai/embeddings';

// ... (keep existing imports and types)

/**
 * Enhanced requirement retrieval using vector similarity (embeddings).
 * Falls back to full list if vector search returns nothing.
 * This makes scoring much more reproducible and leverages the existing document_chunks + embedding infrastructure.
 */
async function getRelevantRequirements(
  projectId: string,
  ramsText: string,
  topK: number = 25
): Promise<any[]> {
  try {
    // 1. Embed the RAMS text (or first ~2000 chars for speed)
    const queryEmbedding = await generateEmbeddings([ramsText.slice(0, 2000)]);
    if (!queryEmbedding.length) return [];

    const embedding = queryEmbedding[0];

    // 2. Vector similarity search against document_chunks (which are linked to compliance docs/requirements)
    const { data: similarChunks, error } = await supabase
      .rpc('match_document_chunks', {
        query_embedding: embedding,
        match_threshold: 0.72,
        match_count: topK,
        filter_project_id: projectId,
      });

    if (error || !similarChunks?.length) {
      // Fallback: return all requirements for the project (original behavior)
      const { data: allReqs } = await supabase
        .from('compliance_requirements')
        .select('*')
        .eq('project_id', projectId)
        .limit(80);
      return allReqs || [];
    }

    // 3. Map back to requirements (via source_document_id or chunk metadata if enriched later)
    // For now we return the chunks; the comparison agent can use the chunk_text + original requirements
    return similarChunks;
  } catch (err) {
    logger.warn('Vector requirement retrieval failed, falling back to full list', { error: String(err) });
    const { data: allReqs } = await supabase
      .from('compliance_requirements')
      .select('*')
      .eq('project_id', projectId)
      .limit(80);
    return allReqs || [];
  }
}

// Inside orchestrateRAMSReview, replace or augment the requirements loading section:

// BEFORE (original):
// const { data: existingRequirements } = await supabase.from('compliance_requirements')...

// NEW (hybrid):
let requirements: any[] = [];

// Try vector-enhanced retrieval first
if (rams.extracted_text) {
  const relevant = await getRelevantRequirements(project.id, rams.extracted_text);
  if (relevant.length > 0) {
    requirements = relevant;
  }
}

if (requirements.length === 0) {
  // existing fallback logic to extractRequirements(...) or load all
  // ... (keep your current fallback)
}

// Then proceed with compareCompliance(requirements, rams.extracted_text) as before.
// The comparison agent now receives higher-signal, relevant context first.

// Note: For full production quality we should also embed & store chunks of the RAMS itself
// into document_chunks when a new rams_submission is created. That is the logical next step.