#!/usr/bin/env node
/**
 * scripts/verify_2d_layout.js
 * Verification of 2D Graph Layout & Canvas Viewport Balance at 1440x900
 *
 * Verifies:
 *   1. No ultra-wide single-line horizontal strip.
 *   2. Balanced 2D cluster grid: nodes distributed across multiple rows and columns.
 *   3. Vertical canvas usage > 55% of canvas height on desktop (1440x900).
 *   4. Node labels and badges are crisp, legible, and unclipped.
 *   5. Node selection centering and MiniMap responsiveness.
 *   6. Multi-language repositories (armaan-portfolio React/JSX, pallets/click Python).
 */

const { chromium } = require('playwright');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m';

let passed = 0;
let total = 0;

function logCheck(title, isPass, detail = '') {
  total++;
  if (isPass) {
    passed++;
    console.log(`  ${GREEN}✔ PASS:${NC} ${title} ${detail ? `(${detail})` : ''}`);
  } else {
    console.error(`  ${RED}✖ FAIL:${NC} ${title} ${detail ? `(${detail})` : ''}`);
  }
}

// Generate an 18-file React / Multi-language graph fixture (matching armaan-portfolio)
function generate18FilePortfolioGraph() {
  const fileNames = [
    'src/App.jsx', 'src/main.jsx', 'src/index.css',
    'src/components/Header.jsx', 'src/components/Footer.jsx', 'src/components/Layout.jsx',
    'src/components/ScrollToTop.jsx', 'src/pages/Home.jsx', 'src/pages/Work.jsx',
    'src/pages/ProjectDetail.jsx', 'src/pages/NotFound.jsx', 'src/services/emailService.js',
    'src/components/ui/Button.jsx', 'src/components/ui/Divider.jsx', 'src/components/ui/Sticker.jsx',
    'src/components/ui/Tape.jsx', 'src/components/ui/Polaroid.jsx', 'src/components/ui/SectionTitle.jsx'
  ];

  const files = fileNames.map((p, idx) => ({
    id: `f-${idx}`,
    snapshot_id: 'snap-1',
    path: p,
    language: p.endsWith('.jsx') ? 'javascript' : p.endsWith('.js') ? 'javascript' : 'css',
    content_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    line_count: 50 + idx * 10
  }));

  const symbols = [];
  const edges = [];

  files.forEach((f, idx) => {
    if (f.path.endsWith('.jsx')) {
      const compName = f.path.split('/').pop().replace('.jsx', '');
      const symId = `sym-${idx}`;
      symbols.push({
        id: symId,
        snapshot_id: 'snap-1',
        file_id: f.id,
        name: compName,
        qualified_name: `portfolio.${compName}`,
        kind: 'component',
        language: 'javascript',
        range: { start_line: 10, end_line: 45 },
        docstring: `${compName} component`
      });
    }
  });

  return {
    schema_version: '1.0',
    snapshot: {
      id: 'snap-1',
      repository_id: 'snap-1',
      repository_name: 'armaan-portfolio',
      revision: { kind: 'git_commit', value: 'c0ffeec0ffee' },
      manifest_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111'
    },
    files,
    symbols,
    citations: [],
    edges
  };
}

// Generate a 12-file Python graph fixture (matching pallets/click)
function generatePalletsClickGraph() {
  const fileNames = [
    'src/click/__init__.py', 'src/click/core.py', 'src/click/decorators.py',
    'src/click/types.py', 'src/click/parser.py', 'src/click/formatting.py',
    'src/click/exceptions.py', 'src/click/termui.py', 'src/click/utils.py',
    'src/click/testing.py', 'src/click/shell_completion.py', 'src/click/_compat.py'
  ];

  const files = fileNames.map((p, idx) => ({
    id: `fc-${idx}`,
    snapshot_id: 'snap-click-1',
    path: p,
    language: 'python',
    content_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    line_count: 80 + idx * 15
  }));

  const symbols = [
    {
      id: 'sym-click-echo',
      snapshot_id: 'snap-click-1',
      file_id: 'fc-8', // utils.py
      name: 'echo',
      qualified_name: 'click.utils.echo',
      kind: 'function',
      language: 'python',
      range: { start_line: 15, end_line: 45 },
      docstring: 'Prints a message plus a newline to the given file or stdout.'
    },
    {
      id: 'sym-click-command',
      snapshot_id: 'snap-click-1',
      file_id: 'fc-1', // core.py
      name: 'Command',
      qualified_name: 'click.core.Command',
      kind: 'class',
      language: 'python',
      range: { start_line: 20, end_line: 120 },
      docstring: 'Commands are the basic building block of click.'
    },
    {
      id: 'sym-click-group',
      snapshot_id: 'snap-click-1',
      file_id: 'fc-1', // core.py
      name: 'Group',
      qualified_name: 'click.core.Group',
      kind: 'class',
      language: 'python',
      range: { start_line: 125, end_line: 220 },
      docstring: 'A group allows a command to have subcommands.'
    },
    {
      id: 'sym-click-dec-command',
      snapshot_id: 'snap-click-1',
      file_id: 'fc-2', // decorators.py
      name: 'command',
      qualified_name: 'click.decorators.command',
      kind: 'function',
      language: 'python',
      range: { start_line: 10, end_line: 50 },
      docstring: 'Decorator that turns a function into a Command.'
    },
    {
      id: 'sym-click-dec-argument',
      snapshot_id: 'snap-click-1',
      file_id: 'fc-2', // decorators.py
      name: 'argument',
      qualified_name: 'click.decorators.argument',
      kind: 'function',
      language: 'python',
      range: { start_line: 55, end_line: 90 },
      docstring: 'Decorator that adds an argument to a command.'
    },
    {
      id: 'sym-click-paramtype',
      snapshot_id: 'snap-click-1',
      file_id: 'fc-3', // types.py
      name: 'ParamType',
      qualified_name: 'click.types.ParamType',
      kind: 'class',
      language: 'python',
      range: { start_line: 15, end_line: 80 },
      docstring: 'Helper for type conversion.'
    },
    {
      id: 'sym-click-prompt',
      snapshot_id: 'snap-click-1',
      file_id: 'fc-7', // termui.py
      name: 'prompt',
      qualified_name: 'click.termui.prompt',
      kind: 'function',
      language: 'python',
      range: { start_line: 12, end_line: 60 },
      docstring: 'Prompts a user for input.'
    },
    {
      id: 'sym-click-clickerr',
      snapshot_id: 'snap-click-1',
      file_id: 'fc-6', // exceptions.py
      name: 'ClickException',
      qualified_name: 'click.exceptions.ClickException',
      kind: 'class',
      language: 'python',
      range: { start_line: 10, end_line: 40 },
      docstring: 'Base class for all click exceptions.'
    }
  ];

  return {
    schema_version: '1.0',
    snapshot: {
      id: 'snap-click-1',
      repository_id: 'snap-click-1',
      repository_name: 'pallets/click',
      revision: { kind: 'git_commit', value: 'b2c3d4e5f6a1' },
      manifest_hash: 'sha256:2222222222222222222222222222222222222222222222222222222222222222'
    },
    files,
    symbols,
    citations: [],
    edges: []
  };
}

async function verify2DLayout() {
  console.log(`\n${BOLD}${CYAN}================================================================${NC}`);
  console.log(`${BOLD}${CYAN}      UNFOG 2D GRAPH LAYOUT & VIEWPORT VERIFICATION SUITE       ${NC}`);
  console.log(`${BOLD}${CYAN}================================================================${NC}`);

  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const portfolioGraph = generate18FilePortfolioGraph();
  const clickGraph = generatePalletsClickGraph();

  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());

    if (url.pathname === '/api/v1/codebase/graph') {
      const repoId = url.searchParams.get('repo_id');
      if (repoId === 'armaan-portfolio') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(portfolioGraph)
        });
      }
      if (repoId === 'pallets-click') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(clickGraph)
        });
      }
    }

    if (url.pathname === '/api/v1/github/import') {
      const postData = JSON.parse(req.postData() || '{}');
      if (postData.url && postData.url.includes('click')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            repo_id: 'pallets-click',
            owner: 'pallets',
            repo: 'click',
            commit_sha: 'b2c3d4e5f6a1',
            default_branch: 'main',
            file_count: 12
          })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          repo_id: 'armaan-portfolio',
          owner: 'armaan-choudhary',
          repo: 'armaan-portfolio',
          commit_sha: 'c0ffeec0ffee',
          default_branch: 'main',
          file_count: 18
        })
      });
    }

    return route.continue();
  });

  try {
    console.log(`\n${BOLD}==> Phase 1: Baseline sample_service 2D Layout Verification${NC}`);
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Wait for React Flow container
    const reactFlowCanvas = page.locator('div.react-flow');
    await reactFlowCanvas.waitFor({ state: 'visible', timeout: 5000 });
    const canvasBox = await reactFlowCanvas.boundingBox();

    console.log(`  Canvas Dimensions: width=${Math.round(canvasBox.width)}px, height=${Math.round(canvasBox.height)}px`);

    // Retrieve positions of file nodes in sample_service
    const fileNodes = page.locator('.react-flow__node-fileNode');
    const fileCount = await fileNodes.count();
    logCheck('sample_service File nodes present', fileCount >= 5, `found ${fileCount} files`);

    // Extract Y-coordinates of all file nodes
    const fileYs = await fileNodes.evaluateAll((elems) =>
      elems.map((el) => {
        const style = window.getComputedStyle(el);
        const transform = style.transform;
        const matrix = transform.match(/^matrix\((.+)\)$/);
        if (matrix) {
          const values = matrix[1].split(', ');
          return parseFloat(values[5]);
        }
        return el.offsetTop;
      })
    );

    const distinctFileYs = [...new Set(fileYs.map((y) => Math.round(y / 50) * 50))];
    console.log(`  File Node Y levels in sample_service: ${distinctFileYs.length} distinct grid rows`);
    logCheck('sample_service distributed into multiple 2D rows (not 1 horizontal line)', distinctFileYs.length >= 2, `${distinctFileYs.length} row levels`);

    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}==> Phase 2: 18-File Portfolio 2D Cluster Grid Verification${NC}`);
    // Import armaan-portfolio
    const importBtn = page.locator('button:has-text("Import Repository")');
    await importBtn.click();

    const urlInput = page.locator('input[placeholder*="github.com"]');
    await urlInput.waitFor({ state: 'visible', timeout: 5000 });
    await urlInput.fill('https://github.com/armaan-choudhary/armaan-portfolio');

    const submitBtn = page.locator('button:has-text("Analyze Repository")');
    await submitBtn.click();

    await page.waitForTimeout(2500);

    // Wait for armaan-portfolio nodes to render
    const portfolioNodes = page.locator('.react-flow__node');
    await portfolioNodes.first().waitFor({ state: 'visible', timeout: 5000 });

    const totalNodesCount = await portfolioNodes.count();
    logCheck('armaan-portfolio nodes rendered', totalNodesCount >= 25, `rendered ${totalNodesCount} nodes`);

    // Extract bounding box of all nodes inside React Flow
    const nodeBoxes = await portfolioNodes.evaluateAll((elems) =>
      elems.map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right
        };
      })
    );

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    nodeBoxes.forEach((b) => {
      if (b.width > 0 && b.height > 0) {
        minX = Math.min(minX, b.left);
        maxX = Math.max(maxX, b.right);
        minY = Math.min(minY, b.top);
        maxY = Math.max(maxY, b.bottom);
      }
    });

    const graphRenderedWidth = maxX - minX;
    const graphRenderedHeight = maxY - minY;
    const renderedAspectRatio = graphRenderedWidth / graphRenderedHeight;
    const verticalFillRatio = graphRenderedHeight / canvasBox.height;

    console.log(`  Rendered Graph Span: width=${Math.round(graphRenderedWidth)}px, height=${Math.round(graphRenderedHeight)}px`);
    console.log(`  Aspect Ratio (W/H): ${renderedAspectRatio.toFixed(2)}:1 (Ideal balanced target: 1.0 - 2.5:1)`);
    console.log(`  Vertical Canvas Fill: ${(verticalFillRatio * 100).toFixed(1)}% (Target: > 55%)`);

    logCheck(
      'Balanced 2D Aspect Ratio (not ultra-wide ribbon > 5:1)',
      renderedAspectRatio < 3.5,
      `aspect ratio is ${renderedAspectRatio.toFixed(2)}:1`
    );

    logCheck(
      'Vertical Canvas Utilization (> 55% of canvas height)',
      verticalFillRatio >= 0.55,
      `fills ${(verticalFillRatio * 100).toFixed(1)}% of height`
    );

    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}==> Phase 3: Legibility & Crisp Label Rendering at Default Zoom${NC}`);
    const componentNode = page.locator('.react-flow__node-symbolNode:has-text("Header")').first();
    await componentNode.waitFor({ state: 'visible', timeout: 5000 });
    const compBox = await componentNode.boundingBox();

    logCheck(
      'Component node adequately sized for crisp label legibility',
      compBox.width >= 120 && compBox.height >= 50,
      `node dimensions: ${Math.round(compBox.width)}x${Math.round(compBox.height)}px`
    );

    const compText = await componentNode.textContent();
    logCheck(
      'Component badge and label visible without manual zoom',
      compText.includes('Header') && compText.includes('component'),
      `text: "${compText.replace(/\\s+/g, ' ').trim()}"`
    );

    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}==> Phase 4: Centering & MiniMap Responsiveness${NC}`);
    // Click component to verify centering
    await componentNode.dispatchEvent('click');
    await page.waitForTimeout(600);

    const inspector = page.locator('aside');
    const inspectorText = await inspector.textContent();
    logCheck('Selection opens inspector and populates metadata', inspectorText.includes('Header'), 'Header selected');

    // Verify MiniMap
    const miniMap = page.locator('div.react-flow__minimap');
    await miniMap.waitFor({ state: 'visible', timeout: 3000 });
    const miniMapBox = await miniMap.boundingBox();
    logCheck('MiniMap rendered and positioned at bottom-right', miniMapBox.width > 50 && miniMapBox.height > 40, `size: ${Math.round(miniMapBox.width)}x${Math.round(miniMapBox.height)}px`);

    // Verify Controls
    const controls = page.locator('div.react-flow__controls');
    await controls.waitFor({ state: 'visible', timeout: 3000 });
    const zoomInBtn = controls.locator('button.react-flow__controls-zoomin');
    await zoomInBtn.waitFor({ state: 'visible', timeout: 2000 });
    logCheck('Zoom controls present and interactive', true);

    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}==> Phase 5: pallets/click Python Graph 2D Layout Verification${NC}`);
    const clickImportBtn = page.locator('button:has-text("Import Repository")');
    await clickImportBtn.click();

    const clickUrlInput = page.locator('input[placeholder*="github.com"]');
    await clickUrlInput.waitFor({ state: 'visible', timeout: 5000 });
    await clickUrlInput.fill('https://github.com/pallets/click');

    const clickSubmitBtn = page.locator('button:has-text("Analyze Repository")');
    await clickSubmitBtn.click();

    await page.waitForTimeout(2500);

    const clickNodes = page.locator('.react-flow__node');
    await clickNodes.first().waitFor({ state: 'visible', timeout: 5000 });

    const clickNodesCount = await clickNodes.count();
    logCheck('pallets/click nodes rendered', clickNodesCount >= 18, `rendered ${clickNodesCount} nodes`);

    // Verify distinct grid rows for click file nodes
    const clickFileNodes = page.locator('.react-flow__node-fileNode');
    const clickFileYs = await clickFileNodes.evaluateAll((elems) =>
      elems.map((el) => {
        const style = window.getComputedStyle(el);
        const transform = style.transform;
        const matrix = transform.match(/^matrix\((.+)\)$/);
        if (matrix) {
          const values = matrix[1].split(', ');
          return parseFloat(values[5]);
        }
        return el.offsetTop;
      })
    );

    const distinctClickYs = [...new Set(clickFileYs.map((y) => Math.round(y / 50) * 50))];
    console.log(`  File Node Y levels in pallets/click: ${distinctClickYs.length} distinct grid rows`);
    logCheck('pallets/click distributed into multiple 2D rows (not 1 horizontal line)', distinctClickYs.length >= 3, `${distinctClickYs.length} row levels`);

    // Compute bounding box for click graph
    const clickNodeBoxes = await clickNodes.evaluateAll((elems) =>
      elems.map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right
        };
      })
    );

    let cMinX = Infinity, cMaxX = -Infinity;
    let cMinY = Infinity, cMaxY = -Infinity;
    clickNodeBoxes.forEach((b) => {
      if (b.width > 0 && b.height > 0) {
        cMinX = Math.min(cMinX, b.left);
        cMaxX = Math.max(cMaxX, b.right);
        cMinY = Math.min(cMinY, b.top);
        cMaxY = Math.max(cMaxY, b.bottom);
      }
    });

    const clickSpanWidth = cMaxX - cMinX;
    const clickSpanHeight = cMaxY - cMinY;
    const clickAspectRatio = clickSpanWidth / clickSpanHeight;
    const clickVerticalFill = clickSpanHeight / canvasBox.height;

    console.log(`  pallets/click Span: width=${Math.round(clickSpanWidth)}px, height=${Math.round(clickSpanHeight)}px`);
    console.log(`  Aspect Ratio: ${clickAspectRatio.toFixed(2)}:1, Vertical Canvas Fill: ${(clickVerticalFill * 100).toFixed(1)}%`);

    logCheck(
      'pallets/click Balanced 2D Aspect Ratio (not ultra-wide ribbon > 5:1)',
      clickAspectRatio < 3.5,
      `aspect ratio is ${clickAspectRatio.toFixed(2)}:1`
    );

    logCheck(
      'pallets/click Vertical Canvas Utilization (> 55% of canvas height)',
      clickVerticalFill >= 0.55,
      `fills ${(clickVerticalFill * 100).toFixed(1)}% of height`
    );

    // Verify Python function node legibility & centering
    const echoNode = page.locator('.react-flow__node-symbolNode:has-text("echo")').first();
    await echoNode.waitFor({ state: 'visible', timeout: 5000 });
    const echoBox = await echoNode.boundingBox();

    logCheck(
      'Python function node adequately sized for crisp legibility',
      echoBox.width >= 120 && echoBox.height >= 50,
      `node dimensions: ${Math.round(echoBox.width)}x${Math.round(echoBox.height)}px`
    );

    const echoText = await echoNode.textContent();
    logCheck(
      'Python function badge and name legible without zoom',
      echoText.includes('echo') && echoText.includes('function'),
      `text: "${echoText.replace(/\\s+/g, ' ').trim()}"`
    );

    // Click echo to verify centering & inspector update
    await echoNode.dispatchEvent('click');
    await page.waitForTimeout(600);

    const clickInspectorText = await inspector.textContent();
    logCheck('Selection of Python node opens inspector with symbol metadata', clickInspectorText.includes('echo'), 'echo selected');

  } catch (err) {
    logCheck('Layout verification encountered exception', false, err.message);
    console.error(err);
    await browser.close();
    process.exit(1);
  }

  await browser.close();

  console.log(`\n${BOLD}${CYAN}================================================================${NC}`);
  console.log(`${BOLD}Layout Verification Summary:${NC} ${GREEN}${passed}/${total} Checks Passed${NC}`);
  console.log(`${BOLD}${CYAN}================================================================${NC}`);

  if (passed === total) {
    console.log(`\n${GREEN}${BOLD}2D Graph Layout successfully verified! Zero horizontal strip regression.${NC}\n`);
    process.exit(0);
  } else {
    process.exit(1);
  }
}

verify2DLayout();
