import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { generateReportExcel } from '@/lib/reports/generate-rams-report';
import { generateEvidencePack } from '@/lib/reports/evidence-pack';
import { getAuditLogs } from '@/lib/audit/audit-log';
import { handleAPIError, NotFoundError, UnauthorizedError } from '@/lib/error-handling';
import { isAdminRole } from '@/lib/auth/roles';
import { ensureProfile } from '@/lib/profiles/ensure-profile';
import { setSentryContext } from '@/lib/observability/sentry-context';
import { createAuditLog } from '@/lib/audit/audit-log';
import { withRequestContext } from '@/lib/request-context';
import { logger } from '@/lib/logging';

export const maxDuration = 60; // PDF rendering can take a few seconds

type RouteContext = {
  params: Promise<{ ramsId: string }>;
};

async function getReport(request: Request, { params }: RouteContext) {
  try {
    const { ramsId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') ?? 'xlsx'; // 'pdf' | 'xlsx'

    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data: rams } = await supabase
      .from('rams_submissions')
      .select(`
        *,
        projects (name, compliance_threshold),
        rams_reviews (*, review_checks (*)),
        generated_emails (*)
      `)
      .eq('id', ramsId)
      .order('created_at', { referencedTable: 'rams_reviews', ascending: false })
      .single();

    if (!rams) throw new NotFoundError('RAMS not found');

    // Access check: project member or global admin
    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', rams.project_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      const { data: rawProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      const profile = rawProfile ?? (await ensureProfile({ user, supabase }));
      if (!profile || !isAdminRole(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    setSentryContext({ userId: user.id, projectId: rams.project_id, ramsId });

    // ── Excel (original behaviour) ───────────────────────────────────────────
    if (format !== 'pdf') {
      const buffer = await generateReportExcel(rams);
      const safe = rams.subcontractor_name.replace(/[^a-zA-Z0-9_-]/g, '_');

      createAuditLog('DOWNLOAD_REPORT', 'rams_submission', ramsId, {
        userId: user.id,
        details: { format: 'xlsx' },
      }).catch(() => {});

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="RAMS-Report-${safe}.xlsx"`,
        },
      });
    }

    // ── PDF evidence pack ────────────────────────────────────────────────────
    logger.info('Generating PDF evidence pack', { ramsId });

    // Attachments (no signed URLs needed — just metadata for the manifest)
    const { data: attachmentRows } = await supabase
      .from('attachments')
      .select('id, file_name, file_size, mime_type, created_at')
      .eq('parent_type', 'rams_submission')
      .eq('parent_id', ramsId)
      .order('created_at', { ascending: false });

    // Audit trail — last 30 events for this submission
    const auditLogs = await getAuditLogs('rams_submission', ramsId, 30);

    // Requester's display name for the cover
    const { data: requesterProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    const generatedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const pdfBuffer = await generateEvidencePack({
      rams,
      attachments: attachmentRows ?? [],
      auditLogs,
      generatedAt,
      generatedBy: requesterProfile?.full_name ?? requesterProfile?.email ?? user.email ?? 'Unknown',
    });

    const safe = rams.subcontractor_name.replace(/[^a-zA-Z0-9_-]/g, '_');

    createAuditLog('DOWNLOAD_REPORT', 'rams_submission', ramsId, {
      userId: user.id,
      details: { format: 'pdf', pages: 'evidence_pack' },
    }).catch(() => {});

    // Transfer to a plain ArrayBuffer (guaranteed, not SharedArrayBuffer).
    const pdfArrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength,
    ) as ArrayBuffer;
    return new NextResponse(pdfArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="RAMS-Evidence-Pack-${safe}.pdf"`,
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const GET = withRequestContext(getReport, '/api/rams/[ramsId]/report');
