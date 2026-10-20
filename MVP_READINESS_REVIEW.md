# MVP readiness review

A review of the ARCH platform as it stands, against the requirements in
`README.md` and the decisions recorded in `PLAN.md`.

**Reviewed:** commit `d5b2abf`, working tree clean, branch `main`, no remote
configured (so nothing can be pushed).

**How it was reviewed:** the documentation was read, the code was inspected
endpoint by endpoint and screen by screen, the whole verification suite was run
again, and the running application was probed directly — with a script that
asks the assistant a set of realistic questions, a script that walks the API's
public surface and every permission boundary with each of the three roles, and
a script that checks the leaderboard's scoring through the public API.

The three blockers found below were fixed afterwards, each in its own commit.
The review is written from the point of view of that review, and each fix
records what it changed and how it was verified.

---

## 1. What is actually working

### Verified by automated tests (181 tests in total)

The counts below are after the fixes: 129 backend tests and 52 frontend tests.

| Area                             | Evidence                                                                                                                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route voting rules               | `backend/tests/test_climbing_rules.py` — grade arithmetic, the three-vote minimum, the split-vote rule, the one-step cap, the official grade never changing.                                                                                               |
| Leaderboard scoring and ties     | `backend/tests/test_climbing_rules.py` — sends only, one point per grade step, tie-breaking, competition ranks.                                                                                                                                            |
| Authentication                   | `backend/tests/test_auth_api.py` — registration, duplicate e-mail, sign-in, wrong password, deactivated accounts, the 72-byte password limit, password change (wrong current password, same password, too short, too long, only the caller's own account). |
| Ownership                        | `backend/tests/test_member_api.py` — a member cannot read or delete another member's logbook.                                                                                                                                                              |
| Role enforcement                 | `backend/tests/test_staff_admin_api.py` — a customer gets 403 on every staff and admin endpoint; a member of staff can only touch their own task; a task cannot be assigned to a customer.                                                                 |
| Public API and input validation  | `backend/tests/test_public_api.py` — every public endpoint, the contact form, unpublished FAQ entries staying hidden, the vote tally reaching the public route list.                                                                                       |
| Assistant grounding and fallback | `backend/tests/test_public_api.py` — a covered question, an uncovered question, and the assurance that no price is invented.                                                                                                                               |
| Security configuration           | `backend/tests/test_security.py` — the production secret key, the wildcard CORS origin, the password length rules, the constant-time login, the role read from the database.                                                                               |
| Frontend service layer           | `src/test/*.test.ts` (52 tests) — the wire-to-UI mapping, the session state machine, the account and staff request shapes, the assistant modes.                                                                                                            |

### Verified only in a local browser

The seven browser checks under `scripts/` pass against **both** the development
server and the production build:

| Check                | What it proves                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-pages`        | All 20 pages load with no console error, no failed request and no hydration mismatch.                                                                           |
| `check-contact-form` | The contact form reaches the API and the confirmation is shown.                                                                                                 |
| `check-member-flows` | Register, sign the agreement, log a climb, edit the profile, refuse a wrong password, change the password, sign out, records hidden afterwards.                 |
| `check-voting`       | Vote, change the vote, withdraw it, and see the leaderboard.                                                                                                    |
| `check-staff-flows`  | A customer is refused on both staff pages, a member of staff works their own task, an administrator publishes a route and an event and works the contact inbox. |
| `check-assistant`    | A covered question returns the published answer with its source; a question that only shares a keyword with one is refused.                                     |
| `check-styles`       | The production build really is styled.                                                                                                                          |

**Not verified anywhere:** the PostgreSQL path, the Cloudflare Worker
deployment, the live language-model provider, and anything that depends on a
second machine.

### Mock data, placeholders and unverified integrations

| Thing                               | State                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Prices                              | **Empty.** No price is published, and no price is invented. The page says the list is being confirmed.            |
| Opening hours                       | Placeholder rows marked "Closed — to be confirmed by ARCH".                                                       |
| Gym rules                           | Six draft rules, each labelled `DRAFT`, with `is_confirmed = false`.                                              |
| Courses and events                  | One clearly-labelled sample entry each.                                                                           |
| The photographs                     | Generated placeholder artwork (`scripts/generate_placeholder_images.py`), not photographs of the gym.             |
| The shoe catalogue                  | Sample products with sample prices. No checkout.                                                                  |
| The assistant with a language model | The provider path is unit-tested but has never been run against a provider.                                       |
| The demo database                   | The local database currently holds rows created by the browser checks. It should be reset before a demonstration. |

---

## 2. Blockers before demonstrating to ARCH

### B1 — The assistant answers questions it has no information for

**Evidence.** `backend/scripts/probe_assistant.py` asks 19 questions, six of
which are outside the published information:

```
NOT COVERED  | What is the wifi password?
ANSWERED     | Do you sell climbing shoes online?  -> "Do I need climbing experience to visit?"
ANSWERED     | Can I bring my dog?                  -> "What should I wear and bring?"
ANSWERED     | Do you offer refunds?               -> "What does ARCH offer?"
ANSWERED     | What is the exact street address?   -> "Is there a safety agreement?"
```

Four of the six out-of-scope questions were answered, each with an unrelated
answer from the knowledge base, and each labelled **"From ARCH's published
information"**. The actual answers are things like _"Comfortable clothes you
can move in, a water bottle…"_ for _"Can I bring my dog?"_.

**Cause.** `backend/app/services/assistant.py` scores a question against the
FAQ with bag-of-words overlap. Anything scoring above `CONTEXT_MATCH_THRESHOLD`
(0.15) is treated as "related", and the related entry's answer is then quoted
as the answer, with the mode still reported as `knowledge_base`. A single
shared keyword in a long keyword list is enough to score 0.15, so unrelated
questions land in the "related" branch.

**Impact.** This breaks the README's explicit requirement that the assistant
"should acknowledge uncertainty and direct users to staff when the answer is
not covered by approved information" and "must not invent prices, policies, or
bookings". In a demo it is the most visible problem on the site: a visitor
can ask something the gym has never said and be given a confident answer
attributed to the gym.

**Recommended action.** Only quote an entry when it is a genuine match (the
existing `DIRECT_MATCH_THRESHOLD`). Below that, say the information is not
covered, list what _is_ covered, and point at staff.

**Fixable without ARCH input: yes.** This restores documented behaviour; it
does not choose a new policy. A threshold change would be a tuning decision,
so the fix keeps the thresholds as they are and only changes what happens
below them.

**Status: fixed in `6354f0d`.** An entry is now only quoted when it is a
genuine match; below that the assistant says the information is not covered,
names the closest thing it has published, and points at the team. The
tokeniser also folds simple plurals, so "courses" and "beginners" now reach
the entries that say "course" and "beginner" — without that, refusing the
loosely-matched questions left legitimate questions unanswered.

The probe now answers all 13 in-scope questions with the right entry and
refuses all 6 out-of-scope questions. Two backend tests and the browser check
cover it.

### B2 — A signed-in member is silently signed out when the API is briefly unreachable

**Evidence.** `src/services/session.tsx`, in `refresh()`:

```ts
} catch (caught) {
  setAccessToken(null);   // discarded for *any* error, including a network failure
  setUser(null);
  setStatus("anonymous");
```

A network blip, a proxy restart or a laptop waking from sleep destroys the
member's token. There is no way back in without signing in again.

**Impact.** A member who is in the middle of something loses their session
without warning, and the site shows "Not signed in" with no explanation. The
session's `error` field is written but **never read by any component**, so
nothing is ever shown to the member.

**Recommended action.** Only discard the token when the backend explicitly
rejects it (401). Keep it for any other failure, report the failure, and show
it in the member area.

**Fixable without ARCH input: yes.** This is a defect against the intended
behaviour ("the session only holds the member's own access token") and
changes no business rule.

**Status: fixed in `b0a9796`.** The token is only discarded on a 401; any
other failure keeps it, and the reason is shown in the member area with a way
to try again. Two tests cover it, and the assistant browser check now asks a
question that only shares a keyword with a published answer, so the defect
found in B1 cannot come back unnoticed.

### B3 — Enquiries sent through the contact form cannot be read

**Evidence.** `POST /api/public/contact` stores a `ContactMessage` and returns 201. There is **no endpoint that lists them** — `grep` over `backend/app/api`
finds no reader for `ContactMessage` — and no screen shows them. The
`handled` column exists in the model with no way to set it.

**Impact.** The contact form now genuinely sends, and the gym cannot read
what it receives through the product. In a demo the form "works" and a
visitor's message disappears. The README asks for "a central place to manage
public content, using real persistence where the feature requires it".

**Recommended action.** Give administrators a read-only inbox for the
messages, with a way to mark them handled.

**Fixable without ARCH input: yes.** It exposes data the product already
collects to the role that manages it, and changes no rule about what the form
collects. It needs a decision only on _who_ may read the inbox, and the
existing roles already answer that: administrators.

**Status: fixed in `a958066`.** `GET /api/admin/contact` lists the enquiries
newest first, `PATCH /api/admin/contact/{id}` marks one handled or puts it
back, and the operations workspace has a **Messages** tab. Both endpoints are
behind the administrator role, a test proves a customer cannot reach them,
and the staff browser check sends an enquiry through the public form, finds it
in the inbox and marks it handled.

---

## 3. Decisions requiring ARCH confirmation

These are business questions. The implementation currently makes a documented,
provisional choice; changing it needs ARCH.

| #   | Question                                                                                                                     | What the platform does today                                                                                                            | Why it matters                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Opening hours, address, contact e-mail, phone, social links                                                                  | Placeholders, clearly marked                                                                                                            | The `Visit` and `Contact` pages cannot be finished without them.                                                                                 |
| D2  | Prices and membership tiers                                                                                                  | Empty, never invented                                                                                                                   | The `Prices` section shows a placeholder until they exist.                                                                                       |
| D3  | Courses, events and the calendar                                                                                             | One labelled sample entry each                                                                                                          | Same.                                                                                                                                            |
| D4  | The safety-agreement workflow: digital signature, uploaded document, or a staff-confirmed status?                            | Digital signature plus a staff override                                                                                                 | The README asks for this to be settled _before_ it is implemented. The current flow may not be the one ARCH wants.                               |
| D5  | Route voting: what a vote means, repeat votes, how the level is used, how a grade is derived, leaderboard scoring and resets | One vote per person per route, replaceable, a perceived grade only after three votes and only when half agree, one point per grade step | The README calls these out as questions to settle. The rules are implemented, documented and tested — but they are a proposal, not an agreement. |
| D6  | Is height/weight genuinely needed?                                                                                           | **Not collected**                                                                                                                       | Correct default until confirmed.                                                                                                                 |
| D7  | Should a member's **climbing level** appear on the public leaderboard?                                                       | It is currently **not** shown on the page, but the API still returns it                                                                 | The README says not to expose private customer information in public leaderboards. The safe default is to publish only what the page shows.      |
| D8  | Staff shifts: simple assignments or full rostering?                                                                          | The API supports shifts; no screen uses them                                                                                            | A shift could be a rostering tool or a simple diary.                                                                                             |
| D9  | Which facts may the assistant use?                                                                                           | The published FAQ only                                                                                                                  | The knowledge base is the FAQ table. ARCH may want a wider source.                                                                               |
| D10 | Is open sign-up acceptable before e-mail verification?                                                                       | Open                                                                                                                                    | Without verification, spam accounts are trivial.                                                                                                 |
| D11 | Where do route and product pictures live, and who may publish them?                                                          | A URL, set by an administrator                                                                                                          | There is no upload endpoint.                                                                                                                     |
| D12 | Is e-commerce in scope?                                                                                                      | A catalogue with no checkout                                                                                                            | The README calls it P2 and conditional.                                                                                                          |

---

## 4. Required before production deployment

| #   | Item                                                              | Evidence                                                                                             | Action                                                              | Needs ARCH?                    |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------ |
| P1  | **PostgreSQL has never been run.**                                | Every test, migration and manual run used SQLite.                                                    | Run the migrations and the suite against PostgreSQL.                | No                             |
| P2  | **The Worker has never been deployed.**                           | `bun run build` produces `.output/server`; nothing has been pushed anywhere.                         | Deploy and smoke-test.                                              | No                             |
| P3  | **No rate limiting.**                                             | `/api/auth/login` and `/api/public/contact` are unbounded; the contact table accepts anything.       | Rate-limit both at the proxy.                                       | No                             |
| P4  | **No e-mail verification.**                                       | `POST /api/auth/register` creates a usable account immediately.                                      | Add verification, or keep sign-up closed until it exists (D10).     | Yes (D10)                      |
| P5  | **Access tokens cannot be revoked.**                              | A JWT is valid until it expires (12 hours by default); changing the password does not invalidate it. | Add a token version or a denylist, or shorten the lifetime.         | No                             |
| P6  | **`ARCH_SECRET_KEY` must be unique and rotated per environment.** | Enforced in code: the API refuses to start in production with the default.                           | Set it.                                                             | No                             |
| P7  | **CORS must list the site's origin.**                             | Enforced in code: a wildcard is rejected.                                                            | Set `CORS_ORIGINS`.                                                 | No                             |
| P8  | **The database needs backups and a least-privilege role.**        | Not configured anywhere.                                                                             | Set up backups; do not give the app role permission to drop tables. | No                             |
| P9  | **The placeholder photographs must be replaced.**                 | Generated artwork, not the gym.                                                                      | Replace with ARCH's photographs.                                    | Yes (they have to supply them) |
| P10 | **Privacy review of the customer-record and agreement model.**    | The README asks for this explicitly and it has not happened.                                         | Have the institution review what is stored and for how long.        | Yes                            |
| P11 | **The demo database should be reset before a demonstration.**     | The local database holds rows created by the browser checks.                                         | `uv run python -m app.seed --reset --demo`.                         | No                             |

---

## 5. Optional improvements

| #   | Item                                                               | Note                                                                         |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| O1  | `ContentRevision` exists but nothing writes to it                  | An audit trail of content changes. Either use it or drop it.                 |
| O2  | The shop exposes `stock` publicly                                  | Normal for a shop, worth a decision.                                         |
| O3  | The public FAQ endpoint returns its retrieval `keywords`           | Internal retrieval metadata. Harmless.                                       |
| O4  | The route beta is still illustrative text, not real beta           | Needs the setters.                                                           |
| O5  | The assistant does not suggest the closest published page          | It would be more helpful than refusing outright.                             |
| O6  | Staff cannot assign a task to a named colleague from the interface | The API supports it; the form assigns to yourself.                           |
| O7  | No shift screen, and no agreement-approval queue                   | The APIs exist for both.                                                     |
| O8  | The `vitest` suite is thin on component tests                      | The browser checks cover the flows more honestly than component tests would. |
| O9  | The `drizzle/` directory is inert Lovable scaffolding              | Left untouched rather than deleted.                                          |

---

## 5a. Fixes applied during the review

Each fix is a separate commit and none of them changes a business rule.

| Commit      | Finding                                                                               | What changed                                                                                                                                                                                                         | How it was verified                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `6354f0d`   | B1 — the assistant answered out-of-scope questions                                    | An FAQ entry is only quoted when it is a genuine match; below that the assistant says the information is not covered and points at the team. The tokeniser folds simple plurals so legitimate questions still match. | 2 new backend tests; the probe now answers 13/13 in-scope questions and refuses 6/6 out-of-scope ones; the browser check covers it. |
| `b0a9796`   | B2 — a network failure signed the member out                                          | The access token is only discarded when the backend rejects it (401). Any other failure keeps the session and the reason is shown in the member area.                                                                | 2 new frontend tests; the browser check now asks a question that only shares a keyword with a published answer.                     |
| `a958066`   | B3 — enquiries could not be read                                                      | `GET /api/admin/contact` and `PATCH /api/admin/contact/{id}`, plus a **Messages** tab in the operations workspace.                                                                                                   | 2 new backend tests; the staff browser check sends an enquiry through the public form, finds it and marks it handled.               |
| `821815a`   | The public leaderboard published an internal id and an unconfirmed personal attribute | The public payload is now exactly what the page renders: rank, display name, sends, best grade, score.                                                                                                               | A backend test asserts the field set, so nothing can be added back by accident.                                                     |
| this commit | The page check did not cover the newer routes                                         | `check-pages` now covers all 20 pages, including `/signin`, `/leaderboard`, `/routes/1`, `/staff` and `/member/profile`.                                                                                             | The check reports all 20 pages clean against the dev server and the production build.                                               |

Two probe scripts were added so the review can be repeated:
`backend/scripts/probe_assistant.py` (the assistant's answer rate),
`backend/scripts/probe_permissions.py` (the public surface and every permission
boundary) and `backend/scripts/probe_leaderboard.py` (the scoring through the
public API).

---

## 6. Risks by area

| Area                          | Risk                                                                                 | Level    | Status                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| AI answer reliability         | Confident wrong answers to out-of-scope questions                                    | **High** | Fixed — B1                                                                                           |
| Authentication                | A network blip silently signs a member out                                           | **High** | Fixed — B2                                                                                           |
| Customer data                 | Enquiries cannot be read by the gym                                                  | **High** | Fixed — B3                                                                                           |
| Staff permissions             | —                                                                                    | Low      | Verified by tests and by probing every boundary with all three roles                                 |
| Route voting                  | —                                                                                    | Low      | Rules implemented, documented and tested; the rules themselves are provisional (D5)                  |
| Leaderboard correctness       | —                                                                                    | Low      | Scoring, ties and ranks are unit-tested; the API output was checked                                  |
| Customer data in public lists | The leaderboard returned an internal `user_id` and an unconfirmed personal attribute | Medium   | Fixed — `821815a`; the public payload now carries only what the page shows; D7 remains open for ARCH |
| Secrets                       | —                                                                                    | Low      | No secret is in the client bundle; `.env` is ignored; `.env.example` has placeholders only           |
| Data at rest                  | SQLite in development; PostgreSQL untested                                           | Medium   | P1                                                                                                   |
| Spam                          | Unbounded sign-up and contact form                                                   | Medium   | P3, P4                                                                                               |

---

## 7. Conclusion

**Ready to demonstrate: yes**, now that the three blockers above have been
fixed and verified. The public website, the member area, route voting, the
leaderboard, the staff tools and the operations workspace all work end to end,
and are covered both by tests and by real browser runs against the
development server _and_ the production build.

**Not ready for production.** The three production blockers that are
technical (P1, P2, P3) are straightforward but have not been done here. The
rest need ARCH's answers (D1–D12) and the institution's privacy review
(P10). Nothing in this repository should be read as a claim of legal
compliance: the data model, the safety-agreement workflow and the route
voting rules are all proposals that ARCH has yet to confirm.

**What a demonstration should show, and what it should not.** The site is
honest about what it does not know: the price list is empty, the opening
hours say "to be confirmed", the rules are marked as drafts, the
photographs are placeholders, and the assistant says when it does not know.
That honesty is a feature, and it should be presented as such. The
photographs and the confirmed opening hours, prices, courses and events are
the only things between the current build and a finished public site, and all
five need ARCH.
