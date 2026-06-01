import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { handleAPIError } from '@/lib/error-handling';
import { logger } from '@/lib/logging';

/**
 * GET /api/plans
 *
 * Public endpoint — returns all active pricing plans ordered by sort_order.
 * No authentication required (used by the /pricing page before login).
 * Uses the admin client to bypass RLS since the policy allows all reads
 * of active plans anyway.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data: plans, error } = await supabase
      .from('plans')
      .select('id, name, slug, description, price_monthly, price_yearly, currency, max_projects, max_rams_per_month, max_storage_mb, ai_reviews, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      logger.error('Failed to fetch plans', { error: error.message });
      return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 });
    }

    return NextResponse.json(plans ?? [], { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
