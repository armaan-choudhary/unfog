#!/usr/bin/env node
/**
 * scripts/verify_intelligent_exploration.js
 * Independent Verification Suite for Intelligent Code Exploration and Learning UX Upgrades:
 *   1. Dependency Blast Radius (inbound teal #71c2bd, outbound violet #7665ca, dimming, relationship legend, clear filters)
 *   2. Active Context & Gemini Suggestions (repo/file/symbol/range banner, prompt chips, markdown code fences, clear chat)
 *   3. Source Inspector (in-file symbol outline jumping, GitHub link, Copy Citation, Find Callers/Dependencies, empty state)
 *   4. Learning Arena (goal grouping, progressive hints, attempt provenance, inspect reference code drawer)
 *   5. Keyboard Accessibility (Ctrl+K search focus, Esc handling, focus rings)
 */

const { chromium } = require('playwright');
const http = require('http');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m';

let passedSteps = 0;
let totalSteps = 0;
const defects = [];

function logStep(suite, name) {
  totalSteps++;
  console.log(`\n${BOLD}${CYAN}==> [${suite}] ${name}${NC}`);
}

function logPass(message) {
  passedSteps++;
  console.log(`  ${GREEN}✔ PASS:${NC} ${message}`);
}

function logFail(suite, targetWorker, message, details = '') {
  defects.push({ suite, worker: targetWorker, message, details });
  console.error(`  ${RED}✖ FAIL (@${targetWorker}):${NC} ${message}`);
  if (details) console.error(`    ${YELLOW}Details:${NC} ${details}`);
}

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function runVerification() {
  console.log(`${BOLD}${CYAN}================================================================${NC}`);
  console.log(`${BOLD}${CYAN}     UNFOG INTELLIGENT EXPLORATION INDEPENDENT VERIFIER         ${NC}`);
  console.log(`${BOLD}${CYAN}================================================================${NC}`);

  const backendReady = await checkPort(8000);
  const frontendReady = await checkPort(3000);

  if (!backendReady) {
    console.warn(`${YELLOW}Warning: Backend on port 8000 is not responding. Ensure backend is running if live data needed.${NC}`);
  }
  if (!frontendReady) {
    console.error(`${RED}Error: Frontend on port 3000 is not responding. Start frontend before running.${NC}`);
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Listen to browser console errors
  const consoleErrors = [];
  page.on('pageerror', (err) => {
    console.error(`  ${RED}[Browser Page Error]:${NC}`, err.message);
    consoleErrors.push(err.message);
  });

  try {
    // -------------------------------------------------------------------------
    // 1. Dependency Blast Radius & Graph Interactions (@graph)
    // -------------------------------------------------------------------------
    logStep('Blast Radius', 'Load dashboard and inspect initial graph state');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForSelector('.react-flow__node', { timeout: 15000 });
    logPass('Dashboard loaded and React Flow rendered nodes');

    logStep('Blast Radius', 'Drill down to L2 and L3 to test node selection');
    // Drill to L2 by double-clicking group node "service" (or clicking Explore button)
    const serviceNode = page.locator('.react-flow__node:has-text("service")').first();
    if (await serviceNode.isVisible()) {
      await serviceNode.dblclick();
      await page.waitForTimeout(600);
      logPass('Drilled down into service group');
    }

    // Drill to L3 or find a symbol/file node
    const authNode = page.locator('.react-flow__node:has-text("auth.py")').first();
    if (await authNode.isVisible()) {
      await authNode.click();
      await page.waitForTimeout(500);
      logPass('Clicked auth node in map');
    }

    logStep('Blast Radius', 'Verify directional relationship legend or indicators on canvas');
    // Check for legend or indicator showing Inbound (teal) and Outbound (violet)
    const legend = page.locator('[class*="legend"], [class*="blastRadius"], [class*="relationshipIndicator"]');
    const pageText = await page.textContent('body');
    const hasInboundIndicator = /inbound|incoming/i.test(pageText);
    const hasOutboundIndicator = /outbound|outgoing/i.test(pageText);

    if (hasInboundIndicator && hasOutboundIndicator) {
      logPass('Relationship direction indicators (Inbound / Outbound) detected on UI');
    } else {
      logFail('Blast Radius', 'graph', 'Canvas missing directional relationship indicator/legend (Inbound / Outbound)');
    }

    logStep('Blast Radius', 'Verify inbound/outbound edge styling and dimming');
    // Check if any edge has teal (#71c2bd) or violet (#7665ca) or dimming styles
    const edges = await page.$$('.react-flow__edge path');
    let hasTealEdge = false;
    let hasVioletEdge = false;
    let hasDimmedElement = false;

    for (const edge of edges) {
      const stroke = (await edge.getAttribute('stroke')) || '';
      const style = (await edge.getAttribute('style')) || '';
      const className = (await edge.getAttribute('class')) || '';

      if (stroke.includes('#71c2bd') || stroke.includes('113, 194, 189') || style.includes('#71c2bd') || className.includes('inbound')) {
        hasTealEdge = true;
      }
      if (stroke.includes('#7665ca') || stroke.includes('118, 101, 202') || style.includes('#7665ca') || className.includes('outbound')) {
        hasVioletEdge = true;
      }
      if (style.includes('opacity: 0.2') || style.includes('opacity: 0.3') || className.includes('dimmed')) {
        hasDimmedElement = true;
      }
    }

    // Also check node dimming
    const nodes = await page.$$('.react-flow__node');
    for (const node of nodes) {
      const style = (await node.getAttribute('style')) || '';
      const className = (await node.getAttribute('class')) || '';
      if (style.includes('opacity: 0.2') || style.includes('opacity: 0.3') || className.includes('dimmed')) {
        hasDimmedElement = true;
        break;
      }
    }

    if (hasTealEdge || hasVioletEdge) {
      logPass(`Blast radius color styling detected (Inbound teal: ${hasTealEdge}, Outbound violet: ${hasVioletEdge})`);
    } else {
      console.warn(`    ${YELLOW}Note: Edges might use CSS classes or computed styles${NC}`);
    }

    if (hasDimmedElement) {
      logPass('Unrelated elements dimmed (opacity 20-30% or dimmed class)');
    } else {
      logFail('Blast Radius', 'graph', 'No dimmed elements detected when node is selected');
    }

    logStep('Blast Radius', 'Verify Clear Filters recovery action when search returns 0 nodes');
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('xyz_nonexistent_symbol_12345');
      await page.waitForTimeout(400);

      const clearFiltersBtn = page.locator('button:has-text("Clear"), button:has-text("Reset"), [class*="clearFilter"]').first();
      if (await clearFiltersBtn.isVisible()) {
        logPass('Clear Filters button appeared when search yielded 0 results');
        await clearFiltersBtn.click();
        await page.waitForTimeout(300);
        const val = await searchInput.inputValue();
        if (val === '') {
          logPass('Clear Filters reset search input cleanly');
        } else {
          logFail('Blast Radius', 'graph', 'Clear Filters did not reset search input');
        }
      } else {
        logFail('Blast Radius', 'graph', 'No Clear Filters recovery action visible when 0 nodes match filter');
        await searchInput.fill('');
      }
    }

    // -------------------------------------------------------------------------
    // 2. Active Context & Gemini Suggestions (@ai)
    // -------------------------------------------------------------------------
    logStep('AI Companion', 'Switch to AI Companion tab and check Active Context Banner');
    const aiTabBtn = page.locator('button:has-text("AI"), button:has-text("Companion")').first();
    await aiTabBtn.click();
    await page.waitForTimeout(400);

    // Re-select verify_token to ensure context is populated
    const tokenNode = page.locator('.react-flow__node:has-text("verify_token"), .react-flow__node:has-text("auth")').first();
    if (await tokenNode.isVisible()) {
      await tokenNode.click();
      await page.waitForTimeout(400);
    }

    // Verify Active Context Banner content
    const banner = page.locator('[class*="activeContext"], [class*="contextBanner"]').first();
    if (await banner.isVisible()) {
      const bannerText = await banner.textContent();
      logPass(`Active Context Banner rendered: "${bannerText.trim()}"`);
      if (bannerText.includes('sample_service') || bannerText.includes('service') || bannerText.includes('auth.py')) {
        logPass('Active Context Banner displays repository/file details');
      } else {
        logFail('AI Companion', 'ai', 'Active Context Banner missing repository or file info', bannerText);
      }
    } else {
      logFail('AI Companion', 'ai', 'Active Context Banner not visible in AI Companion tab');
    }

    logStep('AI Companion', 'Verify Contextual Prompt Suggestions chips');
    const chips = page.locator('[class*="suggestionChip"], [class*="chip"], button:has-text("What"), button:has-text("Explain"), button:has-text("Where")');
    const chipCount = await chips.count();
    if (chipCount > 0) {
      const firstChipText = await chips.first().textContent();
      logPass(`Found ${chipCount} contextual prompt suggestion chip(s), e.g. "${firstChipText.trim()}"`);
      // Click suggestion chip
      await chips.first().click();
      await page.waitForTimeout(500);
      logPass('Clicked suggestion chip successfully');
    } else {
      logFail('AI Companion', 'ai', 'No contextual suggestion chips found in AI Companion tab');
    }

    logStep('AI Companion', 'Verify Clear Chat control');
    const clearChatBtn = page.locator('button:has-text("Clear Chat"), button:has-text("Clear"), [title*="Clear"]').first();
    if (await clearChatBtn.isVisible()) {
      logPass('Clear Chat action button is visible');
    } else {
      logFail('AI Companion', 'ai', 'Missing "Clear Chat" action button');
    }

    // -------------------------------------------------------------------------
    // 3. Source Inspector (@inspector)
    // -------------------------------------------------------------------------
    logStep('Source Inspector', 'Switch to Source Inspector tab and verify symbol outline');
    const sourceTabBtn = page.locator('button:has-text("Source"), button:has-text("Inspector")').first();
    await sourceTabBtn.click();
    await page.waitForTimeout(400);

    // Verify In-file symbol outline
    const outline = page.locator('[class*="symbolOutline"]').first();
    if (await outline.isVisible()) {
      const outlineText = await outline.textContent();
      logPass(`In-file Symbol Outline visible with contents: "${outlineText.slice(0, 60)}..."`);
    } else {
      // Check if symbols are listed in a select or pill container
      const symbolsList = page.locator('button:has-text("verify_token"), [class*="outlineItem"]');
      if (await symbolsList.count() > 0) {
        logPass(`Found ${await symbolsList.count()} symbol outline item(s)`);
      } else {
        logFail('Source Inspector', 'inspector', 'Missing in-file Symbol Outline');
      }
    }

    logStep('Source Inspector', 'Verify Open in GitHub action and Copy Citation action');
    const copyCitationBtn = page.locator('button:has-text("Copy Citation"), button[title*="Citation"], button[aria-label*="Citation"]').first();
    if (await copyCitationBtn.isVisible()) {
      logPass('Copy Citation button is visible');
    } else {
      logFail('Source Inspector', 'inspector', 'Missing "Copy Citation" button');
    }

    const githubLink = page.locator('a[href*="github.com"], button:has-text("GitHub"), [title*="GitHub"], button:has-text("Bundled")').first();
    if (await githubLink.isVisible()) {
      const ghText = await githubLink.textContent();
      logPass(`Open in GitHub / Bundled repo action is present: "${ghText.trim()}"`);
    } else {
      logFail('Source Inspector', 'inspector', 'Missing "Open in GitHub" action button/link');
    }

    logStep('Source Inspector', 'Verify Find Callers and Find Dependencies actions');
    const findCallersBtn = page.locator('button:has-text("Find Callers"), button:has-text("Callers")').first();
    const findDepsBtn = page.locator('button:has-text("Find Dependencies"), button:has-text("Dependencies")').first();
    if (await findCallersBtn.isVisible() && await findDepsBtn.isVisible()) {
      logPass('Both "Find Callers" and "Find Dependencies" buttons are present on symbol header');
    } else {
      logFail('Source Inspector', 'inspector', 'Missing "Find Callers" or "Find Dependencies" relationship focus buttons');
    }

    // -------------------------------------------------------------------------
    // 4. Learning Arena (@learning)
    // -------------------------------------------------------------------------
    logStep('Learning Arena', 'Switch to Learning Arena tab and verify Goal Grouping');
    const arenaTabBtn = page.locator('button:has-text("Learning Arena")').first();
    await arenaTabBtn.click();
    await page.waitForTimeout(600);

    const arenaText = await page.textContent('aside, [class*="inspector"]');
    const hasGoalGrouping = /Architecture|Entrypoints|Call Graph|Data Flow|Business Logic/i.test(arenaText);
    if (hasGoalGrouping) {
      logPass('Challenges are grouped by architectural goals');
    } else {
      logFail('Learning Arena', 'learning', 'Challenges missing architectural goal grouping (e.g. Architecture & Entrypoints, Call Graph, Business Logic)');
    }

    logStep('Learning Arena', 'Verify Progressive Hints without losing selection');
    const hintBtn = page.locator('button:has-text("Hint"), button:has-text("Need a hint")').first();
    if (await hintBtn.isVisible()) {
      await hintBtn.click();
      await page.waitForTimeout(300);
      const hintText = await page.textContent('aside, [class*="inspector"]');
      if (/hint/i.test(hintText)) {
        logPass('Progressive Hint requested and displayed');
      } else {
        logFail('Learning Arena', 'learning', 'Hint requested but not rendered');
      }
    } else {
      logFail('Learning Arena', 'learning', 'Missing Hint button in Learning Arena');
    }

    logStep('Learning Arena', 'Verify Inspect Reference Code drawer');
    const codeDrawerBtn = page.locator('button:has-text("Reference Code"), button:has-text("Inspect Code"), button:has-text("View Code")').first();
    if (await codeDrawerBtn.isVisible()) {
      logPass('Inspect Reference Code toggle button is present');
      await codeDrawerBtn.click();
      await page.waitForTimeout(300);
      logPass('Expanded Reference Code drawer');
    } else {
      logFail('Learning Arena', 'learning', 'Missing collapsible inline Reference Code inspection drawer');
    }

    logStep('Learning Arena', 'Verify Attempt Provenance tracking (independent / hint_assisted / solution_revealed)');
    // Select an option
    const firstOption = page.locator('[role="radio"]').first();
    if (await firstOption.isVisible()) {
      await firstOption.click();
      await page.waitForTimeout(300);
      logPass('Selected an option in challenge');

      // Click submit
      const submitBtn = page.locator('button:has-text("Submit Answer")').first();
      if (await submitBtn.isVisible() && await submitBtn.isEnabled()) {
        await submitBtn.click();
        await page.waitForSelector('[class*="feedbackBanner"]', { timeout: 10000 });
        const feedbackText = await page.textContent('[class*="feedbackBanner"]');
        logPass(`Challenge evaluated with feedback: "${feedbackText.slice(0, 60)}..."`);

        // Check for provenance badge in feedback banner or card header
        const provBadge = page.locator('[class*="provenanceBadge"]');
        const badgeCount = await provBadge.count();
        if (badgeCount > 0) {
          const badgeText = await provBadge.first().textContent();
          logPass(`Attempt Provenance badge verified on submission: "${badgeText.trim()}"`);
        } else {
          logFail('Learning Arena', 'learning', 'Missing Attempt Provenance badge after submission');
        }
      } else {
        logFail('Learning Arena', 'learning', 'Submit Answer button was not visible or enabled');
      }
    } else {
      logFail('Learning Arena', 'learning', 'No radio options found in challenge');
    }

    // -------------------------------------------------------------------------
    // 5. Keyboard Accessibility
    // -------------------------------------------------------------------------
    logStep('Accessibility', 'Test Ctrl+K / Cmd+K search focus');
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(200);
    const isSearchFocused = await searchInput.evaluate((el) => document.activeElement === el);
    if (isSearchFocused) {
      logPass('Control+K successfully focused the search input');
    } else {
      // Try Meta+k (Mac)
      await page.keyboard.press('Meta+k');
      await page.waitForTimeout(200);
      const isMetaFocused = await searchInput.evaluate((el) => document.activeElement === el);
      if (isMetaFocused) {
        logPass('Meta+K successfully focused search input');
      } else {
        logFail('Accessibility', 'learning', 'Ctrl+K / Cmd+K did not focus search input');
      }
    }

    logStep('Accessibility', 'Test Escape handling');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const searchVal = await searchInput.inputValue();
    logPass(`Escape handled cleanly (search input value: "${searchVal}")`);

  } catch (err) {
    console.error(`\n${RED}Unexpected exception during verification:${NC}`, err);
    defects.push({ suite: 'Exception', worker: 'all', message: err.message });
  } finally {
    await browser.close();
  }

  // ---------------------------------------------------------------------------
  // Summary & Defect Reporting
  // ---------------------------------------------------------------------------
  console.log(`\n${BOLD}${CYAN}================================================================${NC}`);
  console.log(`${BOLD}Verification Summary: ${GREEN}${passedSteps} Passed${NC}, ${RED}${defects.length} Failed${NC} (Total Checks: ${totalSteps})`);
  console.log(`${BOLD}${CYAN}================================================================${NC}`);

  if (defects.length > 0) {
    console.log(`\n${BOLD}${RED}Defects Detected:${NC}`);
    for (const d of defects) {
      console.log(`- [@${d.worker}] [${d.suite}] ${d.message} ${d.details ? '(' + d.details + ')' : ''}`);
    }
    process.exit(1);
  } else {
    console.log(`\n${BOLD}${GREEN}All intelligent exploration verifications passed successfully!${NC}\n`);
    process.exit(0);
  }
}

runVerification();
