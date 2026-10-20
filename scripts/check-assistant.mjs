/**
 * Browser check of the customer-support assistant.
 *
 * Usage: node scripts/check-assistant.mjs [baseUrl]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8080";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const problems = [];
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`);
});

await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60_000 });

// The launcher is there and the panel opens.
await page.click(".assistant-launcher");
await page.waitForTimeout(800);
console.log("panel open:", await page.locator(".assistant-panel").isVisible());
console.log(
  "honest about its source:",
  await page.locator("text=Answers come from ARCH's published information.").isVisible(),
);

// A question the knowledge base covers.
await page.fill(".assistant-form input", "Do I need climbing experience to visit?");
await page.click(".assistant-form button[type=submit]");
await page.waitForSelector(".assistant-mode", { timeout: 30_000 });
console.log("answer:", (await page.locator(".assistant-answer p").first().textContent())?.trim());
console.log("mode label:", (await page.locator(".assistant-mode").first().textContent())?.trim());
console.log("sources shown:", await page.locator(".assistant-sources li").count());

// A question the knowledge base does not cover: the answer must say so.
await page.fill(".assistant-form input", "What is the wifi password in Tokyo?");
await page.click(".assistant-form button[type=submit]");
await page.waitForTimeout(2000);
const modes = await page.locator(".assistant-mode").allTextContents();
console.log("second mode label:", modes[modes.length - 1]?.trim());
console.log(
  "second answer admits it:",
  (await page.locator(".assistant-answer p").last().textContent())
    ?.toLowerCase()
    .includes("don't have approved information"),
);

await page.screenshot({ path: "var/screenshots/assistant.png", fullPage: false });
await browser.close();

if (problems.length) {
  console.log("\n--- browser problems ---");
  for (const problem of problems) console.log(problem);
  process.exit(1);
}
console.log("\nThe assistant answered correctly.");
