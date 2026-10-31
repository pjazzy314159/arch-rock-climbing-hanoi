# ARCH Content Intake and Approval

**Status:** preparation only. No ARCH business content has been supplied, reviewed, or approved.

This document defines how real ARCH Rock Climbing Hanoi information will be requested,
recorded, approved, entered into the existing Admin CMS, and published. It does not contain
any ARCH business facts. Every value below is either a blank template field or an explicit
"to be confirmed" placeholder.

Do not fill these templates with invented FAQ answers, rules, hours, prices, product claims,
course details, event details, or service descriptions. Do not publish a record merely
because it has been entered into the CMS.

---

## 1. Purpose and scope

- Collect information from ARCH, not from AI assumptions.
- Keep the original wording and its source.
- Record approval explicitly.
- Enter approved content through the existing Admin CMS.
- Publish only after approval.
- Verify the public website and the ARCH Assistant against the approved content.

Out of scope: inventing content, creating a second content system, changing visibility rules,
adding CMS fields, or starting Phase 10 (Impeccable).

---

## 2. Two records, one source of truth

| Record | Location | Purpose |
|---|---|---|
| **Approval register** | This document (or an ARCH-owned spreadsheet derived from it) | Who supplied the text, who approved it, when, and what changed. |
| **Published content** | Existing database, edited only through `/admin` | What the public site and Assistant actually use. |

The CMS has no fields for "provided by", "approved by", "source", or "last verified". Those
facts therefore live in the register; do not add unsupported fields to application models to
hold them. The CMS record id links the register entry to the published row.

The public website and the Assistant read the same database. Entering unapproved text and
leaving it visible is therefore a publication, not a draft.

---

## 3. Current CMS capabilities

### 3.1 Access and roles

- Content mutations require the `admin` role (`require_admin` in `backend/src/app/deps.py`).
- `staff` and `customer` accounts cannot create or edit content through the API.
- There is one admin role for every category. There are no per-category editor or approver
  permissions.
- Admin UI entry point: `/admin`, tabs: Customers, Routes, Walls, Tasks, Shifts, Events,
  Courses, FAQ, Rules, Services, Messages, Products, Prices, Opening hours.

### 3.2 Capability matrix

| Category | Admin API | Fields | Publication control | Public surface | Assistant grounding |
|---|---|---|---|---|---|
| FAQ | `GET/POST/PATCH/DELETE /api/admin/faq` | question, answer, category, keywords, is_published | `is_published` (default **false**) | None directly; used by the Assistant widget | Yes, published only |
| Rules | `GET/POST/PATCH/DELETE /api/admin/rules` | title, body, category, sort_order, is_active, is_confirmed | `is_active` gates visibility; `is_confirmed` labels as draft | `/visit` with a `DRAFT` badge when unconfirmed | Yes, active only, with a draft note |
| Opening hours | `GET/POST/PATCH/DELETE /api/admin/opening-hours` | day_of_week, opens_at, closes_at, note, is_closed | **None** — every row is public | `/visit` (and `/api/public/gym`) | Yes, all rows |
| Prices | `GET/POST/PATCH /api/admin/prices` (no delete) | category, name, description, amount_vnd, unit, sort_order, is_active | `is_active` | `/visit` | Yes, active only |
| Products | `GET/POST/PATCH /api/admin/products` (no delete) | sku, name, brand, category, fit, price_vnd, description, image_url, stock, is_active | `is_active` | `/shop`, `/shop/:id` | No |
| Services | `GET/POST/PATCH/DELETE /api/admin/services` | title, summary, icon, sort_order, is_active | `is_active` | `/gym` | Yes, active only |
| Courses | `GET/POST/PATCH/DELETE /api/admin/courses` | title, level, summary, description, instructor, schedule, duration_weeks, capacity, price_vnd, is_active | `is_active` | `/courses` | Yes, active only |
| Events | `GET/POST/PATCH/DELETE /api/admin/events` | title, description, starts_at, ends_at, location, capacity, is_public, created_by_id | `is_public`; past events are hidden from public lists | `/events` | Yes, public and upcoming |
| Gym profile | **No admin endpoint or UI** | name, tagline, address, phone, email, instagram, map_url, about, surface_area_m2, route_count, opening_note | Computed `is_placeholder` only | `/visit` | No |

### 3.3 Field constraints (what the CMS actually accepts)

Use the stricter of the API schema and the database column.

#### FAQ (`FaqEntry`)

| Field | Required | Constraint | Notes |
|---|---|---|---|
| question | yes | 1–200 characters (schema); column 300 | Trimmed by the server |
| answer | yes | 1–4000 characters | Trimmed by the server |
| category | no | ≤80 in schema; column 60 | Defaults to `General` |
| keywords | no | ≤200 in schema; column 400 | Used by Assistant matching |
| is_published | no | boolean | Defaults to **false**; only `true` is public |

No `sort_order`; admin list and public list are ordered by id.

#### Rules (`Rule`)

| Field | Required | Constraint | Notes |
|---|---|---|---|
| title | yes | 1–160 characters | Trimmed |
| body | yes | 1–4000 characters | Trimmed |
| category | no | ≤80 in schema; column 60 | Defaults to `General` |
| sort_order | no | integer 0–999 | Public/admin ordering |
| is_active | no | boolean | Defaults to `true`; gates public visibility |
| is_confirmed | no | boolean | Defaults to `false`; shows `DRAFT` publicly |

Public rules are filtered by `is_active` only. `is_confirmed=false` does **not** hide a rule; it
adds the draft label. Inactive rules are excluded from the public page and from the Assistant.

#### Opening hours (`OpeningHour`)

| Field | Required | Constraint | Notes |
|---|---|---|---|
| day_of_week | yes | 0–6 (0 = Monday) | One row per interval |
| opens_at / closes_at | for open days | time values | Both required when `is_closed=false` |
| note | no | ≤200 characters | Shown publicly for closed days; included in Assistant context |
| is_closed | no | boolean | Marks a closed day/interval |

Multiple intervals per day are supported (one row each). There is no active/published flag:
any row entered is public immediately.

#### Prices (`Price`)

| Field | Required | Constraint | Notes |
|---|---|---|---|
| category | yes | 1–80 characters | Groups the public price list |
| name | yes | 1–120 characters | |
| description | no | ≤4000 characters | |
| amount_vnd | yes | integer ≥ 0 | Vietnamese đồng |
| unit | no | ≤40 characters | e.g. the unit ARCH uses |
| sort_order | no | integer 0–999 | Public/admin ordering |
| is_active | no | boolean | Defaults to `true` |

No delete endpoint; deactivate instead.

#### Products (`Product`)

| Field | Required | Constraint | Notes |
|---|---|---|---|
| sku | yes | 1–40 characters, unique | Duplicate SKU returns 409 |
| name | yes | 1–140 characters | |
| brand | no | ≤80 characters | |
| category | no | ≤60 characters | Shop category tabs |
| fit | no | ≤40 characters | |
| price_vnd | no | integer ≥ 0 | Defaults to 0 |
| description | no | ≤4000 characters | |
| image_url | no | ≤400 characters, single URL | Upload endpoint available |
| stock | no | integer ≥ 0 | Informational; no checkout |
| is_active | no | boolean | Defaults to `true` |

No delete endpoint; deactivate instead. One image per product, no gallery.

#### Services (`Service`)

| Field | Required | Constraint | Notes |
|---|---|---|---|
| title | yes | 1–120 characters | |
| summary | no | ≤4000 characters | |
| icon | no | ≤40 characters | Icon key used by the public page; defaults to `mountain` |
| sort_order | no | integer 0–999 | |
| is_active | no | boolean | Defaults to `true` |

#### Courses (`Course`)

| Field | Required | Constraint | Notes |
|---|---|---|---|
| title | yes | 1–140 characters | |
| level | no | ≤60 characters | Defaults to `All levels` |
| summary | no | ≤4000 characters | |
| description | no | ≤4000 characters | |
| instructor | no | ≤120 characters | Publish only with ARCH approval |
| schedule | no | ≤200 characters, free text | Not a structured timetable |
| duration_weeks | no | integer ≥ 1 or null | |
| capacity | no | integer ≥ 1 or null | |
| price_vnd | no | integer ≥ 0 or null | |
| is_active | no | boolean | Defaults to `true` |

No start/end date, session, enrolment, or separate confirmation flag.

#### Events (`Event`)

| Field | Required | Constraint | Notes |
|---|---|---|---|
| title | yes | 1–160 characters | |
| description | no | ≤4000 characters | |
| starts_at | yes | date-time | |
| ends_at | no | date-time, must be after start | |
| location | no | ≤160 characters | |
| capacity | no | integer 1–10 000 or null | |
| is_public | no | boolean | Defaults to `true` |
| created_by_id | automatic | set from the signed-in admin | Not editable |

Public `/api/public/events` shows `is_public=true` and, by default, only events that have not
started yet. There is no separate active flag.

#### Gym profile (`GymInfo`, singleton)

Supported columns: name, tagline, address, phone, email, instagram, map_url, about,
surface_area_m2, route_count, opening_note.

There is **no admin API and no admin UI** for this record. Today it can only be changed through
a database migration/script or the seed command, which is not an acceptable content workflow.

### 3.4 Media

- Upload: `POST /api/admin/media/images` (admin only).
- Accepts JPEG, PNG, WebP; maximum 10 MB; type detected from file bytes, not filename.
- Storage provider is local filesystem or R2 depending on configuration.
- Wired into product, wall, and route forms; one image URL field per record.
- No image deletion or garbage collection; no gallery (a gallery is not part of this phase).

### 3.5 Public and Assistant visibility summary

- FAQ: published only. Rendered inside the Assistant widget, not as a standalone FAQ page.
- Rules: active only; unconfirmed rules render with a `DRAFT` badge and are labelled
  "(Draft — awaiting ARCH confirmation)" in Assistant context.
- Opening hours: all rows; closed placeholder rows still render as "Closed — …".
- Prices, services, courses, products: active only.
- Events: public only, upcoming by default.
- Assistant retrieval covers FAQ, routes, prices, hours, rules, courses, events, and services.
  It does **not** include products or the gym contact profile.
- When no approved information is found, the Assistant returns a "not covered" / "hasn't
  published that information yet" response rather than guessing.

### 3.6 Existing development seed records — review before launch

The base seed (`python -m app.seed`) is not ARCH-approved content. It currently creates:

- 12 FAQ entries with `is_published=true`. Several answers are placeholder statements
  ("being confirmed by ARCH") and several contain facility claims. Published FAQs are used by
  the Assistant as grounding context.
- 6 rules with `is_active=true`, `is_confirmed=false`; they appear publicly with `DRAFT`.
- 6 services with `is_active=true`.
- 7 opening-hour rows, all `is_closed=true` with the note "To be confirmed by ARCH"; these
  render publicly instead of the empty state because the collection is non-empty.
- A gym record with surface area, route count, tagline, about text, and an opening note. The
  public `is_placeholder` flag is computed as false whenever `opening_note` or any hour row is
  present, so these seeded claims are presented as ARCH-published details.

The `--demo` seed additionally creates sample products, courses, events, routes, walls, and
accounts; it refuses only when `ARCH_ENVIRONMENT` is a production name, not when `DATABASE_URL`
points at a production database.

Action: determine what the target environment actually contains, treat every seeded record as
unapproved, and replace or remove it before launch. Do not treat a seeded row as ARCH-supplied
content, and do not run the base seed as a way to "fill" the site. The full execution-path,
exposure and remediation audit is in
[`SEED_DATA_SAFETY_AUDIT.md`](SEED_DATA_SAFETY_AUDIT.md).

---

## 4. Content ownership

No names, roles, phone numbers, or email addresses have been supplied. Do not guess them.

| Content category | Information provider | Final approver | Status |
|---|---|---|---|
| FAQ | To be confirmed | To be confirmed | Pending |
| Rules and policies | To be confirmed | To be confirmed | Pending |
| Opening hours | To be confirmed | To be confirmed | Pending |
| Prices | To be confirmed | To be confirmed | Pending |
| Products | To be confirmed | To be confirmed | Pending |
| Services | To be confirmed | To be confirmed | Pending |
| Courses | To be confirmed | To be confirmed | Pending |
| Events | To be confirmed | To be confirmed | Pending |
| Gym profile and contact details (supporting) | To be confirmed | To be confirmed | Pending |

Rules for this table:

- One named provider and one named approver per category.
- A person may hold more than one category, but each category must be explicit.
- If the approver changes, update the table and the register; do not rely on memory.
- Record the approval channel (email, signed document, meeting note) in the register.

---

## 5. Intake register and templates

### 5.1 Common intake record

Create one of these blocks per content item or per batch. Keep the original wording exactly as
supplied; put editorial clean-up in a separate "proposed CMS text" field so the difference is
visible.

| Intake field | Value |
|---|---|
| Category | |
| Original text as supplied | |
| Proposed CMS text (meaning unchanged) | |
| Source (document, email, meeting, date) | |
| Provided by (name or role) | |
| Approved by (name or role) | |
| Approval status | Not received / Received – awaiting review / Approved / Published / Rejected – needs correction |
| Date last verified | |
| CMS record id | |
| Notes / open questions | |

Status definitions:

- **Not received** — nothing from ARCH yet.
- **Received – awaiting review** — text exists, but no authorised approval.
- **Approved** — an authorised ARCH person approved this exact wording.
- **Published** — approved text is live in the CMS and visible publicly.
- **Rejected – needs correction** — reviewed and not accepted; do not enter or publish.

### 5.2 FAQ template

| CMS field | Value supplied by ARCH |
|---|---|
| question | |
| answer | |
| category | |
| keywords (search terms, not public copy) | |
| is_published | `false` until approved, then `true` |

### 5.3 Rules template

| CMS field | Value supplied by ARCH |
|---|---|
| title | |
| body | |
| category | |
| sort_order | |
| is_active | `false` until approved, then `true` |
| is_confirmed | `false` until approved, then `true` |

### 5.4 Opening hours template

One row per interval. Repeat the block for split hours.

| CMS field | Value supplied by ARCH |
|---|---|
| day_of_week (0 = Monday … 6 = Sunday) | |
| opens_at | |
| closes_at | |
| is_closed | |
| note | |

Also record, outside the CMS: holiday closures, exceptional dates, time zone, and the
effective date of the schedule.

### 5.5 Prices template

| CMS field | Value supplied by ARCH |
|---|---|
| category | |
| name | |
| description | |
| amount_vnd | |
| unit | |
| sort_order | |
| is_active | `false` until approved, then `true` |

Also record: currency confirmation (VND), validity period, and who approved the amount.

### 5.6 Products template

| CMS field | Value supplied by ARCH |
|---|---|
| sku | |
| name | |
| brand | |
| category | |
| fit | |
| price_vnd | |
| description | |
| image_url (uploaded file) | |
| stock | |
| is_active | `false` until approved, then `true` |

Also record: image ownership/permission, and whether stock is public information.

### 5.7 Services template

| CMS field | Value supplied by ARCH |
|---|---|
| title | |
| summary | |
| icon | |
| sort_order | |
| is_active | `false` until approved, then `true` |

### 5.8 Courses template

| CMS field | Value supplied by ARCH |
|---|---|
| title | |
| level | |
| summary | |
| description | |
| instructor (only if approved for publication) | |
| schedule | |
| duration_weeks | |
| capacity | |
| price_vnd | |
| is_active | `false` until approved, then `true` |

Also record: term dates, registration process, and whether the schedule is fixed or indicative.
These are not CMS fields today.

### 5.9 Events template

| CMS field | Value supplied by ARCH |
|---|---|
| title | |
| description | |
| starts_at | |
| ends_at | |
| location | |
| capacity | |
| is_public | `false` until approved, then `true` |

Also record: time zone, cancellation policy, and whether the event may be promoted publicly.

### 5.10 Gym profile template

These values currently have no admin workflow; record them here, then decide the smallest safe
implementation path before entering them.

| CMS field | Value supplied by ARCH |
|---|---|
| name | |
| tagline | |
| address | |
| phone | |
| email | |
| instagram | |
| map_url | |
| about | |
| surface_area_m2 | |
| route_count | |
| opening_note | |

---

## 6. Approval workflow

1. **Request** — send the information request in section 9 to the named ARCH contact.
2. **Receive** — store the original text and its source in the register.
3. **Record without changing meaning** — if wording must be shortened for a CMS limit, keep the
   original and the proposed text side by side.
4. **Review** — the authorised ARCH approver reviews the exact proposed wording.
5. **Approve explicitly** — record approver, date, and channel. Silence, a meeting discussion,
   or "looks fine" without a named approval is not an approval.
6. **Enter into the CMS** — create the record with its publication flag off where the model
   supports one. For opening hours there is no off switch, so enter only approved hours.
7. **Publish** — turn on the category's publication control only after approval:
   - FAQ: `is_published=true`
   - Rules: `is_active=true`; set `is_confirmed=true` when the wording is approved
   - Prices / products / services / courses: `is_active=true`
   - Events: `is_public=true`
   - Opening hours: entering the row is publishing; there is no draft state
8. **Verify** — check the public page and ask the Assistant a question that should (and should
   not) retrieve the item. Confirm inactive/unpublished content is absent.

Category state must always be one of: not received, received – awaiting review, approved,
published, rejected – needs correction. "In the CMS" is not a status and does not imply
approval.

Never publish a record because a form was filled in. Never leave unapproved text active while
waiting for approval.

---

## 7. Assistant grounding policy

The Assistant may:

- Answer from published FAQ entries.
- Use active prices, opening hours, rules, courses, events, services, and active routes as
  grounding context.
- Quote an approved rule as a rule.
- Say that information has not been published when retrieval finds nothing.

The Assistant must not:

- Invent opening hours, prices, policies, events, courses, services, or product details.
- Present an unconfirmed rule as an official ARCH policy. Unconfirmed rules are labelled
  "(Draft — awaiting ARCH confirmation)" in retrieval context, and the public page shows
  `DRAFT`.
- Treat a draft FAQ, inactive price, inactive course, hidden event, inactive service, or
  inactive rule as available information.
- Treat seeded development content as approved ARCH content.

Operational notes:

- Published FAQ answers are returned directly when the match is strong, so FAQ wording must be
  approved before `is_published=true`.
- The Assistant does not ground on products or the gym contact profile. Questions about shop
  stock or address/phone should be answered as unavailable until those sources are added.
- Retrieval labels opening hours with zero-based day numbers ("Day 0" … "Day 6"), so verify
  that answers name the correct weekday before publishing a schedule.

---

## 8. Gap analysis

Only gaps that affect safe collection, approval, publication, or verification are listed.
No CMS feature is implemented as part of this task.

| Requirement | Existing CMS support | Gap | Recommended action |
|---|---|---|---|
| Record who supplied and approved each item | None | No source/approver/verified-date fields on any content model; `ContentRevision` exists but is never written | Keep the register in this document; do not add model fields in this phase |
| Audit trail of content changes | `ContentRevision` model exists but is unused | No automatic revision history | Rely on the register plus Git history for process evidence; propose an audit task separately if ARCH requires it |
| Edit gym profile and contact details | `GymInfo` model and `/api/public/gym` | No admin endpoint or UI | Smallest safe follow-up: add a gym-profile admin endpoint/UI, then enter approved values |
| Correct placeholder flag for the gym | `is_placeholder` computed from empty address/phone/email/opening_note and presence of hours | A non-empty `opening_note` or any hour row makes the record look non-placeholder; seeded area/route claims are presented as ARCH-published | Confirm or remove seeded values; fix the placeholder rule in a separate change |
| Rules admin copy matches behaviour | Public shows active rules with a draft badge | Admin UI says "Active and confirmed rules are shown publicly" and "Active and confirmed rules appear on the public site" — both are inaccurate | Correct the admin copy in a small follow-up commit |
| Draft state for opening hours | None | Any row is public immediately; seeded closed rows replace the empty state | Enter only approved hours; decide separately whether a draft/staging mechanism is needed |
| Split opening hours on the public page | Multiple rows per day are stored | Public table keys rows by weekday and repeats the day label instead of grouping intervals | Confirm whether ARCH uses split hours; fix display only if needed |
| Remove price/product records | Create and update only | No DELETE endpoint; mistakes must be deactivated | Accept deactivation, or add delete in a separate task if ARCH requires removal |
| Product imagery | Single `image_url` + upload endpoint | One image only; no gallery; no deletion or GC | Request one approved image per product; do not promise a gallery |
| Per-category content permissions | Single `admin` role | Any admin can edit every category; no category owner or approver role | Track ownership in the register; do not add roles in this phase |
| FAQ ordering and public page | `is_published`; list ordered by id | No `sort_order`; no standalone public FAQ page (Assistant only) | Confirm whether ARCH expects a public FAQ page; if so, scope it separately |
| Assistant weekday labels | Retrieval uses day numbers 0–6 | Answers may say "Day 0" instead of "Monday" | Verify schedule answers manually; fix labelling in a small follow-up |
| Column/schema length parity | API limits sometimes exceed column sizes (e.g. category 80 vs 60) | Postgres could reject text that passes validation | Keep category values short (≤60) in intake guidance; fix parity separately |
| Development seed content | Base seed publishes FAQ, draft rules, services, closed hours, and gym claims | Seeded placeholders can appear public and be used by the Assistant | Inventory the target database; replace or remove seeded content before launch |

---

## 9. Information request for ARCH

Send this as a single request. Do not pre-fill answers. Ask for the following, in Vietnamese
and/or English as ARCH prefers.

1. **Ownership and approval**
   - Who provides information for each category: FAQ, rules and safety policies, opening
     hours, prices, products, services, courses, events, gym profile?
   - Who is authorised to give final approval for each category?
   - How should approval be recorded (email, signed document, meeting note)?
   - How often should each category be reviewed?
   - Which languages should be published?

2. **FAQ**
   - Approved questions and answers, with the category each belongs to.
   - Any answers that must not be used by the Assistant.

3. **Rules and safety policies**
   - Full official rule text, including safety and facility instructions.
   - Which rules are mandatory, which are guidance, and the effective date.
   - Whether unconfirmed drafts may be shown publicly with a `DRAFT` label.

4. **Opening hours**
   - Hours for each day, including split intervals if used.
   - Holiday closures, exceptional dates, and time zone.
   - When the schedule takes effect.

5. **Prices**
   - Category, name, amount in VND, unit, description, and validity period.
   - Any membership or pass conditions that must be stated.

6. **Products**
   - SKU, name, brand, category, fit, price, stock, description.
   - One approved product image per item, with permission to publish it.
   - Whether stock levels may be shown publicly.

7. **Services**
   - Official service names and descriptions.
   - Any facilities that must not be claimed until confirmed.

8. **Courses**
   - Course names, levels, descriptions, instructors (only if approved for publication),
     schedules, duration, capacity, price, and whether the schedule is fixed or indicative.
   - Registration process and term dates, if they should be published.

9. **Events**
   - Event titles, descriptions, start/end times, location, capacity, and whether each event is
     public.
   - Cancellation and promotion rules.

10. **Gym profile and contact details**
    - Display name, tagline, street address, phone, email, Instagram, map link, about text,
      surface area, route count, and opening note.
    - Confirmation of which details may be published.

11. **Publication controls**
    - Confirmation that nothing should be published before written approval.
    - The name of the person who will confirm that the public page and Assistant answers are
      correct after publication.

---

## 10. Verification basis

This document was checked against the implementation at commit `9fdb613` on branch
`test_deploy`:

- Models: `backend/src/app/models/content.py`, `backend/src/app/models/commerce.py`
- Schemas: `backend/src/app/schemas/common.py`, `backend/src/app/schemas/staff.py`
- Admin API: `backend/src/app/api/admin.py`
- Public API: `backend/src/app/api/public.py`
- Assistant retrieval: `backend/src/app/services/retrieval.py`,
  `backend/src/app/services/assistant.py`
- Admin UI: `src/components/arch/*-management.tsx`, `src/components/arch/staff-pages.tsx`
- Public UI: `src/components/arch/content-pages.tsx`, `src/components/arch/public-pages.tsx`
- Media and seed: `backend/src/app/storage.py`, `backend/src/app/seed.py`

No application code, schema, migration, or visibility rule was changed for this task. No ARCH
content was collected, entered, or published.
