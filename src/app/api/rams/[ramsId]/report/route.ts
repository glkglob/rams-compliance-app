import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { ensureProfile } from '@/lib/auth/ensure-profile';
import { generateReportExcel } from '@/lib/reports/generate-rams-report';
import { handleAPIError, UnauthorizedError, ForbiddenError, NotFoundError } from '@/lib/error-handling';

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
      // Defensive fallback: trigger may not have fired for pre-existing users.
      const { data: rawProfile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const profile =
        !profileError && rawProfile
          ? rawProfile
          : await ensureProfile(user.id, user.email ?? '', user.user_metadata?.full_name as string | undefined);

      if (!profile || profile.role !== 'admin') {
        throw new ForbiddenError();
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
