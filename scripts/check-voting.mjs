/**
 * Browser check of the route voting flow and the leaderboard.
 *
 * Usage: node scripts/check-voting.mjs [baseUrl]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8080";
const stamp = Date.now();
const email = `voter-${stamp}@example.com`;
const password = "a-long-enough-password";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const problems = [];
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`);
});

function step(name) {
  console.log(`\n--- ${name} ---`);
}

// 1. An anonymous visitor is asked to sign in before voting.
step("anonymous route page");
await page.goto(`${baseUrl}/routes/1`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(800);
console.log("route shown:", await page.locator("h1").first().textContent());
console.log("sign-in prompt:", await page.locator("text=Sign in to vote.").isVisible());

// 2. Register and vote.
step("vote");
await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle", timeout: 60_000 });
await page.click('button[role="tab"]:has-text("Create an account")');
await page.fill('input[name="full_name"]', "Voting Member");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL("**/member", { timeout: 30_000 });
await page.waitForTimeout(1000);

await page.goto(`${baseUrl}/routes/1`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1000);
await page.click('.vote-options button:has-text("Harder")');
await page.waitForTimeout(1500);
console.log("vote recorded:", await page.locator("text=your vote has been recorded.").isVisible());
console.log(
  "harder button pressed:",
  await page.locator('.vote-options button:has-text("Harder")').getAttribute("aria-pressed"),
);

// 3. Change the vote.
step("change the vote");
await page.click('.vote-options button:has-text("Easier")');
await page.waitForTimeout(1500);
console.log(
  "easier button pressed:",
  await page.locator('.vote-options button:has-text("Easier")').getAttribute("aria-pressed"),
);

// 4. Withdraw the vote.
step("withdraw the vote");
await page.click('button:has-text("Withdraw my vote")');
await page.waitForTimeout(1500);
console.log(
  "vote withdrawn:",
  await page.locator("text=Your vote has been withdrawn.").isVisible(),
);
console.log(
  "no vote pressed:",
  (await page.locator('.vote-options button[aria-pressed="true"]').count()) === 0,
);

// 5. The leaderboard is public.
step("leaderboard");
await page.goto(`${baseUrl}/leaderboard`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1000);
console.log("rows:", await page.locator("tbody tr").count());
console.log("first row:", (await page.locator("tbody tr").first().textContent())?.trim());

await page.screenshot({ path: "var/screenshots/route-detail.png", fullPage: true });
await page.goto(`${baseUrl}/leaderboard`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: "var/screenshots/leaderboard.png", fullPage: true });

await browser.close();

if (problems.length) {
  console.log("\n--- browser problems ---");
  for (const problem of problems) console.log(problem);
  process.exit(1);
}
console.log("\nVoting and leaderboard flows completed without browser errors.");
