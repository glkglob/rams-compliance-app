import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import { handleAPIError, UnauthorizedError, validationErrorResponse } from '@/lib/error-handling';
import { withRequestContext } from '@/lib/request-context';

const createCertSchema = z.object({
  name: z.string().min(1, 'Certificate name is required'),
  issuingBody: z.string().optional(),
  certificateNumber: z.string().optional(),
  issuedDate: z.string().optional(),  // YYYY-MM-DD
  expiryDate: z.string().optional(),  // YYYY-MM-DD
  projectId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

// ── GET — list user's certifications ───────────────────────────────────────────

async function getCertifications(_request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data, error } = await supabase
      .from('certifications')
      .select('*')
      .eq('profile_id', user.id)
      .order('expiry_date', { ascending: true, nullsFirst: false });

    if (error) return NextResponse.json({ error: 'Failed to load certifications' }, { status: 500 });

    return NextResponse.json(data ?? []);
  } catch (error) {
    return handleAPIError(error);
  }
}

// ── POST — create certification ────────────────────────────────────────────────

async function postCertification(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const body = await request.json();
    const parsed = createCertSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.issues);

    const { name, issuingBody, certificateNumber, issuedDate, expiryDate, projectId, notes } = parsed.data;

    const { data: cert, error } = await supabase
      .from('certifications')
      .insert({
        profile_id: user.id,
        name,
        issuing_body: issuingBody ?? null,
        certificate_number: certificateNumber ?? null,
        issued_date: issuedDate ?? null,
        expiry_date: expiryDate ?? null,
        project_id: projectId ?? null,
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to create certification' }, { status: 500 });

    createAuditLog('CREATE_CERTIFICATION', 'certification', cert.id, {
      userId: user.id,
      details: { name, expiryDate },
    }).catch(() => {});

    return NextResponse.json(cert, { status: 201 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const GET = withRequestContext(getCertifications, '/api/certifications');
export const POST = withRequestContext(postCertification, '/api/certifications');
