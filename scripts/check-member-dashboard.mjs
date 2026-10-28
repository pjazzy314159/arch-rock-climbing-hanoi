/**
 * Browser check of the member dashboard.
 *
 * Covers the three states on separate pages rather than in one: a new member
 * with no climbs, a member with a real record, and the backend failing. Also
 * checks keyboard access, route navigation and horizontal overflow at desktop
 * and mobile widths, and writes screenshots to `var/screenshots`.
 *
 * Usage: node scripts/check-member-dashboard.mjs <baseUrl> <apiBaseUrl>
 *
 * Safety: both baseUrl and apiBaseUrl must be loopback URLs. The script
 * intercepts every outgoing request and aborts if an API request targets
 * any origin other than the expected local API origin.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.argv[2];
const apiBaseUrl = process.argv[3] ?? process.env.VITE_API_BASE_URL;

// --- Safety guards (must pass before any browser or mutating action) ---

function isLoopbackUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

if (!baseUrl) {
  console.error("ERROR: Frontend base URL is required.");
  console.error("Usage: node scripts/check-member-dashboard.mjs <baseUrl> <apiBaseUrl>");
  process.exit(1);
}

if (!isLoopbackUrl(baseUrl)) {
  console.error("ERROR: Frontend base URL must be a loopback address (localhost/127.0.0.1).");
  console.error("Got:", baseUrl);
  process.exit(1);
}

if (!apiBaseUrl) {
  console.error("ERROR: API base URL is required (pass as second argument or set VITE_API_BASE_URL).");
  process.exit(1);
}

if (!isLoopbackUrl(apiBaseUrl)) {
  console.error("ERROR: API base URL must be a loopback address (localhost/127.0.0.1).");
  console.error("Got:", apiBaseUrl);
  process.exit(1);
}

const expectedApiOrigin = new URL(apiBaseUrl).origin;
console.log("Frontend:", baseUrl);
console.log("Expected API origin:", expectedApiOrigin);

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

// --- Request origin guard: intercept and abort if any API request targets a non-local origin ---
await page.route("**/*", async (route) => {
  try {
    const parsed = new URL(route.request().url());
    // API requests contain /api/ in the path (covers all API endpoints)
    if (parsed.pathname.includes("/api/")) {
      if (parsed.origin !== expectedApiOrigin) {
        const msg = `FATAL: API request to unexpected origin: ${parsed.origin} (expected ${expectedApiOrigin})`;
        console.error(msg);
        console.error("URL:", route.request().url());
        await route.abort();
        process.exit(1);
        return;
      }
    }
    await route.continue();
  } catch {
    // Ignore non-URL requests (e.g., data: URLs)
    await route.continue();
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
  await page.click('button:has-text("Log a climb")');
  await page.waitForTimeout(400);
  await page.selectOption('select[name="route"]', { index: 0 });
  await page.selectOption('select[name="result"]', "sent");
  await page.fill('input[name="grade"]', "V3");
  await page.fill('input[name="attempts"]', "1");
  await page.click('.log-modal button[type="submit"]');
  await page.waitForTimeout(1500);

  await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);
  check("the logged climb replaces the welcome state", (await page.locator(".metric").count()) > 0);
  check("the climb is the recent attempt", (await page.locator(".recent-attempt").count()) > 0);
  check("a first-try send is marked as a flash", (await page.locator("text=Flash").count()) > 0);
  await page.screenshot({ path: `${shots}/member-dashboard-populated-desktop.png`, fullPage: true });

  /* 4. Populated member (seeded demo account) ----------------------------- */
  console.log("\n--- member with activity ---");
  await signOut();
  await signIn(memberEmail, memberPassword);
  await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);

  check("shows six headline figures", (await page.locator(".metric").count()) === 6);
  for (const label of ["On the wall", "Sends", "Flashes", "Projects", "Best grade", "Sessions"]) {
    check(`headline figure: ${label}`, await page.locator(`.metric:has-text("${label}")`).count() > 0);
  }
  check("shows the outcome distribution", await page.locator("text=Outcome distribution").isVisible());
  check("states that flashes are inside sends", await page.locator("text=inside the sends").isVisible());
  check("shows statistics by grade", await page.locator("text=By grade").isVisible());
  check("shows the rank", await page.locator("text=Ranking").isVisible());
  check("states the scoring rule sent by the API", await page.locator("text=Sends only.").isVisible());
  check("states the percentile rule sent by the API", await page.locator("text=at or behind").isVisible());
  check("shows recent attempts", (await page.locator(".recent-attempt").count()) > 0);
  await noHorizontalOverflow("populated, desktop");
  await page.screenshot({ path: `${shots}/member-dashboard-populated-desktop.png`, fullPage: true });

  // Keyboard check: tab to log-an-attempt and activate with Enter.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  check("log-an-attempt takes keyboard focus", await page.locator(".log-modal").isVisible());
  check("log-an-attempt opens the log form", await page.locator(".log-modal form").isVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await noHorizontalOverflow("populated, mobile");
  await page.screenshot({ path: `${shots}/member-dashboard-populated-mobile.png`, fullPage: true });

  /* 5. Dashboard unavailable ---------------------------------------------- */
  console.log("\n--- dashboard unavailable ---");
  await page.setViewportSize({ width: 1440, height: 900 });
  await signOut();
  await signIn(memberEmail, memberPassword);
  await page.route("**/api/me/dashboard", (route) => route.abort());
  expectingFailedRequest = true;
  await page.goto(`${baseUrl}/member`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1200);
  expectingFailedRequest = false;
  check("says the record could not be loaded", await page.locator("text=could not be loaded").isVisible());
  check("offers a retry", await page.locator('button:has-text("Retry")').isVisible());
  check("does not present the failure as an empty history", !(await page.locator("text=ready for its first line").isVisible()));
  await page.unroute("**/api/me/dashboard");
  await page.click('button:has-text("Retry")');
  await page.waitForTimeout(1200);
  check("retry loads the real dashboard", (await page.locator(".metric").count()) > 0);
  await page.screenshot({ path: `${shots}/member-dashboard-unavailable.png`, fullPage: true });
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? "Member dashboard checks completed without browser errors." : `${failures} check(s) failed.`}`);
if (problems.length) {
  console.log("\n--- browser problems ---");
  for (const problem of problems) console.log(problem);
}
process.exit(failures > 0 || problems.length > 0 ? 1 : 0);
