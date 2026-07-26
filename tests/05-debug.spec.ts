/**
 * 05-debug.spec.ts
 * Debugging, tracing, and failure screenshots demonstration.
 */

import { test, expect } from '@playwright/test';

test.describe('Debugging and Diagnostics', () => {
  test('should take explicit full page screenshot', async ({ page }) => {
    await page.goto('https://example.com');
    
    // Explicit screenshot capture
    await page.screenshot({ path: 'test-results/example-homepage.png', fullPage: true });
    
    const heading = page.locator('h1');
    await expect(heading).toHaveText('Example Domain');
  });
});
