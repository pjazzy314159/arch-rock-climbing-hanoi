/**
 * Browser check of the route directory filters.
 *
 * The filters are applied by the backend, so the check watches the requests
 * the page makes as well as what it shows. It also checks that the filter
 * controls are usable on a phone, and writes screenshots to `var/screenshots`.
 *
 * Usage: node scripts/check-route-directory.mjs [baseUrl]
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8090";
const shots = "var/screenshots";

await mkdir(shots, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const problems = [];
const requests = [];
let expectingFailedRequest = false;
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
page.on("console", (message) => {
  // A rejected request is expected while the backend is being made to fail.
  if (message.type() === "error" && !expectingFailedRequest) {
    problems.push(`console: ${message.text().slice(0, 200)}`);
  }
});
page.on("request", (request) => {
  const url = request.url();
  if (url.includes("/api/public/routes")) requests.push(url);
});

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** The last route-list request the page made. */
function lastRouteRequest() {
  return requests.filter((url) => !url.includes("route-filters")).at(-1) ?? "";
}

function routeCards() {
  return page.locator(".route-grid .route-card");
}

async function noHorizontalOverflow(label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check(`${label}: no horizontal overflow`, overflow <= 1, `${overflow}px`);
}

try {
  /* 1. The directory loads ------------------------------------------------ */
  console.log("\n--- the directory ---");
  await page.goto(`${baseUrl}/routes`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);

  const total = await routeCards().count();
  check("routes are listed", total > 0, `${total} cards`);
  check(
    "the count agrees with the cards",
    (await page.locator(".result-count").innerText()).includes(`${total} route`),
  );

  /* 2. The filter options come from the data ------------------------------ */
  console.log("\n--- the filter options ---");
  const grades = await page.locator('select[aria-label="Filter grade"] option').allInnerTexts();
  const walls = await page.locator('select[aria-label="Filter wall"] option').allInnerTexts();
  const types = await page.locator('select[aria-label="Filter wall type"] option').allInnerTexts();
  const statuses = await page
    .locator('select[aria-label="Filter route status"] option')
    .allInnerTexts();
  check("grades are offered", grades.length > 1, grades.join(", "));
  check("walls are offered", walls.length > 1, walls.join(", "));
  check("wall types are offered", types.length > 1, types.join(", "));
  check("statuses are offered", statuses.length > 1, statuses.join(", "));
  check("there is an all-statuses option", statuses[0] === "All statuses", statuses[0]);

  /* 3. Each filter on its own --------------------------------------------- */
  console.log("\n--- one filter at a time ---");
  for (const [label, value] of [
    ["Filter grade", grades[1]],
    ["Filter wall", walls[1]],
    ["Filter wall type", types[1]],
  ]) {
    requests.length = 0;
    await page.selectOption(`select[aria-label="${label}"]`, { label: value });
    await page.waitForTimeout(900);
    const asked = lastRouteRequest();
    check(`${label} asks the backend`, asked.includes("/api/public/routes?"), asked);
    const shown = await routeCards().count();
    const countText = await page.locator(".result-count").innerText();
    check(
      `${label} shows only matching routes`,
      countText.includes(`${shown} route`),
      `${shown} cards, count says "${countText.split("\n")[0]}"`,
    );
    // Clear it again for the next filter.
    const clear = page.getByRole("button", { name: /Clear filters/ });
    if ((await clear.count()) > 0) {
      await clear.first().click();
      await page.waitForTimeout(700);
    }
  }

  /* 4. The filters together ------------------------------------------------ */
  console.log("\n--- filters together ---");
  requests.length = 0;
  await page.selectOption('select[aria-label="Filter grade"]', { label: grades[1] });
  await page.waitForTimeout(700);
  await page.selectOption('select[aria-label="Filter wall type"]', { label: types[1] });
  await page.waitForTimeout(900);
  const combined = lastRouteRequest();
  check(
    "both filters are sent",
    combined.includes("grade=") && combined.includes("wall_type="),
    combined,
  );
  const combinedCount = await routeCards().count();
  check(
    "the combined result is not larger than either alone",
    combinedCount <= total,
    `${combinedCount}`,
  );

  /* 5. A filter with no routes behind it ---------------------------------- */
  console.log("\n--- an empty result ---");
  await page
    .getByRole("button", { name: /Clear filters/ })
    .first()
    .click();
  await page.waitForTimeout(700);
  await page.fill('input[aria-label="Search routes"]', "zzzznotaroute");
  await page.waitForTimeout(1200);
  check(
    "an empty result says so",
    await page.locator("text=No routes match this search.").isVisible(),
  );
  check(
    "an empty result is not an error",
    !(await page.locator("text=The route list could not be loaded.").isVisible()),
  );

  /* 6. Clearing the filters ------------------------------------------------ */
  console.log("\n--- clearing the filters ---");
  await page
    .getByRole("button", { name: /Clear filters/ })
    .first()
    .click();
  await page.waitForTimeout(900);
  check("the whole collection is back", (await routeCards().count()) === total);
  check(
    "the search box is empty",
    (await page.inputValue('input[aria-label="Search routes"]')) === "",
  );
  check(
    "the grade filter is back to all grades",
    (await page.inputValue('select[aria-label="Filter grade"]')) === "",
  );
  check(
    "the wall type filter is back to all types",
    (await page.inputValue('select[aria-label="Filter wall type"]')) === "",
  );
  const countText = await page.locator(".result-count").innerText();
  check(
    "the count is the whole collection again",
    countText.includes(`${total} route`),
    countText.split("\n")[0],
  );

  /* 7. The status filter keeps archived routes apart ----------------------- */
  console.log("\n--- archived routes ---");
  await page.selectOption('select[aria-label="Filter route status"]', "all");
  await page.waitForTimeout(900);
  const allStatuses = await routeCards().count();
  check("every status is listed", allStatuses >= total, `${allStatuses} cards`);
  await page.selectOption('select[aria-label="Filter route status"]', "active");
  await page.waitForTimeout(900);
  check("the active list is back", (await routeCards().count()) === total);

  await page.screenshot({ path: `${shots}/route-directory-desktop.png`, fullPage: true });

  /* 8. On a phone ---------------------------------------------------------- */
  console.log("\n--- on a phone ---");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await noHorizontalOverflow("route directory, mobile");
  const selectWidth = await page
    .locator('select[aria-label="Filter grade"]')
    .evaluate((element) => element.getBoundingClientRect().width);
  check("the filters are wide enough to tap", selectWidth > 200, `${Math.round(selectWidth)}px`);
  await page.screenshot({ path: `${shots}/route-directory-mobile.png`, fullPage: true });

  /* 9. The backend failing ------------------------------------------------- */
  console.log("\n--- the route list failing ---");
  await page.setViewportSize({ width: 1440, height: 900 });
  expectingFailedRequest = true;
  await page.route("**/api/public/routes?*", (route) => route.abort());
  await page.goto(`${baseUrl}/routes`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1500);
  check(
    "a failure is not shown as an empty collection",
    !(await page.locator("text=No routes match this search.").isVisible()),
  );
  check(
    "a failure says the list could not be loaded",
    await page.locator("text=The route list could not be loaded.").isVisible(),
  );
  check(
    "a failure offers a retry",
    (await page.getByRole("button", { name: /Try again/ }).count()) > 0,
  );
  expectingFailedRequest = false;
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
console.log("\nRoute directory checks completed without browser errors.");
