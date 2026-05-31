import { afterEach, describe, expect, it } from 'vitest';

import {
  buildCsp,
  MIDDLEWARE_MATCHER,
  STATIC_SECURITY_HEADERS,
  validateCspForProduction,
} from '@/lib/security-headers';
import { REQUEST_ID_HEADER } from '@/lib/request-id';

// ── Helpers ──────────────────────────────────────────────────────────────────

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  mutableEnv.NODE_ENV = originalNodeEnv;
});

function setNodeEnv(env: string) {
  mutableEnv.NODE_ENV = env;
}

/**
 * Convert the Next.js middleware matcher string to a plain JS RegExp so we
 * can assert path coverage in unit tests without importing next/server.
 */
function matcherRegex(): RegExp {
  // Next.js wraps the user pattern in a path segment; the string is already a
  // valid regex when we anchor it.
  return new RegExp(`^${MIDDLEWARE_MATCHER}$`);
}

function pathMatches(path: string): boolean {
  return matcherRegex().test(path);
}

// ── Matcher coverage ──────────────────────────────────────────────────────────

describe('MIDDLEWARE_MATCHER', () => {
  it('matches API routes', () => {
    expect(pathMatches('/api/health')).toBe(true);
    expect(pathMatches('/api/projects')).toBe(true);
    expect(pathMatches('/api/rams/abc-123/override')).toBe(true);
    expect(pathMatches('/api/dashboard/activity')).toBe(true);
  });

  it('matches page routes', () => {
    expect(pathMatches('/dashboard')).toBe(true);
    expect(pathMatches('/projects')).toBe(true);
    expect(pathMatches('/login')).toBe(true);
    expect(pathMatches('/')).toBe(true);
    expect(pathMatches('/privacy')).toBe(true);
    expect(pathMatches('/settings')).toBe(true);
  });

  it('excludes _next/static assets', () => {
    expect(pathMatches('/_next/static/chunks/main.js')).toBe(false);
    expect(pathMatches('/_next/static/css/app.css')).toBe(false);
    expect(pathMatches('/_next/static/media/font.woff2')).toBe(false);
  });

  it('excludes _next/image optimisation routes', () => {
    expect(pathMatches('/_next/image?url=%2Flogo.png&w=256&q=75')).toBe(false);
  });

  it('excludes favicon.ico', () => {
    expect(pathMatches('/favicon.ico')).toBe(false);
  });

  it('excludes common static image extensions at any path depth', () => {
    expect(pathMatches('/logo.svg')).toBe(false);
    expect(pathMatches('/logo.png')).toBe(false);
    expect(pathMatches('/images/hero.jpg')).toBe(false);
    expect(pathMatches('/images/hero.jpeg')).toBe(false);
    expect(pathMatches('/assets/loader.gif')).toBe(false);
    expect(pathMatches('/assets/photo.webp')).toBe(false);
    expect(pathMatches('/icons/arrow.ico')).toBe(false);
  });

  it('does NOT exclude non-image files with similar characters in name', () => {
    // A route named /api/png-export should still run middleware.
    expect(pathMatches('/api/png-export')).toBe(true);
    expect(pathMatches('/reports/svg-summary')).toBe(true);
  });
});

// ── CSP security properties ────────────────────────────────────────────────────

describe('buildCsp – production', () => {
  it('contains no unsafe-inline', () => {
    setNodeEnv('production');
    expect(buildCsp('nonce-abc')).not.toContain("'unsafe-inline'");
  });

  it('contains no unsafe-eval', () => {
    setNodeEnv('production');
    expect(buildCsp('nonce-abc')).not.toContain("'unsafe-eval'");
  });

  it('contains no external font CDN domains', () => {
    setNodeEnv('production');
    const csp = buildCsp('nonce-abc');
    expect(csp).not.toContain('fonts.googleapis.com');
    expect(csp).not.toContain('fonts.gstatic.com');
  });

  it('enforces strict-dynamic + nonce for scripts', () => {
    setNodeEnv('production');
    const csp = buildCsp('test-nonce');
    expect(csp).toContain("'nonce-test-nonce'");
    expect(csp).toContain("'strict-dynamic'");
  });

  it('blocks plugins and iframes', () => {
    setNodeEnv('production');
    const csp = buildCsp('nonce-abc');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('includes upgrade-insecure-requests', () => {
    setNodeEnv('production');
    expect(buildCsp('nonce-abc')).toContain('upgrade-insecure-requests');
  });
});

describe('buildCsp – development', () => {
  it('allows unsafe-eval for HMR/debug tooling', () => {
    setNodeEnv('development');
    expect(buildCsp('nonce-abc')).toContain("'unsafe-eval'");
  });

  it('does not add unsafe-inline even in dev', () => {
    setNodeEnv('development');
    expect(buildCsp('nonce-abc')).not.toContain("'unsafe-inline'");
  });

  it('omits upgrade-insecure-requests (HTTP dev server)', () => {
    setNodeEnv('development');
    expect(buildCsp('nonce-abc')).not.toContain('upgrade-insecure-requests');
  });
});

// ── validateCspForProduction ───────────────────────────────────────────────────

describe('validateCspForProduction', () => {
  it('returns empty array for a clean production CSP', () => {
    setNodeEnv('production');
    const csp = buildCsp('safe-nonce');
    expect(validateCspForProduction(csp)).toEqual([]);
  });

  it('flags unsafe-inline', () => {
    const violations = validateCspForProduction("script-src 'self' 'unsafe-inline'");
    expect(violations.some((v) => v.includes('unsafe-inline'))).toBe(true);
  });

  it('flags unsafe-eval', () => {
    const violations = validateCspForProduction("script-src 'self' 'unsafe-eval'");
    expect(violations.some((v) => v.includes('unsafe-eval'))).toBe(true);
  });

  it('flags external font CDN domains', () => {
    const violations = validateCspForProduction("font-src 'self' https://fonts.googleapis.com");
    expect(violations.some((v) => v.includes('fonts.googleapis.com'))).toBe(true);
  });

  it('flags missing object-src', () => {
    const violations = validateCspForProduction("default-src 'self'; frame-ancestors 'none'; base-uri 'self'");
    expect(violations.some((v) => v.includes('object-src'))).toBe(true);
  });

  it('flags missing frame-ancestors', () => {
    const violations = validateCspForProduction("default-src 'self'; object-src 'none'; base-uri 'self'");
    expect(violations.some((v) => v.includes('frame-ancestors'))).toBe(true);
  });

  it('flags missing base-uri', () => {
    const violations = validateCspForProduction("default-src 'self'; object-src 'none'; frame-ancestors 'none'");
    expect(violations.some((v) => v.includes('base-uri'))).toBe(true);
  });
});

// ── Static security headers completeness ──────────────────────────────────────

describe('STATIC_SECURITY_HEADERS', () => {
  const keys = STATIC_SECURITY_HEADERS.map((h) => h.key);

  it('includes HSTS with long max-age', () => {
    const hsts = STATIC_SECURITY_HEADERS.find((h) => h.key === 'Strict-Transport-Security');
    expect(hsts).toBeDefined();
    expect(hsts!.value).toContain('max-age=63072000');
    expect(hsts!.value).toContain('includeSubDomains');
  });

  it('includes X-Frame-Options DENY', () => {
    const xfo = STATIC_SECURITY_HEADERS.find((h) => h.key === 'X-Frame-Options');
    expect(xfo?.value).toBe('DENY');
  });

  it('includes X-Content-Type-Options nosniff', () => {
    const xcto = STATIC_SECURITY_HEADERS.find((h) => h.key === 'X-Content-Type-Options');
    expect(xcto?.value).toBe('nosniff');
  });

  it('does not embed Content-Security-Policy (CSP is per-request)', () => {
    expect(keys).not.toContain('Content-Security-Policy');
  });

  it('covers all required header categories', () => {
    expect(keys).toContain('Strict-Transport-Security');
    expect(keys).toContain('X-Frame-Options');
    expect(keys).toContain('X-Content-Type-Options');
    expect(keys).toContain('Referrer-Policy');
    expect(keys).toContain('Permissions-Policy');
  });
});

// ── Middleware literal sync check ──────────────────────────────────────────────

describe('MIDDLEWARE_MATCHER sync', () => {
  it('matches the literal string in middleware.ts (keep in sync manually)', () => {
    // Next.js requires the config.matcher to be a static literal, so we cannot
    // reference MIDDLEWARE_MATCHER inside middleware.ts directly. This test is
    // the only enforcement — if you update either string, update the other too.
    const LITERAL_IN_MIDDLEWARE =
      '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)';
    expect(MIDDLEWARE_MATCHER).toBe(LITERAL_IN_MIDDLEWARE);
  });
});

// ── Request-ID header name ─────────────────────────────────────────────────────

describe('REQUEST_ID_HEADER', () => {
  it('is the expected lowercase header name', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });
});
