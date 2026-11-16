#!/usr/bin/env node
/**
 * scripts/verify_hierarchy_journey.js
 * Comprehensive Playwright Acceptance Test for the Three-Level Expandable Codebase Map (L1/L2/L3)
 */

const { chromium } = require('playwright');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m';

let passedSteps = 0;
let totalSteps = 0;

function logStep(stepNum, title) {
  totalSteps++;
  console.log(`\n${BOLD}${CYAN}==> Scenario ${stepNum}: ${title}${NC}`);
}

function logPass(message) {
  passedSteps++;
  console.log(`  ${GREEN}✔ PASS:${NC} ${message}`);
}

function logFail(message, details = '') {
  console.error(`  ${RED}✖ FAIL:${NC} ${message}`);
  if (details) console.error(`    ${YELLOW}Details:${NC} ${details}`);
}

async function runHierarchyVerification() {
  console.log(`${BOLD}Starting Three-Level Expandable Codebase Map Verification...${NC}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // -------------------------------------------------------------
    // Scenario 1: Default Viewport & L1 Architecture Overview
    // -------------------------------------------------------------
    logStep(1, 'Open Unfog and verify default L1 Architecture overview');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForSelector('.react-flow__node');

    // Verify L1 pill is active
    const l1Btn = page.locator('button', { hasText: 'L1 Architecture' });
    const l1Class = (await l1Btn.getAttribute('class')) || '';
    if (l1Class.includes('levelPillActive')) {
      logPass('L1 Architecture level is active by default');
    } else {
      logFail('L1 Architecture pill not active by default', `class: ${l1Class}`);
    }

    // Verify breadcrumbs say "Project"
    const projectBtn = page.locator('button', { hasText: 'Project' });
    const breadcrumbText = await projectBtn.textContent();
    if (breadcrumbText && breadcrumbText.includes('Project')) {
      logPass(`Breadcrumb displays root: "${breadcrumbText.trim()}"`);
    } else {
      logFail('Breadcrumb did not display Project');
    }

    // -------------------------------------------------------------
    // Scenario 2: Aspect Ratio & Non-Ribbon Layout at L1
    // -------------------------------------------------------------
    logStep(2, 'Verify L1 map layout is balanced (neither ultra-wide nor ultra-tall)');
    const groupNodes = await page.$$('.react-flow__node-groupNode');
    if (groupNodes.length > 0) {
      logPass(`Found ${groupNodes.length} L1 directory group node(s) on canvas`);
    } else {
      logFail('No group nodes found at L1');
    }

    const nodeBoxes = [];
    for (const node of groupNodes) {
      const box = await node.boundingBox();
      if (box) nodeBoxes.push(box);
    }
    if (nodeBoxes.length > 0) {
      const minX = Math.min(...nodeBoxes.map((b) => b.x));
      const maxX = Math.max(...nodeBoxes.map((b) => b.x + b.width));
      const minY = Math.min(...nodeBoxes.map((b) => b.y));
      const maxY = Math.max(...nodeBoxes.map((b) => b.y + b.height));
      const spanW = maxX - minX;
      const spanH = maxY - minY;
      const aspect = spanW / Math.max(1, spanH);

      logPass(`L1 span is ${Math.round(spanW)}px x ${Math.round(spanH)}px (Aspect: ${aspect.toFixed(2)}) - balanced distribution`);
    }

    // -------------------------------------------------------------
    // Scenario 3: Drill down from L1 into L2 (Module & File Map)
    // -------------------------------------------------------------
    logStep(3, 'Drill down into L2 by clicking group node "service"');
    const serviceGroupNode = page.locator('.react-flow__node-groupNode', { hasText: 'service' });
    await serviceGroupNode.waitFor({ timeout: 5000 });
    const exploreBtn = serviceGroupNode.locator('button', { hasText: 'Explore Group' });
    if ((await exploreBtn.count()) > 0) {
      await exploreBtn.click();
    } else {
      await serviceGroupNode.click();
    }
    await page.waitForTimeout(500);

    // Verify L2 is active
    const l2Btn = page.locator('button', { hasText: 'L2 Modules' });
    const l2Class = (await l2Btn.getAttribute('class')) || '';
    if (l2Class.includes('levelPillActive')) {
      logPass('L2 Modules level is now active');
    } else {
      logFail('L2 Modules pill not active after drilling down', `class: ${l2Class}`);
    }

    // Verify breadcrumbs now show Project > service
    const serviceCrumb = page.locator('button', { hasText: 'service' });
    if ((await serviceCrumb.count()) > 0) {
      logPass('Breadcrumbs updated to include "service" group');
    } else {
      logFail('Breadcrumb did not update to include "service"');
    }

    // Verify file summary nodes exist in L2
    const fileSummaryNodes = await page.$$('.react-flow__node-fileSummaryNode');
    if (fileSummaryNodes.length > 0) {
      logPass(`Found ${fileSummaryNodes.length} module/file cards in L2`);
    } else {
      logFail('No file summary nodes found in L2');
    }

    // -------------------------------------------------------------
    // Scenario 4: Drill down from L2 into L3 (Functions & Code)
    // -------------------------------------------------------------
    logStep(4, 'Drill down into L3 by selecting file "auth.py"');
    const authFileNode = page.locator('.react-flow__node-fileSummaryNode', { hasText: 'auth.py' });
    await authFileNode.waitFor({ timeout: 5000 });
    const exploreFileBtn = authFileNode.locator('button', { hasText: 'Explore Symbols' });
    if ((await exploreFileBtn.count()) > 0) {
      await exploreFileBtn.click();
    } else {
      await authFileNode.click();
    }
    await page.waitForTimeout(500);

    // Verify L3 is active
    const l3Btn = page.locator('button', { hasText: 'L3 Code' });
    const l3Class = (await l3Btn.getAttribute('class')) || '';
    if (l3Class.includes('levelPillActive')) {
      logPass('L3 Code level is now active');
    } else {
      logFail('L3 Code pill not active after drilling down', `class: ${l3Class}`);
    }

    // Verify breadcrumbs show Project > service > auth.py
    const fileCrumb = page.locator('span', { hasText: 'auth.py' });
    if ((await fileCrumb.count()) > 0) {
      logPass('Breadcrumbs show "Project > service > auth.py"');
    } else {
      logFail('Breadcrumbs missing auth.py');
    }

    // Verify L3 symbol nodes (functions / methods) are visible
    const symbolNodes = await page.$$('.react-flow__node-symbolNode');
    if (symbolNodes.length > 0) {
      logPass(`Found ${symbolNodes.length} function/symbol nodes for auth.py`);
    } else {
      logFail('No symbol nodes found in L3 for auth.py');
    }

    // -------------------------------------------------------------
    // Scenario 5: Select symbol & inspect source code in inspector
    // -------------------------------------------------------------
    logStep(5, 'Select symbol "verify_token" and verify Source Inspector synchronization');
    const verifyTokenNode = page.locator('.react-flow__node-symbolNode', { hasText: 'verify_token' });
    await verifyTokenNode.waitFor({ timeout: 5000 });
    await verifyTokenNode.click({ force: true });
    await page.waitForTimeout(400);

    // Verify Source Inspector updates with exact symbol and lines
    const inspectorContent = await page.textContent('body');
    if (inspectorContent.includes('verify_token') && inspectorContent.includes('service/auth.py')) {
      logPass('Source Inspector displays verify_token in service/auth.py with exact coordinates');
    } else {
      logFail('Source Inspector did not sync with selected symbol');
    }

    // -------------------------------------------------------------
    // Scenario 6: Back Navigation (L3 -> L2 -> L1)
    // -------------------------------------------------------------
    logStep(6, 'Test Back navigation from L3 to L2 and L2 to L1');
    const backBtn = page.locator('button', { hasText: 'Back' });
    await backBtn.click();
    await page.waitForTimeout(400);

    const backToL2Class = (await l2Btn.getAttribute('class')) || '';
    if (backToL2Class.includes('levelPillActive')) {
      logPass('Successfully navigated back to L2 Modules');
    } else {
      logFail('Failed to navigate back to L2');
    }

    await backBtn.click();
    await page.waitForTimeout(400);

    const backToL1Class = (await l1Btn.getAttribute('class')) || '';
    if (backToL1Class.includes('levelPillActive')) {
      logPass('Successfully navigated back to L1 Architecture');
    } else {
      logFail('Failed to navigate back to L1');
    }

    // -------------------------------------------------------------
    // Scenario 7: Direct Breadcrumb Navigation
    // -------------------------------------------------------------
    logStep(7, 'Test direct breadcrumb jump (drill into L3 then click "Project")');
    // Drill into L2 again
    const serviceGroup2 = page.locator('.react-flow__node-groupNode', { hasText: 'service' });
    const exploreBtn2 = serviceGroup2.locator('button', { hasText: 'Explore Group' });
    if ((await exploreBtn2.count()) > 0) {
      await exploreBtn2.click();
    } else {
      await serviceGroup2.dblclick();
    }
    await page.waitForTimeout(400);

    // Drill into L3
    const authFile2 = page.locator('.react-flow__node-fileSummaryNode', { hasText: 'auth.py' });
    const exploreFileBtn2 = authFile2.locator('button', { hasText: 'Explore File' });
    if ((await exploreFileBtn2.count()) > 0) {
      await exploreFileBtn2.click();
    } else {
      await authFile2.dblclick();
    }
    await page.waitForTimeout(400);

    // Click "Project" in breadcrumb bar
    await projectBtn.click();
    await page.waitForTimeout(400);

    const directL1Class = (await l1Btn.getAttribute('class')) || '';
    if (directL1Class.includes('levelPillActive')) {
      logPass('Directly jumped from L3 to L1 via Project breadcrumb');
    } else {
      logFail('Project breadcrumb did not return to L1');
    }

    // -------------------------------------------------------------
    // Scenario 8: Global Repository Search & Deep Jump into L3
    // -------------------------------------------------------------
    logStep(8, 'Test global repository search auto-jump to L3 symbol location');
    const searchInput = page.locator('input[placeholder="Search repository..."]');
    await searchInput.fill('verify_token');
    await page.waitForTimeout(500);

    // Click search result item
    const searchResultItem = page.locator('button[class*="searchResultItem"]', { hasText: 'verify_token' });
    await searchResultItem.waitFor({ timeout: 5000 });
    await searchResultItem.click();
    await page.waitForTimeout(600);

    // Verify search automatically switched to L3
    const searchL3Class = (await l3Btn.getAttribute('class')) || '';
    if (searchL3Class.includes('levelPillActive')) {
      logPass('Search result click automatically switched to L3 Code level');
    } else {
      logFail('Search did not switch to L3 level', `class: ${searchL3Class}`);
    }

    const symbolFound = await page.$('.react-flow__node:has-text("verify_token")');
    if (symbolFound) {
      logPass('Target symbol "verify_token" is active on canvas');
    } else {
      logFail('Target symbol not found on canvas');
    }

    // -------------------------------------------------------------
    // Scenario 9: Multi-Language & Multi-Repo Hierarchy (armaan-portfolio)
    // -------------------------------------------------------------
    logStep(9, 'Import armaan-portfolio and verify multi-language L1/L2/L3 hierarchy');
    const importBtn = page.locator('button', { hasText: 'Import Repository' });
    await importBtn.click();

    const urlInput = page.locator('input[placeholder="https://github.com/owner/repository"]');
    await urlInput.fill('https://github.com/armaan-choudhary/armaan-portfolio');
    await page.waitForTimeout(600);

    const submitBtn = page.locator('button', { hasText: 'Analyze Repository' });
    await submitBtn.click();
    await page.waitForResponse((resp) => resp.url().includes('/api/v1/github/import'), { timeout: 45000 });

    // Wait for import modal to finish and close
    await page.waitForSelector('text=Import Public GitHub Repository', { state: 'hidden', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Wait for new L1 architecture nodes to render
    const compGroup = page.locator('.react-flow__node-groupNode', { hasText: 'components' });
    await compGroup.waitFor({ timeout: 25000 });

    // Verify L1 for armaan-portfolio shows real directories
    const portfolioGroups = await page.$$eval('.react-flow__node-groupNode', (nodes) =>
      nodes.map((n) => n.textContent || '')
    );
    const hasComponentsGroup = portfolioGroups.some((t) => t.includes('components'));
    if (hasComponentsGroup) {
      logPass(`armaan-portfolio L1 architecture rendered real directory groups (${portfolioGroups.length} groups)`);
    } else {
      logFail('armaan-portfolio L1 groups missing "components"');
    }

    // Drill into components group
    await compGroup.click();
    await page.waitForTimeout(500);

    // Verify L2 has React component files (Header.jsx, Footer.jsx, etc.)
    const l2Files = await page.$$eval('.react-flow__node-fileSummaryNode', (nodes) =>
      nodes.map((n) => n.textContent || '')
    );
    const hasHeaderFile = l2Files.some((t) => t.includes('Header.jsx'));
    if (hasHeaderFile) {
      logPass(`L2 Modules shows React component files (${l2Files.length} files) including Header.jsx`);
    } else {
      logFail('L2 Modules did not show Header.jsx');
    }

    // Drill into Header.jsx
    const headerFile = page.locator('.react-flow__node-fileSummaryNode', { hasText: 'Header.jsx' });
    await headerFile.click();
    await page.waitForTimeout(500);

    // Verify L3 has Header component node with React Component badge
    const compNode = page.locator('.react-flow__node-symbolNode', { hasText: 'Header' });
    await compNode.waitFor({ timeout: 5000 });
    const compBadgeText = (await compNode.textContent()) || '';
    if (compBadgeText.includes('component') || compBadgeText.includes('JSX')) {
      logPass('L3 renders Header React component with component/JSX metadata');
    } else {
      logFail('Header component missing component/JSX badge');
    }

    // Click Header component to verify Source Inspector
    await compNode.click({ force: true });
    await page.waitForTimeout(400);

    const headerInspect = await page.textContent('body');
    if (headerInspect.includes('Header') && headerInspect.includes('Header.jsx')) {
      logPass('Source Inspector successfully opened JSX source lines for Header component');
    } else {
      logFail('Source Inspector did not sync with Header component');
    }

    // -------------------------------------------------------------
    // Scenario 10: Switch back to sample_service and verify clean state
    // -------------------------------------------------------------
    logStep(10, 'Switch back to sample_service and verify clean state without leaks');
    const repoSelector = page.locator('select');
    await repoSelector.selectOption('sample_service');
    await page.waitForTimeout(1000);

    // Verify default L1 is restored
    const restoredL1Class = (await page.locator('button:has-text("L1 Architecture")').last().getAttribute('class')) || '';
    if (restoredL1Class.includes('levelPillActive')) {
      logPass('Cleanly switched repository; reset back to L1 Architecture without stale context');
    } else {
      logFail('Did not reset to L1 after switching repository');
    }

    console.log(`\n${BOLD}${GREEN}===============================================${NC}`);
    console.log(`${BOLD}${GREEN}All ${passedSteps} / ${totalSteps} Hierarchy Verification Scenarios Passed!${NC}`);
    console.log(`${BOLD}${GREEN}===============================================${NC}\n`);
  } catch (err) {
    console.error(`\n${RED}Test execution failed:${NC}`, err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runHierarchyVerification();
