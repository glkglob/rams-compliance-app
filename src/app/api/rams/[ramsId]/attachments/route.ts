import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import { handleAPIError, UnauthorizedError, NotFoundError } from '@/lib/error-handling';
import { setSentryContext } from '@/lib/observability/sentry-context';
import { logger } from '@/lib/logging';
import { withRequestContext } from '@/lib/request-context';
import {
  ATTACHMENTS_BUCKET,
  ATTACHMENT_ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_SIZE,
  buildAttachmentStoragePath,
  getAttachmentSignedUrl,
} from '@/lib/attachments/storage';
import { sanitiseFilename } from '@/lib/documents/file-validation';

type Context = { params: Promise<{ ramsId: string }> };

// ── GET — list attachments ─────────────────────────────────────────────────────

async function getAttachments(_request: Request, { params }: Context) {
  try {
    const { ramsId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    // Verify the RAMS submission exists and the user can see it
    const { data: rams } = await supabase
      .from('rams_submissions')
      .select('project_id')
      .eq('id', ramsId)
      .single();

    if (!rams) throw new NotFoundError('RAMS submission not found');

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', rams.project_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      // Admins can still view — but 403 for everyone else
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (!profile || profile.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    setSentryContext({ userId: user.id, projectId: rams.project_id, ramsId });

    const { data: rows, error: listError } = await supabase
      .from('attachments')
      .select('id, file_name, storage_path, file_size, mime_type, uploaded_by, created_at')
      .eq('parent_type', 'rams_submission')
      .eq('parent_id', ramsId)
      .order('created_at', { ascending: false });

    if (listError) {
      logger.error('Failed to list attachments', { ramsId, error: listError.message });
      return NextResponse.json({ error: 'Failed to load attachments' }, { status: 500 });
    }

    // Attach short-lived signed URLs (never stored in DB)
    const attachments = await Promise.all(
      (rows ?? []).map(async (row: { storage_path: string; [k: string]: unknown }) => ({
        ...row,
        url: await getAttachmentSignedUrl(supabase, row.storage_path),
      })),
    );

    return NextResponse.json(attachments, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}

// ── POST — upload attachment ───────────────────────────────────────────────────

async function postAttachment(request: Request, { params }: Context) {
  try {
    const { ramsId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    // Membership gate — must be a project member to attach
    const { data: rams } = await supabase
      .from('rams_submissions')
      .select('project_id')
      .eq('id', ramsId)
      .single();

    if (!rams) throw new NotFoundError('RAMS submission not found');

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', rams.project_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    setSentryContext({ userId: user.id, projectId: rams.project_id, ramsId });

    // Parse multipart body
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

    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      return NextResponse.json(
        { error: `File exceeds the 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)` },
        { status: 400 },
      );
    }

    const mimeType = file.type || 'application/octet-stream';
    if (!ATTACHMENT_ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: `File type "${mimeType}" is not supported` },
        { status: 400 },
      );
    }

    const attachmentId = crypto.randomUUID();
    const storagePath = buildAttachmentStoragePath(
      'rams_submission',
      ramsId,
      attachmentId,
      sanitiseFilename(file.name),
    );

    const buffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      logger.error('Attachment storage upload failed', { ramsId, error: uploadError.message });
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: row, error: insertError } = await supabase
      .from('attachments')
      .insert({
        id: attachmentId,
        parent_type: 'rams_submission',
        parent_id: ramsId,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: mimeType,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      // Roll back the storage upload — best effort
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
      logger.error('Attachment DB insert failed', { ramsId, error: insertError.message });
      return NextResponse.json({ error: 'Failed to save attachment record' }, { status: 500 });
    }

    await createAuditLog('UPLOAD_ATTACHMENT', 'rams_submission', ramsId, {
      userId: user.id,
      details: { attachmentId, fileName: file.name, fileSize: file.size },
    }).catch(() => {/* non-fatal */});

    return NextResponse.json(
      { ...row, url: await getAttachmentSignedUrl(supabase, storagePath) },
      { status: 201 },
    );
  } catch (error) {
    return handleAPIError(error);
  }
}

export const GET = withRequestContext(getAttachments, '/api/rams/[ramsId]/attachments');
export const POST = withRequestContext(postAttachment, '/api/rams/[ramsId]/attachments');
