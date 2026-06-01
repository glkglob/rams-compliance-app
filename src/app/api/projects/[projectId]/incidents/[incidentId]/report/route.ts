import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { generateIncidentReport } from '@/lib/reports/incident-report';
import { handleAPIError, NotFoundError, UnauthorizedError, ForbiddenError } from '@/lib/error-handling';
import { createAuditLog } from '@/lib/audit/audit-log';
import { withRequestContext } from '@/lib/request-context';

export const maxDuration = 60;

type Context = { params: Promise<{ projectId: string; incidentId: string }> };

async function getReport(_request: Request, { params }: Context) {
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

    // Project name
    const { data: project } = await supabase
      .from('projects').select('name').eq('id', projectId).single();

    // Related RAMS
    let relatedRams = null;
    if (incident.related_rams_submission_id) {
      const { data } = await supabase
        .from('rams_submissions')
        .select('subcontractor_name, file_name, review_status, compliance_score')
        .eq('id', incident.related_rams_submission_id)
        .single();
      relatedRams = data;
    }

    // Attachment count
    const { count: attachmentCount } = await supabase
      .from('attachments')
      .select('id', { count: 'exact', head: true })
      .eq('parent_type', 'incident')
      .eq('parent_id', incidentId);

    // Requester name
    const { data: requesterProfile } = await supabase
      .from('profiles').select('full_name, email').eq('id', user.id).single();

    const generatedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const pdfBuffer = await generateIncidentReport({
      incident,
      parties: incident.incident_parties ?? [],
      relatedRams,
      projectName: project?.name ?? '—',
      attachmentCount: attachmentCount ?? 0,
      generatedAt,
      generatedBy: requesterProfile?.full_name ?? requesterProfile?.email ?? user.email ?? 'Unknown',
    });

    const safe = incident.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);

    createAuditLog('DOWNLOAD_REPORT', 'incident', incidentId, {
      userId: user.id,
      details: { format: 'pdf' },
    }).catch(() => {});

    const pdfArrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength,
    ) as ArrayBuffer;

    return new NextResponse(pdfArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Incident-Report-${safe}.pdf"`,
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const GET = withRequestContext(getReport, '/api/projects/[projectId]/incidents/[incidentId]/report');
