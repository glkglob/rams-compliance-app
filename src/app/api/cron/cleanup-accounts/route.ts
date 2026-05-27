import { NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { hardDeleteAccount } from '@/app/api/account/route';
import { logger } from '@/lib/logging';

/**
 * Cron endpoint: permanently deletes accounts whose recovery window has expired.
 *
 * Protected by a shared secret in the `Authorization` header.
 * Set CRON_SECRET in Railway environment variables, then call:
 *
 *   curl -X POST https://your-app.railway.app/api/cron/cleanup-accounts \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Railway cron job config (in railway.toml or dashboard):
 *   Schedule: daily at 03:00 UTC — "0 3 * * *"
 */

export async function POST(request: Request) {
  // --- Auth: require CRON_SECRET ---
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error('CRON_SECRET not configured — cleanup-accounts endpoint is disabled');
    return NextResponse.json({ error: 'Endpoint not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token !== cronSecret) {
    logger.warn('Unauthorized cron cleanup attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- Find accounts past their recovery window ---
  const admin = getSupabaseAdmin();

  const { data: dueAccounts, error: queryError } = await admin
    .from('profiles')
    .select('id, email, scheduled_hard_delete_at')
    .not('deleted_at', 'is', null)
    .not('scheduled_hard_delete_at', 'is', null)
    .lte('scheduled_hard_delete_at', new Date().toISOString());

  type DueAccount = { id: string; email: string | null; scheduled_hard_delete_at: string };

  if (queryError) {
    logger.error('Failed to query accounts due for hard deletion', {
      error: String(queryError),
    });
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!dueAccounts || dueAccounts.length === 0) {
    logger.info('Cron cleanup: no accounts due for hard deletion');
    return NextResponse.json({ processed: 0, results: [] }, { status: 200 });
  }

  logger.info('Cron cleanup: starting hard deletion', {
    accountCount: dueAccounts.length,
  });

  // --- Process each account ---
  const results: Array<{ userId: string; email: string | null; success: boolean; error?: string }> = [];

  for (const account of (dueAccounts as DueAccount[] | null) ?? []) {
    const result = await hardDeleteAccount(account.id);

    results.push({
      userId: account.id,
      email: account.email,
      success: result.success,
      error: result.error,
    });

    if (result.success) {
      logger.info('Cron cleanup: account hard-deleted', {
        userId: account.id,
      });
    } else {
      logger.error('Cron cleanup: failed to hard-delete account', {
        userId: account.id,
        error: result.error,
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  logger.info('Cron cleanup complete', { succeeded, failed });

  return NextResponse.json(
    { processed: results.length, succeeded, failed, results },
    { status: 200 },
  );
}
