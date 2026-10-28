/**
 * Browser check of the administrator customer directory and detail view.
 *
 * Usage: node scripts/check-admin-customers.mjs [baseUrl]
 * The API must point at the disposable test database.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:8080";
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

let passed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`ok    ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    problems.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function signIn(email, password) {
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/member", { timeout: 30_000 });
}

console.log("\n--- administrator customer directory ---");
await signIn("admin@example.com", "admin-demo-password");
await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1500);

check(
  "the customers tab is selected",
  await page.locator('button:has-text("Customers")').isVisible(),
);
check(
  "the directory asks the backend for customers",
  await page.locator('input[aria-label="Search customers"]').isVisible(),
);
const initialRows = await page.locator("tbody tr").count();
check("the server-backed directory has rows", initialRows > 0, `${initialRows} rows`);

await page.fill('input[aria-label="Search customers"]', "alex");
await page.waitForTimeout(1200);
const searchRows = await page.locator("tbody tr").count();
check("search narrows the directory", searchRows === 1, `${searchRows} row`);
check(
  "search finds the demo customer",
  (await page.locator("tbody tr").first().innerText()).includes("alex@example.com"),
);
check(
  "seeded accounts are labelled demo",
  (await page.locator("tbody tr").first().innerText()).toLowerCase().includes("demo"),
);

const customerLink = page.getByRole("link", { name: /Alex Nguyen/ }).first();
check("each customer has a detail link", await customerLink.isVisible());
await customerLink.click();
await page.waitForURL("**/admin/customers/*", { timeout: 30_000 });
await page.waitForTimeout(1500);
check("the detail route opens", /\/admin\/customers\/\d+$/.test(page.url()), page.url());
check(
  "the detail shows the account",
  (await page.locator(".customer-detail-heading").innerText())
    .toLowerCase()
    .includes("alex nguyen"),
);
check(
  "the detail shows climbing activity",
  await page.getByRole("heading", { name: "Climbing activity" }).isVisible(),
);
check(
  "the detail shows the safety agreement",
  await page.getByRole("heading", { name: "Safety agreement" }).isVisible(),
);
check(
  "the detail shows contact history",
  await page.getByRole("heading", { name: "Contact history" }).isVisible(),
);
check(
  "the detail is explicitly read-only",
  (await page.locator(".rules-panel").last().innerText()).includes("read-only") ||
    (await page.locator("body").innerText()).includes("This record is read-only"),
);
check(
  "no password material is rendered",
  !(await page.locator("body").innerText()).toLowerCase().includes("password_hash"),
);

await page.screenshot({ path: `${shots}/admin-customer-detail.png`, fullPage: true });

console.log("\n--- phone layout ---");
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1200);
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
);
check("the phone directory has no page overflow", overflow <= 1, `${overflow}px`);
await page.screenshot({ path: `${shots}/admin-customers-phone.png`, fullPage: true });

console.log("\n--- customer denial ---");
await page
  .getByRole("button", { name: /Sign out/i })
  .first()
  .click()
  .catch(async () => {
    await page.goto(`${baseUrl}/member`, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: /Sign out/i })
      .first()
      .click();
  });
await page.waitForTimeout(800);
await signIn("alex@example.com", "customer-demo-password");
await page.goto(`${baseUrl}/admin/customers/1`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1200);
check(
  "a customer is refused the detail route",
  await page.getByText(/need an administrator account/i).isVisible(),
);

await browser.close();
console.log(`\n${passed} checks passed`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
