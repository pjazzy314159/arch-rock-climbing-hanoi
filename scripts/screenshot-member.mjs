/**
 * Capture screenshots of the member area, signed in and signed out.
 *
 * Usage: node scripts/screenshot-member.mjs [baseUrl]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8080";
const stamp = Date.now();
const email = `shot-${stamp}@example.com`;
const password = "a-long-enough-password";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle", timeout: 60_000 });
await page.screenshot({ path: "var/screenshots/signin.png", fullPage: true });

await page.click('button[role="tab"]:has-text("Create an account")');
await page.fill('input[name="full_name"]', "Sample Member");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL("**/member", { timeout: 30_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "var/screenshots/member-signed-in.png", fullPage: true });

await page.goto(`${baseUrl}/member/profile`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "var/screenshots/member-profile.png", fullPage: true });

await page.goto(`${baseUrl}/member/logbook`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "var/screenshots/member-logbook.png", fullPage: true });

await browser.close();
console.log("member screenshots written to var/screenshots/");
