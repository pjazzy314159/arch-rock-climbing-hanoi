/**
 * Browser check of the public contact form against a running ARCH backend.
 *
 * Usage: node scripts/check-contact-form.mjs [baseUrl] [apiUrl]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8080";
const apiUrl = process.argv[3] ?? "http://localhost:8000";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

await page.goto(`${baseUrl}/contact`, { waitUntil: "networkidle", timeout: 60_000 });

await page.fill('input[name="name"]', "Browser Test");
await page.fill('input[name="email"]', "browser-test@example.com");
await page.selectOption('select[name="subject"]', "Membership");
await page.fill(
  'textarea[name="message"]',
  "This message was sent by the automated browser check.",
);
await page.click('button[type="submit"]');

await page.waitForSelector(".feedback", { timeout: 30_000 });
const feedback = (await page.textContent(".feedback"))?.trim();
console.log("form feedback:", feedback);

const response = await fetch(`${apiUrl}/api/public/contact`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Verification Reader",
    email: "reader@example.com",
    subject: "Membership",
    message: "Confirm the message reached the ARCH team.",
  }),
});
console.log("direct API status:", response.status);

await page.screenshot({ path: "var/screenshots/contact-submitted.png", fullPage: true });
await browser.close();

if (errors.length) {
  console.log("--- browser errors ---");
  for (const error of errors) console.log(error);
  process.exit(1);
}
console.log("No browser errors.");
