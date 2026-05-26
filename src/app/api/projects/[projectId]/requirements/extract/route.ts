import { NextResponse } from 'next/server';

import { createAuditLog } from '@/lib/audit/audit-log';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { handleAPIError, UnauthorizedError } from '@/lib/error-handling';
import { extractRequirements } from '@/lib/ai/agents/requirement-extraction-agent';
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit';

export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new UnauthorizedError();
    }

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allowedRoles = ['admin', 'project_manager'];
    if (!allowedRoles.includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rl = await checkRateLimit(user.id, 'requirements-extract');
    if (!rl.allowed) {
      return rateLimitExceeded(rl.resetMs);
    }

    const { data: documents, error: docsError } = await supabase
      .from('compliance_documents')
      .select('*')
      .eq('project_id', projectId)
      .eq('extraction_status', 'complete');

    if (docsError || !documents || documents.length === 0) {
      return NextResponse.json(
        { error: 'No documents with extracted text found' },
        { status: 400 }
      );
    }

    const extractionResult = await extractRequirements({
      projectId,
      documents: documents.map(doc => ({
        documentId: doc.id,
        fileName: doc.file_name,
        category: doc.document_category,
        text: doc.extracted_text || '',
      })),
    });

    // Replace existing requirements for this project
    await supabase
      .from('compliance_requirements')
      .delete()
      .eq('project_id', projectId);

    const { data: insertedRequirements, error: insertError } = await supabase
      .from('compliance_requirements')
      .insert(
        extractionResult.requirements.map(req => ({
          project_id: projectId,
          source_document_id: req.sourceDocumentId,
          requirement_code: req.requirementCode,
          requirement_text: req.requirementText,
          category: req.category,
          severity: req.severity,
          source_excerpt: req.sourceExcerpt,
        }))
      )
      .select();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    createAuditLog('EXTRACT_REQUIREMENTS', 'project', projectId, {
      userId: user.id,
      details: {
        requirementsExtracted: insertedRequirements?.length ?? 0,
        documentsProcessed: documents.length,
      },
    });

    return NextResponse.json({
      success: true,
      requirements: insertedRequirements,
      count: insertedRequirements?.length ?? 0,
    }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
