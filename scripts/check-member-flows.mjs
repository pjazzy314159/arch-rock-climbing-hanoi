/**
 * Browser check of the member flows: register, sign in, safety agreement,
 * logbook, profile and sign out.
 *
 * Usage: node scripts/check-member-flows.mjs [baseUrl]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8080";
const stamp = Date.now();
const email = `member-${stamp}@example.com`;
const password = "a-long-enough-password";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const problems = [];
let expectingErrorResponse = false;
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
page.on("console", (message) => {
  // A rejected request is expected while the wrong password is being tried.
  if (message.type() === "error" && !expectingErrorResponse) {
    problems.push(`console: ${message.text().slice(0, 200)}`);
  }
});

function step(name) {
  console.log(`\n--- ${name} ---`);
}

// 1. An anonymous visitor sees a prompt, not somebody else's records.
step("anonymous member area");
await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(800);
console.log("prompt shown:", await page.locator("text=Sign in to see your statistics").isVisible());

// 2. Register.
step("register");
await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle", timeout: 60_000 });
await page.click('button[role="tab"]:has-text("Create an account")');
await page.fill('input[name="full_name"]', "Browser Member");
await page.fill('input[name="email"]', email);
await page.fill('input[name="phone"]', "+84 900 000 000");
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL("**/member", { timeout: 30_000 });
await page.waitForTimeout(1200);
console.log("url after registering:", page.url());
console.log("signed in as:", await page.locator(".profile strong").first().textContent());
console.log(
  "sidebar says signed in:",
  await page.locator(".preview-note .sample-badge").first().isVisible(),
);

// 3. The safety agreement starts pending and can be signed.
step("safety agreement");
const pending = await page.locator("text=Status: pending").isVisible();
console.log("agreement pending:", pending);
await page.fill('input[name="signed_name"]', "Browser Member");
await page.click('.agreement-form [role="checkbox"]');
await page.click('.agreement-form button[type="submit"]');
await page.waitForTimeout(1500);
console.log(
  "agreement signed:",
  await page.locator("text=Your safety agreement has been recorded.").isVisible(),
);

// 4. Log a climb and see it in the logbook.
step("log a climb");
await page.goto(`${baseUrl}/member/logbook`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1000);
console.log("empty logbook notice:", await page.locator("text=No climbs logged yet.").isVisible());
await page.click('button:has-text("Log a climb")');
await page.waitForTimeout(500);
await page.selectOption('select[name="route"]', { index: 0 });
await page.fill('input[name="date"]', "2026-10-18");
await page.fill('input[name="attempts"]', "2");
await page.selectOption('select[name="result"]', "Sent");
await page.fill('textarea[name="notes"]', "Logged by the browser check.");
await page.click('.log-modal button[type="submit"]');
await page.waitForTimeout(1800);
console.log(
  "climb in the logbook:",
  await page.locator("text=Logged by the browser check.").isVisible(),
);

// 5. Edit the profile.
step("profile");
await page.goto(`${baseUrl}/member/profile`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1000);
console.log("email shown:", await page.locator(".profile-summary strong").first().textContent());
await page.fill('input[name="full_name"]', "Browser Member Edited");
await page.selectOption('select[name="climbing_level"]', "6");
await page.click('.profile-form button[type="submit"]');
await page.waitForTimeout(1500);
console.log("profile saved:", await page.locator("text=Your details have been saved.").isVisible());

// 6. A wrong current password is refused.
step("change password");
expectingErrorResponse = true;
await page.fill('input[name="current_password"]', "not-the-password");
await page.fill('input[name="new_password"]', "another-long-password");
await page.click('form:has(input[name="current_password"]) button[type="submit"]');
await page.waitForTimeout(1500);
console.log(
  "wrong password refused:",
  await page.locator("text=Your current password is not correct").isVisible(),
);

// 7. The right password works.
await page.fill('input[name="current_password"]', password);
await page.fill('input[name="new_password"]', "another-long-password");
await page.click('form:has(input[name="current_password"]) button[type="submit"]');
await page.waitForTimeout(1500);
expectingErrorResponse = false;
console.log(
  "password changed:",
  await page.locator("text=Your password has been changed.").isVisible(),
);

// 8. Sign out and confirm the records are gone.
step("sign out");
await page.click('button:has-text("Sign out")');
await page.waitForTimeout(1200);
console.log("signed out:", await page.locator("text=Not signed in").isVisible());
await page.goto(`${baseUrl}/member/logbook`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1000);
console.log(
  "records hidden after signing out:",
  await page.locator("text=Sign in to see your logbook").isVisible(),
);

await page.screenshot({ path: "var/screenshots/member-signed-out.png", fullPage: false });
await browser.close();

if (problems.length) {
  console.log("\n--- browser problems ---");
  for (const problem of problems) console.log(problem);
  process.exit(1);
}
console.log("\nMember flows completed without browser errors.");
