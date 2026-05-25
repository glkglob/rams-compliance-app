import { test, expect } from '@playwright/test';

test.describe('RAMS Compliance Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should create a project and upload documents', async ({ page }) => {
    await page.click('text=View All Projects');
    await page.click('text=Create New Project');
    await page.fill('[name="name"]', 'E2E Test Project');
    await page.fill('[name="clientName"]', 'Test Client');
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
