# Deployment

The ARCH platform is two deployables plus one database:

| Piece        | What it is                                                                      | Where it runs                                                       |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Website**  | A TanStack Start application: server-rendered pages plus a small client bundle  | A Cloudflare Worker (the Nitro build preset is `cloudflare-module`) |
| **API**      | A FastAPI service with the content, accounts, routes, votes and operations data | Any Python 3.11+ host                                               |
| **Database** | PostgreSQL                                                                      | Managed PostgreSQL, or a container                                  |

The website and the API are deployed separately. The website only ever calls the
API over HTTPS, and the API holds every secret.

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

Load the content the site needs. This only loads what does not invent business
facts; prices and courses stay empty until ARCH publishes them, and the rules
are marked as drafts.

```bash
uv run python -m app.seed
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
static assets in `.output/public`.

```bash
# Deploy the worker
cd .output/server
npx wrangler deploy
```

`npx wrangler --cwd .output/server dev` runs the built worker locally.

To point the website at a different API, set `VITE_API_BASE_URL` **before**
building:

```bash
VITE_API_BASE_URL=https://api.arch.vn bun run build
```

> `bun run build` clears `.output` first. Repeated builds otherwise leave a
> server bundle that references a stylesheet hash from an earlier build, and
> the site renders without its styles.

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
- a production PostgreSQL deployment with the intended application role,
  backups, monitoring and load;
- the live language-model provider path for the assistant (the provider call,
  the grounding and the fallback are unit-tested; the HTTP call to a provider
  is not);
- rate limiting and e-mail verification, which belong in the proxy.
