/**
 * 03-fixtures.spec.ts
 * Custom test fixtures: extending base test with pre-configured page/state fixtures.
 */

import { test as base, expect } from '@playwright/test';

// Define custom fixture type
type TodoPageFixture = {
  todoPage: {
    goto: () => Promise<void>;
    addTodo: (text: string) => Promise<void>;
  };
};

// Extend base test with custom fixture
export const test = base.extend<TodoPageFixture>({
  todoPage: async ({ page }, use) => {
    const todoPage = {
      goto: async () => {
        await page.goto('https://demo.playwright.dev/todomvc/');
      },
      addTodo: async (text: string) => {
        const input = page.getByPlaceholder('What needs to be done?');
        await input.fill(text);
        await input.press('Enter');
      },
    };

    await use(todoPage);
  },
});

test.describe('Custom Fixture Tests', () => {
  test('should add items via todoPage fixture', async ({ todoPage, page }) => {
    await todoPage.goto();
    await todoPage.addTodo('Fixture item 1');
    await todoPage.addTodo('Fixture item 2');

    const todoItems = page.getByTestId('todo-title');
    await expect(todoItems).toHaveCount(2);
    await expect(todoItems.nth(0)).toHaveText('Fixture item 1');
  });
});
