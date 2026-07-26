/**
 * 04-auth.spec.ts
 * Session state persistence: demonstrates storageState saving and reuse.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.join(__dirname, '../.auth/user.json');

test.describe('Authentication & StorageState', () => {
  test('should save browser storage state', async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc/');
    
    // Add item to produce local storage state
    await page.getByPlaceholder('What needs to be done?').fill('Persistent Auth Item');
    await page.getByPlaceholder('What needs to be done?').press('Enter');

    // Save storageState (cookies & localStorage)
    const authDir = path.dirname(authFile);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    await page.context().storageState({ path: authFile });
    expect(fs.existsSync(authFile)).toBe(true);
  });

  test('should reuse saved storage state in new context', async ({ browser }) => {
    if (!fs.existsSync(authFile)) {
      test.skip();
    }

    // Launch context with pre-saved state
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();

    await page.goto('https://demo.playwright.dev/todomvc/');
    const todoItem = page.getByText('Persistent Auth Item');
    await expect(todoItem).toBeVisible();

    await context.close();
  });
});
