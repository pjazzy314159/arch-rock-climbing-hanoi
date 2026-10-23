# ARCH Climbing Gym Platform

A web platform for **ARCH Rock Climbing Hanoi** to present its services, improve customer engagement, and support selected day-to-day gym operations.

> **Important for AI coding agents:** The frontend may already have been generated with Lovable and pulled into this repository. Inspect and reuse the existing project before making architectural decisions. Do not rebuild or replace working pages just to match your preferred stack.

## 1. Project Goals

The platform has three main goals:

1. **Help customers discover ARCH and its services.** Provide a clear, mobile-friendly website with useful information about the gym, climbing services, courses, rules, prices, opening hours, and events.
2. **Improve customer engagement and gym operations.** Provide customer-facing climbing features and practical tools for staff and administrators.
3. **Provide first-line customer support.** Integrate an AI assistant that answers common questions using information approved by ARCH.

The website is the core product. E-commerce is secondary, and AI is one feature of the platform rather than the whole project.

## 2. Instructions for OpenCode / AI Coding Agents

Before changing code:

1. Inspect the repository structure, Git status, README files, package manifests, framework, routes, components, styling system, and any existing API integration.
2. Identify which parts of the Lovable-generated frontend are functional, incomplete, mocked, or duplicated. Keep working UI and components wherever practical.
3. Summarise the current architecture and propose the smallest safe set of changes. Do not migrate frameworks or replace the frontend without a concrete technical reason.
4. Check for existing project instructions such as `AGENTS.md`, and follow them.
5. Implement in small, verifiable steps. Run available linting, type checks, tests, and build commands after changes. Report commands that could not be run and why.

### Development rules

- **Preserve the existing frontend.** Do not restart from a blank template or rewrite all Lovable code. Refactor only where needed.
- **Inspect before adding dependencies.** Reuse existing libraries and established project patterns where reasonable.
- **Separate concerns.** Keep UI components, API calls, business logic, and data models organised rather than putting everything into large page components.
- **Use real backend contracts.** Do not treat hard-coded demo data or local browser state as production persistence or secure authentication.
- **Be explicit about unfinished work.** Do not show mock features as if they were connected to a real backend. Label demo data and TODOs clearly.
- **Keep the app runnable.** Update setup instructions and environment-variable examples whenever configuration changes.
- **Do not invent ARCH information.** Do not fabricate prices, opening hours, contact details, policies, course information, or event data. Use configurable placeholders until ARCH supplies the real information.
- **Avoid unrelated changes.** Keep changes focused on the requested feature and preserve existing behaviour unless a change is necessary.

## 3. Preferred Technical Direction

The current repository is the source of truth for the frontend stack. Keep the stack produced by Lovable unless inspection reveals a practical blocker.

For backend work, the preferred direction is:

- **Backend:** Python with FastAPI.
- **Database:** PostgreSQL.
- **API:** REST endpoints with request validation and documented schemas.
- **Frontend integration:** A small, centralised API client/service layer that uses environment-based API URLs.
- **Media:** Use a storage abstraction for images and videos; do not store large media files directly in database rows.
- **Deployment:** Keep configuration portable and document local development and production deployment separately.

These are preferences, not a reason to force a migration. If the repository already contains a working backend or a database integration, inspect it first and explain any proposed change before replacing it.

## 4. User Roles

The system may support the following roles:

- **Visitor:** Views public pages, services, route information, and public events; can use public customer-support features.
- **Customer / Member:** Accesses authorised customer features, route interactions, climbing records or rankings, and their own account information.
- **Staff:** Views assigned tasks and checklists, and accesses the operational information required for their duties.
- **Administrator:** Manages users and roles, customer records, route information, staff tasks, events, and other authorised content.

Enforce permissions on the backend, not only by hiding frontend buttons or routes. A user must not be able to access another user's private information by changing a URL or API request.

## 5. Functional Scope and Priorities

### P0 — Core website and maintainable foundation

- Public pages presenting ARCH, facilities, climbing services, courses, rules, prices, opening hours, and contact information.
- Responsive layouts that work on mobile and desktop.
- Clear navigation and calls to action for prospective customers.
- Reusable UI components and a maintainable structure that builds successfully.
- A central place to manage public content, using real persistence where the feature requires it.

### P1 — Customer and climbing features

- Customer/member account and profile features, subject to confirmed requirements.
- Customer records and safety-agreement workflows, if confirmed by ARCH. Clarify whether the required workflow is digital signing, document upload, status tracking, or another process before implementing it.
- Climbing route directory and route status, with authorised staff able to update route information.
- Climbing achievements and a leaderboard based on clearly defined rules.
- Route difficulty voting. The proposed voting flow asks for the climber's current climbing level and may ask for height and weight. Confirm these fields and their purpose with ARCH before making them mandatory or storing them. Collect only data that is necessary for the agreed feature.

### P1 — Staff and administrator operations

- Admin tools to assign tasks to staff.
- Staff view of assigned tasks and checklists, with status updates.
- Basic staff scheduling and event management, if these workflows are confirmed by ARCH.
- Role-based access to staff and admin features.

### P1 — AI customer-support assistant

- An assistant embedded in the website that answers common questions about ARCH services, gym rules, courses, and other approved information.
- Keep the assistant's knowledge source separate from UI code so ARCH's information can be updated.
- Prefer a free or free-tier integration where practical, but verify current limits and setup requirements before choosing a provider.
- Keep provider/API credentials on the server and load them from environment variables. Never expose secrets in frontend code or commit them to Git.
- If no AI provider is configured, show a clear unavailable state or use a clearly identified FAQ fallback. Do not pretend that generated or hard-coded replies came from a live AI service.
- The assistant should acknowledge uncertainty and direct users to staff when the answer is not covered by approved information. It must not invent prices, policies, or bookings.

### P2 — Secondary features

- Product catalogue and basic product detail pages.
- E-commerce or online purchasing only if ARCH confirms the need and the implementation scope is realistic.
- Additional media management, route media, and richer visualisations where time permits.

Priorities are provisional. Confirm the MVP with ARCH before committing to every item above. Do not start payment integration or complex AI features before core requirements, security, and persistence are working.

## 6. Route Voting and Leaderboard Rules

Treat route voting and rankings as gym-specific business logic, not just visual widgets.

Before implementing the final behaviour, establish with ARCH:

- How routes are identified and how a route's active/removed status is updated.
- Who can create, edit, archive, or reset a route.
- Whether customers vote on perceived difficulty, report a completion, or both.
- Whether voting requires a signed-in account and whether repeat votes are allowed.
- How a person's climbing level is represented and how votes affect a displayed grade.
- What counts toward the leaderboard, how ties are handled, and whether rankings reset periodically.
- Whether height and weight are genuinely needed for voting. Avoid collecting or exposing these values unless there is a clear, approved purpose.

Keep an auditable distinction between the official grade assigned by the gym and customer-submitted difficulty feedback unless ARCH explicitly specifies another approach.

## 7. Security, Privacy, and Data Integrity

- Store passwords using a recognised password-hashing mechanism; never store plain-text passwords.
- Enforce authentication, role-based authorisation, and ownership checks on the backend.
- Validate all API input on the server and handle errors without leaking secrets or internal stack traces.
- Keep secrets and environment-specific configuration out of source control. Provide a `.env.example` with placeholder values only.
- Protect customer records, agreements, staff schedules, and other non-public data from unauthorised access.
- Collect the minimum personal data needed for an agreed purpose. Do not expose private customer information in public leaderboards or logs.
- Use safe defaults for file uploads, including type/size validation and controlled storage access.
- Add appropriate loading, empty, error, and permission-denied states to the UI.
- Do not claim legal compliance merely because a security feature has been implemented. Document privacy-related assumptions and items that need ARCH's or the institution's review.

## 8. Suggested Data Domains

Final entities and relationships must be derived from confirmed workflows. Likely domains include:

- Users, roles, and customer profiles.
- Customer agreements or agreement status/history, depending on the confirmed signing workflow.
- Routes, route versions or resets, route status, grades, and media.
- Route votes and climbing achievements, with clear rules for deduplication and ranking.
- Staff assignments, tasks, checklists, schedules, and events.
- Public content such as services, courses, FAQs, prices, and opening hours.
- AI assistant knowledge sources and interaction metadata where necessary.
- Products and orders only if e-commerce is included in the agreed scope.

Do not create every table in advance. Design the schema around the MVP workflows and use migrations for database changes.

## 9. Recommended Implementation Order

1. **Repository audit:** Inspect the Lovable project, run it, record its current state, and identify existing pages and mocked features.
2. **Public website:** Preserve and complete the public-facing pages and responsive navigation.
3. **Requirements and data model:** Confirm roles and MVP workflows; define the smallest viable schema and API contracts.
4. **Backend foundation:** Set up configuration, database connection, migrations, validation, error handling, and authentication/authorisation if accounts are in scope.
5. **Customer and route workflows:** Implement the agreed customer records, route status, voting, and ranking rules.
6. **Staff/admin workflows:** Add staff tasks, checklists, and event/schedule features that ARCH has confirmed.
7. **AI assistant:** Integrate the selected provider through a server-side endpoint and test it against a small, approved FAQ test set.
8. **Secondary features:** Add media and e-commerce features only after the MVP is stable.
9. **Validation and handover:** Run tests and build checks, fix critical issues, document limitations, and prepare setup/deployment instructions.

At the end of each step, report what changed, what was tested, remaining issues, and the next smallest useful step. Do not claim a feature is complete unless it has been implemented and verified.

## 10. Quality and Acceptance Checklist

A feature should not be considered complete until relevant items below have been checked:

- [ ] Existing frontend functionality has not been unnecessarily replaced.
- [ ] The app runs using the documented setup steps.
- [ ] The UI works at common mobile and desktop widths.
- [ ] Loading, empty, error, and unauthorised states are handled.
- [ ] Data that must persist is saved through the appropriate backend/database path.
- [ ] Backend permissions and input validation are implemented where applicable.
- [ ] Secrets are not exposed in the browser or committed to the repository.
- [ ] Tests, linting, type checks, and production build pass where configured.
- [ ] Documentation and `.env.example` reflect the current implementation.
- [ ] Mocked or incomplete functionality is explicitly documented.

## 11. Configuration and Local Development

Normal local development uses **PostgreSQL 18.6**. SQLite is kept for isolated
tests and as an explicit recovery fallback. The full instructions, including
the one-time database and role setup, are in
[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md). The short version:

```powershell
# Create arch_dev_pg and the restricted arch_dev role once (LOCAL_DEVELOPMENT.md §3)
Copy-Item .env.example .env
# Set DATABASE_URL to postgresql+psycopg://arch_dev:<password>@127.0.0.1:5432/arch_dev_pg

bun.cmd install
cd backend
uv sync --extra dev
uv run alembic upgrade head
uv run python -m app.seed --demo
uv run uvicorn app.main:app --reload --port 8000   # terminal 1
```

```powershell
# From the repository root, in a second terminal
bun.cmd run dev
```

- Website: <http://localhost:8080>
- API: <http://localhost:8000>
- Health check: <http://localhost:8000/api/health> — it must report
  `"database": "postgresql"` and `"database_reachable": true`.
- API documentation: <http://localhost:8000/docs>

Run the backend checks from `backend/` with `uv run ruff check .`,
`uv run ruff format --check .`, `uv run pytest` and `uv run alembic check`.
PostgreSQL integration tests are opt-in through `ARCH_TEST_POSTGRES_URL` and a
disposable database named `arch_dev_pg_test`. Frontend checks are
`bun.cmd run typecheck`, `bun.cmd run lint`, `bun.cmd run test` and
`bun.cmd run build`.

Commit `.env.example`, never a real `.env` file or real credentials. The API
does not silently fall back to SQLite when a configured PostgreSQL connection
fails; `/api/health` reports the failure instead.

## 12. Project Decisions to Confirm with ARCH

Keep an explicit list of open questions and avoid silently deciding business rules. At minimum, confirm:

- Required public pages and the correct service information.
- How customer agreements should be signed, stored, and retrieved.
- The exact definition of route status, route difficulty voting, and leaderboard scoring.
- Which customer and staff workflows are essential for the first release.
- Whether staff schedules are simple assignments or require shift planning and availability.
- Which FAQs and official information the AI assistant may use.
- Whether online payment/e-commerce is needed now or can wait.
- Which personal data is necessary and who is authorised to access it.

---

## Project Status

This README is the project brief and implementation guide. The current verified state, test evidence and remaining work are recorded in [PLAN.md](PLAN.md); local setup is in [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).
