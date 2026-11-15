#!/usr/bin/env node
/**
 * scripts/verify_import_ux.js
 * Playwright script to verify GitHub Import Modal UX fixes:
 * 1. Friendly human-readable error messages without raw API JSON
 * 2. Repository language detection and preview before analysis
 * 3. "Try Example Repository" action (pallets/click) in modal header and error banner
 * 4. Error recovery and state reset
 */

const { chromium } = require('playwright');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const NC = '\x1b[0m';

let passed = 0;
let total = 0;

function check(name, condition) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ${GREEN}✔ PASS:${NC} ${name}`);
  } else {
    console.error(`  ${RED}✖ FAIL:${NC} ${name}`);
    throw new Error(`Check failed: ${name}`);
  }
}

async function run() {
  console.log(`${BOLD}Starting Import UX Verification...${NC}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
    await page.waitForSelector('span[class*="languageBadge"]', { timeout: 10000 });
    check('Repo full name shown', await page.isVisible('text=pallets/click'));

    const pyBadge = page.locator('span[class*="languageBadgePython"]');
    check('Python language badge shown', await pyBadge.isVisible());

    // 4. Test Unsupported Repository (BurntSushi/ripgrep: Rust only)
    console.log(`\n${BOLD}5. Testing Unsupported Repository Preview (BurntSushi/ripgrep - Rust only)${NC}`);
    const inputField = page.locator('input[placeholder*="github.com"]');
    await inputField.fill('https://github.com/BurntSushi/ripgrep');
    await page.waitForTimeout(600);

    // Wait for metadata to fetch
    await page.waitForSelector('text=Rust', { timeout: 10000 });
    const rustBadge = page.locator('span[class*="languageBadgeOther"]');
    const rustBadgeText = await rustBadge.innerText();
    check('Unsupported language badge shown (Rust)', rustBadgeText.toUpperCase().includes('RUST'));

    const langWarning = page.locator('text=Unfog currently supports Python, TypeScript, JavaScript, JSX, and TSX');
    check('Language support notice shown before analysis', await langWarning.isVisible());

    // 5. Submit analysis for repo with no supported files (sindresorhus/awesome) to verify friendly error handling
    console.log(`\n${BOLD}6. Submitting Repository without Supported Files (sindresorhus/awesome)${NC}`);
    await inputField.fill('https://github.com/sindresorhus/awesome');
    await page.waitForTimeout(600);

    const analyzeBtn = page.locator('button:has-text("Analyze Repository")');
    await analyzeBtn.click();

    // Wait for error banner
    await page.waitForSelector('div[class*="errorBanner"]', { timeout: 20000 });
    const errorBanner = page.locator('div[class*="errorBanner"]');
    const errorText = await errorBanner.innerText();

    check('Error contains friendly message without raw JSON', !errorText.includes('schema_version') && !errorText.includes('request_id'));
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
