# PostgreSQL 18.6 compatibility and development database

Status: **verified and configured** on 2026-10-23 for Tasks 3.1 and 3.2.

PostgreSQL 18.6 is now the normal local development database. SQLite remains
the isolated test database and an explicit, documented fallback. The existing
SQLite file `backend/arch_dev.db` was neither migrated nor modified.

## Verified environment

| Item | Value |
| --- | --- |
| Client | `psql (PostgreSQL) 18.6` |
| Server | PostgreSQL 18.6, `x86_64-windows`, 64-bit |
| `server_version_num` | `180006` |
| Service | `postgresql-x64-18`, running |
| Endpoint | `127.0.0.1:5432`, `pg_isready` accepting connections |
| Authentication | `scram-sha-256`; passwords are supplied through environment variables only |
| Normal development database | `arch_dev_pg`, owner `arch_dev`, UTF8, `template0` |
| Opt-in test database | `arch_dev_pg_test`, owner `arch_dev`, UTF8, `template0` |
| Task 3.1 compatibility database | `arch_pg_verify`, owner `postgres`, UTF8, `template0` |
| Task 3.1 migration rollback database | `arch_pg_migration_verify`, owner `postgres`, UTF8, `template0` |

The role used by the application in development is restricted:

```text
arch_dev: LOGIN, NOSUPERUSER, NOINHERIT, NOCREATEROLE, NOCREATEDB,
          NOREPLICATION, NOBYPASSRLS
```

It owns `arch_dev_pg` and `arch_dev_pg_test` and has `USAGE, CREATE` on their
`public` schemas. It is not an administrative role.

No password is stored in this repository or in this document. The local `.env`
is git-ignored and contains the generated development password; `.env.example`
contains a `<password>` placeholder only.

## Databases and their purpose

| Database | Purpose | Data |
| --- | --- | --- |
| `arch_dev_pg` | Normal PostgreSQL development | Demo seed plus the verification records listed below |
| `arch_dev_pg_test` | Opt-in PostgreSQL integration tests | No application data; tests create and drop temporary schemas |
| `arch_pg_verify` | Task 3.1 disposable compatibility database | Compatibility verification data only |
| `arch_pg_migration_verify` | Task 3.1 downgrade/upgrade round trip | No application data |
| `backend/arch_dev.db` | Existing SQLite development history and test fallback | Preserved; 8 users, 6 routes and the existing editor records |

`arch_pg_verify` and `arch_pg_migration_verify` are not part of the normal
development workflow. They can be removed after review while connected to
`postgres`:

```sql
DROP DATABASE arch_pg_verify;
DROP DATABASE arch_pg_migration_verify;
```

Do not run those statements against `arch_dev_pg`, `arch_dev_pg_test`,
`backend/arch_dev.db` or a production database.

## Development database setup

The full commands are in [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md). The
important properties are:

- Check whether `arch_dev_pg` already exists before creating it; never drop or
  recreate an existing development database automatically.
- Create it from `template0` with UTF8 encoding and `arch_dev` as owner.
- Grant `USAGE, CREATE` on the database's `public` schema.
- Set `DATABASE_URL` explicitly:

```dotenv
DATABASE_URL=postgresql+psycopg://arch_dev:<password>@127.0.0.1:5432/arch_dev_pg
```

- Keep the password out of Git and out of documentation. If it contains
  URL-special characters, percent-encode them.
- OS environment variables override the `.env` file when a one-off connection
  is needed.

The effective setting can be checked without printing the password:

```powershell
cd backend
uv run python -c "from app.config import get_settings; from sqlalchemy.engine import make_url; u = make_url(get_settings().database_url); print(u.get_backend_name(), u.database, u.username, u.host, u.port)"
```

Result against the configured development environment:

```text
postgresql arch_dev_pg arch_dev 127.0.0.1 5432
```

### No silent SQLite fallback

`backend/app/db.py` creates the engine from the configured `DATABASE_URL` and
never rewrites it. If PostgreSQL is unreachable, the API does not open
`backend/arch_dev.db`.

A failed connection is bounded by a five-second `connect_timeout` so the health
check answers promptly:

```json
{"status":"degraded","database":"postgresql","database_reachable":false,"llm_enabled":false,"version":"0.1.0"}
```

This was verified with a deliberately unreachable PostgreSQL port. The log
recorded `psycopg.errors.ConnectionTimeout`; the API did not switch database.
The code default is PostgreSQL; SQLite is used only when the resolved
`DATABASE_URL` starts with `sqlite` (normal setup selects it explicitly).

## Migration and schema checks

Task 3.1 checked an empty `arch_pg_verify` database. Task 3.2 applied the same
migrations to the empty `arch_dev_pg` database.

Migration order:

```text
c41ce9aba698 → 6f911594d8db → 9d1c4f8ab207 → 83693e68129f
```

Commands from `backend/`:

```powershell
uv run alembic upgrade head
uv run alembic current
uv run alembic check
```

Results:

- `alembic current` reported `83693e68129f (head)`.
- `alembic check` reported `No new upgrade operations detected.`
- The Task 3.1 database contains 23 application tables plus `alembic_version`.
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

The round trip was run only on the separate `arch_pg_migration_verify`
database, which contains no application data:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://<user>:<password>@127.0.0.1:5432/arch_pg_migration_verify"
uv run alembic upgrade head
uv run alembic downgrade base
uv run alembic upgrade head
uv run alembic check
```

All four commands succeeded. No seeded or user data was rolled back. The
round trip was not run against `arch_dev_pg` or `backend/arch_dev.db`.

## Seeding

The documented seed command was run against `arch_dev_pg` three times:

```powershell
cd backend
uv run python -m app.seed --demo
```

The first run migrated the empty database and loaded the content and demo
data. Two further runs completed successfully. The row counts before and after
the final repeat were identical:

```text
users 3, walls 3, wall_holds 0, climb_routes 6, route_hold_sets 0,
route_holds 0, products 3, courses 1, events 1, achievements 4,
route_votes 6, staff_tasks 1, gym_info 1, services 6, rules 6,
faq_entries 12, opening_hours 7, contact_messages 0
```

The same idempotence check was also run inside a temporary PostgreSQL schema
in Task 3.1. Only clearly labelled demo data and the documented demo accounts
were used. No real customer data was imported.

The verification smoke test later added safe records to `arch_dev_pg`; they are
listed under [Verification records](#verification-records). They are not
created by the seed and do not affect seed repeatability.

## Backup and restore

`LOCAL_DEVELOPMENT.md` documents the safe backup and restore commands. The
backup path was exercised without changing either database; the password was
supplied only to the child process.

Results:

- `pg_dump --format=custom` wrote `var/arch_dev_pg.dump` (85,549 bytes). It is
  git-ignored and was not committed.
- `pg_restore --list` read the archive successfully and reported 249 entries.
- A restore into a new database was not run in this task; only the backup
  archive was verified. The documented procedure is to create a new database,
  restore into it, and inspect it before switching; it is not an in-place
  restore.
- `arch_dev_pg` was not restored over, dropped or recreated.

## Application smoke tests

### Task 3.1: disposable compatibility database

The API ran as a separate process on port `8010` against `arch_pg_verify`. The
health endpoint reported:

```json
{"status":"ok","database":"postgresql","database_reachable":true,"llm_enabled":false,"version":"0.1.0"}
```

A live HTTP smoke test used the seeded demo accounts and sample data only. All
28 checks passed: public routes and filters, customer login and dashboard,
attempt logging, leaderboard, permissions, wall-hold creation, draft ordering
and roles, draft privacy, publication, and contact messages.

### Task 3.2: dedicated development database

The API ran on port `8010` against `arch_dev_pg` with the local `.env`. The
health endpoint again reported `database: "postgresql"` and
`database_reachable: true`.

The live HTTP smoke test passed **55 checks**:

- public gym, services, FAQ, products, courses, events and walls;
- route filters (grade, wall, wall type), route detail and the active route
  directory;
- login for the administrator, staff and customer demo accounts;
- member profile, dashboard, attempt creation, logbook read-back, leaderboard
  ordering and public leaderboard rules;
- route creation and the active → archived status transition, including the
  archived-only directory filter;
- staff wall/route listing, four wall holds created, one edited, one deleted;
- ordered draft with `start`, `middle`, `finish` roles;
- public overlay empty before publication;
- staff publication refused (`403`), admin publication succeeded;
- a second draft did not change the public overlay; deleting a published hold
  was refused (`409`); publishing the second draft replaced the overlay;
- anonymous member access (`401`), customer staff/admin access (`403`), staff
  admin access (`403`), admin staff access allowed;
- contact message storage, admin inbox read, staff inbox refusal (`403`) and
  marking the message handled.

### Restart persistence

The API process was stopped and started again against the same database. All
**8 post-restart checks** passed:

- health still reported PostgreSQL and a reachable database;
- the published hold overlay was still present with the expected holds;
- the logged climbing attempt was still in the member's logbook, then removed
  after the proof;
- the created route was still present and archived;
- the contact message was still present and handled;
- the published hold set survived.

The API stdout and stderr logs contained no SQL errors, tracebacks or
connection warnings during the successful test.

## Verification records

These clearly labelled records remain in `arch_dev_pg` after the smoke test:

- one archived route named `VERIFY PostgreSQL dev route …`;
- three wall holds and two hold sets (one superseded, one published) on the
  first seeded route, with five ordered route-hold rows;
- one handled contact message with the subject
  `PostgreSQL verification …`.

They are safe verification data, not real customer data. A fresh development
database can be recreated from the seed at any time; deleting these records is
optional and was not necessary for acceptance.

## Opt-in PostgreSQL integration tests

`backend/tests/test_postgresql_integration.py` provides PostgreSQL coverage
without making the normal suite require a PostgreSQL server. It is skipped
unless `ARCH_TEST_POSTGRES_URL` is set and names a database whose name contains
`test` or `verify`. This guard prevents an accidental run against
`arch_dev_pg`.

```powershell
cd backend
$env:ARCH_TEST_POSTGRES_URL = "postgresql+psycopg://arch_dev:<password>@127.0.0.1:5432/arch_dev_pg_test"
uv run pytest tests/test_postgresql_integration.py -q
Remove-Item Env:ARCH_TEST_POSTGRES_URL
```

Result: **2 passed**. Each test creates and drops a temporary schema, so the
seeded public schema is untouched.

The ordinary suite continues to run on SQLite:

```text
214 passed, 2 skipped
```

The two skipped tests are the opt-in PostgreSQL tests. The 214 includes two new
unit tests for the PostgreSQL connection timeout.

## Code changes made for PostgreSQL

### Task 3.1

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

### Task 3.2

4. **Bounded PostgreSQL connection attempts.**
   `backend/app/db.py` now passes `connect_timeout=5` to psycopg. Before this,
   an unreachable host could hang a health request until SQLAlchemy's pool
   timeout (30 seconds) and could exhaust the pool with repeated checks. The
   timeout makes the health check return `degraded` promptly and keeps the
   configured PostgreSQL failure visible. SQLite connection arguments are
   unchanged. `backend/tests/test_db.py` covers both.
5. **Made PostgreSQL the local default.**
   `backend/app/config.py` and `backend/alembic.ini` now default to the local
   PostgreSQL URL. An unconfigured database therefore fails clearly instead of
   opening SQLite; the default URL deliberately contains no password. The
   local `.env` supplies the generated password. `.env.example` points at
   `arch_dev_pg` and documents the explicit SQLite fallback. `LOCAL_DEVELOPMENT.md`
   documents the role, database, migrations, seed, backup/restore, startup,
   verification and troubleshooting commands.

No application schema change was needed for Task 3.2.

## SQLite preservation and data ownership

The SQLite file was not opened for writing, migrated, reset, merged or
overwritten. Its state after Task 3.2:

| Item | Value |
| --- | --- |
| Path | `backend/arch_dev.db` |
| Size | 323,584 bytes |
| Last write time | 2026-10-23 00:38:20 (before Task 3.2) |
| SHA-256 | `4E6D6D96ED416579CF9E6AC4C30A60323751917500C429D70423FBD107DB1B98` |
| Tables | 24 |
| Users | 8 |
| Routes | 6 |
| Wall holds | 3 |
| Hold sets | 1 |
| Route holds | 3 |
| Achievements | 12 |
| Route votes | 6 |
| Contact messages | 0 |

The counts match the state recorded after Task 3.1. The file is git-ignored.

The two environments have different histories and must not be merged
implicitly:

- **PostgreSQL `arch_dev_pg`** starts from the three documented demo accounts
  and the seed's sample routes, votes, achievements and staff task. It does not
  contain the browser-test accounts or the extra editor records that
  accumulated in SQLite.
- **SQLite `backend/arch_dev.db`** contains eight users, including five
  `dashboard-…@example.com` accounts created during earlier browser checks, 12
  achievements, and the existing wall-hold and route-hold-set annotations.

There is no automatic SQLite → PostgreSQL import. If a record ever needs to be
transferred, it must be a separate, explicit, reviewed operation that does not
duplicate users, attempts, agreements, votes or published annotations.

## Limitations and notes

- Production load, backup/restore, HA, monitoring and a production-scoped
  database role were not part of these tasks.
- The ordinary test suite still runs on SQLite. SQLite passes are not presented
  as PostgreSQL proof.
- The PostgreSQL tests require an explicitly configured server and are opt-in.
- The shared wall-hold geometry limitation recorded under Task 2B.3 is
  unchanged.
- The verification records in `arch_dev_pg` are safe demo/verification data,
  not real customer data.
- The local `.env` remains untracked and must never be committed.

## Verdict

Task 3.1 is **done** for PostgreSQL 18.6 compatibility. Task 3.2 is **done** for
a verified PostgreSQL-first local development workflow. The normal documented
workflow starts the API against `arch_dev_pg`, migrations and the demo seed are
repeatable, the key member/route/hold/publish/admin flows passed live HTTP
tests, data survived an API restart, and SQLite remains an intentional
fallback with its existing demo data preserved.
