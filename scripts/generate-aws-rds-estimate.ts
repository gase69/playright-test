#!/usr/bin/env -S npx tsx
/**
 * scripts/generate-aws-rds-estimate.ts
 * Standalone CLI generator for AWS RDS Pricing Calculator estimates.
 *
 * Usage:
 *   ./scripts/generate-aws-rds-estimate.ts [options]
 *
 * Options:
 *   --engine, -e        Database Engine (default: PostgreSQL)
 *   --region, -r        AWS Region code (default: eu-central-1)
 *   --instance-type, -i Instance Class shape (default: db.r7g.xlarge)
 *   --storage-type, -t  Storage Volume Type (default: gp3)
 *   --storage-gb, -s    Storage size in GB (default: 50)
 *   --deployment, -d    Deployment Model, e.g. Single-AZ / Multi-AZ (default: Multi-AZ)
 *   --license           License model, e.g. "License included" / "Bring your own media"
 *                       (engine-specific field, e.g. SQL Server/Oracle; omitted if not set)
 *   --edition           Database edition, e.g. Enterprise / Standard / Web / Express
 *                       (engine-specific field, e.g. SQL Server/Oracle; omitted if not set)
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

// Helper to escape arbitrary strings for safe use in RegExp constructors
const escapeRegExp = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// locator.isVisible({ timeout }) does NOT poll for up to `timeout` — it's a single immediate
// check and the timeout option is silently ignored. On a slow render, a field can be checked
// before it has mounted and get treated as "absent", silently skipping a step that should have
// run. This actually waits, falling back to false only once the timeout genuinely elapses.
async function waitVisible(locator: import('@playwright/test').Locator, timeout = 5000): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

// The calculator flags incompatible option combinations (e.g. an edition not supported by the
// chosen instance size) with an inline "Invalid Selection. ..." message next to the field,
// while leaving the field visually populated and the page otherwise clickable through to save.
// Silently continuing past this produces a "successful" estimate for the wrong configuration.
// Changing an upstream field (e.g. License) can show this error for ~1s while the page
// recomputes a downstream field's (e.g. Database edition) validity before it settles into
// either a valid default or a genuinely-invalid stale value, so this polls briefly rather than
// checking once — a single immediate check would misfire on that transient recompute.
async function assertNoValidationErrors(
  page: import('@playwright/test').Page,
  context: string,
  attempts = 5,
  intervalMs = 400,
): Promise<void> {
  let errorMessages: string[] = [];
  for (let i = 0; i < attempts; i++) {
    errorMessages = await page.getByText(/invalid selection/i).allTextContents();
    if (errorMessages.length === 0) return;
    await page.waitForTimeout(intervalMs);
  }
  throw new Error(`AWS Pricing Calculator rejected the configuration ${context}: ${errorMessages.join(' | ')}`);
}

// Selects an option from one of the calculator's labelled dropdown fields (Deployment option,
// License, Database edition, ...). Some requested values (e.g. "Enterprise" edition on a
// too-small instance class) are never offered at all for the current instance/license
// combination — that case has to be caught here since the option simply won't be clickable,
// no on-page error appears until you dig for the "Invalid Selection" banner. Fails loudly with
// the list of what *is* available rather than silently leaving the field on its default.
//
// verifyAfter runs the "Invalid Selection" check after this specific selection. Leave it false
// for a field whose change is expected to transiently invalidate a *different*, not-yet-touched
// field (e.g. switching License here always leaves Database edition on a stale, flagged value
// until that field's own selectDropdownOption call re-commits it) — asserting here would fail
// on a state this same flow is about to fix. Pass true only for the field that owns the error,
// once nothing later in the flow is relied on to resolve it.
async function selectDropdownOption(
  page: import('@playwright/test').Page,
  fieldLabel: string,
  desiredValue: string,
  fieldContext: string,
  verifyAfter = false,
): Promise<void> {
  const field = page.getByLabel(fieldLabel, { exact: true }).first();
  if (!(await waitVisible(field, 5000))) {
    return;
  }
  await field.click();
  await page.waitForTimeout(300);

  // Clean base target string, e.g. "Enterprise Edition" -> "Enterprise", "Standard Edition" -> "Standard"
  const baseTarget = desiredValue.replace(/\s+Edition$/i, '').trim();

  // Try locator candidates in order of strictness
  const candidateLocators = [
    page.getByRole('option', { name: new RegExp(`^${escapeRegExp(desiredValue)}$`, 'i') }).first(),
    page.getByRole('option', { name: new RegExp(`^${escapeRegExp(baseTarget)}$`, 'i') }).first(),
    page.getByRole('option', { name: new RegExp(escapeRegExp(desiredValue), 'i') }).first(),
    page.getByRole('option', { name: new RegExp(escapeRegExp(baseTarget), 'i') }).first(),
    page.getByRole('option').filter({ hasText: new RegExp(escapeRegExp(baseTarget), 'i') }).first(),
  ];

  let selectedOption: import('@playwright/test').Locator | null = null;
  for (const cand of candidateLocators) {
    if (await waitVisible(cand, 1000)) {
      selectedOption = cand;
      break;
    }
  }

  if (!selectedOption) {
    const available = await page.getByRole('option').allTextContents().catch(() => []);
    await page.keyboard.press('Escape').catch(() => {});
    throw new Error(
      `"${desiredValue}" is not a valid ${fieldContext} for the currently selected configuration. ` +
      `Available options: ${available.map((s) => s.trim()).filter(Boolean).join(', ') || '(none found)'}`
    );
  }

  await selectedOption.click();
  await page.waitForTimeout(300);
  if (verifyAfter) {
    await assertNoValidationErrors(page, `after selecting ${fieldContext} = "${desiredValue}"`);
  }
}

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

interface ParsedCliValues {
  engine?: string;
  region?: string;
  'instance-type'?: string;
  'storage-type'?: string;
  'storage-gb'?: string;
  deployment?: string;
  license?: string;
  edition?: string;
  'utilization-value'?: string;
  'utilization-unit'?: string;
  description?: string;
  name?: string;
  headed?: boolean;
  'out-csv'?: string;
  'out-url'?: string;
  help?: boolean;
  verbose?: boolean;
}

function printHelp(verbose = false): void {
  console.log(`
AWS RDS Estimate Generator CLI

Usage:
  ./scripts/generate-aws-rds-estimate.ts [options]
  npm run estimate -- [options]

Options:
  --engine, -e        Database Engine (default: PostgreSQL)
  --region, -r        AWS Region code (default: eu-central-1)
  --instance-type, -i Instance Class shape (default: db.r7g.xlarge)
  --storage-type, -t  Storage Volume Type (default: gp3)
  --storage-gb, -s    Storage size in GB (default: 50)
  --deployment, -d    Deployment Model, e.g. Single-AZ / Multi-AZ (default: Multi-AZ)
  --license           License model, e.g. "License included" / "Bring your own media"
  --edition           Database edition, e.g. Enterprise / Standard / Web / Express
  --utilization-value Utilization quantity value (default: 100)
  --utilization-unit  Utilization unit (%Utilized/Month, Hours/Day, Hours/Week, Hours/Month)
  --description       Custom description for the RDS service
  --name              Custom title for the estimate
  --headed            Run browser in visible window mode (default: false)
  --out-csv, -c       Target output path for CSV export
  --out-url, -u       Target output path for share URL
  --verbose, -v       Show detailed option values and usage examples
  --help, -h          Show this help message`);

  if (!verbose) {
    console.log(`
Tip: Run with '--verbose' or '-v' (e.g. './scripts/generate-aws-rds-estimate.ts --help -v')
     to view all supported engines, region mappings, storage types, editions, and examples.\n`);
    return;
  }

  console.log(`
================================================================================
VERBOSE OPTIONS & ACCEPTED VALUES GUIDE
================================================================================

1. Database Engines (--engine, -e):
   • PostgreSQL                    (Default)
   • MySQL
   • MariaDB
   • SQL Server                    (Requires --license & --edition for specific shapes)
   • Oracle                        (Requires --license & --edition for specific shapes)
   • Aurora PostgreSQL / Aurora MySQL

2. AWS Regions (--region, -r):
   • eu-central-1 (Frankfurt)      (Default)
   • us-east-1     (N. Virginia)    • us-east-2     (Ohio)
   • us-west-1     (N. California)  • us-west-2     (Oregon)
   • eu-west-1     (Ireland)        • eu-west-2     (London)
   • eu-west-3     (Paris)          • ap-southeast-1(Singapore)
   • ap-southeast-2(Sydney)         • ap-northeast-1(Tokyo)
   • sa-east-1     (São Paulo)

3. Storage Volume Types (--storage-type, -t):
   • gp3         General Purpose SSD (gp3) (Default)
   • gp2         General Purpose SSD (gp2)
   • io1         Provisioned IOPS SSD (io1)
   • io2         Provisioned IOPS SSD (io2)
   • magnetic    Magnetic storage

4. Deployment Options (--deployment, -d):
   • Multi-AZ    Multi-AZ DB Instance or Cluster (Default)
   • Single-AZ   Single DB Instance

5. License Models (--license):
   • "License included"              (Common for SQL Server / Oracle)
   • "Bring your own license" / "Bring your own media" (BYOL)

6. Database Editions (--edition):
   • "Enterprise Edition"            (Note: SQL Server Enterprise requires >= 4 vCPU / xlarge)
   • "Standard Edition" / "Standard Edition Two (SE2)"
   • "Web Edition"                   (SQL Server only)
   • "Express Edition"               (SQL Server only)

7. Utilization Units (--utilization-unit):
   • "%Utilized/Month" (Default)
   • "Hours/Day"
   • "Hours/Week"
   • "Hours/Month"

================================================================================
EXAMPLES
================================================================================
• Default PostgreSQL Multi-AZ on Graviton:
  ./scripts/generate-aws-rds-estimate.ts

• SQL Server Standard Edition with License Included:
  ./scripts/generate-aws-rds-estimate.ts -e "SQL Server" -i db.m6i.xlarge --license "License included" --edition "Standard Edition"

• Oracle Database Enterprise (BYOL) with Headed GUI:
  ./scripts/generate-aws-rds-estimate.ts -e Oracle -i db.m6i.xlarge --license "Bring your own license" --edition "Enterprise Edition" --headed
\n`);
}

async function run() {
  const timestamp = getTimestampString();
  const defaultCsvFilename = `test-results/aws-rds-estimate-${timestamp}.csv`;
  const defaultUrlFilename = `test-results/aws-rds-url-${timestamp}.txt`;

  let parsed: { values: ParsedCliValues };
  try {
    parsed = parseArgs({
      options: {
        engine: { type: 'string', short: 'e', default: 'PostgreSQL' },
        region: { type: 'string', short: 'r', default: 'eu-central-1' },
        'instance-type': { type: 'string', short: 'i', default: 'db.r7g.xlarge' },
        'storage-type': { type: 'string', short: 't', default: 'gp3' },
        'storage-gb': { type: 'string', short: 's', default: '50' },
        deployment: { type: 'string', short: 'd', default: 'Multi-AZ' },
        license: { type: 'string' },
        edition: { type: 'string' },
        'utilization-value': { type: 'string', default: '100' },
        'utilization-unit': { type: 'string', default: '%Utilized/Month' },
        description: { type: 'string' },
        name: { type: 'string' },
        headed: { type: 'boolean', default: false },
        'out-csv': { type: 'string', short: 'c' },
        'out-url': { type: 'string', short: 'u' },
        help: { type: 'boolean', short: 'h', default: false },
        verbose: { type: 'boolean', short: 'v', default: false },
      },
    }) as { values: ParsedCliValues };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Error parsing arguments: ${message}`);
    printHelp(false);
    process.exit(1);
  }

  const { values } = parsed;
  if (values.help || values.verbose) {
    printHelp(!!values.verbose);
    process.exit(0);
  }

  const engine = values.engine || 'PostgreSQL';
  const regionCode = values.region || 'eu-central-1';
  const regionSearch = REGION_MAP[regionCode.toLowerCase()] || regionCode;
  const instanceType = values['instance-type'] || 'db.r7g.xlarge';
  const storageTypeCode = values['storage-type'] || 'gp3';
  const storageTypeLabel = STORAGE_MAP[storageTypeCode.toLowerCase()] || storageTypeCode;
  const storageGb = values['storage-gb'] || '50';
  const deployment = values.deployment || 'Multi-AZ';
  const licenseModel = values.license;
  const dbEdition = values.edition;
  const utilizationValue = values['utilization-value'] || '100';
  const utilizationUnit = values['utilization-unit'] || '%Utilized/Month';
  const utilValNum = Number(utilizationValue);
  const utilUnitLower = utilizationUnit.toLowerCase();

  if (utilUnitLower.includes('day') && utilValNum > 24) {
    console.error(`\n❌ Invalid utilization: '${utilizationValue} ${utilizationUnit}'. Hours/Day cannot exceed 24 hours per day.`);
    process.exit(1);
  }
  if (utilUnitLower.includes('week') && utilValNum > 168) {
    console.error(`\n❌ Invalid utilization: '${utilizationValue} ${utilizationUnit}'. Hours/Week cannot exceed 168 hours per week.`);
    process.exit(1);
  }
  if (utilUnitLower.includes('month') && utilUnitLower.includes('hour') && utilValNum > 730) {
    console.error(`\n❌ Invalid utilization: '${utilizationValue} ${utilizationUnit}'. Hours/Month cannot exceed 730 hours per month.`);
    process.exit(1);
  }
  if (utilUnitLower.includes('%') && utilValNum > 100) {
    console.error(`\n❌ Invalid utilization: '${utilizationValue} ${utilizationUnit}'. %Utilized/Month cannot exceed 100%.`);
    process.exit(1);
  }
  const descriptionText = values.description || `RDS ${engine} - Production Database`;
  const estimateTitle = values.name || `RDS ${engine} Production Estimate (${regionCode})`;
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
  console.log(`Deployment   : ${deployment}`);
  if (licenseModel) console.log(`License      : ${licenseModel}`);
  if (dbEdition) console.log(`Edition      : ${dbEdition}`);
  console.log(`Utilization  : ${utilizationValue} (${utilizationUnit})`);
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
        document.querySelectorAll('[class*="chat"], [class*="sales"], [id*="chat"], [id*="sales"], iframe[title*="chat"]').forEach(el => el.remove());
        Array.from(document.querySelectorAll('div, section')).forEach(el => {
          if (el.textContent && el.textContent.includes('sales representative')) {
            el.remove();
          }
        });
      });
    };

    // 1. Open AWS Pricing Calculator homepage with 30s timeout safety
    await page.goto('https://calculator.aws/#/', { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
      await page.waitForLoadState('domcontentloaded');
    });
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
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null);
    await dismissCookies();

    // 5. Fill Description
    const descriptionInput = page.getByPlaceholder('Enter a description for your estimate').first();
    if (await waitVisible(descriptionInput)) {
      await descriptionInput.fill(descriptionText);
    }

    // 6. Select Region
    // The page has two dropdowns whose *current value* can read "Region" or a region name
    // ("US East (Ohio)"), so matching on displayed value is ambiguous. Target by the field's
    // accessible label ("Choose a Region") instead.
    const regionDropdown = page.getByRole('button', { name: /choose a region/i }).first();
    if (await waitVisible(regionDropdown, 5000)) {
      await regionDropdown.click();
      await page.waitForTimeout(500);

      const regionOption = page.getByText(new RegExp(escapeRegExp(regionSearch), 'i')).first();
      if (await waitVisible(regionOption, 5000)) {
        await regionOption.click();
      }
    }

    // 7. Select Instance Type
    const instanceCombobox = page.getByRole('combobox', { name: /select an instance/i }).or(page.getByPlaceholder(/select an instance/i)).first();
    if (await waitVisible(instanceCombobox, 5000)) {
      await instanceCombobox.click();
      await instanceCombobox.fill(instanceType.replace(/^db\./, ''));
      await page.waitForTimeout(500);

      const matchedOption = page.getByText(new RegExp(escapeRegExp(instanceType), 'i')).first();
      if (await waitVisible(matchedOption, 5000)) {
        await matchedOption.click();
      }
    }

    // 7.5. Select Deployment Option (Single-AZ / Multi-AZ)
    await selectDropdownOption(page, 'Deployment option', deployment, 'deployment option');

    // 7.6. Select License model (engine-specific field, e.g. SQL Server/Oracle)
    if (licenseModel) {
      await selectDropdownOption(page, 'License', licenseModel, 'license model');
    }

    // 7.7. Select Database edition (engine-specific field, e.g. SQL Server/Oracle)
    // Depends on the License model above — the option list only offers editions valid for
    // whatever license was just selected, so this must run after the license step.
    if (dbEdition) {
      await selectDropdownOption(page, 'Database edition', dbEdition, 'database edition', true);
    }

    // 8. Select Storage Type & Amount
    // The storage type option text only exists once the storage volume dropdown is opened.
    const storageVolumeDropdown = page.getByRole('button', { name: /general purpose ssd|provisioned iops ssd|magnetic/i }).first();
    if (await waitVisible(storageVolumeDropdown, 5000)) {
      await storageVolumeDropdown.click();
      const storageTypeOption = page.getByText(new RegExp(escapeRegExp(storageTypeLabel), 'i')).first();
      if (await waitVisible(storageTypeOption, 5000)) {
        await storageTypeOption.click();
      }
    }

    const storageAmountInput = page.getByRole('spinbutton', { name: /storage amount/i }).or(page.getByPlaceholder(/storage amount/i)).first();
    if (await waitVisible(storageAmountInput, 5000)) {
      await storageAmountInput.fill(storageGb);
    }

    // 8.5. Select Utilization Value & Unit
    const utilInput = page.getByRole('spinbutton', { name: /utilization/i }).first();
    if (await waitVisible(utilInput, 5000)) {
      await utilInput.fill(utilizationValue);
    }
    if (utilizationUnit) {
      const unitBtn = page.getByRole('button', { name: /utilized|hours/i }).first();
      if (await waitVisible(unitBtn, 5000)) {
        await unitBtn.click();
        await page.waitForTimeout(300);
        const unitOpt = page.getByRole('option').filter({ hasText: new RegExp(escapeRegExp(utilizationUnit), 'i') }).first();
        if (await waitVisible(unitOpt, 5000)) {
          await unitOpt.click();
        }
      }
    }

    // 9. Save and view summary
    await assertNoValidationErrors(page, 'before saving the estimate');
    await dismissCookies();
    const saveAndSummaryBtn = page.getByRole('button', { name: /save and view summary|save and add to estimate/i }).first();
    await saveAndSummaryBtn.click();

    // 10. Verify Redirection to Estimate Summary
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null);

    // 11. Edit Estimate Title
    const editTitleLink = page.getByRole('link', { name: /edit my estimate|edit/i }).or(page.getByText(/edit/i)).first();
    if (await waitVisible(editTitleLink)) {
      await editTitleLink.click().catch(() => {});
      const titleInput = page.getByRole('textbox', { name: /enter name|estimate name/i }).first();
      if (await waitVisible(titleInput)) {
        await titleInput.fill(estimateTitle);
        const saveTitleBtn = page.getByRole('button', { name: /^save$/i }).first();
        if (await waitVisible(saveTitleBtn)) {
          await saveTitleBtn.click();
        }
      }
    }

    // Extract Cost Numbers from Summary
    // "Monthly cost" also matches a sortable table-column header button elsewhere on the page,
    // so getByText(...).locator('..') hits a strict-mode violation unless scoped to the first match.
    const monthlyCostText = await page.getByText(/Monthly cost/i).first().locator('xpath=..').textContent().catch(() => '');
    const annualCostText = await page.getByText(/Total 12 months cost/i).first().locator('xpath=..').textContent().catch(() => '');

    // 12. Export CSV
    let exportedCsvPath = '';
    const exportBtn = page.getByRole('button', { name: /export/i }).first();
    if (await waitVisible(exportBtn, 5000)) {
      await exportBtn.click();
      await page.waitForTimeout(500);

      const csvOption = page.getByText(/^csv$/i).or(page.getByRole('menuitem', { name: /csv/i })).first();
      if (await waitVisible(csvOption, 5000)) {
        await csvOption.click();
        await page.waitForTimeout(500);

        const okBtn = page.getByRole('button', { name: /^ok$/i }).first();
        if (await waitVisible(okBtn, 5000)) {
          const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
          await okBtn.click();
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
    if (await waitVisible(shareBtn, 5000)) {
      await shareBtn.click();
      await page.waitForTimeout(1000);

      const agreeBtn = page.getByRole('button', { name: /agree and continue/i }).first();
      if (await waitVisible(agreeBtn, 5000)) {
        await agreeBtn.click({ force: true }).catch(() => agreeBtn.click());
        await page.waitForTimeout(1500);
      }

      // The page renders two "Copy public link" textboxes (a duplicate/responsive layout node
      // stays in the DOM empty); .first() picks whichever comes first in DOM order, which isn't
      // always the populated one. Poll all matches until one actually has a value.
      const publicLinkInputs = page.getByRole('textbox', { name: /copy public link/i });
      for (let attempt = 0; attempt < 10 && !publicShareUrl; attempt++) {
        const count = await publicLinkInputs.count();
        for (let i = 0; i < count; i++) {
          const value = await publicLinkInputs.nth(i).inputValue().catch(() => '');
          if (value) {
            publicShareUrl = value;
            break;
          }
        }
        if (!publicShareUrl) {
          await page.waitForTimeout(500);
        }
      }
      if (publicShareUrl) {
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
