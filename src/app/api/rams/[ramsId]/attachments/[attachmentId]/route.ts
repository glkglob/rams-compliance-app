import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import { handleAPIError, UnauthorizedError, NotFoundError } from '@/lib/error-handling';
import { setSentryContext } from '@/lib/observability/sentry-context';
import { isAdminRole } from '@/lib/auth/roles';
import { logger } from '@/lib/logging';
import { withRequestContext } from '@/lib/request-context';
import { ATTACHMENTS_BUCKET } from '@/lib/attachments/storage';

type Context = { params: Promise<{ ramsId: string; attachmentId: string }> };

async function deleteAttachment(_request: Request, { params }: Context) {
  try {
    const { ramsId, attachmentId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    // Load attachment and verify it belongs to this RAMS
    const { data: attachment } = await supabase
      .from('attachments')
      .select('id, storage_path, uploaded_by, parent_id, file_name')
      .eq('id', attachmentId)
      .eq('parent_type', 'rams_submission')
      .eq('parent_id', ramsId)
      .single();

    if (!attachment) throw new NotFoundError('Attachment not found');

    // Load the RAMS to get project_id for permission checks
    const { data: rams } = await supabase
      .from('rams_submissions')
      .select('project_id')
      .eq('id', ramsId)
      .single();

    if (!rams) throw new NotFoundError('RAMS submission not found');

    setSentryContext({ userId: user.id, projectId: rams.project_id, ramsId });

    // Permission: uploader, project manager, or global admin
    const isOwner = attachment.uploaded_by === user.id;
    if (!isOwner) {
      // Check project management role or global admin
      const { data: membership } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', rams.project_id)
        .eq('user_id', user.id)
        .single();

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const canManage =
        (membership && ['admin', 'client', 'principal_designer', 'principal_contractor', 'project_manager'].includes(membership.role)) ||
        isAdminRole(profile?.role);

      if (!canManage) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Delete from storage first, then from DB (storage is harder to restore)
    const { error: storageError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .remove([attachment.storage_path]);

    if (storageError) {
      logger.error('Failed to delete attachment from storage', {
        attachmentId,
        storagePath: attachment.storage_path,
        error: storageError.message,
      });
      return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
    }

    const { error: deleteError } = await supabase
      .from('attachments')
      .delete()
      .eq('id', attachmentId);

    if (deleteError) {
      logger.error('Failed to delete attachment record', { attachmentId, error: deleteError.message });
      return NextResponse.json({ error: 'Failed to delete attachment record' }, { status: 500 });
    }

    await createAuditLog('DELETE_ATTACHMENT', 'rams_submission', ramsId, {
      userId: user.id,
      details: { attachmentId, fileName: attachment.file_name },
    }).catch(() => {/* non-fatal */});

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const DELETE = withRequestContext(deleteAttachment, '/api/rams/[ramsId]/attachments/[attachmentId]');
