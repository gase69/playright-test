#!/usr/bin/env -S npx tsx
/**
 * scripts/generate-aws-rds-estimate.ts
 * Standalone CLI generator for AWS RDS Pricing Calculator estimates.
 *
 * Usage:
 *   npx tsx scripts/generate-aws-rds-estimate.ts [options]
 *
 * Options:
 *   --engine, -e        Database Engine (default: PostgreSQL)
 *   --region, -r        AWS Region code (default: eu-central-1)
 *   --instance-type, -i Instance Class shape (default: db.r7g.xlarge)
 *   --storage-type, -t  Storage Volume Type (default: gp3)
 *   --storage-gb, -s    Storage size in GB (default: 50)
 *   --deployment, -d    Deployment Model (default: Multi-AZ)
 *   --description       Custom description for the RDS service
 *   --name              Custom title for the estimate
 *   --headed            Run browser in visible window mode (default: false)
 *   --out-csv, -c       Target output path for CSV export (default: test-results/aws-rds-estimate-YYYY-MM-DD_HH-mm-ss.csv)
 *   --out-url, -u       Target output path for share URL (default: test-results/aws-rds-url-YYYY-MM-DD_HH-mm-ss.txt)
 */

import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

// Helper to generate ISO-like date string for collision-free output filenames
function getTimestampString(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

// Region code map helper
const REGION_MAP: Record<string, string> = {
  'eu-central-1': 'Frankfurt',
  'us-east-1': 'N. Virginia',
  'us-east-2': 'Ohio',
  'us-west-1': 'N. California',
  'us-west-2': 'Oregon',
  'eu-west-1': 'Ireland',
  'eu-west-2': 'London',
  'eu-west-3': 'Paris',
  'ap-southeast-1': 'Singapore',
  'ap-southeast-2': 'Sydney',
  'ap-northeast-1': 'Tokyo',
  'sa-east-1': 'São Paulo',
};

// Storage type map helper
const STORAGE_MAP: Record<string, string> = {
  'gp3': 'General Purpose SSD (gp3)',
  'gp2': 'General Purpose SSD (gp2)',
  'io1': 'Provisioned IOPS SSD (io1)',
  'io2': 'Provisioned IOPS SSD (io2)',
  'magnetic': 'Magnetic',
};

async function run() {
  const timestamp = getTimestampString();
  const defaultCsvFilename = `test-results/aws-rds-estimate-${timestamp}.csv`;
  const defaultUrlFilename = `test-results/aws-rds-url-${timestamp}.txt`;

  const { values } = parseArgs({
    options: {
      engine: { type: 'string', short: 'e', default: 'PostgreSQL' },
      region: { type: 'string', short: 'r', default: 'eu-central-1' },
      'instance-type': { type: 'string', short: 'i', default: 'db.r7g.xlarge' },
      'storage-type': { type: 'string', short: 't', default: 'gp3' },
      'storage-gb': { type: 'string', short: 's', default: '50' },
      deployment: { type: 'string', short: 'd', default: 'Multi-AZ' },
      description: { type: 'string', default: 'RDS PostgreSQL - Production Database' },
      name: { type: 'string', default: 'RDS PostgreSQL Production Estimate (eu-central-1)' },
      headed: { type: 'boolean', default: false },
      'out-csv': { type: 'string', short: 'c' },
      'out-url': { type: 'string', short: 'u' },
    },
    allowPositionals: true,
  });

  const engine = values.engine || 'PostgreSQL';
  const regionCode = values.region || 'eu-central-1';
  const regionSearch = REGION_MAP[regionCode.toLowerCase()] || regionCode;
  const instanceType = values['instance-type'] || 'db.r7g.xlarge';
  const storageTypeCode = values['storage-type'] || 'gp3';
  const storageTypeLabel = STORAGE_MAP[storageTypeCode.toLowerCase()] || storageTypeCode;
  const storageGb = values['storage-gb'] || '50';
  const descriptionText = values.description || `RDS ${engine} Database`;
  const estimateTitle = values.name || `RDS ${engine} Estimate (${regionCode})`;
  const isHeaded = !!values.headed;
  const outCsvPath = path.resolve(process.cwd(), values['out-csv'] || defaultCsvFilename);
  const outUrlPath = path.resolve(process.cwd(), values['out-url'] || defaultUrlFilename);

  console.log('\n==================================================');
  console.log('AWS RDS ESTIMATE GENERATOR');
  console.log('==================================================');
  console.log(`Engine       : Amazon RDS for ${engine}`);
  console.log(`Region       : ${regionCode} (${regionSearch})`);
  console.log(`Instance     : ${instanceType}`);
  console.log(`Storage      : ${storageGb} GB (${storageTypeLabel})`);
  console.log(`Description  : ${descriptionText}`);
  console.log(`Estimate Name: ${estimateTitle}`);
  console.log(`Mode         : ${isHeaded ? 'Headed (Visible)' : 'Headless'}`);
  console.log(`CSV Output   : ${outCsvPath}`);
  console.log(`URL Output   : ${outUrlPath}`);
  console.log('==================================================\n');

  console.log('⏳ Launching browser and navigating to AWS Calculator...');
  const browser = await chromium.launch({ headless: !isHeaded });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Helper to dismiss cookie banner
    const dismissCookies = async () => {
      await page.evaluate(() => {
        const acceptBtn = document.getElementById('awsccc-cs-btn-a') || document.querySelector('button[aria-label*="Accept"]');
        if (acceptBtn) (acceptBtn as HTMLElement).click();
        const banner = document.getElementById('awsccc-sb-ux-c') || document.querySelector('.awsccc-sb-c');
        if (banner) banner.remove();
      });
    };

    // 1. Open AWS Pricing Calculator homepage
    await page.goto('https://calculator.aws/#/', { waitUntil: 'networkidle' });
    await dismissCookies();

    // 2. Click "Create estimate"
    const createEstimateBtn = page.getByRole('button', { name: /create estimate/i }).first();
    await createEstimateBtn.click();

    // 3. Search for RDS Service
    const searchInput = page.getByPlaceholder(/search for a service/i).or(page.getByPlaceholder(/search/i)).first();
    await searchInput.fill(`Amazon RDS for ${engine}`);
    await page.waitForTimeout(500);

    // 4. Click "Configure"
    const configureBtn = page.getByRole('button', { name: /configure/i }).first();
    await configureBtn.click();
    await page.waitForLoadState('networkidle');
    await dismissCookies();

    // 5. Fill Description
    const descriptionInput = page.getByPlaceholder('Enter a description for your estimate').first();
    if (await descriptionInput.isVisible().catch(() => false)) {
      await descriptionInput.fill(descriptionText);
    }

    // 6. Select Region
    const regionDropdown = page.getByRole('button', { name: /US East|Europe|Region/i }).first();
    if (await regionDropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
      await regionDropdown.click();
      await page.waitForTimeout(500);

      const regionSearchInput = page.getByPlaceholder(/search/i).or(page.getByRole('textbox')).first();
      if (await regionSearchInput.isVisible().catch(() => false)) {
        await regionSearchInput.fill(regionSearch);
        await page.waitForTimeout(300);
      }

      const regionOption = page.getByText(new RegExp(regionSearch, 'i')).first();
      if (await regionOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        await regionOption.click();
      }
    }

    // 7. Select Instance Type
    const instanceCombobox = page.getByRole('combobox', { name: /select an instance/i }).or(page.getByPlaceholder(/select an instance/i)).first();
    if (await instanceCombobox.isVisible({ timeout: 5000 }).catch(() => false)) {
      await instanceCombobox.click();
      await instanceCombobox.fill(instanceType.replace(/^db\./, ''));
      await page.waitForTimeout(500);

      const matchedOption = page.getByText(new RegExp(instanceType.replace('.', '\\.'), 'i')).first();
      if (await matchedOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        await matchedOption.click();
      }
    }

    // 8. Select Storage Type & Amount
    const storageTypeOption = page.getByText(new RegExp(storageTypeLabel.replace('(', '\\(').replace(')', '\\)'), 'i')).first();
    if (await storageTypeOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await storageTypeOption.click();
    }

    const storageAmountInput = page.getByRole('spinbutton', { name: /storage amount/i }).or(page.getByPlaceholder(/storage amount/i)).first();
    if (await storageAmountInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await storageAmountInput.fill(storageGb);
    }

    // 9. Save and view summary
    await dismissCookies();
    const saveAndSummaryBtn = page.getByRole('button', { name: /save and view summary|save and add to estimate/i }).first();
    await saveAndSummaryBtn.click({ force: true });

    // 10. Verify Redirection to Estimate Summary
    await page.waitForLoadState('networkidle');

    // 11. Edit Estimate Title
    const editTitleLink = page.getByRole('link', { name: /edit my estimate|edit/i }).or(page.getByText(/edit/i)).first();
    if (await editTitleLink.isVisible().catch(() => false)) {
      await editTitleLink.click({ force: true }).catch(() => {});
      const titleInput = page.getByRole('textbox', { name: /enter name|estimate name/i }).first();
      if (await titleInput.isVisible().catch(() => false)) {
        await titleInput.fill(estimateTitle);
        const saveTitleBtn = page.getByRole('button', { name: /^save$/i }).first();
        if (await saveTitleBtn.isVisible().catch(() => false)) {
          await saveTitleBtn.click();
        }
      }
    }

    // Extract Cost Numbers from Summary
    const monthlyCostText = await page.getByText(/Monthly cost/i).locator('xpath=..').textContent().catch(() => '');
    const annualCostText = await page.getByText(/Total 12 months cost/i).locator('xpath=..').textContent().catch(() => '');

    // 12. Export CSV
    let exportedCsvPath = '';
    const exportBtn = page.getByRole('button', { name: /export/i }).first();
    if (await exportBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await exportBtn.click({ force: true });
      await page.waitForTimeout(500);

      const csvOption = page.getByText(/^csv$/i).or(page.getByRole('menuitem', { name: /csv/i })).first();
      if (await csvOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        await csvOption.click({ force: true });
        await page.waitForTimeout(500);

        const okBtn = page.getByRole('button', { name: /^ok$/i }).first();
        if (await okBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
          await okBtn.click({ force: true });
          const download = await downloadPromise.catch(() => null);
          if (download) {
            const outDir = path.dirname(outCsvPath);
            if (!fs.existsSync(outDir)) {
              fs.mkdirSync(outDir, { recursive: true });
            }
            await download.saveAs(outCsvPath);
            exportedCsvPath = outCsvPath;
          }
        }
      }
    }

    // 13. Share & Extract Public Estimate Link
    let publicShareUrl = '';
    await dismissCookies();
    const shareBtn = page.getByRole('button', { name: /share/i }).first();
    if (await shareBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shareBtn.click({ force: true });
      await page.waitForTimeout(1000);

      const agreeBtn = page.getByRole('button', { name: /agree and continue|save/i }).first();
      if (await agreeBtn.isVisible().catch(() => false)) {
        await agreeBtn.click({ force: true });
        await page.waitForTimeout(1000);
      }

      const publicLinkInput = page.getByRole('textbox', { name: /copy public link/i }).first();
      if (await publicLinkInput.isVisible().catch(() => false)) {
        publicShareUrl = await publicLinkInput.inputValue();
        const urlDir = path.dirname(outUrlPath);
        if (!fs.existsSync(urlDir)) {
          fs.mkdirSync(urlDir, { recursive: true });
        }
        fs.writeFileSync(outUrlPath, publicShareUrl);
      }
    }

    console.log('\n==================================================');
    console.log('✅ AWS RDS ESTIMATE SUCCESSFULLY GENERATED');
    console.log('==================================================');
    if (monthlyCostText) console.log(`Monthly Cost : ${monthlyCostText.trim()}`);
    if (annualCostText)  console.log(`Annual Cost  : ${annualCostText.trim()}`);
    if (exportedCsvPath) console.log(`CSV Export   : ${exportedCsvPath}`);
    if (publicShareUrl)  console.log(`Public URL   : ${publicShareUrl} (saved to ${outUrlPath})`);
    console.log('==================================================\n');

  } catch (error) {
    console.error('❌ Error generating AWS RDS Estimate:', error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
