/**
 * Read-only regression pass over the member experience.
 *
 * It signs in as the demo member and visits the dashboard, logbook, progress,
 * published route, beta and leaderboard. It deliberately never presses a vote,
 * log or delete control, so the demo achievements and votes stay untouched.
 *
 * Usage: node scripts/check-member-regression.mjs [baseUrl]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8090";
const problems = [];
const results = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) problems.push(name);
}

function track(page) {
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console: ${message.text().slice(0, 200)}`);
    }
  });
}

async function signIn(page) {
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill('input[name="email"]', "alex@example.com");
  await page.fill('input[name="password"]', "customer-demo-password");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/member", { timeout: 30_000 });
  await page.waitForTimeout(500);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
track(page);
await signIn(page);

console.log("\n--- dashboard ---");
await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
await page.getByRole("heading", { level: 1, name: "Your climbing space." }).waitFor({
  timeout: 20_000,
});
check("the dashboard loads the member's own data", true);
check(
  "the dashboard still shows the outcome and recent-attempt sections",
  (await page.getByText("How your climbing went").isVisible()) &&
    (await page.getByText("Your recent attempts").isVisible()),
);
check(
  "the dashboard metrics are populated",
  (await page.locator(".metric").count()) >= 3,
  `${await page.locator(".metric").count()} metrics`,
);
check(
  "the dashboard still offers logging without opening it",
  await page.getByRole("button", { name: "Log an attempt" }).isVisible(),
);
await page.screenshot({ path: "var/screenshots/regression-member-dashboard.png", fullPage: true });

console.log("\n--- logbook ---");
await page.goto(`${baseUrl}/member/logbook`, { waitUntil: "networkidle", timeout: 60_000 });
await page.getByRole("heading", { level: 1, name: "Every attempt counts." }).waitFor({
  timeout: 20_000,
});
const logbookRows = await page.locator("table tbody tr").count();
check("the demo logbook still has its recorded climbs", logbookRows > 0, `${logbookRows} rows`);
check(
  "the logbook still offers a new entry",
  await page.getByRole("button", { name: "Log a climb" }).isVisible(),
);
await page.screenshot({ path: "var/screenshots/regression-member-logbook.png", fullPage: true });

console.log("\n--- progress ---");
await page.goto(`${baseUrl}/member/progress`, { waitUntil: "networkidle", timeout: 60_000 });
await page.getByRole("heading", { level: 1, name: "Look how far you’ve come." }).waitFor({
  timeout: 20_000,
});
check("the progress page loads the existing record", true);
check(
  "the progress page is not in its empty state",
  (await page.getByText("Nothing logged yet.").count()) === 0,
);

console.log("\n--- published route with the new overlay ---");
await page.goto(`${baseUrl}/routes/1`, { waitUntil: "networkidle", timeout: 60_000 });
await page.getByRole("heading", { level: 2, name: "The setter's line." }).waitFor({
  timeout: 20_000,
});
check("the signed-in route page shows the published overlay", true);
check("the overlay boxes are present", (await page.locator(".route-hold-box").count()) === 3);
check(
  "voting is still available to the signed-in member",
  (await page.getByRole("button", { name: "Easier" }).isVisible()) &&
    (await page.getByRole("button", { name: "As set" }).isVisible()) &&
    (await page.getByRole("button", { name: "Harder" }).isVisible()),
);
check(
  "logging from the route is still available",
  await page.getByRole("button", { name: /Log this climb/ }).isVisible(),
);
await page.screenshot({ path: "var/screenshots/regression-member-route.png", fullPage: true });

console.log("\n--- beta navigation ---");
await page.getByRole("link", { name: /Explore beta/ }).click();
await page.waitForURL("**/member/beta**", { timeout: 20_000 });
await page.getByRole("heading", { level: 1, name: "A different way to see the move." }).waitFor({
  timeout: 20_000,
});
const betaRoute = await page.locator(".beta-select select").inputValue();
check(
  "the route's beta link still preselects the route",
  page.url().includes("/member/beta") && betaRoute === "1",
  `route=${betaRoute}`,
);

console.log("\n--- leaderboard ---");
await page.goto(`${baseUrl}/leaderboard`, { waitUntil: "networkidle", timeout: 60_000 });
await page.getByRole("heading", { level: 1, name: "Who has been sending what." }).waitFor({
  timeout: 20_000,
});
const leaderboardRows = await page.locator("table tbody tr").count();
check(
  "the leaderboard still lists the demo climbers",
  leaderboardRows > 0,
  `${leaderboardRows} rows`,
);
check(
  "the ranking explanation is still shown",
  await page.getByRole("heading", { name: "How the ranking works" }).isVisible(),
);
await page.screenshot({ path: "var/screenshots/regression-leaderboard.png", fullPage: true });

await context.close();

/* -------------------------------------------------------------------------- */
/* Phone                                                                      */
/* -------------------------------------------------------------------------- */

console.log("\n--- phone member regression ---");
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const phonePage = await phone.newPage();
track(phonePage);
await signIn(phonePage);
const overflow = await phonePage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check("the phone dashboard has no horizontal overflow", overflow <= 1, `${overflow}px`);
check(
  "the phone dashboard still shows its metrics",
  (await phonePage.locator(".metric").count()) >= 3,
);
await phonePage.goto(`${baseUrl}/routes/1`, { waitUntil: "networkidle", timeout: 60_000 });
await phonePage.getByRole("heading", { level: 2, name: "The setter's line." }).waitFor({
  timeout: 20_000,
});
const phoneOverflow = await phonePage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check("the phone route page has no horizontal overflow", phoneOverflow <= 1, `${phoneOverflow}px`);
check(
  "the phone route page shows the published boxes",
  (await phonePage.locator(".route-hold-box").count()) === 3,
);
await phonePage.screenshot({
  path: "var/screenshots/regression-member-mobile.png",
  fullPage: true,
});
await phone.close();

await browser.close();

console.log(`\n${results.filter((result) => result.ok).length}/${results.length} checks passed`);
if (problems.length > 0) {
  console.error("\nProblems:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
