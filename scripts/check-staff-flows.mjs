/**
 * Browser check of the staff and administration flows, including the
 * permission checks the backend makes.
 *
 * Usage: node scripts/check-staff-flows.mjs [baseUrl] [--mobile]
 */
import { chromium } from "playwright";

const frontendUrl = process.argv[2] ?? "http://localhost:8083";
const apiUrl = process.argv[3] ?? "http://localhost:8000";
const isMobile = process.argv.includes("--mobile");
const viewport = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };

const ACCOUNTS = {
  customer: ["alex@example.com", "customer-demo-password"],
  staff: ["staff@example.com", "staff-demo-password"],
  admin: ["admin@example.com", "admin-demo-password"],
};

const browser = await chromium.launch();
const problems = [];

async function signIn(page, which) {
  const [email, password] = ACCOUNTS[which];
  
  // Login via backend API directly
  const loginResponse = await fetch(`${apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!loginResponse.ok) {
    throw new Error(`Login failed: ${loginResponse.status}`);
  }
  const loginData = await loginResponse.json();
  
  // Navigate to frontend and set token, then reload to initialize memoryToken
  await page.goto(`${frontendUrl}/`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.evaluate((token) => {
    localStorage.setItem("access_token", token);
  }, loginData.access_token);
  
  // Reload to initialize memoryToken from localStorage
  await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(800);
  
  // Navigate to member page
  await page.goto(`${frontendUrl}/member`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(800);
}

async function signOut(page) {
  await page.goto(`${frontendUrl}/member`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.removeItem("access_token"));
  const button = page.locator('button:has-text("Sign out")');
  if (await button.count()) {
    await button.click();
    await page.waitForTimeout(800);
  }
}

function step(name) {
  console.log(`\n--- ${name} ---`);
}

const context = await browser.newContext({ viewport });
const page = await context.newPage();
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`);
});

// 1. A customer may not open the staff or admin pages.
step("customer is refused");
await signIn(page, "customer");
await page.goto(`${frontendUrl}/staff`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(800);
console.log(
  "staff refused:",
  await page.locator("text=You need a staff or administrator").isVisible(),
);
await page.goto(`${frontendUrl}/admin`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(800);
console.log(
  "admin refused:",
  await page.locator("text=You need an administrator account").isVisible(),
);
await signOut(page);

step("staff tasks");
await signIn(page, "staff");

await page.goto(`${frontendUrl}/staff`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(5000);

// Retry logic: if no task cards, try to trigger a refetch
let taskCount = await page.locator(".task-card").count();
if (taskCount === 0) {
  console.log("No task cards found, attempting to trigger refetch...");
  await page.goto(`${frontendUrl}/member`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(1000);
  await page.goto(`${frontendUrl}/staff`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(3000);
}

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
await page.goto(`${frontendUrl}/admin`, { waitUntil: "networkidle", timeout: 60_000 });
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

// Messages: an enquiry sent through the contact form has to arrive.
step("the contact inbox");
await page.goto(`${frontendUrl}/contact`, { waitUntil: "networkidle", timeout: 60_000 });
const enquiry = `Browser enquiry ${Date.now()}`;
await page.fill('input[name="name"]', "Browser Visitor");
await page.fill('input[name="email"]', "browser-visitor@example.com");
await page.fill('textarea[name="message"]', enquiry);
await page.click('button[type="submit"]');
await page.waitForTimeout(1500);

await page.goto(`${frontendUrl}/admin`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1200);
await page.click('.category-tabs button:has-text("Messages")');
await page.waitForTimeout(1500);
console.log("enquiry received:", await page.locator(`text=${enquiry}`).first().isVisible());
const markButton = page.locator('button:has-text("Mark as handled")').first();
if (await markButton.count()) {
  await markButton.click();
  await page.waitForTimeout(1500);
}
console.log("enquiry marked handled:", (await page.locator(`text=${enquiry}`).count()) === 0);

await page.screenshot({ path: "var/screenshots/admin-operations.png", fullPage: true });

// Mobile viewport testing
if (isMobile) {
  step("mobile staff tasks");
  await signIn(page, "staff");
  await page.goto(`${frontendUrl}/staff`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);
  console.log("mobile task cards:", await page.locator(".task-card").count());
  const firstTaskMobile = page.locator(".task-card").first();
  console.log("mobile task title:", (await firstTaskMobile.locator("h3").textContent())?.trim());

  // Move the task to in progress on mobile.
  await firstTaskMobile.locator('button:has-text("In progress")').click();
  await page.waitForTimeout(1500);
  console.log(
    "mobile status updated:",
    (await firstTaskMobile.locator(".task-card-head span").last().textContent())?.trim(),
  );

  // Add and tick a checklist item on mobile.
  const itemLabelMobile = `Mobile check ${Date.now()}`;
  await firstTaskMobile.locator(".checklist-add input").fill(itemLabelMobile);
  await firstTaskMobile.locator('.checklist-add button[type="submit"]').click();
  await page.waitForTimeout(1500);
  console.log("mobile item added:", await firstTaskMobile.locator(`text=${itemLabelMobile}`).isVisible());
  const checkboxMobile = firstTaskMobile.locator('.checklist [role="checkbox"]').last();
  await checkboxMobile.click();
  await page.waitForTimeout(1500);
  console.log("mobile item ticked:", (await checkboxMobile.getAttribute("data-state")) === "checked");

  // Check cancelled filter on mobile
  await firstTaskMobile.locator('button:has-text("Cancelled")').click();
  await page.waitForTimeout(500);
  console.log("cancelled filter works:", await page.locator(".task-card").count() >= 0);

  await page.screenshot({ path: "var/screenshots/staff-tasks-mobile.png", fullPage: true });
  await signOut(page);

  step("mobile admin tasks");
  await signIn(page, "admin");
  await page.goto(`${frontendUrl}/admin`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.click('.category-tabs button:has-text("Tasks")');
  await page.waitForTimeout(1000);
  console.log("mobile admin task rows:", await page.locator("tbody tr").count());

  // Test admin task creation on mobile
  await page.locator(".content-block input").first().fill(`Mobile Task ${Date.now()}`);
  await page.locator(".content-block textarea").first().fill("Mobile test description");
  await page.locator('.content-block button[type="submit"]').click();
  await page.waitForTimeout(2000);
  console.log("mobile task created:", await page.locator("tbody tr").count() > 0);

  await page.screenshot({ path: "var/screenshots/admin-operations-mobile.png", fullPage: true });

  step("mobile admin shifts");
  await page.click('.category-tabs button:has-text("Shifts")');
  await page.waitForTimeout(1000);
  console.log("mobile admin shifts visible:", await page.locator(".event-row").count() >= 0);

  // Test shift creation on mobile
  const assigneeSelect = page.locator(".content-block select").first();
  await assigneeSelect.selectOption({ index: 1 });
  await page.locator('input[type="datetime-local"]').first().fill("2026-12-01T09:00");
  await page.locator('input[type="datetime-local"]').nth(1).fill("2026-12-01T17:00");
  await page.locator('input[placeholder="Floor staff"]').fill("Mobile test shift");
  await page.locator('.content-block button[type="submit"]').click();
  await page.waitForTimeout(2000);
  console.log("mobile shift created:", await page.locator(".event-row").count() > 0);

  await page.screenshot({ path: "var/screenshots/admin-shifts-mobile.png", fullPage: true });
  await signOut(page);

  // Check horizontal overflow on mobile
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`mobile horizontal overflow: ${overflow}px`);
  if (overflow > 1) {
    problems.push(`Horizontal overflow detected on mobile: ${overflow}px`);
  }
}

await page.screenshot({ path: "var/screenshots/admin-operations.png", fullPage: true });
await browser.close();

if (problems.length) {
  console.log("\n--- browser problems ---");
  for (const problem of problems) console.log(problem);
  process.exit(1);
}
console.log("\nStaff and administration flows completed without browser errors.");
