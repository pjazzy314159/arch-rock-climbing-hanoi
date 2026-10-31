# ARCH Seed Data Safety Audit

**Date:** 2026-10-31
**Scope:** Base seed, demo seed, migrations, startup/deployment paths, public API/frontend/Assistant exposure, and gym placeholder logic.
**Status:** Audit complete. No application code, seed behaviour, database records, or deployments were changed.

## 1. Executive summary

The base seed is **not** run automatically by application startup, the Cloudflare Worker, local start scripts, or any CI/CD workflow found in the repository. However, the production deployment documentation explicitly instructs an operator to run it against the production database, and the base seed has **no production environment guard**.

That base seed inserts business-facing content that ARCH has not approved:

- 12 FAQ entries, all with `is_published=true`.
- 6 active rules with `is_confirmed=false`.
- 6 active services.
- 7 closed opening-hour rows with a "to be confirmed" note.
- A gym profile containing `600 m²`, `64 routes`, a tagline, an about text, and an opening note.

The public API filters FAQ by `is_published`, rules and services by `is_active`, and serves all opening hours. The frontend renders the seeded rules with a `DRAFT` badge, but renders services and gym details as live ARCH information. The Assistant retrieves the seeded FAQ, rules, hours, and services, returns a matching published FAQ answer verbatim, and prefixes its answers with a disclaimer that they are based on "approved ARCH information only".

The gym placeholder flag is the most serious presentation defect. `is_placeholder` becomes `false` as soon as `opening_note` is non-empty **or any opening-hour row exists**. The base seed always writes both, so `/visit` displays `600 m² of climbing space`, `64 routes on the wall`, and the label "These details are published by ARCH." even when ARCH has confirmed nothing.

Local verification databases confirm these exact values. **Production database content remains unverified**: no production connection was attempted and no production credentials were used.

## 2. Every seed execution path

| Path | Location | Runs automatically? | What it does |
| --- | --- | --- | --- |
| Seed CLI | `backend/src/app/seed.py:612` (`main`) | No, manual only: `python -m app.seed` | Runs Alembic `upgrade head`, then base seed, then optional demo seed in one content transaction. |
| Reset flag | `backend/src/app/seed.py:594` (`_migrate(reset=True)`) | No, manual `--reset` | Runs `alembic downgrade base`, then upgrades again. This destroys all existing data by definition. |
| Demo flag | `backend/src/app/seed.py:319` (`_seed_demo`) | No, manual `--demo` only | Adds sample walls, routes, products, course, event, accounts, achievements, votes and a staff task. |
| FastAPI startup | `backend/src/app/main.py:27` (`lifespan`) | No | Only logs startup/shutdown. No seed, migration or content creation. |
| Cloudflare Worker entry | `backend/src/worker.py` | No | Imports the FastAPI `app` and exposes the ASGI adapter. No seed. |
| Local server | `backend/run_server.py` | No | Starts uvicorn with reload on `127.0.0.1:8000`. No seed. |
| Windows verification launcher | `backend/start_backend.bat` | No | Sets a local SQLite `DATABASE_URL` and starts uvicorn. No seed. |
| Alembic migrations | `backend/migrations/versions/9d1c4f8ab207_add_walls_and_route_types.py:93-128` | Yes, whenever `alembic upgrade head` runs | Inserts three named walls with descriptions (`The Main Wall`, `The Slab`, `The Cave`). Walls are public. |
| Tests | `backend/tests/test_seed.py`, `backend/tests/test_security.py` | Test runner only | Call `_seed_demo` directly against the isolated in-memory SQLite database from `conftest.py`. No production path. |
| Deployment documentation | `DEPLOYMENT.md:86-92`, `backend/README.md:40-52` | Operator action | Tells the operator to run `uv run python -m app.seed`; `DEPLOYMENT.md` places it directly after production migration instructions. |
| Cloudflare deployment guide | `backend/DEPLOY_CLOUDFLARE.md:269-276` | Operator action | Warns against `--demo` in production but describes the base seed as "structural data only". |
| Docker / Compose / Procfile / CI | None found | Not applicable | No `.github` directory, Dockerfile, Compose file, Procfile, Render or Fly configuration exists. Frontend `package.json` scripts build/test the frontend only. |

There is no runtime code path that calls `main()` or any `_seed_*` function outside the CLI and tests.

## 3. Can production execute the seed?

**Yes, through manual or operator action, and the documentation currently recommends it.**

- `DEPLOYMENT.md` places `uv run python -m app.seed` immediately after the production migration instructions, under the heading "Load the content the site needs."
- The base seed has **no environment check at all**. Only `_seed_demo` checks `is_production(get_settings().environment)` (`seed.py:325-330`).
- The demo guard checks the environment name, not the database target. Pointing `DATABASE_URL` at production while `ARCH_ENVIRONMENT=development` bypasses the guard.
- The demo guard runs after the base seed calls have been added to the session. If it raises, the outer `except` rolls back the content transaction, so the base-seed additions are also rolled back. The schema upgrade performed by `_migrate` happens before that transaction and is not rolled back. Plain `python -m app.seed` has no guard and commits normally.
- `--reset` has no guard and can downgrade a production schema, removing every table and row before re-seeding.
- Anyone with database credentials and permission to run the module can invoke it. It is not tied to the Worker, the deployment platform, or an environment allowlist.

**Conclusion:** production startup and deployment automation do not seed, but production seeding is possible and is explicitly documented. The safety of production therefore depends entirely on operator discipline, not on a technical control.

## 4. Repeat runs and overwriting existing ARCH data

| Seed group | Repeat behaviour | Risk to real ARCH data |
| --- | --- | --- |
| Gym profile (`_seed_gym`) | If row 1 is missing, insert. Otherwise overwrite every key in `GYM` on every run: name, tagline, about, `surface_area_m2`, `route_count`, `opening_note`. | **High.** A production run would replace real ARCH gym details with the sample values. This is the only base-seed group that unconditionally overwrites existing data. |
| Services | Insert only when the table is completely empty. | No overwrite, but an empty table is filled with unapproved services. |
| Rules | Insert only when the table is completely empty. | No overwrite, but an empty table is filled with 6 active, unconfirmed rules. |
| FAQ | Insert only when the table is completely empty. | No overwrite, but an empty table is filled with 12 published, unapproved FAQ entries. |
| Opening hours | Insert only when the table is completely empty. | No overwrite, but an empty table is filled with 7 closed placeholder rows. |
| Demo walls | Updates description and sort order for existing wall names; sets `image_url` only when empty; creates missing walls. | Can modify real wall descriptions and ordering. |
| Demo routes, products, course, event | Insert only when the corresponding table is completely empty. | Adds public sample content to an empty production catalogue. |
| Demo accounts | Creates accounts only when the email does not exist. | Creates known-password accounts if run against production. |
| Achievements, route votes, staff task | Insert only when the table is completely empty. | Adds sample member activity. |

A repeat run against a populated database is mostly a no-op for content tables, but it is not safe: it still overwrites the gym profile and can still add demo content where a table happens to be empty.

The seed source labels the gym/services/rules/FAQ block "Content that is safe to publish" (`seed.py:62`). That is an internal assumption, not ARCH approval, and it is the assumption this audit rejects.

## 5. Public exposure matrix

### FAQ — 12 published entries

- **Seed:** `FAQ_ENTRIES` (`seed.py:153-248`); inserted with `is_published=True` (`seed.py:283-295`).
- **API:** `GET /api/public/faq` filters `FaqEntry.is_published.is_(True)` (`public.py:130-136`). The Assistant endpoint also loads only published entries (`assistant.py:38-40`) and retrieval filters the same way (`retrieval.py:365-371`).
- **Frontend:** no standalone `/faq` route was found. The FAQ management page says published entries appear on the public site and in the assistant. In practice the public FAQ API exists and the Assistant widget uses the Assistant endpoint.
- **Assistant:** a strong FAQ match is returned verbatim as the answer (`assistant.py:346-352`) with mode `knowledge_base` and a disclaimer saying answers use "approved ARCH information only".
- **Exposure:** **Yes, public and presented as approved.** Seeded answers include facility and commercial claims such as "climbing shoes can be hired at reception", "a member of staff will show you how the mats... work", "V0 to V8", "ARCH runs introductory and progressing courses", "ARCH runs community sessions and competitions", and "Every member signs a safety agreement". Several include "being confirmed by ARCH", but the surrounding answer still states the claim and the direct-match path adds no draft label.

### Rules — 6 active, 0 confirmed

- **Seed:** `DRAFT_RULES` (`seed.py:112-151`) inserted with `is_active=True`, `is_confirmed=False` (`seed.py:267-280`).
- **API:** `GET /api/public/rules` filters only `is_active` (`public.py:121-127`). `is_confirmed` does not gate visibility.
- **Frontend:** `/visit` renders active rules and adds a `DRAFT` badge when `is_confirmed` is false (`content-pages.tsx:175-177`).
- **Assistant:** retrieval includes all active rules and appends `(Draft — awaiting ARCH confirmation)` for unconfirmed rules (`retrieval.py:318-360`).
- **Exposure:** **Yes, public**, but visibly labelled as draft. The rules are generic safety guidance and are not presented as confirmed ARCH policy.

### Opening hours — 7 closed rows

- **Seed:** seven rows, one per day, `opens_at=09:00`, `closes_at=21:00`, `note="To be confirmed by ARCH"`, `is_closed=True` (`seed.py:298-316`).
- **API:** `GET /api/public/gym` returns all opening-hour rows without a publication filter (`public.py:59-79`).
- **Frontend:** `/visit` sees a non-empty list and renders a seven-row table. Each row shows `Closed — To be confirmed by ARCH` (`content-pages.tsx:55-66, 110-117`). The intended empty state ("Opening hours are being confirmed.") is not reached.
- **Assistant:** `retrieve_opening_hours` includes all rows for time-related questions and renders `Day N: Closed (To be confirmed by ARCH)` (`retrieval.py:283-315`).
- **Exposure:** **Yes, public.** The note is honest, but the page presents a full weekly schedule of closures rather than saying the schedule is unavailable. The rows also make `is_placeholder` false.

### Services — 6 active rows

- **Seed:** `SERVICES` (`seed.py:76-110`) inserted with default `is_active=True` (`seed.py:260-264`).
- **API:** `GET /api/public/services` filters `is_active` (`public.py:91-97`).
- **Frontend:** `/gym` renders every active service in an information grid (`public-pages.tsx:41-66`). When the API succeeds, the sample-data banner is not shown, so the grid appears as ordinary live content. The lower "Good to know" band still says facilities are illustrative, but the service grid itself carries no sample or draft marker.
- **Assistant:** `retrieve_services` includes all active services (`retrieval.py:505-543`).
- **Exposure:** **Yes, public and presented as live ARCH data.** Seeded claims include shoe rental, a training zone with boards/bands/pull-up bars, changing rooms and lockers, routes from V0 to V8, and community sessions.

### Gym profile — 600 m², 64 routes, tagline, about, opening note

- **Seed:** `GYM` (`seed.py:64-74`), written to the singleton row by `_seed_gym` (`seed.py:251-257`). There is no admin endpoint or UI for the gym profile.
- **API:** `GET /api/public/gym` returns the record and computes `is_placeholder` (`public.py:59-79`).
- **Frontend:** `/visit` displays `${surfaceAreaM2} m² of climbing space` and `${routeCount} routes on the wall` (`content-pages.tsx:196-211`). The footer text depends on `isPlaceholder` (`content-pages.tsx:212-216`).
- **Assistant:** the gym profile itself is not retrieved as a separate source, but the seed's claims overlap with FAQ and service answers.
- **Exposure:** **Yes, public.** With the base seed, the flag is `false`, so the page states "These details are published by ARCH." The `600` and `64` values are displayed unconditionally whenever present, regardless of the flag.

### Demo-only content

`--demo` adds content that is public when inserted:

- Products: `is_active` defaults to `True`; served by `/api/public/products` and product detail.
- Course: `is_active` defaults to `True`; served by `/api/public/courses`.
- Event: `is_public=True` and starts seven days in the future; served by `/api/public/events`.
- Routes and walls: active/public through the routes and walls endpoints.
- Accounts: `admin@example.com`, `staff@example.com`, `alex@example.com` with well-known development passwords. These are not public content, but they are a serious credential risk if demo data reaches a shared environment.

### Migrated walls

The `9d1c4f8ab207` migration inserts `The Main Wall`, `The Slab`, and `The Cave` with descriptions on a fresh upgrade. This happens independently of the seed and on any deployment that runs `alembic upgrade head`. Walls are public. These names are structural/sample descriptions, not confirmed ARCH facility information.

### Categories that stay empty in the base seed

Base seed does not insert prices, courses, events or products. These remain empty unless `--demo` is used or an operator enters them. That part of the current behaviour is consistent with the content policy.

## 6. Gym `is_placeholder` logic

Exact implementation (`backend/src/app/api/public.py:72-78`):

```python
payload = GymOut.model_validate(info)
payload.opening_hours = [OpeningHourOut.model_validate(h) for h in hours]
# The gym record only becomes real once ARCH supplies verified details.
payload.is_placeholder = (
    not any([payload.address, payload.phone, payload.email, payload.opening_note])
    and not payload.opening_hours
)
```

Consequences:

1. `is_placeholder` is `false` when **any** of `address`, `phone`, `email`, or `opening_note` is non-empty.
2. It is also `false` when **any** opening-hour row exists, even if every row is marked closed and says "to be confirmed".
3. `surface_area_m2`, `route_count`, `about`, `tagline`, `instagram`, `map_url`, and `name` have no effect on the flag.
4. The base seed writes `opening_note = "Opening hours are to be confirmed by ARCH."` and seven hour rows, so the flag is always `false` after a base seed.
5. A note that explicitly says the hours are unconfirmed therefore makes the gym look **more** verified, not less. This is a semantic inversion.
6. The flag does not control whether the numbers appear. `600 m²` and `64 routes` render whenever the fields are non-null; the flag only changes the caption from "Contact details are placeholders until ARCH confirms them." to "These details are published by ARCH."
7. When no gym row exists, the API returns a default `GymOut` whose `is_placeholder` defaults to `true`; the base seed prevents that honest path by always creating row 1.

**Finding:** the current flag cannot distinguish "ARCH supplied verified gym facts" from "a seed wrote a placeholder note and closed rows". It should not be treated as a verification signal.

## 7. Local database evidence and production status

Local SQLite files were opened read-only using SQLite URI `mode=ro`. No writes, migrations, or seed commands were run. Identity was confirmed by the ARCH table set (24 tables including `faq_entries`, `rules`, `services`, `opening_hours`, `gym_info`) and by exact matches with the seed constants.

| Database | FAQ total/published | Rules active/confirmed | Services active | Opening hours total/closed | Gym |
| --- | --- | --- | --- | --- | --- |
| `backend/var/arch-admin-cms-verify.db` | 16 / 16 | 6 / 0 | 6 | 9 / 6 | 600 m², 64 routes, unconfirmed note |
| `backend/var/arch-storage-config-error.db` | 12 / 12 | 6 / 0 | 6 | 7 / 7 | 600 m², 64 routes, unconfirmed note |
| `backend/var/arch-storage-write-error.db` | 12 / 12 | 6 / 0 | 6 | 7 / 7 | 600 m², 64 routes, unconfirmed note |
| `backend/var/undo-verify.db` | 12 / 12 | 6 / 0 | 6 | 7 / 7 | 600 m², 64 routes, unconfirmed note |
| `backend/arch_dev.db` | 12 / 12 | 6 / 0 | 6 | 7 / 7 | 600 m², 64 routes, unconfirmed note |
| `var/arch_undo_verify.db` | 12 / 12 | 6 / 0 | 6 | 7 / 7 | 600 m², 64 routes, unconfirmed note |

For every file, applying the current `public.py` rule to the stored values yields `is_placeholder = False`. The `16 / 16` and `9 / 6` counts in `arch-admin-cms-verify.db` include additional verification records beyond the 12 base-seed FAQ entries and 7 base-seed hour rows; the extra rows are not assumed to be seed data.

**Production database content is unverified.** No production or shared database was contacted. The local PostgreSQL `arch_dev_pg` database was also not inspected. Nothing in this audit proves what the deployed database actually contains; it only proves that the documented deployment path can create these records.

## 8. Prioritized remediation plan

No remediation was implemented in this audit. The plan below is ordered by risk and keeps cleanup reversible.

### P0 — Stop the unsafe path before any real deployment

1. **Guard the base seed by environment and database identity.** Refuse to run in production unless an explicit, loud override is supplied, and refuse when the target database is not an approved development database. Put the check in `main()` before `_migrate()` so `--reset` cannot downgrade production either.
2. **Remove seeding from production deployment instructions.** `DEPLOYMENT.md` and `backend/README.md` must say that production content is created only through the Admin CMS, and that `python -m app.seed` and `--reset` are development commands. Keep the Cloudflare warning, but correct its claim that the base seed is "structural data only".
3. **Make gym seeding non-destructive.** Insert only when the row is missing, or (preferably) remove the sample gym claims from the base seed entirely. Never overwrite existing gym fields. This protects real ARCH details on any future run.
4. **Stop the base seed from publishing business content.** The safest end state is a schema-only base seed plus migrations; all sample content moves behind an explicit development fixture. At minimum, base seed FAQ must be `is_published=False`, services must not be active, and no opening-hour rows should be created.

### P1 — Correct public presentation and data semantics

5. **Fix `is_placeholder`.** Base it on an explicit verification signal (for example a new `is_verified`/`details_confirmed` flag) or on the fields ARCH actually supplies, not on `opening_note` or the mere existence of hour rows. Do not let a "to be confirmed" note flip the record to verified. Add a regression test for the seeded shape.
6. **Do not treat sample numbers as published facts.** Remove `600` and `64` from seed, or keep them behind a clearly labelled sample/dev path. If storage fields are needed for layout testing, do not render them as ARCH-published values.
7. **Handle missing opening hours honestly.** Keep the table empty until ARCH supplies approved hours. If rows must exist for CMS editing, add an explicit publication/confirmation field and exclude unconfirmed rows from the public API, the `/visit` table, the Assistant, and the placeholder computation. Closed rows with a note are better than invented times, but they still produce a misleading full-week schedule.
8. **Preserve FAQ draft semantics.** Keep the Admin CMS default `is_published=false`. Add a review step or explicit confirmation before publication. The seed must use the same default as the CMS, not bypass it.
9. **Preserve rule semantics.** Keep `is_active` and `is_confirmed` distinct. Do not let the seed create active rules; if sample rules are needed, create them inactive or unconfirmed in a development fixture only.
10. **Stop demo data from reaching shared environments.** Require both a non-production environment and an explicit demo flag tied to a known local database. Never let `--demo` modify existing walls, accounts, or catalogue tables. Consider separate fixture scripts or a separate development database URL.

### P1 — Separate development fixtures from official content

11. **Define one official content path:** Admin CMS records entered from ARCH-supplied material, reviewed, and explicitly published. The seed is not a content path.
12. **Create a reversible inventory before cleanup.** Identify seed rows by exact question/title/SKU and foreign keys. Record counts and IDs. Do not delete anything until the inventory is reviewed and backed up.
13. **Prefer hiding over deleting.** For existing sample rows, set `is_published=false`, `is_active=false`, `is_public=false`, or clear the seeded gym fields, as appropriate. This is reversible and preserves references used by local verification.
14. **If deletion is required, use a reviewed, idempotent cleanup script or migration** with `--dry-run`, a backup step, exact row matching, and a documented rollback. Do not bulk-delete by table or by "looks like sample" heuristics.

### P2 — Regression coverage and operational safeguards

15. Add tests that prove: production base seed is refused; `--reset` cannot target production; repeat runs never overwrite a modified gym record; base seed creates no published FAQ or active service; `is_placeholder` stays true for the unconfirmed shape; public APIs exclude unconfirmed hours and unpublished FAQ.
16. Add an Assistant regression test that a seeded placeholder answer is never returned as approved content.
17. Add a deployment checklist that verifies the target database identity and environment before any migration or content command.
18. Document the distinction between "local verification DB" and "production DB" in `DEPLOYMENT.md`, `LOCAL_DEVELOPMENT.md`, and the content intake guide.

### Explicitly out of scope for this audit

- No seed records were deleted.
- No seed behaviour was changed.
- No `is_placeholder` implementation was changed.
- No migration was edited.
- No production database was contacted.
- No deployment or push was performed.

## 9. Phase 9 recommendation

Add a seed-safety task **before** the first real content-publication task (9.2 FAQ). The task should cover P0 items 1-4 and the P1 presentation fixes, with cleanup kept reversible. Real content collection should not begin until the base seed can no longer publish sample claims or overwrite ARCH-owned gym data.

## 10. References

- `backend/src/app/seed.py` — seed constants and execution.
- `backend/src/app/main.py` — lifespan, no startup seeding.
- `backend/src/app/api/public.py` — public filters and `is_placeholder`.
- `backend/src/app/api/assistant.py` — published FAQ loading and Assistant response.
- `backend/src/app/services/retrieval.py` — Assistant grounding across categories.
- `backend/src/app/services/assistant.py` — direct FAQ answer and structured fallback.
- `src/components/arch/content-pages.tsx` — `/visit` hours, rules and gym facts.
- `src/components/arch/public-pages.tsx` — `/gym` service grid.
- `backend/migrations/versions/9d1c4f8ab207_add_walls_and_route_types.py` — automatic wall inserts.
- `DEPLOYMENT.md` — production seed instruction.
- `backend/README.md` — local/seed instructions and "no invented business facts" claim.
- `backend/DEPLOY_CLOUDFLARE.md` — demo warning and base-seed description.
- `docs/ARCH_CONTENT_INTAKE.md` — content policy and seed-risk summary.
