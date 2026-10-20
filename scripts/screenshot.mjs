/**
 * Capture screenshots of the running ARCH site for visual review.
 *
 * Usage: node scripts/screenshot.mjs [baseUrl] [outputDir]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] ?? "http://localhost:8080";
const outputDir = process.argv[3] ?? "var/screenshots";

const PAGES = [
  { name: "home", url: "/", width: 1440, height: 900, full: true },
  { name: "home-mobile", url: "/", width: 390, height: 844, full: true },
  { name: "gym", url: "/gym", width: 1440, height: 900, full: true },
  { name: "tour", url: "/tour", width: 1440, height: 900, full: true },
  { name: "routes", url: "/routes", width: 1440, height: 900, full: true },
  { name: "shop", url: "/shop", width: 1440, height: 900, full: true },
  { name: "shop-product", url: "/shop/ARC-EDG-01", width: 1440, height: 900, full: true },
  { name: "visit", url: "/visit", width: 1440, height: 900, full: true },
  { name: "courses", url: "/courses", width: 1440, height: 900, full: true },
  { name: "events", url: "/events", width: 1440, height: 900, full: true },
  { name: "contact", url: "/contact", width: 1440, height: 900, full: true },
  { name: "member", url: "/member", width: 1440, height: 900, full: true },
  { name: "member-logbook", url: "/member/logbook", width: 1440, height: 900, full: true },
  { name: "member-beta", url: "/member/beta", width: 1440, height: 900, full: true },
  { name: "member-progress", url: "/member/progress", width: 1440, height: 900, full: true },
  { name: "admin", url: "/admin", width: 1440, height: 900, full: true },
  { name: "not-found", url: "/definitely-not-a-page", width: 1440, height: 900, full: false },
];

const browser = await chromium.launch();
const consoleErrors = [];

try {
  await mkdir(outputDir, { recursive: true });

  for (const spec of PAGES) {
    const context = await browser.newContext({
      viewport: { width: spec.width, height: spec.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(`${spec.name}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(`${spec.name}: pageerror ${error.message}`);
    });

    const response = await page.goto(`${baseUrl}${spec.url}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.waitForTimeout(400);
    const file = path.join(outputDir, `${spec.name}.png`);
    await page.screenshot({ path: file, fullPage: spec.full });
    console.log(`${spec.name} ${spec.url} -> ${response?.status()} ${file}`);
    await context.close();
  }
} finally {
  await browser.close();
}

if (consoleErrors.length) {
  console.log("\n--- browser console errors ---");
  for (const error of consoleErrors) console.log(error);
} else {
  console.log("\nNo browser console errors.");
}
