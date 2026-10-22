/**
 * Browser check of the route-setting editor.
 *
 * It draws three holds with real pointer clicks, puts them in order, saves,
 * reloads, checks that the draft is invisible to the public API, then
 * publishes as an administrator and checks the published API. A second pass
 * at phone width checks layout, selection and delete.
 *
 * Usage: node scripts/check-route-setting.mjs [webUrl] [apiUrl]
 *
 * This writes demo annotations to the development database. It is meant for
 * seeded demo content only, never real customer data.
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8090";
const apiUrl = process.argv[3] ?? "http://localhost:8000";
const ROUTE_ID = 1;
const WALL_ID = 3;

const ACCOUNTS = {
  customer: ["alex@example.com", "customer-demo-password"],
  staff: ["staff@example.com", "staff-demo-password"],
  admin: ["admin@example.com", "admin-demo-password"],
};

const screenshots = "var/screenshots";
const problems = [];
const results = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) problems.push(name);
}

async function signIn(page, which) {
  const [email, password] = ACCOUNTS[which];
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/member", { timeout: 30_000 });
  await page.waitForTimeout(600);
}

async function openEditor(page) {
  await page.goto(`${baseUrl}/staff/route-setting`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.locator(".route-setting-toolbar").waitFor({ timeout: 30_000 });
}

async function chooseWallAndRoute(page) {
  await page.locator(".route-setting-toolbar select").nth(0).selectOption(String(WALL_ID));
  await page.waitForFunction(
    (routeId) =>
      Array.from(document.querySelectorAll(".route-setting-toolbar select")[1]?.options ?? []).some(
        (option) => option.value === String(routeId),
      ),
    ROUTE_ID,
    { timeout: 20_000 },
  );
  await page.locator(".route-setting-toolbar select").nth(1).selectOption(String(ROUTE_ID));
  await page.getByRole("button", { name: "Save draft" }).waitFor({ timeout: 20_000 });
}

async function publicHolds() {
  const response = await fetch(`${apiUrl}/api/public/routes/${ROUTE_ID}/holds`);
  return response.json();
}

function track(page) {
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`);
  });
}

const browser = await chromium.launch();

/* -------------------------------------------------------------------------- */
/* Desktop: staff draws and saves a draft                                     */
/* -------------------------------------------------------------------------- */

const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const staffPage = await staffContext.newPage();
track(staffPage);

console.log("\n--- staff editor at 1440x900 ---");
await signIn(staffPage, "staff");
await openEditor(staffPage);
check(
  "route-setting is reachable from the staff navigation",
  await staffPage
    .locator('nav[aria-label="Staff navigation"] a:has-text("Route setting")')
    .isVisible(),
);

await chooseWallAndRoute(staffPage);
await staffPage.getByText("No holds assigned yet.").waitFor({ timeout: 20_000 });

const before = await publicHolds();
check("no published overlay exists before the work", before.published === false);

const canvas = staffPage.locator('[data-testid="hold-canvas"]');
await canvas.waitFor();
const box = await canvas.boundingBox();
if (!box) throw new Error("The canvas has no bounding box");

const positions = [
  [0.35, 0.5],
  [0.5, 0.5],
  [0.65, 0.5],
];
for (const [x, y] of positions) {
  const existing = await staffPage.locator(".wall-hold-list button").count();
  await staffPage.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await staffPage.waitForFunction(
    (count) => document.querySelectorAll(".wall-hold-list button").length > count,
    existing,
    { timeout: 15_000 },
  );
}
check(
  "three clicks created three hold boxes",
  (await staffPage.locator(".wall-hold-list button").count()) === 3,
);
check(
  "unassigned holds have no step number yet",
  (await staffPage.locator(".hold-badge").count()) === 0,
);

for (let index = 0; index < 3; index += 1) {
  await staffPage.locator(".wall-hold-list button").nth(index).click();
  await staffPage.getByRole("button", { name: /Add Hold \d+ to the route/ }).click();
  await staffPage.waitForFunction(
    (count) => document.querySelectorAll("li.hold-step").length === count,
    index + 1,
    { timeout: 10_000 },
  );
}
check(
  "the route lists the three holds in order",
  (await staffPage.locator("li.hold-step").count()) === 3,
);
check("the first hold is the start", (await staffPage.locator("li.hold-step-start").count()) === 1);
check(
  "the middle hold is a middle",
  (await staffPage.locator("li.hold-step-middle").count()) === 1,
);
check(
  "the last hold is the finish",
  (await staffPage.locator("li.hold-step-finish").count()) === 1,
);
check("the canvas labels the three steps", (await staffPage.locator(".hold-badge").count()) === 3);

await staffPage.screenshot({
  path: `${screenshots}/route-setting-desktop-draft.png`,
  fullPage: true,
});

await staffPage.getByRole("button", { name: "Save draft" }).click();
await staffPage.getByText(/Draft saved\. Members still see/).waitFor({ timeout: 20_000 });
check("the draft save is confirmed on screen", true);
check(
  "staff are told publication is an administrator action",
  await staffPage.getByText("An administrator publishes the sequence.").isVisible(),
);
check(
  "no publish button is offered to staff",
  (await staffPage.getByRole("button", { name: "Publish to members" }).count()) === 0,
);

const afterDraft = await publicHolds();
check(
  "the draft is not exposed by the public API",
  afterDraft.published === false && afterDraft.holds.length === 0,
  `published=${afterDraft.published} holds=${afterDraft.holds.length}`,
);
await staffPage.screenshot({
  path: `${screenshots}/route-setting-desktop-saved.png`,
  fullPage: true,
});

/* -------------------------------------------------------------------------- */
/* Reload: the draft comes back with the same order                           */
/* -------------------------------------------------------------------------- */

console.log("\n--- reload ---");
await staffPage.reload({ waitUntil: "networkidle", timeout: 60_000 });
await staffPage.locator(".route-setting-toolbar").waitFor({ timeout: 30_000 });
await chooseWallAndRoute(staffPage);
await staffPage.getByText("Step 3 · Finish").waitFor({ timeout: 20_000 });
check(
  "the saved sequence survives a reload",
  (await staffPage.locator("li.hold-step").count()) === 3,
);
check(
  "roles survive a reload",
  (await staffPage.locator("li.hold-step-start").count()) === 1 &&
    (await staffPage.locator("li.hold-step-middle").count()) === 1 &&
    (await staffPage.locator("li.hold-step-finish").count()) === 1,
);
check(
  "the reloaded boxes are still on the canvas",
  (await staffPage.locator('[data-testid="hold-canvas"] [data-hold-id]').count()) === 3,
);

await staffContext.close();

/* -------------------------------------------------------------------------- */
/* Desktop: administrator publishes                                           */
/* -------------------------------------------------------------------------- */

console.log("\n--- administrator publishes at 1440x900 ---");
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const adminPage = await adminContext.newPage();
track(adminPage);
await signIn(adminPage, "admin");
await openEditor(adminPage);
await chooseWallAndRoute(adminPage);
await adminPage.getByText("Step 3 · Finish").waitFor({ timeout: 20_000 });
const publishButton = adminPage.getByRole("button", { name: "Publish to members" });
check("the administrator sees an enabled publish action", await publishButton.isEnabled());
await publishButton.click();
await adminPage.getByText(/Published\. Members now see this sequence/).waitFor({ timeout: 20_000 });
check("publication is confirmed on screen", true);
check(
  "the status panel now says Published",
  (await adminPage.locator(".route-setting-state").innerText()).toLowerCase().includes("published"),
);
const afterPublish = await publicHolds();
check(
  "the published sequence is readable from the public API",
  afterPublish.published === true && afterPublish.holds.length === 3,
  `published=${afterPublish.published} holds=${afterPublish.holds.length}`,
);
check(
  "published holds carry start and finish roles",
  afterPublish.holds[0]?.role === "start" && afterPublish.holds.at(-1)?.role === "finish",
);
await adminPage.screenshot({
  path: `${screenshots}/route-setting-desktop-published.png`,
  fullPage: true,
});
await adminContext.close();

/* -------------------------------------------------------------------------- */
/* Phone: layout, selection and delete                                        */
/* -------------------------------------------------------------------------- */

console.log("\n--- administrator editor at 390x844 ---");
const phoneContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const phonePage = await phoneContext.newPage();
track(phonePage);
await signIn(phonePage, "admin");
await openEditor(phonePage);
await chooseWallAndRoute(phonePage);
await phonePage.getByText("Step 3 · Finish").waitFor({ timeout: 20_000 });

const overflow = await phonePage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check("the phone layout has no horizontal overflow", overflow <= 1, `${overflow}px`);
// Create a temporary box by tapping, then delete it; it is not in the route.
// Bring the canvas back into view first: selecting a hold in the side list
// scrolls the page, and Playwright taps viewport coordinates.
await phonePage.locator('[data-testid="hold-canvas"]').scrollIntoViewIfNeeded();
const phoneCanvas = await phonePage.locator('[data-testid="hold-canvas"]').boundingBox();
check(
  "the canvas fits the phone width",
  Boolean(phoneCanvas && phoneCanvas.width <= 390),
  phoneCanvas ? `${Math.round(phoneCanvas.width)}px` : "missing",
);

// Tap a box to select it: the corner handles are the mobile resize affordance.
await phonePage.locator("[data-hold-id]").first().tap();
check(
  "a tap selects a hold and shows resize handles",
  (await phonePage.locator(".hold-handle").count()) === 4,
);

const countBefore = await phonePage.locator(".wall-hold-list button").count();
if (!phoneCanvas) throw new Error("The phone canvas has no bounding box");
await phonePage.touchscreen.tap(
  phoneCanvas.x + phoneCanvas.width * 0.5,
  phoneCanvas.y + phoneCanvas.height * 0.25,
);
await phonePage.waitForFunction(
  (count) => document.querySelectorAll(".wall-hold-list button").length > count,
  countBefore,
  { timeout: 15_000 },
);
check(
  "a tap creates a box at phone width",
  (await phonePage.locator(".wall-hold-list button").count()) === countBefore + 1,
);
await phonePage.getByRole("button", { name: "Delete box" }).click();
await phonePage.waitForFunction(
  (count) => document.querySelectorAll(".wall-hold-list button").length === count,
  countBefore,
  { timeout: 15_000 },
);
check("the temporary box can be deleted", true);

await phonePage.screenshot({
  path: `${screenshots}/route-setting-mobile.png`,
  fullPage: true,
});
await phoneContext.close();

/* -------------------------------------------------------------------------- */
/* Member: the staff editor is not their page                                 */
/* -------------------------------------------------------------------------- */

console.log("\n--- member is refused ---");
const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const memberPage = await memberContext.newPage();
track(memberPage);
await signIn(memberPage, "customer");
await memberPage.goto(`${baseUrl}/staff/route-setting`, {
  waitUntil: "networkidle",
  timeout: 60_000,
});
await memberPage.waitForTimeout(800);
check(
  "a member cannot open the route-setting editor",
  await memberPage.getByText("You need a staff or administrator account to see this").isVisible(),
);
await memberPage.screenshot({
  path: `${screenshots}/route-setting-member-denied.png`,
  fullPage: true,
});
await memberContext.close();

await browser.close();

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (problems.length > 0) {
  console.error("\nProblems:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
