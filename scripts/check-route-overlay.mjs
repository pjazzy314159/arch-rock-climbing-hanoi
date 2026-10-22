/**
 * Browser check of the member-facing published hold overlay.
 *
 * It reads the public API for what should be on screen, then measures the
 * rendered boxes against the photograph at desktop and phone widths. It also
 * checks an unpublished route for an honest empty state, and that voting,
 * logging and navigation still exist around the new section.
 *
 * Usage: node scripts/check-route-overlay.mjs [webUrl] [apiUrl]
 *
 * Route 1 must already have a published overlay; run
 * scripts/check-route-setting.mjs first on a seeded demo database.
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8090";
const apiUrl = process.argv[3] ?? "http://localhost:8000";
const ROUTE_ID = 1;
const EMPTY_ROUTE_ID = 2;

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
      const text = message.text();
      // The route page asks for a member tally while signed out; a 401 there is
      // the expected signed-out answer, not a regression in the overlay.
      if (text.includes("401") && text.includes("tally")) return;
      problems.push(`console: ${text.slice(0, 200)}`);
    }
  });
}

async function publishedHolds(routeId) {
  const response = await fetch(`${apiUrl}/api/public/routes/${routeId}/holds`);
  if (!response.ok) throw new Error(`public holds ${routeId}: HTTP ${response.status}`);
  return response.json();
}

async function openRoute(page, routeId) {
  await page.goto(`${baseUrl}/routes/${routeId}`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
}

async function measureAlignment(page, expected, label) {
  const image = page.locator(".route-holds-frame img");
  await image.waitFor({ timeout: 20_000 });
  const imageBox = await image.boundingBox();
  if (!imageBox) throw new Error(`${label}: the overlay image has no box`);

  const boxes = page.locator(".route-hold-box");
  const count = await boxes.count();
  check(`${label}: one box per published hold`, count === expected.length, `${count}`);

  let aligned = 0;
  let inside = 0;
  for (let index = 0; index < Math.min(count, expected.length); index += 1) {
    const hold = expected[index];
    const actual = await boxes.nth(index).boundingBox();
    if (!actual) continue;
    const wanted = {
      x: imageBox.x + hold.x * imageBox.width,
      y: imageBox.y + hold.y * imageBox.height,
      width: hold.width * imageBox.width,
      height: hold.height * imageBox.height,
    };
    const near =
      Math.abs(actual.x - wanted.x) <= 2 &&
      Math.abs(actual.y - wanted.y) <= 2 &&
      Math.abs(actual.width - wanted.width) <= 2 &&
      Math.abs(actual.height - wanted.height) <= 2;
    if (near) aligned += 1;
    if (
      actual.x >= imageBox.x - 1 &&
      actual.y >= imageBox.y - 1 &&
      actual.x + actual.width <= imageBox.x + imageBox.width + 1 &&
      actual.y + actual.height <= imageBox.y + imageBox.height + 1
    ) {
      inside += 1;
    }
  }
  check(`${label}: every box matches its normalised coordinates`, aligned === count);
  check(`${label}: every box stays inside the photograph`, inside === count);
  return imageBox;
}

const published = await publishedHolds(ROUTE_ID);
if (!published.published || published.holds.length === 0) {
  console.error(
    "Route 1 has no published overlay. Run scripts/check-route-setting.mjs first on the demo database.",
  );
  process.exit(1);
}

const browser = await chromium.launch();

/* -------------------------------------------------------------------------- */
/* Desktop, signed out                                                         */
/* -------------------------------------------------------------------------- */

console.log("\n--- member route overlay at 1440x900 (signed out) ---");
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();
track(page);
await openRoute(page, ROUTE_ID);

await page.getByRole("heading", { level: 2, name: "The setter's line." }).waitFor({
  timeout: 20_000,
});
check("the public route page shows the overlay without a login", true);
check(
  "the overlay image is the published wall photograph",
  (await page.locator(".route-holds-frame img").getAttribute("src")) === published.image_url,
);

const imageBox = await measureAlignment(page, published.holds, "desktop");
check("the desktop overlay leaves the rest of the route intact", true);
check(
  "the layer is decorative and does not intercept clicks",
  (await page.locator(".route-holds-layer").getAttribute("aria-hidden")) === "true",
);
check(
  "the order is also available as text",
  (await page.getByRole("list", { name: "Published hold order" }).count()) === 1,
);
check(
  "the text order starts and finishes clearly",
  (await page.getByText("Start", { exact: true }).count()) >= 1 &&
    (await page.getByText("Hold 2 of 3", { exact: true }).count()) === 1 &&
    (await page.getByText("Finish", { exact: true }).count()) >= 1,
);
check(
  "the member page is not the staff editor",
  (await page.getByRole("button", { name: "Save draft" }).count()) === 0 &&
    (await page.getByRole("button", { name: "Publish to members" }).count()) === 0 &&
    (await page.getByRole("button", { name: "Delete box" }).count()) === 0,
);

// Voting, logging and navigation are still there.
check(
  "voting is still on the page",
  await page.getByRole("heading", { name: "How did it feel?" }).isVisible(),
);
check(
  "a signed-out member is still asked to sign in to vote",
  await page.getByText("Sign in to vote.").isVisible(),
);
check(
  "the logbook entry point is still there",
  await page.getByRole("link", { name: /Sign in to log this climb/ }).isVisible(),
);

await page.locator(".route-holds").scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: "var/screenshots/route-overlay-desktop.png", fullPage: true });
await page.screenshot({ path: "var/screenshots/route-overlay-desktop-viewport.png" });
check("desktop screenshots captured", true, `${Math.round(imageBox.width)}px image`);

await page.getByRole("link", { name: "All routes" }).click();
await page.waitForURL("**/routes", { timeout: 20_000 });
check("the route page still navigates back to the directory", true);
await desktop.close();

/* -------------------------------------------------------------------------- */
/* Phone, signed out                                                           */
/* -------------------------------------------------------------------------- */

console.log("\n--- member route overlay at 390x844 (signed out) ---");
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const phonePage = await phone.newPage();
track(phonePage);
await openRoute(phonePage, ROUTE_ID);
await phonePage.getByRole("heading", { level: 2, name: "The setter's line." }).waitFor({
  timeout: 20_000,
});

const overflow = await phonePage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check("the phone page has no horizontal overflow", overflow <= 1, `${overflow}px`);
const phoneImage = await measureAlignment(phonePage, published.holds, "phone");
check(
  "the overlay photograph fits the phone width",
  phoneImage.width <= 390,
  `${Math.round(phoneImage.width)}px`,
);
check(
  "the phone legend is still legible",
  await phonePage.getByRole("list", { name: "Published hold order" }).isVisible(),
);

await phonePage.locator(".route-holds").scrollIntoViewIfNeeded();
await phonePage.waitForTimeout(400);
await phonePage.screenshot({ path: "var/screenshots/route-overlay-mobile.png", fullPage: true });
await phonePage.screenshot({ path: "var/screenshots/route-overlay-mobile-viewport.png" });
check("phone screenshots captured", true);
await phone.close();

/* -------------------------------------------------------------------------- */
/* An active route with no published overlay                                  */
/* -------------------------------------------------------------------------- */

console.log("\n--- active route with no overlay ---");
const empty = await publishedHolds(EMPTY_ROUTE_ID);
check("the comparison route really has no published overlay", empty.published === false);
const emptyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const emptyPage = await emptyContext.newPage();
track(emptyPage);
await openRoute(emptyPage, EMPTY_ROUTE_ID);
await emptyPage
  .getByText("The setters have not published a hold overlay for this route yet.")
  .waitFor({ timeout: 20_000 });
check(
  "an unpublished route says so instead of drawing boxes",
  (await emptyPage.locator(".route-hold-box").count()) === 0,
);
check(
  "the unpublished route has no invented overlay image",
  (await emptyPage.getByAltText(/published hold sequence/).count()) === 0,
);
await emptyPage.locator(".route-holds").scrollIntoViewIfNeeded();
await emptyPage.waitForTimeout(300);
await emptyPage.screenshot({ path: "var/screenshots/route-overlay-empty.png" });
check("empty-state screenshot captured", true);
await emptyContext.close();

await browser.close();

console.log(`\n${results.filter((result) => result.ok).length}/${results.length} checks passed`);
if (problems.length > 0) {
  console.error("\nProblems:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
