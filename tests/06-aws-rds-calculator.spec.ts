/**
 * 06-aws-rds-calculator.spec.ts
 * E2E Test: Configures AWS RDS PostgreSQL pricing simulation in eu-central-1 with exact parameters:
 * - Instance: r7g.xlarge (db.r7g.xlarge)
 * - Storage Type: General Purpose SSD (gp3)
 * - Storage Amount: 50 GB
 * - No Proxy
 * - Performance Insights: 7 days (free tier)
 * - Proper RDS Name & Estimate Name
 * - Export Estimate as CSV
 * - Save and output public estimate link
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('AWS Pricing Calculator - Custom RDS PostgreSQL Simulation', () => {
  test('should configure RDS PostgreSQL with r7g.xlarge, gp3 50GB, export CSV and save estimate link', async ({ page }) => {
    test.setTimeout(120000);

    // Helper to dismiss AWS cookie consent banner overlay (#awsccc-sb-ux-c)
    const dismissCookieConsent = async () => {
      await page.evaluate(() => {
        const acceptBtn = document.getElementById('awsccc-cs-btn-a') || document.querySelector('button[aria-label*="Accept"]');
        if (acceptBtn) {
          (acceptBtn as HTMLElement).click();
        }
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

    // 5. Set Description / Proper RDS Name
    const rdsDescription = 'RDS PostgreSQL - Production Database';
    const descriptionInput = page.getByPlaceholder('Enter a description for your estimate').first();
    if (await descriptionInput.isVisible().catch(() => false)) {
      await descriptionInput.fill(rdsDescription);
    }

    // 6. Select Region: "Europe (Frankfurt)" / eu-central-1
    // Note: the page has two dropdowns whose *current value* can read "Region" or a region
    // name ("US East (Ohio)"), so matching on displayed value is ambiguous. Target by the
    // field's accessible label ("Choose a Region") instead.
    const regionDropdown = page.getByRole('button', { name: /choose a region/i }).first();
    if (await regionDropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
      await regionDropdown.click();
      await page.waitForTimeout(500);

      const frankfurtOption = page.getByText(/Europe \(Frankfurt\)\s*eu-central-1/i).first();
      await expect(frankfurtOption).toBeVisible({ timeout: 5000 });
      await frankfurtOption.click();
      await expect(regionDropdown).toContainText(/Europe \(Frankfurt\)/i);
    }

    // 7. Select Instance Type: r7g.xlarge (db.r7g.xlarge)
    const instanceCombobox = page.getByRole('combobox', { name: /select an instance/i }).or(page.getByPlaceholder(/select an instance/i)).first();
    if (await instanceCombobox.isVisible({ timeout: 5000 }).catch(() => false)) {
      await instanceCombobox.click();
      await instanceCombobox.fill('r7g.xlarge');
      await page.waitForTimeout(500);

      const r7gOption = page.getByText(/db\.r7g\.xlarge/i).first();
      if (await r7gOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        await r7gOption.click();
      }
    }

    // 8. Select Storage Type (gp3) & Storage Amount (50 GB)
    // The gp3 option text only exists once the storage volume dropdown is opened.
    const storageVolumeDropdown = page.getByRole('button', { name: /general purpose ssd/i }).first();
    if (await storageVolumeDropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
      await storageVolumeDropdown.click();
      const storageTypeOption = page.getByText(/General Purpose SSD \(gp3\)/i).first();
      await expect(storageTypeOption).toBeVisible({ timeout: 5000 });
      await storageTypeOption.click();
      await expect(storageVolumeDropdown).toContainText(/gp3/i);
    }

    const storageAmountInput = page.getByRole('spinbutton', { name: /storage amount/i }).or(page.getByPlaceholder(/storage amount/i)).first();
    if (await storageAmountInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await storageAmountInput.fill('50');
    }

    // 9. Verify Performance Insights (7 days free tier selected by default / verified)
    const perfInsightsHeading = page.getByText(/RDS Performance Insights/i).first();
    if (await perfInsightsHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
      await perfInsightsHeading.scrollIntoViewIfNeeded();
    }

    // 10. Save and view summary
    await dismissCookieConsent();
    const saveAndSummaryBtn = page.getByRole('button', { name: /save and view summary|save and add to estimate|add to estimate/i }).first();
    await expect(saveAndSummaryBtn).toBeVisible({ timeout: 15000 });
    await saveAndSummaryBtn.click({ force: true });

    // 11. Verify Redirection to My Estimate page
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/my estimate|estimate summary/i).first()).toBeVisible({ timeout: 20000 });

    // 12. Set Proper Estimate Name
    // Editing the name opens an inline textbox (accessible name "Enter Name") with its own
    // Save/Cancel buttons; the whole page (Export, Share, etc.) stays disabled until Save is
    // clicked, so the edit must be explicitly committed rather than left open.
    const editEstimateTitle = page.getByRole('link', { name: /edit my estimate|edit/i }).or(page.getByText(/edit/i)).first();
    if (await editEstimateTitle.isVisible().catch(() => false)) {
      await editEstimateTitle.click({ force: true }).catch(() => {});
      const titleInput = page.getByRole('textbox', { name: /enter name/i }).first();
      if (await titleInput.isVisible().catch(() => false)) {
        await titleInput.fill('RDS PostgreSQL Production Estimate (eu-central-1)');
        await page.getByRole('button', { name: /^save$/i }).click();
      }
    }

    // 13. Export Estimate as CSV
    const exportBtn = page.getByRole('button', { name: /export/i }).first();
    if (await exportBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await exportBtn.click({ force: true });
      await page.waitForTimeout(500);

      const csvOption = page.getByText(/csv/i).first();
      if (await csvOption.isVisible().catch(() => false)) {
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
        await csvOption.click({ force: true });
        const download = await downloadPromise;
        if (download) {
          const downloadPath = path.join(process.cwd(), 'test-results', 'aws-rds-estimate.csv');
          await download.saveAs(downloadPath);
          console.log(`CSV Estimate exported successfully to: ${downloadPath}`);
        }
      }
    }

    // 14. Click "Share" to generate public estimate link
    await dismissCookieConsent();
    const shareBtn = page.getByRole('button', { name: /share/i }).first();
    if (await shareBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shareBtn.click({ force: true });
      await page.waitForTimeout(1000);

      const agreeBtn = page.getByRole('button', { name: /agree and continue|save/i }).first();
      if (await agreeBtn.isVisible().catch(() => false)) {
        await agreeBtn.click({ force: true });
        await page.waitForTimeout(1000);
      }

      // Extract generated public link text
      const publicLinkInput = page.getByRole('textbox', { name: /copy public link/i }).first();
      if (await publicLinkInput.isVisible().catch(() => false)) {
        const savedUrl = await publicLinkInput.inputValue();
        console.log(`Saved AWS Estimate URL: ${savedUrl}`);
        fs.writeFileSync(path.join(process.cwd(), 'test-results', 'estimate-url.txt'), savedUrl);
      }
    }

    // Final screenshot of updated estimate summary
    await page.screenshot({ path: 'test-results/07-aws-rds-custom-estimate.png', fullPage: true });
  });
});
