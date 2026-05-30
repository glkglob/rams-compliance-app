import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * E2E env strategy
 * ----------------
 * The Next.js dev server validates env vars on boot (via the instrumentation
 * hook + getSupabaseEnv). That means Playwright cannot start the server
 * without at least placeholder values for the required vars.
 *
 * Resolution order, lowest to highest precedence:
 *   1. Safe placeholders defined below (boots the server, never authenticate)
 *   2. .env.test.local (developer-provided real or test-instance values)
 *   3. Real process.env (highest precedence — e.g. CI secrets, overrides)
 *
 * The instrumentation hook checks `NODE_ENV === 'test'` and skips the full
 * validateEnv() call, so placeholder values are accepted without weakening
 * production validation.
 */

const envTestLocalPath = path.resolve(process.cwd(), '.env.test.local');
if (fs.existsSync(envTestLocalPath)) {
  // process.loadEnvFile is stable in Node 22. Loads into the current process,
  // then we forward everything to the Playwright-managed dev server below.
  try {
    process.loadEnvFile(envTestLocalPath);
  } catch {
    // Non-fatal: missing or malformed file just falls back to placeholders.
  }
}

const safePlaceholders: Record<string, string> = {
  // Mark the run as E2E so app code (and the instrumentation hook) can skip
  // env validation without us having to override NODE_ENV (Next.js owns that).
  E2E: 'true',

  // Supabase — placeholder URL + key. Real network calls will fail, which is
  // the intended behaviour for unauthenticated/smoke tests.
  NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-role-key',

  // Other required server-only vars — placeholders only.
  OPENAI_API_KEY: 'placeholder-openai-key',
  RESEND_API_KEY: 'placeholder-resend-key',
  DATABASE_URL: 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
};

// Real process env wins over file-loaded values, which win over placeholders.
const webServerEnv: Record<string, string> = { ...safePlaceholders };
for (const key of Object.keys(webServerEnv)) {
  const fromEnv = process.env[key];
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    webServerEnv[key] = fromEnv;
  }
}
// Forward anything else already in process.env so secrets exposed in CI
// reach the dev server (Sentry, Upstash, etc.).
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string' && !(key in webServerEnv)) {
    webServerEnv[key] = value;
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: webServerEnv,
  },
});
