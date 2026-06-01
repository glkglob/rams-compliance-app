import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import {
  handleAPIError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  validationErrorResponse,
} from '@/lib/error-handling';
import { setSentryContext } from '@/lib/observability/sentry-context';
import { withRequestContext } from '@/lib/request-context';
import { getAttachmentSignedUrl, ATTACHMENTS_BUCKET, buildAttachmentStoragePath } from '@/lib/attachments/storage';
import { sanitiseFilename } from '@/lib/documents/file-validation';
import { logger } from '@/lib/logging';

type Context = { params: Promise<{ projectId: string; inspectionId: string }> };

// ── GET — single inspection with items + attachments ──────────────────────────

async function getInspection(_request: Request, { params }: Context) {
  try {
    const { projectId, inspectionId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single();
    if (!membership) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!p || p.role !== 'admin') throw new ForbiddenError();
    }

    const { data: inspection } = await supabase
      .from('inspections')
      .select('*, inspection_items (id, item_index, label, category, result, notes)')
      .eq('id', inspectionId)
      .eq('project_id', projectId)
      .single();

    if (!inspection) throw new NotFoundError('Inspection not found');

    // Load photo attachments
    const { data: attachmentRows } = await supabase
      .from('attachments')
      .select('id, file_name, storage_path, file_size, mime_type, created_at')
      .eq('parent_type', 'inspection')
      .eq('parent_id', inspectionId)
      .order('created_at', { ascending: false });

    const attachments = await Promise.all(
      (attachmentRows ?? []).map(async (a: { storage_path: string; [k: string]: unknown }) => ({
        ...a,
        url: await getAttachmentSignedUrl(supabase, a.storage_path),
      })),
    );

    return NextResponse.json({ ...inspection, attachments });
  } catch (error) {
    return handleAPIError(error);
  }
}

// ── PATCH — update inspection (status, items, notes) ──────────────────────────

const updateItemSchema = z.object({
  id: z.string().uuid(),
  result: z.enum(['pass', 'fail', 'na', 'not_checked']),
  notes: z.string().optional(),
});

const updateInspectionSchema = z.object({
  status: z.enum(['draft', 'in_progress', 'completed', 'failed']).optional(),
  notes: z.string().optional(),
  items: z.array(updateItemSchema).optional(),
});

async function patchInspection(request: Request, { params }: Context) {
  try {
    const { projectId, inspectionId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data: inspection } = await supabase
      .from('inspections')
      .select('id, inspector_id, project_id, status')
      .eq('id', inspectionId)
      .eq('project_id', projectId)
      .single();

    if (!inspection) throw new NotFoundError('Inspection not found');

    // Only the inspector or a project manager can update
    if (inspection.inspector_id !== user.id) {
      const { data: membership } = await supabase
        .from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).single();
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single();

      const isManager = membership && ['admin', 'principal_designer', 'principal_contractor', 'project_manager'].includes(membership.role);
      if (!isManager && profile?.role !== 'admin') throw new ForbiddenError();
    }

    setSentryContext({ userId: user.id, projectId, documentId: inspectionId });

    const body = await request.json();
    const parsed = updateInspectionSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.issues);

    const { status, notes, items } = parsed.data;

    // Update inspection metadata
    const updates: Record<string, unknown> = {};
    if (status) {
      updates.status = status;
      if (status === 'completed') updates.completed_at = new Date().toISOString();
    }
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('inspections')
        .update(updates)
        .eq('id', inspectionId);

      if (updateError) {
        logger.error('Failed to update inspection', { error: updateError.message });
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
      }
    }

    // Update individual items
    if (items?.length) {
      for (const item of items) {
        await supabase
          .from('inspection_items')
          .update({ result: item.result, notes: item.notes ?? null })
          .eq('id', item.id)
          .eq('inspection_id', inspectionId);
      }
    }

    await createAuditLog('UPDATE_INSPECTION', 'inspection', inspectionId, {
      userId: user.id,
      details: { status, itemsUpdated: items?.length ?? 0 },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAPIError(error);
  }
}

// ── POST — upload photo attachment to inspection ──────────────────────────────

async function postPhoto(request: Request, { params }: Context) {
  try {
    const { projectId, inspectionId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data: inspection } = await supabase
      .from('inspections')
      .select('id, project_id')
      .eq('id', inspectionId)
      .eq('project_id', projectId)
      .single();
    if (!inspection) throw new NotFoundError('Inspection not found');

    const { data: membership } = await supabase
      .from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).single();
    if (!membership) throw new ForbiddenError();

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File exceeds 25 MB limit' }, { status: 400 });
    }

    const attachmentId = crypto.randomUUID();
    const storagePath = buildAttachmentStoragePath(
      'inspection', inspectionId, attachmentId, sanitiseFilename(file.name),
    );

    const buffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, buffer, { contentType: file.type || 'image/jpeg', upsert: false });

    if (uploadError) {
      logger.error('Inspection photo upload failed', { error: uploadError.message });
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: row, error: insertError } = await supabase
      .from('attachments')
      .insert({
        id: attachmentId,
        parent_type: 'inspection',
        parent_id: inspectionId,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type || 'image/jpeg',
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
      return NextResponse.json({ error: 'Failed to save attachment' }, { status: 500 });
    }

    return NextResponse.json(
      { ...row, url: await getAttachmentSignedUrl(supabase, storagePath) },
      { status: 201 },
    );
  } catch (error) {
    return handleAPIError(error);
  }
}

export const GET = withRequestContext(getInspection, '/api/projects/[projectId]/inspections/[inspectionId]');
export const PATCH = withRequestContext(patchInspection, '/api/projects/[projectId]/inspections/[inspectionId]');
export const POST = withRequestContext(postPhoto, '/api/projects/[projectId]/inspections/[inspectionId]');
