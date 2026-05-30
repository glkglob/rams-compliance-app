import { afterEach, describe, expect, it } from 'vitest';

import { validateEnv } from '../env';

const BASE_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  OPENAI_API_KEY: 'openai-key',
  RESEND_API_KEY: 'resend-key',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  // vitest sets NODE_ENV=test, which skips the production-only Upstash check.
};

const MANAGED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'DATABASE_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'APP_URL',
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
  it('validates a fully-populated env and returns the parsed object', () => {
    setEnv({});

    const env = validateEnv();

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co');
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-key');
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role-key');
  });

  it('treats an empty-string optional URL var as undefined', () => {
    setEnv({
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    });

    const env = validateEnv();

    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
  });

  it('throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });

    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is blank', () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });

    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
});
