/**
 * Browser check of the member dashboard.
 *
 * Covers the three states on separate pages rather than in one: a new member
 * with no climbs, a member with a real record, and the backend failing. Also
 * checks keyboard access, route navigation and horizontal overflow at desktop
 * and mobile widths, and writes screenshots to `var/screenshots`.
 *
 * Usage: node scripts/check-member-dashboard.mjs [baseUrl]
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8090";
const stamp = Date.now();
const email = `dashboard-${stamp}@example.com`;
const password = "a-long-enough-password";
const memberEmail = "alex@example.com";
const memberPassword = "customer-demo-password";
const shots = "var/screenshots";

await mkdir(shots, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const problems = [];
let expectingFailedRequest = false;
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() === "error" && !expectingFailedRequest) {
    problems.push(`console: ${message.text().slice(0, 200)}`);
  }
});

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function noHorizontalOverflow(label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check(`${label}: no horizontal overflow`, overflow <= 1, `${overflow}px`);
}

async function signIn(address, secret) {
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.click('button[role="tab"]:has-text("Sign in")');
  await page.fill('form.auth-form input[name="email"]', address);
  await page.fill('form.auth-form input[name="password"]', secret);
  await page.click('form.auth-form button[type="submit"]');
  await page.waitForURL("**/member", { timeout: 30_000 });
  await page.waitForTimeout(1200);
}

async function signOut() {
  await page.click('button:has-text("Sign out")');
  await page.waitForTimeout(900);
}

try {
  /* 1. Anonymous ---------------------------------------------------------- */
  console.log("\n--- anonymous ---");
  await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(600);
  check(
    "asks a visitor to sign in",
    await page.locator("text=Sign in to see your statistics").isVisible(),
  );
  check("shows no metric cards", (await page.locator(".metric").count()) === 0);

  /* 2. A new member with no activity ------------------------------------- */
  console.log("\n--- new member, no activity ---");
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.click('button[role="tab"]:has-text("Create an account")');
  await page.fill('form.auth-form input[name="full_name"]', "Dashboard Check");
  await page.fill('form.auth-form input[name="email"]', email);
  await page.fill('form.auth-form input[name="password"]', password);
  await page.click('form.auth-form button[type="submit"]');
  await page.waitForURL("**/member", { timeout: 30_000 });
  await page.waitForTimeout(1500);

  check(
    "welcomes the member instead of showing zeroes",
    await page.locator("text=ready for its first line").isVisible(),
  );
  check("invents no metric cards", (await page.locator(".metric").count()) === 0);
  check(
    "offers the log-an-attempt action",
    (await page.getByRole("button", { name: /Log an attempt/ }).count()) > 0,
  );
  check(
    "offers the route directory",
    (await page.getByRole("link", { name: /Browse the routes/ }).count()) > 0,
  );
  check(
    "does not mistake the empty record for a failure",
    !(await page.locator("text=could not be loaded").isVisible()),
  );
  await noHorizontalOverflow("empty, desktop");
  await page.screenshot({ path: `${shots}/member-dashboard-empty-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await noHorizontalOverflow("empty, mobile");
  await page.screenshot({ path: `${shots}/member-dashboard-empty-mobile.png`, fullPage: true });

  /* 3. The new member logs one climb and the dashboard fills in ----------- */
  console.log("\n--- first climb appears on the dashboard ---");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/member/logbook`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1000);
  await page.click('button:has-text("Log a climb")');
  await page.waitForTimeout(500);
  await page.selectOption('select[name="route"]', { index: 0 });
  await page.fill('input[name="date"]', "2026-10-21");
  await page.fill('input[name="attempts"]', "1");
  await page.selectOption('select[name="result"]', "Sent");
  await page.click('.log-modal button[type="submit"]');
  await page.waitForTimeout(1800);

  await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  check(
    "the logged climb replaces the welcome state",
    (await page.locator(".dashboard-metrics .metric").count()) === 6 &&
      !(await page.locator("text=ready for its first line").isVisible()),
  );
  check("the climb is the recent attempt", (await page.locator(".attempt-list li").count()) === 1);
  check(
    "a first-try send is marked as a flash",
    (await page.locator(".attempt-list .fresh-tag").count()) === 1,
  );
  const attemptLink = page.locator(".attempt-list a").first();
  check(
    "the attempt links to its route",
    (await attemptLink.count()) === 1,
    (await attemptLink.innerText().catch(() => "")).trim(),
  );
  await page.screenshot({
    path: `${shots}/member-dashboard-first-climb.png`,
    fullPage: true,
  });
  if ((await attemptLink.count()) === 1) {
    const name = (await attemptLink.innerText()).trim();
    await attemptLink.click();
    await page.waitForURL("**/routes/**", { timeout: 20_000 });
    check("the attempt opens its route page", page.url().includes("/routes/"), name);
  }

  /* 4. A member with a longer record ------------------------------------- */
  console.log("\n--- member with activity ---");
  await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);
  await signOut();
  await signIn(memberEmail, memberPassword);

  check(
    "shows six headline figures",
    (await page.locator(".dashboard-metrics .metric").count()) === 6,
  );
  for (const label of ["On the wall", "Sends", "Flashes", "Projects", "Best grade", "Sessions"]) {
    const card = page.locator(".dashboard-metrics .metric", { hasText: label });
    check(
      `headline figure: ${label}`,
      (await card.count()) === 1 && (await card.locator("small").innerText()).length > 0,
    );
  }

  check("shows the outcome distribution", (await page.locator(".outcome-row").count()) === 3);
  check(
    "states that flashes are inside sends",
    await page.locator("text=flashes sit inside your sends").isVisible(),
  );
  check("shows statistics by grade", (await page.locator(".grade-row").count()) > 0);
  check("shows the rank", await page.locator(".rank-grid", { hasText: "Your rank" }).isVisible());
  check(
    "states the scoring rule sent by the API",
    await page.locator("text=Sends only. A logged send is worth one point").isVisible(),
  );
  check(
    "states the percentile rule sent by the API",
    await page.locator("text=share of ranked climbers").isVisible(),
  );
  check("shows recent attempts", (await page.locator(".attempt-list li").count()) > 0);
  await noHorizontalOverflow("populated, desktop");
  await page.screenshot({ path: `${shots}/member-dashboard-desktop.png`, fullPage: true });

  const logAttempt = page.getByRole("button", { name: /Log an attempt/ }).first();
  await logAttempt.focus();
  check(
    "log-an-attempt takes keyboard focus",
    await logAttempt.evaluate((element) => element === document.activeElement),
  );
  await page.keyboard.press("Enter");
  const logDialog = page.getByRole("dialog", { name: "Log a climb" });
  await logDialog.waitFor({ state: "visible", timeout: 20_000 });
  check("log-an-attempt opens the log form", await logDialog.isVisible());
  await page.getByRole("button", { name: "Close log form" }).click();

  await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await noHorizontalOverflow("populated, mobile");
  await page.screenshot({ path: `${shots}/member-dashboard-mobile.png`, fullPage: true });

  /* 5. The backend failing ------------------------------------------------ */
  console.log("\n--- dashboard unavailable ---");
  await page.setViewportSize({ width: 1440, height: 900 });
  expectingFailedRequest = true;
  await page.route("**/api/me/dashboard*", (route) => route.abort());
  await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);

  check(
    "says the record could not be loaded",
    await page.locator("text=Your climbing record could not be loaded.").isVisible(),
  );
  check("offers a retry", (await page.getByRole("button", { name: /Try again/ }).count()) > 0);
  check(
    "does not present the failure as an empty history",
    !(await page.locator("text=ready for its first line").isVisible()),
  );
  await page.screenshot({ path: `${shots}/member-dashboard-unavailable.png`, fullPage: true });

  await page.unroute("**/api/me/dashboard*");
  expectingFailedRequest = false;
  await page.getByRole("button", { name: /Try again/ }).click();
  await page.waitForTimeout(2000);
  check(
    "retry loads the real dashboard",
    (await page.locator(".dashboard-metrics .metric").count()) === 6,
  );
} finally {
  await browser.close();
}

if (problems.length) {
  console.log("\n--- browser problems ---");
  for (const problem of problems) console.log(problem);
}

if (failures > 0 || problems.length > 0) {
  console.log(`\n${failures} check(s) failed, ${problems.length} browser problem(s).`);
  process.exit(1);
}
console.log("\nMember dashboard checks completed without browser errors.");
