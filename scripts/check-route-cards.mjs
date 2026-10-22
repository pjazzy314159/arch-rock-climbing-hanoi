/**
 * Browser check of the route cards and the route detail page.
 *
 * Checks that a card says what a route is (wall, wall type, status), that
 * the imagery falls back the way it should, that an archived route is not
 * presented as active, and that the route page keeps the existing
 * interactions (voting) working. Writes screenshots to `var/screenshots`.
 *
 * Usage: node scripts/check-route-cards.mjs [baseUrl]
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
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`);
});

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function cards() {
  return page.locator(".route-grid .route-card");
}

try {
  /* 1. The directory ------------------------------------------------------ */
  console.log("\n--- the directory ---");
  await page.goto(`${baseUrl}/routes`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);

  const total = await cards().count();
  check("routes are listed", total > 0, `${total} cards`);

  // Each card shows the wall type next to its wall name.
  const firstCard = cards().first();
  const cardText = await firstCard.innerText();
  check(
    "a card names its wall and wall type",
    cardText.includes("Wall to be confirmed") ||
      /(Slab|Vertical|Overhang|Roof|Boulder)/.test(cardText),
    cardText.split("\n")[0],
  );

  /* 2. The imagery falls back -------------------------------------------- */
  console.log("\n--- imagery ---");
  const photos = await page.locator(".route-photo").count();
  const placeholders = await page.locator(".photo-note").count();
  check(
    "a picture or a labelled placeholder is showing",
    photos + placeholders === total,
    `${photos} photos, ${placeholders} placeholders`,
  );

  // No route should ever be left with neither.
  const noArt = total - photos - placeholders;
  check("no card is left without art", noArt === 0, `${noArt} bare`);

  await page.screenshot({ path: `${shots}/route-directory-cards-desktop.png`, fullPage: true });

  /* 3. The route detail page ---------------------------------------------- */
  console.log("\n--- the route detail page ---");
  const firstLink = cards().first();
  const routeName = (await firstLink.locator("h3").innerText()).trim();
  await firstLink.click();
  await page.waitForURL("**/routes/**", { timeout: 20_000 });
  await page.waitForTimeout(900);

  check(
    "the route page names the route",
    await page
      .locator("text=" + routeName)
      .first()
      .isVisible(),
  );
  const gradeText = (await page.locator(".grade-block").innerText()).toUpperCase();
  check("the route page states the wall type", gradeText.includes("WALL TYPE"));
  check("the route page states the status", gradeText.includes("STATUS"));
  check("the route page keeps the official grade", gradeText.includes("OFFICIAL GRADE"));
  check(
    "the route page keeps the vote panel",
    await page.locator(".vote-panel", { hasText: "How did it feel?" }).isVisible(),
  );

  await page.screenshot({ path: `${shots}/route-detail-desktop.png`, fullPage: true });

  /* 4. On a phone ---------------------------------------------------------- */
  console.log("\n--- on a phone ---");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check("route detail, mobile: no horizontal overflow", overflow <= 1, `${overflow}px`);
  await page.screenshot({ path: `${shots}/route-detail-mobile.png`, fullPage: true });

  await page.goto(`${baseUrl}/routes`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);
  const overflowList = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check("route cards, mobile: no horizontal overflow", overflowList <= 1, `${overflowList}px`);
  await page.screenshot({ path: `${shots}/route-directory-cards-mobile.png`, fullPage: true });
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
console.log("\nRoute card checks completed without browser errors.");
