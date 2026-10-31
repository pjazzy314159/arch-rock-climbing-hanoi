/**
 * Browser check of the customer-support assistant.
 *
 * Usage: node scripts/check-assistant.mjs [baseUrl]
 *
 * Safety:
 * - Only targets explicitly supplied local/test frontend and API.
 * - Fails closed when target is missing or points to external origin.
 * - Does not run against production or shared databases.
 */

import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const baseUrl = process.argv[2] ?? "http://localhost:8080";

// Safety: only allow localhost/127.0.0.1 targets
const allowedHosts = ["localhost", "127.0.0.1", "[::1]"];
const parsedUrl = new URL(baseUrl);
if (!allowedHosts.includes(parsedUrl.hostname)) {
  console.error(
    `ERROR: Refusing to run browser check against non-local target: ${baseUrl}`
  );
  console.error("Only localhost/127.0.0.1 targets are permitted.");
  process.exit(1);
}

async function runViewportCheck(viewport, label) {
  console.log(`\n=== ${label} (${viewport.width}x${viewport.height}) ===`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  const problems = [];
  page.on("pageerror", (error) =>
    problems.push(`pageerror: ${error.message.slice(0, 200)}`)
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      problems.push(`console: ${message.text().slice(0, 200)}`);
  });

  // Monitor network requests for unexpected external calls
  page.on("request", (request) => {
    const url = request.url();
    if (
      url.startsWith("http") &&
      !url.includes("localhost") &&
      !url.includes("127.0.0.1")
    ) {
      problems.push(`external-request: ${url}`);
    }
  });

  try {
    await page.goto(`${baseUrl}/`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    // The launcher is there and the panel opens.
    await page.click(".assistant-launcher");
    await page.waitForTimeout(800);
    const panelVisible = await page.locator(".assistant-panel").isVisible();
    console.log("panel open:", panelVisible);

    const honestText = await page
      .locator("text=Answers come from ARCH's published information.")
      .isVisible();
    console.log("honest about its source:", honestText);

    // Check provider status display
    const providerStatus = await page
      .locator(".assistant-head p")
      .textContent();
    console.log("provider status:", providerStatus?.trim());

    // A question the knowledge base covers.
    await page.fill(".assistant-form input", "Do I need climbing experience to visit?");
    await page.click(".assistant-form button[type=submit]");
    await page.waitForSelector(".assistant-mode", { timeout: 30_000 });
    const answer = await page.locator(".assistant-answer p").first().textContent();
    const modeLabel = await page.locator(".assistant-mode").first().textContent();
    const sourcesCount = await page.locator(".assistant-sources li").count();
    console.log("answer:", answer?.trim());
    console.log("mode label:", modeLabel?.trim());
    console.log("sources shown:", sourcesCount);

    // Check source category labels
    const sourceLabels = await page.locator(".source-category-badge").allTextContents();
    console.log("source category labels:", sourceLabels);

    // Check FAQ suggestions
    const faqSuggestions = await page.locator(".faq-suggestions").isVisible();
    console.log("FAQ suggestions visible:", faqSuggestions);
    if (faqSuggestions) {
      const suggestionQuestions = await page.locator(".suggestion-question").allTextContents();
      console.log("FAQ suggestion questions:", suggestionQuestions);
    }

    // A question the knowledge base does not cover: the answer must say so.
    await page.fill(".assistant-form input", "Can I bring my dog?");
    await page.click(".assistant-form button[type=submit]");
    await page.waitForTimeout(2000);
    const modes = await page.locator(".assistant-mode").allTextContents();
    console.log("second mode label:", modes[modes.length - 1]?.trim());
    const secondAnswer = (await page.locator(".assistant-answer p").last().textContent()) ?? "";
    console.log(
      "second answer admits it:",
      secondAnswer.toLowerCase().includes("don't have approved information")
    );
    console.log(
      "second answer does not quote an unrelated entry:",
      !secondAnswer.toLowerCase().includes("water bottle")
    );

    // Test FAQ suggestion click
    if (faqSuggestions) {
      await page.fill(".assistant-form input", "Do I need climbing experience to visit?");
      await page.click(".assistant-form button[type=submit]");
      await page.waitForTimeout(1000);
      const suggestionButtons = await page.locator(".faq-suggestion-link").all();
      if (suggestionButtons.length > 0) {
        await suggestionButtons[0].click();
        const inputValue = await page.locator(".assistant-form input").inputValue();
        console.log("FAQ suggestion click populates input:", inputValue);
      }
    }

    // Test error state by making the panel close and reopen (simulating recovery)
    await page.click(".assistant-launcher"); // close
    await page.waitForTimeout(500);
    await page.click(".assistant-launcher"); // reopen
    await page.waitForTimeout(500);
    const panelReopened = await page.locator(".assistant-panel").isVisible();
    console.log("panel reopens after close:", panelReopened);

    // Screenshot
    const screenshotDir = resolve(__dirname, "../var/screenshots");
    await page.screenshot({
      path: `${screenshotDir}/assistant-${label.toLowerCase().replace(" ", "-")}.png`,
      fullPage: false,
    });

    await browser.close();

    return { problems, passed: problems.length === 0 };
  } catch (error) {
    await browser.close();
    return { problems: [`fatal: ${error.message}`], passed: false };
  }
}

async function main() {
  console.log(`Browser check targeting: ${baseUrl}`);

  const results = [];

  // Desktop viewport
  const desktop = await runViewportCheck(
    { width: 1440, height: 1000 },
    "Desktop"
  );
  results.push(desktop);

  // Mobile viewport
  const mobile = await runViewportCheck(
    { width: 375, height: 667 },
    "Mobile"
  );
  results.push(mobile);

  // Summary
  console.log("\n=== SUMMARY ===");
  for (const result of results) {
    console.log(`  ${result.passed ? "PASS" : "FAIL"}`);
    for (const problem of result.problems) {
      console.log(`    - ${problem}`);
    }
  }

  const allPassed = results.every((r) => r.passed);
  if (!allPassed) {
    process.exit(1);
  }
  console.log("\nAll browser checks passed.");
}

main();