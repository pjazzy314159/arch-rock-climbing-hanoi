/**
 * Browser check of the member flows added in tasks 1.6 and 1.7.
 *
 * It signs in as the demo member and does the things a member does:
 *
 *   1. log a climb from the dashboard, then reload and see it counted;
 *   2. open a route and log that route from the route page, then see it in
 *      the logbook;
 *   3. read the scoring explanation on the leaderboard and check it is the
 *      backend's own text;
 *   4. check the dashboard's rank agrees with the public leaderboard;
 *   5. see the leaderboard say the explanation is unavailable when the
 *      endpoint cannot be reached, rather than inventing a rule;
 *   6. check both pages at a phone width.
 *
 * It writes screenshots to `var/screenshots`. It logs real climbs for the demo
 * member, because persistence is one of the things being checked.
 *
 * Usage: node scripts/check-member-flows.mjs [baseUrl]
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8090";
const apiUrl = process.env.ARCH_API_URL ?? "http://localhost:8000";
const shots = "var/screenshots";

await mkdir(shots, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const problems = [];
// The unavailable-explanation check aborts a request on purpose; that one
// console error is expected and is not a problem with the page.
let expectAbort = false;
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (expectAbort && /ERR_FAILED|Failed to load resource/.test(message.text())) return;
  problems.push(`console: ${message.text().slice(0, 200)}`);
});

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function signIn() {
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 20_000 });
  await page.fill('input[name="email"]', "alex@example.com");
  await page.fill('input[name="password"]', "customer-demo-password");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL("**/member", { timeout: 30_000 });
}

/** One numbered metric from the dashboard. */
async function metric(label) {
  const box = page.locator(".metric", { hasText: label }).first();
  if ((await box.count()) === 0) return null;
  return Number((await box.locator("strong").innerText()).trim());
}

async function logbookRows() {
  await page.goto(`${baseUrl}/member/logbook`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(700);
  return page.locator(".table-scroll tbody tr").count();
}

try {
  /* 1. Dashboard logging ------------------------------------------------ */
  console.log("\n--- logging from the dashboard ---");
  await signIn();
  await page.locator(".metric-grid, .dashboard-empty").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${shots}/member-dashboard-desktop.png`, fullPage: true });

  const sendsBefore = await metric("Sends");
  check("the dashboard shows the member's sends", sendsBefore !== null, `${sendsBefore}`);

  const rowsBefore = await logbookRows();
  check("the logbook is readable", rowsBefore >= 0, `${rowsBefore} rows`);

  await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);
  await page
    .getByRole("button", { name: /Log an attempt/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 10_000 });
  check("the log dialog opens from the dashboard", await dialog.isVisible());
  await page.screenshot({ path: `${shots}/log-climb-modal-desktop.png` });

  await page.locator('select[name="route"]').waitFor({ timeout: 20_000 });
  await page.waitForFunction(
    () => {
      const select = document.querySelector('select[name="route"]');
      return select instanceof HTMLSelectElement && select.options.length > 0;
    },
    { timeout: 20_000 },
  );
  await page.locator('select[name="route"]').selectOption({ index: 0 });
  const dashboardRoute = (
    await page
      .locator('select[name="route"]')
      .evaluate((element) => element.options[element.selectedIndex].textContent ?? "")
  )
    .split("·")[0]
    .trim();
  await page.fill('input[name="attempts"]', "1");
  await page.locator('select[name="result"]').selectOption({ label: "Sent" });
  await page.fill('textarea[name="notes"]', "Logged from the dashboard in the browser check.");
  await dialog.getByRole("button", { name: /Save entry/ }).click();

  await page.getByText(/has been added to your logbook/).waitFor({ timeout: 20_000 });
  check("the dashboard confirms the save", true);
  check("the dialog closes after saving", (await page.getByRole("dialog").count()) === 0);

  // Reload: the new climb must come from the backend, not from page state.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const sendsAfter = await metric("Sends");
  check(
    "the saved climb survives a reload",
    sendsBefore !== null && sendsAfter !== null && sendsAfter === sendsBefore + 1,
    `${sendsBefore} -> ${sendsAfter}`,
  );
  await page.screenshot({
    path: `${shots}/member-dashboard-after-log-desktop.png`,
    fullPage: true,
  });

  const rowsAfter = await logbookRows();
  check(
    "the logbook gained exactly one row",
    rowsAfter === rowsBefore + 1,
    `${rowsBefore} -> ${rowsAfter}`,
  );
  check(
    "the new row names the chosen route",
    stringsInPage(await page.locator(".table-scroll tbody").innerText(), dashboardRoute),
    dashboardRoute,
  );

  /* 2. Route-detail logging -------------------------------------------- */
  console.log("\n--- logging from a route page ---");
  await page.goto(`${baseUrl}/routes`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);
  const cards = page.locator(".route-grid .route-card");
  check("routes are listed", (await cards.count()) > 0, `${await cards.count()} cards`);
  // Use the second route so it is a different climb from the dashboard one.
  const card = cards.nth(Math.min(1, (await cards.count()) - 1));
  const routeName = (await card.locator("h3").innerText()).trim();
  await card.click();
  await page.waitForURL("**/routes/**", { timeout: 20_000 });
  await page.waitForTimeout(900);

  check("the route page offers logging", true);
  await page.getByRole("button", { name: /Log this climb/ }).click();
  await page.getByRole("dialog").waitFor({ timeout: 10_000 });
  const preset = page.locator(".preset-route");
  check("the dialog opens pre-filled with this route", await preset.isVisible());
  check(
    "the pre-filled route is the one on the page",
    stringsInPage(await preset.innerText(), routeName),
    routeName,
  );
  await page.screenshot({ path: `${shots}/log-climb-from-route-desktop.png` });

  await page.locator('input[name="attempts"]').fill("2");
  await page.locator('select[name="result"]').selectOption({ label: "Project" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Save entry/ })
    .click();
  await page.getByText(/has been added to your logbook/).waitFor({ timeout: 20_000 });
  check("the route page confirms the save", true);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const rowsAfterRoute = await logbookRows();
  check(
    "the route climb is in the logbook after a reload",
    rowsAfterRoute === rowsAfter + 1,
    `${rowsAfter} -> ${rowsAfterRoute}`,
  );
  check(
    "the logbook row names that route",
    stringsInPage(await page.locator(".table-scroll tbody").innerText(), routeName),
    routeName,
  );

  /* 3. The leaderboard's explanation ----------------------------------- */
  console.log("\n--- the leaderboard explanation ---");
  const rules = await (await fetch(`${apiUrl}/api/public/leaderboard/rules`)).json();
  await page.goto(`${baseUrl}/leaderboard`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator(".rules-panel").waitFor({ timeout: 20_000 });
  const panelText = await page.locator(".rules-panel").innerText();
  check(
    "the leaderboard shows the scoring rule the backend publishes",
    stringsInPage(panelText, rules.scoring_rule),
    rules.scoring_rule.slice(0, 60) + "…",
  );
  check(
    "the leaderboard shows the percentile rule the backend publishes",
    stringsInPage(panelText, rules.percentile_rule),
    rules.percentile_rule.slice(0, 60) + "…",
  );
  await page.screenshot({ path: `${shots}/leaderboard-desktop.png`, fullPage: true });

  /* 4. Rank agreement --------------------------------------------------- */
  console.log("\n--- dashboard rank vs public leaderboard ---");
  const token = await page.evaluate(() => localStorage.getItem("arch.access_token"));
  const me = await (
    await fetch(`${apiUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  ).json();

  const leaderboardRows = page.locator("table tbody tr");
  let publicRank = null;
  const rowCount = await leaderboardRows.count();
  for (let i = 0; i < rowCount; i += 1) {
    const row = leaderboardRows.nth(i);
    const name = (await row.locator("strong").innerText()).trim();
    if (name === me.full_name) {
      const digits = (await row.locator("td").first().innerText()).replace(/\D/g, "");
      // The first place is shown with a trophy instead of "#1".
      publicRank = digits === "" ? 1 : Number(digits);
      break;
    }
  }

  await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);
  const rankCard = page.locator(".rank-grid");
  const ranked = (await rankCard.count()) > 0;
  check("the dashboard states a rank for a climber with sends", ranked);
  if (ranked) {
    const dashboardRank = Number(
      (await rankCard.locator("strong").first().innerText()).replace(/\D/g, ""),
    );
    check(
      "the dashboard rank matches the public leaderboard",
      dashboardRank === publicRank,
      `dashboard #${dashboardRank}, leaderboard #${publicRank} (${me.full_name})`,
    );
  }

  // Nobody without a send is on the leaderboard, which is what the rule says.
  const publicEntries = await (await fetch(`${apiUrl}/api/me/leaderboard`)).json();
  check(
    "the public leaderboard lists no climber without sends",
    publicEntries.every((entry) => entry.total_sends > 0),
    `${publicEntries.length} entries`,
  );

  /* 5. The explanation's unavailable state ------------------------------ */
  console.log("\n--- the explanation when it cannot be loaded ---");
  // The aborted request below is the point of this check, so its browser
  // console message is expected. Only that one is silenced; anything else
  // still fails the run.
  expectAbort = true;
  await page.route("**/api/public/leaderboard/rules", (route) => route.abort());
  await page.goto(`${baseUrl}/leaderboard`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByText(/could not be loaded right now/).waitFor({ timeout: 20_000 });
  check("the page says the explanation is unavailable", true);
  check(
    "no rule text is invented when the backend cannot explain it",
    !stringsInPage(await page.locator("main").innerText(), "Ties are broken by"),
  );
  await page.screenshot({
    path: `${shots}/leaderboard-rules-unavailable-desktop.png`,
    fullPage: true,
  });
  await page.unroute("**/api/public/leaderboard/rules");
  expectAbort = false;

  /* 6. On a phone ------------------------------------------------------- */
  console.log("\n--- on a phone ---");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, path] of [
    ["dashboard", "/member"],
    ["logbook", "/member/logbook"],
    ["leaderboard", "/leaderboard"],
  ]) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(900);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(`${name}, mobile: no horizontal overflow`, overflow <= 1, `${overflow}px`);
    await page.screenshot({ path: `${shots}/member-${name}-mobile.png`, fullPage: true });
  }
} finally {
  await browser.close();
}

function stringsInPage(haystack, needle) {
  // Page text can be uppercased by CSS (route titles are); the comparison is
  // about the words, not the typography.
  const normalise = (text) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
  return normalise(haystack).includes(normalise(needle));
}

if (problems.length) {
  console.log("\n--- browser problems ---");
  for (const problem of problems) console.log(problem);
}

if (failures > 0 || problems.length > 0) {
  console.log(`\n${failures} check(s) failed, ${problems.length} browser problem(s).`);
  process.exit(1);
}
console.log("\nMember flow checks completed without browser errors.");
