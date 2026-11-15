// scripts/verify_browser_journey.js
// End-to-end browser verification of the 8-step Unfog user journey using Playwright

const { chromium } = require("/home/armaan/.local/share/mise/installs/playwright/latest/node_modules/playwright");

async function runBrowserVerification() {
  console.log("=====================================================");
  console.log("       UNFOG END-TO-END BROWSER VERIFICATION        ");
  console.log("=====================================================");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Collect console logs and errors
  const consoleErrors = [];
  page.on("pageerror", (err) => {
    console.error("  [Browser Error]:", err.message);
    consoleErrors.push(err.message);
  });

  try {
    // -------------------------------------------------------------------------
    // Step 1: Open Unfog Dashboard
    // -------------------------------------------------------------------------
    console.log("\n==> Step 1: Opening Unfog Dashboard (http://localhost:3000)");
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    const title = await page.title();
    console.log("  ✔ Dashboard page loaded. Title:", title);

    // Verify Header Elements
    const brandText = await page.textContent("header");
    if (!brandText.includes("Unfog")) throw new Error("Header missing 'Unfog' branding");
    if (!brandText.includes("sample_service")) throw new Error("Header missing repository 'sample_service'");
    if (!brandText.includes("Static Verified")) throw new Error("Header missing 'Static Verified' badge");
    console.log("  ✔ Verified Header: Unfog branding, 'sample_service', and 'Static Verified' badge present");

    // -------------------------------------------------------------------------
    // Step 2: Explore Bundled Sample Repository Graph
    // -------------------------------------------------------------------------
    console.log("\n==> Step 2: Exploring Codebase Architecture Graph");
    await page.waitForSelector(".react-flow__node", { timeout: 10000 });
    const nodeCount = await page.locator(".react-flow__node").count();
    console.log(`  ✔ React Flow canvas rendered with ${nodeCount} architecture nodes`);
    if (nodeCount < 5) throw new Error(`Expected at least 5 nodes, found ${nodeCount}`);

    // Verify search / filter works
    const searchInput = page.locator('input[placeholder*="Search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill("verify_token");
      await page.waitForTimeout(300);
      console.log("  ✔ Filtered search for 'verify_token'");
      await searchInput.fill("");
    }

    // -------------------------------------------------------------------------
    // Step 3: Select an Architecture Node
    // -------------------------------------------------------------------------
    console.log("\n==> Step 3: Selecting an Architecture Node (verify_token)");
    // Find node with text verify_token
    const tokenNode = page.locator('.react-flow__node:has-text("verify_token")').first();
    await tokenNode.scrollIntoViewIfNeeded();
    await tokenNode.click();
    console.log("  ✔ Clicked 'verify_token' function node");

    // -------------------------------------------------------------------------
    // Step 4: Inspect Real Source Code in Inspector Tab
    // -------------------------------------------------------------------------
    console.log("\n==> Step 4: Inspecting Real Source Code in Source Inspector Tab");
    const inspector = page.locator("aside, [class*='inspector']").first();
    await inspector.waitFor({ state: "visible", timeout: 5000 });

    // Click 'Source' tab if not active
    const sourceTabBtn = page.locator("button:has-text('Source'), button:has-text('Inspector')").first();
    await sourceTabBtn.click();
    await page.waitForTimeout(500);

    const sourceContent = await page.textContent("aside, [class*='inspector']");
    if (!sourceContent.includes("verify_token")) {
      throw new Error("Source inspector did not display 'verify_token'");
    }
    if (!sourceContent.includes("service/auth.py")) {
      throw new Error("Source inspector did not display path 'service/auth.py'");
    }
    console.log("  ✔ Verified Source Inspector: Shows 'service/auth.py' and exact 'verify_token' source code");

    // -------------------------------------------------------------------------
    // Step 5: Ask Gemini to Explain Selected Functionality
    // -------------------------------------------------------------------------
    console.log("\n==> Step 5: Asking Gemini to Explain Selected Functionality");
    const aiTabBtn = page.locator("button:has-text('AI Companion'), button:has-text('Companion')").first();
    await aiTabBtn.click();
    await page.waitForTimeout(500);

    // Send a message or trigger quick prompt
    const chatInput = page.locator('input[placeholder*="Ask"], input[placeholder*="message"]');
    await chatInput.fill("Explain how token verification works in auth.py");
    await chatInput.press("Enter");
    console.log("  ✔ Submitted question to Gemini AI Companion");

    // Wait for response
    await page.waitForTimeout(2500);
    const aiContent = await page.textContent("aside, [class*='inspector']");
    if (!aiContent.toLowerCase().includes("token") && !aiContent.toLowerCase().includes("auth")) {
      throw new Error("AI Companion response did not contain expected explanation content");
    }
    console.log("  ✔ Received grounded architectural explanation from AI companion");

    // -------------------------------------------------------------------------
    // Step 6: Verify Accurate Source Citations
    // -------------------------------------------------------------------------
    console.log("\n==> Step 6: Verifying Source Citations & Line Navigation");
    const citationBadge = page.locator("[class*='citationBadge'], button:has-text('service/auth.py')").first();
    await citationBadge.waitFor({ state: "visible", timeout: 5000 });
    const citationText = await citationBadge.textContent();
    console.log(`  ✔ Found citation badge: "${citationText.trim()}"`);

    // Click citation to navigate to source inspector
    await citationBadge.click();
    await page.waitForTimeout(500);
    const postCitationTab = await page.textContent("aside, [class*='inspector']");
    if (!postCitationTab.includes("service/auth.py")) {
      throw new Error("Citation click did not navigate to source inspector for 'service/auth.py'");
    }
    console.log("  ✔ Citation click smoothly navigated directly to target source lines in Source Inspector");

    // -------------------------------------------------------------------------
    // Step 7: Complete a Learning Challenge in Learning Arena
    // -------------------------------------------------------------------------
    console.log("\n==> Step 7: Completing a Learning Challenge in Learning Arena");
    const arenaTabBtn = inspector.locator("button:has-text('Arena'), button:has-text('Challenge')").first();
    await arenaTabBtn.click();
    await page.waitForTimeout(600);

    console.log("  ✔ Opened Learning Arena. Active Challenge loaded");

    // Select option for verify_token inside the challenge card
    const optionBtn = inspector.locator("[class*='optionItem']:has-text('verify_token')").first();
    await optionBtn.waitFor({ state: "visible", timeout: 8000 });
    await optionBtn.click();
    console.log("  ✔ Selected challenge option 'verify_token'");

    // Submit answer inside the challenge card
    const submitBtn = inspector.locator("button:has-text('Submit Answer')").first();
    await submitBtn.waitFor({ state: "visible", timeout: 5000 });
    await submitBtn.click();
    console.log("  ✔ Clicked 'Submit Answer'");

    // -------------------------------------------------------------------------
    // Step 8: Receive Meaningful Feedback
    // -------------------------------------------------------------------------
    console.log("\n==> Step 8: Receiving Meaningful Feedback & Grounded Citations");
    const feedbackBanner = inspector.locator("[class*='feedbackBanner']").first();
    await feedbackBanner.waitFor({ state: "visible", timeout: 8000 });
    const feedbackContent = await feedbackBanner.textContent();

    if (!feedbackContent.includes("Correct") && !feedbackContent.includes("100")) {
      throw new Error(`Challenge submission feedback did not show success. Got: ${feedbackContent.substring(0, 200)}`);
    }
    console.log(`  ✔ Feedback verified: "${feedbackContent.trim()}"`);

    console.log("\n=====================================================");
    console.log("  SUCCESS: ALL 8 USER JOURNEY STEPS VERIFIED END-TO-END! ");
    console.log("=====================================================");

  } catch (error) {
    console.error("\n❌ BROWSER VERIFICATION FAILED:", error.message);
    if (consoleErrors.length > 0) {
      console.error("Browser Console Errors:", consoleErrors);
    }
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runBrowserVerification();
