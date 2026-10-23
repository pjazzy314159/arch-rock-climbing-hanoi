# PostgreSQL 18.6 compatibility verification

Status: **verified** on 2026-10-23 for Task 3.1.

SQLite remains the default development database. PostgreSQL is the deployment
target, and this document records the compatibility checks performed against a
dedicated disposable PostgreSQL database. Nothing in this task changed the
SQLite development database.

## Verified environment

| Item | Value |
| --- | --- |
| Client | `psql (PostgreSQL) 18.6` |
| Server | PostgreSQL 18.6, `x86_64-windows`, compiled by `msvc-19.44.35229`, 64-bit |
| `server_version_num` | `180006` |
| Service | `postgresql-x64-18`, running |
| Endpoint | `127.0.0.1:5432`, `pg_isready` accepting connections |
| Authentication | `scram-sha-256`; a password was supplied through the environment only |
| App/seed database | `arch_pg_verify`, owner `postgres`, UTF8, `template0` |
| Migration rollback database | `arch_pg_migration_verify`, owner `postgres`, UTF8, `template0` |

The PostgreSQL server had only the `postgres`, `template0` and `template1`
databases before verification. The two verification databases above were
created for this task. No pre-existing roles or databases were modified or
dropped. `arch_pg_verify` was later recreated from `template0` once, after the
initial failed migration attempt; it contained only data created by this
verification and no user data.

The repository's SQLite database, `backend/arch_dev.db`, was not migrated,
reset or overwritten. It still contains its original demo data.

## How the verification databases were created

Run these against the existing PostgreSQL installation. Replace `<user>` and
`<password>` with a local administrative role; do not commit the real values.

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

& $psql -h 127.0.0.1 -U <user> -d postgres `
  -c "CREATE DATABASE arch_pg_verify TEMPLATE template0 ENCODING 'UTF8';"

& $psql -h 127.0.0.1 -U <user> -d postgres `
  -c "CREATE DATABASE arch_pg_migration_verify TEMPLATE template0 ENCODING 'UTF8';"
```

The application connection is configured with `DATABASE_URL`; no password is
stored in this repository.

```powershell
$env:DATABASE_URL = "postgresql+psycopg://<user>:<password>@127.0.0.1:5432/arch_pg_verify"
```

## Migration and schema checks

From `backend/`:

```powershell
.venv\Scripts\python.exe -m alembic upgrade head
.venv\Scripts\python.exe -m alembic current
.venv\Scripts\python.exe -m alembic check
```

Results against the empty `arch_pg_verify` database:

- Migrations applied in order:
  `c41ce9aba698` → `6f911594d8db` → `9d1c4f8ab207` → `83693e68129f`.
- `alembic current` reported `83693e68129f (head)`.
- `alembic check` reported `No new upgrade operations detected.`
- The database contains 23 application tables plus `alembic_version`.
- No native PostgreSQL enum types were created. Enum-like columns are
  `character varying(20)` and store the Python enum names, for example
  `ACTIVE`, `PUBLISHED`, `START`, `MIDDLE`, `FINISH` and `OVERHANG`.
- Boolean columns, including `walls.is_active`, are native PostgreSQL
  `boolean`.
- Timestamp columns use `timestamp with time zone`; values read back as
  timezone-aware datetimes.
- The wall-hold, ordered-route-hold and route-publication constraints are
  present:
  - `route_holds` has unique constraints on `(set_id, position)` and
    `(set_id, wall_hold_id)`.
  - `wall_holds` has check constraints keeping each box positive and inside the
    normalized photograph.
  - `route_holds.set_id` and `route_holds.wall_hold_id` cascade on delete.
  - `route_hold_sets.route_id` cascades on delete.
  - `climb_routes.wall_id`, `climb_routes.published_hold_set_id` and creator
    references set null on delete.
- The foreign keys and indexes on `walls`, `wall_holds`, `route_hold_sets`,
  `route_holds` and `climb_routes` were inspected with `pg_constraint`,
  `pg_indexes` and `information_schema`.

### Downgrade / upgrade round trip

The round trip was run only on the separate
`arch_pg_migration_verify` database, which contains no application data:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://<user>:<password>@127.0.0.1:5432/arch_pg_migration_verify"
.venv\Scripts\python.exe -m alembic upgrade head
.venv\Scripts\python.exe -m alembic downgrade base
.venv\Scripts\python.exe -m alembic upgrade head
.venv\Scripts\python.exe -m alembic check
```

All four commands succeeded. No seeded or user data was rolled back.

## Seeding

The documented seed command was run twice against the migrated
`arch_pg_verify` database:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://<user>:<password>@127.0.0.1:5432/arch_pg_verify"
.venv\Scripts\python.exe -m app.seed --demo
.venv\Scripts\python.exe -m app.seed --demo
```

Both runs completed successfully. Row counts before and after the second run
were identical:

```text
users 3, walls 3, climb_routes 6, products 3, courses 1, events 1,
achievements 4, route_votes 6, staff_tasks 1, gym_info 1, services 6,
rules 6, faq_entries 12, opening_hours 7
```

The seed command's automatic migration step was also exercised against a
temporary PostgreSQL schema with a percent-encoded URL; it migrated and seeded
the schema, and a second seed run did not duplicate rows.

Only clearly labelled demo data and the documented demo accounts were used.

## Application smoke test against PostgreSQL

The API was started as a separate process on port `8010` with
`DATABASE_URL` pointing at `arch_pg_verify`:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://<user>:<password>@127.0.0.1:5432/arch_pg_verify"
$env:ARCH_ENVIRONMENT = "development"
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

The running API reported:

```json
{"status":"ok","database":"postgresql","database_reachable":true,"llm_enabled":false,"version":"0.1.0"}
```

A live HTTP smoke test used the seeded demo accounts and sample data only. All
28 checks passed:

- health reports PostgreSQL and a reachable database;
- public route directory, wall filters, grade filters and route-filter options;
- customer login, `/api/auth/me`, dashboard/send history;
- logging an attempt, reading it back, and deleting the verification attempt;
- member leaderboard and public scoring rules;
- customer and staff access checks, including `403` for customer staff/admin
  routes and for staff admin routes;
- wall-hold creation and retrieval;
- draft sequence save, ordered positions, and start/middle/finish role
  derivation;
- draft privacy before publication: the public overlay was empty and the draft
  was not exposed;
- staff publication refusal (`403`), admin publication, and retrieval of the
  ordered public overlay;
- refusal to delete a hold used by a published set (`409`);
- contact-message storage (`201`), customer refusal (`403`), admin inbox read,
  and marking the message handled.

The smoke test actually connected to PostgreSQL; it was not run against
SQLite.

## Opt-in PostgreSQL integration tests

`backend/tests/test_postgresql_integration.py` adds PostgreSQL coverage without
making the normal suite require a PostgreSQL server. The tests are skipped
unless `ARCH_TEST_POSTGRES_URL` is set to a dedicated test/verify database. Each
test creates and drops its own temporary schema, so the public schema and
seeded data are untouched.

```powershell
$env:ARCH_TEST_POSTGRES_URL = "postgresql+psycopg://<user>:<password>@127.0.0.1:5432/arch_pg_verify"
.venv\Scripts\python.exe -m pytest tests/test_postgresql_integration.py -q
```

Result: `2 passed`.

- The migration test applies all migrations in a temporary schema, runs
  `alembic check`, verifies the wall/route/hold tables and column types, then
  downgrades to base.
- The model/constraint test creates the schema from the SQLAlchemy models,
  stores ordered holds, verifies enum names and timezone-aware timestamps,
  checks that PostgreSQL rejects an out-of-photograph box and a duplicate
  position, and confirms that a newer draft does not replace or leak into the
  published overlay.

Normal suite result with no PostgreSQL URL configured:

```text
212 passed, 2 skipped
```

The skipped tests are the two opt-in PostgreSQL tests.

## Code changes made for PostgreSQL compatibility

1. **Fixed the wall migration's boolean insert.**
   `backend/migrations/versions/9d1c4f8ab207_add_walls_and_route_types.py`
   originally inserted the literal integer `1` into `walls.is_active`.
   PostgreSQL rejected it with a boolean/integer type error. The insert now
   binds a real Python boolean (`:is_active` → `True`), which works on both
   PostgreSQL and SQLite. No schema change was required.

   Revision `9d1c4f8ab207` was edited in place rather than followed by a new
   corrective revision because the failure happens inside that revision and
   aborts the migration before any later revision could run. Databases already
   at head, including the SQLite development database, are unaffected because
   Alembic never re-executes an applied revision. No schema or data history was
   rewritten.
2. **Fixed percent-encoded database URLs in Alembic and seeding.**
   `backend/migrations/env.py` and `backend/app/seed.py` now escape `%` before
   handing a URL to Alembic's `configparser`-backed configuration. Without this,
   a valid URL containing percent-encoded credentials or query options failed
   with a `configparser` interpolation error. The escape is reversed by
   `configparser` before SQLAlchemy receives the URL.
3. **Added opt-in PostgreSQL integration coverage.**
   `backend/tests/test_postgresql_integration.py` is documented above.

## Limitations and notes

- SQLite remains the primary local development database. SQLite test passes
  are not presented as PostgreSQL proof.
- The ordinary test suite still runs on SQLite. PostgreSQL tests require an
  explicitly configured server and are opt-in.
- The verification used the locally installed PostgreSQL 18.6 server and the
  `postgres` administrative role. No application-specific role was created.
- Credentials and connection strings with passwords are not committed,
  documented, or stored in the verification result files.
- Backup/restore and production load/HA behaviour were not part of this task.
- The existing shared wall-hold geometry limitation is unchanged.
- The two verification databases are disposable. They can be removed after
  review with `DROP DATABASE arch_pg_verify;` and
  `DROP DATABASE arch_pg_migration_verify;` while connected to `postgres`.
  Never run those statements against the SQLite file or a production database.

## Verdict

Task 3.1 is **done** for PostgreSQL 18.6 compatibility. The application still
uses SQLite by default; PostgreSQL is verified as the deployment database
through migrations, schema inspection, repeatable seeding, a live application
smoke test, and opt-in integration tests.
