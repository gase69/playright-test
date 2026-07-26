/**
 * 02-locators.spec.ts
 * Resilient semantic locators: getByRole, getByText, getByPlaceholder, getByTestId.
 */

import { test, expect } from '@playwright/test';

test.describe('Semantic Locators', () => {
  test('should interact with elements using getByRole and getByPlaceholder', async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc/');

    // Locate input by placeholder (accessible role/label)
    const newTodoInput = page.getByPlaceholder('What needs to be done?');
    await newTodoInput.fill('Learn Playwright Locators');
    await newTodoInput.press('Enter');

    // Locate newly added item using text matcher
    const todoItem = page.getByText('Learn Playwright Locators');
    await expect(todoItem).toBeVisible();

    // Toggle checkbox using role
    const toggleCheckbox = page.getByRole('checkbox', { name: 'Toggle Todo' });
    await toggleCheckbox.check();
    await expect(todoItem).toHaveCSS('text-decoration', /line-through/);
  });
});
