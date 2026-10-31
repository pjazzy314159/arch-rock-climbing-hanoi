# Deployment

The ARCH platform is two deployables plus one database:

| Piece        | What it is                                                                      | Where it runs                                                       |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Website**  | A TanStack Start application: server-rendered pages plus a small client bundle  | Cloudflare Worker (default) or Vercel (zero-config)                 |
| **API**      | A FastAPI service with the content, accounts, routes, votes and operations data | Any Python 3.11+ host                                               |
| **Database** | PostgreSQL                                                                      | Managed PostgreSQL, or a container                                  |

The website and the API are deployed separately. The website only ever calls the
API over HTTPS, and the API holds every secret.

The TanStack Start frontend uses the Lovable-provided Vite configuration package
(`@lovable.dev/vite-tanstack-config`) which includes Nitro. The default build
targets Cloudflare Workers (`cloudflare-module` preset), but Nitro auto-detects
Vercel when the `VERCEL` environment variable is present (as set by Vercel CI),
producing a Build Output API v3 deployment with SSR server functions. Both
targets coexist: running `bun run build` without `VERCEL` produces the Cloudflare
output; setting `VERCEL=1` produces the Vercel output in `.vercel/output/`.

---

## 1. Environment variables

### Frontend (build time)

| Variable                                                                         | Required | Purpose                                                                                                                                       |
| -------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`                                                              | yes      | The public base URL of the API, for example `https://api.arch.vn`. Baked into the client bundle at build time, so it is public by definition. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | no       | Only used by the generated Supabase integration scaffold, which the ARCH backend replaces. Leave them empty.                                  |

**No secret is ever put in a `VITE_` variable.** Those values are shipped to the
browser. The API holds every credential.

### Backend (run time)

| Variable                        | Required | Purpose                                                                                                                     |
| ------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | yes      | SQLAlchemy connection string, for example `postgresql+psycopg://arch:<password>@<host>:5432/arch`.                          |
| `ARCH_SECRET_KEY`               | yes      | Signs the access tokens. Must be unique per environment. The API **refuses to start** in production with the default value. |
| `ARCH_ENVIRONMENT`              | yes      | `production` (or `prod`) switches on the production guards. `development` and `test` are the defaults.                      |
| `ARCH_ACCESS_TOKEN_TTL_MINUTES` | no       | How long an access token stays valid. Default `720`.                                                                        |
| `CORS_ORIGINS`                  | yes      | Comma-separated browser origins allowed to call the API. A wildcard is rejected. Include the website's origin.              |
| `LLM_PROVIDER`                  | no       | `groq`, `openai` or `google`. Leave empty to run the assistant from the knowledge base only.                                |
| `LLM_API_KEY`                   | no       | The provider key. Read on the server only.                                                                                  |
| `LLM_MODEL`                     | no       | The model name, for example `llama-3.3-70b-versatile`.                                                                      |

A worked example is in [`.env.example`](.env.example).

---

## 2. Database

```bash
# On the production database host: a restricted login role, not a superuser
createuser arch --pwprompt
createdb arch --owner arch
```

Grant the role access to the `public` schema in that database, then point
`DATABASE_URL` at it and apply the migrations:

```sql
\c arch
GRANT USAGE, CREATE ON SCHEMA public TO arch;
```

```bash
cd backend
uv sync --extra dev
uv run alembic upgrade head
```

`uv run alembic current` shows the applied revision, and
`uv run alembic check` reports whether the models and the migrations still
agree. Migrations are reversible: `uv run alembic downgrade -1`.

For local development, PostgreSQL 18.6 is the normal database too. The
dedicated `arch_dev_pg` database, the restricted `arch_dev` role and the
SQLite recovery fallback are documented in
[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) and verified in
[POSTGRESQL_COMPATIBILITY.md](POSTGRESQL_COMPATIBILITY.md). Do not point local
development at the production role.

Create ARCH business content through the Admin CMS. The `python -m app.seed`
command is a **local development tool only**; it applies the schema
migrations and does not insert any business content. Running it against a
production database will be refused.

```bash
# Migrations only (local development, CI, or production setup)
uv run alembic upgrade head
```

---

## 3. The API

```bash
cd backend
uv sync --extra dev
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

For a real deployment, run it under a process manager behind a TLS-terminating
reverse proxy. The API is a normal ASGI application and can also be served
with `gunicorn` with `uvicorn` workers:

```bash
uv run gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

Health check: `GET /api/health` returns the service status, the database
dialect and whether the database is reachable. A failed PostgreSQL connection
is bounded by a five-second connect timeout and reports
`status: "degraded"` with `database_reachable: false`; the API never falls
back to SQLite. Automated deployment checks should fail when the health
response is not `ok`.

**Before opening sign-up to the public**, note that the API has no e-mail
verification and no rate limiting. Put a rate limiter on `/api/auth/login` and
`/api/public/contact` in the proxy, and add verification before sign-up is
public.

---

## 4. The website

```bash
bun install
bun run build
```

The build writes `.output/` with a Cloudflare Worker in `.output/server` and the
static assets in `.output/public`. This is the **default** target (Nitro preset
`cloudflare-module`), used for Cloudflare Workers deployment.

**Vercel target (zero-config):**
When the `VERCEL` environment variable is set (as Vercel CI does automatically),
the same `bun run build` command selects the Nitro `vercel` preset and produces
a Build Output API v3 layout in `.vercel/output/` with SSR server functions and
static assets. No configuration file is required; both targets coexist.

```bash
# Default Cloudflare build
bun run build

# Vercel build (auto-detected on Vercel; set manually for local verification)
VERCEL=1 bun run build
```

```bash
# Deploy the Cloudflare Worker
cd .output/server
npx wrangler deploy
```

`npx wrangler --cwd .output/server dev` runs the built Cloudflare Worker locally.

For Vercel, import the repository in the Vercel dashboard (see §4a). The CLI
equivalent is `vercel` (preview) or `vercel --prod` (production).

To point the website at a different API, set `VITE_API_BASE_URL` **before**
building:

```bash
VITE_API_BASE_URL=https://api.arch.vn bun run build
```

> `bun run build` clears `.output` first. Repeated builds otherwise leave a
> server bundle that references a stylesheet hash from an earlier build, and
> the site renders without its styles.

---

### 4a. Vercel deployment (Preview and Production)

The TanStack Start frontend is compatible with Vercel's zero-config detection.
No `vercel.json` is required; the Nitro preset auto-detects the `VERCEL`
environment variable set by Vercel CI and produces a Build Output API v3 layout
in `.vercel/output/` (static assets under `static/`, SSR function under
`functions/__server.func/`).

**To import into Vercel:**

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Vercel, select **Add New… → Project** and import the repository.
3. Vercel will detect **TanStack Start** as the framework preset. Confirm it.
4. **Root Directory**: leave as repository root (contains `package.json`,
   `vite.config.ts`, `src/`, `public/`).
5. **Build Command**: `bun run build` (auto-detected; do not override).
6. **Output Directory**: *leave empty* (Nitro produces `.vercel/output/` which
   Vercel reads directly; setting an output directory breaks SSR).
7. **Environment Variables** (add under Project Settings → Environment Variables):
   - `VITE_API_BASE_URL` — the public HTTPS URL of the FastAPI backend
     (e.g., `https://api.arch.vn` for production; a Preview-specific staging
     URL for Preview environments). This variable is public and baked into the
     client bundle.
   - Do **not** add database credentials, JWT secrets, or private API keys to
     `VITE_` variables.
8. Click **Deploy**.

**Preview vs Production environments:**
- Every push to a non-main branch creates a Preview deployment with its own
  URL. Set `VITE_API_BASE_URL` in the Preview environment to a reachable
  staging/test API URL.
- Pushes to `main` (or a promoted Preview) create the Production deployment.
  Set `VITE_API_BASE_URL` in the Production environment to the live API URL.
- Never use `localhost` as the production backend URL.

**CORS requirements:**
The FastAPI backend must allow the Vercel website's origins:
- Production: the exact Vercel production URL (e.g., `https://arch.vercel.app`).
- Preview: each Preview deployment URL (e.g., `https://arch-git-feature.vercel.app`).
Add both to the API's `CORS_ORIGINS` (comma-separated). Wildcards are rejected.

**Separate deployments:**
The FastAPI backend and PostgreSQL database must be deployed independently.
This frontend project root only deploys the TanStack Start website. The API
holds all secrets; the website only ever calls the API over HTTPS.

**Local production preview:**
```bash
bun run build          # produces .output/ for Cloudflare (default)
VERCEL=1 bun run build # produces .vercel/output/ for Vercel
```
The Cloudflare build is the default; the Vercel build is only needed to verify
the Vercel output locally.

---

## 5. Checklist before going live

- [ ] `ARCH_SECRET_KEY` is set to a unique value and `ARCH_ENVIRONMENT=production`.
- [ ] `DATABASE_URL` points at PostgreSQL and `uv run alembic upgrade head` has run.
- [ ] `CORS_ORIGINS` lists the website's origin and nothing else.
- [ ] The API runs behind TLS, and the proxy rate-limits the sign-in and contact endpoints.
- [ ] `VITE_API_BASE_URL` is the API's public address, and the build was made with it.
- [ ] The database is backed up, and the `arch` role cannot drop tables.
- [ ] The placeholder photographs have been replaced with ARCH's real ones.
- [ ] ARCH's real opening hours, prices, courses, events and rules have been
      published into the database, and the rules have been marked as confirmed.

---

## 6. What has not been exercised here

This repository was developed and verified on a single machine without Docker
and without a cloud account. PostgreSQL 18.6 is the normal local development
database (`arch_dev_pg`) and was also run against disposable verification
databases. The migrations, repeatable seed, schema inspection, live API smoke
test, restart persistence and frontend-to-PostgreSQL check are recorded in
[POSTGRESQL_COMPATIBILITY.md](POSTGRESQL_COMPATIBILITY.md). A production
PostgreSQL deployment has not been exercised.

The following are documented and configuration-correct, but have not been run
end to end:

- deploying the Cloudflare Worker;
- deploying the Vercel Preview/Production build (zero-config detection verified;
  the `.vercel/output/` layout and Nitro `vercel` preset build work locally);
- a production PostgreSQL deployment with the intended application role,
  backups, monitoring and load;
- the live language-model provider path for the assistant (the provider call,
  the grounding and the fallback are unit-tested; the HTTP call to a provider
  is not);
- rate limiting and e-mail verification, which belong in the proxy.
