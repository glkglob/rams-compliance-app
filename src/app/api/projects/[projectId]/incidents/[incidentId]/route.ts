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
import { getAttachmentSignedUrl } from '@/lib/attachments/storage';
import { logger } from '@/lib/logging';

type Context = { params: Promise<{ projectId: string; incidentId: string }> };

// ── GET ────────────────────────────────────────────────────────────────────────

async function getIncident(_request: Request, { params }: Context) {
  try {
    const { projectId, incidentId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data: membership } = await supabase
      .from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).single();
    if (!membership) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!p || p.role !== 'admin') throw new ForbiddenError();
    }

    const { data: incident } = await supabase
      .from('incidents')
      .select('*, incident_parties (*)')
      .eq('id', incidentId)
      .eq('project_id', projectId)
      .single();

    if (!incident) throw new NotFoundError('Incident not found');

    // Load related RAMS info if linked
    let relatedRams = null;
    if (incident.related_rams_submission_id) {
      const { data } = await supabase
        .from('rams_submissions')
        .select('id, subcontractor_name, file_name, review_status, compliance_score')
        .eq('id', incident.related_rams_submission_id)
        .single();
      relatedRams = data;
    }

    // Attachments with signed URLs
    const { data: attachmentRows } = await supabase
      .from('attachments')
      .select('id, file_name, storage_path, file_size, mime_type, created_at')
      .eq('parent_type', 'incident')
      .eq('parent_id', incidentId)
      .order('created_at', { ascending: false });

    const attachments = await Promise.all(
      (attachmentRows ?? []).map(async (a: { storage_path: string; [k: string]: unknown }) => ({
        ...a,
        url: await getAttachmentSignedUrl(supabase, a.storage_path),
      })),
    );

    return NextResponse.json({ ...incident, relatedRams, attachments });
  } catch (error) {
    return handleAPIError(error);
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────────────

const updateIncidentSchema = z.object({
  status: z.enum(['draft', 'reported', 'under_investigation', 'closed', 'riddor_notified']).optional(),
  severity: z.enum(['near_miss', 'minor', 'major', 'specified_injury', 'dangerous_occurrence', 'fatality']).optional(),
  rootCause: z.string().optional(),
  correctiveActions: z.string().optional(),
  riddorReference: z.string().optional(),
  riddorReportable: z.boolean().optional(),
  description: z.string().optional(),
});

async function patchIncident(request: Request, { params }: Context) {
  try {
    const { projectId, incidentId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data: incident } = await supabase
      .from('incidents').select('id, reported_by, project_id').eq('id', incidentId).eq('project_id', projectId).single();
    if (!incident) throw new NotFoundError('Incident not found');

    // Reporter or manager
    if (incident.reported_by !== user.id) {
      const { data: membership } = await supabase
        .from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).single();
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isManager = membership && ['admin', 'principal_designer', 'principal_contractor', 'project_manager'].includes(membership.role);
      if (!isManager && profile?.role !== 'admin') throw new ForbiddenError();
    }

    setSentryContext({ userId: user.id, projectId });

    const body = await request.json();
    const parsed = updateIncidentSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.issues);

    const updates: Record<string, unknown> = {};
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.severity) updates.severity = parsed.data.severity;
    if (parsed.data.rootCause !== undefined) updates.root_cause = parsed.data.rootCause;
    if (parsed.data.correctiveActions !== undefined) updates.corrective_actions = parsed.data.correctiveActions;
    if (parsed.data.riddorReference !== undefined) updates.riddor_reference = parsed.data.riddorReference;
    if (parsed.data.riddorReportable !== undefined) updates.riddor_reportable = parsed.data.riddorReportable;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase.from('incidents').update(updates).eq('id', incidentId);
      if (updateError) {
        logger.error('Failed to update incident', { error: updateError.message });
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
      }
    }

    await createAuditLog('UPDATE_INCIDENT', 'incident', incidentId, {
      userId: user.id,
      details: updates,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const GET = withRequestContext(getIncident, '/api/projects/[projectId]/incidents/[incidentId]');
export const PATCH = withRequestContext(patchIncident, '/api/projects/[projectId]/incidents/[incidentId]');
