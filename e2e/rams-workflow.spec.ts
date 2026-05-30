import { test, expect } from '@playwright/test';

/**
 * Authenticated workflow tests.
 *
 * These tests require a real Supabase instance reachable from the dev server
 * (so a real user can be created and signed in). When NEXT_PUBLIC_SUPABASE_URL
 * is the placeholder configured in playwright.config.ts, we skip the entire
 * suite — login simply cannot succeed against a non-existent backend.
 *
 * To run these locally:
 *   1. `npm run supabase:start`  (or set NEXT_PUBLIC_SUPABASE_URL to a real instance)
 *   2. Create / seed a test user (test@example.com / password123)
 *   3. `npm run test:e2e`
 */

const PLACEHOLDER_HOSTS = ['placeholder.supabase.co'];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const isPlaceholder =
  !supabaseUrl ||
  PLACEHOLDER_HOSTS.some((host) => supabaseUrl.includes(host));

test.describe('RAMS Compliance Workflow', () => {
  test.skip(
    isPlaceholder,
    'Skipping authenticated E2E suite: NEXT_PUBLIC_SUPABASE_URL is a placeholder. ' +
      'Set real values in .env.test.local (see .env.test.local.example) and re-run.',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    // Login form inputs are keyed by id, not name (see src/app/login/page.tsx).
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should create a project and upload documents', async ({ page }) => {
    await page.click('text=View All Projects');
    await page.click('text=Create New Project');
    await page.fill('#name', 'E2E Test Project');
    await page.fill('#clientName', 'Test Client');
    await page.click('button[type="submit"]');
    await expect(page.getByText('E2E Test Project')).toBeVisible();
  });

  test('should display dashboard with stats', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Total Projects')).toBeVisible();
    await expect(page.getByText('Pending Reviews')).toBeVisible();
    await expect(page.getByText('Approved RAMS')).toBeVisible();
  });

  test('should navigate through project tabs', async ({ page }) => {
    await page.goto('/projects');
    const projectCard = page.locator('.cursor-pointer').first();
    await projectCard.click();

    await expect(page.getByText('Overview')).toBeVisible();
    await expect(page.getByText('Compliance Documents')).toBeVisible();
    await expect(page.getByText('RAMS Submissions')).toBeVisible();
    await expect(page.getByText('Settings')).toBeVisible();

    await page.click('text=Compliance Documents');
    await expect(page.getByText('Upload Compliance Documents')).toBeVisible();
  });
});
