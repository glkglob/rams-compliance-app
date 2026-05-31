import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { ensureProfile } from '@/lib/auth/ensure-profile';
import { generateReportExcel } from '@/lib/reports/generate-rams-report';
import { handleAPIError, UnauthorizedError } from '@/lib/error-handling';
import { isAdminRole } from '@/lib/auth/roles';
import { ensureProfile } from '@/lib/profiles/ensure-profile';

type RouteContext = {
  params: Promise<{ ramsId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { ramsId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new UnauthorizedError();
    }

    const { data: rams } = await supabase
      .from('rams_submissions')
      .select(`
        *,
        projects (name, compliance_threshold),
        rams_reviews (*, review_checks (*)),
        generated_emails (*)
      `)
      .eq('id', ramsId)
      .single();

    if (!rams) {
      throw new NotFoundError('RAMS not found');
    }

    // Verify the user is a project member or an admin before allowing download
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

    const buffer = await generateReportExcel(rams);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="RAMS-Report-${rams.subcontractor_name}.xlsx"`,
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
