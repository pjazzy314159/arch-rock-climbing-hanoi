# Member experience review

What the signed-in member gets today, what is missing, and what Phase 1
changes. Written against the implementation at commit `d54528e`.

> **On the dashboard sketch.** No sketch file is present in the repository, so
> this review works from the functional requirements as stated: active route
> count, outcome distribution (send / flash / projecting), a filterable route
> directory (grade, wall, wall type, status), statistics by grade, a ranking
> with a stated rule, recent attempts and sends, and a clear entry point to
> log an attempt. If a sketch is supplied later, the layout can be adjusted
> without changing the data behind it.

---

## 1. What works today

| Screen          | Route              | State                                                                                                                                    |
| --------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Member overview | `/member`          | Real data from `/api/me/dashboard`: total sends, sessions, best grade, active projects. Safety agreement panel. Two route cards.         |
| Logbook         | `/member/logbook`  | Real data from `/api/me/logbook`. Filter by all / sent / project. A "log a climb" form that posts to the backend and survives a refresh. |
| Profile         | `/member/profile`  | Real data. Edit name, optional phone, climbing level. Change password.                                                                   |
| Progress        | `/member/progress` | Sends by grade, computed in the browser from the member's own logbook.                                                                   |
| Route directory | `/routes`          | Real data from `/api/public/routes`. Filter by grade, wall, free text, and "new sets only".                                              |
| Route detail    | `/routes/:id`      | Real data. Official grade beside the community's perceived grade, the vote distribution, and the voting control.                         |
| Leaderboard     | `/leaderboard`     | Real data. Rank, name, sends, best grade, score.                                                                                         |
| Beta            | `/member/beta`     | The route list with illustrative beta text.                                                                                              |

The backend behind all of this is sound: every number on these screens comes
from the database, ownership is checked on the server, and the rules for
voting and ranking are unit-tested.

---

## 2. What the member dashboard does not have

### 2.1 The dashboard is four numbers, not a picture of the member's climbing

`/member` shows four metric tiles and stops. The requirements call for a
dashboard that answers, at a glance: how many routes are on the wall, what the
member's outcomes look like, how they compare with other climbers, and what
they should do next. None of that is present.

**Fix.** Replace the four tiles with a dashboard composed of:

- a headline row (active routes on the wall, sends, flashes, projects, best
  grade, sessions);
- an outcome distribution (send / flash / projecting);
- statistics grouped by grade;
- the member's ranking, with the rule stated on the page;
- recent attempts and sends;
- a "log an attempt" entry point and a link into the route directory.

### 2.2 There is no flash

The data model records `sent` and `project`. A **flash** — a send on the first
attempt — is a different achievement and the requirements ask for it to be
distinguished.

The existing model already holds the information: a flash is a send with
`attempts == 1`. No schema change is needed, and no new value has to be
invented.

**Fix.** Derive the flash count from the existing rows and expose it in the
dashboard statistics.

### 2.3 Routes have no wall type, so the wall-type filter cannot exist

`climb_routes` has `zone` (a free-text wall name such as "The Slab") but no
type. The requirements ask the directory to filter by **grade, wall, wall type
and route status**. Three of the four are possible today; wall type is not.

There is also no `walls` table, so there is no place to hold a wall's
photograph — which the route-setting tool in Phase 2 needs.

**Fix.** Add a `walls` table (name, type, photograph, description) and give
routes a `wall_id` plus their own `wall_type`. A route's type is a property of
the problem, not of the surface, which is how setters think about it. The
existing `zone` stays as the display name so nothing breaks.

### 2.4 The member has no ranking on their own dashboard

The leaderboard is a separate public page. A member cannot see where they
stand, or how far ahead of the field they are, without leaving the member
area — and the rules behind the ranking are not stated anywhere on the site.

**Fix.** Return the member's own rank, the number of ranked climbers and a
clearly defined percentile from the backend, and state the scoring rule on
the page.

### 2.5 There is no "recent attempts and sends" list

The logbook is a table on its own page. The dashboard has no recency.

**Fix.** Add the member's most recent attempts to the dashboard response and
render them.

### 2.6 Unavailable data and a genuine zero look the same

The dashboard renders `0` for a member with no records, and for a member whose
data could not be loaded the error path replaces the whole panel. A new
member with no climbs should see an encouraging empty state, not zeros that
look like a record of failure — and "the service is down" should never look
like "you have climbed nothing".

**Fix.** Distinguish the three cases: data loaded and empty, data loaded with
values, and data unavailable.

### 2.7 The route detail page is thinner than the directory needs

It shows the grade, the perceived grade and the votes, but not the wall, the
wall type or the route's status. A member looking at a route cannot tell
whether it is on the wall or archived.

**Fix.** Show wall, wall type and status on the route page, and on the card.

### 2.8 The route directory cannot filter by status

Only active routes are returned by the public endpoint, so the status filter
has nothing to select. Archived routes exist in the database and staff can
see them, but a member cannot.

**Fix.** Add a status filter to the directory, and make clear when a route is
archived rather than pretending it never existed.

---

## 3. Visual and interaction quality

| Problem                                                                                                                     | Where         | Fix                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The route card shows the grade twice: as an art graphic and in the metadata line, and the wall is only in the small top row | route cards   | Give the card a clearer hierarchy: wall and status in the top row, the grade as the dominant element, style as secondary text. |
| The card's vote count is buried at the end of the metadata line                                                             | route cards   | Move the community feedback into its own labelled row.                                                                         |
| The dashboard is four equal tiles with no visual anchor                                                                     | `/member`     | A headline row with a dominant figure, then grouped panels.                                                                    |
| The "log a climb" action lives only on the logbook page                                                                     | `/member`     | A clear entry point on the dashboard, and on the route page itself.                                                            |
| Long member names and route names are not given room                                                                        | cards, tables | Allow wrapping and keep the important figure on one line.                                                                      |
| The nav carries ten items and is tight on a laptop screen                                                                   | header        | Verified at 1440 px it fits; the mobile menu works. Tighten the gap slightly and keep the labels on one line.                  |
| No way to tell a placeholder photograph from a real one                                                                     | images        | Label sample assets as placeholders until ARCH supplies the real ones.                                                         |

---

## 4. What is deliberately not changing

- The public website keeps its design and its routes.
- The sample-data fallback stays, and keeps labelling itself.
- The voting and ranking **rules** do not change. They are documented in
  `backend/app/services/climbing.py` and agreed nowhere; Phase 1 only makes
  the member's own numbers agree with them.
- Height and weight are still not collected.
- The backend's permission model does not change. The member's own records
  stay private to them, and staff still cannot edit a member's logbook
  without an explicit administrative workflow.

---

## 5. Plan for Phase 1

| #   | Change                                                                                                                     | Where                   |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | `walls` table; `wall_type` on routes; route status published with the route                                                | backend, migration      |
| 2   | Dashboard response: outcome distribution, statistics by grade, ranking and percentile, recent attempts, active route count | backend                 |
| 3   | Wall type and status filters on the route directory                                                                        | backend, frontend       |
| 4   | New member dashboard built from the real data, with the three empty/loaded/unavailable states                              | frontend                |
| 5   | Wall, wall type and status on the route card and the route page                                                            | frontend                |
| 6   | "Log an attempt" from the dashboard and from a route                                                                       | frontend                |
| 7   | The scoring rule stated on the leaderboard and on the dashboard                                                            | frontend, documentation |
| 8   | Tests for every new response, filter and rule                                                                              | backend, frontend       |

Acceptance criteria are recorded in `PLAN.md`.
