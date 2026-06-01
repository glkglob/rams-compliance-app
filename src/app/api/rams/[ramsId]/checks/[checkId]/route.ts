import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import { OVERRIDE_ALLOWED_ROLES } from '@/lib/auth/roles';
import {
  handleAPIError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  validationErrorResponse,
} from '@/lib/error-handling';
import { setSentryContext } from '@/lib/observability/sentry-context';
import { withRequestContext } from '@/lib/request-context';
import { ensureProfile } from '@/lib/profiles/ensure-profile';

const overrideCheckSchema = z.object({
  status: z.enum([
    'compliant',
    'partially_compliant',
    'non_compliant',
    'not_applicable',
    'unclear',
  ]),
  reason: z.string().min(5, 'Override reason must be at least 5 characters'),
});

type Context = { params: Promise<{ ramsId: string; checkId: string }> };

/**
 * PATCH /api/rams/[ramsId]/checks/[checkId]
 *
 * Allows an authorised reviewer to override the AI-determined status of a
 * single review check. The original AI decision is preserved in the audit log
 * and the new status + reason are written to the review_checks row.
 */
async function patchCheck(request: Request, { params }: Context) {
  try {
    const { ramsId, checkId } = await params;
    const supabase = await createServerSupabase();

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    // ── Role check: must be in OVERRIDE_ALLOWED_ROLES ────────────────────────
    const { data: rawProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const profile = rawProfile ?? (await ensureProfile({ user, supabase }));

    if (!profile || !(OVERRIDE_ALLOWED_ROLES as readonly string[]).includes(profile.role)) {
      throw new ForbiddenError(
        'Only admin, principal_designer, or principal_contractor roles can override check decisions',
      );
    }

    // ── Load the check and verify it belongs to this RAMS ────────────────────
    const { data: check } = await supabase
      .from('review_checks')
      .select('id, status, score, rams_review_id, explanation')
      .eq('id', checkId)
      .single();

    if (!check) throw new NotFoundError('Review check not found');

    // Verify the review belongs to this RAMS submission
    const { data: review } = await supabase
      .from('rams_reviews')
      .select('id, rams_submission_id')
      .eq('id', check.rams_review_id)
      .single();

    if (!review || review.rams_submission_id !== ramsId) {
      throw new NotFoundError('Review check does not belong to this RAMS submission');
    }

    // ── Membership check ──────────────────────────────────────────────────────
    const { data: rams } = await supabase
      .from('rams_submissions')
      .select('project_id')
      .eq('id', ramsId)
      .single();

    if (!rams) throw new NotFoundError('RAMS submission not found');

    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', rams.project_id)
      .eq('user_id', user.id)
      .single();

    if (!membership && profile.role !== 'admin') {
      throw new ForbiddenError();
    }

    setSentryContext({ userId: user.id, projectId: rams.project_id, ramsId });

    // ── Validate body ─────────────────────────────────────────────────────────
    const body = await request.json();
    const parsed = overrideCheckSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.issues);
    }

    const { status: newStatus, reason } = parsed.data;
    const previousStatus = check.status;

    // Map the new status to a numeric score for consistency
    const STATUS_SCORE: Record<string, number> = {
      compliant: 1,
      partially_compliant: 0.5,
      non_compliant: 0,
      not_applicable: 1,
      unclear: 0,
    };

    // ── Write the override ────────────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('review_checks')
      .update({
        status: newStatus,
        score: STATUS_SCORE[newStatus] ?? 0,
        explanation: `[OVERRIDE by ${profile.role}] ${reason}\n\n--- Original AI assessment ---\n${check.explanation ?? '(none)'}`,
        // Clear AI confidence since this is a human decision
        confidence_score: 1.0,
      })
      .eq('id', checkId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update check' }, { status: 500 });
    }

    // ── Audit log (critical action) ──────────────────────────────────────────
    await createAuditLog('OVERRIDE_RAMS_REVIEW', 'review_check', checkId, {
      userId: user.id,
      details: {
        ramsId,
        checkId,
        previousStatus,
        newStatus,
        reason,
        overriddenByRole: profile.role,
      },
    });

    return NextResponse.json({
      success: true,
      checkId,
      previousStatus,
      newStatus,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const PATCH = withRequestContext(patchCheck, '/api/rams/[ramsId]/checks/[checkId]');
