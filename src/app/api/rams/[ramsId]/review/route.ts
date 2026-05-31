import { NextResponse } from 'next/server';

import { createServerSupabaseWithTimeout } from '@/lib/db/supabase-with-timeout';
import { handleAPIError, internalServerErrorResponse, UnauthorizedError } from '@/lib/error-handling';
import { orchestrateRAMSReview } from '@/lib/ai/orchestrator';
import { setSentryContext } from '@/lib/observability/sentry-context';
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit';
import { logger } from '@/lib/logging';
import { withRequestContext } from '@/lib/request-context';

export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ ramsId: string }>;
};

async function postReview(_request: Request, { params }: RouteContext) {
  try {
    const { ramsId } = await params;
    const supabase = await createServerSupabaseWithTimeout(8000); // 8 second timeout for auth + lookup

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new UnauthorizedError();
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

    setSentryContext({ userId: user.id, projectId: rams.project_id, ramsId });

    const rl = await checkRateLimit(user.id, 'review');
    if (!rl.allowed) {
      return rateLimitExceeded(rl.resetMs);
    }

    const result = await orchestrateRAMSReview(ramsId, user.id);

    if (!result.success && !result.decision) {
      logger.error('RAMS review orchestration failed', { ramsId, error: result.error });
      return internalServerErrorResponse();
    }

    const { data: review, error: reviewLoadError } = await supabase
      .from('rams_reviews')
      .select('*, review_checks(*), generated_emails(*)')
      .eq('rams_submission_id', ramsId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (reviewLoadError || !review) {
      return NextResponse.json({ error: 'Review completed but failed to load result' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      decision: result.decision,
      complianceScore: result.complianceScore,
      review,
    }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const POST = withRequestContext(postReview, '/api/rams/[ramsId]/review');
