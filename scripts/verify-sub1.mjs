/**
 * Sub-1: Browser verification for Products, Prices, and Opening Hours.
 * 
 * Usage: node scripts/verify-sub1.mjs [frontendUrl] [apiUrl]
 * 
 * Both URLs must be loopback (127.0.0.1 or localhost).
 */
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const frontendUrl = process.argv[2] ?? "http://127.0.0.1:4000";
const apiUrl = process.argv[3] ?? "http://127.0.0.1:8000";
const allowedHosts = ["localhost", "127.0.0.1", "[::1]"];

function validateUrl(label, url) {
  const parsed = new URL(url);
  if (!allowedHosts.includes(parsed.hostname)) {
    console.error(`ERROR: Refusing to run against non-local ${label}: ${url}`);
    process.exit(1);
  }
  console.log(`${label}: ${url}`);
}

validateUrl("Frontend", frontendUrl);
validateUrl("API", apiUrl);

const ACCOUNTS = {
  admin: ["admin@example.com", "admin-demo-password"],
  staff: ["staff@example.com", "staff-demo-password"],
  customer: ["alex@example.com", "customer-demo-password"],
};

const PREFIX = `VERIFY-S1-${Date.now()}`;

const browser = await chromium.launch();
const problems = [];
const screenshots = [];

async function signIn(page, role) {
  const [email, password] = ACCOUNTS[role];
  console.log(`Signing in as ${role} (${email})...`);
  await page.goto(`${frontendUrl}/signin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[name="email"]', { timeout: 15_000, state: "attached" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  
  // Click submit and wait for either navigation or error
  await page.click('button[type="submit"]');
  
  // Wait for navigation or error message
  try {
    await page.waitForURL(`${frontendUrl}/member`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    console.log("Navigation to /member successful");
  } catch (e) {
    // Check for error message
    const errorVisible = await page.locator('.feedback.error, [role="alert"]').isVisible().catch(() => false);
    if (errorVisible) {
      const errorText = await page.locator('.feedback.error, [role="alert"]').textContent().catch(() => "unknown");
      throw new Error(`Sign in failed: ${errorText}`);
    }
    // Check if still on signin page (maybe auth failed)
    const currentUrl = page.url();
    throw new Error(`Sign in did not navigate to /member. Current URL: ${currentUrl}`);
  }
  
  await page.waitForFunction(() => document.querySelector("[data-user-email], .profile, [data-user-name], .avatar, .profile-summary") !== null, { timeout: 15_000 });
  console.log("Sign in complete, session authenticated");
}

async function signOut(page) {
  await page.goto(`${frontendUrl}/member`, { waitUntil: "networkidle", timeout: 30_000 });
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

async function apiRequest(path, { method = "GET", token, json, form } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) body = JSON.stringify(json);
  if (form) { body = form; delete headers["Content-Type"]; }
  const res = await fetch(`${apiUrl}${path}`, { method, headers, body });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function getAdminToken() {
  const res = await apiRequest("/api/auth/login", { method: "POST", json: { email: ACCOUNTS.admin[0], password: ACCOUNTS.admin[1] } });
  if (res.status !== 200) throw new Error(`Admin login failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.access_token;
}

const adminToken = await getAdminToken();

const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
const page = await context.newPage();
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0,200)}`));
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0,200)}`); });

async function takeScreenshot(name) {
  const path = resolve(__dirname, `../var/screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: true });
  screenshots.push({ name, path });
  console.log(`Screenshot: ${path}`);
}

try {
  // =========================== PRODUCTS ===========================
  step("Products: admin access and list");
  await signIn(page, "admin");
  await page.goto(`${frontendUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".category-tabs", { timeout: 60_000 });
  await page.click('.category-tabs button:has-text("Products")');
  await page.waitForSelector("text=Create a new product", { timeout: 30_000 });
  await takeScreenshot("01-products-list");

  step("Products: create unique test product");
  await page.getByRole("button", { name: "New product" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  const sku = `${PREFIX}-SKU`;
  const name = `${PREFIX} Product`;
  await dialog.getByPlaceholder("SHOE-001").fill(sku);
  await dialog.getByPlaceholder("Miura VS").fill(name);
  // Description uses Textarea with ellipsis character
  await dialog.locator('textarea[placeholder*="Key features"]').fill("Test product for verification");
  await dialog.locator('input[type="file"]').setInputFiles(resolve(__dirname, "../var/verification/main/images/verify-main.png"));
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await page.waitForTimeout(3000);
  // Scroll to the submit button
  await dialog.getByRole("button", { name: "Create product", exact: true }).scrollIntoViewIfNeeded();
  await dialog.getByRole("button", { name: "Create product", exact: true }).click();
  
  // Wait for either dialog to close or error message
  await page.waitForTimeout(2000);
  const dialogStillOpen = await dialog.isVisible().catch(() => false);
  if (dialogStillOpen) {
    // Check for error message
    const errorVisible = await dialog.locator('.feedback.error, [role="alert"]').isVisible().catch(() => false);
    if (errorVisible) {
      const errorText = await dialog.locator('.feedback.error, [role="alert"]').textContent().catch(() => "unknown");
      throw new Error(`Product creation failed: ${errorText}`);
    }
    // Check for success message
    const successVisible = await dialog.locator('.feedback:not(.error), [role="status"]').isVisible().catch(() => false);
    if (successVisible) {
      const successText = await dialog.locator('.feedback:not(.error), [role="status"]').textContent().catch(() => "success");
      console.log("Product creation succeeded:", successText);
    }
    // Force close the dialog
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(500);
  }
  
  await page.waitForSelector(`text=${name}`, { timeout: 30_000 });
  await takeScreenshot("02-products-created");

  // Verify product in admin list
  const row = page.locator("tbody tr", { hasText: name });
  console.log("Product visible in admin list:", await row.isVisible());
  console.log("Product marked Active:", (await row.locator("text=Active").count()) > 0);

  // Verify via public API
  const productList = await apiRequest("/api/public/products", { token: adminToken });
  const created = productList.data.find(p => p.name === name);
  console.log("Product in public API:", !!created);
  if (created) console.log("Product image_url:", created.image_url);

  // Edit product
  step("Products: edit test product");
  await row.getByRole("button", { name: `Edit ${name}` }).click();
  await dialog.waitFor({ state: "visible" });
  await dialog.getByPlaceholder("Miura VS").fill(`${name} Updated`);
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForSelector(`text=${name} Updated`, { timeout: 30_000 });
  await takeScreenshot("03-products-edited");

  // Toggle inactive
  step("Products: deactivate test product");
  const updatedRow = page.locator("tbody tr", { hasText: `${name} Updated` });
  await updatedRow.getByRole("button", { name: `Deactivate ${name} Updated` }).click();
  const confirm = page.getByRole("dialog");
  await confirm.waitFor({ state: "visible" });
  await confirm.getByRole("button", { name: "Deactivate", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  await updatedRow.getByRole("button", { name: `Activate ${name} Updated` }).waitFor({ timeout: 30_000 });
  console.log("Product marked Inactive:", (await updatedRow.locator("text=Inactive").count()) > 0);

  // Verify hidden from public API
  const afterDeactivate = await apiRequest("/api/public/products", { token: adminToken });
  const hidden = afterDeactivate.data.find(p => p.name === `${name} Updated`);
  console.log("Inactive product hidden from public API:", !hidden);

  // Reactivate
  await updatedRow.getByRole("button", { name: `Activate ${name} Updated` }).click();
  await confirm.waitFor({ state: "visible" });
  await confirm.getByRole("button", { name: "Activate", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });

  // =========================== PRICES ===========================
  step("Prices: list and create");
  await page.goto(`${frontendUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".category-tabs", { timeout: 60_000 });
  await page.click('.category-tabs button:has-text("Prices")');
  await page.waitForSelector("text=Create a new price entry", { timeout: 30_000 });
  await takeScreenshot("04-prices-list");

  await page.getByRole("button", { name: "New price" }).click();
  const priceDialog = page.getByRole("dialog");
  await priceDialog.waitFor({ state: "visible" });
  const priceName = `${PREFIX} Price`;
  await priceDialog.getByPlaceholder("Day Pass").fill(priceName);
  await priceDialog.locator('input[type="number"]').first().fill("50000");
  await priceDialog.locator('select').first().selectOption("Entry");
  await priceDialog.getByRole("button", { name: "Create price entry", exact: true }).click();
  
  // Wait for either dialog to close or error message
  await page.waitForTimeout(2000);
  const priceDialogStillOpen = await priceDialog.isVisible().catch(() => false);
  if (priceDialogStillOpen) {
    const errorVisible = await priceDialog.locator('.feedback.error, [role="alert"]').isVisible().catch(() => false);
    if (errorVisible) {
      const errorText = await priceDialog.locator('.feedback.error, [role="alert"]').textContent().catch(() => "unknown");
      throw new Error(`Price creation failed: ${errorText}`);
    }
    const successVisible = await priceDialog.locator('.feedback:not(.error), [role="status"]').isVisible().catch(() => false);
    if (successVisible) {
      const successText = await priceDialog.locator('.feedback:not(.error), [role="status"]').textContent().catch(() => "success");
      console.log("Price creation succeeded:", successText);
    }
    await priceDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(500);
  }
  
  await page.waitForSelector(`text=${priceName}`, { timeout: 30_000 });
  await takeScreenshot("05-prices-created");

  // Edit price
  step("Prices: edit test price");
  const priceRow = page.locator("tbody tr", { hasText: priceName });
  await priceRow.getByRole("button", { name: `Edit ${priceName}` }).click();
  await priceDialog.waitFor({ state: "visible" });
  await priceDialog.getByPlaceholder("Day Pass").fill(`${priceName} Updated`);
  await priceDialog.locator('input[type="number"]').first().fill("75000");
  await priceDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await priceDialog.waitFor({ state: "hidden" });
  await page.waitForSelector(`text=${priceName} Updated`, { timeout: 30_000 });

  // Toggle inactive - Prices use direct toggle, not a confirmation dialog
  step("Prices: deactivate test price");
  const updatedPriceRow = page.locator("tbody tr", { hasText: `${priceName} Updated` });
  await updatedPriceRow.getByRole("button", { name: `Deactivate ${priceName} Updated` }).click();
  await page.waitForTimeout(2000); // Wait for API call and UI update
  await updatedPriceRow.getByRole("button", { name: `Activate ${priceName} Updated` }).waitFor({ timeout: 30_000 });
  console.log("Price marked Inactive:", (await updatedPriceRow.locator("text=Inactive").count()) > 0);

  // Verify via public API
  const pricesList = await apiRequest("/api/public/prices", { token: adminToken });
  const priceInPublic = pricesList.data.find(p => p.name === `${priceName} Updated`);
  console.log("Inactive price hidden from public API:", !priceInPublic);

  // Reactivate - direct toggle
  await updatedPriceRow.getByRole("button", { name: `Activate ${priceName} Updated` }).click();
  await page.waitForTimeout(2000);

  // =========================== OPENING HOURS ===========================
  step("Opening Hours: list and create");
  await page.goto(`${frontendUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".category-tabs", { timeout: 60_000 });
  await page.click('.category-tabs button:has-text("Opening hours")');
  await page.waitForSelector("text=Add an opening hour", { timeout: 30_000 });
  await takeScreenshot("06-opening-hours-list");

  await page.getByRole("button", { name: "New opening hour" }).click();
  const hoursDialog = page.getByRole("dialog");
  await hoursDialog.waitFor({ state: "visible" });
  await hoursDialog.locator('select').first().selectOption("6"); // Sunday (0=Monday... 6=Sunday)
  await hoursDialog.locator('input[type="time"]').first().fill("10:00");
  await hoursDialog.locator('input[type="time"]').last().fill("18:00");
  await hoursDialog.getByRole("button", { name: "Create opening hour", exact: true }).click();
  
  // Wait for either dialog to close or error message
  await page.waitForTimeout(2000);
  const hoursDialogStillOpen = await hoursDialog.isVisible().catch(() => false);
  if (hoursDialogStillOpen) {
    const errorVisible = await hoursDialog.locator('.feedback.error, [role="alert"]').isVisible().catch(() => false);
    if (errorVisible) {
      const errorText = await hoursDialog.locator('.feedback.error, [role="alert"]').textContent().catch(() => "unknown");
      throw new Error(`Opening hour creation failed: ${errorText}`);
    }
    const successVisible = await hoursDialog.locator('.feedback:not(.error), [role="status"]').isVisible().catch(() => false);
    if (successVisible) {
      const successText = await hoursDialog.locator('.feedback:not(.error), [role="status"]').textContent().catch(() => "success");
      console.log("Opening hour creation succeeded:", successText);
    }
    await hoursDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(500);
  }
  
  await page.waitForSelector("text=Sunday", { timeout: 30_000 });
  await takeScreenshot("07-opening-hours-created");

  // Verify via public /gym API
  const gym = await apiRequest("/api/public/gym", { token: adminToken });
  console.log("Gym opening hours updated:", !!gym.data.opening_hours);
  if (gym.data.opening_hours) {
    const sunday = gym.data.opening_hours.find(h => h.day_of_week === 6);
    console.log("Sunday hours in public API:", sunday ? `${sunday.opens_at}-${sunday.closes_at}` : "none");
  }

  // Edit to closed day
  step("Opening Hours: test closed day");
  const hoursRow = page.locator("tbody tr", { hasText: "Sunday" }).first();
  await hoursRow.getByRole("button", { name: /Edit/ }).click();
  await hoursDialog.waitFor({ state: "visible" });
  // Select "Closed" from the Mode dropdown
  await hoursDialog.locator('select').nth(1).selectOption("closed");
  // Wait for the option to be selected
  await page.waitForTimeout(500);
  await hoursDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await hoursDialog.waitFor({ state: "hidden" });
  await takeScreenshot("08-opening-hours-closed-day");

  const gym2 = await apiRequest("/api/public/gym", { token: adminToken });
  const closedSunday = gym2.data.opening_hours?.find(h => h.day_of_week === 6);
  console.log("Closed day reflected in public API:", closedSunday?.is_closed === true);

  // Delete test record
  step("Opening Hours: cleanup test record");
  const closedRow = page.locator("tbody tr", { hasText: "Sunday" }).first();
  await closedRow.getByRole("button", { name: /Delete/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(1000);

} catch (e) {
  console.error("FAIL:", e.message);
  await takeScreenshot("99-failure");
  problems.push(`fatal: ${e.message}`);
} finally {
  await browser.close();

  console.log("\n=== SUMMARY ===");
  console.log(`Screenshots captured: ${screenshots.length}`);
  for (const s of screenshots) console.log(`  - ${s.name}: ${s.path}`);
  if (problems.length) {
    console.log("\nProblems:");
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log("\nAll sub-1 checks completed.");
}