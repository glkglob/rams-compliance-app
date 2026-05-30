import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { generateReportExcel } from '@/lib/reports/generate-rams-report';
import { handleAPIError, UnauthorizedError } from '@/lib/error-handling';

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
      return NextResponse.json({ error: 'RAMS not found' }, { status: 404 });
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
