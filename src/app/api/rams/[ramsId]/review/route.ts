import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { orchestrateRAMSReview } from '@/lib/ai/orchestrator';

type RouteContext = {
  params: Promise<{ ramsId: string }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { ramsId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rams, error: ramsError } = await supabase
      .from('rams_submissions')
      .select('project_id')
      .eq('id', ramsId)
      .single();

    if (ramsError || !rams) {
      return NextResponse.json({ error: 'RAMS submission not found' }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', rams.project_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await orchestrateRAMSReview(ramsId);

    if (!result.success && !result.decision) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const { data: review } = await supabase
      .from('rams_reviews')
      .select('*, review_checks(*), generated_emails(*)')
      .eq('rams_submission_id', ramsId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      decision: result.decision,
      complianceScore: result.complianceScore,
      review,
    }, { status: 200 });
  } catch (error) {
    console.error('Error reviewing RAMS:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
