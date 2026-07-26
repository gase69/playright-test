/**
 * 06-aws-rds-calculator.spec.ts
 * E2E Test: Creates an AWS RDS PostgreSQL pricing simulation in eu-central-1 (Frankfurt)
 * and saves the estimate summary.
 */

import { test, expect } from '@playwright/test';

test.describe('AWS Pricing Calculator - RDS PostgreSQL Simulation', () => {
  test('should configure RDS PostgreSQL in eu-central-1 and save estimate', async ({ page }) => {
    test.setTimeout(90000);

    // Helper to dismiss AWS cookie consent container (#awsccc-sb-ux-c)
    const dismissCookieConsent = async () => {
      await page.evaluate(() => {
        const acceptBtn = document.getElementById('awsccc-cs-btn-a') || document.querySelector('button[aria-label*="Accept"]');
        if (acceptBtn) {
          (acceptBtn as HTMLElement).click();
        }
        // Remove cookie container overlay from DOM if present
        const cookieBanner = document.getElementById('awsccc-sb-ux-c') || document.querySelector('.awsccc-sb-c');
        if (cookieBanner) {
          cookieBanner.remove();
        }
      });
    };

    // 1. Open AWS Pricing Calculator homepage
    await page.goto('https://calculator.aws/#/', { waitUntil: 'networkidle' });
    await dismissCookieConsent();

    // 2. Click "Create estimate"
    const createEstimateBtn = page.getByRole('button', { name: /create estimate/i }).first();
    await expect(createEstimateBtn).toBeVisible({ timeout: 15000 });
    await createEstimateBtn.click();

    // 3. Search for "Amazon RDS for PostgreSQL"
    const searchInput = page.getByPlaceholder(/search for a service/i).or(page.getByPlaceholder(/search/i)).first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await searchInput.fill('Amazon RDS for PostgreSQL');
    await page.waitForTimeout(500);

    // 4. Click "Configure" on Amazon RDS for PostgreSQL card
    const configureBtn = page.getByRole('button', { name: /configure/i }).first();
    await expect(configureBtn).toBeVisible({ timeout: 15000 });
    await configureBtn.click();
    await page.waitForLoadState('networkidle');
    await dismissCookieConsent();

    // 5. Select Region: "Europe (Frankfurt)" / eu-central-1
    const regionDropdown = page.getByRole('button', { name: /US East|Europe|Region/i }).first();
    if (await regionDropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
      await regionDropdown.click();
      await page.waitForTimeout(500);

      const regionSearch = page.getByPlaceholder(/search/i).or(page.getByRole('textbox')).first();
      if (await regionSearch.isVisible().catch(() => false)) {
        await regionSearch.fill('Frankfurt');
        await page.waitForTimeout(300);
      }

      const frankfurtOption = page.getByText(/Europe \(Frankfurt\)|eu-central-1/i).first();
      if (await frankfurtOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        await frankfurtOption.click();
      }
    }

    // 6. Set Description
    const descriptionInput = page.getByPlaceholder('Enter a description for your estimate').first();
    if (await descriptionInput.isVisible().catch(() => false)) {
      await descriptionInput.fill('PostgreSQL DB Production - eu-central-1');
    }

    // 7. Dismiss any cookie overlay again right before clicking summary button
    await dismissCookieConsent();

    // 8. Click "Save and view summary"
    const saveAndSummaryBtn = page.getByRole('button', { name: /save and view summary|save and add to estimate|add to estimate/i }).first();
    await expect(saveAndSummaryBtn).toBeVisible({ timeout: 15000 });
    await saveAndSummaryBtn.click({ force: true });

    // 9. Verify redirection to My Estimate page
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/my estimate|estimate summary/i).first()).toBeVisible({ timeout: 20000 });

    // 10. Click "Save and share" to generate public estimate link
    await dismissCookieConsent();
    const saveAndShareBtn = page.getByRole('button', { name: /save and share/i }).first();
    if (await saveAndShareBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveAndShareBtn.click({ force: true });
      await page.waitForTimeout(1000);

      const agreeBtn = page.getByRole('button', { name: /agree and continue|save/i }).first();
      if (await agreeBtn.isVisible().catch(() => false)) {
        await agreeBtn.click({ force: true });
      }
    }

    // Final screenshot of saved simulation estimate summary
    await page.screenshot({ path: 'test-results/05-aws-estimate-saved.png', fullPage: true });
  });
});
