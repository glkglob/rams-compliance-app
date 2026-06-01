import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import { handleAPIError, UnauthorizedError, validationErrorResponse } from '@/lib/error-handling';
import { setSentryContext } from '@/lib/observability/sentry-context';
import { withRequestContext } from '@/lib/request-context';
import { logger } from '@/lib/logging';

type Context = { params: Promise<{ projectId: string }> };

const partySchema = z.object({
  role: z.enum(['injured_person', 'witness', 'first_aider', 'reporter', 'investigator']),
  full_name: z.string().min(1),
  company: z.string().optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
});

const createIncidentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  severity: z.enum(['near_miss', 'minor', 'major', 'specified_injury', 'dangerous_occurrence', 'fatality']).default('near_miss'),
  occurredAt: z.string().optional(), // ISO timestamp
  location: z.string().optional(),
  relatedRamsSubmissionId: z.string().uuid().optional(),
  riddorReportable: z.boolean().optional().default(false),
  parties: z.array(partySchema).optional(),
});

// ── GET ────────────────────────────────────────────────────────────────────────

async function getIncidents(_request: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data: membership } = await supabase
      .from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).single();
    if (!membership) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!p || p.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('incidents')
      .select('*, incident_parties (*)')
      .eq('project_id', projectId)
      .order('occurred_at', { ascending: false });

    if (error) {
      logger.error('Failed to list incidents', { error: error.message });
      return NextResponse.json({ error: 'Failed to load incidents' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    return handleAPIError(error);
  }
}

// ── POST ───────────────────────────────────────────────────────────────────────

async function postIncident(request: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data: membership } = await supabase
      .from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).single();
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    setSentryContext({ userId: user.id, projectId });

    const body = await request.json();
    const parsed = createIncidentSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.issues);

    const { title, description, severity, occurredAt, location, relatedRamsSubmissionId, riddorReportable, parties } = parsed.data;

    const { data: incident, error: insertError } = await supabase
      .from('incidents')
      .insert({
        project_id: projectId,
        related_rams_submission_id: relatedRamsSubmissionId ?? null,
        title,
        description: description ?? null,
        severity,
        status: 'reported',
        occurred_at: occurredAt ?? new Date().toISOString(),
        location: location ?? null,
        riddor_reportable: riddorReportable,
        reported_by: user.id,
      })
      .select()
      .single();

    if (insertError || !incident) {
      logger.error('Failed to create incident', { error: insertError?.message });
      return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 });
    }

    // Insert parties
    if (parties?.length) {
      const { error: partiesError } = await supabase.from('incident_parties').insert(
        parties.map((p) => ({
          incident_id: incident.id,
          role: p.role,
          full_name: p.full_name,
          company: p.company ?? null,
          contact: p.contact ?? null,
          notes: p.notes ?? null,
        })),
      );
      if (partiesError) logger.error('Failed to insert incident parties', { error: partiesError.message });
    }

    await createAuditLog('CREATE_INCIDENT', 'incident', incident.id, {
      userId: user.id,
      details: { title, severity, riddorReportable, relatedRams: relatedRamsSubmissionId },
    }).catch(() => {});

    return NextResponse.json(incident, { status: 201 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const GET = withRequestContext(getIncidents, '/api/projects/[projectId]/incidents');
export const POST = withRequestContext(postIncident, '/api/projects/[projectId]/incidents');
