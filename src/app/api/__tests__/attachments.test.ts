import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Shared mock builders ───────────────────────────────────────────────────────

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
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
  storage: {
    from: vi.fn().mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed-url' }, error: null }),
      upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
      remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
    }),
  },
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

import { createServerSupabase } from '@/lib/db/supabase-server';
import { ATTACHMENT_ALLOWED_MIME_TYPES } from '@/lib/attachments/storage';
import { GET, POST } from '../rams/[ramsId]/attachments/route';
import { DELETE } from '../rams/[ramsId]/attachments/[attachmentId]/route';

// Cast to `never` — the Context type is narrower than Record<string, string>
// but Promise.resolve always satisfies it at runtime.
function makeCtx(params: Record<string, string>) {
  return { params: Promise.resolve(params) as never };
}

const makeRequest = (method = 'GET') =>
  new Request('http://localhost/api/test', { method });

// ── GET ────────────────────────────────────────────────────────────────────────

describe('GET /api/rams/[ramsId]/attachments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    const supabase = makeSupabase();
    (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null }, error: new Error('Not authenticated'),
    });
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const res = await GET(makeRequest(), makeCtx({ ramsId: 'r1' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when RAMS not found', async () => {
    const supabase = makeSupabase();
    // rams_submissions select returns null
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const res = await GET(makeRequest(), makeCtx({ ramsId: 'not-found' }));
    expect(res.status).toBe(404);
  });

  it('returns 200 with attachment list including signed URLs', async () => {
    const attachment = {
      id: 'att-1',
      file_name: 'plan.pdf',
      storage_path: 'rams_submission/r1/att-1_plan.pdf',
      file_size: 1024,
      mime_type: 'application/pdf',
      uploaded_by: 'user-1',
      created_at: new Date().toISOString(),
    };

    let callCount = 0;
    const supabase = makeSupabase();
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // rams_submissions
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { project_id: 'p1' }, error: null }) };
      }
      if (callCount === 2) {
        // project_members
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'reviewer' }, error: null }) };
      }
      // attachments list
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [attachment], error: null }) };
    });
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const res = await GET(makeRequest(), makeCtx({ ramsId: 'r1' }));
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ id: string; url: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe('att-1');
    expect(body[0].url).toBe('https://signed-url');
  });
});

// ── POST ───────────────────────────────────────────────────────────────────────

describe('POST /api/rams/[ramsId]/attachments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when no file is provided', async () => {
    const supabase = makeSupabase();
    let call = 0;
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      call++;
      if (call === 1) return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { project_id: 'p1' }, error: null }) };
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { role: 'reviewer' }, error: null }) };
    });
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const body = new FormData(); // no file
    const req = new Request('http://localhost/api/test', { method: 'POST', body });
    const res = await POST(req, makeCtx({ ramsId: 'r1' }));
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toContain('file');
  });

  it('rejects dangerous MIME types via ATTACHMENT_ALLOWED_MIME_TYPES', () => {
    // The POST handler checks ATTACHMENT_ALLOWED_MIME_TYPES before uploading.
    // We test the constant directly because jsdom's incomplete FormData
    // serialisation causes formData() to throw before reaching the MIME check.
    expect(ATTACHMENT_ALLOWED_MIME_TYPES).not.toContain('application/x-msdownload');
    expect(ATTACHMENT_ALLOWED_MIME_TYPES).not.toContain('application/zip');
    expect(ATTACHMENT_ALLOWED_MIME_TYPES).not.toContain('application/octet-stream');
  });
});

// ── DELETE ─────────────────────────────────────────────────────────────────────

describe('DELETE /api/rams/[ramsId]/attachments/[attachmentId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when attachment not found', async () => {
    const supabase = makeSupabase();
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const res = await DELETE(
      new Request('http://localhost/api/test', { method: 'DELETE' }),
      makeCtx({ ramsId: 'r1', attachmentId: 'not-found' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 and deletes storage + row when requester is the uploader', async () => {
    const storageMock = {
      remove: vi.fn().mockResolvedValue({ error: null }),
      createSignedUrl: vi.fn(),
      upload: vi.fn(),
    };
    const supabase = makeSupabase({ storage: { from: vi.fn().mockReturnValue(storageMock) } });

    let call = 0;
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      call++;
      if (call === 1) {
        // attachments table
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'att-1', storage_path: 'path', uploaded_by: 'user-1', parent_id: 'r1', file_name: 'f.pdf' },
            error: null }) };
      }
      if (call === 2) {
        // rams_submissions
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { project_id: 'p1' }, error: null }) };
      }
      // delete call
      return { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    });
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const res = await DELETE(
      new Request('http://localhost/api/test', { method: 'DELETE' }),
      makeCtx({ ramsId: 'r1', attachmentId: 'att-1' }),
    );
    expect(res.status).toBe(200);
    expect(storageMock.remove).toHaveBeenCalledWith(['path']);
  });
});
