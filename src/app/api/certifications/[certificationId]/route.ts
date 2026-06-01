import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import { handleAPIError, UnauthorizedError, NotFoundError } from '@/lib/error-handling';
import { withRequestContext } from '@/lib/request-context';

type Context = { params: Promise<{ certificationId: string }> };

async function deleteCertification(_request: Request, { params }: Context) {
  try {
    const { certificationId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data: cert } = await supabase
      .from('certifications')
      .select('id, profile_id, name')
      .eq('id', certificationId)
      .single();

    if (!cert) throw new NotFoundError('Certification not found');
    if (cert.profile_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase.from('certifications').delete().eq('id', certificationId);
    if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });

    createAuditLog('DELETE_CERTIFICATION', 'certification', certificationId, {
      userId: user.id,
      details: { name: cert.name },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const DELETE = withRequestContext(deleteCertification, '/api/certifications/[certificationId]');
