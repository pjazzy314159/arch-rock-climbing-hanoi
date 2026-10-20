/**
 * Check that a page is actually styled, not just served.
 *
 * A build can succeed and still ship a broken stylesheet: the server may
 * reference a stylesheet hash that is not in the output directory. This check
 * loads a page, waits for its stylesheets and reports what actually applied.
 *
 * Usage: node scripts/check-styles.mjs [baseUrl]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8090";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const failed = [];
page.on("requestfailed", (request) =>
  failed.push(`${request.url()} (${request.failure()?.errorText})`),
);
page.on("response", (response) => {
  if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
});

const response = await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(800);

const report = await page.evaluate(() => {
  const body = document.body;
  const header = document.querySelector(".site-header");
  const heading = document.querySelector("h1");
  return {
    status: document.readyState,
    bodyBackground: getComputedStyle(body).backgroundColor,
    bodyFont: getComputedStyle(body).fontFamily.split(",")[0],
    headerPosition: header ? getComputedStyle(header).position : "no header",
    headingSize: heading ? getComputedStyle(heading).fontSize : "no heading",
    stylesheets: Array.from(document.styleSheets).map((sheet) => sheet.href ?? "inline"),
  };
});

console.log("page status:", response?.status());
console.log("body background:", report.bodyBackground);
console.log("body font:", report.bodyFont);
console.log("header position:", report.headerPosition);
console.log("h1 font size:", report.headingSize);
console.log("stylesheets:", report.stylesheets.join(", "));

await page.screenshot({ path: "var/screenshots/preview-styles.png", fullPage: false });
await browser.close();

const unstyled = report.bodyBackground === "rgba(0, 0, 0, 0)" && report.headerPosition !== "sticky";
if (failed.length) {
  console.log("\nfailed requests:");
  for (const item of failed) console.log("  " + item);
}
if (unstyled || failed.length) {
  console.log("\nThe page is not correctly styled.");
  process.exit(1);
}
console.log("\nThe page is styled.");
