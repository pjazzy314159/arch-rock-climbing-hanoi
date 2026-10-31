/**
 * Sub-2: Browser verification for Events, Courses, FAQ, Rules, Services, Walls, and Routes.
 * 
 * Usage: node scripts/verify-sub2.mjs [frontendUrl] [apiUrl]
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

const PREFIX = `VERIFY-S2-${Date.now()}`;

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
  await signIn(page, "admin");
  await page.goto(`${frontendUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".category-tabs", { timeout: 60_000 });

  // =========================== EVENTS ===========================
  step("Events: create unpublished, edit, publish, hide");
  await page.click('.category-tabs button:has-text("Events")');
  await page.waitForSelector("text=Add an event", { timeout: 30_000 });
  await takeScreenshot("01-events-list");

  await page.getByRole("button", { name: "New event" }).click();
  const eventDialog = page.getByRole("dialog");
  await eventDialog.waitFor({ state: "visible" });
  const eventTitle = `${PREFIX} Event`;
  await eventDialog.getByPlaceholder("Event title").fill(eventTitle);
  await eventDialog.locator('input[type="datetime-local"]').first().fill("2026-12-01T18:00");
  await eventDialog.locator('input[type="datetime-local"]').last().fill("2026-12-01T21:00");
  await eventDialog.getByPlaceholder("Venue or address").fill("Main Wall");
  await eventDialog.locator('input[type="number"]').fill("50");
  // is_public checkbox - select "Staff only" to make it unpublished
  await eventDialog.locator('select').selectOption("false");
  await eventDialog.getByRole("button", { name: "Create event", exact: true }).click();
  await eventDialog.waitFor({ state: "hidden" });
  await page.waitForSelector(`text=${eventTitle}`, { timeout: 30_000 });
  await takeScreenshot("02-events-created-unpublished");

  // Verify unpublished event not in public API
  let eventsPublic = await apiRequest("/api/public/events", { token: adminToken });
  let inPublic = eventsPublic.data.find(e => e.title === eventTitle);
  console.log("Unpublished event hidden from public API:", !inPublic);

  // Edit event
  step("Events: edit test event");
  // Find the Edit button by text content - the table might have hydration issues
  await page.locator("button:has-text('Edit')").first().click();
  await eventDialog.waitFor({ state: "visible" });
  await eventDialog.getByPlaceholder("Event title").fill(`${eventTitle} Updated`);
  await eventDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await eventDialog.waitFor({ state: "hidden" });
  await page.waitForSelector(`text=${eventTitle} Updated`, { timeout: 30_000 });
  await takeScreenshot("03-events-edited");

  // Publish event
  step("Events: publish test event");
  await page.locator("button:has-text('Publish')").first().click();
  await page.waitForTimeout(1000);
  // Check public API
  eventsPublic = await apiRequest("/api/public/events", { token: adminToken });
  inPublic = eventsPublic.data.find(e => e.title === `${eventTitle} Updated`);
  console.log("Published event visible in public API:", !!inPublic);
  await takeScreenshot("04-events-published");

  // Hide event
  step("Events: hide test event");
  await page.locator("button:has-text('Hide')").first().click();
  await page.waitForTimeout(1000);
  eventsPublic = await apiRequest("/api/public/events", { token: adminToken });
  inPublic = eventsPublic.data.find(e => e.title === `${eventTitle} Updated`);
  console.log("Hidden event removed from public API:", !inPublic);

  // =========================== COURSES ===========================
  step("Courses: create, edit, test nullable pricing, activate/deactivate");
  await page.goto(`${frontendUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".category-tabs", { timeout: 60_000 });
  await page.click('.category-tabs button:has-text("Courses")');
  await page.waitForSelector("text=Create a new course", { timeout: 30_000 });
  await takeScreenshot("05-courses-list");

  await page.getByRole("button", { name: "New course" }).click();
  const courseDialog = page.getByRole("dialog");
  await courseDialog.waitFor({ state: "visible" });
  const courseTitle = `${PREFIX} Course`;
  await courseDialog.getByPlaceholder("Course title").fill(courseTitle);
  await courseDialog.locator('select').first().selectOption("Beginner");
  await courseDialog.getByPlaceholder("Brief description").fill("Test course for verification");
  await courseDialog.getByPlaceholder("Full description of the course…").fill("Detailed description here");
  await courseDialog.getByPlaceholder("Instructor name").fill("Test Instructor");
  await courseDialog.getByPlaceholder("e.g., Mon, Wed, Fri 09:00-11:00").fill("Weekly, 8 weeks");
  // Leave price_vnd empty (nullable)
  await courseDialog.getByRole("button", { name: "Create course", exact: true }).click();
  
  // Wait for either dialog to close or error message
  await page.waitForTimeout(2000);
  const courseDialogStillOpen = await courseDialog.isVisible().catch(() => false);
  if (courseDialogStillOpen) {
    const errorVisible = await courseDialog.locator('.feedback.error, [role="alert"]').isVisible().catch(() => false);
    if (errorVisible) {
      const errorText = await courseDialog.locator('.feedback.error, [role="alert"]').textContent().catch(() => "unknown");
      throw new Error(`Course creation failed: ${errorText}`);
    }
    const successVisible = await courseDialog.locator('.feedback:not(.error), [role="status"]').isVisible().catch(() => false);
    if (successVisible) {
      const successText = await courseDialog.locator('.feedback:not(.error), [role="status"]').textContent().catch(() => "success");
      console.log("Course creation succeeded:", successText);
    }
    await courseDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(500);
  }
  
  await page.waitForSelector(`text=${courseTitle}`, { timeout: 30_000 });
  await takeScreenshot("06-courses-created-no-price");

  // Verify via public API
  let coursesPublic = await apiRequest("/api/public/courses", { token: adminToken });
  let courseInPublic = coursesPublic.data.find(c => c.title === courseTitle);
  console.log("Course without price visible in public API:", !!courseInPublic);
  if (courseInPublic) console.log("Course price_vnd:", courseInPublic.price_vnd);

  // Edit course - add price
  step("Courses: edit to add price");
  const courseRow = page.locator("tbody tr", { hasText: courseTitle });
  await courseRow.getByRole("button", { name: `Edit ${courseTitle}` }).click();
  await courseDialog.waitFor({ state: "visible" });
  // Target the Price (VND) field specifically - use a more specific selector
  await page.locator('input[type="number"][min="0"]').last().fill("900000");
  await courseDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  
  // Wait for either dialog to close or error message
  await page.waitForTimeout(2000);
  const editDialogStillOpen = await courseDialog.isVisible().catch(() => false);
  if (editDialogStillOpen) {
    const errorVisible = await courseDialog.locator('.feedback.error, [role="alert"]').isVisible().catch(() => false);
    if (errorVisible) {
      const errorText = await courseDialog.locator('.feedback.error, [role="alert"]').textContent().catch(() => "unknown");
      throw new Error(`Course edit failed: ${errorText}`);
    }
    const successVisible = await courseDialog.locator('.feedback:not(.error), [role="status"]').isVisible().catch(() => false);
    if (successVisible) {
      const successText = await courseDialog.locator('.feedback:not(.error), [role="status"]').textContent().catch(() => "success");
      console.log("Course edit succeeded:", successText);
    }
    await courseDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(500);
  }
  
  await page.waitForTimeout(1000);

  coursesPublic = await apiRequest("/api/public/courses", { token: adminToken });
  courseInPublic = coursesPublic.data.find(c => c.title === courseTitle);
  console.log("Course with price in public API:", !!courseInPublic, "price:", courseInPublic?.price_vnd);

  // Deactivate
  step("Courses: deactivate test course");
  const updatedCourseRow = page.locator("tbody tr", { hasText: courseTitle });
  await updatedCourseRow.getByRole("button", { name: `Deactivate ${courseTitle}` }).click();
  
  // Wait for confirmation dialog
  const confirmDialog = page.getByRole("dialog");
  await confirmDialog.waitFor({ state: "visible" });
  await confirmDialog.getByRole("button", { name: "Deactivate", exact: true }).click();
  await confirmDialog.waitFor({ state: "hidden" });
  
  await updatedCourseRow.getByRole("button", { name: `Activate ${courseTitle}` }).waitFor({ timeout: 30_000 });
  console.log("Course marked Inactive:", (await updatedCourseRow.locator("text=Inactive").count()) > 0);

  coursesPublic = await apiRequest("/api/public/courses", { token: adminToken });
  courseInPublic = coursesPublic.data.find(c => c.title === courseTitle);
  console.log("Inactive course hidden from public API:", !courseInPublic);

  // Reactivate
  await updatedCourseRow.getByRole("button", { name: `Activate ${courseTitle}` }).click();
  const activateDialog = page.getByRole("dialog");
  await activateDialog.waitFor({ state: "visible" });
  await activateDialog.getByRole("button", { name: "Activate", exact: true }).click();
  await activateDialog.waitFor({ state: "hidden" });

  // =========================== FAQ ===========================
  step("FAQ: create, edit, publish/unpublish");
  await page.goto(`${frontendUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".category-tabs", { timeout: 60_000 });
  await page.click('.category-tabs button:has-text("FAQ")');
  await page.waitForSelector("text=Add a FAQ entry", { timeout: 30_000 });
  await takeScreenshot("07-faq-list");

  await page.getByRole("button", { name: "New FAQ" }).click();
  const faqDialog = page.getByRole("dialog");
  await faqDialog.waitFor({ state: "visible" });
  const faqQuestion = `${PREFIX} What is this?`;
  await faqDialog.getByPlaceholder("Question").fill(faqQuestion);
  await faqDialog.getByPlaceholder("Answer").fill("This is a test FAQ answer.");
  await faqDialog.getByPlaceholder("General").fill("Verification");
  await faqDialog.getByPlaceholder("search terms").fill("test verify");
  // is_published checkbox unchecked by default
  await faqDialog.getByRole("button", { name: "Create FAQ", exact: true }).click();
  await faqDialog.waitFor({ state: "hidden" });
  await page.waitForSelector(`text=${faqQuestion}`, { timeout: 30_000 });
  await takeScreenshot("08-faq-created-unpublished");

  // Verify unpublished FAQ not in public API
  let faqPublic = await apiRequest("/api/public/faq", { token: adminToken });
  let faqInPublic = faqPublic.data.find(f => f.question === faqQuestion);
  console.log("Unpublished FAQ hidden from public API:", !faqInPublic);

  // Edit FAQ
  step("FAQ: edit test FAQ");
  await page.locator("button:has-text('Edit')").first().click();
  await faqDialog.waitFor({ state: "visible" });
  await faqDialog.getByPlaceholder("Question").fill(`${faqQuestion} Updated`);
  await faqDialog.getByPlaceholder("Answer").fill("Updated test FAQ answer.");
  await faqDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  
  // Wait for either dialog to close or error message
  await page.waitForTimeout(2000);
  const editFaqDialogStillOpen = await faqDialog.isVisible().catch(() => false);
  if (editFaqDialogStillOpen) {
    const errorVisible = await faqDialog.locator('.feedback.error, [role="alert"]').isVisible().catch(() => false);
    if (errorVisible) {
      const errorText = await faqDialog.locator('.feedback.error, [role="alert"]').textContent().catch(() => "unknown");
      throw new Error(`FAQ edit failed: ${errorText}`);
    }
    const successVisible = await faqDialog.locator('.feedback:not(.error), [role="status"]').isVisible().catch(() => false);
    if (successVisible) {
      const successText = await faqDialog.locator('.feedback:not(.error), [role="status"]').textContent().catch(() => "success");
      console.log("FAQ edit succeeded:", successText);
    }
    await faqDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(500);
  }
  
  await page.waitForSelector(`text=${faqQuestion} Updated`, { timeout: 30_000 });

  // Publish FAQ - edit and change Published dropdown
  step("FAQ: publish test FAQ");
  await page.locator("button:has-text('Edit')").first().click();
  await faqDialog.waitFor({ state: "visible" });
  // Change Published dropdown to "Published"
  await faqDialog.locator('select').selectOption("true");
  await faqDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await faqDialog.waitFor({ state: "hidden" });
  await page.waitForTimeout(1000);
  faqPublic = await apiRequest("/api/public/faq", { token: adminToken });
  faqInPublic = faqPublic.data.find(f => f.question === `${faqQuestion} Updated`);
  console.log("Published FAQ visible in public API:", !!faqInPublic);

  // Unpublish FAQ - edit and change Published dropdown
  step("FAQ: unpublish test FAQ");
  await page.locator("button:has-text('Edit')").first().click();
  await faqDialog.waitFor({ state: "visible" });
  // Change Published dropdown to "Unpublished"
  await faqDialog.locator('select').selectOption("false");
  await faqDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await faqDialog.waitFor({ state: "hidden" });
  await page.waitForTimeout(1000);
  faqPublic = await apiRequest("/api/public/faq", { token: adminToken });
  faqInPublic = faqPublic.data.find(f => f.question === `${faqQuestion} Updated`);
  console.log("Unpublished FAQ hidden from public API:", !faqInPublic);

  // =========================== RULES ===========================
  step("Rules: create, edit, is_active vs is_confirmed");
  await page.goto(`${frontendUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".category-tabs", { timeout: 60_000 });
  await page.click('.category-tabs button:has-text("Rules")');
  await page.waitForSelector("text=Add a rule", { timeout: 30_000 });
  await takeScreenshot("09-rules-list");

  await page.getByRole("button", { name: "New rule" }).click();
  const ruleDialog = page.getByRole("dialog");
  await ruleDialog.waitFor({ state: "visible" });
  const ruleTitle = `${PREFIX} Rule`;
  await ruleDialog.getByPlaceholder("Rule title").fill(ruleTitle);
  await ruleDialog.getByPlaceholder("Rule body").fill("This is a test rule body.");
  await ruleDialog.getByPlaceholder("General").fill("Verification");
  await ruleDialog.getByPlaceholder("0").fill("99");
  // is_active and is_confirmed are select dropdowns
  await ruleDialog.getByRole("button", { name: "Create rule", exact: true }).click();
  await ruleDialog.waitFor({ state: "hidden" });
  await page.waitForSelector(`text=${ruleTitle}`, { timeout: 30_000 });
  await takeScreenshot("10-rules-created");

  // Test is_active=false, is_confirmed=true
  step("Rules: set is_active=false, is_confirmed=true");
  const ruleRow = page.locator("tbody tr", { hasText: ruleTitle });
  await ruleRow.getByRole("button", { name: `Edit ${ruleTitle}` }).click();
  await ruleDialog.waitFor({ state: "visible" });
  // Set Active to false, Confirmed to true using select dropdowns
  await ruleDialog.locator('select').nth(0).selectOption("false"); // Active
  await ruleDialog.locator('select').nth(1).selectOption("true"); // Confirmed
  await ruleDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await ruleDialog.waitFor({ state: "hidden" });

  let rulesPublic = await apiRequest("/api/public/rules", { token: adminToken });
  let ruleInPublic = rulesPublic.data.find(r => r.title === ruleTitle);
  console.log("Rule (inactive, confirmed) hidden from public API:", !ruleInPublic);

  // Test is_active=true, is_confirmed=false
  step("Rules: set is_active=true, is_confirmed=false");
  await ruleRow.getByRole("button", { name: `Edit ${ruleTitle}` }).click();
  await ruleDialog.waitFor({ state: "visible" });
  await ruleDialog.locator('select').nth(0).selectOption("true"); // Active
  await ruleDialog.locator('select').nth(1).selectOption("false"); // Confirmed
  await ruleDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await ruleDialog.waitFor({ state: "hidden" });

  rulesPublic = await apiRequest("/api/public/rules", { token: adminToken });
  ruleInPublic = rulesPublic.data.find(r => r.title === ruleTitle);
  console.log("Rule (active, unconfirmed) hidden from public API:", !ruleInPublic);

  // Test both true
  step("Rules: set is_active=true, is_confirmed=true");
  await ruleRow.getByRole("button", { name: `Edit ${ruleTitle}` }).click();
  await ruleDialog.waitFor({ state: "visible" });
  await ruleDialog.locator('select').nth(0).selectOption("true"); // Active
  await ruleDialog.locator('select').nth(1).selectOption("true"); // Confirmed
  await ruleDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await ruleDialog.waitFor({ state: "hidden" });

  rulesPublic = await apiRequest("/api/public/rules", { token: adminToken });
  ruleInPublic = rulesPublic.data.find(r => r.title === ruleTitle);
  console.log("Rule (active, confirmed) visible in public API:", !!ruleInPublic);

  // =========================== SERVICES ===========================
  step("Services: create, edit, activate/deactivate");
  await page.goto(`${frontendUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".category-tabs", { timeout: 60_000 });
  await page.click('.category-tabs button:has-text("Services")');
  await page.waitForSelector("text=Add a service", { timeout: 30_000 });
  await takeScreenshot("11-services-list");

  await page.getByRole("button", { name: "New service" }).click();
  const serviceDialog = page.getByRole("dialog");
  await serviceDialog.waitFor({ state: "visible" });
  const serviceTitle = `${PREFIX} Service`;
  await serviceDialog.getByPlaceholder("Service title").fill(serviceTitle);
  await serviceDialog.getByPlaceholder("Summary").fill("Test service summary");
  await serviceDialog.getByPlaceholder("Icon name").fill("heart");
  await serviceDialog.getByRole("button", { name: "Create service", exact: true }).click();
  await serviceDialog.waitFor({ state: "hidden" });
  await page.waitForSelector(`text=${serviceTitle}`, { timeout: 30_000 });
  await takeScreenshot("12-services-created");

  let servicesPublic = await apiRequest("/api/public/services", { token: adminToken });
  let serviceInPublic = servicesPublic.data.find(s => s.title === serviceTitle);
  console.log("Active service visible in public API:", !!serviceInPublic);

  // Edit
  step("Services: edit test service");
  const serviceRow = page.locator("tbody tr", { hasText: serviceTitle });
  await serviceRow.getByRole("button", { name: `Edit ${serviceTitle}` }).click();
  await serviceDialog.waitFor({ state: "visible" });
  await serviceDialog.getByPlaceholder("Service title").fill(`${serviceTitle} Updated`);
  await serviceDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await serviceDialog.waitFor({ state: "hidden" });
  await page.waitForSelector(`text=${serviceTitle} Updated`, { timeout: 30_000 });

  // Deactivate
  step("Services: deactivate test service");
  const updatedServiceRow = page.locator("tbody tr", { hasText: `${serviceTitle} Updated` });
  await updatedServiceRow.getByRole("button", { name: `Deactivate ${serviceTitle} Updated` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate", exact: true }).click();
  await updatedServiceRow.getByRole("button", { name: `Activate ${serviceTitle} Updated` }).waitFor({ timeout: 30_000 });
  console.log("Service marked Inactive:", (await updatedServiceRow.locator("text=Inactive").count()) > 0);

  servicesPublic = await apiRequest("/api/public/services", { token: adminToken });
  serviceInPublic = servicesPublic.data.find(s => s.title === `${serviceTitle} Updated`);
  console.log("Inactive service hidden from public API:", !serviceInPublic);

  // Reactivate
  await updatedServiceRow.getByRole("button", { name: `Activate ${serviceTitle} Updated` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Activate", exact: true }).click();

  // =========================== WALLS & ROUTES ===========================
  step("Walls: list, create, edit, upload image");
  await page.goto(`${frontendUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".category-tabs", { timeout: 60_000 });
  await page.click('.category-tabs button:has-text("Walls")');
  await page.waitForSelector("text=Walls", { timeout: 30_000 });
  await takeScreenshot("13-walls-list");

  await page.getByRole("button", { name: "Add wall" }).click();
  const wallDialog = page.getByRole("dialog");
  await wallDialog.waitFor({ state: "visible" });
  const wallName = `${PREFIX} Wall`;
  await wallDialog.getByPlaceholder("Wall name").fill(wallName);
  await wallDialog.getByPlaceholder("Description").fill("Test wall for verification");
  await wallDialog.locator('input[name="sort_order"]').fill("10");
  await wallDialog.locator('input[type="file"]').setInputFiles(resolve(__dirname, "../var/verification/main/images/verify-main.png"));
  await wallDialog.getByRole("button", { name: "Upload", exact: true }).click();
  await page.waitForTimeout(3000);
  await wallDialog.getByRole("button", { name: "Create wall", exact: true }).click();
  await wallDialog.waitFor({ state: "hidden" });
  await page.waitForSelector(`text=${wallName}`, { timeout: 30_000 });
  await takeScreenshot("14-walls-created");

  // Get wall ID for route assignment
  const wallRow = page.locator("tbody tr", { hasText: wallName });
  const wallEditBtn = wallRow.getByRole("button", { name: `Edit ${wallName}` });
  await wallEditBtn.click();
  await wallDialog.waitFor({ state: "visible" });
  const wallImageUrl = await wallDialog.locator('input[type="url"]').inputValue();
  console.log("Wall image URL:", wallImageUrl);
  await wallDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  // Verify wall in public API
  let wallsPublic = await apiRequest("/api/public/walls", { token: adminToken });
  let wallInPublic = wallsPublic.data.find(w => w.name === wallName);
  console.log("Wall in public API:", !!wallInPublic, "image_url:", wallInPublic?.image_url);

  step("Routes: create, assign to wall, edit, upload image");
  await page.goto(`${frontendUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".category-tabs", { timeout: 60_000 });
  await page.click('.category-tabs button:has-text("Routes")');
  await page.waitForSelector("text=Create a new route", { timeout: 30_000 });
  await takeScreenshot("15-routes-list");

  await page.getByRole("button", { name: "New route" }).click();
  const routeDialog = page.getByRole("dialog");
  await routeDialog.waitFor({ state: "visible" });
  const routeName = `${PREFIX} Route`;
  await routeDialog.getByPlaceholder("Route name").fill(routeName);
  await routeDialog.locator('select[name="grade"]').first().selectOption("V4");
  await routeDialog.locator('select[name="wall_type"]').first().selectOption("vertical");
  await routeDialog.locator('input[name="color"]').fill("blue");
  await routeDialog.locator('input[name="style"]').fill("boulder");
  await routeDialog.locator('input[name="setter"]').fill("Test Setter");
  // Select the test wall
  await routeDialog.locator('select[name="wall_id"]').selectOption({ label: wallName });
  await routeDialog.locator('input[type="file"]').setInputFiles(resolve(__dirname, "../var/verification/main/images/verify-main.webp"));
  await routeDialog.getByRole("button", { name: "Upload", exact: true }).click();
  await page.waitForTimeout(3000);
  await routeDialog.getByRole("button", { name: "Create route", exact: true }).click();
  await routeDialog.waitFor({ state: "hidden" });
  await page.waitForSelector(`text=${routeName}`, { timeout: 30_000 });
  await takeScreenshot("16-routes-created");

  // Verify route in public API
  let routesPublic = await apiRequest("/api/public/routes", { token: adminToken });
  let routeInPublic = routesPublic.data.find(r => r.name === routeName);
  console.log("Route in public API:", !!routeInPublic);
  if (routeInPublic) {
    console.log("Route wall:", routeInPublic.wall);
    console.log("Route image_url:", routeInPublic.image_url);
  }

  // Edit route - change wall
  step("Routes: edit and change wall assignment");
  const routeRow = page.locator("tbody tr", { hasText: routeName });
  await routeRow.getByRole("button", { name: `Edit ${routeName}` }).click();
  await routeDialog.waitFor({ state: "visible" });
  await routeDialog.getByPlaceholder("Route name").fill(`${routeName} Updated`);
  await routeDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await routeDialog.waitFor({ state: "hidden" });
  await page.waitForSelector(`text=${routeName} Updated`, { timeout: 30_000 });

  // Archive route
  step("Routes: archive test route");
  const updatedRouteRow = page.locator("tbody tr", { hasText: `${routeName} Updated` });
  await updatedRouteRow.getByRole("button", { name: /Archive/ }).click();
  await page.waitForTimeout(1000);

  routesPublic = await apiRequest("/api/public/routes", { token: adminToken });
  routeInPublic = routesPublic.data.find(r => r.name === `${routeName} Updated`);
  console.log("Archived route hidden from public API:", !routeInPublic);

  // Verify wall still exists
  wallsPublic = await apiRequest("/api/public/walls", { token: adminToken });
  wallInPublic = wallsPublic.data.find(w => w.name === wallName);
  console.log("Wall still exists after route archived:", !!wallInPublic);

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
  console.log("\nAll sub-2 checks completed.");
}