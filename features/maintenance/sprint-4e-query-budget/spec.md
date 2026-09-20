---
screen: sprint-4e-query-budget
feature: maintenance
repo: api only (no web, no mobile, no Android build)
status: planned — awaiting PM APPROVED
spec_status: drafted 2026-09-20 by the Architect acting as PM Helper (no separate PM Helper pass was run)
source: qa/reports/page-perf-2026-09-19.md (Server-Timing section, 2026-09-20), qa/research/web-performance-2026-09.md §3–4
measured_on: branch sprint-4e-query-budget (base sprint-4c-local-day @ f6219fd), in-process against a seeded SQLite copy
base_branch: sprint-4c-local-day (NOT master — 4C is code-complete and edits most of the routers 4E touches)
---

## What It Does

Every database query this API makes crosses the Pacific: the API runs in Oregon, the database
in Singapore. Measured from the `Server-Timing` header on production, **one query costs
180–250 ms**, and a page's wait grows almost exactly in line with how many queries it makes.

This sprint removes queries. It changes no response body, adds no column, and creates no index.
It helps whether or not the PM later moves the two services into one region: a removed query
saves ~200 ms today and still ~60 ms after co-location.

**In numbers.** Counting SQL statements per request, for every endpoint a page calls:

- the heaviest page, the circle detail page, drops from **43 queries to 29**
- the Home feed drops from **40 to 19**
- the admin dashboard drops from **27 to 10**
- `GET /admin/stats` alone drops from **15 queries to 2**
- two N+1 loops that survived Sprint 4A are removed: `GET /groups/my/pending` (3 + one query
  per pending circle) and `GET /users/{id}/stats` (3 + one query per finished book — a reader
  with 100 finished books costs 103 queries, about 20 seconds)

And a test is added so an N+1 can never quietly come back: each endpoint gets a query budget,
and the build fails, naming the endpoint and both numbers, if it is exceeded.

## Appetite

Max complexity: complex (one to one-and-a-half weeks across seven work packages, six of which
touch disjoint files and can run in parallel).

**Not building:**
- the browser-side request waterfall — that is Sprint 4D, in build
- any hosting or region change — a PM decision, tracked separately as F-68
- any database migration, including new indexes. If a merged query turns out to want an index,
  that is a separate PM step with its own SQL. See E-4.
- removing the one user lookup `get_current_user` makes on every authenticated request. It is
  the biggest single win available (one query off *every* endpoint) and it is a security
  control. See E-1 — it needs a PM decision, not a code change.
- any web or Android change. No EAS build, no `app.json` bump.

## User Story

As a reader on the Home feed, I want the page to finish loading in about half the time it does
now, so that opening TrackMyRead does not feel like waiting for a website from 2005.

**Assumption, flagged:** no reader has said this in words. It is inferred from the measured
page timings (signed-in pages: 2.9–6.4 s on desktop, 3.6–8.9 s on a throttled phone, against
0.26–0.39 s for the public pages) and from LCP being over Google's 4 s "poor" line on six pages.

**Success metric:** the per-endpoint SQL statement count, read off the `Server-Timing` header
on production, matches the "after" column of the table in `architecture.md` for every endpoint
listed. Secondary: `ready` on `/home` and `/groups/7` falls by at least 1 s on desktop with the
regions unchanged.

## Requirements

Every item names the endpoints it covers, the defect (a measured statement count), and an
acceptance criterion. **No response body may change anywhere in this sprint** — that is R-00
and it outranks every other requirement here.

### R-00 — Responses are byte-identical
- **Why:** Sprint 4A added strict key-set regression tests precisely because a cleanup silently
  dropped keys before. Android ≤ 2.2.1 reads alias keys (`totalBooks`, `toRead`, `reading_goal`,
  `average_rating`, `books_this_year`, `projected_finish_date`) that look redundant and are not.
- **Accept:**
  - every test in `TestProfileRegression`, `TestProfileMeNoPII`, `TestUserbookRegression`,
    `TestNoteShapeRegression`, `TestGroupsRegression`, `TestAdminRegression`,
    `TestSearchRegression`, `TestPrefsRegression`, `TestImportRegression` passes unchanged
  - no test file in `tests/` is edited to loosen an assertion. Editing one is a defect, not a fix.
  - for each endpoint in the table, a before/after JSON diff of the same seeded request is empty,
    including key order where a list is ordered by the route rather than the database.

### R-01 — The once-a-day `last_active` write leaves the request path
- **Endpoints:** every authenticated route (the write lives in `app/deps.py :: get_current_user`).
- **Defect (measured):** on the first request of a reader's local day the touch costs **three**
  extra round trips, not one: the `UPDATE`, a second connection checkout (so a second
  `pool_pre_ping` `SELECT 1` on production), and — because the commit expires the identity map —
  a re-`SELECT` of the user row by any route that reads it again. Measured on
  `GET /profile/me`: 4 statements and 1 pool checkout on a later request, **6 statements and 2
  checkouts** on the first of the day. At production prices that is roughly 575 ms, paid on
  whichever request happens to land first — often `/notifications/unread-count` from the nav bar.
- **Accept:**
  - the first request of a reader's local day runs the same number of SQL statements as the
    second, and checks out one connection, not two
  - `user.last_active` is still set to the seam's `utcnow()` once per **local** day
  - `user.timezone` still reflects a valid, changed `X-Timezone` **within the same request**
    that reported it (4C's `test_header_persisted_before_last_active_compared` must stay green)
  - every test in `tests/test_local_day.py :: TestLastActive` and `TestZoneHeader` passes unchanged
  - `POST /auth/google` and `POST /auth/review-login` still set `last_active` inline and
    unconditionally (`tests/test_auth.py :: TestGoogleLoginLastActive`)

### R-02 — `pool_pre_ping` gets a decision on the record, not a silent default
- **Defect:** every request pays one uncounted round trip (~175 ms measured as server-total
  minus DB-time, on every endpoint including `/version`). Nothing in the repo records why.
- **Accept:** `app/database.py` carries a comment naming the measured cost, the reason for the
  setting, and the condition under which it would be revisited. The recommendation is **keep**;
  see E-3 for the reasoning the PM is asked to confirm.

### R-03 — Sequential queries that are one query
- **Endpoints:** `/profile/me`, `/profile/{id}`, `/userbooks/`, `/userbooks/{id}`,
  `/userbooks/user/{id}`, `/userbooks/friends/currently-reading`, `/reading-activity/insights`,
  `/reading-activity/user/{id}/daily`, `/users/search`, `/users/following`, `/notes/*`,
  `/groups/*`, `/admin/*`.
- **Defect:** a parent row set is fetched, then its children are fetched by `id IN (…)` in a
  second statement. Sprint 4A turned N+1s into two statements; two statements is still two
  ocean crossings for what a join returns in one.
- **Accept:** each endpoint's measured statement count equals the "after" column of the
  architecture's table, and its budget test passes.

### R-04 — Counts are counted, not fetched and measured in Python
- **Endpoints:** `/notifications/unread-count`, `/profile/me`, `/profile/{id}`,
  `/reading-activity/daily`, `/reading-activity/user/{id}/daily`.
- **Defect:** `unread_count` selects every unread `NotificationLog` row — `data` JSON column
  included — and returns `len()`. `/profile/me` selects every `Follow` row in both directions to
  return two integers. `/reading-activity/daily` selects every activity row to sum by day.
- **Accept:**
  - the response is identical
  - the statement for each of these is an aggregate (`count`/`sum`/`GROUP BY`), and no route
    calls `len()` or sums in Python over a row set it fetched only to count
  - this is a payload fix, not a count fix: `/notifications/unread-count` stays at 2 statements
    and 2 is its budget. It is called on every signed-in page and polled every 60 s, so the rows
    it stops shipping matter.

### R-05 — The two surviving N+1 loops are removed
- **`GET /groups/my/pending`** (`app/routers/groups_router.py:301`) — one `count(*)` per pending
  circle inside a list comprehension. Measured: 7 pending circles → **10 statements**. This is
  almost certainly the cause of the 2241 ms `GET /groups/my/pending` recorded as the slowest
  call on the `/groups` page.
- **`GET /users/{id}/stats`** (`app/routers/users_router.py:240-241`) — `userbook.book` is a
  lazy relationship load inside a loop over every finished book. Measured: 3 finished books →
  **6 statements**; the cost is 3 + one query per distinct finished book.
- **Accept:** for both, the statement count is identical for 5 rows and for 50, and each is
  at or under its budget.

### R-06 — A query budget guard
- **Accept:**
  - a test fails when any listed endpoint exceeds its budget, and the failure message names the
    endpoint, the budget and the actual count — e.g.
    `GET /notes/feed ran 6 queries, budget 4 (was 8 before Sprint 4E)`
  - for every list endpoint the test also asserts the count does not grow with row count, by
    running the same request against a small and a large seed
  - budgets are set from the measured post-fix counts with a margin of at most one
  - the guard covers every endpoint named in the architecture's table, not a sample
  - the existing `TestNoteQueryCount` in `tests/test_notes.py` is left in place; the new guard
    supersedes its ceilings and the older, looser numbers there are tightened to match

### R-07 — Nothing 4C did is undone
- **Accept:** `app/localday.py`, `app/schema_guard.py`, the `X-Timezone` handling and every
  per-reader local-day computation behave exactly as they do on `sprint-4c-local-day`.
  `tests/test_local_day.py` passes in full, including `TestSchemaGuard`.

## Screen States

No screen changes. The affected states are latency states, and they belong to pages the web
already renders:

- **Loading** — every signed-in page shows its existing skeleton. It is shown for less time.
  No spinner is added or removed.
- **Error** — unchanged. A failed query still produces the same status code and body. The
  Render cold start (up to ~60 s on the free tier) is untouched by this sprint and still the
  worst case a reader can hit.
- **Empty** — the endpoints that early-return on an empty result must keep doing so and must
  not start running their merged query anyway. `/notes/feed`, `/notes/friends-feed`,
  `/groups/my`, `/groups/discover` and `/users/following` all have `if not x: return []` guards
  that keep an empty account at 1–2 queries; the budget test asserts the empty case too.

## Privacy and Ownership

This sprint merges permission checks into joins. That is the one way a query-count sprint can
cause a privacy regression, so it is called out here as a requirement rather than left to the
architecture.

- **R-08 — No merge may widen what a reader can see.**
  - **Accept:**
    - `GET /notes/feed`'s join to `user` stays an **INNER** join with
      `user.is_private_profile == False`. Turning it into a LEFT join to also reach
      `userbook`/`book` in the same statement would put private-profile authors' notes into the
      public feed. `tests/test_notes.py :: TestFeed :: test_private_notes_excluded_from_community_feed`
      is the test that must go red if it happens.
    - the private-profile gate (`is_private_profile` + Follow → 403/locked) still runs on
      `/profile/{id}`, `/userbooks/user/{id}`, `/notes/user/{id}`, `/users/{id}/stats` and
      `/reading-activity/user/{id}/daily`. Folding the Follow check into the user fetch makes it
      run always, including for public profiles; that is strictly more checking and is allowed.
    - the private-group gate (`is_private` + active membership → 403) still runs on
      `/groups/{id}`, `/members`, `/leaderboard`, `/goal`, `/posts`, `/activity`, and the
      curator gate on `/groups/{id}/pending`. A merged query may fetch the group row and the
      caller's membership together, but the 403 must still be raised before any group field
      reaches the response.
    - `note.is_public == True` still filters every public list.
    - no endpoint starts returning a column it did not return before. A join brings
      `user.email`, `user.password_hash` and `user.notification_prefs` within reach of the row
      object; response dicts are built field by field, never from a row mapping.
- **No new notification is fired and no `event_type` changes.**
- **No endpoint changes its auth level.** Every route that required `get_current_user` or
  `get_admin_user` still does.

## Scope

- **API only.** No web file, no mobile file, no `app.json`, no EAS build.
- **No migration.** `context/supabase_migration.sql` is not appended to. `schema_guard.REQUIRED_COLUMNS`
  is not extended.
- **Merge order: 4E merges after 4C and after 4D.** 4C is in 4E's base; 4D is in build and
  touches the web client only, but its measurements were taken against today's API, so it
  lands first and 4E's effect is measured on top of it.

## Done Checklist

Five steps a person can click, covering the happy path, an edge, and one "another user cannot
see X":

1. Sign in on the web and open `/home`. It renders, and every card that rendered before still
   renders: feed posts with author, book cover, like and comment counts, and your own likes
   shown as filled hearts. In DevTools → Network, `GET /notes/feed`'s `Server-Timing` header
   reads `3 queries` or fewer.
2. Open `/groups/{a circle you are in}`. Members, leaderboard, goal bar, posts and activity all
   render. `GET /groups/{id}` reads `4 queries` or fewer.
3. Open `/profile/{a friend with a long finished shelf}`. The stats block shows the same totals
   as before, and `GET /users/{id}/stats` reads `4 queries` or fewer regardless of shelf size.
4. Request a join to a private circle, then open `/groups`. The pending card appears with the
   right member count, and `GET /groups/my/pending` reads `3 queries` however many pending
   circles you have.
5. **Other user cannot see X:** as a reader who does not follow a private-profile account, open
   that account's profile. It is still locked: no stats, no books, no notes, and
   `/notes/user/{id}`, `/userbooks/user/{id}`, `/users/{id}/stats` and
   `/reading-activity/user/{id}/daily` all still return 403. As a non-member, open a private
   circle's URL directly: still 403 on the circle and on every one of its sub-endpoints.

## Open Items for the PM

Six, each with a recommendation, set out in full in `architecture.md` under **Escalations**:

- **E-1** the per-request user lookup in `get_current_user` — *recommendation: leave it*
- **E-2** where the `last_active` write should go — *recommendation: after the response*
- **E-3** `pool_pre_ping` — *recommendation: keep*
- **E-4** indexes that production may be missing on the circle and notification tables —
  *recommendation: run one read-only query and decide separately*
- **E-5** the 60-second `/notifications/unread-count` poll — *recommendation: hand to 4D*
- **E-6** `/profile/me` fetched twice on `/profile` and `/settings` — *recommendation: hand to 4D*

None of the six blocks the build. Packages P1–P7 can start on APPROVED.
