import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/supabase-server', () => ({
  createServerSupabase: vi.fn(),
}));
vi.mock('@/lib/audit/audit-log', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/observability/sentry-context', () => ({ setSentryContext: vi.fn() }));
vi.mock('@/lib/auth/permissions', () => ({ canManageProject: vi.fn() }));
vi.mock('@/lib/documents/extract-text', () => ({
  extractTextFromFile: vi.fn().mockResolvedValue({
    status: 'complete',
    extractedText: 'extracted text',
    confidence: 0.95,
  }),
}));
vi.mock('@/lib/documents/file-validation', () => ({
  validateFile: vi.fn().mockReturnValue({ isSupported: true, normalisedFileType: 'pdf', issues: [] }),
}));
vi.mock('@/lib/ai/chunk-pipeline', () => ({
  processRamsChunks: vi.fn().mockResolvedValue({ chunksStored: 3 }),
}));
vi.mock('@/lib/request-context', () => ({
  withRequestContext: vi.fn((handler: unknown) => handler),
  setRequestUserId: vi.fn(),
  runWithRequestContext: vi.fn((_req: unknown, fn: () => unknown) => fn()),
  attachRequestIdHeader: vi.fn((res: unknown) => res),
}));

import { createServerSupabase } from '@/lib/db/supabase-server';
import { canManageProject } from '@/lib/auth/permissions';
import { POST } from '../rams/[ramsId]/resubmit/route';

function makeCtx(params: Record<string, string>) {
  return { params: Promise.resolve(params) as never };
}

describe('POST /api/rams/[ramsId]/resubmit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('no') }) },
      from: vi.fn(),
      rpc: vi.fn(),
      storage: { from: vi.fn() },
    };
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const body = new FormData();
    body.append('file', new File(['data'], 'test.pdf', { type: 'application/pdf' }));

    const res = await POST(
      new Request('http://localhost/api/test', { method: 'POST', body }),
      makeCtx({ ramsId: 'r1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when original RAMS not found', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u1', email: 'u@x.com' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      rpc: vi.fn(),
      storage: { from: vi.fn() },
    };
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);

    const body = new FormData();
    body.append('file', new File(['data'], 'test.pdf', { type: 'application/pdf' }));

    const res = await POST(
      new Request('http://localhost/api/test', { method: 'POST', body }),
      makeCtx({ ramsId: 'not-found' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when user cannot manage the project', async () => {
    let callCount = 0;
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u1', email: 'u@x.com' } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'r1',
                project_id: 'p1',
                parent_submission_id: null,
                subcontractor_name: 'Sub',
                subcontractor_email: null,
                trade_package: null,
              },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      rpc: vi.fn(),
      storage: { from: vi.fn() },
    };
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);
    vi.mocked(canManageProject).mockResolvedValue(false);

    const body = new FormData();
    body.append('file', new File(['data'], 'test.pdf', { type: 'application/pdf' }));

    const res = await POST(
      new Request('http://localhost/api/test', { method: 'POST', body }),
      makeCtx({ ramsId: 'r1' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when no file is provided', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u1', email: 'u@x.com' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'r1',
            project_id: 'p1',
            parent_submission_id: null,
            subcontractor_name: 'Sub',
            subcontractor_email: null,
            trade_package: null,
          },
          error: null,
        }),
      }),
      rpc: vi.fn(),
      storage: { from: vi.fn() },
    };
    vi.mocked(createServerSupabase).mockResolvedValue(supabase as never);
    vi.mocked(canManageProject).mockResolvedValue(true);

    // FormData with no file
    const body = new FormData();

    const res = await POST(
      new Request('http://localhost/api/test', { method: 'POST', body }),
      makeCtx({ ramsId: 'r1' }),
    );
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toContain('file');
  });
});
