#!/usr/bin/env node
/**
 * scripts/verify_import_ux.js
 * Verification of the Import Error UX & Language Detection.
 */

const { chromium } = require('playwright');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m';

let passed = 0;
let total = 0;

function check(desc, condition) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ${GREEN}✔ PASS:${NC} ${desc}`);
  } else {
    console.error(`  ${RED}✖ FAIL:${NC} ${desc}`);
    throw new Error(`Check failed: ${desc}`);
  }
}

async function run() {
  console.log(`${BOLD}${CYAN}Starting Import UX Verification...${NC}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Load Dashboard
    console.log(`${BOLD}1. Navigating to Unfog Dashboard${NC}`);
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    check('Dashboard loaded', (await page.title()).includes('Unfog'));

    // 2. Open Import Modal
    console.log(`\n${BOLD}2. Opening Import Modal${NC}`);
    const importBtn = page.getByRole('button', { name: /import/i });
    await importBtn.click();
    await page.waitForSelector('input[placeholder*="github.com"]');
    check('Import modal visible', await page.isVisible('text=Import Public GitHub Repository'));

    // 3. Test "Try Example (pallets/click)" in label row
    console.log(`\n${BOLD}3. Testing "Try Example (pallets/click)" action${NC}`);
    await page.waitForTimeout(500);
    const tryExampleBtn = page.locator('button:has-text("Try Example (pallets/click)")');
    check('Try Example button is present', await tryExampleBtn.isVisible());
    await tryExampleBtn.click();
    await page.waitForTimeout(300);

    const inputVal = await page.locator('input[placeholder*="github.com"]').inputValue();
    check('URL set to pallets/click', inputVal === 'https://github.com/pallets/click');

    // Wait for trusted metadata preview
    console.log(`\n${BOLD}4. Verifying metadata preview for Python repository${NC}`);
    await page.waitForSelector('div[class*="repoPreview"]', { timeout: 10000 });
    const pyBadge = page.locator('div[class*="repoPreview"] span[class*="languageBadge"]').first();
    check('Python language badge shown', (await pyBadge.innerText()).toLowerCase() === 'python');

    // 4. Test Non-Python repository (armaan-portfolio)
    console.log(`\n${BOLD}5. Testing Non-Python Repository (armaan-portfolio)${NC}`);
    const inputField = page.locator('input[placeholder*="github.com"]');
    await inputField.fill('https://github.com/armaan-choudhary/armaan-portfolio');

    // Wait for metadata preview
    await page.waitForSelector('text=armaan-choudhary/armaan-portfolio', { timeout: 10000 });
    const jsBadge = page.locator('div[class*="repoPreview"] span[class*="languageBadge"]').first();
    const jsBadgeText = await jsBadge.innerText();
    check('Non-Python language badge shown (JavaScript/TypeScript)', jsBadgeText.toLowerCase().includes('script'));

    const langWarning = page.locator('text=Unfog currently supports Python repositories');
    check('Language support notice shown before analysis', await langWarning.isVisible());

    // 5. Submit analysis for non-Python repo to verify error conversion
    console.log(`\n${BOLD}6. Submitting Non-Python Repository for Analysis${NC}`);
    const analyzeBtn = page.locator('button:has-text("Analyze Repository")');
    await analyzeBtn.click();

    // Wait for error banner
    await page.waitForSelector('text=This repository doesn\'t contain supported Python files', { timeout: 15000 });
    const errorBanner = page.locator('div[class*="errorBanner"]');
    const errorText = await errorBanner.innerText();

    check('Error contains friendly message', errorText.includes("This repository doesn't contain supported Python files. Unfog currently supports Python repositories."));
    check('Error does NOT contain raw schema_version JSON', !errorText.includes('schema_version'));
    check('Error does NOT contain raw request_id', !errorText.includes('request_id'));
    check('Error does NOT contain raw JSON brackets', !errorText.includes('{"') && !errorText.includes('"}'));

    // 6. Test Error Recovery "Try Example Repository" button
    console.log(`\n${BOLD}7. Testing Error Banner Recovery Action${NC}`);
    const recoveryBtn = errorBanner.locator('button:has-text("Try Example Repository")');
    check('Recovery button present in error banner', await recoveryBtn.isVisible());
    await recoveryBtn.click();

    // Verify input changed back to pallets/click and error cleared
    const recoveredInput = await inputField.inputValue();
    check('URL restored to pallets/click', recoveredInput === 'https://github.com/pallets/click');
    check('Error banner cleared', !(await errorBanner.isVisible()));

    console.log(`\n${BOLD}${GREEN}All ${passed}/${total} UX checks passed successfully!${NC}`);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(`\n${RED}Verification script failed:${NC}`, err.message);
  process.exit(1);
});
