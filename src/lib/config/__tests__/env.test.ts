import { afterEach, describe, expect, it } from 'vitest';

import { validateEnv } from '../env';

const BASE_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  OPENAI_API_KEY: 'openai-key',
  RESEND_API_KEY: 'resend-key',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  // vitest sets NODE_ENV=test, which skips the production-only Upstash check.
};

const MANAGED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'DATABASE_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

function setEnv(overrides: Record<string, string | undefined>) {
  for (const key of MANAGED_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    delete process.env[key];
  }
});

describe('validateEnv', () => {
  it('treats an empty-string publishable key as undefined and falls back to the anon key', () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });

    const env = validateEnv();

    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-key');
  });

  it('does not throw when an optional URL var is an empty string', () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pub-key',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    });

    const env = validateEnv();

    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
  });

  it('still requires at least one public Supabase key', () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '   ',
    });

    expect(() => validateEnv()).toThrow(/public key/i);
  });
});
