# Local development

How to run the ARCH website and its API on this machine, and how to look at
them in a browser.

---

## 1. What you need

| Tool      | Version used here                           | Notes                                                                                |
| --------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| Node.js   | 24.16.0                                     | Any current LTS works.                                                               |
| Bun       | 1.4.3                                       | The repository has a `bun.lock`. Install with `npm install -g bun` if it is missing. |
| Python    | 3.11.9 (3.13 also works)                    | The backend needs 3.11 or newer.                                                     |
| uv        | 0.11.7                                      | Manages the Python environment. Install from <https://docs.astral.sh/uv/>.           |
| A browser | Any current Chrome, Edge, Firefox or Safari |                                                                                      |

Nothing else is required. **PostgreSQL is not needed for local development** —
the backend runs on SQLite by default. Docker is not required either.

---

## 2. Install the dependencies

```bash
# From the repository root: the website
bun install

# The API
cd backend
uv sync --extra dev
cd ..
```

`uv sync` creates `backend/.venv` and installs the API's dependencies plus the
test and lint tools.

---

## 3. Configure the environment

```bash
cp .env.example .env
```

`.env` is git-ignored. The values that matter for local development are:

```dotenv
# The API the browser talks to
VITE_API_BASE_URL=http://localhost:8000

# The API's own database
DATABASE_URL=sqlite:///./arch_dev.db

# Signs the access tokens. Any long random string works locally.
ARCH_SECRET_KEY=local-development-only-not-a-real-secret

# The browser origins allowed to call the API. 8080 is the dev server,
# 8090 is the production preview.
CORS_ORIGINS=http://localhost:5173,http://localhost:8080,http://localhost:8090
```

`VITE_API_BASE_URL` is read by the **browser**, so it must be the address the
browser can reach. `DATABASE_URL` and `ARCH_SECRET_KEY` are read by the
**server** only.

The relative `sqlite:///./arch_dev.db` is resolved from the directory the API
is started in, so run the API from `backend/`.

---

## 4. Set up the database

```bash
cd backend

# Apply every migration (this also creates the database file)
uv run alembic upgrade head

# Load the content the site needs
uv run python -m app.seed

# ...or also load clearly-labelled sample data
uv run python -m app.seed --demo
```

The seed runs the migrations itself, so `uv run python -m app.seed` on a fresh
checkout is enough. Use `--reset` to start from an empty database.

`uv run alembic current` shows the applied revision and
`uv run alembic check` reports whether the models and the migrations still
agree.

---

## 5. Start the two services

Two terminals:

```bash
# Terminal 1 — the API
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 2 — the website
bun run dev
```

---

## 6. The local addresses

| What                            | Address                              |
| ------------------------------- | ------------------------------------ |
| **Website**                     | <http://localhost:8080>              |
| **API**                         | <http://localhost:8000>              |
| **API documentation (Swagger)** | <http://localhost:8000/docs>         |
| **API schema (OpenAPI)**        | <http://localhost:8000/openapi.json> |
| **API health check**            | <http://localhost:8000/api/health>   |
| **Production build preview**    | <http://localhost:8090> (see §9)     |

---

## 7. Looking at the site

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

## 8. Trying the features

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

### Running the checks yourself

```bash
# Website
bun run lint
bun run typecheck
bun run test
bun run build

# API
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

### Browser checks

There are scripts that drive a real browser. Start the API and the dev server
first, then:

```bash
bun run check:pages        # every page loads without console or network errors
bun run check:contact      # the contact form reaches the API
bun run check:member       # register, sign the agreement, log a climb, edit the profile
bun run check:voting       # vote, change the vote, withdraw it
bun run check:staff        # the staff and administration flows, and the refusals
bun run check:assistant    # the assistant answers, and admits what it does not know
bun run screenshot         # writes a screenshot of every page to var/screenshots/
```

They take a base URL, so they also work against the production preview:

```bash
node scripts/check-pages.mjs http://localhost:8090
```

---

## 9. The production build

```bash
bun run build          # clears .output first, then builds
bun run preview:build  # serves the built worker on http://localhost:8090
```

`vite preview` does **not** work for this project: the build targets the
Cloudflare Worker preset and the preview plugin looks for a different
layout. `scripts/preview-build.mjs` serves the built Worker locally instead.

The preview reads the build from disk when it starts, so **restart it after
every rebuild**.

```bash
bun run check:styles http://localhost:8090   # confirms the page is really styled
```

---

## 10. Test accounts

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

---

## 11. Troubleshooting

**The pages say "Showing sample data"**
The API is not reachable, or `VITE_API_BASE_URL` is wrong. Check
<http://localhost:8000/api/health> and the value in `.env`. Remember that
`VITE_` variables are read when the dev server starts: restart it after
changing `.env`.

**`Failed to fetch dynamically imported module` in the browser console**
The dev server was started before a new route file existed. Restart it.

**`Cannot find module '/@fs/…'` or the setup file fails to load in the tests**
The repository is being reached through a directory symlink. `bun run test`
runs `scripts/run-tests.mjs`, which re-anchors the working directory to the
real path and avoids it.

**The API answers with 403 on the staff pages**
The signed-in account does not hold the staff or administrator role. Sign in
with one of the accounts in §10.

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

**The build succeeds but the preview has no styles**
`bun run build` clears `.output` first. If the preview was already running it
is still serving the old build: stop it, rebuild and start it again.
`bun run check:styles http://localhost:8090` tells you whether the page is
really styled.

**The assistant always says it does not know**
That is the expected behaviour without a provider, and with an empty
knowledge base. Check <http://localhost:8000/api/assistant/status> and the
published FAQ in the database.

---

## 12. What needs an external service

**Works entirely locally, with no credentials:**

- Every page, the route directory, the leaderboard, the shop, the contact
  form, registration and sign-in, the safety agreement, the logbook, the
  profile, route voting, the staff tasks and checklists, the operations
  workspace, and the assistant answering from the published FAQ.

**Needs a provider key (server-side only):**

- The assistant answering with a language model. Set `LLM_PROVIDER`,
  `LLM_API_KEY` and `LLM_MODEL` in the environment of the **API**. The key is
  never sent to the browser.

**Needs infrastructure that is not on this machine:**

- PostgreSQL. The backend is written for it and the migrations apply to it,
  but the local development database is SQLite.
- A deployment target. The build produces a Cloudflare Worker; it has not been
  deployed from this machine.
- Rate limiting and e-mail verification, which belong in the reverse proxy in
  front of the API. See [DEPLOYMENT.md](DEPLOYMENT.md).
