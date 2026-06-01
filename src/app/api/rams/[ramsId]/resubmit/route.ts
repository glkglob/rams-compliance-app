import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import { canManageProject } from '@/lib/auth/permissions';
import {
  handleAPIError,
  internalServerErrorResponse,
  NotFoundError,
  UnauthorizedError,
} from '@/lib/error-handling';
import { extractTextFromFile } from '@/lib/documents/extract-text';
import { validateFile } from '@/lib/documents/file-validation';
import { setSentryContext } from '@/lib/observability/sentry-context';
import { processRamsChunks } from '@/lib/ai/chunk-pipeline';
import { withRequestContext } from '@/lib/request-context';
import { logger } from '@/lib/logging';

export const maxDuration = 300;

type Context = { params: Promise<{ ramsId: string }> };

/**
 * POST /api/rams/[ramsId]/resubmit
 *
 * Creates a new version of an existing RAMS submission. The new submission:
 * - Links to the original (v1) via parent_submission_id
 * - Inherits project_id, subcontractor_name, trade_package from the original
 * - Gets the next sequential version_number
 * - Undergoes the same extraction + chunk pipeline as a fresh upload
 */
async function postResubmit(request: Request, { params }: Context) {
  try {
    const { ramsId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    // Load the original submission
    const { data: original } = await supabase
      .from('rams_submissions')
      .select('id, project_id, parent_submission_id, subcontractor_name, subcontractor_email, trade_package')
      .eq('id', ramsId)
      .single();

    if (!original) throw new NotFoundError('RAMS submission not found');

    // Resolve the root of the chain — if this is already a child, point to its parent
    const rootId = original.parent_submission_id ?? original.id;

    // Permission: must be a project manager
    const canManage = await canManageProject(original.project_id);
    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    setSentryContext({ userId: user.id, projectId: original.project_id, ramsId });

    // Parse the uploaded file
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const validation = validateFile(file.name, file.type, file.size);
    if (!validation.isSupported) {
      return NextResponse.json(
        { error: 'File validation failed', issues: validation.issues },
        { status: 400 },
      );
    }

    // Get the next version number via the DB helper
    const { data: nextVersion } = await supabase.rpc('next_rams_version_number', {
      p_parent_id: rootId,
    });
    const versionNumber = typeof nextVersion === 'number' ? nextVersion : 2;

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '_')
      .slice(0, 200);
    const storagePath = `${original.project_id}/rams/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      logger.error('Resubmit storage upload failed', { ramsId, error: uploadError.message });
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    const { data: signedUrlData } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 60 * 60);

    // Insert the new version
    const { data: newSubmission, error: insertError } = await supabase
      .from('rams_submissions')
      .insert({
        project_id:            original.project_id,
        parent_submission_id:  rootId,
        version_number:        versionNumber,
        subcontractor_name:    original.subcontractor_name,
        subcontractor_email:   original.subcontractor_email,
        trade_package:         original.trade_package,
        file_name:             file.name,
        file_type:             validation.normalisedFileType,
        file_size:             file.size,
        file_url:              signedUrlData?.signedUrl ?? null,
        storage_path:          storagePath,
        submitted_by:          user.id,
        review_status:         'processing',
      })
      .select()
      .single();

    if (insertError || !newSubmission) {
      logger.error('Failed to insert resubmission', { ramsId, error: insertError?.message });
      return internalServerErrorResponse();
    }

    // Extract text (inline, same as original upload route)
    try {
      const extractionResult = await extractTextFromFile(fileBuffer, file.type, file.name);

      await supabase
        .from('rams_submissions')
        .update({
          extracted_text:   extractionResult.extractedText ?? null,
          review_status:    extractionResult.status === 'complete' ? 'pending' : 'failed',
          confidence_score: extractionResult.confidence,
        })
        .eq('id', newSubmission.id);

      // Fire-and-forget chunk pipeline
      if (extractionResult.status === 'complete' && extractionResult.extractedText) {
        processRamsChunks(newSubmission.id, extractionResult.extractedText).catch((err) => {
          logger.warn('Resubmit chunk pipeline failed (non-fatal)', {
            ramsId: newSubmission.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      await createAuditLog('RESUBMIT_RAMS', 'rams_submission', newSubmission.id, {
        userId: user.id,
        details: {
          parentId: rootId,
          previousVersionId: ramsId,
          versionNumber,
          fileName: file.name,
        },
      });

      return NextResponse.json(
        {
          ...newSubmission,
          review_status: extractionResult.status === 'complete' ? 'pending' : 'failed',
          version_number: versionNumber,
          parent_submission_id: rootId,
        },
        { status: 201 },
      );
    } catch {
      await supabase
        .from('rams_submissions')
        .update({ review_status: 'failed' })
        .eq('id', newSubmission.id);

      return NextResponse.json(
        { ...newSubmission, review_status: 'failed' },
        { status: 201 },
      );
    }
  } catch (error) {
    return handleAPIError(error);
  }
}

export const POST = withRequestContext(postResubmit, '/api/rams/[ramsId]/resubmit');
