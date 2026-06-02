import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockUser = { id: 'user-1', email: 'test@example.com' };

const makeSupabase = (overrides: Record<string, unknown> = {}) => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
  },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
  ...overrides,
});

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
vi.mock('@/lib/auth/permissions', () => ({
  canViewProject: vi.fn(),
  canManageProject: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('@/lib/weather/met-office', () => ({
  fetchWeatherByLocation: vi.fn(),
  manualWeather: vi.fn((summary: string) => ({ description: summary, source: 'manual' as const, temp_c: null, humidity: null, wind_mph: null, icon: null })),
}));
vi.mock('@/lib/reports/daily-report', () => ({
  generateDailyReportPdf: vi.fn().mockResolvedValue(new Uint8Array([1,2,3,4])),
}));

import { createServerSupabase } from '@/lib/db/supabase-server';
import { canViewProject, canManageProject, isAdmin } from '@/lib/auth/permissions';
import { createAuditLog } from '@/lib/audit/audit-log';
import { fetchWeatherByLocation } from '@/lib/weather/met-office';
import { GET as ListGET, POST as ListPOST } from '../projects/[projectId]/daily-reports/route';
import { GET as DetailGET, PATCH as DetailPATCH } from '../projects/[projectId]/daily-reports/[reportId]/route';

function makeCtx(params: Record<string, string>) {
  return { params: Promise.resolve(params) as never };
}

const makeRequest = (method = 'GET', body?: unknown) => {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request('http://localhost/api/test', init);
};

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('Daily Reports API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/projects/[projectId]/daily-reports (list)', () => {
    it('returns 401 when not authenticated', async () => {
      const supabase = makeSupabase();
      (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { user: null }, error: new Error('no') });
      vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

      const res = await ListGET(makeRequest(), makeCtx({ projectId: 'p1' }));
      expect(res.status).toBe(401);
    });

    it('returns 200 with reports when user can view', async () => {
      const reports = [{ id: 'r1', report_date: '2024-01-01', status: 'draft' }];
      const supabase = makeSupabase();
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: reports, error: null }),
      });
      vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);
      vi.mocked(canViewProject).mockResolvedValue(true);
      vi.mocked(isAdmin).mockResolvedValue(false);

      const res = await ListGET(makeRequest(), makeCtx({ projectId: 'p1' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(reports);
    });
  });

  describe('POST /api/projects/[projectId]/daily-reports (create)', () => {
    it('returns 403 when cannot view project', async () => {
      const supabase = makeSupabase();
      vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);
      vi.mocked(canViewProject).mockResolvedValue(false);

      const res = await ListPOST(makeRequest('POST', { reportDate: '2024-01-01' }), makeCtx({ projectId: 'p1' }));
      expect(res.status).toBe(403);
    });

    it('creates draft report and calls audit', async () => {
      const created = { id: 'r-new', report_date: '2024-01-01', status: 'draft' };
      const supabase = makeSupabase();
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { site_address: 'London' }, error: null }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: created, error: null }),
        }),
      });
      vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);
      vi.mocked(canViewProject).mockResolvedValue(true);
      vi.mocked(fetchWeatherByLocation).mockResolvedValue(null);

      const res = await ListPOST(makeRequest('POST', { reportDate: '2024-01-01', activities: 'Work' }), makeCtx({ projectId: 'p1' }));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBe('r-new');
      expect(vi.mocked(createAuditLog)).toHaveBeenCalledWith('CREATE_DAILY_REPORT', 'daily_report', 'r-new', expect.any(Object));
    });
  });

  describe('GET /api/projects/[projectId]/daily-reports/[reportId] (detail or pdf)', () => {
    it('returns json when no format', async () => {
      const report = { id: 'r1', report_date: '2024-01-01' };
      const supabase = makeSupabase();
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: report, error: null }),
      });
      vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);
      vi.mocked(canViewProject).mockResolvedValue(true);

      const res = await DetailGET(makeRequest(), makeCtx({ projectId: 'p1', reportId: 'r1' }));
      expect(res.status).toBe(200);
    });

    it('returns pdf when ?format=pdf', async () => {
      const report = { id: 'r1', report_date: '2024-01-01' };
      const supabase = makeSupabase();
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: report, error: null }),
      });
      vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);
      vi.mocked(canViewProject).mockResolvedValue(true);

      // Use Request with query to trigger PDF path in handler (new URL(request.url))
      const res = await DetailGET(new Request('http://localhost?format=pdf'), makeCtx({ projectId: 'p1', reportId: 'r1' }));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
    });
  });

  describe('PATCH /api/projects/[projectId]/daily-reports/[reportId] (update)', () => {
    it('updates and audits', async () => {
      const report = { id: 'r1', created_by: 'user-1' };
      const supabase = makeSupabase();
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: report, error: null }),
        update: vi.fn().mockReturnThis(),
      });
      vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);
      vi.mocked(canManageProject).mockResolvedValue(true);

      const res = await DetailPATCH(makeRequest('PATCH', { status: 'submitted' }), makeCtx({ projectId: 'p1', reportId: 'r1' }));
      expect(res.status).toBe(200);
      expect(vi.mocked(createAuditLog)).toHaveBeenCalledWith('UPDATE_DAILY_REPORT', 'daily_report', 'r1', expect.any(Object));
    });
  });
});
