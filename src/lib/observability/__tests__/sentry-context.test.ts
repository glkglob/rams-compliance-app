import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSetUser = vi.fn();
const mockSetTag = vi.fn();
const mockAddBreadcrumb = vi.fn();
const mockWithScope = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  setUser: (...args: unknown[]) => mockSetUser(...args),
  setTag: (...args: unknown[]) => mockSetTag(...args),
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
  withScope: (...args: unknown[]) => mockWithScope(...args),
}));

const mockSetRequestUserId = vi.fn();
vi.mock('@/lib/request-context', () => ({
  setRequestUserId: (...args: unknown[]) => mockSetRequestUserId(...args),
}));

// Import after mocks are registered.
import {
  addOrchestratorBreadcrumb,
  setSentryContext,
  withSentryContext,
} from '@/lib/observability/sentry-context';

// ── Helpers ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── setSentryContext ───────────────────────────────────────────────────────────

describe('setSentryContext', () => {
  it('sets userId in AsyncLocalStorage and Sentry scope', () => {
    setSentryContext({ userId: 'user-abc' });

    expect(mockSetRequestUserId).toHaveBeenCalledOnce();
    expect(mockSetRequestUserId).toHaveBeenCalledWith('user-abc');
    expect(mockSetUser).toHaveBeenCalledOnce();
    expect(mockSetUser).toHaveBeenCalledWith({ id: 'user-abc' });
  });

  it('sets project_id tag', () => {
    setSentryContext({ projectId: 'proj-123' });

    expect(mockSetTag).toHaveBeenCalledWith('project_id', 'proj-123');
  });

  it('sets rams_id tag', () => {
    setSentryContext({ ramsId: 'rams-456' });

    expect(mockSetTag).toHaveBeenCalledWith('rams_id', 'rams-456');
  });

  it('sets document_id tag', () => {
    setSentryContext({ documentId: 'doc-789' });

    expect(mockSetTag).toHaveBeenCalledWith('document_id', 'doc-789');
  });

  it('sets all fields in a single call', () => {
    setSentryContext({
      userId: 'u1',
      projectId: 'p1',
      ramsId: 'r1',
      documentId: 'd1',
    });

    expect(mockSetRequestUserId).toHaveBeenCalledWith('u1');
    expect(mockSetUser).toHaveBeenCalledWith({ id: 'u1' });
    expect(mockSetTag).toHaveBeenCalledWith('project_id', 'p1');
    expect(mockSetTag).toHaveBeenCalledWith('rams_id', 'r1');
    expect(mockSetTag).toHaveBeenCalledWith('document_id', 'd1');
  });

  it('does not call setUser or setRequestUserId when userId is absent', () => {
    setSentryContext({ projectId: 'p1' });

    expect(mockSetRequestUserId).not.toHaveBeenCalled();
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('is safe to call with an empty options object', () => {
    expect(() => setSentryContext({})).not.toThrow();
    expect(mockSetRequestUserId).not.toHaveBeenCalled();
    expect(mockSetTag).not.toHaveBeenCalled();
  });
});

// ── withSentryContext ──────────────────────────────────────────────────────────

describe('withSentryContext', () => {
  it('calls withScope and runs the callback', async () => {
    const mockScope = {
      setUser: vi.fn(),
      setTag: vi.fn(),
    };
    mockWithScope.mockImplementation(async (fn: (scope: typeof mockScope) => unknown) => fn(mockScope));

    const result = await withSentryContext({ userId: 'u1', projectId: 'p1' }, () => 42);

    expect(result).toBe(42);
    expect(mockWithScope).toHaveBeenCalledOnce();
    expect(mockScope.setUser).toHaveBeenCalledWith({ id: 'u1' });
    expect(mockScope.setTag).toHaveBeenCalledWith('project_id', 'p1');
  });

  it('propagates userId to AsyncLocalStorage inside the scope', async () => {
    const mockScope = { setUser: vi.fn(), setTag: vi.fn() };
    mockWithScope.mockImplementation(async (fn: (scope: typeof mockScope) => unknown) => fn(mockScope));

    await withSentryContext({ userId: 'u2' }, () => undefined);

    expect(mockSetRequestUserId).toHaveBeenCalledWith('u2');
  });

  it('returns the resolved value of an async callback', async () => {
    const mockScope = { setUser: vi.fn(), setTag: vi.fn() };
    mockWithScope.mockImplementation(async (fn: (scope: typeof mockScope) => unknown) => fn(mockScope));

    const result = await withSentryContext({}, async () => 'async-value');

    expect(result).toBe('async-value');
  });
});

// ── addOrchestratorBreadcrumb ─────────────────────────────────────────────────

describe('addOrchestratorBreadcrumb', () => {
  it('adds a breadcrumb with the ai.orchestrator category', () => {
    addOrchestratorBreadcrumb('rams_loaded');

    expect(mockAddBreadcrumb).toHaveBeenCalledOnce();
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: 'ai.orchestrator',
      message: 'rams_loaded',
      level: 'info',
      data: undefined,
    });
  });

  it('forwards extra data to the breadcrumb', () => {
    addOrchestratorBreadcrumb('compliance_compared', { checks: 12, ramsId: 'r1' });

    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ data: { checks: 12, ramsId: 'r1' } }),
    );
  });

  it('uses info level for all pipeline steps', () => {
    const steps = [
      'rams_loaded',
      'requirements_retrieved',
      'compliance_compared',
      'score_calculated',
      'review_persisted',
      'document_downloaded',
      'text_extracted',
      'chunks_embedded',
      'requirements_extracted',
      'document_processing_complete',
    ] as const;

    for (const step of steps) {
      addOrchestratorBreadcrumb(step);
      const call = mockAddBreadcrumb.mock.calls.at(-1)![0] as { level: string };
      expect(call.level).toBe('info');
    }
  });
});
