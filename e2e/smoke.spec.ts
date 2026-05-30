import { expect, test } from '@playwright/test';

/**
 * Smoke test — verifies the dev server boots with placeholder env vars and
 * serves a public, non-authenticated route. Catches regressions where:
 *   - env validation crashes the boot
 *   - the layout fails to render
 *   - a route handler throws during static analysis
 *
 * Pages exercised here are deliberately public (no Supabase auth required)
 * so this test is independent of database availability.
 */

test('serves the privacy policy page', async ({ page }) => {
  const response = await page.goto('/privacy');
  expect(response?.status()).toBeLessThan(400);
  // Title set in src/app/privacy/page.tsx
  await expect(page).toHaveTitle(/Privacy Policy/i);
});

test('serves the terms page', async ({ page }) => {
  const response = await page.goto('/terms');
  // The page may return 200 or a redirect-to-login if route is gated; either
  // way it should not crash with a 5xx.
  expect(response?.status() ?? 500).toBeLessThan(500);
});
