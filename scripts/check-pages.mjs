/**
 * Check every page for hydration errors, console errors and failed requests.
 *
 * Usage: node scripts/check-pages.mjs [baseUrl]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8080";

const PAGES = [
  "/",
  "/gym",
  "/tour",
  "/routes",
  "/shop",
  "/shop/ARC-EDG-01",
  "/visit",
  "/courses",
  "/events",
  "/contact",
  "/member",
  "/member/logbook",
  "/member/beta",
  "/member/progress",
  "/admin",
];

const browser = await chromium.launch();
let failures = 0;

for (const path of PAGES) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const problems = [];

  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`);
  });
  page.on("requestfailed", (request) =>
    problems.push(`request failed: ${request.url()} (${request.failure()?.errorText})`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`);
  });

  const response = await page.goto(`${baseUrl}${path}`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.waitForTimeout(800);

  const status = response?.status() ?? 0;
  if (status !== 200) {
    problems.push(`page status ${status}`);
  }

  // The page must be interactive: React has to have hydrated.
  const interactive = await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Open menu"]');
    return Boolean(button);
  });
  if (!interactive) problems.push("no hydrated markup found");

  if (problems.length) {
    failures += 1;
    console.log(`FAIL ${path}`);
    for (const problem of problems) console.log(`     ${problem}`);
  } else {
    console.log(`ok   ${path}`);
  }
  await context.close();
}

await browser.close();
console.log(failures === 0 ? "\nAll pages clean." : `\n${failures} page(s) with problems.`);
process.exit(failures === 0 ? 0 : 1);
