import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { handleAPIError, UnauthorizedError } from '@/lib/error-handling';
import { logger } from '@/lib/logging';

/**
 * GET /api/subscription
 *
 * Returns the current user's active subscription with plan details.
 * Returns null subscription (not 404) when the user has no subscription yet.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*, plans (*)')
      .eq('profile_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('Failed to fetch subscription', { userId: user.id, error: error.message });
      return NextResponse.json({ error: 'Failed to load subscription' }, { status: 500 });
    }

    return NextResponse.json({ subscription: subscription ?? null }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
