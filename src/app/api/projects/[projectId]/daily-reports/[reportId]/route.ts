import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import { generateDailyReportPdf } from '@/lib/reports/daily-report';
import {
  handleAPIError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  validationErrorResponse,
} from '@/lib/error-handling';
import { setSentryContext } from '@/lib/observability/sentry-context';
import { withRequestContext } from '@/lib/request-context';
import { canViewProject, canManageProject, isAdmin } from '@/lib/auth/permissions';

export const maxDuration = 60;

type Context = { params: Promise<{ projectId: string; reportId: string }> };

// ── GET — single report or PDF export ──────────────────────────────────────────

async function getReport(request: Request, { params }: Context) {
  try {
    const { projectId, reportId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const canView = await canViewProject(projectId);
    const admin = await isAdmin();
    if (!canView && !admin) {
      throw new ForbiddenError();
    }

    const { data: report } = await supabase
      .from('daily_reports').select('*').eq('id', reportId).eq('project_id', projectId).single();
    if (!report) throw new NotFoundError('Daily report not found');

    if (format !== 'pdf') {
      return NextResponse.json(report);
    }

    // PDF export
    const { data: project } = await supabase.from('projects').select('name').eq('id', projectId).single();
    const { data: requester } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single();

    const generatedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const pdfBuffer = await generateDailyReportPdf({
      report,
      projectName: project?.name ?? '—',
      generatedAt,
      generatedBy: requester?.full_name ?? requester?.email ?? user.email ?? 'Unknown',
    });

    await createAuditLog('DOWNLOAD_DAILY_REPORT_PDF', 'daily_report', reportId, {
      userId: user.id, details: { format: 'pdf' },
    });

    const pdfArrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength,
    ) as ArrayBuffer;

    const safe = String(report.report_date).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);

    return new NextResponse(pdfArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Daily-Report-${safe}.pdf"`,
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  status: z.enum(['draft', 'submitted', 'approved']).optional(),
  workforceCount: z.number().int().min(0).optional(),
  activities: z.string().optional(),
  plantOnSite: z.string().optional(),
  delays: z.string().optional(),
  safetyObservations: z.string().optional(),
  visitors: z.string().optional(),
  notes: z.string().optional(),
});

async function patchReport(request: Request, { params }: Context) {
  try {
    const { projectId, reportId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data: report } = await supabase
      .from('daily_reports').select('id, created_by').eq('id', reportId).eq('project_id', projectId).single();
    if (!report) throw new NotFoundError('Daily report not found');

    if (report.created_by !== user.id) {
      const canManage = await canManageProject(projectId);
      const admin = await isAdmin();
      if (!canManage && !admin) {
        throw new ForbiddenError();
      }
    }

    setSentryContext({ userId: user.id, projectId });

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.issues);

    const updates: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.status) {
      updates.status = d.status;
      if (d.status === 'approved') updates.approved_by = user.id;
    }
    if (d.workforceCount !== undefined) updates.workforce_count = d.workforceCount;
    if (d.activities !== undefined) updates.activities = d.activities;
    if (d.plantOnSite !== undefined) updates.plant_on_site = d.plantOnSite;
    if (d.delays !== undefined) updates.delays = d.delays;
    if (d.safetyObservations !== undefined) updates.safety_observations = d.safetyObservations;
    if (d.visitors !== undefined) updates.visitors = d.visitors;
    if (d.notes !== undefined) updates.notes = d.notes;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('daily_reports').update(updates).eq('id', reportId);
      if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    await createAuditLog('UPDATE_DAILY_REPORT', 'daily_report', reportId, {
      userId: user.id, details: updates,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const GET = withRequestContext(getReport, '/api/projects/[projectId]/daily-reports/[reportId]');
export const PATCH = withRequestContext(patchReport, '/api/projects/[projectId]/daily-reports/[reportId]');
