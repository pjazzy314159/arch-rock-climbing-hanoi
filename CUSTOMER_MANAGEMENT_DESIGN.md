# Customer Management — Audit and Design

Status: design accepted for implementation in Tasks 4.2–4.4
Date: 2026-10-23

## 1. Existing customer data

The platform already stores customer information; no new customer table is
needed.

| Data | Where it lives | Notes |
| --- | --- | --- |
| Account | `users` | Email, full name, role, active flag, phone, membership tier/status, joined date, climbing level, created/updated timestamps. The password hash is stored but must never be returned to the browser. |
| Safety agreement | `safety_agreements` | One or more records per user; latest record is the current status. Stores version, status, method, signed timestamp/name, document URL and staff notes. The signing workflow is still provisional (MVP review D4). |
| Climbing activity | `achievements` | One row per logged climb: route reference/name snapshot, grade, sent/project, attempts, climbed date and optional notes. This is the logbook and the source of send/flash/project statistics. |
| Route votes | `route_votes` | One replaceable vote per user and route, with level snapshot and optional comment. Not required for the first customer views. |
| Contact messages | `contact_messages` | Name, email, subject, message, handled flag and timestamp. There is **no user foreign key**, so a message cannot be treated as belonging to an account. |
| Staff tasks | `staff_tasks` | Operational tasks assigned to staff, not customer records. They may be linked to an event. |
| Membership/contract data | Not stored | No contract, subscription, payment or membership-history model exists. The tier/status fields are optional descriptive fields, not billing records. |

## 2. What an administrator may see

The admin role already has access to the whole operations workspace and the
contact inbox. A customer-management view may safely show:

- account name, email, role and active/inactive status;
- optional phone, membership description, joined date and account creation date;
- the latest safety-agreement status, version, confirmation method, signing
  timestamp/name and staff notes;
- aggregate climbing activity: sends, flashes (a subset of sends), projects,
  attempts and last-climb date;
- recent logged climbs, with route name/grade/result/date/attempts;
- contact messages matching the account's email, clearly labelled as **not
  linked** to the account, limited to a small number and without full message
  bodies.

Not shown in list or detail responses:

- password hashes, access tokens, internal authentication fields;
- arbitrary internal database identifiers as the primary displayed identifier
  (the API still needs an opaque route parameter for links; the UI displays
  name/email);
- other customers' records through a guessed ID without the admin guard;
- full agreement documents or legal notes outside the existing admin agreement
  workflow unless a separate requirement confirms the need;
- invented contract, subscription or membership rules.

## 3. Existing operations

Already supported by the backend:

- `GET /api/admin/members` — a limited, searchable list (legacy response, no
  pagination metadata, per-row agreement/send queries);
- `GET /api/admin/summary` — headline counts;
- `GET /api/admin/agreements` and `PATCH /api/admin/agreements/{id}` — record
  an agreement decision;
- `GET /api/admin/contact` and `PATCH /api/admin/contact/{id}` — read and mark
  contact messages handled;
- route, wall, task and event administration.

Missing capabilities:

- a paginated customer directory with total count and safe fields;
- server-side search across name/email/phone and optional role/status filters;
- a dedicated admin customer detail endpoint with agreement and activity
  summaries;
- a customer detail page and navigation from the directory;
- loading, empty, error and permission-denied states for those screens.

## 4. API design

No schema change or migration is required for the first customer views. The
existing tables are sufficient.

### `GET /api/admin/customers`

Query parameters:

- `search` (optional): case-insensitive name, email or phone substring;
- `role` (optional): `customer`, `staff` or `admin`;
- `status` (optional): `active` or `inactive`;
- `limit`: 1–100, default 25;
- `offset`: 0 or greater, default 0.

Response:

```json
{
  "items": [
    {
      "id": 12,
      "email": "climber@example.com",
      "full_name": "Alex Nguyen",
      "role": "customer",
      "is_active": true,
      "membership_tier": null,
      "membership_status": null,
      "joined_on": null,
      "created_at": "2026-10-23T09:00:00Z",
      "agreement_status": "signed",
      "total_sends": 8,
      "last_climb_on": "2026-10-20"
    }
  ],
  "total": 1,
  "limit": 25,
  "offset": 0
}
```

The list is computed in one SQL statement using correlated aggregate
subqueries, so it does not issue one agreement/send query per row. Ordering is
stable by full name and user ID.

### `GET /api/admin/customers/{user_id}`

Returns the list fields plus phone, climbing level, the latest agreement, an
activity summary, the ten most recent climbs and up to five messages whose
email exactly matches the account email. A missing account returns 404. A
non-admin receives 403 before any customer data is read.

Both endpoints use `require_admin`; hiding the UI is not access control.

## 5. UI design

- Keep the existing `/admin` operations workspace and its visual system.
- Replace the browser-only “Members” tab with a server-backed **Customers**
  tab, using the existing search field, table, badges, loading and feedback
  styles.
- The table displays name/email (link to detail), role, account status,
  membership description, agreement status, sends and last climb. It does not
  display the database ID as a label.
- Seeded `@example.com` accounts are marked **Demo** rather than being presented
  as real customers.
- Pagination uses Previous/Next with the total count; no unbounded browser
  filtering.
- Loading, empty, error, retry and permission-denied states are distinct.
- A detail route at `/admin/customers/{customerId}` shows profile/account,
  agreement, climbing activity, recent climbs, and labelled contact history.
  Missing values read “Not recorded”; zero activity says “No climbs recorded”
  rather than inventing a status.
- The detail screen is read-only until ARCH confirms write operations. It does
  not offer password changes, role promotion or account-status changes.

## 6. Privacy and permissions

- Admin role required on the backend for every list/detail request.
- Member and staff tokens must receive 403; anonymous requests 401.
- Responses omit password hashes, tokens and internal auth fields.
- Contact messages are matched by email only and labelled unlinked; no claim is
  made that the account owner sent them.
- Search and pagination happen server-side, with bounded limits.
- No live customer data is used in tests. Backend tests use isolated SQLite
  records; browser tests use the disposable PostgreSQL test database and
  seeded/demo data.

## 7. Acceptance criteria and tests

Backend:

- admin list returns only safe fields, a total, bounded items and correct paging;
- search matches name/email/phone; role/status filters work; empty search
  returns an empty list, not all records;
- member and staff tokens are denied; anonymous requests are denied;
- detail returns agreement/activity/contact history for the requested account
  only; a missing account is 404;
- an account with no agreement or activity returns `null`/zero fields rather
  than fabricated values;
- no password hash or token appears in any response.

Frontend:

- directory loading, populated, empty, error and permission-denied states;
- server query parameters change when search/filter/page changes;
- each row links to the detail view and demo accounts are labelled;
- detail profile, agreement, activity, empty activity and contact-history states;
- responsive table/detail layout with no horizontal page overflow.

## 8. Questions requiring ARCH confirmation

1. May administrators edit customer profile fields (name, phone), and which
   changes require a member request or audit trail?
2. What does account deactivation mean for a customer with active climbs,
   agreements and contact history? Is deactivation reversible?
3. Should contact messages be formally linked to a customer account (a
   nullable `user_id`), or remain email-only?
4. What are the real membership tiers/status values, and should they be edited
   in this product at all?
5. Who may change a safety-agreement status, and what legal evidence must be
   retained? The current model is provisional.
6. What retention period applies to customer records and contact messages?

Until these are answered, the admin customer screens are read-only apart from
the already-existing agreement and contact-inbox actions. This is intentionally
not a general customer-edit endpoint.
