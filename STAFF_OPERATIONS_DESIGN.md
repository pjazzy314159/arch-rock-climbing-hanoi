# Staff Operations — Audit and Design

Status: design accepted; Task 5.2 backend contract hardening and Task 5.3
administrator assignment/shift workspace implemented; Tasks 5.4–5.5 proposed
Date: 2026-10-23
Scope: staff tasks, checklists, shifts, event support and the staff workspace

This document audits what the repository already supports and proposes the
smallest useful Phase 5 workflow. It does not claim that a capability exists
unless the model, endpoint or component proves it. No duplicate task or event
table is proposed.

The audit was done directly against the repository at the Phase 4 head
(`f59a2a0`). Free-model subagent routing was unavailable, so the backend and
frontend audits were completed sequentially. Task 5.2 was implemented against
the same schema without a migration; section A.6 records the exact contracts
now in force.

## A. Current capabilities

### A.1 Schema and migrations

The original migration `backend/migrations/versions/c41ce9aba698_initial_arch_schema.py`
already creates the four relevant tables. No migration is required to begin
the MVP.

| Table | Model | Important fields and behaviour |
| --- | --- | --- |
| `staff_tasks` | `backend/app/models/staff.py` | `title`, `description`, `status` (`todo`, `in_progress`, `done`, `cancelled`), `priority` (`low`, `normal`, `high`), nullable `due_at`, nullable `completed_at`, nullable `assignee_id`, nullable `created_by_id`, nullable `event_id`, timestamps. Assignee and creator use `ON DELETE SET NULL`; event uses `ON DELETE SET NULL`. |
| `checklist_items` | `backend/app/models/staff.py` | Belongs to a task with `ON DELETE CASCADE`; ordered by `position`; stores `label`, `is_done`, `done_at` and `done_by_id`. No separate checklist/template table. |
| `staff_shifts` | `backend/app/models/staff.py` | Assigned `staff_id`, `starts_at`, `ends_at`, `role` text and `notes`. No event link, no availability, recurrence or swap fields. |
| `events` | `backend/app/models/content.py` | Title, description, start/end, location, capacity, public/private and creator. A task can point at an event through `staff_tasks.event_id`; a shift cannot. |

The task and shift tables are not duplicates of the event table. The event table
is the calendar record; tasks and shifts are work records. The only missing
relationship is an optional event-to-shift link, discussed in section C.

### A.2 API endpoints and authorization

All routes below enforce authentication and roles in the backend, not only in
the UI. `require_staff` allows staff and administrators; `require_admin` allows
administrators only. Staff ownership is additionally checked by
`_assert_can_access` in `backend/app/api/staff.py`: an administrator may touch
any task, while a non-administrator may only touch a task whose `assignee_id`
equals their own user ID. An unassigned task is therefore invisible to staff.

| Endpoint | Guard | Actual behaviour |
| --- | --- | --- |
| `GET /api/staff/tasks` | staff/admin | Returns the caller's own tasks by default. An administrator may request all tasks with `?all=true`; the flag does not widen a non-administrator's view. Supports a validated `status` filter. Ordered by nullable due date then ID. Eagerly loads assignee, creator, event and checklist. No pagination. |
| `POST /api/staff/tasks` | admin | Creates a task with title, description, optional assignee, priority, due date, optional event ID and optional initial checklist. The assignee must exist and be a staff or administrator account; a supplied event must exist (404). This is the only task-creation endpoint. |
| `PATCH /api/staff/tasks/{id}` | staff/admin | Administrators may change title, description, priority, due date, assignee, status and event. Non-administrators may change status only; explicitly supplying any administrator field, including a null value, returns 403. Omitted fields stay unchanged; explicit null clears `assignee_id`, `due_at` and `event_id`; required fields cannot be null. |
| `POST /api/staff/tasks/{id}/status` | staff/admin | Dedicated status update. It accepts any valid task status for an authorised task; there is still no transition check. Setting `done` sets `completed_at`; leaving `done` clears it. |
| `POST /api/staff/tasks/{id}/checklist` | staff/admin | Adds a checklist item to an authorised task. The label is trimmed. The server assigns the next position; a client-supplied `position` is accepted for compatibility but ignored. |
| `PATCH /api/staff/checklist/{item_id}` | staff/admin | Ticks or unticks an item, records `done_at`/`done_by_id`, and optionally edits its label/position. Permission is checked against the parent task. |
| `GET /api/staff/shifts` | staff/admin | Returns the caller's shifts; administrators see the whole team. Optional `start`/`end` filter on `starts_at`. Ordered by start time. No pagination. |
| `POST /api/staff/shifts` | admin | Creates a shift for a staff or administrator account. Rejects an end time that is not after the start time. No overlap, event, update or delete support. |
| `GET /api/admin/tasks` | admin | Returns every task ordered by ID with the same eager-loaded event, creator, assignee and checklist context. This is the administrator's activity view. No filters or pagination. |
| `GET /api/admin/assignees` | admin | New in Task 5.2. Returns `id`, `full_name`, `email` and `role` for every staff/administrator account, ordered by name then ID. No pagination; the team is small. No password, agreement or membership data. |
| `GET /api/admin/events`, `POST /api/admin/events` | admin | Lists every event and creates an event. No event update/delete endpoint. |

The admin summary counts tasks whose status is `todo` or `in_progress` as open,
and counts only users whose role is exactly `staff` as staff. Administrators can
therefore be assignees but are not included in that headline staff count.

### A.3 Current user interface and flow

- `/staff` renders `StaffTasksPage` in `src/components/arch/staff-pages.tsx`.
  It shows only the signed-in staff member's tasks. A task card displays title,
  description, priority, due date, status and checklist. The member can switch
  between `todo`, `in_progress` and `done`, add a checklist item and tick or
  untick items. The page has session loading, permission-denied, loading, error
  and empty states for tasks.
- The same `/staff` page shows an administrator-only "Assign yourself a task"
  form. It accepts only title and description. Despite the section wording, it
  does not offer an assignee selector, priority, due date, event link or initial
  checklist. It calls the task-creation endpoint and then invalidates the staff
  task query, not the administrator task query.
- `/admin` renders `AdminDashboardPage`, with Customers, Routes, Tasks, Events and
  Messages tabs. The Tasks tab is a read-only table showing task title,
  assignee, priority, status and due date. There is no create, assign, reassign,
  edit or cancel control there. The loading state exists; a failed task query
  falls through to an empty table rather than an error state, and there is no
  explicit empty notice.
- The Events tab lists events and creates a title/start/location event. The
  backend accepts end time, description, capacity and public/private, but the
  current form does not expose them. A task can carry an `event_id` in the API,
  yet neither the task creation form nor the task table shows the event.
- `src/services/api.ts` exposes `staffApi.shifts()` and `ApiShift`, but no
  component calls it. There is no shift view, shift creation form, shift tab or
  event-linked shift flow in the current UI.
- The workspace CSS stacks the sidebar and content below `1024px` and uses a
  two-column layout above it. The staff task card styles exist. The Phase 3
  regression sweep measured mobile overflow on member and route pages, but not
  specifically on the staff task workspace; mobile staff usability is not yet
  proven.

### A.4 Existing tests and database conventions

- `backend/tests/test_staff_admin_api.py` proves that customers are refused
  staff/admin reads (403), unauthenticated reads are refused (401), staff see
  only their own tasks, a staff member cannot change another person's task
  status, a staff member can change their own status, only administrators can
  create/assign tasks, customers cannot be assignees, a staff member can tick
  only their own checklist item, and staff see only their own shifts. It also
  covers invalid status enum values, event creation and customer refusal.
- `src/test/staff-api.test.ts` pins the request shapes for `myTasks()`,
  `myTasks(true)` and a 403 response. There is no frontend component test for
  the staff workspace or administrator task assignment.
- The ordinary backend suite runs against isolated SQLite in
  `backend/tests/conftest.py`. PostgreSQL integration tests are opt-in through
  `ARCH_TEST_POSTGRES_URL` and create temporary schemas in a database whose name
  contains `test` or `verify`.
- `backend/tests/test_postgresql_integration.py` verifies all migrations and the
  route/wall/hold model relationships on PostgreSQL. It does not currently
  create a staff task, checklist item, shift or event through the models. The
  browser regression does exercise staff tasks against PostgreSQL, but that is
  not a focused database integration test.

### A.5 Limitations and risks found in the audit

| Severity | Finding | Effect |
| --- | --- | --- |
| High | Task creation accepts `event_id` without checking that the event exists. | On PostgreSQL the foreign key will fail at commit, likely surfacing as a 500 instead of a validation error. On SQLite the orphan may be accepted depending on foreign-key enforcement. |
| High | Status transitions are not enforced. | A staff member can move a completed task back to `todo`, or mark a task `cancelled`, even if the gym's workflow does not allow it. `completed_at` follows the status but there is no transition policy. |
| Medium | The administrator assignment capability is not exposed in the administrator workspace. | The API and tests can assign a task to staff, but the only creation form is "Assign yourself" on `/staff` and sends no assignee. Day-to-day assignment is therefore API/seed-only. |
| Medium | The administrator Tasks tab is read-only. | An administrator cannot reassign, correct priority/due date, cancel, or inspect event context from the UI. |
| Medium | Checklist ordering is not reliable for items added through the UI. | The client sends only a label; the endpoint defaults every new item to position `0`. The relationship orders by position, so order can be ambiguous when positions tie. |
| Medium | PATCH cannot clear an assignee or due date. | `None` means "not supplied" for these fields in `TaskUpdateIn`, so an administrator cannot unassign a task or remove a due date through the current API. `event_id` is not editable at all. |
| Medium | Shift API is create/read-only. | An administrator cannot correct, cancel or reassign a shift. There is no overlap or availability check. |
| Medium | No event/shift context on tasks. | `TaskOut` exposes only `event_id`; the UI cannot show which event a task supports. Shifts have no event relationship. |
| Medium | No shift UI exists. | The endpoint and type exist, but staff and administrators cannot see or create shifts in the browser. |
| Medium | No audit history for task status/checklist changes. | Current rows carry timestamps, `created_by_id`, `done_by_id` and `done_at`, but overwritten status changes and checklist edits are not logged. |
| Low | Staff task list and admin all-task list are unbounded. | Acceptable for a small team, but the administrator activity view will not scale indefinitely without filters/pagination. |
| Low | Staff cannot see or claim unassigned tasks. | This is safe by default but may be operationally inconvenient. It needs an explicit policy decision. |
| Low | Checklist items cannot be deleted. | Mistakes or obsolete steps remain on the task. |
| Low | Completed tasks do not require all checklist items to be complete. | The API allows `done` with unchecked steps. This may be acceptable or unsafe depending on the task. |
| Low | Administrator task creation from `/staff` invalidates only `["staff", "tasks"]`. | The administrator Tasks tab can remain stale until its query is invalidated or the page reloads. |

### A.6 Task 5.2 implemented contracts and remaining policy

Task 5.2 changed backend behaviour only. The schema and migration history are
unchanged; the event relationship is an ORM relationship over the existing
`staff_tasks.event_id` foreign key. `alembic check` reports no new upgrade
operations.

**Event validation and context**

- `POST /api/staff/tasks` and `PATCH /api/staff/tasks/{id}` validate a supplied
  `event_id`. A missing event returns 404 with `Event not found`; no task is
  created or changed. Event cancellation/deletion policy is not implemented.
- `TaskOut` now exposes `created_by_name`, `event_title`, `event_starts_at` and
  `event_ends_at` in addition to the existing IDs and assignee name. These are
  populated from the ORM relationships.
- `GET /api/staff/tasks` and `GET /api/admin/tasks` use `joinedload` for the
  assignee, creator and event plus `selectinload` for the checklist. A focused
  query-count test confirms the listing does not grow per task.

**PATCH clear semantics**

- `PATCH /api/staff/tasks/{id}` uses Pydantic `model_fields_set`, so an omitted
  field stays unchanged and an explicit `null` is distinguishable.
- Administrators may clear `assignee_id`, `due_at` and `event_id` with an
  explicit `null`, and may replace any of them with a validated value. Missing
  assignees/events return 404; a customer assignee returns 400.
- `title`, `description`, `priority` and `status` are non-nullable columns. An
  explicit `null` for any of them returns 400 rather than silently doing
  nothing. `event_id` is now an administrator-editable field.
- Staff still may change only status on their own tasks. Supplying any
  administrator-only field, including a null value, returns 403. This does not
  broaden staff permissions.

**Checklist ordering**

- New tasks assign positions `0..n-1` in request order. New items appended to an
  existing task receive `max(position) + 1`. A client-supplied position is
  accepted for backward compatibility but ignored.
- `TaskOut` sorts checklist items by `(position, id)` so legacy duplicate
  positions still render deterministically. The database has no unique
  constraint on `(task_id, position)`, so two concurrent additions can still
  race on the same next value; the API does not claim a concurrency guarantee.
  Adding such a constraint would require a migration and an ARCH decision.

**Administrator assignee options**

- New `GET /api/admin/assignees` route, administrator-only. It returns only
  `id`, `full_name`, `email` and `role` for users whose role is `staff` or
  `admin`, ordered by full name then ID. It exposes no password, session,
  agreement or customer data and is not paginated because the team is expected
  to remain small.
- The route filters by role, matching the existing task-assignment rule. It does
  not filter inactive accounts; whether inactive staff/admin accounts should be
  assignable remains an ARCH decision. The same unresolved point applies to task
  create/update validation.

**Status transition policy**

- No restrictive transition graph was introduced in Task 5.2. The existing API
  continues to accept any valid `TaskStatus` value for an authorised task, and
  `completed_at` follows `done`. Unknown enum values still return 422.
- A focused test documents the current permissive behaviour so a future ARCH
  decision can change it deliberately. The 409 transition matrix proposed in
  section B is deferred, not implemented.

**Focused test evidence**

`backend/tests/test_staff_task_contracts.py` covers event create/update
validation and context, omitted versus explicit-null PATCH fields, valid and
invalid replacements, administrator-only field refusal, server-assigned
checklist positions and ordering, assignee-route authorization and minimal
fields, permissive status behaviour and N+1 prevention. The full backend suite
passes on isolated SQLite. The existing PostgreSQL integration suite also passed
against the designated test database, but it does not yet create staff
persistence records; that focused coverage remains Task 5.5.

### A.7 Task 5.3 implemented UI contracts and remaining gaps

Task 5.3 changed frontend code only. The schema and migration history are still
unchanged. The new UI uses the Task 5.2 contracts and does not add a new
business rule.

**Administrator task assignment**

- The administrator Tasks tab now has a creation form and an edit dialog. The
  form covers title, description, assignee, priority, due date/time, optional
  event and an optional initial checklist. The edit dialog covers the same task
  detail and assignment fields, but not checklist authoring or deletion.
- Assignee options come from `GET /api/admin/assignees`; event options come from
  the existing administrator event list. Each request has its own loading,
  empty and error state. A failed option request is shown in the form and
  disables submission until the option request is retried successfully.
- The task table displays the assignee, priority, status, due date, creator and
  event title/start. The all-task endpoint and its ordering are unchanged.
- Creating a task resets the form only after a successful save, refreshes the
  administrator task list and the administrator summary, and also refreshes the
  staff task query so the assignee sees the new work.
- Editing sends only fields the administrator changed. An omitted field stays
  unchanged; choosing "Unassigned", "No event" or clearing the due date sends an
  explicit null. A failed save keeps the edited values on screen and reports the
  error.
- Submission is guarded by a pending state. It does not add optimistic updates,
  bulk actions or a separate task-management page.
- The existing administrator-only "Assign yourself" shortcut on `/staff` remains
  as a quick create action and now invalidates both staff and administrator task
  queries. It is not a replacement for the full assignment form.

**Administrator and staff shift workspace**

- The administrator dashboard has a new Shifts tab. It lists shifts from the
  existing administrator view of `GET /api/staff/shifts` and creates shifts with
  `POST /api/staff/shifts` using staff, start, end, role and notes.
- The shift form handles staff-option loading, empty and error states. It blocks
  submission when the options are unavailable or when no staff member can be
  chosen. It validates a non-empty staff member and an end time after the start.
- The shift list puts upcoming shifts first and places earlier shifts behind an
  "Earlier shifts" disclosure so past work does not obscure the upcoming
  schedule. Loading, empty and error states are distinct.
- `/staff` now shows the signed-in member's own shifts using the same endpoint.
  The backend still returns only the caller's shifts to ordinary staff, so the
  UI does not expose another person's schedule. The shift section has its own
  loading, empty and error states.
- Staff task cards show event title and start time when the Task 5.2 response
  includes them. The task filters, status buttons and checklist controls remain
  as they were.
- No shift edit, reassignment, cancellation, recurrence, availability, swap or
  event-linked shift control was added. `staff_shifts.event_id` was not added.

**Permission and accessibility notes**

- Administrator-only controls remain inside the administrator page guard. The
  backend still enforces every action; hiding a control in the UI is not treated
  as authorization.
- The forms use native labelled controls. The edit experience uses the existing
  accessible dialog, with a title, description, close control and cancel action.
  Tables remain inside the existing horizontal scroll container at phone width.
- Date and time values use the existing event-form convention: the local
  `datetime-local` value is converted with `new Date(value).toISOString()`.
  There is still no confirmed gym time-zone policy.

**Focused frontend evidence**

- `src/test/staff-workspace.test.tsx` covers task creation payloads, assignee
  option failure and disabled submission, title validation, retained values
  after a failed save, edit-only changed fields with explicit nulls, shift list
  and creation, empty versus failed shift requests, and upcoming-before-earlier
  ordering.
- `src/test/staff-api.test.ts` covers the assignee route and the task/shift
  request shapes.
- TypeScript and ESLint pass for the changed files. The full frontend suite
  passes. The production build is checked separately in the Task 5.3 report.

**Still deferred**

- approved task status transitions and cancellation policy;
- a cancelled-task filter in the staff workspace;
- shift edit, reassignment or cancellation;
- event-linked shifts or task/shift cancellation when an event changes;
- shift overlap, availability and time-zone policy;
- task/shift pagination;
- filtering inactive assignees;
- audit history for status, assignee and shift changes;
- PostgreSQL staff persistence and page-level permission/regression coverage in
  Task 5.5.

## B. Proposed MVP

The MVP should make the existing task and shift data usable in the existing
workspace. It should not add task/event duplicate tables and should not invent
scheduling policy. No database migration is required for the core MVP.

### B.1 Staff workspace (`/staff`)

Task 5.3 implemented event context on task cards and a basic own-shift section.
The approved-transition controls, cancelled filter and mobile review remain
Task 5.4.

- Keep the current task cards and checklist behaviour. Add explicit event
  context to cards when `event_id` is present: event title and start time. If the
  event cannot be resolved, show "Event unavailable" rather than inventing a
  title.
- Add an "Upcoming shifts" section on the same page, using the existing
  `GET /api/staff/shifts` endpoint with a bounded upcoming range. Show start/end,
  role and notes. Staff see only their own shifts.
- Keep the current filters (all/todo/in_progress/done), and include `cancelled`
  in the filter and status display so cancelled work is not silently hidden.
- Replace the free-form three-button status control with controls for the
  approved transitions only. Show a short reason when a transition is refused.
- Add separate loading, empty and error states for tasks and shifts. A failed
  shift query must not make the task list look empty. Provide retry where the
  current data-state pattern supports it.
- Preserve the existing permission-denied state for customers and signed-out
  visitors. The backend remains the authority.
- Ensure the task cards, status controls and checklist controls are usable at
  phone width, with no horizontal page overflow.

### B.2 Administrator task creation and assignment

Task 5.3 implemented the creation form, edit/reassign dialog and basic shift tab.
The remaining policy questions below stay open; the UI does not invent an
answer.

- Add a real creation/assignment form to the administrator Tasks tab. It should
  accept title, description, assignee, priority, due date, optional event and an
  optional initial checklist. The existing backend already accepts these fields,
  except that the client type needs to expose them.
- Add an assignee selector populated from active staff and administrator
  accounts. The selector needs only ID, display name and role. A dedicated
  administrator-only "assignable staff" option endpoint is smaller and safer
  than overloading the customer directory response.
- Allow administrators to reassign an existing task and change its priority or
  due date from the administrator workspace. This uses the existing PATCH
  endpoint after its clear-value semantics are fixed.
- Keep task creation and assignment administrator-only. Do not add a staff
  "create task" control.
- Display event context and creator in the administrator task table so an
  administrator can see what the task supports and who created it.
- Add explicit loading, empty, error and permission states to the administrator
  Tasks tab. An administrator who loses the role mid-session must see the
  permission state, not a blank table.

### B.3 Backend contract changes (no new tables)

Task 5.2 implemented the following against the existing schema:

1. Validate `event_id` on task creation and update and return 404 when the event
   does not exist. Expose event title/start/end in the task read model through
   the ORM relationship. Done.
2. Distinguish "field omitted" from "field explicitly null" in PATCH for
   `assignee_id`, `due_at` and `event_id`, so an administrator can unassign or
   clear a due date or event. Done. Required fields cannot be explicitly null.
3. Assign the next checklist position on the server. Done. Client-supplied
   positions are ignored for new items; ordering is deterministic. Concurrent
   additions are not guaranteed collision-free without a future constraint.
4. Return the creator display name and event context in task responses without
   exposing password or token data. Done. Checklist-completer names remain a
   future UI/accountability decision.
5. Add a minimal administrator-only assignee option endpoint. Done at
   `GET /api/admin/assignees`.
6. Keep the existing admin-only all-task endpoint. No second task list endpoint
   was added. Simple server-side filters remain deferred until volume requires
   them.
7. Enforce a status transition matrix in one place. Deferred: no ARCH decision
   confirms the allowed transitions, so Task 5.2 kept the existing permissive
   contract and documented it. Unknown enum values still return 422; a future
   matrix should return 409 for a disallowed transition.

### B.4 Explicit non-goals for the MVP

- No new task, checklist, shift or event table.
- No staff self-scheduling, availability collection, shift swaps or recurrence.
- No automatic shift-to-task assignment or time-clock behaviour.
- No notifications, reminders or push/e-mail integration.
- No customer access to staff tasks, shifts or activity.
- No supervisor/team-lead role until ARCH confirms one.
- No invented task priority meanings or due-date policy.
- No destructive task/shift/event controls beyond what ARCH confirms.

### B.5 Proposed implementation sequence

1. **Task 5.2 — Backend contract hardening.** Implemented: event validation and
   context, PATCH clear semantics, server-assigned checklist position,
   administrator assignee-option endpoint and focused tests. Status transitions
   remain permissive pending the ARCH decision. No migration was required.
2. **Task 5.3 — Administrator assignment and shift workspace.** Implemented:
   administrator task creation/assignment/reassignment UI, event/creator
   context, a basic administrator shift list/create tab and a read-only staff
   shift section. No shift edit, cancellation or event link was added.
3. **Task 5.4 — Staff dashboard context and mobile states.** Event-linked task
   context, upcoming shifts, filters, error/empty states and mobile review.
4. **Task 5.5 — PostgreSQL integration and regression.** Focused staff
   persistence tests on PostgreSQL plus the existing browser/frontend checks.
5. Any event-linked shift column or richer scheduling model waits for the
   ARCH decisions in section F.

## C. Shifts and events

### C.1 What the existing schema already supports

- **Basic shift assignment:** `staff_shifts` stores a staff member, a start, an
  end, a role label and notes. An administrator can create a shift; staff and
  administrators can read them. This is a simple assignment model, not full
  rostering.
- **Event support as tasks:** `staff_tasks.event_id` already links a task to an
  event. A task such as "Set up the competition wall" can therefore be assigned
  to a staff member and shown with its event. No new table is needed for this
  interpretation.
- **Event calendar:** `events` stores the event time, place and capacity. It has
  no staff-assignment collection and no update/delete endpoint.

### C.2 What the existing schema cannot support

The current schema cannot express:

- a shift that belongs to a specific event (`staff_shifts` has no `event_id`);
- event staffing separate from task assignment;
- staff availability, shift swaps, recurring shifts, breaks or overtime;
- a link between a task and a particular shift (a task has `event_id`, not
  `shift_id`);
- automatic cancellation or reassignment when an event changes.

The current schema **can** support event support as tasks linked to events. It
cannot support event support as event-specific shifts without an extension.

### C.3 Smallest safe extension if ARCH confirms event-linked shifts

If ARCH confirms that a shift must be tied to an event, extend the existing
`staff_shifts` table with one nullable column rather than creating another
scheduling table:

- `event_id` → FK to `events.id`, nullable, `ON DELETE SET NULL`, indexed.

This preserves existing shifts that are not event-specific. Do not add shift
templates, availability tables or recurrence fields until the business rules
are confirmed. If event support is modelled as tasks only, no schema change is
needed at all.

### C.4 Business questions before any shift/event extension

1. Are staff assigned to events through tasks, through shifts, or both?
2. Does one shift belong to at most one event, or can a shift cover several
   events?
3. What happens to a shift or task when an event is cancelled, moved or deleted?
4. Are overlapping shifts allowed for one person? Are breaks or maximum hours
   required?
5. Is scheduling a simple assignment list or full rostering with availability,
   swaps and approvals?
6. Who may create, edit, reassign or cancel a shift: administrators only, or
   also team leads/staff?
7. What time zone and display format should shift times use for staff and
   administrators?

## D. Permissions and auditability

### D.1 Proposed permission matrix

| Action | Customer | Staff | Administrator |
| --- | --- | --- | --- |
| View own assigned tasks | No | Yes | Yes |
| View all tasks / all staff activity | No | No | Yes |
| View own shifts | No | Yes | Yes |
| View all shifts | No | No | Yes |
| Create a task | No | No | Yes |
| Assign or reassign a task | No | No | Yes |
| Change task title/description/priority/due/event | No | No | Yes |
| Clear assignee/due/event with an explicit null | No | No | Yes |
| List assignee options | No | No | Yes |
| Update status on an assigned task | No | Yes, own tasks; any valid status until ARCH approves a transition graph | Yes, any task |
| Add a checklist item | No | Yes, own tasks (current behaviour; see F.4) | Yes |
| Tick/untick a checklist item | No | Yes, own tasks | Yes |
| Delete a task or checklist item | No | No | Not in the MVP; decide with ARCH |
| Create a shift | No | No | Yes |
| Edit/delete/reassign a shift | No | No | Not in the MVP; decide with ARCH |
| Create/update/delete an event | No | No | Create/list only today; update/delete not implemented |
| Link a task to an event | No | No | Yes |
| Link a shift to an event | No | No | Not supported until section C is confirmed |

"Explicitly authorised" means the administrator role in the current model.
There is no supervisor or team-lead role. If ARCH needs one, it must be a
deliberate role/permission design, not an implicit widening of the staff role.

### D.2 Backend enforcement requirements

- Keep `require_staff` on every task/checklist/shift read and update.
- Keep `require_admin` on task creation/assignment and shift creation.
- Apply `_assert_can_access` to every task and checklist mutation. A staff member
  must not reach another person's task by guessing its ID.
- Reject a non-administrator who tries to change title, description, priority,
  due date, assignee or event through PATCH, including when the value is null.
- Reject a task assigned to a customer at creation or reassignment.
- Reject a shift assigned to a customer.
- Validate event and assignee references before insert/update. Implemented in
  Task 5.2 for task create/update.
- Return 403 for a role refusal and 404 for a missing record; do not reveal
  whether another person's task exists to an unauthorised staff member.
- Do not rely on the UI to hide controls. The same checks must work through the
  API.

### D.3 Auditability

What exists today:

- task and checklist `created_at`/`updated_at`;
- task `created_by_id`, `completed_at`, assignee and event;
- task responses expose `created_by_name`, event title/start/end and assignee
  name from the existing relationships;
- checklist `done_by_id` and `done_at` (the response exposes the ID, not a
  completer display name);
- shift creator is not stored (there is no `created_by_id` on `staff_shifts`);
- no history of previous statuses, assignees or checklist edits.

What the MVP should expose to administrators:

- who created a task and when;
- current assignee, priority, due date and event;
- who completed each checklist item and when;
- current task status and completion time.

What remains unresolved:

- whether an append-only activity log is required for status changes,
  reassignment and shift edits. If it is, design a small append-only table; do
  not reuse the task row as a false history.
- whether shift creation needs a creator/audit field.
- retention rules for completed tasks and shift records.

The administrator all-task and all-shift views are the "view all staff
activity" capability. Staff do not receive a team-wide activity feed.

## E. Acceptance criteria and tests

### E.1 Backend acceptance criteria

1. A customer receives 403 and an anonymous caller 401 on all staff task,
   checklist, shift and administrator task endpoints.
2. A staff member can read only their own tasks and shifts. `?all=true` does not
   widen a staff member's task view.
3. A staff member cannot change status, add a checklist item or tick an item on a
   task assigned to another person. An administrator can.
4. Only an administrator can create or assign a task. Assigning to a customer is
   rejected with 400; a missing assignee is 404.
5. An administrator can create a task with assignee, priority, due date, event and
   initial checklist. The response includes the event context and checklist.
6. An administrator can reassign a task and clear an assignee or due date where
   the approved PATCH contract allows it.
7. Status transitions remain backward-compatible until ARCH approves a
   transition graph. Any valid status value is accepted for an authorised task;
   unknown values return 422 and `completed_at` follows `done`. A future matrix
   should return 409 for a disallowed transition.
8. Checklist state survives a new GET request. A tick records `done_by_id` and
   `done_at`; an untick clears them. New items receive a stable server-assigned
   order.
9. A task cannot reference a nonexistent event. An event-linked task returns the
   event title/start/end in the read model. Event deletion keeps the existing
   foreign-key behaviour; no cancellation policy is invented.
10. Shifts cannot end before they start or be assigned to a customer. Staff see
    only their own shifts; administrators see all.
11. Missing task, checklist item or shift records return 404 without leaking
    another user's data.
12. The admin summary remains consistent after task creation, completion and
    cancellation.
13. An administrator-only assignee option endpoint returns only staff/admin ID,
    display name, email and role. Customers and staff receive 403; anonymous
    callers receive 401.
14. PATCH preserves omitted nullable fields and can clear assignee, due date and
    event explicitly. Required fields cannot be set to null.

### E.2 Frontend acceptance criteria

1. `/staff` shows the signed-in member's tasks and upcoming shifts separately.
2. Task cards show title, description, status, priority, due date, checklist and
   event context when present. Cancelled tasks are visible when filtered.
3. Loading, empty, error and permission-denied states are explicit for tasks and
   shifts. A failed shift request does not masquerade as an empty shift list.
4. Status controls only offer approved transitions and report a refusal without
   losing the task card.
5. Checklist tick/untick persists across a reload and reports errors in place.
6. The administrator Tasks tab can create and assign a task, shows empty/error/
   loading states and displays event/creator context.
7. The administrator can reassign an existing task and clear optional fields
   supported by the backend.
8. The administrator has a basic shift list/create view; staff have a read-only
   shift view. No customer sees either.
9. At `390x844`, the staff workspace, task cards, status controls, checklist and
   administrator task form fit without horizontal page overflow.
10. No password hash, token or unrelated customer data appears in any staff or
    administrator task response.

### E.3 Test plan

**Task 5.2 implemented backend coverage:** `backend/tests/test_staff_task_contracts.py`
contains 14 focused tests for event validation/context, omitted versus
explicit-null PATCH fields, valid and invalid replacements, administrator-only
field refusal, server-assigned checklist positions and ordering, assignee-route
authorization and minimal fields, permissive status behaviour and N+1 prevention.
The full isolated-SQLite suite passes (238 passed, 2 skipped).

The remaining plan below covers Tasks 5.3–5.5 and broader edge cases.

**Backend (ordinary SQLite suite):**

- Extend `backend/tests/test_staff_admin_api.py` with write-endpoint denials for
  customers and anonymous callers, not only the current GET checks.
- Add cross-staff denial tests for PATCH, status, checklist add and checklist
  toggle. Keep the existing admin-allowed cases.
- Add task creation tests for assignee validation, customer rejection, event
  validation, initial checklist, priority/due date and event context.
- Add PATCH tests for clear assignee/due date, admin-only detail changes and
  event-ID updates if approved.
- Add status transition tests: valid path, invalid regression from `done`,
  cancellation/reopening policy, invalid enum and `completed_at` consistency.
- Add checklist persistence and ordering tests, including multiple UI-added items
  with omitted positions and cross-task denial.
- Add shift tests: create, invalid time range, customer assignee, own-vs-all
  visibility. Add update/delete only if approved.
- Add admin summary consistency tests after create/complete/cancel.

**PostgreSQL integration (opt-in):**

- Extend `backend/tests/test_postgresql_integration.py` to create an event, a
  staff task with checklist, and a shift through the SQLAlchemy models against a
  temporary PostgreSQL schema. Read them back and verify timezone-aware times,
  enum values and relationships.
- Verify `ON DELETE SET NULL` for task assignee/event and `ON DELETE CASCADE` for
  checklist items where the database supports the check. Do not replace the
  SQLite suite; this is additional evidence for PostgreSQL.
- Keep the existing migration apply/rollback test as the schema gate. No new
  migration is expected for the core MVP.

**Frontend:**

- Add component tests for the staff task list states (loading, empty, error,
  permission denied), event context, approved status controls and checklist
  persistence/error handling.
- Add administrator task creation/assignment tests: assignee options, validation,
  empty/error states, reassign and clear optional fields.
- Add shift view/create tests and denial states.
- Extend `src/test/staff-api.test.ts` for the new query parameters and payload
  fields, including event/checklist and assignee options.
- Add or extend a browser check for the staff and administrator workspaces at
  desktop and `390x844`, measuring horizontal overflow and exercising task
  assignment, status, checklist and shift visibility. Keep the existing customer
  refusal checks.

### E.4 Test conventions and boundaries

- Ordinary backend tests stay on isolated SQLite. Do not describe them as proof
  of PostgreSQL compatibility.
- PostgreSQL tests remain opt-in through `ARCH_TEST_POSTGRES_URL` and use a
  disposable database/schema.
- Backend permission tests must call the API, not only inspect UI conditions.
- Browser checks must not mutate the development database; use the disposable
  test database as the Phase 3 regression did.
- Do not add product code only to satisfy this document; implementation belongs
  to Tasks 5.2–5.5.

## F. Open questions for ARCH

1. **Shift model:** Is a simple assignment (`staff_shifts` as it exists) enough,
   or does ARCH need availability, recurring shifts, swaps, approvals, breaks or
   maximum hours? The current table cannot express those rules.
2. **Event staffing:** Are event support assignments tasks linked to events,
   shifts linked to events, or both? If shifts must be event-specific, the
   smallest extension is a nullable `staff_shifts.event_id`.
3. **Assignment authority:** Should only administrators create/assign tasks and
   shifts, or should team leads/supervisors have limited authority? If yes, a
   deliberate role or permission model is required; do not widen `staff`
   implicitly.
4. **Status policy:** Confirm the proposed staff transition matrix. Should staff
   cancel their own tasks? Should completed or cancelled tasks be reopened, and
   by whom? The current API allows any valid status change.
5. **Checklist authoring:** Should staff be able to add checklist items to their
   own tasks (current behaviour), or should only administrators author the
   checklist? Should items be deletable? Must all items be complete before a task
   can be marked done?
6. **Audit history:** Are the current timestamps/creator/completer fields enough,
   or does ARCH require an append-only history of status, assignee and shift
   changes? If so, define retention and who may read it.
7. **Unassigned work:** Should staff see and claim unassigned tasks, or remain
   limited to tasks explicitly assigned to them? The current backend denies
   unassigned tasks to staff.
8. **Event changes:** When an event is cancelled, moved or deleted, should linked
   tasks/shifts be cancelled, reassigned or left unchanged? The current FK would
   set a deleted event reference to null.
9. **Priority and due-date meaning:** What do `low`, `normal` and `high` mean
   operationally, and are due dates calendar dates or exact times in the gym's
   time zone? No reminder system exists.
10. **Administrator as assignee:** Administrators are currently assignable to
    tasks and shifts, while the summary's staff count excludes them. Confirm
    whether administrators should be treated as staff for workload and
    scheduling.
11. **Shift editing and cancellation:** The current API is create/read-only.
    Confirm whether administrators need edit, reassign and cancel operations and
    what audit/confirmation they require.
12. **Completion and evidence:** Do any tasks require evidence (photo, note,
    signature) or checklist gating before completion? The current schema stores
    only task/checklist text and status.
13. **Inactive assignees:** Should inactive staff or administrator accounts be
    excluded from `GET /api/admin/assignees` and from task assignment? Task 5.2
    filters by role only to match the existing assignment rule; changing this
    needs an explicit policy.
14. **Checklist concurrency:** The server assigns positions but the database has
    no unique constraint on `(task_id, position)`. Two concurrent additions can
    still share a position. Confirm whether a future migration should add the
    constraint and how a collision should be retried.
