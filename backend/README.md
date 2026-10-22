# ARCH backend

FastAPI service behind the ARCH Rock Climbing Hanoi website.

It owns everything the website needs that must be real: published content,
customer accounts and records, climbing routes with community votes,
leaderboards, staff tasks and schedules, and the customer-support assistant.

## What it is built with

| Concern | Choice |
| --- | --- |
| API framework | FastAPI (Python 3.11+) |
| ORM | SQLAlchemy 2.0 (declarative, typed) |
| Migrations | Alembic |
| Database | PostgreSQL in deployment, SQLite for zero-setup local development |
| Auth | bcrypt password hashing + signed JWT access tokens |
| Validation | Pydantic v2 (request and response schemas) |
| Tests | pytest + FastAPI `TestClient` |

## Running it

```bash
# From the repository root
cd backend

# Install dependencies (creates backend/.venv)
uv sync --extra dev

# Bring the database to the latest migration
uv run alembic upgrade head

# Load the content the site needs (no invented business facts)
uv run python -m app.seed

# ...or also load clearly-labelled sample data for local development
uv run python -m app.seed --demo

# Start the API on http://localhost:8000
uv run uvicorn app.main:app --reload --port 8000
```

`python -m app.seed` runs the migrations itself, so it is safe to call on a
fresh database. Use `--reset` to roll the schema back to an empty database
first.

Interactive API documentation is served at <http://localhost:8000/docs> and the
OpenAPI schema at <http://localhost:8000/openapi.json>.

### Development accounts

`python -m app.seed --demo` creates these accounts. They are **development
only** and the seed refuses to create them when `ARCH_ENVIRONMENT` is a
production environment.

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@example.com` | `admin-demo-password` |
| Staff | `staff@example.com` | `staff-demo-password` |
| Customer | `alex@example.com` | `customer-demo-password` |

The seed also loads sample routes, products, climbs, votes and a staff task.
Everything it loads is labelled as sample data.

## Configuration

All configuration is read from environment variables (see `.env.example` in the
repository root). The most important ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy connection string. `sqlite:///./arch_dev.db` for local development, `postgresql+psycopg://…` for deployment. |
| `ARCH_SECRET_KEY` | Secret used to sign JWT access tokens. Must be unique per environment. |
| `ARCH_ACCESS_TOKEN_TTL_MINUTES` | Access-token lifetime (default 720 minutes). |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API. |
| `LLM_PROVIDER` / `LLM_API_KEY` / `LLM_MODEL` | Optional assistant provider. Without them the assistant answers from the knowledge base only. |

Secrets are only ever read on the server. The frontend never receives them.

## Roles and permissions

Permissions are enforced on the backend, not by hiding buttons:

| Role | Can |
| --- | --- |
| `customer` | Read public content, manage their own profile, log climbs, vote on routes, sign their own safety agreement, see the leaderboard. |
| `staff` | Everything a customer can do, plus see and update **their own** tasks, checklists and shifts. |
| `admin` | Manage members, routes, events, courses, staff tasks, shifts and safety-agreement records. |

A member can only reach their own records: ownership is checked on the server
for every private endpoint.

## API surface

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | – | Service health. |
| `GET` | `/api/public/gym` | – | Gym record and opening hours. |
| `GET` | `/api/public/prices` | – | Price list. |
| `GET` | `/api/public/services` | – | Services and facilities. |
| `GET` | `/api/public/courses` | – | Course catalogue. |
| `GET` | `/api/public/events` | – | Public events. |
| `GET` | `/api/public/rules` | – | Gym rules (draft rules are flagged). |
| `GET` | `/api/public/faq` | – | Published FAQ. |
| `GET` | `/api/public/products` | – | Shop catalogue. |
| `GET` | `/api/public/routes` | – | Route directory with vote summaries. |
| `POST` | `/api/public/contact` | – | Contact-form message. |
| `POST` | `/api/auth/register` | – | Create a customer account. |
| `POST` | `/api/auth/login` | – | Sign in. |
| `GET`/`PATCH` | `/api/auth/me` | member | Own profile. |
| `GET` | `/api/me/dashboard` | member | Own climbing statistics: outcomes, grades, ranking, recent attempts. |
| `GET`/`POST` | `/api/me/logbook` | member | Own logbook. |
| `GET` | `/api/me/agreement` | member | Own safety agreement. |
| `POST` | `/api/me/agreement/signature` | member | Sign the agreement. |
| `GET`/`POST`/`DELETE` | `/api/me/routes/{id}/vote` | member | Own difficulty vote. |
| `GET` | `/api/me/routes/{id}/tally` | – | Community vote summary. |
| `GET` | `/api/me/leaderboard` | – | Community leaderboard. |
| `GET` | `/api/staff/tasks` | staff | Own tasks (`?all=true` for admins). |
| `POST` | `/api/staff/tasks` | admin | Create and assign a task. |
| `PATCH` | `/api/staff/tasks/{id}` | staff | Update own task status. |
| `POST` | `/api/staff/tasks/{id}/status` | staff | Update own task status. |
| `PATCH` | `/api/staff/checklist/{id}` | staff | Tick off a checklist item. |
| `GET` | `/api/staff/shifts` | staff | Own shifts. |
| `POST` | `/api/staff/shifts` | admin | Schedule a shift. |
| `GET` | `/api/admin/summary` | admin | Dashboard metrics. |
| `GET` | `/api/admin/members` | admin | Customer records. |
| `GET`/`POST`/`PATCH` | `/api/admin/routes` | admin | Route management. |
| `GET` | `/api/admin/agreements` | admin | Agreement records. |
| `PATCH` | `/api/admin/agreements/{id}` | admin | Record a decision. |
| `GET`/`POST` | `/api/admin/events` | admin | Event management. |
| `POST` | `/api/assistant/chat` | – | Ask the customer-support assistant. |
| `GET` | `/api/assistant/status` | – | Whether a live model provider is configured. |

## Business rules that are implemented

### Route difficulty voting

* One active vote per person per route; voting again replaces the earlier vote.
* The voter's climbing level is stored with the vote for auditing.
* **Height and weight are not collected.**
* A perceived grade is only published once a route has at least three votes, and
  only shifts by one grade step, and only when at least half of the votes point
  the same way. The gym's official grade is never modified.

### Leaderboard

* Only `sent` results count; projects do not.
* A send is worth `grade index + 1` points (`V0` → 1, `V1` → 2, …).
* Ties are broken by number of sends, then best grade, then the date of the
  first send, then user id. Ranks are competition ranks (1, 1, 3, …).

Both sets of rules live in `app/services/climbing.py` and are covered by
`tests/test_climbing_rules.py`.

### Member dashboard

`GET /api/me/dashboard` answers with the member's own record and nothing else.
The rules live in `app/services/dashboard.py`, and it **reuses** the
leaderboard's calculation rather than reimplementing it, so the dashboard and
the public leaderboard cannot disagree.

* A **flash** is derived, not stored: a send with exactly one attempt. It is a
  subset of the sends, never a third outcome.
* The outcome counts break the member's own logbook into sends, flashes,
  projects and total attempts.
* The record is grouped by grade, easiest first. A grade the member has only
  tried appears too, with its projects and no sends.
* The ranking is the leaderboard's own: sends only, one point per grade step,
  ties broken by number of sends, then best grade, then the date of the first
  send. A climber with no sends is not ranked.
* The **percentile** is the share of ranked climbers who are at or behind the
  member's position, as a whole percentage. The top-ranked climber is at the
  100th percentile. It is `null` for a member who is not ranked, rather than
  zero.
* A value that is not available is `null`, never zero: no best grade, no
  rank, no first climb. `has_activity` says whether the member has logged
  anything at all.
* The scoring rule and the percentile rule are **sent with the ranking**, in
  words, so the interface cannot state a rule that differs from the one the
  numbers were worked out with.

Covered by `tests/test_dashboard.py`.

## Security notes

What is implemented and verified by `tests/test_security.py`:

* Passwords are hashed with **bcrypt** (cost 12) and salted per user. Plain
  text passwords are never stored or logged.
* Access tokens are **HS256 JWTs** signed with `ARCH_SECRET_KEY`. The token's
  `role` claim is informational only: authorisation always reads the role from
  the database, so a stale or tampered claim cannot grant access.
* The application **refuses to start in production** with the default
  `ARCH_SECRET_KEY`. `ARCH_ENVIRONMENT=production` (or `prod`) triggers the
  check, through the environment variable as well as through the settings
  object.
* `CORS_ORIGINS` must list explicit origins. A wildcard is rejected because it
  cannot be combined with credentialed requests.
* Passwords longer than bcrypt's 72-byte limit are **rejected**, not silently
  truncated.
* The login endpoint returns the same message for an unknown address and for a
  wrong password, and always performs a password comparison (against a dummy
  hash when the address is unknown) so responses cannot be used to discover
  which addresses have an account.
* Ownership is checked on the server: a member can only read or change their
  own logbook, agreement, profile and votes.
* Staff can only see and update **their own** tasks, checklists and shifts.
* Administrator endpoints are behind the `admin` role, not behind hidden
  buttons.
* Provider credentials (`LLM_API_KEY`) are only ever read on the server and
  are never returned by any endpoint.
* The demo seed refuses to create its well-known development passwords when
  `ARCH_ENVIRONMENT` is a production environment.

Known gaps that belong in the deployment setup rather than in the application:

* **No rate limiting.** Brute-force protection for `/api/auth/login` and spam
  protection for `/api/public/contact` must be provided by the reverse proxy
  or a gateway in front of the API.
* **No email verification.** Self-registration creates a usable account
  immediately. Add a verification step before ARCH opens sign-up publicly.
* **No token revocation.** An access token stays valid until it expires
  (default 12 hours). Sign-out is client-side only. A token version or
  denylist on the user record would be needed to revoke a token early.
* **No audit log of privileged actions.** `ContentRevision` exists in the
  schema for this, but nothing writes to it yet.
* **No HTTPS enforcement in the application.** Terminate TLS at the proxy.

## Tests

```bash
cd backend
uv run pytest
```

The suite covers the voting and leaderboard rules, the authentication flow,
ownership and role enforcement on every private endpoint, the public API, the
assistant's grounding and fallback behaviour, and the security configuration.
