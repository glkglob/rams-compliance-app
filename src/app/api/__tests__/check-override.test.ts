import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db/supabase-server', () => ({
  createServerSupabase: vi.fn(),
}));
vi.mock('@/lib/audit/audit-log', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/observability/sentry-context', () => ({ setSentryContext: vi.fn() }));
vi.mock('@/lib/request-context', () => ({
  withRequestContext: vi.fn((handler: unknown) => handler),
  setRequestUserId: vi.fn(),
  runWithRequestContext: vi.fn((_req: unknown, fn: () => unknown) => fn()),
  attachRequestIdHeader: vi.fn((res: unknown) => res),
}));
vi.mock('@/lib/profiles/ensure-profile', () => ({
  ensureProfile: vi.fn().mockResolvedValue(null),
}));

import { createServerSupabase } from '@/lib/db/supabase-server';
import { PATCH } from '../rams/[ramsId]/checks/[checkId]/route';

function makeCtx(params: Record<string, string>) {
  return { params: Promise.resolve(params) as never };
}

function makeReq(body: unknown) {
  return new Request('http://localhost/api/test', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/rams/[ramsId]/checks/[checkId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('nope') }) },
      from: vi.fn(),
    };
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const res = await PATCH(
      makeReq({ status: 'compliant', reason: 'looks good' }),
      makeCtx({ ramsId: 'r1', checkId: 'c1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when user has non-override role', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u1', email: 'u@x.com' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { role: 'viewer' }, error: null }),
          }),
        }),
      }),
    };
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const res = await PATCH(
      makeReq({ status: 'compliant', reason: 'test reason' }),
      makeCtx({ ramsId: 'r1', checkId: 'c1' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when reason is too short', async () => {
    let callCount = 0;
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u1', email: 'admin@x.com' } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // profiles
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }) };
        }
        if (callCount === 2) {
          // review_checks
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'c1', status: 'non_compliant', score: 0, rams_review_id: 'rv1', explanation: 'AI said no' },
              error: null,
            }) };
        }
        if (callCount === 3) {
          // rams_reviews
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'rv1', rams_submission_id: 'r1' },
              error: null,
            }) };
        }
        if (callCount === 4) {
          // rams_submissions
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { project_id: 'p1' },
              error: null,
            }) };
        }
        // project_members
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }) };
      }),
    };
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const res = await PATCH(
      makeReq({ status: 'compliant', reason: 'ab' }), // too short
      makeCtx({ ramsId: 'r1', checkId: 'c1' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 on successful override by admin', async () => {
    let callCount = 0;
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u1', email: 'admin@x.com' } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }) };
        }
        if (callCount === 2) {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'c1', status: 'non_compliant', score: 0, rams_review_id: 'rv1', explanation: 'Missing PPE' },
              error: null }) };
        }
        if (callCount === 3) {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'rv1', rams_submission_id: 'r1' }, error: null }) };
        }
        if (callCount === 4) {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { project_id: 'p1' }, error: null }) };
        }
        if (callCount === 5) {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }) };
        }
        // update call
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    };
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const res = await PATCH(
      makeReq({ status: 'compliant', reason: 'PPE section found on page 12' }),
      makeCtx({ ramsId: 'r1', checkId: 'c1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; previousStatus: string; newStatus: string };
    expect(body.success).toBe(true);
    expect(body.previousStatus).toBe('non_compliant');
    expect(body.newStatus).toBe('compliant');
  });
});
