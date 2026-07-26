/**
 * 01-smoke.spec.ts
 * Baseline smoke test: verifies page loading and web-first title assertions.
 */

import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('should load example.com and verify title', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example Domain/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Example Domain');
  });
});
