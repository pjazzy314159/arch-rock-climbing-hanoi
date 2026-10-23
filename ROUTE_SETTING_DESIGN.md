# Visual route-setting editor — design

**Status:** design for Phase 2. The MVP in this document is deliberately
small: one wall photograph, manually drawn hold boxes, an ordered sequence per
route, and a published copy that members can see. Nothing here detects holds
automatically, reconstructs a wall in 3D, or analyses climbing movement.

**Where this sits:** Phase 1 settled walls, route types, the route directory
and member attempts. This document describes the smallest addition that lets
ARCH staff annotate a wall photograph by hand and attach that annotation to a
route, without changing how routes or attempts already work.

---

## 1. What the current code already has

### Walls

`backend/app/models/climbing.py` → `Wall` (`walls`):

| Field                                 | Meaning                                |
| ------------------------------------- | -------------------------------------- |
| `id`, `name` (unique), `description`  | The physical wall                      |
| `image_url` (`String(400)`, nullable) | A **reference** to the wall photograph |
| `sort_order`, `is_active`             | Directory ordering and visibility      |

The photograph is not stored in the database. The seeded walls point at
`/walls/placeholder-gym.jpg`, which is served from the frontend's `public/`
folder. `WallOut` exposes `image_url` publicly and
`GET /api/public/walls` lists walls. There is **no** image width/height, no
upload endpoint and no media table; changing that is out of scope here.

### Routes

`ClimbRoute` (`climb_routes`) already has everything the editor needs to
identify a line:

- `wall_id` — nullable, `ON DELETE SET NULL`;
- `wall_type` — `slab` / `vertical` / `overhang` / `roof` / `boulder`, on the
  route, not the wall;
- `status` — `active` / `archived` / `pending_reset`;
- `set_at`, `archived_at`, `image_url`, `beta`, `created_by_id`;
- vote and achievement relationships.

`GET /api/public/routes` lists **active** routes only by default; the directory
can ask for archived ones explicitly. `GET /api/public/routes/{id}` returns one
route regardless of status. Route creation and update are **admin-only**
(`require_admin` in `backend/app/api/admin.py`); there is no staff route CRUD.

### Attempts and history

`Achievement` (`achievements`) **snapshots** `route_name` and `grade` beside
`route_id` (which is `ON DELETE SET NULL`). A member's logged climb therefore
keeps its own name and grade even if the route row later changes or disappears.
There is no route version table and no reset history.

This is the important existing decision: **attempts do not need route versions
to stay meaningful.** What they cannot express is _which physical line_ was
climbed after a reset. The editor must not silently rewrite a route that has
attempts; the safe pattern is to archive the old route and set a new one
(same or new name), which is already possible with `status` + `archived_at`.

### Authorisation and testing

- `backend/app/deps.py`: `get_current_user`, `require_staff`
  (staff + admin), `require_admin`.
- The ordinary backend tests run against an isolated SQLite database
  (`backend/tests/conftest.py`). PostgreSQL 18.6 is the deployment target and
  has been verified separately on a disposable database; see
  [POSTGRESQL_COMPATIBILITY.md](POSTGRESQL_COMPATIBILITY.md).
- Alembic head: `83693e68129f`. Migrations live in `backend/migrations/versions`.
- Frontend: admin dashboard in `src/components/arch/staff-pages.tsx`
  (`RoutesTab` creates routes and flips status). There is no canvas, no
  drawing code and no hold concept anywhere.

### What is missing

1. A place to store a hold: the box on the photograph.
2. A way to associate holds with a route, in order, with start and finish.
3. A boundary between staff's unfinished edits and what members see.

---

## 2. Minimal data model

Three tables and one nullable reference. No JSON blobs for the editable data:
a hold box must be validated, ordered, moved and queried individually.

### 2.1 `wall_holds` — a physical hold on a wall photograph

| Column                     | Type                                       | Notes                              |
| -------------------------- | ------------------------------------------ | ---------------------------------- |
| `id`                       | integer PK                                 |                                    |
| `wall_id`                  | FK `walls.id` `ON DELETE CASCADE`, indexed | The photographed wall              |
| `label`                    | `String(40)`, default `""`                 | Optional name, e.g. "the big jug"  |
| `x`, `y`                   | `Float`, not null                          | Normalised top-left corner, `0..1` |
| `width`, `height`          | `Float`, not null                          | Normalised size, `> 0`             |
| `created_by_id`            | FK `users.id` `ON DELETE SET NULL`         | Who drew it                        |
| `created_at`, `updated_at` | timestamps                                 | Existing `TimestampMixin`          |

The hold belongs to the **wall**, not to a route: one physical hold can be
used by several routes (a common gym occurrence, and one of the open questions
below). A hold is not duplicated per route.

Coordinates are relative to the photograph's own box, not to the screen:
`x = 0, y = 0` is the top-left of the image, `x = 1, y = 1` the bottom-right.
A box uses `x + width <= 1` and `y + height <= 1`. This keeps the overlay
aligned at every viewport size and needs no image dimensions.

**Why not percentages as strings or pixels:** pixels break on resize and on
retina/zoomed screens; strings cannot be validated or ordered by the database.
Floats are portable between SQLite and PostgreSQL and serialise as JSON
numbers.

### 2.2 `route_hold_sets` — a draft or published annotation of a route

| Column                     | Type                                              | Notes                                  |
| -------------------------- | ------------------------------------------------- | -------------------------------------- |
| `id`                       | integer PK                                        |                                        |
| `route_id`                 | FK `climb_routes.id` `ON DELETE CASCADE`, indexed |                                        |
| `status`                   | enum `draft` / `published` / `superseded`         |                                        |
| `wall_image_url`           | `String(400)`, nullable                           | The photograph the boxes were drawn on |
| `created_by_id`            | FK `users.id` `ON DELETE SET NULL`                |                                        |
| `published_at`             | timestamp, nullable                               | Set when published                     |
| `created_at`, `updated_at` | timestamps                                        |                                        |

One route has **at most one draft** and **at most one published** set (enforced
in the service and by a partial-unique-style check in tests; the MVP uses a
plain index and validates on write so the same SQL runs on SQLite and
PostgreSQL). Publishing a draft marks the previously published set
`superseded` and points the route at the new one.

`wall_image_url` is a snapshot of the photograph used when the boxes were
drawn. If the wall's photograph is later replaced, the editor can warn that
the stored annotation was made against an older image instead of silently
misaligning boxes.

### 2.3 `route_holds` — a hold in a set, with its order and role

| Column         | Type                                                 | Notes                          |
| -------------- | ---------------------------------------------------- | ------------------------------ |
| `id`           | integer PK                                           |                                |
| `set_id`       | FK `route_hold_sets.id` `ON DELETE CASCADE`, indexed |                                |
| `wall_hold_id` | FK `wall_holds.id` `ON DELETE CASCADE`, indexed      |                                |
| `position`     | integer, not null                                    | 1-based order within the route |
| `role`         | enum `start` / `middle` / `finish`                   |                                |

Constraints:

- `UNIQUE (set_id, position)` — one hold per step;
- `UNIQUE (set_id, wall_hold_id)` — the same hold cannot appear twice in a
  route;
- the API validates that the set's holds all belong to the **same wall as the
  route**.

### 2.4 The route's published pointer

Add one nullable column to `climb_routes`:

| Column                  | Type                                                   | Notes            |
| ----------------------- | ------------------------------------------------------ | ---------------- |
| `published_hold_set_id` | FK `route_hold_sets.id` `ON DELETE SET NULL`, nullable | What members see |

Members read holds **only** through this pointer and only when the route's
status is `active`. A staff member editing a draft writes `route_hold_sets` and
`route_holds`; the published pointer does not move until an admin publishes.
That is the whole publication boundary — no second copy of the route, no
mutation of live data.

```
walls 1─* wall_holds
climb_routes 1─* route_hold_sets 1─* route_holds *─1 wall_holds
climb_routes.published_hold_set_id ──0..1── route_hold_sets
```

### 2.5 What this deliberately does **not** add

- No `RouteVersion` table. A reset that changes the physical line is modelled
  as archive-old + create-new, which keeps `achievements.route_id` pointing at
  the line that was actually climbed. Adding real versioning would be justified
  only when ARCH wants one route id to span several physical versions.
- No image table or upload pipeline. `Wall.image_url` already holds a
  reference; uploading files is a separate, security-sensitive feature.
- No per-hold colour, grade, comment, or setter notes until someone asks.
- No SVG/JSON annotation blob: boxes stay rows.

---

## 3. Validation rules

Enforced in a Pydantic schema **and** repeated as `CheckConstraint`s where a
single row is enough, so a second client cannot store nonsense.

**Box**

- `0 <= x < 1`, `0 <= y < 1`;
- `width > 0`, `height > 0`;
- `x + width <= 1`, `y + height <= 1`;
- minimum `width`/`height` of `0.005` (rejects a zero-size click);
- values rounded to 5 decimal places on write.

**Route set**

- every hold belongs to the route's wall;
- positions are exactly `1..n`, with no gaps or duplicates;
- roles: exactly one `start`, exactly one `finish`, all others `middle`;
- the `start` hold is position 1 and the `finish` hold is position `n`
  (`n >= 2` to publish; a draft may be incomplete);
- maximum 100 holds per route (sanity bound).

**Wall photograph**

- publishing a set whose `wall_image_url` differs from the wall's current
  `image_url` is allowed but reported in the response, so staff know the
  overlay was drawn on an older photograph.

---

## 4. API

All staff endpoints require `require_staff`; publishing requires
`require_admin` (see the open question about who may publish). A customer token
is rejected with 403 by the dependency, before any body is read.

| Method   | Path                                            | Who    | Purpose                                                                   |
| -------- | ----------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| `GET`    | `/api/staff/walls/{wall_id}/holds`              | staff  | Holds drawn on that wall                                                  |
| `POST`   | `/api/staff/walls/{wall_id}/holds`              | staff  | Draw one hold                                                             |
| `PATCH`  | `/api/staff/holds/{hold_id}`                    | staff  | Move/resize/rename                                                        |
| `DELETE` | `/api/staff/holds/{hold_id}`                    | staff  | Delete (409 if it is in a published set)                                  |
| `GET`    | `/api/staff/routes/{route_id}/hold-set`         | staff  | The route's draft (creating an empty one if needed) and its published set |
| `PUT`    | `/api/staff/routes/{route_id}/hold-set`         | staff  | Replace the draft's ordered holds in one validated request                |
| `POST`   | `/api/staff/routes/{route_id}/hold-set/publish` | admin  | Make the draft the published set                                          |
| `GET`    | `/api/public/routes/{route_id}/holds`           | anyone | The published holds of an **active** route, otherwise an empty list       |

`PUT` takes the whole ordered list (`[{wall_hold_id, role}, …]`). Replacing the
draft in one request makes ordering atomic and avoids a half-saved sequence;
there is no need for per-hold reorder endpoints in the MVP.

The public response is `{route_id, image_url, holds: [{id, x, y, width, height,
position, role}]}`. It is a separate endpoint so the route list stays light and
the route page can show "route setting not published yet" without inventing
data. It never returns drafts, and it never returns holds for an archived
route.

### Reusing what exists

- `require_staff` / `require_admin` from `app/deps.py`;
- `Wall`, `ClimbRoute`, `RouteStatus` from `app.models`;
- `TimestampMixin`, `ORMModel` for schemas;
- the existing admin dashboard for discovery, with the editor as a new tab or
  a route-page action.

---

## 5. Editor workflow (what staff actually do)

1. Choose a **wall** from the staff wall list. Its `image_url` is shown; if it
   has none, the editor explains that a photograph is needed and offers no
   canvas (drawing boxes on nothing would be a lie).
2. The image is shown in a responsive canvas that keeps the photograph's aspect
   ratio. Every box is positioned in percentages, so resizing the window never
   moves a box relative to the hold.
3. **Click** on the image creates a default 4%-of-image box centred on the
   click. This is an annotation tool, not detection: a click cannot know where
   the hold really starts or ends.
4. **Click-and-drag** draws a custom box. A drag shorter than a few pixels is
   treated as a click.
5. Click a box to select it. The selected box can be **moved** (drag), resized
   (corner/edge handles), deleted (button or Delete key) or nudged with the
   arrow keys. Boxes are focusable and labelled "Hold 3 of 7".
6. Choose a **route** set on that wall (the existing route list, filtered by
   `wall_id`), or create one with the existing admin route form.
7. Click holds to **add them to the route in order**; the order is shown as
   numbered steps. Holds can be removed from the route or reordered (buttons
   and drag). The first hold is marked **start**, the last **finish**; the
   middle ones are steps.
8. **Save draft** sends the ordered list. Nothing visible to members changes.
9. Reloading the editor restores the draft and the published set exactly, from
   the backend.
10. **Publish** (admin) swaps the published pointer. The member route page then
    shows the overlay. Unpublished drafts remain invisible to members.

A staff-only "preview" in the editor shows the same overlay the member page
would render, so the publisher can check before publishing.

---

## 6. Member-facing integration

- `GET /api/public/routes/{id}/holds` is fetched with the route detail. When the
  route is active **and** a published set exists, the detail page renders the
  photograph with numbered, non-interactive boxes; start and finish are
  labelled. When nothing is published, the page says so quietly ("Route
  setting not published yet") rather than drawing an invented topo.
- The overlay is decorative for accessibility except for a text summary
  ("6 holds: start, 4 middle, finish"), so a member using a screen reader is
  not given a picture they cannot use.
- Archived routes never expose holds in the member view.
- No mocks: if the endpoint is unavailable, the overlay is omitted and the
  reason is available, rather than falling back to sample boxes.

---

## 7. Migration and PostgreSQL

One Alembic migration on top of `9d1c4f8ab207`:

1. create `wall_holds` (+ index on `wall_id`);
2. create `route_hold_sets` (+ index on `route_id`, status);
3. create `route_holds` (+ unique constraints, index on `set_id`);
4. add `climb_routes.published_hold_set_id` (nullable FK);
5. no backfill — existing routes simply have no published annotation, and the
   member page shows the honest empty state.

The downgrade drops the column first, then the tables in reverse dependency
order. Types used: `Integer`, `Float`, `String`, `DateTime`, `Enum` with
`native_enum=False` (matches the existing enums, portable) and plain
`CheckConstraint`s. No server-side functions, no partial indexes, no
`JSONB`-specific behaviour, so the same migration runs on SQLite (dev/tests)
and PostgreSQL.

**What is verified where**

- The ordinary suite still runs on isolated SQLite. That is _not_ proof of
  PostgreSQL compatibility.
- PostgreSQL 18.6 verification is complete for Task 3.1: the migrations were
  applied to empty disposable databases, `alembic check` was clean, a separate
  database passed `upgrade head` → `downgrade base` → `upgrade head`, seeding
  was repeatable, and the annotation/publishing endpoints were exercised by a
  live API smoke test and opt-in PostgreSQL tests. See
  [POSTGRESQL_COMPATIBILITY.md](POSTGRESQL_COMPATIBILITY.md).
- The existing dev database (`arch_dev.db`, SQLite) contains demo accounts and
  logged attempts; it was not reset to try the migration. The new migration is
  additive (`create table`, `add nullable column`), so running it in place is
  safe; the app also needs no downtime for the new tables.

---

## 8. Tests

Backend (pytest, isolated SQLite):

- **Coordinates** — a box at the edge is accepted; negative, zero-sized,
  out-of-bounds and `x + width > 1` boxes are rejected with 422.
- **CRUD** — create, move, resize, delete a wall hold; deleting a hold used by
  a published set is refused (409).
- **Ordering** — a set is saved with positions `1..n`; gaps, duplicates and a
  hold from another wall are rejected.
- **Start/finish** — a publish without exactly one start and one finish is
  refused; start must be first and finish last.
- **Permissions** — no token → 401; customer token → 403; staff can draft;
  customer cannot publish; admin can publish.
- **Publication boundary** — a saved draft is not returned by the public
  endpoint; publishing makes it visible; the previous published set becomes
  superseded; an archived route returns no holds publicly.
- **Persistence** — save, re-read through a fresh request, coordinates and
  order unchanged.
- **Migration** — `alembic upgrade head` and `downgrade -1` on a disposable
  database; `alembic check` reports no drift.

Frontend (Vitest):

- coordinate maths: pointer position → normalised box, clamping at edges;
- a click creates a default box, a drag creates a custom one, a tiny drag is a
  click;
- selection, move, resize, delete, arrow-key nudge;
- order add/remove/move and start/finish labelling;
- draft saved but not shown in the member preview until published;
- unavailable image state and unavailable API state.

Browser (Playwright, 1440×900 and 390×844):

- draw two boxes, resize one, move one, delete one; save; reload; boxes are in
  the same place relative to the image;
- resize the viewport and re-check a box centre against the same image pixel;
- member route page shows published boxes and not drafts;
- 0px horizontal overflow at phone width.

---

## 9. Security notes

- Every write goes through `require_staff` / `require_admin`; the frontend
  guard is convenience only.
- The API validates ownership of relationships (route's wall = hold's wall),
  not just "the ids exist".
- Coordinates are numbers inside `0..1`; a malicious payload cannot place a box
  outside the image or produce a negative size.
- Deleting a wall cascades its holds; deleting a hold that a **published** set
  uses is refused so a published overlay cannot break silently. Draft sets may
  drop it.
- The editor never accepts an image upload in this phase, so there is no new
  file-write surface.
- No secret or token is stored beyond the existing member token.

---

## 10. Open questions for ARCH

1. **Who may publish?** The design lets staff draft and admins publish, mirroring
   today's admin-only route CRUD. Should senior setters publish themselves?
2. **Resets.** When a line is reset, should the old route be archived and a new
   one created (recommended: attempts keep pointing at the line that was
   climbed), or should one route keep several published versions over time?
3. **Shared holds.** Can one physical hold belong to several routes? The model
   allows it; confirm that this matches how ARCH sets.
4. **Photograph replacement.** If a wall photo is replaced, should existing
   annotations block the replacement, be invalidated, or be kept with a warning?
5. **What counts as a hold?** Every hand and foot hold, or only the hand
   sequence a member needs? The MVP supports any number up to 100 per route.
6. **Labels.** Do routes need per-hold labels (colour, foot/hand) beyond start
   and finish?
7. **Multiple photographs per wall** (e.g. left and right sections) — out of
   scope now; would need a wall-image table later.
8. **Deleting a route with published annotations** — cascade with the route
   (current design), or keep the annotation history? Attempts already survive
   via `route_name`/`grade` snapshots.

---

## 11. Implementation slices

1. **Backend foundation** (schema + migration + staff CRUD + draft/publish API
   - tests). Independently verifiable with no frontend change.
2. **Public annotation endpoint** + route-page overlay (only after the
   publication boundary is tested).
3. **Editor UI** (wall picker, canvas, boxes, order, save/publish) in the admin
   area.
4. **Browser verification** at desktop and phone widths, plus the migration on
   a disposable PostgreSQL database (completed in Task 3.1).

Each slice is committed separately. If capacity runs out after slice 1, the
application remains buildable and the member pages are unchanged.
