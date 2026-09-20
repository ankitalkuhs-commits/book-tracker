---
screen: sprint-4e-query-budget
feature: maintenance
repo: api only (no web, no mobile, no Android build)
status: architecture-complete
spec_status: spec.md drafted 2026-09-20, awaits the PM's APPROVED
architect_verified: 2026-09-20 — code read on branch sprint-4e-query-budget (base sprint-4c-local-day @ f6219fd); every query count in this document was measured in-process, not estimated
base_branch: sprint-4c-local-day
merge_order: after 4C, after 4D
---

## Risk Summary (for PM)

- **What changes:** the API asks the database fewer questions per request. Nothing a reader or
  either app receives changes — same fields, same values, same order, same status codes.
- **Why it matters:** the API is in Oregon, the database in Singapore. One query costs 180–250 ms,
  measured. Pages wait in almost exact proportion to how many queries they make.
- **The size of it:** the circle detail page goes from 43 database queries to 29, Home from 40 to
  19, the admin dashboard from 27 to 10. `/admin/stats` alone goes from 15 queries to 2.
- **Two loops Sprint 4A missed are fixed:** the pending-circles list runs one extra query per
  circle, and a friend's stats page runs one extra query per finished book — a 100-book reader
  costs about 20 seconds there today.
- **It stands on its own:** a removed query saves ~200 ms now and still ~60 ms if you later move
  the two services into one region. The two decisions do not depend on each other.
- **Could break:** several of the queries being merged are permission checks. A careless join
  could show a private profile's notes or let a non-member read a private circle. That is the
  one real risk, and the security review below names the exact test that must go red for each.
- **No database change.** No new column, no new index, no SQL for you to run. If a merged query
  later wants an index, that comes back to you as its own step.
- **Your decisions:** six, each with my recommendation — keep the connection health-check, move
  the once-a-day "last active" write to after the response, leave the login lookup alone, check
  four possibly-missing indexes, and hand two browser-side items to 4D.
- **Order:** this merges after 4C and after 4D. **Recommendation: approve.**

---

## How every number here was measured

The app was run in-process against a seeded SQLite copy of the schema with a SQLAlchemy
`before_cursor_execute` listener counting statements — the same pattern `tests/test_notes.py`
has used since F-08, and the same counter the `Server-Timing` header uses in production
(`app/server_timing.py`).

The harness is validated against production: for the six endpoints the PM measured with
`Server-Timing` on 2026-09-20, the local counts are identical.

| endpoint | production `Server-Timing` | this harness |
|---|---:|---:|
| `/version` | 0 | 0 |
| `/notifications/unread-count` | 2 | 2 |
| `/userbooks/` | 3 | 3 |
| `/profile/me` | 5 | 5 |
| `/notes/feed` | 8 | 8 |
| `/books/recommendations` | 12 | 12 |

Counts were taken on a **second** request, so the once-a-day `last_active` write is not included
in the table; it is accounted for separately in **R-01**. Endpoints with a branch (a private
profile, a private circle, a curator) were measured on both branches and the table shows both.

---

## The table: every endpoint a page calls, before → after

`n` = rows returned. `F` = the reader's finished-book count. Bold marks a real N+1.

| # | endpoint | now | after | budget | what goes |
|---|---|---:|---:|---:|---|
| 1 | `GET /version` | 0 | 0 | 0 | — |
| 2 | `GET /profile/me` | 5 | **3** | 4 | two full `Follow` row-fetches → one aggregate; `userbook` + `book` → one join |
| 3 | `GET /profile/{id}` | 7 | **3** | 4 | four `Follow` queries (is-following, follows-you, followers, following) → one statement |
| 4 | `GET /userbooks/` | 3 | **2** | 3 | `userbook` + `book` → one join |
| 5 | `GET /userbooks/{id}` | 3 | **2** | 3 | same |
| 6 | `GET /userbooks/user/{id}` | 4 (5 private) | **3** | 4 | Follow gate folded into the user fetch; `userbook` + `book` join |
| 7 | `GET /userbooks/friends/currently-reading` | 6 | **3** | 4 | following + mutual → one; `userbook` + `user` + `book` → one |
| 8 | `GET /notes/feed` | 8 | **3** | 4 | note + author + userbook + book → one; likes + comments + my-likes → one |
| 9 | `GET /notes/friends-feed` | 10 | **4** | 5 | following + mutual → one; note join → one; engagement → one |
| 10 | `GET /notes/me` | 8 | **3** | 4 | as #8 |
| 11 | `GET /notes/user/{id}` | 9 (10 private) | **4** | 5 | user + Follow gate → one; note join → one; engagement → one |
| 12 | `GET /notes/userbook/{id}` | 6 | **3** | 4 | the ownership gate's `userbook` row is re-fetched by `_note_relations`; reuse it and join its book |
| 13 | `GET /notes/{id}/comments` | 4 | **3** | 4 | `comment` + `user` → one join |
| 14 | `GET /books/recommendations` | 12 | **4** | 5 | see the call-site table — the library is fetched twice, and three book/user batches collapse |
| 15 | `GET /books/{id}` | 2 | 2 | 2 | — |
| 16 | `GET /books/search` | 2 | 2 | 2 | — |
| 17 | `GET /notifications/unread-count` | 2 | 2 | 2 | rows → `count(*)`. Payload only; the count cannot go below 2 (see E-1) |
| 18 | `GET /notifications/history` | 2 | 2 | 2 | — |
| 19 | `GET /notifications/prefs` | 1 | 1 | 1 | — |
| 20 | `GET /follow/followers` | 2 | 2 | 2 | — |
| 21 | `GET /follow/following` | 2 | 2 | 2 | — |
| 22 | `GET /users/following` | 4 | **2** | 3 | `follow` self-join to `user` and back to `follow` for mutual → one |
| 23 | `GET /users/search` | 4 | **2** | 3 | `user` LEFT JOIN `follow` in both directions → one |
| 24 | `GET /users/{id}/stats` | **3 + F** (6 at F=3) | **3** | 4 | kill the `userbook.book` lazy load; fold the Follow gate into the user fetch |
| 25 | `GET /reading-activity/daily` | 2 | 2 | 2 | rows → `GROUP BY` sum. Payload only |
| 26 | `GET /reading-activity/insights` | 4 | **3** | 4 | `userbook` + `book` → one join |
| 27 | `GET /reading-activity/user/{id}/daily` | 3 (4 private) | **3** | 3 | Follow gate folded into the user fetch — removes the conditional 4th |
| 28 | `GET /groups/my` | 6 | **3** | 4 | membership + group + book + creator → one; member counts → one |
| 29 | `GET /groups/my/pending` | **3 + n** (10 at n=7) | **3** | 3 | the per-circle `count(*)` → one `GROUP BY` |
| 30 | `GET /groups/discover` | 7 | **3** | 4 | groups + book + creator with `NOT EXISTS` → one; counts + my membership → one |
| 31 | `GET /groups/invites/pending` | 7 | **3** | 4 | membership + group + book + inviter + creator → one; counts → one |
| 32 | `GET /groups/{id}` | 8 (9 private) | **4** | 5 | group context → one; all of the circle's `group_member` rows → one; goal sum → one |
| 33 | `GET /groups/{id}/members` | 4 (5 private) | **3** | 3 | group context → one; member + user join → one |
| 34 | `GET /groups/{id}/leaderboard` | 8 (9 private) | **5** | 6 | group context; members + users join; finished-count and pages-sum as one `UNION ALL`; current book join |
| 35 | `GET /groups/{id}/goal` | 4 (5 private) | **3** | 3 | group context; member list becomes a subquery inside the sum |
| 36 | `GET /groups/{id}/posts` | 4 (7 with book cards) | **3** | 4 | group context; post + user + userbook + book → one |
| 37 | `GET /groups/{id}/activity` | 4 (5 private) | **3** | 3 | group context; activity + user join |
| 38 | `GET /groups/{id}/pending` | 4 | **3** | 3 | curator gate from the group context; pending + user join |
| 39 | `GET /admin/stats` | 15 | **2** | 3 | fourteen scalar aggregates → one statement |
| 40 | `GET /admin/users` | 5 | **3** | 4 | three per-user aggregates over two tables → one `UNION ALL` |
| 41 | `GET /admin/books` | 5 | **3** | 4 | the aggregate and the adder names come from one `userbook` + `user` join |
| 42 | `GET /admin/follows` | 3 | **2** | 3 | `follow` + two aliased `user` joins |
| 43 | `GET /admin/content/notes` | 5 | **3** | 4 | note + user join; engagement |
| 44 | `GET /admin/content/comments` | 3 | **2** | 3 | `comment` + `user` join |

**Every authenticated row above includes one query that is not removable in this sprint:** the
`SELECT user WHERE email = …` (or `WHERE id = …`) that `get_current_user` runs to turn the
bearer token into a `User`. It is also a security control. See **E-1**.

### What the pages pay

Summed over the endpoints each page calls on load (from `qa/reports/page-perf-2026-09-19.json`
plus a read of the web router; shared calls are `GET /profile/me` from `AuthContext.jsx:51` and
`GET /notifications/unread-count` from `Nav.jsx:25`):

| page | endpoints | DB queries now | after | removed |
|---|---:|---:|---:|---:|
| `/home` | 7 | 40 | 19 | 21 |
| `/groups/{id}` | 9 (curator) | 43 | 29 | 14 |
| `/profile/{id}` | 8 | 36 + F | 24 | 12 + F |
| `/profile` | 7 | 30 | 19 | 11 |
| `/admin` | 4 on mount | 27 | 10 | 17 |
| `/groups` | 6 | 30 + n | 17 | 13 + n |
| `/library/book/{id}` | 4 | 16 | 10 | 6 |
| `/settings` | 4 | 13 | 9 | 4 |
| `/library` | 4 | 12 | 9 | 3 |
| `/insights` | 3 | 11 | 8 | 3 |
| `/notifications` | 3 | 9 | 7 | 2 |
| `/search`, `/groups/new` | 2 | 7 | 5 | 2 |
| `/onboarding` | 1 | 5 | 3 | 2 |

**Read this honestly.** The right-hand columns are *server database work*, not wall clock. The
web fires most of a page's calls in parallel, so a page's wait is the serial `/profile/me` stage
plus the slowest call in the parallel batch. The wall-clock effect at today's ~200 ms/query is:

- `/home`: `/profile/me` 5→3 (serial, ≈ −0.4 s) plus `/notes/feed` 8→3 (the parallel batch's
  slowest, ≈ −1.0 s) ≈ **−1.4 s**
- `/groups/{id}`: `/profile/me` 5→3 plus `/groups/{id}` 8→4 (its own serial stage) plus
  leaderboard 8→5 ≈ **−1.8 s**
- `/admin`: `/admin/stats` 15→2 ≈ **−2.5 s**
- every other signed-in page: at least the `/profile/me` 5→3 saving, ≈ **−0.4 s**

Removing a query that was not on the critical path still helps: it frees a 0.1-vCPU worker
thread and one slot of a five-connection pool sooner, and it is the same saving again after a
region move, at a smaller unit price.

---

## Data Flow

Unchanged. Reader → `api.js` → FastAPI route → `get_current_user` (token → `User`) → route
queries → response dict. This sprint changes only the shape and number of the statements in
the middle box, and moves one write out of it.

## depends_on

- **`app/deps.py :: get_current_user`** — every authenticated route. 4C made it a `SELECT` plus
  a `commit` on the reader's first request of each local day. 4E moves that commit after the
  response (R-01) and leaves the `SELECT` alone (E-1).
- **`app/database.py`** — `pool_pre_ping=True`, `pool_recycle=300`, `pool_size=5`,
  `max_overflow=10` on PostgreSQL. `get_session` is an alias of `get_db`, so FastAPI's
  dependency cache gives one `Session` per request and, in the steady state, **one** connection
  checkout per request (verified with a `checkout` listener).
- **`app/server_timing.py`** — the production counter. Its listeners are registered on the
  `Engine` class, so they count whichever engine serves the request. The budget guard uses the
  same mechanism on the test engine. Neither is changed.
- **`app/localday.py`, `app/schema_guard.py`** — 4C. Untouched, and R-07 says so.
- **`tests/conftest.py`** — one shared in-memory SQLite DB; `stmt_counter` already listens on
  the right engine object (its docstring explains the double-import trap). P7 extends it.
- **Stack:** FastAPI 0.136.3, SQLModel 0.0.25, SQLAlchemy 1.4.x, Pydantic v1 compatibility
  layer (`tests/test_pydantic_v1_compat.py` pins it). **Dev is SQLite, prod is PostgreSQL** —
  every merged statement must run on both. In particular: no `FILTER (WHERE …)`, no
  `DISTINCT ON`, no `ILIKE` outside the existing `Book.author.ilike` use, no `information_schema`
  outside `schema_guard`. Use `sum(case when … then 1 else 0 end)` for conditional counts.

## depended_by

**No response shape changes anywhere in this sprint**, so the usual breaking-change table is
empty. That is the point of R-00, and it is what makes 4E safe to run in parallel with 4D.

| Change | Endpoint | Consumers | Removed / renamed? |
|---|---|---|---|
| none | — | — | No |

The behavioural changes that are visible to anything at all:

| Change | Where | Who notices | Result |
|---|---|---|---|
| `last_active` is written after the response instead of during it | `app/deps.py` | `app/notifications/scheduler.py:46` ("active today" at 20:00–22:00 local), `app/routers/admin_router.py:218` | Same value, written a few milliseconds later. The scheduler's window is two hours wide; the admin list is a display field |
| fewer SQL statements per request | every endpoint in the table | `Server-Timing`'s `desc="n queries"` | The header's number drops. Nothing reads it programmatically except the QA scripts |

## API Endpoints Used

Every endpoint in the table above. **No endpoint is added, removed, renamed, or has its auth
level changed.** Every route that required `get_current_user` still requires it; every route
that required `get_admin_user` still requires it.

## DB Tables Touched

| Table | Operation | Ownership / privacy rule that must survive the merge |
|---|---|---|
| `user` | read | `is_private_profile` + Follow gate on every cross-user read; PII (`email`, `password_hash`, `notification_prefs`) never enters a response dict |
| `follow` | read | none — a follow edge is public within the app |
| `userbook` | read | `userbook.user_id == current_user.id` → 404 on `/userbooks/{id}` and `/notes/userbook/{id}`; private-profile gate on `/userbooks/user/{id}` |
| `book` | read | none |
| `note` | read | `is_public == True` on every public list; author's `is_private_profile == False` on `/notes/feed` (**INNER join, never LEFT**) |
| `like`, `comment` | read (counts) | scoped to an already-authorised note set; `liked_by_me` scoped to the viewer |
| `reading_activity` | read (aggregates) | subject's own rows, or a circle's active members' |
| `reading_group` | read | `is_private` + active membership → 403 |
| `group_member` | read | membership drives both the gate and the member list — the gate must be evaluated before any group field is serialised |
| `group_post`, `group_activity` | read | via the circle gate |
| `notificationlog` | read (count) | `user_id == current_user.id` |

**No table is written by any endpoint in this sprint** except `user.last_active` /
`user.timezone`, which move from inside the request to just after it (R-01).

## Notifications Fired

| event_type | recipients | extra keys |
|---|---|---|
| none | — | — |

## Cross-Client Impact

None. No web file, no mobile file, no `app.json`, no EAS build, no `dependency-map.md` contract
change. `scripts/gen_dependency_map.py` is still run at the end of the sprint to confirm the
generated appendix is unchanged — an unexpected diff means a route signature moved.

---

## Call sites

Line numbers are on `sprint-4c-local-day @ f6219fd`.

### P1 — request plumbing

| File:line | Today | After |
|---|---|---|
| `app/deps.py:79-92` | `db.add(user); db.commit()` inside the request when the zone changed or the local day rolled over. Costs an `UPDATE`, a second pool checkout (→ a second `pool_pre_ping`), and an identity-map expiry that makes a later `db.get(User, id)` re-query | The in-memory `user` is still updated so the rest of the request sees the new zone. The persist is handed to a `BackgroundTasks` task that opens its own `Session`, writes both fields and commits. Zero statements and zero extra checkouts in the request |
| `app/database.py:33` | `pool_pre_ping=True`, undocumented | Unchanged value, with the measured cost and the revisit condition in a comment (R-02) |
| `app/routers/profile_router.py:40,104,192`, `app/notifications/router.py:231,251` | `db.get(User, current_user.id)` — an identity-map hit in the steady state, a real query after 4C's commit | Identity-map hit always, once P1 lands. No code change needed at these sites; they are listed because P1 is what makes them free |

### P2 — profile, users, follows

| File:line | Today | After |
|---|---|---|
| `profile_router.py:45,47` | two `SELECT * FROM follow` row-fetches, used only for `len()` | one aggregate returning both counts |
| `profile_router.py:50,57` | `userbook` rows, then `book` rows by `id IN (…)` | one `userbook LEFT JOIN book`, selecting `status`, `current_page`, `book.total_pages` |
| `profile_router.py:212,217,223,224` | four `follow` queries: is-following, follows-you, follower count, following count | one statement over `follow` producing all four |
| `profile_router.py:204` | `db.get(User, user_id)` | unchanged — but the Follow flags above come back with it, so the private gate has what it needs before query 3 runs |
| `profile_router.py:124,125,127` (`PUT /profile/me`) | the same follow/userbook fetches as the GET | same merge. `PUT` is not in the budget table but shares the helper, and its response must stay identical (`TestProfileRegression`) |
| `users_router.py:53,71,83` | user search, then two `follow` lookups | one `user LEFT JOIN follow (mine→them) LEFT JOIN follow (them→mine)` |
| `users_router.py:120,131,137` | follows, then users, then mutual | one `follow JOIN user LEFT JOIN follow` |
| `users_router.py:191,197` | user, then a conditional Follow check | one statement: the user row plus an `is_following` flag, always |
| `users_router.py:207` + **`240-241`** | all userbooks, then `userbook.book` **lazy-loaded once per finished book** | one `userbook LEFT JOIN book`. This is R-05's second N+1 |

### P3 — notes, likes, comments

| File:line | Today | After |
|---|---|---|
| `crud.py:134-146` `get_notes_feed` | `note JOIN user` (INNER, the privacy filter), returning `Note` only | same INNER join, plus `LEFT JOIN userbook LEFT JOIN book`, returning the four entities. **The `user` join stays INNER** |
| `notes_router.py:33-42` `_note_relations` | three statements: authors, userbooks, books | deleted for the list routes; each route's own query carries the joins. Keep the helper only if a caller still needs it |
| `notes_router.py:272,280,290` (`/feed`) | like counts, comment counts, my-likes — three statements | one `UNION ALL`: `('like', note_id, count(*), sum(case when user_id=:me then 1 else 0 end))` over `like`, and `('comment', note_id, count(*), 0)` over `comment`. One shared helper, `note_engagement(db, note_ids, viewer_id)` |
| `notes_router.py:345,349,353` (`/me`) | same three | same helper |
| `notes_router.py:423,427,433` (`/user/{id}`) | same three | same helper |
| `notes_router.py:562,570,578` (`/friends-feed`) | same three | same helper |
| `notes_router.py:404,406` | target user, then a conditional Follow check | one statement: user row + `is_following` flag |
| `notes_router.py:523,534` (`/friends-feed`) | following ids, then mutual ids | one statement over `follow` returning `followed_id` and a mutual flag |
| `notes_router.py:480` + `_note_relations` (`/userbook/{id}`) | the gate fetches the `UserBook` (`crud.get_userbook`), then `_note_relations` fetches **the same row again** plus its book | the gate's query becomes `userbook LEFT JOIN book` and its result is reused; the notes query joins `user` |
| `likes_comments.py` `/notes/{id}/comments` | note, comments, then users by `id IN (…)` | note (the visibility gate), then `comment JOIN user` |

### P4 — library, books, reading activity

| File:line | Today | After |
|---|---|---|
| `userbooks_router.py:313,320` | userbooks, then books | one `LEFT JOIN` |
| `userbooks_router.py:359,362` | `db.get(UserBook)`, `db.get(Book)` | one `LEFT JOIN`; the `user_id == current_user.id` → 404 gate is evaluated on the joined row |
| `userbooks_router.py:490,496,503,512` | user, conditional Follow, userbooks, books | user + `is_following` flag (one), `userbook LEFT JOIN book` (one) |
| `userbooks_router.py:553,564,576,590,591` | following, mutual, userbooks, users, books | follow-with-mutual-flag (one), `userbook JOIN user JOIN book` (one) |
| `books_router.py:239` **and `296`** | **the caller's library is selected twice, with the identical statement** | fetched once, as `userbook LEFT JOIN book` — which also supplies `my_authors`, removing `:298` |
| `books_router.py:245` | `following_ids` | becomes a subquery inside the friends query; the `if following_ids:` guards become empty result sets |
| `books_router.py:258,265,267` and `277,285,287` | two friend queries, each followed by a book batch and a user batch — six statements | one `UNION ALL` of the two limited branches, each joined to `book` and `user`. Postgres needs each `LIMIT 30` branch parenthesised as its own subquery; SQLAlchemy's `union_all(q1.subquery(), …)` does this. **If this proves awkward, keeping the two branches separate gives 5 queries, which the budget of 5 allows** |
| `books_router.py:306` | author affinity | unchanged |
| `reading_activity_router.py:86,109` | userbooks, then books | one `LEFT JOIN` |
| `reading_activity_router.py:43` | every activity row, summed in Python | `GROUP BY` the day label, summing `pages_read` (payload only) |
| `reading_activity_router.py:119` | every activity row with `pages_read > 0` | unchanged — the streak logic needs `date` and `local_day` per row, and the row count is already bounded by the reader's history. Select only those three columns |
| `reading_activity_router.py:234,240` | user, then a conditional Follow check | user + `is_following` flag, always |

### P5 — circles

The repeated pattern is `_group_or_404` + a conditional `_is_member`, on seven endpoints.

| File:line | Today | After |
|---|---|---|
| `groups_router.py:21-28` `_is_member`, `42-46` `_group_or_404` | two statements whenever the circle is private | one helper, `group_context(db, group_id, user_id) -> (group, my_membership)`: `reading_group LEFT JOIN group_member ON group_id AND user_id`. One statement, both facts. The 403 is raised from it, before any group field is read |
| `groups_router.py:34-40` `_member_count`, `49-56` (`_goal_pages_read`'s member list), `594`, `624`, `917` | four separate reads of `group_member` for the same circle, in different handlers | inside one handler, one read of the circle's `group_member` rows serves the gate, the count and the member list |
| `groups_router.py:71-95` `_serialize_group` | `_is_member` + `db.get(Book)` + `db.get(User)` + `_member_count` = four statements | the book and creator come from `group_context`'s joins; the count comes from the handler's single `group_member` read |
| `groups_router.py:301` | **`count(*)` per pending circle inside a list comprehension** | one `GROUP BY`. R-05's first N+1 |
| `groups_router.py:224,234,238,240,241` (`/my`) | memberships, groups, books, creators, counts | `group_member JOIN reading_group LEFT JOIN book LEFT JOIN user` (one), counts `GROUP BY` (one) |
| `groups_router.py:319,327,352,354,355,363` (`/discover`) | groups, my active memberships, books, creators, counts, my other memberships | public groups `LEFT JOIN book LEFT JOIN creator` with `NOT EXISTS (active membership)` (one); one `group_member GROUP BY group_id` returning both the active count and the caller's own status/role via `max(case when user_id = :me then … end)` (one) |
| `groups_router.py:147,159,163,167,169,172` (`/invites/pending`) | membership, groups, inviters, books, creators, counts | one join for the first five, one `GROUP BY` for the counts |
| `groups_router.py:594,603` (`/members`) | members, then users | `group_member JOIN user` |
| `groups_router.py:624,634` (`/pending`) | pending, then users | `group_member JOIN user`; the curator gate comes from `group_context` |
| `groups_router.py:815,824,826,828` (`/posts`) | posts, users, userbooks, books | one `group_post JOIN user LEFT JOIN userbook LEFT JOIN book` |
| `groups_router.py:1108,1119` (`/activity`) | events, then users | `group_activity JOIN user` |
| `groups_router.py:917,934,944,955` (`/leaderboard`) | members, users, finished counts, pages sums | `group_member JOIN user` (one), then the finished-count and the pages-sum as one `UNION ALL` keyed by `user_id` |
| `groups_router.py:960,977` (`/leaderboard`, current book) | reading userbooks, then books | one `userbook JOIN book`; the "most recently updated per user" pick stays in Python, as today |
| `groups_router.py:48-68` `_goal_pages_read` | member list, then the sum | the member list becomes a subquery inside the sum. **The month window stays UTC** — 4C decision E-3 |

### P6 — notifications and admin

| File:line | Today | After |
|---|---|---|
| `notifications/router.py:130` | every unread row fetched, `len()`-ed — the `data` JSON column included | `select(func.count(...))`. Still 2 statements; far less data, on a call every signed-in page makes and polls |
| `admin_router.py:76-170` `/stats` | **fourteen** scalar aggregates, three of them wrapped in bare `except:` | one statement of fourteen scalar subqueries. The `try/except` around `journal`/`like`/`comment` becomes one `try` around the combined statement, falling back to the current fourteen-query path — so a missing table still yields zeros rather than a 500 |
| `admin_router.py` `/users` | users, then three aggregates | users (one), then the userbook count and both follow counts as one `UNION ALL` (one) |
| `admin_router.py` `/books` | books, an aggregate, userbook rows, users | books (one), `userbook JOIN user` supplying both the counts and `added_by_users` (one) |
| `admin_router.py` `/follows` | follows, then users | `follow JOIN user AS follower JOIN user AS followed` |
| `admin_router.py` `/content/notes` | notes, users, like counts, comment counts | `note JOIN user` (one), `note_engagement` (one) — the same P3 helper |
| `admin_router.py` `/content/comments` | comments, then users | `comment JOIN user` |

---

## The two per-request costs

### `pool_pre_ping=True` — **recommendation: keep**

**Measured.** Server total minus DB time is 170–200 ms on every endpoint, including `/version`,
which runs zero queries and spends 1 ms in application code. That gap is one `SELECT 1` on
connection checkout, priced at the same cross-Pacific round trip as everything else.

**Why keep it:**

1. It is one round trip *per request*, not per query. After 4E, `/notes/feed` runs 3 queries;
   the ping is then a quarter of that endpoint's DB time, not a tenth — but the absolute number
   does not move, and it never scales with page weight.
2. Supabase closes idle connections. `pool_recycle=300` discards connections by **age**, not by
   idle time, so a 299-second-old connection that has been idle for 299 seconds is handed out
   without recycling. Pre-ping is what catches it. Without it the reader gets a 500 instead of a
   slow page — a worse failure than the one we are fixing.
3. `qa/research/web-performance-2026-09.md` §4 recommends it, paired with a `pool_recycle`
   below the server's idle timeout, which is what we have.
4. Its cost is a region artefact. Co-located, the same ping costs 1–2 ms. Removing it now to
   claw back 175 ms would buy a fragility that outlives the problem.

**What I am not recommending, and why.** An "idle-aware" pre-ping (ping only if this connection
has been unused for more than N seconds) is implementable with a `checkout` event listener and
a timestamp in `connection_record.info`. It would cut the ping on busy connections. It is
custom pool code guarding a failure mode that only shows up in production, under a load we
cannot reproduce, and it would take a dropped-connection incident to prove wrong. Not worth it
for 175 ms that a region move deletes anyway.

**R-02 asks only for the reasoning to be written into `app/database.py`,** so the next person
measuring a 175 ms gap finds the answer instead of re-deriving it. Revisit condition, stated in
that comment: *if the API and the database are ever co-located, re-measure; if the ping is then
under 5 ms, this decision needs no further thought.*

### The once-a-day `last_active` touch — **recommendation: move it after the response**

**Measured, on `GET /profile/me` with the same reader:**

| | statements | pool checkouts |
|---|---:|---:|
| first request of the reader's local day | 6 | 2 |
| any later request that day | 4 | 1 |

Three extra round trips, not one:

1. the `UPDATE user SET last_active = …`
2. the commit releases the connection, so the route's next query checks out again — **a second
   `pool_pre_ping`**
3. the commit expires the identity map, so `profile_router.py:40`'s `db.get(User, id)` — free on
   every other request of the day — becomes a real `SELECT`

At production prices that is roughly 200 + 175 + 200 = **~575 ms**, charged to whichever request
happens to arrive first. On the web that is usually `/profile/me` or `/notifications/unread-count`,
both of which sit on the serial stage of every page. It is also a race: several parallel
first-of-day requests can each see a stale `last_active` and each issue the `UPDATE`.

**Recommendation.** Keep the once-per-local-day semantics exactly as 4C defined them, but persist
after the response:

- `get_current_user` still computes the zone and the local-day comparison, and still mutates the
  in-memory `user` object, so the rest of the request sees the new `timezone` — 4C's
  `test_header_persisted_before_last_active_compared` depends on that ordering and keeps passing
- when something changed, it adds a `BackgroundTasks` task. FastAPI dependencies may declare
  `background_tasks: BackgroundTasks`, so this needs no route signature change
- on FastAPI 0.136, `yield`-dependency teardown runs **before** background tasks, so the task
  must open its **own** `Session`, re-read the user by id, apply the two fields and commit. It
  must be written to be safe if the row has since changed: write `timezone` unconditionally and
  `last_active` only if it is still behind the computed local day
- the reader's request pays nothing: zero statements, one checkout

**What the PM should know.** `last_active` becomes "a few milliseconds after the first request"
rather than "during it". Its two consumers do not care: the inactivity reminder checks
"active today" in a two-hour evening window (`scheduler.py:46`), and the admin user list shows
it as a display field (`admin_router.py:218`). Login still sets it inline and unconditionally
(`auth_router.py:90,158`), unchanged.

**The rejected alternative:** dropping the daily touch entirely and relying on login. That would
break the reminder for anyone who stays signed in for weeks — which is most readers — and is a
product change, not a performance fix.

---

## The query-budget guard

**New file: `tests/test_query_budget.py`.** One table, one parametrised test, one N+1 test.

```python
# endpoint, budget, the count it had before Sprint 4E (for the failure message)
BUDGETS = [
    ("GET /version",                    0, 0),
    ("GET /profile/me",                 4, 5),
    ("GET /notes/feed",                 4, 8),
    ...                                        # every row of the table above
]
```

**The failure message names the endpoint and both numbers**, as R-06 requires:

```
GET /notes/feed ran 6 queries, budget 4 (was 8 before Sprint 4E).
A new query was added to this endpoint, or a batched load became per-row.
Statements:
  1. SELECT user … WHERE user.email = ?
  2. SELECT note … JOIN user …
  ...
```

Printing the statements is what makes the failure actionable; the counter already has them.

**Mechanics.**

- The counter is `tests/conftest.py`'s existing `stmt_counter` pattern, extended to record the
  normalised statement text as well as the count. It resolves the engine through
  `tests.conftest` for the double-import reason its docstring already explains.
- Every case **primes** the request once before counting, so the once-a-day `last_active` write
  is not counted — exactly as `_queries_for` in `tests/test_notes.py` already does. After P1 the
  priming becomes unnecessary; it is kept, because a guard that depends on P1 being correct
  cannot also be the thing that catches P1 regressing. A separate test asserts the primed and
  unprimed counts are now equal (that is R-01's test).
- The seed is a module-scoped fixture that builds one realistic account: 12 users, 30 books,
  8 userbooks each, 2 notes per userbook, follows in both directions, likes and comments,
  notification rows, reading activity, three circles with active members, pending self-join
  rows, and pending invites. Every conditional branch has data, so no endpoint is measured on
  an empty early-return by accident.
- Branches are separate rows: `/groups/{id}` is measured on a public **and** a private circle,
  `/profile/{id}` on a public **and** a private profile, `/groups/{id}/pending` as a curator.
  The budget is the worst of the two.

**The N+1 test** is what stops the whole class of regression rather than one instance:

```python
def test_list_endpoints_do_not_grow_with_row_count(...):
    # for each list endpoint: count with 5 rows, add 45 more, count again
    assert n_small == n_large
```

This is the test that would have caught `/groups/my/pending` and `/users/{id}/stats` in 4A. Both
are in its list from day one.

**Empty-state rows.** `/notes/feed`, `/notes/friends-feed`, `/groups/my`, `/groups/discover` and
`/users/following` early-return on an empty result. Each gets a row asserting the empty account
costs 1–2 queries, so a merge that removes the guard and runs the big statement anyway is caught.

**House rule — the one-line product change that turns each test red.** Every budget row and every
N+1 row is Major. The line is the same for all of them and is stated once at the top of the file:
*adding one `db.exec(...)` or `db.get(...)` to the handler, or restoring a per-row
`ub.book` / `n.user` relationship access inside a loop, turns this file red.* The empty-state
rows have their own: *deleting the `if not rows: return []` guard turns them red.*

This file does **not** assert response content. R-00's protection is the existing regression
suite; duplicating it here would make the guard noisy and tempting to relax.

---

## Security review

Merging permission checks into joins is the only way this sprint can hurt anyone. Each merge
below names the check, how it survives, and the existing test that must go red if it does not.

| Merge | The check | How it survives | Test that must go red |
|---|---|---|---|
| `/notes/feed` note query gains `userbook`/`book` joins | author must not be a private profile; note must be `is_public` | the `user` join **stays INNER** with `is_private_profile == False`; only `userbook` and `book` are LEFT-joined. A LEFT join on `user` would emit every private author's public notes into the community feed | `test_notes.py :: TestFeed :: test_private_notes_excluded_from_community_feed`, `test_private_note_absent_from_every_public_list` |
| `/notes/user/{id}`, `/userbooks/user/{id}`, `/users/{id}/stats`, `/reading-activity/user/{id}/daily`, `/profile/{id}`: the Follow check folds into the user fetch | private profile + not following → 403 (locked view on `/profile/{id}`) | the flag is computed in the same statement and the 403 is raised from the same `if`. The check now runs for public profiles too — strictly more checking, no behaviour change | `test_notes.py :: test_user_notes_private_profile_still_403`, `test_follow_profile.py :: test_private_profile_locked_for_non_followers` / `test_private_profile_visible_to_follower`, `test_reading_activity.py :: TestPublicUserDaily :: test_private_profile_blocked_for_non_follower` / `test_private_profile_visible_to_follower` |
| `group_context()` replaces `_group_or_404` + `_is_member` on seven endpoints | private circle + not an active member → 403 | the helper returns `(group, my_membership)` and the handler raises before serialising any group field. `require_active` semantics are preserved as an argument, because `_serialize_group` deliberately wants pending memberships too | `test_groups.py :: test_private_group_goal_fields_still_403_for_non_member` |
| `/groups/{id}/pending` curator gate from `group_context` | curator only | the gate is `membership is not None and membership.status == "active" and membership.role == "curator"` — all three, as `_is_curator` does today via `_is_member`'s default `require_active=True` | `test_groups.py :: test_pending_requests_only_visible_to_curator` |
| `/notes/userbook/{id}` reuses the gate's `userbook` row | `ub.user_id == current_user.id` → 404 | the gate query becomes `userbook LEFT JOIN book`; the ownership comparison is unchanged and still runs before the notes query | `test_notes.py :: test_private_note_still_visible_to_owner_via_userbook` plus the existing 404 case in `TestNotesCRUD` |
| `/notes/{id}/comments` comment + user join | a private note, or a private author's note, is 404/403 for a stranger | the note visibility gate is a separate statement and runs first. Only the comment fetch is merged | `test_notes.py :: test_get_comments_private_note_404`, `test_comment_private_profile_non_follower_403` |
| engagement `UNION ALL` over `like` and `comment` | `liked_by_me` is the viewer's own like | the viewer id is a bound parameter inside the `sum(case when user_id = :me …)`. The note id set comes from the already-authorised page of notes, so the aggregate cannot reach a note the caller could not see | `test_notes.py :: TestMyNotesLikeState`, `test_my_notes_sets_both_like_keys_consistently` |
| `/books/recommendations` friends query takes `following_ids` as a subquery | recommendations come only from people you follow | the subquery is `follow.followed_id WHERE follower_id = :me` — the same set, evaluated in the database | `test_books.py :: TestRecommendations` |
| `/admin/*` aggregate merges | admin only | `get_admin_user` is untouched on every admin route | `test_admin.py :: TestAdminAccess` |

**Two rules that apply to every merge and are not tied to one endpoint:**

1. **A join widens the row, not the response.** Joining `user` puts `email`, `password_hash`,
   `notification_prefs` and `deletion_reason` one attribute access away. Response dicts are
   built field by field. Nothing is constructed from `dict(row)`, `row._mapping`, `**row`, or a
   raw SQLModel instance. `test_follow_profile.py :: TestProfileMeNoPII` is the canary and must
   stay green; `CLAUDE.md`'s "never return a raw SQLModel" rule is the standing version of this.
2. **No endpoint gains or loses an auth dependency.** A diff of the `Depends(...)` list on every
   route in `app/routers/` and `app/notifications/router.py` must be empty at the end of the
   sprint. `python scripts/gen_dependency_map.py` flags routes with no auth with a ⚠️; the
   generated appendix must show no new ⚠️.

**Can an unauthenticated caller reach anything new?** No. No route's auth level changes, and the
only route using `get_current_user_optional` (`GET /notes/feed`) keeps it, with the same
`is_public` + `is_private_profile` filter and the same behaviour when `current_user` is `None`
(`liked_by_me` false for everything, and no my-likes branch).

**Can a non-admin reach admin data?** No. The admin merges are inside handlers already behind
`get_admin_user`.

---

## Test strategy

Four layers. The first three exist; only the fourth is new.

**1. The response-shape wall (must stay green, unedited).** These are the tests that make R-00
enforceable rather than aspirational. Sprint 4A added most of them; 4C extended two deliberately.

| File | Class | Pins |
|---|---|---|
| `tests/test_follow_profile.py` | `TestProfileRegression`, `TestProfileMeNoPII` | `/profile/me` and `/profile/{id}` key sets, nested `stats` keys, and the absence of PII |
| `tests/test_books.py` | `TestUserbookRegression`, `TestRecommendations`, `TestFriendsReading`, `TestCatalogList` | the flat userbook shape and its nested `book` keys; recommendation and friends-reading item keys |
| `tests/test_notes.py` | `TestNoteShapeRegression`, `TestFeed`, `TestMyNotesLikeState`, `TestFriendsFeedOrder` | note-card top-level keys, both like keys, `updated_at`, book dedup keys, and friends-feed ordering (mutuals first, stable within group) |
| `tests/test_groups.py` | `TestGroupsRegression`, `TestGroupLeaderboard` | the 16-key circle shape, the 7-key `current_book`, the goal endpoint's four keys, `invited_by_name` |
| `tests/test_reading_activity.py` | `TestDailyStats`, `TestInsights`, `TestInsightsMonthBuckets`, `TestInsightsStreak`, `TestPublicUserDaily` | insights keys including the Android ≤ 2.2.1 aliases, `monthly_pages` shape, streak and month-bucket values |
| `tests/test_admin.py` | `TestAdminRegression` | `STATS_KEYS`, `USER_KEYS`, `BOOK_KEYS`, `FOLLOW_KEYS`, `NOTE_KEYS`, `COMMENT_KEYS` |
| `tests/test_notifications_api.py` | `TestPrefsRegression` | notification prefs shape |
| `tests/test_googlebooks.py` | `TestSearchRegression` | search item keys |
| `tests/test_local_day.py` | all of it, in particular `TestLastActive`, `TestZoneHeader`, `TestTravel`, `TestCutoverBridge`, `TestSchemaGuard` | R-07 — everything 4C built |
| `tests/test_server_timing.py` | all | the header still reports the real count, and still leaks no SQL |
| `tests/test_dependencies.py` | all | `get_session is get_db`, so one session and one checkout per request |

**If a package needs one of these edited to pass, the package is wrong.** That is the rule; there
is no exception in this sprint.

**2. The privacy wall (must stay green).** Named per merge in the security review above.

**3. Value tests.** `/admin/stats` merging fourteen aggregates into one statement is the change
most likely to be silently wrong (a mis-aliased subquery returns the wrong table's count and
every key is still present). P6 adds a test that seeds a known number of users, books,
userbooks per status, notes, follows, likes, comments and push-subscribed users, and asserts
all fourteen values, not just the key set. The same applies to `/users/{id}/stats`,
`/groups/{id}/leaderboard` (per-member `books_finished` and `pages_read`) and
`/groups/{id}/goal` (`pages_read`, `pct`).

*The one-line product change that turns these red:* swapping any two scalar subqueries in the
combined `/admin/stats` statement, or dropping the `status` filter from one of them.

**4. The budget guard (new).** `tests/test_query_budget.py`, designed above.

**A note on why layer 3 exists at all.** The house rule since 2026-09-18 came from five tests
that passed while the product was broken. Key-set tests are exactly that kind of test: they pass
whatever the values are. A sprint that rewrites fourteen aggregates into one statement must
assert the numbers, or it is trusting the most fragile change in the sprint to the weakest tests
in the suite.

**Running it.** `pytest tests -q` from the repo root with `.venv` active. `pytest` is not
installed in the checked-in `venv` at the time of writing — the builder installs it, and
`tzdata` (4C pinned it in `requirements.txt`; it must actually be installed or `app.localday`
refuses to import).

---

## Work packages

Seven. P1–P6 have **disjoint file sets** and can run in parallel. P7 lands last, because its
budgets are the post-fix counts.

| # | Package | Files (exclusive) | Endpoints | Removes |
|---|---|---|---|---|
| **P1** | Request plumbing | `app/deps.py`, `app/database.py` | all authenticated | R-01, R-02. Three round trips off the first request of every reader's local day |
| **P2** | Profile, users, follows | `app/routers/profile_router.py`, `app/routers/users_router.py` | 2, 3, 22, 23, 24 | 13 queries + the `/users/{id}/stats` N+1 |
| **P3** | Notes, likes, comments | `app/routers/notes_router.py`, `app/routers/likes_comments.py`, `app/crud.py` | 8–13 | 25 queries |
| **P4** | Library, books, activity | `app/routers/userbooks_router.py`, `app/routers/books_router.py`, `app/routers/reading_activity_router.py` | 4–7, 14, 26, 27 | 15 queries |
| **P5** | Circles | `app/routers/groups_router.py` | 28–38 | 23 queries + the `/groups/my/pending` N+1 |
| **P6** | Notifications, admin | `app/notifications/router.py`, `app/routers/admin_router.py` | 17, 39–44 | 21 queries |
| **P7** | The guard | `tests/test_query_budget.py` (new), `tests/conftest.py` | — | R-06 |

**Shared code, and who owns it.** Three helpers are used by more than one package. Each is owned
by exactly one package and the others consume it:

- `note_engagement(db, note_ids, viewer_id)` — **owned by P3**, in `app/routers/notes_router.py`.
  P6 imports it for `/admin/content/notes`. P6 waits for P3 to land, or ships its own two-query
  version and switches after. *Recommendation: P6 ships second and imports it.*
- `group_context(db, group_id, user_id, require_active=True)` — **owned by P5**, used only by P5.
- the "user row plus an `is_following` flag" query — appears in P2 (`profile_router`,
  `users_router`), P3 (`notes_router:404`) and P4 (`userbooks_router:490`,
  `reading_activity_router:234`). Rather than a shared module that three packages edit, **each
  package writes its own**, four lines each. Three copies of a four-line query are cheaper than
  three packages contending over one file. If it later wants a home, `app/crud.py` is it (P3
  owns `crud.py` this sprint).

**Sequencing.** P1 first — it changes what "a request's query count" means, and P7's budgets
assume it. Then P2–P6 in parallel. P7 last. If the PM wants a single small change to land and be
measured on its own first, **P6 is the one**: `/admin/stats` 15 → 2 is the largest single-endpoint
drop in the sprint, it is admin-only, and it cannot affect a reader.

**Build-note discipline.** Each package records its measured post-fix counts in its build notes,
using the harness pattern described above. P7 takes its budgets from those numbers, not from
this document's "after" column — if a package lands at a different number, the number in the
build notes is the truth and the discrepancy is explained there.

---

## Escalations

### E-1 — The per-request user lookup. *Recommendation: leave it.*

Every authenticated request spends one ~200 ms query in `get_current_user` turning the bearer
token into a `User` row. Across the 40-odd endpoints in the table that is the single largest
remaining line item: on a page making 7 calls, it is 7 queries, ~1.4 s of database time.

Three ways out, all with a cost:

1. **Put `uid` in the token and skip the lookup** where the route only needs `current_user.id`.
   Then a deleted or deactivated account keeps working until its token expires — and tokens last
   30 days (`auth.py:17`). It also loses `is_admin`, `is_private_profile` and `timezone`, which
   the routes and 4C need.
2. **Cache the user row in-process** for N seconds, keyed by id. A revoked admin flag or a
   flipped privacy setting stays stale for N seconds, in a service that can run more than one
   instance, and privacy flags are exactly what this app's invariant rests on.
3. **Leave it.** One query, on an indexed column (`ix_user_email`, `user.id` primary key), that
   is simultaneously the authentication check, the account-still-exists check, the admin check
   and 4C's zone source.

**Recommendation: leave it in 4E.** It is the only query in the API that is a security control on
every request, and it is the one whose removal needs a token-revocation story first. It is worth
revisiting — after a region move, when the prize is 60 ms rather than 200 ms and the appetite for
an auth change is lower, or alongside a shorter token lifetime. Either way it is a PM decision,
not a code change, and it should not ride along inside a sprint whose promise is "nothing
changes".

### E-2 — Where the `last_active` write goes. *Recommendation: after the response.*

Set out in full above. The PM is being asked to accept that `last_active` is written a few
milliseconds after the request instead of during it, in exchange for ~575 ms off whichever
request a reader makes first each day. Neither consumer — the 20:00–22:00 reminder window and
the admin list — can tell the difference. **Recommendation: approve as R-01.**

*If the PM says no:* the fallback keeps the write inline but removes only the third cost, by
having `profile_router.py:40` and `notifications/router.py:231,251` use the already-loaded
`current_user` instead of re-fetching. That saves ~200 ms of the ~575 ms and needs no decision.

### E-3 — `pool_pre_ping`. *Recommendation: keep, and write down why.*

Set out in full above. **Recommendation: keep, with the comment R-02 asks for.** Revisit only
after co-location, and only if the re-measured ping is not already negligible.

### E-4 — Indexes production may not have. *Recommendation: one read-only query, then decide separately.*

`app/models.py` declares `index=True` on `group_member.group_id`, `group_member.user_id`,
`group_post.group_id`, `notificationlog.user_id`, `note.is_public`, `note.created_at` and
`userbook.status`. Those declarations only become indexes through
`SQLModel.metadata.create_all`, which production does not run — `create_tables.sql` and
`context/supabase_migration.sql` own the production schema, and **neither creates any of them.**
The circle tables and `notificationlog` were added to production by
`CREATE TABLE IF NOT EXISTS` in the migration, with no index statements at all.

This matters for 4E because merging queries makes each remaining one do more work: P5's single
`group_member` read per handler replaces three narrower ones, and a sequential scan of
`group_member` is cheap today and less cheap later.

**This sprint creates no index.** The constraint is explicit and I am not bundling one.

What I am asking for is one read-only query in the Supabase SQL editor:

```sql
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname = current_schema()
  AND tablename IN ('group_member','group_post','group_activity','notificationlog','note','userbook')
ORDER BY tablename, indexname;
```

If the expected names are missing, that is a separate PM step with its own SQL and its own
rollback, sized against the live row counts. `Server-Timing` is the confirmation instrument:
a missing index shows up as one query far above the ~200 ms baseline rather than at it.

### E-5 — The 60-second `/notifications/unread-count` poll. *Recommendation: hand to 4D.*

`Nav.jsx:25` calls it on mount and every 60 s thereafter, on every signed-in page, per open tab.
It costs 2 queries plus a pre-ping ≈ 575 ms each time, and 4E cannot take it below 2: one is
authentication, one is the count. The lever is the poll interval, not the endpoint — refresh on
window focus, or a longer interval. That is a web change and a small product decision (how
stale may the bell badge be?). **Recommendation: hand the question to Sprint 4D.**

### E-6 — `/profile/me` fetched twice on `/profile` and `/settings`. *Recommendation: hand to 4D.*

`AuthContext.jsx:51` fetches it on app boot; `ProfilePage.jsx:460` and `SettingsPage.jsx:157`
fetch it again on mount. `api.js`'s 60-second cache serves the second call from memory but still
issues a background revalidation (`api.js:34`), so it is two HTTP requests and two sets of
queries either way. After 4E that is 3 wasted queries per visit rather than 5. **Recommendation:
hand to Sprint 4D**, which already owns the waterfall.

---

## Assumptions

- **A-1.** The Server-Timing counts measured on production on 2026-09-20 and the local harness
  counts describe the same code. They match on all six endpoints the PM measured. *If wrong:*
  production runs a different commit and the "now" column is stale — re-measure with `curl -sI`
  before starting.
- **A-2.** FastAPI 0.136 runs `BackgroundTasks` after `yield`-dependency teardown, so R-01's task
  must open its own session. *If wrong* (an older ordering, where teardown runs after): the task
  could reuse the request session and R-01 gets simpler, not harder. The builder verifies this
  with a one-line test before writing the task.
- **A-3.** `PUT /profile/me` and the other write endpoints are not in the budget table, but they
  share helpers with the reads. *If wrong* — if a merge changes a write's response — R-00's
  regression tests catch it, which is why they are named rather than summarised.
- **A-4.** SQLite and PostgreSQL both accept every merged statement. `sum(case when … end)` is
  used instead of `FILTER`, and each `UNION ALL` branch that carries a `LIMIT` is parenthesised.
  *If wrong for one statement:* that endpoint keeps its two queries and its budget's margin
  absorbs it — which is what the margin is for.
- **A-5.** The `except:` blocks around `journal`, `like` and `comment` counts in `/admin/stats`
  guard against a table that does not exist in some environment. They are preserved as a
  fallback rather than removed. *If wrong* (they are vestigial), the fallback is dead code and
  costs nothing.
- **A-6.** No reader depends on the *order* of keys in a JSON object. Python dicts preserve
  insertion order and the builder preserves the existing construction order anyway; list order
  is asserted separately by the regression tests (friends-feed mutual-first, userbooks by
  `updated_at`, leaderboard by pages then books).

---

## Deploy notes

- **Merge order: 4C, then 4D, then 4E.** 4C is already 4E's base and is code-complete, waiting
  on the PM running `context/supabase_migration.sql` STEP 1. 4D is in build and touches only the
  web client, but its before/after timings were captured against today's API, so it merges first
  and 4E's effect is measured on top of it.
- **No SQL to run for 4E.** No migration, no index, no `schema_guard.REQUIRED_COLUMNS` entry.
  4C's SQL is still a prerequisite, for 4C's reasons.
- **Nothing to deploy beyond the API.** No web build, no EAS build, no `app.json` bump.
- **Rollback is `git revert` of the package.** Each package is a self-contained revert with no
  schema or data to undo. That is the reason for six disjoint file sets rather than one branch.
- **Verify on production after deploy**, in this order:
  1. `curl -sI https://book-tracker-stitch.onrender.com/version` — service is awake, commit is right
  2. `curl -sI …/notes/feed -H "Authorization: Bearer …"` and read `Server-Timing` — expect
     `desc="3 queries"` or fewer
  3. the same for `/profile/me` (≤ 3), `/groups/{id}` (≤ 4), `/admin/stats` (≤ 2)
  4. re-run the page-perf capture and compare `ready` on `/home` and `/groups/7` against
     `qa/reports/page-perf-2026-09-19.json`
- **If a count is higher on production than in the harness,** the likely cause is the once-a-day
  `last_active` write on the first sampled request. Sample twice and read the second.
- **Then run** `python scripts/gen_dependency_map.py` and confirm the generated appendix has no
  new ⚠️ and no endpoint has gained or lost a consumer.
