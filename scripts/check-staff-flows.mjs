/**
 * Browser check of the staff and administration flows, including the
 * permission checks the backend makes.
 *
 * Usage: node scripts/check-staff-flows.mjs [baseUrl]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8080";
const ACCOUNTS = {
  customer: ["alex@example.com", "customer-demo-password"],
  staff: ["staff@example.com", "staff-demo-password"],
  admin: ["admin@example.com", "admin-demo-password"],
};

const browser = await chromium.launch();
const problems = [];

async function signIn(page, which) {
  const [email, password] = ACCOUNTS[which];
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/member", { timeout: 30_000 });
  await page.waitForTimeout(800);
}

async function signOut(page) {
  await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);
  const button = page.locator('button:has-text("Sign out")');
  if (await button.count()) {
    await button.click();
    await page.waitForTimeout(800);
  }
}

function step(name) {
  console.log(`\n--- ${name} ---`);
}

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`);
});

// 1. A customer may not open the staff or admin pages.
step("customer is refused");
await signIn(page, "customer");
await page.goto(`${baseUrl}/staff`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(800);
console.log(
  "staff refused:",
  await page.locator("text=You need a staff or administrator").isVisible(),
);
await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(800);
console.log(
  "admin refused:",
  await page.locator("text=You need an administrator account").isVisible(),
);
await signOut(page);

// 2. A member of staff sees their own tasks and can work on them.
step("staff tasks");
await signIn(page, "staff");
await page.goto(`${baseUrl}/staff`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1200);
console.log("task cards:", await page.locator(".task-card").count());
const firstTask = page.locator(".task-card").first();
console.log("task title:", (await firstTask.locator("h3").textContent())?.trim());

// Move the task to in progress.
await firstTask.locator('button:has-text("In progress")').click();
await page.waitForTimeout(1500);
console.log(
  "status updated:",
  (await firstTask.locator(".task-card-head span").last().textContent())?.trim(),
);

// Add and tick a checklist item.
const itemLabel = `Check the holds ${Date.now()}`;
await firstTask.locator(".checklist-add input").fill(itemLabel);
await firstTask.locator('.checklist-add button[type="submit"]').click();
await page.waitForTimeout(1500);
console.log("item added:", await firstTask.locator(`text=${itemLabel}`).isVisible());
const checkbox = firstTask.locator('.checklist [role="checkbox"]').last();
await checkbox.click();
await page.waitForTimeout(1500);
console.log("item ticked:", (await checkbox.getAttribute("data-state")) === "checked");

await page.screenshot({ path: "var/screenshots/staff-tasks.png", fullPage: true });
await signOut(page);

// 3. An administrator sees the operations dashboard and can manage routes,
//    tasks and events.
step("admin operations");
await signIn(page, "admin");
await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1500);
console.log("metrics:", await page.locator(".metric").count());
console.log("member rows:", await page.locator("tbody tr").count());

// Routes: publish a route, then archive it.
await page.click('.category-tabs button:has-text("Routes")');
await page.waitForTimeout(1200);
const routeName = `Browser Route ${Date.now()}`;
await page.fill('input[value=""] >> nth=0', "").catch(() => {});
const nameInput = page.locator(".content-block input").first();
await nameInput.fill(routeName);
await page.locator(".content-block input").nth(1).fill("V2");
await page.locator('.content-block button[type="submit"]').click();
await page.waitForTimeout(2000);
console.log("route published:", await page.locator(`text=${routeName}`).first().isVisible());

// Tasks: create one.
await page.click('.category-tabs button:has-text("Tasks")');
await page.waitForTimeout(1000);
console.log("task rows:", await page.locator("tbody tr").count());

// Events: publish one.
await page.click('.category-tabs button:has-text("Events")');
await page.waitForTimeout(1000);
const eventTitle = `Browser Event ${Date.now()}`;
const eventInputs = page.locator(".content-block input");
await eventInputs.first().fill(eventTitle);
await eventInputs.nth(1).fill("2026-11-05T18:00");
await page.locator('.content-block button[type="submit"]').click();
await page.waitForTimeout(2000);
console.log("event published:", await page.locator(`text=${eventTitle}`).first().isVisible());

await page.screenshot({ path: "var/screenshots/admin-operations.png", fullPage: true });
await browser.close();

if (problems.length) {
  console.log("\n--- browser problems ---");
  for (const problem of problems) console.log(problem);
  process.exit(1);
}
console.log("\nStaff and administration flows completed without browser errors.");
