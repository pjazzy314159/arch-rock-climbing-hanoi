# Local development

How to run the ARCH website and its API on this machine, and how to look at
them in a browser. Normal local development uses **PostgreSQL 18.6**. SQLite
remains available for isolated tests and as an explicit fallback.

---

## 1. What you need

| Tool       | Version used here | Notes                                                                                |
| ---------- | ----------------- | ------------------------------------------------------------------------------------ |
| Node.js    | 24.16.0           | Any current LTS works.                                                               |
| Bun        | 1.4.3             | Use `bun.cmd` on this Windows machine if PowerShell blocks `bun.ps1`.                |
| Python     | 3.12.13           | The backend needs 3.11 or newer.                                                     |
| uv         | 0.11.7            | Manages the Python environment. Install from <https://docs.astral.sh/uv/>.           |
| PostgreSQL | 18.6              | Client and server. Service name: `postgresql-x64-18`.                                 |
| A browser  | Any current one   | Chrome, Edge, Firefox or Safari.                                                      |

The PostgreSQL 18.6 client and server were verified on this machine. The
server listens on `127.0.0.1:5432` and accepts `scram-sha-256` password
authentication. The client tools are under
`C:\Program Files\PostgreSQL\18\bin`; add that directory to `PATH` or use the
full path shown below.

Docker is not required. The previous verification databases
(`arch_pg_verify`, `arch_pg_migration_verify`) are disposable Task 3.1
artefacts; do not use them for normal development.

---

## 2. Install the dependencies

```powershell
# From the repository root: the website
bun.cmd install

# The API
cd backend
uv sync --extra dev
cd ..
```

`uv sync` creates `backend/.venv` and installs the API's dependencies plus the
test and lint tools.

---

## 3. Create the PostgreSQL role and database

This is a one-time local setup. Run it as a PostgreSQL administrator. The
application role is deliberately restricted: it can log in, but it is not a
superuser and cannot create databases or roles. It owns only its development
and test databases.

Set a local password for `arch_dev`. Do not reuse a production password. Keep
the value out of Git. Generate a URL-safe value with:

```powershell
backend\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32))"
```

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

# Check whether the database already exists. An existing database must be
# inspected and preserved, not dropped or recreated.
& $psql -h 127.0.0.1 -U postgres -d postgres `
  -c "SELECT datname, pg_catalog.pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = 'arch_dev_pg';"

# Create the role and database only if the query returned no rows.
& $psql -h 127.0.0.1 -U postgres -d postgres
# Inside psql:
#   CREATE ROLE arch_dev LOGIN PASSWORD '<dev-password>'
#     NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
#   CREATE DATABASE arch_dev_pg OWNER arch_dev
#     TEMPLATE template0 ENCODING 'UTF8';
#   \c arch_dev_pg
#   GRANT USAGE, CREATE ON SCHEMA public TO arch_dev;
#   \q
```

Create a separate disposable test database for the opt-in PostgreSQL tests.
The test suite creates and drops its own temporary schemas there.

```sql
CREATE DATABASE arch_dev_pg_test OWNER arch_dev
  TEMPLATE template0 ENCODING 'UTF8';
```

After connecting, grant schema access in the test database as well:

```sql
\c arch_dev_pg_test
GRANT USAGE, CREATE ON SCHEMA public TO arch_dev;
```

Do not run `DROP DATABASE`, `CREATE DATABASE`, or `--reset` against
`backend/arch_dev.db` or any database containing data you did not create.

---

## 4. Configure the environment

```powershell
Copy-Item .env.example .env
```

`.env` is git-ignored and is read automatically by the API from the repository
root. OS environment variables override it, which is useful for the opt-in
tests and for one-off commands.

The values that matter for normal development are:

```dotenv
# The API the browser talks to
VITE_API_BASE_URL=http://localhost:8000

# The PostgreSQL development database. Replace <password> with the local
# `arch_dev` role password. If the password contains URL-special characters,
# percent-encode them (for example `%` becomes `%25`).
DATABASE_URL=postgresql+psycopg://arch_dev:<password>@127.0.0.1:5432/arch_dev_pg

# Development permits the local demo seed. Use production only for a real
# deployment.
ARCH_ENVIRONMENT=development

# Signs the access tokens. Any long random string works locally.
ARCH_SECRET_KEY=local-development-only-not-a-real-secret

# The browser origins allowed to call the API. 8080 is the dev server,
# 8090 is the production preview.
CORS_ORIGINS=http://localhost:5173,http://localhost:8080,http://localhost:8090
```

`VITE_API_BASE_URL` is read by the **browser**, so it must be the address the
browser can reach. `DATABASE_URL` and `ARCH_SECRET_KEY` are read by the
**server** only. Restart the frontend after changing a `VITE_` value.

Verify the effective database without printing the password:

```powershell
cd backend
uv run python -c "from app.config import get_settings; from sqlalchemy.engine import make_url; u = make_url(get_settings().database_url); print(u.get_backend_name(), u.database, u.username, u.host, u.port)"
```

Expected output:

```text
postgresql arch_dev_pg arch_dev 127.0.0.1 5432
```

The API does **not** silently fall back to SQLite when this PostgreSQL
connection fails. A failed connection makes `/api/health` report `degraded`
and `"database_reachable": false` after a bounded connection attempt. The
SQLite fallback is selected only by explicitly setting a SQLite
`DATABASE_URL`.

---

## 5. Apply migrations and seed demo data

```powershell
cd backend

# Apply every migration and confirm the schema matches the models.
uv run alembic upgrade head
uv run alembic current
uv run alembic check

# Load the content the site needs, plus clearly-labelled demo data.
uv run python -m app.seed --demo
```

The seed runs the migrations itself, so on a fresh `arch_dev_pg` database
`uv run python -m app.seed --demo` is enough. Run it twice to confirm it is
repeatable; the row counts should not change.

Do not use `--reset` on a database with data you want to keep. `--reset` rolls
the schema back to an empty database before seeding.

The demo seed creates the accounts in §12 and sample routes, products,
climbs, votes and a staff task. Everything it loads is labelled as sample data.
The seed refuses to create the demo accounts when `ARCH_ENVIRONMENT` is a
production environment.

### Back up and restore the development database

`pg_dump` is safe: it is read-only. Run the backup commands from the
repository root. Write the backup under `var/`, which is git-ignored, and never
commit a database dump. For these commands the password is supplied through the
process environment, not on the command line or in a committed script.

```powershell
$pgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
$env:PGPASSWORD = "<password>"
& $pgDump -h 127.0.0.1 -U arch_dev -d arch_dev_pg --format=custom `
  --file=var\arch_dev_pg.dump
Remove-Item Env:PGPASSWORD

# Optional: confirm the archive is readable without restoring it.
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --list var\arch_dev_pg.dump | Select-Object -First 20
```

Restore into a **new** database first. This proves the archive and leaves the
working `arch_dev_pg` untouched:

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
& $psql -h 127.0.0.1 -U postgres -d postgres -c "CREATE DATABASE arch_dev_pg_restore_check OWNER arch_dev TEMPLATE template0 ENCODING 'UTF8';"
& $psql -h 127.0.0.1 -U postgres -d arch_dev_pg_restore_check -c "GRANT USAGE, CREATE ON SCHEMA public TO arch_dev;"
$env:PGPASSWORD = "<password>"
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -h 127.0.0.1 -U arch_dev `
  --dbname=arch_dev_pg_restore_check --no-owner --no-privileges var\arch_dev_pg.dump
Remove-Item Env:PGPASSWORD
```

Point a one-off `DATABASE_URL` at `arch_dev_pg_restore_check`, run
`uv run alembic current` and inspect the tables before switching to it. The
restore-check database is disposable once verified.

**Destructive commands** — do not use these as part of a normal setup:

- `DROP DATABASE` / `dropdb` deletes the database and everything in it.
- `pg_restore --clean --if-exists` overwrites objects in the target database.
- `uv run alembic downgrade base` or `python -m app.seed --reset` removes the
  schema and its data.

Do not restore over `arch_dev_pg` by default. If you intentionally need to,
stop the API, take a fresh backup, confirm the target, and restore only into a
database you are prepared to replace. For the SQLite fallback, stop the API and
copy `backend/arch_dev.db` aside before changing it; never treat a SQLite copy
as a PostgreSQL import without an explicit, reviewed migration.

---

## 6. Start the two services

Two terminals:

```powershell
# Terminal 1 — the API
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

```powershell
# Terminal 2 — the website
bun.cmd run dev
```

Verify the API is using PostgreSQL, not SQLite:

```powershell
Invoke-RestMethod http://localhost:8000/api/health | ConvertTo-Json -Compress
```

Expected:

```json
{
  "status": "ok",
  "database": "postgresql",
  "database_reachable": true,
  "llm_enabled": false,
  "version": "0.1.0"
}
```

If it says `degraded`, the configured PostgreSQL connection failed. Check the
service, the host/port, the role and the password; the API will not quietly
open SQLite instead.

### Stopping and restarting

- Stop the API and the website with `Ctrl+C` in their terminals.
- The PostgreSQL Windows service can be checked or stopped separately:

```powershell
Get-Service postgresql-x64-18
# Stop-Service postgresql-x64-18      # optional; needs an elevated shell
# Start-Service postgresql-x64-18
```

The development database survives stopping and restarting the API, the
website and the PostgreSQL service.

---

## 7. The local addresses

| What                            | Address                              |
| ------------------------------- | ------------------------------------ |
| **Website**                     | <http://localhost:8080>              |
| **API**                         | <http://localhost:8000>              |
| **API documentation (Swagger)** | <http://localhost:8000/docs>         |
| **API schema (OpenAPI)**        | <http://localhost:8000/openapi.json> |
| **API health check**            | <http://localhost:8000/api/health>   |
| **Production build preview**    | <http://localhost:8090> (see §11)    |

If port 8000 is already in use, start the API on another port and update
`VITE_API_BASE_URL` and `CORS_ORIGINS` to match.

---

## 8. Looking at the site

Open <http://localhost:8080> and walk through it:

| Page                                                     | What to look at                                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/`                                                      | The home page: the hero, the fresh routes and the community panels.                                               |
| `/gym`                                                   | The gym: the banner, the services and the first-session notes.                                                    |
| `/tour`                                                  | The photographic preview of the walls.                                                                            |
| `/routes`                                                | The route directory. The badge says **LIVE ROUTES** when the API is running and **SAMPLE ROUTES** when it is not. |
| `/routes/1`                                              | One route: the official grade, the community's perceived grade and the voting control.                            |
| `/leaderboard`                                           | The community leaderboard.                                                                                        |
| `/courses`, `/events`                                    | The course and event lists. Both say the schedule is being confirmed until ARCH publishes it.                     |
| `/visit`                                                 | Opening hours, prices and the gym rules. The prices section says the list is being confirmed while it is empty.   |
| `/shop`, `/shop/ARC-EDG-01`                              | The shoe shop and a product page.                                                                                 |
| `/contact`                                               | The contact form. It really posts to the API.                                                                     |
| `/signin`                                                | Sign in and registration.                                                                                         |
| `/member`                                                | The member area. Anonymous visitors get a prompt to sign in rather than somebody else's records.                  |
| `/member/logbook`, `/member/profile`, `/member/progress` | The member's own records.                                                                                         |
| `/staff`                                                 | The staff workspace.                                                                                              |
| `/admin`                                                 | The operations workspace.                                                                                         |

**Ask ARCH** is the launcher in the bottom-right corner of every page. The
panel says where its answers come from.

---

## 9. Trying the features

### The public website

1. Open <http://localhost:8080>. Every page should show live content.
2. Stop the API (`Ctrl+C` in the API terminal) and reload. The pages keep
   working, show a dashed "Showing sample data" banner, and the footer reads
   "Sample data". Start the API again and reload: the banner disappears.
3. Fill in the contact form on `/contact` and submit it. The page confirms the
   message reached the API.

### Client features

1. Go to `/signin`, choose **Create an account** and register.
2. You are signed in and land on `/member`, with your name in the sidebar.
3. Sign the safety agreement on the member overview.
4. Go to `/member/logbook` and log a climb; it appears in the table.
5. Go to `/member/profile`, change your name and climbing level, save, and
   change your password.
6. Sign out. The member area asks you to sign in again and your records are
   gone.

### Route voting

1. Sign in, then open `/routes/1`.
2. Choose **Easier**, **As set** or **Harder**. The vote is recorded and the
   distribution updates.
3. Vote again to change it, or withdraw it.
4. Open `/leaderboard` to see the climbers.

### Staff and administration

1. Sign in as `staff@example.com` and open `/staff`. Move a task between
   _to do_, _in progress_ and _done_, add a checklist item and tick it.
2. Sign in as `admin@example.com` and open `/admin`. The summary, the member
   records, the routes, the tasks and the events all come from the database.
   Publish a route and an event, and archive a route.
3. Sign in as a customer and open `/staff` and `/admin`: both refuse, and the
   backend refuses the requests too.

### The assistant

1. Click **Ask ARCH** and ask "Do I need climbing experience to visit?". The
   answer comes from the published FAQ and lists its source.
2. Ask "What is the wifi password in Tokyo?". The answer says the information
   is not covered and points at the contact form.
3. Check <http://localhost:8000/api/assistant/status>: with no provider
   configured it reports `"live_model_enabled": false`, and the panel says the
   answers come from ARCH's published information.

---

## 10. Running the checks yourself

```powershell
# Website
bun.cmd run lint
bun.cmd run typecheck
bun.cmd run test
bun.cmd run build

# API
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pytest
uv run alembic check
```

The ordinary test suite runs on an isolated SQLite database by design. It does
not require PostgreSQL and is not evidence that PostgreSQL works.

### Opt-in PostgreSQL integration tests

The two PostgreSQL tests run only when `ARCH_TEST_POSTGRES_URL` explicitly
names a database whose name contains `test` or `verify`. They create and drop
temporary schemas, so they do not touch the seeded development schema.

```powershell
cd backend
$env:ARCH_TEST_POSTGRES_URL = "postgresql+psycopg://arch_dev:<password>@127.0.0.1:5432/arch_dev_pg_test"
uv run pytest tests/test_postgresql_integration.py -q
Remove-Item Env:ARCH_TEST_POSTGRES_URL
```

Result on this machine: `2 passed`.

### Browser checks

There are scripts that drive a real browser. Start the API and the dev server
first, then:

```powershell
bun.cmd run check:pages        # every page loads without console or network errors
bun.cmd run check:contact      # the contact form reaches the API
bun.cmd run check:member       # register, sign the agreement, log a climb, edit the profile
bun.cmd run check:voting       # vote, change the vote, withdraw it
bun.cmd run check:staff        # the staff and administration flows, and the refusals
bun.cmd run check:assistant    # the assistant answers, and admits what it does not know
bun.cmd run screenshot         # writes a screenshot of every page to var/screenshots/
```

They take a base URL, so they also work against the production preview:

```powershell
node scripts/check-pages.mjs http://localhost:8090
```

---

## 11. The production build

```powershell
bun.cmd run build          # clears .output first, then builds
bun.cmd run preview:build  # serves the built worker on http://localhost:8090
```

`vite preview` does **not** work for this project: the build targets the
Cloudflare Worker preset and the preview plugin looks for a different layout.
`scripts/preview-build.mjs` serves the built Worker locally instead.

The preview reads the build from disk when it starts, so **restart it after
every rebuild**.

```powershell
bun.cmd run check:styles http://localhost:8090   # confirms the page is really styled
```

---

## 12. Test accounts

`uv run python -m app.seed --demo` creates these accounts. They are
**development only**, and the seed refuses to create them when
`ARCH_ENVIRONMENT` is a production environment.

| Role          | Email               | Password                 |
| ------------- | ------------------- | ------------------------ |
| Administrator | `admin@example.com` | `admin-demo-password`    |
| Staff         | `staff@example.com` | `staff-demo-password`    |
| Customer      | `alex@example.com`  | `customer-demo-password` |

The seed also creates sample routes, products, climbs, votes and a staff task.
Everything it loads is labelled as sample data.

The PostgreSQL development database starts from these three demo accounts. It
does not import the accounts, achievements or annotations that accumulated in
`backend/arch_dev.db`; that SQLite file is a separate development history.

---

## 13. Troubleshooting

**`password authentication failed for user "arch_dev"`**
Check the role name and password in `DATABASE_URL`. If the password contains
characters such as `@`, `:`, `/` or `%`, percent-encode them. Test the role
directly with `psql -h 127.0.0.1 -U arch_dev -d arch_dev_pg`. Do not put the
password in a committed file.

**`connection refused` or the health check says `degraded`**
The API is configured for PostgreSQL but cannot reach it. Check:

```powershell
Get-Service postgresql-x64-18
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p 5432
```

The API will not switch to SQLite on its own. Fix the configured PostgreSQL
connection, or explicitly change `DATABASE_URL` to the SQLite fallback if that
is what you intended.

**`relation ... does not exist` or the schema is behind the models**
Run the migrations from `backend/`:

```powershell
uv run alembic current
uv run alembic upgrade head
uv run alembic check
```

**`permission denied for schema public`**
Connect to the database as an administrator and grant the restricted role
access to that database's `public` schema:

```sql
\c arch_dev_pg
GRANT USAGE, CREATE ON SCHEMA public TO arch_dev;
```

**The pages say "Showing sample data"**
The API is not reachable, or `VITE_API_BASE_URL` is wrong. Check
<http://localhost:8000/api/health> and the value in `.env`. Remember that
`VITE_` variables are read when the dev server starts: restart it after
changing `.env`.

**`Failed to fetch dynamically imported module` in the browser console**
The dev server was started before a new route file existed. Restart it.

**`Cannot find module '/@fs/…'` or the setup file fails to load in the tests**
The repository is being reached through a directory symlink. `bun.cmd run test`
runs `scripts/run-tests.mjs`, which re-anchors the working directory to the
real path and avoids it.

**`bun.ps1 cannot be loaded because running scripts is disabled`**
Use `bun.cmd` instead of `bun` in PowerShell, or run `cmd /c "bun ..."`.

**The API answers with 403 on the staff pages**
The signed-in account does not hold the staff or administrator role. Sign in
with one of the accounts in §12.

**The API answers with 422 on sign-up**
The password must be at least 10 characters and at most 72 bytes. The API
checks this because bcrypt ignores anything past 72 bytes.

**`Address already in use`**
Something else is on the port. The API uses 8000, the dev server 8080 and the
production preview 8090. Change the port and update `VITE_API_BASE_URL` and
`CORS_ORIGINS` to match.

**The database is empty after a reset**
`uv run python -m app.seed` loads the content; add `--demo` for the sample
data as well.

**I need SQLite for an isolated test or recovery**
Set it explicitly:

```dotenv
DATABASE_URL=sqlite:///./arch_dev.db
```

Run the API from `backend/` because the relative path is resolved from the
current directory. `backend/arch_dev.db` contains the existing SQLite demo
history; do not migrate, merge or overwrite it as part of a PostgreSQL setup.
The SQLite fallback is intentional and documented, not an automatic response
to a PostgreSQL failure.

**The build succeeds but the preview has no styles**
`bun.cmd run build` clears `.output` first. If the preview was already running
it is still serving the old build: stop it, rebuild and start it again.
`bun.cmd run check:styles http://localhost:8090` tells you whether the page is
really styled.

**The assistant always says it does not know**
That is the expected behaviour without a provider, and with an empty
knowledge base. Check <http://localhost:8000/api/assistant/status> and the
published FAQ in the database.

---

## 14. What needs an external service

**Works entirely locally, with a local PostgreSQL 18.6 server:**

- Every page, the route directory, the leaderboard, the shop, the contact
  form, registration and sign-in, the safety agreement, the logbook, the
  profile, route voting, the staff tasks and checklists, the operations
  workspace, and the assistant answering from the published FAQ.

**Needs a provider key (server-side only):**

- The assistant answering with a language model. Set `LLM_PROVIDER`,
  `LLM_API_KEY` and `LLM_MODEL` in the environment of the **API**. The key is
  never sent to the browser.

**Needs infrastructure that is not on this machine:**

- A deployment target. The build produces a Cloudflare Worker; it has not been
  deployed from this machine.
- Rate limiting and e-mail verification, which belong in the reverse proxy in
  front of the API. See [DEPLOYMENT.md](DEPLOYMENT.md).

PostgreSQL 18.6 is the normal local development database. The compatibility
evidence, the dedicated `arch_dev_pg` verification and the remaining
limitations are in [POSTGRESQL_COMPATIBILITY.md](POSTGRESQL_COMPATIBILITY.md).
