import { expect, test } from '@playwright/test';

/**
 * Middleware header integration tests.
 *
 * Verifies that the Next.js middleware correctly stamps every response —
 * including API Route Handlers — with:
 *   - x-request-id        (observability / log correlation)
 *   - Content-Security-Policy  (injected per-request with a fresh nonce)
 *   - Static security headers (HSTS, X-Frame-Options, nosniff, …)
 *
 * These tests run against the dev server and do NOT require a real Supabase
 * instance — public routes are used so no auth is needed.
 */

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_RE = /^req_[0-9a-z]+_[0-9a-z]+$/;

// ── Shared assertions ─────────────────────────────────────────────────────────

// Playwright response headers arrive as a plain { [key: string]: string } object
// (all keys lowercase). We wrap it so the helper has a uniform access pattern.
function assertSecurityHeaders(headers: Record<string, string>) {
  // x-request-id must be present and match the generated format.
  const requestId = headers[REQUEST_ID_HEADER];
  expect(requestId, 'x-request-id header missing').toBeTruthy();
  expect(requestId, 'x-request-id has unexpected format').toMatch(REQUEST_ID_RE);

  // CSP must be present.
  const csp = headers['content-security-policy'];
  expect(csp, 'Content-Security-Policy header missing').toBeTruthy();

  // Core CSP invariants — these hold in both dev and production builds.
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("'strict-dynamic'");

  // No external font CDN — fonts are vendored / system-stack only.
  expect(csp).not.toContain('fonts.googleapis.com');
  expect(csp).not.toContain('fonts.gstatic.com');

  // unsafe-inline must never appear in script-src (nonce + strict-dynamic is used instead).
  expect(csp).not.toContain("'unsafe-inline'");

  // Static security headers.
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
}

// ── Page routes ────────────────────────────────────────────────────────────────

test.describe('middleware headers — page routes', () => {
  test('privacy page carries x-request-id and CSP', async ({ page }) => {
    const response = await page.goto('/privacy');
    expect(response?.status()).toBeLessThan(400);
    assertSecurityHeaders(response!.headers());
  });

  test('terms page carries x-request-id and CSP', async ({ page }) => {
    const response = await page.goto('/terms');
    expect(response?.status() ?? 500).toBeLessThan(500);
    if (response && response.status() < 400) {
      assertSecurityHeaders(response.headers());
    }
  });

  test('root redirect carries security headers', async ({ page }) => {
    const response = await page.goto('/');
    // The root may redirect to /dashboard or /login — we only care that the
    // first response (or final destination) has the security headers applied.
    const finalResponse = response ?? (await page.waitForResponse((r) => r.status() < 400));
    assertSecurityHeaders(finalResponse.headers());
  });
});

// ── API routes ─────────────────────────────────────────────────────────────────

test.describe('middleware headers — API routes', () => {
  test('/api/health carries x-request-id and CSP', async ({ request }) => {
    // Health endpoint always returns 200 even when DB is unavailable.
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    assertSecurityHeaders(response.headers());
  });

  test('x-request-id is echoed on /api/health when sent in request', async ({ request }) => {
    const sentId = 'req_test_abc123';
    const response = await request.get('/api/health', {
      headers: { [REQUEST_ID_HEADER]: sentId },
    });
    // Middleware should propagate the incoming ID rather than generating a new one.
    expect(response.headers()[REQUEST_ID_HEADER]).toBe(sentId);
  });

  test('each /api/health request gets a distinct x-request-id when none is sent', async ({ request }) => {
    const [r1, r2] = await Promise.all([
      request.get('/api/health'),
      request.get('/api/health'),
    ]);
    const id1 = r1.headers()[REQUEST_ID_HEADER];
    const id2 = r2.headers()[REQUEST_ID_HEADER];
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });
});

// ── Static asset exclusion ─────────────────────────────────────────────────────

test.describe('middleware does NOT run on excluded static paths', () => {
  test('_next/static assets do not carry middleware x-request-id', async ({ request }) => {
    // Request a known Next.js internal path. It will 404 in dev unless a real
    // chunk exists, but the response headers are what we care about.
    // Next.js sets its own Cache-Control etc. for static assets; the middleware
    // matcher deliberately excludes them.
    const response = await request.get('/_next/static/non-existent-chunk.js');
    // Whether 200 or 404, the middleware should NOT have injected x-request-id
    // because the matcher excludes _next/static paths.
    const requestId = response.headers()[REQUEST_ID_HEADER];
    // Middleware x-request-id has the format req_<base36>_<random>; if it's
    // present the test fails because we should have been excluded.
    if (requestId) {
      expect(requestId, '_next/static path should not carry middleware x-request-id').not.toMatch(
        REQUEST_ID_RE,
      );
    }
  });
});
