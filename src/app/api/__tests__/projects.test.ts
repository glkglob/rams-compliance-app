import { describe, it, expect, vi } from 'vitest';
import { POST } from '../projects/route';

vi.mock('@/lib/db/supabase-with-timeout', () => ({
  createServerSupabaseWithTimeout: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: { id: 'test-user-id', email: 'test@example.com' } },
            error: null,
          })
        ),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({ data: { role: 'admin' }, error: null })
            ),
          })),
        })),
        insert: vi.fn(() =>
          Promise.resolve({
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: {
                    id: 'test-project-id',
                    name: 'Test Project',
                    compliance_threshold: 80,
                    created_at: new Date().toISOString(),
                  },
                  error: null,
                })
              ),
            })),
          })
        ),
      })),
    })
  ),
}));

vi.mock('@/lib/auth/roles', () => ({
  hasPermission: vi.fn(() => true),
}));

describe('Projects API', () => {
  const createRequest = (body: unknown) =>
    new Request('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  describe('POST /api/projects', () => {
    it('should reject projects without a name', async () => {
      const response = await POST(createRequest({ clientName: 'Test Client' }));
      expect(response.status).toBe(400);
    });

    it('should reject compliance thresholds outside 0-100', async () => {
      const response = await POST(
        createRequest({ name: 'Test', complianceThreshold: 150 })
      );
      expect(response.status).toBe(400);
    });
  });
});
