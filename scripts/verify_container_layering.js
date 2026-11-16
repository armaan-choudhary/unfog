#!/usr/bin/env node
/**
 * scripts/verify_container_layering.js
 * Independent Verification of Z-Index Layering and Container Overlap:
 *   1. Child symbols are visible and not hidden behind expanded file/group containers.
 *   2. Child symbols can be clicked/hovered even when their container is selected.
 *   3. Collapsed file cards do not overlap each other inside expanded groups.
 *   4. Selected containers maintain translucent backgrounds instead of opaque covers.
 */

const { chromium } = require('playwright');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m';

let passed = 0;
let failed = 0;

function logPass(msg) {
  passed++;
  console.log(`  ${GREEN}✔ PASS:${NC} ${msg}`);
}

function logFail(msg, details = '') {
  failed++;
  console.error(`  ${RED}✖ FAIL:${NC} ${msg}`);
  if (details) console.error(`    ${YELLOW}Details:${NC} ${details}`);
}

async function verifyContainerLayering() {
  console.log(`${BOLD}${CYAN}================================================================${NC}`);
  console.log(`${BOLD}${CYAN}       VERIFY CONTAINER LAYERING & Z-INDEX IN CODEBASE MAP     ${NC}`);
  console.log(`${BOLD}${CYAN}================================================================${NC}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    console.log(`\n${BOLD}==> Step 1: Load dashboard and expand "service" group${NC}`);
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForSelector('.react-flow__node');

    // Find "service" group node and expand it (in-map expansion via double-click or Explore button)
    const serviceGroupNode = page.locator('.react-flow__node-groupNode', { hasText: 'service' }).first();
    await serviceGroupNode.waitFor({ timeout: 10000 });
    
    // Double click to toggle in-map expansion
    await serviceGroupNode.dblclick();
    await page.waitForTimeout(600);

    const isGroupExpanded = await page.locator('[class*="groupExpandedContainer"]').count();
    if (isGroupExpanded > 0) {
      logPass('Service group expanded in-map successfully');
    } else {
      logFail('Service group failed to expand in-map');
    }

    console.log(`\n${BOLD}==> Step 2: Expand "orders.py" file inside the expanded group${NC}`);
    const ordersFile = page.locator('.react-flow__node-fileSummaryNode', { hasText: 'orders.py' }).first();
    await ordersFile.waitFor({ timeout: 5000 });
    
    // Double click orders.py to expand its symbols in-map
    await ordersFile.dblclick();
    await page.waitForTimeout(600);

    const isFileExpanded = await page.locator('[class*="fileExpandedContainer"]').count();
    if (isFileExpanded > 0) {
      logPass('orders.py file expanded in-map successfully');
    } else {
      logFail('orders.py file failed to expand in-map');
    }

    console.log(`\n${BOLD}==> Step 3: Select expanded orders.py container and verify child symbols${NC}`);
    // Click header of orders.py to select it
    const ordersHeader = page.locator('[class*="fileExpandedHeader"]').first();
    await ordersHeader.click({ force: true });
    await page.waitForTimeout(400);

    // Verify child symbols (create_order, OrderService, etc.) exist
    const childSymbols = page.locator('.react-flow__node-symbolNode');
    const symbolCount = await childSymbols.count();
    if (symbolCount > 0) {
      logPass(`Found ${symbolCount} child symbol node(s) inside expanded file`);
    } else {
      logFail('No child symbols found inside expanded file');
    }

    // Verify z-index layering between container and child symbols
    const containerZIndex = await page.evaluate(() => {
      const el = document.querySelector('.react-flow__node[data-type="fileSummaryNode"], .react-flow__node-fileSummaryNode');
      return window.getComputedStyle(el).zIndex;
    });

    const symbolZIndex = await page.evaluate(() => {
      const el = document.querySelector('.react-flow__node[data-type="symbolNode"], .react-flow__node-symbolNode');
      return window.getComputedStyle(el).zIndex;
    });

    console.log(`  Container computed z-index: ${containerZIndex}, Symbol computed z-index: ${symbolZIndex}`);
    if (parseInt(symbolZIndex, 10) > parseInt(containerZIndex, 10)) {
      logPass(`Child symbol z-index (${symbolZIndex}) is higher than file container (${containerZIndex})`);
    } else {
      logFail(`Child symbol z-index (${symbolZIndex}) is not higher than file container (${containerZIndex})`);
    }

    // Verify child symbol is clickable when container is selected
    const targetSymbol = page.locator('.react-flow__node-symbolNode').first();
    if (await targetSymbol.isVisible()) {
      const targetSymName = (await targetSymbol.textContent()).slice(0, 30).trim();
      await targetSymbol.click();
      await page.waitForTimeout(400);

      // Verify inspector updated with clicked symbol
      const inspectorText = await page.textContent('aside, [class*="inspector"]');
      if (inspectorText.includes(targetSymName) || (await page.locator('[class*="symbolName"]').count()) > 0) {
        logPass(`Child symbol "${targetSymName}" clicked and inspected cleanly through selected container`);
      } else {
        logFail(`Clicking child symbol "${targetSymName}" did not update Inspector`);
      }
    } else {
      logFail('Child symbol node not visible inside expanded container');
    }

    console.log(`\n${BOLD}==> Step 4: Verify collapsed files vertical layout and no overlapping${NC}`);
    // Get bounding boxes of collapsed file summary nodes inside the group
    const collapsedNodes = await page.$$('.react-flow__node-fileSummaryNode');
    const boxes = [];
    for (const node of collapsedNodes) {
      const isExpanded = await node.$('[class*="fileExpandedContainer"]');
      if (!isExpanded) {
        const box = await node.boundingBox();
        if (box) {
          const text = await node.textContent();
          boxes.push({ box, name: text.slice(0, 20).trim() });
        }
      }
    }

    console.log(`  Found ${boxes.length} collapsed file cards to check for vertical overlap`);
    let overlapFound = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].box;
        const b = boxes[j].box;
        // Check 2D intersection
        const intersects = !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
        if (intersects) {
          overlapFound = true;
          logFail(`Overlap detected between "${boxes[i].name}" and "${boxes[j].name}"`, `A: y=${a.y}, h=${a.height} vs B: y=${b.y}, h=${b.height}`);
        }
      }
    }

    if (!overlapFound && boxes.length > 1) {
      logPass(`All ${boxes.length} collapsed file cards have proper vertical spacing with zero overlap!`);
    }

    console.log(`\n${BOLD}==> Step 5: Verify container background translucency when selected${NC}`);
    const bgInfo = await page.evaluate(() => {
      const el = document.querySelector('[class*="fileExpandedContainer"]') || document.querySelector('[class*="groupExpandedContainer"]');
      if (!el) return { elFound: false, bg: '' };
      const bg = window.getComputedStyle(el).backgroundColor;
      return { elFound: true, bg };
    });

    console.log(`  Container element found: ${bgInfo.elFound}, computed bg: "${bgInfo.bg}"`);
    const isTranslucent = bgInfo.elFound && (bgInfo.bg.includes('rgba') || bgInfo.bg.includes('0.8') || bgInfo.bg.includes('transparent'));

    if (isTranslucent) {
      logPass('Selected container uses translucent rgba background (children stay visually crisp)');
    } else {
      logFail(`Selected container background is not translucent (got "${bgInfo.bg}")`);
    }

    console.log(`\n${BOLD}==> Step 6: Verify connecting edges render on top of containers (Edge Z-Index)${NC}`);
    const edgeLayering = await page.evaluate(() => {
      const edgesLayer = document.querySelector('.react-flow__edges');
      const containerNode = document.querySelector('.react-flow__node:has([class*="fileExpandedContainer"])') ||
                            document.querySelector('.react-flow__node:has([class*="groupExpandedContainer"])');
      const edgesZ = edgesLayer ? parseInt(window.getComputedStyle(edgesLayer).zIndex, 10) : 0;
      const containerZ = containerNode ? parseInt(window.getComputedStyle(containerNode).zIndex, 10) : 0;

      return {
        edgesZ,
        containerZ,
        edgesAboveContainer: edgesZ > containerZ
      };
    });

    console.log(`  Edges layer z-index: ${edgeLayering.edgesZ}, Container node z-index: ${edgeLayering.containerZ}`);
    if (edgeLayering.edgesAboveContainer) {
      logPass(`Connecting edges (z-index ${edgeLayering.edgesZ}) render on top of expanded containers (z-index ${edgeLayering.containerZ})`);
    } else {
      logFail(`Connecting edges (z-index ${edgeLayering.edgesZ}) are covered by container (z-index ${edgeLayering.containerZ})`);
    }

  } catch (err) {
    logFail('Unexpected verification error', err.message);
  } finally {
    await browser.close();
  }

  console.log(`\n${BOLD}${CYAN}================================================================${NC}`);
  console.log(`${BOLD}Container Layering Results: ${GREEN}${passed} Passed${NC}, ${RED}${failed} Failed${NC}`);
  console.log(`${BOLD}${CYAN}================================================================${NC}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

verifyContainerLayering();
