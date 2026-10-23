# ARCH OS — Final Cross-Feature Regression Report

Date: 2026-10-23

This is the Phase 3 closing regression sweep. It records checks that were
actually run against the repository at commit `95c357b` plus the two small
regression fixes described below. Earlier screenshots and counts were not
reused as proof.

## Environment and data safety

- Branch: `main`
- Application database for read-only checks and the ordinary API: PostgreSQL
  18.6, database `arch_dev_pg`, role `arch_dev`
- Disposable database for mutating browser checks and PostgreSQL integration
  tests: `arch_dev_pg_test` (not `arch_dev_pg`)
- The development database was not reset, recreated, downgraded or overwritten.
- The browser API was started with `DATABASE_URL` pointed at
  `arch_dev_pg_test`; `/api/health` reported
  `{"status":"ok","database":"postgresql","database_reachable":true}`.
- `arch_dev_pg_test` was migrated to head and seeded twice. Counts were identical
  after both seeds (3 users, 6 routes before the mutating checks).
- `backend/arch_dev.db` was not written. Its SHA-256 remains
  `4E6D6D96ED416579CF9E6AC4C30A60323751917500C429D70423FBD107DB1B98`;
  it still contains 8 users, 6 routes, 12 achievements and 6 votes.

## Automated checks

All commands were run from the repository unless stated otherwise.

### Backend

| Check | Result |
| --- | --- |
| `uv run ruff check .` | Clean |
| `uv run ruff format --check .` | 61 files already formatted |
| `uv run pytest` | **214 passed, 2 skipped** |
| `uv run alembic check` | No new upgrade operations detected |
| Opt-in PostgreSQL tests | **2 passed** against `arch_dev_pg_test` |

The ordinary skipped tests are opt-in PostgreSQL integration tests. They create
and drop temporary PostgreSQL schemas and require `ARCH_TEST_POSTGRES_URL`.

### Frontend

| Check | Result |
| --- | --- |
| `bun.cmd run typecheck` | Clean |
| `bun.cmd run lint` | 0 errors; 7 pre-existing `react-refresh` warnings |
| `bun.cmd run test` | **158 passed in 17 files** |
| `bun.cmd run build` | Production client, SSR and Nitro build succeeded |

### PostgreSQL facts

- `current_database()`: `arch_dev_pg`
- `current_user`: `arch_dev`
- `server_version`: `18.6` (`server_version_num` `180006`)
- Alembic head: `83693e68129f`
- Health endpoint: PostgreSQL reachable; no SQLite fallback

## Browser checks

Playwright checks were run against the Vite development server on
`http://localhost:8080` with the API on `http://127.0.0.1:8010` and the
disposable PostgreSQL database.

- **Public pages:** all 20 routes clean, including the public route page,
  leaderboard, shop, courses, events, contact, sign-in, member, staff and admin
  routes. No console, hydration or network failures.
- **Viewports:** desktop `1440x900` and mobile `390x844`; horizontal overflow was
  measured as 0px on the member dashboard, logbook, leaderboard and route
  overlay.
- **Member dashboard:** anonymous, empty, populated, unavailable and retry
  states passed. The first climb, flash distinction, recent attempts, link to
  the route, six headline metrics, grade statistics, rank and scoring
  explanation were checked.
- **Member flows:** logging from the dashboard and from a route page, reload
  persistence, leaderboard rank agreement, unavailable-rule state and mobile
  layouts all passed.
- **Route directory/cards:** filters, reset, route cards, images, statuses and
  live route counts passed.
- **Route setting:** at desktop and phone width, creation of three holds,
  start/middle/finish roles, canvas labels, save, reload, undo, staff
  publication refusal, admin publication, public draft privacy and published
  sequence read-back passed.
- **Published overlay:** **26/26 checks passed** at `1440x900` and `390x844`:
  published-only boxes, coordinates inside the photograph, decorative layer,
  text order, unsigned-user sign-in prompt, route navigation and empty state.
- **Member regression:** **19/19 checks passed**, including the published
  overlay, beta link pre-selection, leaderboard explanation and mobile route
  page.
- **Admin/staff workflows:** staff tasks, route creation, wall holds, events,
  contact inbox handling and permission boundaries passed.
- **Contact form:** submission and authorised admin inbox handling passed.
- **Assistant:** approved ARCH/climbing answers and refusal of unsupported
  questions passed. The local API reported `llm_enabled: false`, so this verifies
  the deterministic fallback, not a live external model.
- **Voting:** member vote cast, replacement/withdrawal and route tally passed.

## Defects found and fixed

### Published overlay query invalidation — medium

After an administrator published a hold set, the editor invalidated
`["route-setting", "public-holds", routeId]`, while the member overlay reads
`["arch", "route-holds", routeId]`. A member overlay already cached in the same
session could stay stale until a full reload. Fixed in
`src/components/arch/route-setting.tsx`; the browser overlay and route-setting
checks pass after the fix.

### Member dashboard check used a stale control type — low (test script)

`scripts/check-member-dashboard.mjs` looked for a link named “Log an attempt”.
The implemented empty/populated dashboard action is a button that opens the
shared “Log a climb” dialog, not a link that navigates to the logbook. The
script now checks the button, keyboard focus, the dialog, and closes it. This
was a test-coverage defect, not an application regression.

## Outstanding risks

- Phase 4 will replace the current administrator member list, which loads up to
  50 users, filters only in the browser in the UI, has no pagination metadata
  and builds one agreement/send query per row. The backend remains authorised,
  but the current list is not suitable for a growing customer database.
- The administrator page briefly renders its permission-denied state while the
  session is being restored. This is a UI-state issue, not an authorization
  bypass; it should be corrected with the Phase 4 workspace.
- Route-detail loader errors are currently presented as a not-found page rather
  than a distinct backend-unavailable state. No data or permission problem was
  observed.
- A deliberate failure of PostgreSQL returns a degraded health response with no
  SQLite fallback. Production backup/restore, HA, monitoring and a
  production-scoped role remain outside this phase.
- The shared wall-hold geometry limitation recorded under Task 2B.3 is
  unchanged.

## Phase 3 conclusion

All required Phase 3 database, migration, seeding, API, browser, backend and
frontend checks pass. No required data-handover or database task remains
unfinished for this phase. Phase 3 is complete.
