import { afterEach, describe, expect, it } from 'vitest';

import { buildCsp, STATIC_SECURITY_HEADERS } from '@/lib/security-headers';

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  mutableEnv.NODE_ENV = originalNodeEnv;
});

function setNodeEnv(value: string) {
  mutableEnv.NODE_ENV = value;
}

describe('security headers', () => {
  it('builds a production nonce CSP without unsafe inline/eval script execution', () => {
    setNodeEnv('production');

    const csp = buildCsp('nonce-value');

    expect(csp).toContain("script-src 'self' 'nonce-nonce-value' 'strict-dynamic'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('keeps static headers separate from the per-request CSP', () => {
    expect(STATIC_SECURITY_HEADERS.some((header) => header.key === 'Content-Security-Policy')).toBe(false);
    expect(STATIC_SECURITY_HEADERS).toContainEqual({ key: 'X-Content-Type-Options', value: 'nosniff' });
  });
});
