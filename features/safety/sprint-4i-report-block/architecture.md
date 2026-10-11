---
screen: sprint-4i-report-block
feature: safety
status: draft — eight escalations open; E-1, E-2, E-3 and E-5 block the build
last_verified: 2026-10-11
architect_verified: 2026-10-11 — every file:line in this document was opened on branch
  `sprint-4i-report-block` (base master @ `1162479`, deployed). Line numbers are from that commit.
  The client line numbers were re-verified by grep in this repository after they were first gathered,
  so none of them is copied from another document. Where a number in an earlier sprint's document has
  since moved, this document says so in place (see §"Citations that have drifted").
depends_on: nothing outside this repo. **Two PM SQL steps (10 and 11) gate the two deploys.** Sprint
  4H's step 9 is still outstanding and is unrelated; the numbering here appends to it and does not
  wait for it.
---

## Risk summary (for the PM)

| Risk | Where it bites | What this design does |
|---|---|---|
| **A block that leaks on one path.** The reader believes they are protected and behaves as if they are — posts freely, stops being careful — while the person they blocked still sees everything. A partial block is worse than no block, because no block at least tells the truth. | Fourteen serving paths | R-22 is an enumeration built by reading every router on this branch, with a per-path test and a per-path mutation, plus a route-coverage test so a *future* endpoint fails CI instead of silently leaking. |
| **A report that lands nowhere.** Guideline 1.2 says "with timely responses". A table nobody queries passes code review and fails App Review. | `POST /reports` | The row, an admin queue that carries enough to action without a second request, **and a push to the admin on every new report** through the existing dispatcher. The operational half — who answers, how fast — is **E-3** and belongs in `pm-decisions.md`, not in code. |
| **The query-budget guard fails on 24 of its 67 rows.** That is the guard working, and it is also the moment someone is tempted to widen a budget instead of measuring it. | `tests/test_query_budget.py` | Every moved number is re-measured on the branch in the same commit as the filter. `test_the_table_is_whole` already refuses a budget more than one above its expected count (`:824-830`), so padding fails too. `BQ-08e` lands exactly on a second guard's hard ceiling and that is written down. |
| **Blocking is destructive to the follow graph and it is not reversible.** | `POST /blocks/{id}` | Deliberate: deleting both `follow` rows makes the block true in six endpoints at once with no filter. The cost is that unblocking does not restore them, so the confirm copy has to say so **before** the tap (R-28). |
| **A circle both readers belong to has no right answer.** | `GET /groups/{id}/posts`, `/members`, `/leaderboard` | Proposed: hide content, leave structure. The residual — A still sees B in the Members list and the leaderboard — is stated rather than papered over, and the stronger alternative (co-membership becomes impossible) is **E-2**. |
| **A snapshot of a reader's words in a second table.** | `report.target_snapshot` | A privacy cost paid on purpose, so a resolved report is still a record. Capped, admin-only, deleted with the reporter's account. The alternative (a foreign key) makes the admin's own delete route fail. |
| **The per-post menu is owner-and-admin-only on both clients today.** A non-owner sees no menu at all. | `HomePage.jsx:184`, `FeedScreen.js:669` | Named as the largest client change in the sprint, not discovered during the build. |
| **Each client change is a store release.** No OTA channel exists. | Both app stores | **E-5**: two API sprints, one client release. |

---

## The filter, proved

This is the part of the design that could have been wrong, so it was executed against
`C:\Users\sonal\Documents\projects\book-tracker\.venv\Scripts\python.exe` on this branch rather than
recalled. Three throwaway SQLModel tables (`U`, `N`, `B`) on in-memory SQLite, a
`before_cursor_execute` listener counting statements, and two block rows in opposite directions
(`1 blocked 2`, `3 blocked 1`), asking "what is invisible to reader 1". `SQLAlchemy 1.4.41`.

| # | What was checked | Result |
|---|---|---|
| A | `union(select(B.blocked_id).where(B.blocker_id==1), select(B.blocker_id).where(B.blocked_id==1))` through SQLModel's `Session.exec()` | **One statement**, correct rows — but it returns `[(2,), (3,)]`, i.e. `Row` objects, **not scalars**. Feeding them straight to `notin_()` raises `sqlalchemy.exc.ProgrammingError: (sqlite3.ProgrammingError) Error binding parameter 1: type 'Row' is not supported`. **Hit for real during this check**, which is why it is written down |
| B | The same, flattened with `.scalars()` | Correct — `{2, 3}` — but it costs a **second** statement, because `Session.exec(q)` has already executed by the time `.scalars()` is reached |
| C | `select(B.blocker_id, B.blocked_id).where(or_(B.blocker_id==1, B.blocked_id==1))`, flattened in Python | **One statement**, `{2, 3}`. No union, no `Row` trap, both directions in one pass. **This is the shape R-23 specifies** |
| D | The feed query with `.notin_(list(hidden))` | **One statement.** `SELECT … WHERE n.is_public = 1 AND (n.user_id NOT IN (?, ?))`. The filter itself adds **nothing** |
| E | The empty-block-set case, `notin_([])` | **Safe.** Emits `NOT IN (SELECT 1 FROM (SELECT 1) WHERE 1!=1)`, returns every row, **no warning**. So the state all 131 readers are in on day one needs no special case |
| F | A correlated `exists()` with the two `or_` arms, i.e. **zero** extra statements | Works, correct rows. **Rejected** — see below |

**Why C+D and not F.** F is cheaper by one statement per request and was the tempting answer. It was
rejected for two reasons, and the second is the stronger:

1. The `NOT EXISTS` clause has to be written into each of the fourteen queries by hand. Each one is a
   place to transpose `blocker_id` and `blocked_id` in one of the two `or_` arms and ship a block that
   is silently one-directional — the exact failure R-20 exists to prevent, and the kind that passes a
   smoke test.
2. **F leaves every query budget unchanged.** With F, `tests/test_query_budget.py` cannot tell a
   filtered feed from an unfiltered one. With C+D, the +1 on each of 24 rows **is the evidence that
   the filter ran**, and removing a filter breaks the guard. The extra statement buys a test.

The helper is one module-level function, so the `or_` arms are written once and tested once.

### Where the helper is called, and where it must not be

- **After** an endpoint's early return, never before. Eight budget rows are `empty_state` rows
  (`tests/test_query_budget.py:945` selects them, `:946` asserts there are exactly 8) and
  `test_empty_accounts_keep_their_early_returns` carries a hard ceiling of **3 statements**
  (`:959-963`). Calling the helper above `if not following: return []`
  (`notes_router.py:598-599`) would push `BQ-09e`, `BQ-22e`, `BQ-23e`, `BQ-28e`, `BQ-29e`, `BQ-30e`
  and `BQ-31e` up by one for a response that is `[]`.
- **Once** per request. Never inside a loop, or `test_no_endpoint_scales_with_row_count`
  (`:880-936`) fails — which is that test working.

---

## Why the admin surface and not a new one

spec R-03 extends `app/routers/admin_router.py` and `AdminPage.jsx` rather than adding a moderation
surface. The argument, so it can be challenged:

- **The two actions a resolution needs already live there, behind the same dependency.**
  `DELETE /admin/content/note/{id}` (`admin_router.py:538-554`) and
  `DELETE /admin/content/comment/{id}` (`:557-568`) are exactly "delete the thing that was reported",
  and `admin_router.py:462-506` / `:509-535` already list recent notes and comments with the author's
  name and `is_bot` for moderation. A separate surface would have to call back into these two routes
  anyway, or duplicate them.
- **The auth is already there and is already narrow.** `get_admin_user` (`app/deps.py:172-185`) 403s a
  non-admin, and `_ALLOWED_ADMIN_EMAILS` (`admin_router.py:350`) means exactly one account can hold
  it. A second surface is a second place to get that wrong.
- **One place to look.** The PM reviewing reports is the same person who moderates content today, from
  the same page. Two queues is how the second one stops being opened.
- **The web page already has the shape.** `AdminPage.jsx:136` is a flat `TABS` array and `:151` already
  lazy-loads a tab's data on click; the Reports panel is one more entry and one more loader, and the
  per-row markup is a clone of the existing Posts rows.

**What would argue the other way:** if reports were ever triaged by someone who must *not* see the
whole user table (`GET /admin/users`, `admin_router.py:200-253`, which returns every reader's email),
a reports-only surface with its own role would be right. There is no such person today and inventing
the role is bigger than this sprint — which is E-6, not a reason to build two surfaces now.

---

## The block design

spec R-20 is the rule. This section is why it is shaped that way and where it breaks.

### Symmetric visibility is the only version that answers the requirement

Guideline 1.2 item 3 is "the ability to block abusive users". The thing a reader is trying to stop is
not *seeing* the other reader — they can scroll past — it is *being reached by* them. A
one-directional block leaves the blocked reader every one of these, all verified on this branch:

| What they keep | Endpoint |
|---|---|
| The blocker's posts, newest first | `GET /notes/feed` (`notes_router.py:325`) |
| The blocker's whole public note history | `GET /notes/user/{id}` (`:464`) |
| Name, avatar, bio, follower counts | `GET /profile/{id}` (`profile_router.py:202`) |
| Books read, finished, in progress, pages | `GET /users/{id}/stats` (`users_router.py:184`), `GET /userbooks/user/{id}` (`userbooks_router.py:482`) |
| A day-by-day reading graph | `GET /reading-activity/user/{id}/daily` (`reading_activity_router.py:225`) |
| The ability to comment under the blocker's post and send them a push | `likes_comments.py:116-154`, which fires `post_commented` at `:146-154` |

So one-directional is not a weaker version of the feature; it is the absence of it with a button on
top. Symmetric is also the behaviour a reader has learned to expect from the word Block.

### Deleting the follows is the decision that removes work

`follow` is read in nine places. Deleting both rows at block time makes the block true in all of them
without a filter:

| Reader | File:line | What it reads `follow` for |
|---|---|---|
| `/notes/friends-feed` | `notes_router.py:593-596`, `:604-612` | who to show, and mutual ranking |
| `/userbooks/friends/currently-reading` | `userbooks_router.py:553-556`, `:564-572` | whose shelves |
| `/books/recommendations` | `books_router.py:244-246` | whose reading to recommend from |
| `/users/following` | `users_router.py:123-126`, `:140-148` | the list, and mutual status |
| `/users/search` | `users_router.py:73-94` | follow buttons |
| `/follow/followers`, `/follow/following` | `follow_router.py:79-87` | the raw lists |
| `/profile/{id}` | `profile_router.py:212-219`, `:223-224` | `is_following`, `follows_you`, counts |
| private-profile gates | `notes_router.py:476-478`, `users_router.py:201-206`, `userbooks_router.py:496-498`, `reading_activity_router.py:240-242` | whether a private profile opens |
| `likes_comments._assert_can_view_note` | `likes_comments.py:23-26` | the same gate for likes and comments |

The last two rows are the interesting ones: a block **must not** make a private profile *open*. It
does not, because a blocked pair is 404'd before the private gate is reached (R-22 rows 3, 6, 7, 10,
13) — the order matters and is specified.

**The cost of deleting:** unblock does not restore. A reader who blocks by mistake and unblocks has
lost the follow in both directions and will not know unless the confirm copy told them (R-28). The
alternative — keep the rows and filter nine readers — trades one irreversible act for nine filters,
nine budget movements and nine places to leak. The trade is worth it, and the mitigation is wording,
not code.

### Failure modes, in full

| # | Mode | Who it hits | What happens | Mitigation in this sprint |
|---|---|---|---|---|
| **F1** | The blocked reader signs out and reads the public feed | Any blocker | `GET /notes/feed` takes `get_current_user_optional` (`notes_router.py:329`), so there is no viewer and no block set. The blocker's public posts are visible to the world, including to them | **Unsolved by design** and stated as **E-8**. A block is a relationship between two accounts; it is not content removal. The honest mitigation already exists and is `is_private_profile`, which takes the author out of `crud.get_notes_feed` entirely (`crud.py:148-149`) |
| **F2** | The blocked reader makes a second account | Any blocker | The new row is not in any block. Everything is visible again | Out of scope. Blocking by email, device or IP is a different product with a different cost. Named so "blocked" is not read as "gone" |
| **F3** | A filter is added to thirteen paths and forgotten on the fourteenth | The blocker, silently | The leak the reader cannot detect | R-22's table **plus** a route-coverage test that enumerates `app.routes`, classifies each as serving-another-reader or not, and asserts the count against a literal. A new route fails CI un-classified. This is the only control that survives a future sprint |
| **F4** | The `or_` arms are transposed in one query | Both readers | The block works in one direction and not the other. A smoke test passes | One helper, called everywhere (R-23). Each path's test asserts **both** directions, and the required mutation is "drop one `or_` arm" |
| **F5** | A block is created and the unfollow is a second transaction that fails | Both readers | A blocked pair that is still in the friends feed | One transaction, one commit. Plus the production SQL check in the Done checklist, which is the only thing that proves the invariant across both codepaths |
| **F6** | A reader blocks `@TMRBot` | That reader | The bot's posts leave their feed. The symmetric half is inert — a bot reads no feed and holds no follow (`deny_bot_actor`, `app/deps.py:191-211`) | Intended. A test asserts no 500, no notification, and that every other reader's feed is unchanged |
| **F7** | Reports accumulate on a bot | The editorial bots | Nothing, because R-04 removes nothing automatically | This is the mitigation. **If E-3 chooses auto-hiding, `is_bot` must be excluded from it**, and that becomes a new requirement rather than an assumption |
| **F8** | A report about the admin's own content | The reporter | It lands in the admin's own queue. `_ALLOWED_ADMIN_EMAILS` is one address (`admin_router.py:350`) and `:369-370` refuses to grant `is_admin` to anyone else | **E-6.** Not solvable in code — it needs a second reviewer |
| **F9** | A blocked pair in a circle | Both readers | They still see each other in Members and the leaderboard | **E-2**, and R-26 states the residual |
| **F10** | `report.target_id` points at deleted content | The admin | A resolved report whose target is gone | `target_snapshot` at creation, no foreign key, and a queue row that renders without the target. The mutation is "make it a foreign key" — the admin's own delete route must then fail |
| **F11** | A reader blocks someone, then their account is deleted | The other reader | Without R-08 the surviving `block` row points at a dead `user.id`, and the hidden-id set computed from it hides a reader who no longer exists | Both directions deleted in the cascade, before the `user` row at `auth_router.py:598-600`, inside the single transaction that commits at `:601` |

### The one load-bearing internal assumption

**Every path that serves another reader's content is in R-22's table.** Everything else in the design
is enforced by code. That one claim is enforced by the care taken reading the routers today, and it
decays the moment somebody adds an endpoint. The route-coverage test (F3) is the only durable form of
it, and it is the reason that test is a requirement rather than a nicety.

---

## Which budgets move

`tests/test_query_budget.py` holds 67 rows over 44 endpoints (`BUDGETS` at `:570`, literals
`EXPECTED_ROWS = 67` / `EXPECTED_ENDPOINTS = 44` at `:715-716`) with `budget == expected` on every
row — margin zero, stated in the file's own header at `:30-32`.

**4I-A (Report) moves nothing.** It adds no statement to any existing endpoint.

**4I-B (Block) moves 24 rows, each +1. 43 rows are unchanged. 24 + 43 = 67.**

| BQ | Endpoint | Branch | Kind | now | after | Why |
|---|---|---|---|---|---|---|
| 03 | `GET /profile/{id}` | public subject | ratchet | 7 | 8 | the block check |
| 03p | `GET /profile/{id}` | private, non-follower | ratchet | 6 | 7 | " |
| 03f | `GET /profile/{id}` | private, follower | ratchet | 7 | 8 | " |
| 06 | `GET /userbooks/user/{id}` | public subject | ratchet | 4 | 5 | " |
| 06f | `GET /userbooks/user/{id}` | private, follower | ratchet | 5 | 6 | " |
| 07 | `GET /userbooks/friends/currently-reading` | — | ratchet | 6 | 7 | carries `user.name` (`userbooks_router.py:600-606`) |
| 08 | `GET /notes/feed` | signed in | ratchet | 8 | 9 | the hidden set |
| 08e | `GET /notes/feed` | empty database | ratchet | 2 | **3** | **at the `>3` ceiling of `test_empty_accounts_keep_their_early_returns` (`:959-963`) — no headroom left** |
| 09 | `GET /notes/friends-feed` | — | ratchet | 10 | 11 | defence in depth over R-21 |
| 11 | `GET /notes/user/{id}` | public author | ratchet | 9 | 10 | the block check |
| 11f | `GET /notes/user/{id}` | private author, follower | ratchet | 10 | 11 | " |
| 13 | `GET /notes/{id}/comments` | — | ratchet | 5 | 6 | comment authors |
| 14 | `GET /books/recommendations` | — | ratchet | 12 | 13 | carries `friend_name` (`books_router.py:271`) |
| 14n | `GET /books/recommendations` | follows nobody | ratchet | 4 | 5 | no early return exists on that branch — `books_router.py:257` and `:276` are `if following_ids:` guards *inside* the handler, which continues to author affinity at `:296` |
| 22 | `GET /users/following` | — | ratchet | 4 | 5 | carries `name`, `username`, `bio` (`users_router.py:27-36`) |
| 23 | `GET /users/search` | q matches several | ratchet | 4 | 5 | exclusion |
| 24 | `GET /users/{id}/stats` | public subject, 50 finished | **target** | 3 | **4** | **the project's only delivered optimisation number moves.** Stays `target`: the N+1 fix is untouched and `test_only_two_targets_the_rest_are_ratchets` (`:832-842`) asserts endpoint names, not counts |
| 24f | `GET /users/{id}/stats` | private, follower | ratchet | 4 | 5 | " |
| 27 | `GET /reading-activity/user/{id}/daily` | public subject | ratchet | 3 | 4 | the block check |
| 27f | `GET /reading-activity/user/{id}/daily` | private, follower | ratchet | 4 | 5 | " |
| 36 | `GET /groups/{id}/posts` | with book cards | ratchet | 6 | 7 | post authors — **E-2** |
| 36p | `GET /groups/{id}/posts` | private, member | ratchet | 7 | 8 | " |
| 37 | `GET /groups/{id}/activity` | public | ratchet | 4 | 5 | event actors — **E-2** |
| 37p | `GET /groups/{id}/activity` | private, member | ratchet | 5 | 6 | " |

**Unchanged, and why each is unchanged** (43 rows): `01` `/version` (no auth); `02` `/profile/me`,
`04` `/userbooks/`, `05` `/userbooks/{id}`, `10` `/notes/me`, `12` `/notes/userbook/{id}`,
`17`–`19` `/notifications/*`, `25`–`26` `/reading-activity/{daily,insights}` — own content only;
`08a` `/notes/feed` anonymous — no viewer, no set (E-8); `09e`, `22e`, `23e`, `28e`, `29e`, `30e`,
`31e` — the helper runs **after** the early return; `15`, `16` `/books/{id}`, `/books/search` — a book
is not a reader's content; `20`, `21` `/follow/{followers,following}` — ids only, and R-21's invariant
means the row cannot exist; `28`, `29`, `30`, `31`, `32`, `32p` `/groups/*` listings — `creator_name`
only, and hiding it hides the circle; `33`, `33p` `/groups/{id}/members` and `34`, `34p`, `34e`
`/groups/{id}/leaderboard` and `35`, `35p` `/groups/{id}/goal` — structure, not content (**E-2**);
`38` `/groups/{id}/pending` — curator's own queue; `39`–`44` `/admin/*` — never filtered.

### Two things that must be done to the guard, and one that must not

1. **Re-measure, do not widen.** `test_the_table_is_whole` asserts `budget <= expected + 1`
   (`:824-830`), so a padded budget fails the table-integrity test before any count is compared.
2. **Seed `block` rows into the large seed**, or `test_no_endpoint_scales_with_row_count`
   (`:880-936`) never exercises the new filter — and that test is precisely the one that catches a
   per-row block lookup. **The trap:** the same test asserts `len(bigger) >= 5` at `:908-911` (at
   least five endpoints return a longer body on the large seed) and blocks shorten bodies. Seed the
   blocks between readers the five growing rows do not measure, and state in the build notes which
   readers those are.
3. **Do not add the new endpoints to `BUDGETS`.** Not a style preference — it does not work.
   `EXPECTED_ENDPOINTS` is used **twice**: at `:820-823` to assert the table's distinct-endpoint
   count, and at `:850-853` to assert that a regex parse of
   `features/maintenance/sprint-4e-query-budget/architecture.md` finds that same number of `GET`
   rows. Raising it to 45 for `GET /admin/reports` makes the second assertion fail against another
   sprint's document. **E-7** is whether to decouple the two literals. Until it is answered, the new
   routes are unbudgeted — the same conclusion Sprint 4G reached for `POST /auth/apple`, for the same
   reason, and `GET /admin/reports` and `GET /blocks` are both small, admin- or self-scoped reads.

---

## Call sites

Line numbers are branch `sprint-4i-report-block` @ `1162479`. Every one was opened.

### P1 — the tables, the guard, the PM steps (API, deploy-order-bearing)

| File:line | Today | After |
|---|---|---|
| `app/models.py:54` (`User.apple_refresh_token`, Sprint 4H) | the last `User` column | no change to `User`. Both new tables are appended **after** `BotPost` (`:217-232`), which is where 4F put its new table |
| `app/models.py:232` (end of `BotPost`) | the insertion point | `+ class Report(SQLModel, table=True)` with `__table_args__ = (UniqueConstraint("reporter_id", "target_type", "target_id", name="uq_report_once"),)` — the same shape `Follow` uses at `:137` and `Like` at `:147`, and `+ class Block(SQLModel, table=True)` with `UniqueConstraint("blocker_id", "blocked_id", name="uq_block_pair")` |
| `app/schema_guard.py:31` (`("user","apple_refresh_token")`, Sprint 4H) | 6 entries | `+ ("report", "reason")` in the Report deploy and `+ ("block", "blocked_id")` in the Block deploy, **each in the deploy that follows its own SQL**. A missing table produces no `information_schema` row either, so one column covers the whole table — the reasoning already written at `:14-16` for `bot_post` |
| `context/PM_SQL_QUEUE.md:238` (end of step 9) | steps 1–9 | `+ ## 10. Sprint 4I — the report table` and `+ ## 11. Sprint 4I — the block table`, each with its verify block, and two rows appended to the answers table at `:242-253` |

### P2 — report (API)

| File:line | Today | After |
|---|---|---|
| `app/routers/reports_router.py` (new) | — | `POST /reports`. `deny_bot_actor` as a dependency (the `likes_comments.py:37` pattern), the visibility check reused from `likes_comments._assert_can_view_note`, the `IntegrityError` → 200 path copied from `follow_router.py:39-44` |
| `app/routers/likes_comments.py:14-28` `_assert_can_view_note` | the note-visibility rule, called at `:46`, `:135`, `:177` | **moved**, unchanged, to a shared module so `reports_router` can call it without importing a router. Its three existing call sites keep calling it. *(This is the only edit P2 makes to an existing handler file, and it is a move plus an import.)* |
| `app/routers/admin_router.py:462` (`list_recent_notes`) | the moderation section opens at `:437` | `+ GET /admin/reports` and `+ PATCH /admin/reports/{id}` appended **after** `list_recent_comments` ends at `:535`, before `delete_note` at `:538`, so the two delete routes a resolution uses stay adjacent |
| `app/notifications/config.py` `NOTIFICATION_EVENTS` | the event table `fire_event` reads at `dispatcher.py:138` | `+ "content_reported"` — title and body carrying **no** reported text and no reader name |
| `app/main.py:149` (`include_router(bots_router.router)`) | 17 routers | `+ app.include_router(reports_router.router)` |

### P3 — block (API, the big one)

| File:line | Today | After |
|---|---|---|
| `app/blocks.py` (new module) | — | `hidden_user_ids(db, viewer) -> set[int]` — the one-statement `or_` select of §"The filter, proved" case C, and `is_blocked_pair(db, a, b) -> bool` for the single-subject paths. **One module-level seam, so the `or_` arms exist once** |
| `app/routers/blocks_router.py` (new) | — | `POST /blocks/{user_id}` (block + both unfollows, one transaction), `DELETE /blocks/{user_id}`, `GET /blocks`. `deny_bot_actor` on the POST |
| `app/crud.py:142-154` `get_notes_feed` | `select(Note).join(User)… .where(is_public, is_private_profile == False)` | `+ hidden: set[int] = frozenset()` kwarg, applied as `.where(Note.user_id.notin_(hidden))`. **Default empty, so the one other caller shape is byte-identical** — the same discipline `create_note`'s `commit=` kwarg used at `:116` and documented at `:117-121` |
| `app/routers/notes_router.py:332` | `crud.get_notes_feed(db, limit=limit)` | the helper first **only when `current_user` is not None** (`:329` is `get_current_user_optional`), then passed in |
| `app/routers/notes_router.py:616-623` (friends-feed notes query) | `.where(Note.user_id.in_(following_ids), is_public)` | `+ .where(Note.user_id.notin_(hidden))`, with the helper called **after** the `if not following: return []` at `:598-599` |
| `app/routers/notes_router.py:474` (`target_user = db.get(...)`) | the private-profile gate begins | the block check **above** it, 404 |
| `app/routers/likes_comments.py:14-28` | owner / public / private-profile | `+` a blocked-pair branch, 404, **before** the `not note.is_public` check at `:19`. One edit covers like (`:46`), comment (`:135`) and comment-read (`:177`) |
| `app/routers/likes_comments.py:187-188` | the comment authors' `users_map` | `+ .where(User.id.notin_(hidden))`, and comments whose author drops out are omitted from the result built at `:189-203` |
| `app/routers/follow_router.py:15` | `if followed_id == user.id` | the blocked-pair 403 **above** it |
| `app/routers/profile_router.py:204-206` | `user = db.get(User, user_id)` then 404 | `+` the block check, 404, **before** `is_self` at `:209` |
| `app/routers/users_router.py:59` | `User.id != current_user.id` inside the `and_` | `+ User.id.notin_(hidden)` in the same `and_`, so the exclusion costs no second statement |
| `app/routers/users_router.py:136-137` | the following list's `User.id.in_(followed_ids)` | `+ .notin_(hidden)`, after the `if not following_records: return []` at `:128-129` |
| `app/routers/users_router.py:195-197` | `user = db.get(...)` then 404 | `+` the block check, 404, before the private gate at `:200` |
| `app/routers/userbooks_router.py:490-492` | `user = db.get(...)` then 404 | `+` the block check, 404, before the private gate at `:495` |
| `app/routers/userbooks_router.py:576-586` | the `reading` userbooks query | `+ .notin_(hidden)` on `UserBook.user_id`, after the `if not following: return []` at `:558-559` |
| `app/routers/books_router.py:244-246` | `following_ids` | `+ ` the helper, and `following_ids` filtered through it in Python — it is already a list in memory, so this costs no statement beyond the helper's one |
| `app/routers/reading_activity_router.py:234-236` | `user = db.get(...)` then 404 | `+` the block check, 404, before the private gate at `:239` |
| `app/routers/groups_router.py:829-834` | the group-posts query | `+ .notin_(hidden)` on `GroupPost.user_id` — **E-2** |
| `app/routers/groups_router.py:1124-1129` | the activity query | `+ .notin_(hidden)` on `GroupActivity.user_id` — **E-2** |
| `app/routers/groups_router.py:740` | `if _is_member(...)` in `invite_user` | the blocked-pair 403 **above** the row added at `:746-749` |
| `app/notifications/dispatcher.py:166-176` | the per-recipient loop; self-skip at `:167-170`, prefs at `:173` | `+` a blocked-pair skip beside them, counted into the summary at `:207-212` under its own key |
| `app/routers/auth_router.py:558-562` (the follow delete in the cascade) | follows both ways | `+` `Block` both ways and `Report` (filed-by and about-this-reader), in the same loop style, **above** the `user` delete at `:598-600` |

### P4 — web client

| File:line | Change |
|---|---|
| `book-tracker-frontend-stitch/src/services/api.js:345` (`// Admin` header) | `+ reportContent`, `+ blockUser`, `+ unblockUser`, `+ getBlocks`, `+ getAdminReports`, `+ resolveReport`, each in the right comment-headed group; mutations chain an invalidator the way the existing ones do |
| `src/pages/HomePage.jsx:184` | the menu gate `(isOwn \|\| isAdmin)` **opens for everyone**; a non-owner gets Report and Block only. The `more_horiz` trigger at `:190` and the dropdown at `:192-211` are reused |
| `src/pages/HomePage.jsx:292` | Report on the comment author row |
| `src/pages/HomePage.jsx` sidebar search result row | Block on a search result |
| `src/pages/UserProfilePage.jsx:117` (`PublicNoteCard`) and `:424` (the follow button) | Report on a note; Report and Block on the reader |
| `src/pages/GroupDetailPage.jsx:128` | the delete gate `(isOwn \|\| isCurator)` opens for everyone, Report only for a non-owner |
| `src/pages/SettingsPage.jsx:236-245` (the privacy toggle) | `+` a blocked-readers list with Unblock, beside it |
| `src/pages/AdminPage.jsx:136` | `const TABS = [...]` gains `'reports'`; the click handler at `:151` lazy-loads it the way `'content'` does; a panel after the content panel, row markup cloned from the posts rows |
| `src/i18n/locales/{en,ru,de,es,fr,pt}.json` | the new strings, all six |

**There is no shared dropdown, modal or confirm primitive in `src/components/`** (it holds
`AppTour.jsx`, `BookPreviewModal.jsx`, `BotBadge.jsx`, `Nav.jsx`, `Toast.jsx`,
`VisibilityToggle.jsx`), and confirmations are `window.confirm` on three pages while
`GroupDetailPage.jsx` rolls its own modal. The report flow needs a reason picker, so **P4 extracts one
small menu component and one small modal** rather than adding a fourth confirm style. That extraction
is the only refactor in this sprint and it is named so it is not mistaken for scope creep.

### P5 — mobile client

| File:line | Change |
|---|---|
| `book-tracker-mobile-stitch/src/services/api.js:152-164` (`userAPI`) and `:130-149` (`notesAPI`) | `+ reportContent`, `+ blockUser`, `+ unblockUser`, `+ getBlocks` in the matching objects. `__tests__/apiContract.test.mjs` checks each against a real route, so this cannot merge before P2/P3 |
| `src/screens/FeedScreen.js:669` | the `(isOwnPost \|\| isAdmin)` gate opens for everyone; the `···` button at `:671-678` and the dropdown at `:679-691` are reused; `menuPostId` (`:77`) is unchanged |
| `src/screens/FeedScreen.js:746-770` | Report on the comment row, beside the admin trash at `:763-772` |
| `src/screens/FeedScreen.js:583` (`renderUserCard`) | Block on a search result |
| `src/screens/UserProfileScreen.js:345` (the follow button) and `:513` (the notes list) | Report and Block on the reader; Report on a note |
| `src/screens/GroupDetailScreen.js:732-740` (the curator trash in the post header) | Report for a non-owner |
| `src/screens/SettingsScreen.js:449` (the Privacy section) | `+` a blocked-readers list with Unblock |
| `src/navigation/AppNavigator.js:128` | `+` a `BlockedReaders` screen beside `UserProfile`, if the list is a screen rather than a section |
| `app.json:6`, `:41` | `version` / `android.versionCode` bump (currently `2.2.4` / `63`) |
| `src/i18n/locales/{en,ru,es,pt,de,fr}.json` | the new strings, all six; the accessibility labels into `en.json`'s `a11y` section (opens at `:517`, `postOptions` at `:528`) |

**No action-sheet library is present** and destructive confirms are `Alert.alert` with a `destructive`
button. The reason picker therefore needs a `Modal` (the pattern already in `FeedScreen.js`) or a
screen; it does not need a new dependency.

### Not in any package, and named so they are not lost

- `context/INDEX.md`'s Feature Nodes table gains a Safety row (this sprint does that one line, because
  a feature node nobody can find is not documented).
- `dependency-map.md` is regenerated by `python scripts/gen_dependency_map.py` after P3, per its own
  instruction at `:4`. Its hand-curated top section is **not** edited here.
- `features/community/index.md` describes the feed, comments, profiles and circles and will be
  factually incomplete the day this ships. One row, named, **deliberately outside this sprint's diff**
  — editing another feature's index from inside a safety sprint is how a diff stops being reviewable.

### Citations that have drifted

Recorded because the house rule exists for a reason:

- `context/INDEX.md:46` says `auth_router.py` serves `DELETE /auth/delete-account/me`. It is a
  **`POST`** (`auth_router.py:475`). `features/auth/index.md:25` carries the same error, alongside
  `POST /auth/login` and `POST /auth/signup`, which `tests/test_auth.py:23`'s
  `TestLegacyPasswordRoutesRemoved` proves are gone. Sprint 4G's architecture already named both and
  left them; so does this one.
- `features/community/index.md:26` credits `notes_router.py` with "admin delete comment". That route
  is `admin_router.py:557-568`. Predates this sprint, not fixed here.
- `features/community/index.md`'s `last_verified` says the file was "last checked 2026-05-03" apart
  from the sprint table. Treat its Key Files tables as indicative; every line number in **this**
  document came from the file itself.

---

## Data

### `report` — new table, **PM SQL step 10**

```sql
CREATE TABLE IF NOT EXISTS report (
    id              SERIAL PRIMARY KEY,
    reporter_id     INTEGER      NOT NULL,
    target_type     VARCHAR(16)  NOT NULL,   -- note | comment | group_post | user
    target_id       INTEGER      NOT NULL,
    target_user_id  INTEGER,                 -- the author, denormalised at creation
    reason          VARCHAR(32)  NOT NULL,
    detail          VARCHAR(1000),
    target_snapshot VARCHAR(2000),
    status          VARCHAR(16)  NOT NULL DEFAULT 'open',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at     TIMESTAMP,
    resolved_by     INTEGER,
    resolution      VARCHAR(500)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_once ON report (reporter_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS ix_report_open ON report (status, created_at DESC);
```

- **`VARCHAR` widths match the house values** — 255 is used for `bot_post.bot_email` and `dedup_key`
  (`context/PM_SQL_QUEUE.md:135`, `:137`), 32 for `bot_post.content_type` (`:136`) and 512 for
  `user.apple_refresh_token` (`:207`). The wider
  `detail` and `target_snapshot` are new and are deliberate caps, not generosity: a cap is what stops
  a report body becoming a storage surface.
- **No foreign keys**, matching `report`'s need to outlive its target (spec R-07) and matching
  `bot_post`, which carries `note_id` as audit information with no FK (`models.py:231`).
- **`uq_report_once` is where the correctness lives.** It is what makes "one reader, one report per
  thing" true under concurrency, and it is what makes the open-report count meaningful.
- **`target_user_id` is denormalised on purpose.** Without it the queue cannot group by abusive author
  once the content is deleted, and grouping is the only way one reader's pattern is visible.
- `ix_report_open` is a separate statement because creating an index is never bundled in this project
  — the PM decides it (`PM_SQL_QUEUE.md:110-112` states this for step 6).

### `block` — new table, **PM SQL step 11**

```sql
CREATE TABLE IF NOT EXISTS block (
    id          SERIAL PRIMARY KEY,
    blocker_id  INTEGER   NOT NULL,
    blocked_id  INTEGER   NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_block_pair ON block (blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS ix_block_blocked ON block (blocked_id);
```

- **The same shape as `follow`** (`models.py:135-142`), down to the unique pair index — deliberately,
  because the two tables are read the same way and a reader of one should recognise the other.
- **`uq_block_pair` makes a double block idempotent** under concurrency; the handler catches the
  `IntegrityError` and returns the existing state, exactly as `follow_router.py:39-44` does.
- **`ix_block_blocked` is the one index the design actually needs at runtime.** The helper's query is
  `WHERE blocker_id = :me OR blocked_id = :me`; `uq_block_pair` covers the first arm, and without an
  index on `blocked_id` the second arm is a sequential scan on every filtered request. At 131 readers
  that is free; it is here so it does not have to be found later.
- **Not symmetric in storage.** One row records who blocked whom; the symmetry is in the *read*
  (both `or_` arms). Storing two rows would double every write and make "only A can unblock"
  (R-20) a convention rather than a fact.

Verification to send back for each step follows the shape of steps 7–9 (`PM_SQL_QUEUE.md:150-157`,
`:177-189`, `:231-237`): the `information_schema.columns` row, the `pg_indexes` rows, and a
`count(*)` that must be 0 because nothing has been written yet.

### Deploy order (not negotiable)

1. PM runs SQL step **10** and returns the verification output.
2. Deploy the Report API **with** `("report", "reason")` in `schema_guard.REQUIRED_COLUMNS`. If step 1
   was skipped, `assert_migrated` raises at `app/schema_guard.py:51-53` from the startup event
   (`app/main.py:166`), Render fails the deploy and the previous version keeps serving. That is the
   guard working, not a problem.
3. PM runs SQL step **11** and returns the verification output.
4. Deploy the Block API with `("block", "blocked_id")` added.
5. **Only then** does the client release matter. Steps 1–4 are invisible to every existing reader:
   there is no client calling `/reports` or `/blocks` until P4 and P5 ship, and the filters are no-ops
   while the `block` table is empty.
6. One store release carrying both affordances (E-5). Then the submission.

**Steps 1–4 change nothing for an existing reader**, which is what lets the risky half of this sprint
deploy and be measured before any reader can reach it.

---

## Data flow

### One report

```
Web PostCard menu / mobile ··· menu   (HomePage.jsx:184-213 / FeedScreen.js:669-691)
  └─ "Report post"  ->  reason picker  (new modal; there is no shared confirm primitive)
       reason in {spam, harassment, hate, sexual, violence, self_harm, other}
       optional detail, capped
       [x] Also block this reader        <- checked by default (R-04)
  └─ POST /reports { target_type, target_id, reason, detail? }
       ( and, if checked, POST /blocks/{author_id} )

API, POST /reports
  ├─ deny_bot_actor                      -> 403 for a bot (deps.py:191-211)
  ├─ target exists?                      -> 404 (same body as "not visible to you")
  ├─ target is mine?                     -> 400
  ├─ _assert_can_view_note equivalent    -> 404, so the route is not a visibility oracle
  ├─ INSERT report (+ target_user_id, + target_snapshot)
  │    IntegrityError on uq_report_once  -> rollback, 200 with the first report's state
  └─ BackgroundTask: fire_event("content_reported", recipient_ids=[admin ids])
       no reported text, no reader name in title or body
  -> 201 { "status": "received" }        # says nothing about counts or consequences

PM, AdminPage -> Reports tab
  └─ GET /admin/reports        -> reason, detail, snapshot, author, reporter, other-report count
  └─ DELETE /admin/content/note/{id}      (admin_router.py:538, unchanged)
     DELETE /admin/content/comment/{id}   (admin_router.py:557, unchanged)
  └─ PATCH /admin/reports/{id} { status: actioned | dismissed }   # the row stays
```

### One block

```
Web / mobile  "Block reader"
  └─ confirm: "You will stop seeing each other's posts, profiles and comments.
               Any follow between you will be removed and will NOT come back."   (R-28)
  └─ POST /blocks/{user_id}

API, POST /blocks/{user_id}
  ├─ deny_bot_actor                      -> 403 for a bot
  ├─ user_id == me                        -> 400   (follow_router.py:15's rule)
  ├─ target exists?                       -> 404
  └─ ONE transaction:
       INSERT block (blocker_id=me, blocked_id=them)
       DELETE follow WHERE (follower=me AND followed=them) OR (follower=them AND followed=me)
       commit once
         IntegrityError on uq_block_pair -> rollback, 200 (already blocked)
  -> 200 { "blocked": true }

Every later request by either reader
  └─ hidden = blocks.hidden_user_ids(db, viewer)       # ONE statement, after any early return
       SELECT blocker_id, blocked_id FROM block WHERE blocker_id = :me OR blocked_id = :me
       -> { the other id of each row }
  └─ feeds / lists:   .where(<author column>.notin_(hidden))      # no extra statement
     single subject:  blocks.is_blocked_pair(db, me, subject) -> 404 BEFORE the private gate
     interactions:    403 / 404 before any row and before any add_task(fire_event, ...)
     notifications:   fire_event skips the recipient, counted in its summary

Unblock
  └─ DELETE /blocks/{user_id}   -> removes the row. Restores NO follow. Notifies nobody.
```

---

## Security review

### 1. What a block must not become

| Attempt | Blocked by |
|---|---|
| Use `POST /reports` to discover which note ids exist | 404 for a non-existent target **and** for an invisible one, with the same body (R-02) |
| Use `POST /blocks/{id}` to discover which user ids exist | 404 only for a missing row; a block on an existing reader is 200 either way, so the route distinguishes nothing a reader could not already learn from `/profile/{id}` |
| Use a block to open a private profile | Every single-subject path 404s on the block **before** the private-profile gate (R-22 rows 3, 6, 7, 10, 13). The order is specified, not incidental |
| Use a block to delete someone's content | A block writes one row and deletes two `follow` rows. It touches no `note`, `comment` or `group_post` |
| Use a block to eject someone from a circle | It does not, under the proposal. **E-2** is where that could change, and it is called out as the stronger act |
| Learn that you have been blocked | No notification, no response-shape change, 404 rather than 403 (`likes_comments.py:20` already uses 404 for exactly this reason). A reader will still infer it, and no design prevents that |
| Report-bomb a target | `uq_report_once`: one report per reader per target, for ever (R-09) |
| Report a bot out of the feed | R-04 removes nothing automatically. **If E-3 changes that, `is_bot` must be excluded** |
| Block the admin to escape moderation | `/admin/*` is never filtered (R-22 row 23). An admin who is blocked keeps every moderation capability |
| Have a bot block a reader | `deny_bot_actor` on `POST /blocks/{user_id}` |

### 2. What a report stores

`detail` and `target_snapshot` are reader-authored text in a second table, readable only by an admin.
That is a real privacy cost and it is paid for one reason: a resolved report whose content has been
deleted is otherwise an id and a reason, which is not a record of anything. The controls are the
length caps, `get_admin_user` on both routes, deletion with the reporter's account (R-08), and the
rule that neither field is ever returned to any non-admin.

### 3. Logging

No reported text, no `detail`, no snapshot, no reader name and no email in any log line. Status codes,
reason strings and row ids only. This is the discipline Sprint 4F made a rule and Sprint 4G repeated;
it applies here even though these logs are Render's, because a report body is the most sensitive text
this product holds.

`fire_event` prints a per-recipient line today (`dispatcher.py:174`, `:179`, `:213`) carrying ids and
the event type, which is fine; the new suppression line must carry ids only and never a name.

### 4. The route-coverage test is a security control, not a tidiness one

F3 is the failure mode nothing else catches: the next sprint adds an endpoint that serves another
reader's content and nobody remembers R-22. A test that enumerates `app.routes`, classifies each
route, and asserts the classified count against a literal turns that from a silent leak into a red
build. It is the only control in this design that still works in six months.

### 5. Rate limiting

There is none, anywhere in this service. `POST /reports` is capped by `uq_report_once`;
`POST /blocks/{id}` writes one small row and a reader can only block readers who exist. The new
endpoints add no outbound call and no amplification path — the gap is recorded exactly as
`/auth/bot-login`'s and `/auth/apple`'s were, and adding the service's only limiter to one route would
be false coverage.

### 6. The admin is a single point

One address holds `is_admin` (`admin_router.py:350`), one person reviews every report, and a report
about that person lands in their own queue (**E-6**). The code cannot fix this. What the code does is
make the queue and the notification exist, so that whoever the PM appoints has something to work from.

---

## Test strategy

Severity: **Critical** = a block leaks, a report is lost, a refusal lands after a side effect.
**Major** = a surface has no affordance, a budget is wrong. **Minor** = cosmetic.

House rule: every Critical and Major case names the **one-line product change that must turn it red**.
A case with no such mutation does not count as coverage.

### API — report (`tests/test_reports.py`, new file)

| # | Case | Sev | Mutation that must turn it red |
|---|---|---|---|
| S-01 | `POST /reports` on a visible note → 201, one row, `status: open`, `target_user_id` and `target_snapshot` populated | Crit | Drop the snapshot write |
| S-02 | The same reader reports the same target twice → **200**, still **one** row | Crit | Drop `unique=True` from the constraint |
| S-03 | Two concurrent identical reports → one row, the loser gets a deterministic 200 | Crit | Remove the `IntegrityError` catch |
| S-04 | A report on a **private** note → **404**, and no row | Crit | Remove the visibility check (`likes_comments.py:14-28`'s reuse) |
| S-05 | A report on a private-profile author's note by a non-follower → 404, no row | Crit | Same |
| S-06 | A report on the reporter's own note → 400, no row | Major | Allow self-reports |
| S-07 | A report on a non-existent target → 404, **byte-identical body** to S-04's | Crit | Return a distinguishable body (this is the enumeration oracle) |
| S-08 | A bot's `POST /reports` → 403, no row, no notification | Major | Remove `deny_bot_actor` |
| S-09 | A report on a **bot's** note → 201, and the bot's post is still in `GET /notes/feed` for every reader | Crit | Add any auto-hide |
| S-10 | `GET /admin/reports` as a non-admin → 403; as admin → the report with its snapshot and its other-report count | Crit | Drop `get_admin_user` |
| S-11 | `PATCH /admin/reports/{id}` → `status: actioned`, `resolved_at`/`resolved_by` set, **row still present** | Crit | Delete the row on resolve |
| S-12 | A new report fires exactly **one** `content_reported` event to the admin, as a **BackgroundTask**, with no reported text and no reader name in title or body | Crit | Make it synchronous; put the snapshot in the body |
| S-13 | An admin with **no push token** → the report still returns 201 | Crit | Make the notification synchronous or raise on failure |
| S-14 | The reported reader receives **nothing** — no `NotificationLog` row, no push | Crit | Add the reported reader to `recipient_ids` |
| S-15 | After the admin deletes the reported note, `GET /admin/reports` still renders the row | Crit | Make `target_id` a foreign key |
| S-16 | `schema_guard.REQUIRED_COLUMNS` contains `("report", "reason")` | Major | Remove it — this is what makes a pre-migration deploy fail loudly |

### API — block semantics (`tests/test_blocks.py`, new file)

| # | Case | Sev | Mutation |
|---|---|---|---|
| B-01 | `POST /blocks/{id}` → one row, and **both** `follow` rows gone | Crit | Drop either direction of the unfollow |
| B-02 | Block twice → 200, one row | Major | Remove the `IntegrityError` catch |
| B-03 | Block yourself → 400, no row | Major | Allow it |
| B-04 | A bot's `POST /blocks/{id}` → 403 | Major | Remove `deny_bot_actor` |
| B-05 | `POST /follow/{id}` for a blocked pair → **403 in both directions**, no row, **no notification fired** | Crit | Move the check into the handler body after `add_task` |
| B-06 | `DELETE /blocks/{id}` removes the row and **restores no follow** | Major | Restore the follow |
| B-07 | `GET /blocks` returns only the viewer's **outbound** blocks | Crit | Include inbound — the blocked reader must not learn |
| B-08 | The block row and the unfollow are **one** transaction (asserted by statement count and by a forced failure leaving neither) | Crit | Commit twice |

### API — the fourteen serving paths, **both directions each** (same file)

Every row is run twice: once as the blocker, once as the blocked. A single-direction test does not
cover R-20.

| # | Path | Sev | Assertion | Mutation |
|---|---|---|---|---|
| B-10 | `GET /notes/feed` signed in | Crit | the other reader's notes absent; a **third** reader's notes still present | Remove the `notin_` |
| B-11 | `GET /notes/feed` **anonymous** | Major | the feed is **unfiltered** — E-8's behaviour is asserted, not accidental | Apply some viewer's set to an anonymous request |
| B-12 | `GET /notes/friends-feed` | Crit | absent even if a `follow` row is inserted directly, bypassing R-21 | Remove the `notin_` and rely on R-21 |
| B-13 | `GET /notes/user/{id}` | Crit | **404**, and the same body as a deleted account's | Return 403, or an empty 200 |
| B-14 | `GET /notes/{id}/comments` on a **third party's** note | Crit | the blocked reader's comment absent; others present | Remove the author filter |
| B-15 | `POST /notes/{id}/like`, `DELETE` …`/like`, `POST` …`/comments` on the other's note | Crit | 404, no row, **no `fire_event`** | Check inside the handler after `add_task` |
| B-16 | `GET /profile/{id}` | Crit | 404, **and a private profile stays private** — the block check is before the gate | Put the block check after the private gate |
| B-17 | `GET /users/{id}/stats` | Crit | 404 | Remove the check |
| B-18 | `GET /users/search?q=` matching the other reader | Crit | absent; a third match present | Remove the `notin_` from the `and_` |
| B-19 | `GET /users/following` | Major | absent | Remove the filter |
| B-20 | `GET /userbooks/user/{id}` | Crit | 404 | Remove the check |
| B-21 | `GET /userbooks/friends/currently-reading` | Crit | absent | Remove the filter |
| B-22 | `GET /books/recommendations` | Major | no entry carries the blocked reader's `friend_name` | Remove the filter |
| B-23 | `GET /reading-activity/user/{id}/daily` | Crit | 404 | Remove the check |
| B-24 | `GET /groups/{id}/posts` in a shared circle | Crit | the blocked reader's posts absent; the circle's other posts present | Remove the filter (**E-2** may invert this case) |
| B-25 | `GET /groups/{id}/activity` | Major | the blocked reader's events absent | Remove the filter |
| B-26 | `GET /groups/{id}/members` and `/leaderboard` in a shared circle | Major | the blocked reader is **present**, and `member_count` agrees with the list | Filter the member list (the count must then disagree and this case catches it) |
| B-27 | `POST /groups/{id}/invite/{user_id}` for a blocked pair | Major | 403, no row, no notification | Check after the row |
| B-28 | `GET /admin/*` as an admin who has blocked a reader | Crit | that reader's content is **present** in `/admin/content/notes` and in `/admin/reports` | Filter the admin routes |
| B-29 | `fire_event` with a blocked actor/recipient pair | Crit | no `NotificationLog` row, `send_expo_push` and `send_web_push` both **not called**, and the summary counts the skip | Move the check outside the loop |
| B-30 | `GET /notifications/history` after a block | Minor | rows delivered **before** the block are still there | Delete history on block |
| B-31 | **Blocking a bot** | Major | the bot's posts leave that reader's feed, stay in every other reader's, no 500, no notification | Make the bot path raise |
| B-32 | **Route coverage** — every route in `app.routes` is classified serving / not-serving, and the serving count equals a literal | Crit | Add a new route that serves another reader's content without classifying it. **This is the case that survives this sprint** |
| B-33 | Account deletion with blocks and reports in both directions → no `block` or `report` row references a dead `user.id` | Crit | Delete only the outbound blocks |
| B-34 | `schema_guard.REQUIRED_COLUMNS` contains `("block", "blocked_id")` | Major | Remove it |
| B-35 | `hidden_user_ids` is **one** statement, whatever the number of blocks, and is **not** built with `union()` | Crit | Use `union()` (§"The filter, proved" case A: the `Row` type error must surface in a test, not in production) |
| B-36 | Every existing test in `tests/` passes **unedited**, except the 24 budget numbers and the budget seed | Crit | Change any existing response key |

### API — the budget guard (`tests/test_query_budget.py`, edited)

| # | Case | Sev | Mutation |
|---|---|---|---|
| B-40 | All 67 rows pass with the 24 moved numbers re-measured on the branch | Crit | Leave one moved row at its old number — CI must fail and name the endpoint |
| B-41 | `test_the_table_is_whole` still passes: 67 rows, 44 endpoints, every `budget == expected` | Crit | Pad a budget by two |
| B-42 | `test_empty_accounts_keep_their_early_returns`: all 8 rows still ≤ 3, `BQ-08e` exactly 3 | Crit | Call the helper before an early return |
| B-43 | `test_no_endpoint_scales_with_row_count` passes **with `block` rows in both seeds**, and `len(bigger) >= 5` still holds | Crit | Seed the blocks against the readers the five growing rows measure |
| B-44 | `BQ-24` is still `kind=target` | Minor | Demote it to a ratchet to avoid explaining the move |

### Clients (`qa/unit/reportAffordance.test.mjs` and `book-tracker-mobile-stitch/__tests__/reportAffordance.test.mjs`, new)

Both follow `qa/unit/botBadge.test.mjs` exactly: anchors from surrounding JSX not line numbers
(`:12-13`), each anchor asserted to resolve to **one** line, `found === EXPECTED_SITES` against a
literal (`:50`, `:152-153`) before any per-site assertion, and the same detector run over a synthetic
copy with every affordance stripped which must report **0** (`:145-149`).

| # | Case | Sev | Mutation |
|---|---|---|---|
| C-01 | Report reachable at all **six** web sites of spec R-05 | Crit | Delete one site's item — the scan must name it |
| C-02 | Report reachable at all **six** mobile sites | Crit | Same |
| C-03 | The detector reports **0** on the synthetic stripped copy | Crit | Remove the synthetic negative — the scan can then no longer fail |
| C-04 | The per-post menu is **not** gated to owner-or-admin: `HomePage.jsx:184` and `FeedScreen.js:669` no longer carry that condition around the whole menu | Crit | Restore the gate — a non-owner must then see no Report at all |
| C-05 | Block is reachable from the public profile and from a user-search result on both clients | Major | Remove either |
| C-06 | The block confirm text contains the follow warning | Major | Drop the warning (R-21 is irreversible; a reader must not discover it afterwards) |
| C-07 | Every new string exists in all six locales, placeholders matching — the existing `__tests__/i18nParity.test.mjs` covers mobile; the web needs the same assertion or the strings must be listed in the build notes as deliberately English | Major | Add an English-only string |
| C-08 | Every new mobile `api.js` call resolves to a real FastAPI route — the existing `__tests__/apiContract.test.mjs` already does this | Crit | Ship a client call for a route that does not exist |
| C-09 | `app.json` `version` and `android.versionCode` are bumped — the existing `__tests__/versionGuard.test.mjs` already does this | Major | Skip the bump |
| C-10 | The Reports tab string is in `AdminPage.jsx`'s `TABS` and its panel is lazy-loaded | Minor | Load it on mount (the admin page already swallows a failed mount fetch) |

### Non-vacuity rules (inherited from 4C K-08, 4F and 4G)

- **Every block case asserts a control that fails if the setup did not take.** A third, unrelated
  reader's content must be **present** in the same response the blocked reader's is absent from.
  Without that, a filter that returns `[]` for everybody passes every case.
- **Every serving-path case runs in both directions.** The parametrisation asserts its own length
  first, so a direction cannot be quietly dropped.
- **C-03 runs the detector against a synthetic negative**, the way `botBadge.test.mjs:145-149` does.
- **No test may insert a `block` row and then assert `GET /blocks`.** The block must be created by a
  real `POST /blocks/{id}` call, or B-01's unfollow is not covered.
- **B-32 asserts a literal count before it asserts anything about a route**, for the same reason
  `EXPECTED_ROWS` exists: a coverage test that enumerates nothing passes.

### Production checks (QA/PM, after deploy)

| # | Check |
|---|---|
| P-01 | `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='report'` → the ten columns |
| P-02 | `SELECT indexdef FROM pg_indexes WHERE indexname='uq_report_once'` → a UNIQUE index |
| P-03 | `SELECT indexdef FROM pg_indexes WHERE indexname IN ('uq_block_pair','ix_block_blocked')` → two rows |
| P-04 | `POST /reports` with a junk target id on production → 404 (not 500, not 201) |
| P-05 | One report from the web client → one row, one admin notification, no reported text in it |
| P-06 | `SELECT count(*) FROM follow f JOIN block b ON (f.follower_id=b.blocker_id AND f.followed_id=b.blocked_id) OR (f.follower_id=b.blocked_id AND f.followed_id=b.blocker_id)` → **0** |
| P-07 | `SELECT reporter_id,target_type,target_id,count(*) FROM report GROUP BY 1,2,3 HAVING count(*)>1` → no rows |
| P-08 | `SELECT count(*) FROM block WHERE blocker_id NOT IN (SELECT id FROM "user") OR blocked_id NOT IN (SELECT id FROM "user")` → **0** |
| P-09 | Two review accounts, by hand: block on web, verify all six surfaces on mobile, **both directions** |
| P-10 | Render logs for one report and one block contain no reported text, no name, no email |

---

## Work packages

Six. **P1 must land and deploy before P2 and P3** (both read tables P1 declares, and P1's schema-guard
entries must each ship only after their own SQL). P4 and P5 depend on P2 and P3 being deployed,
because `__tests__/apiContract.test.mjs` checks every mobile call against a real route.

| # | Package | Files (exclusive) | Requirements |
|---|---|---|---|
| **P1** | The tables, the guard, the PM steps | `app/models.py`, `app/schema_guard.py`, `context/PM_SQL_QUEUE.md`, `features/safety/index.md`, `context/INDEX.md` | R-01 (the table half), R-20 (the table half) |
| **P2** | Report API + the queue | `app/routers/reports_router.py` (new), `app/routers/admin_router.py` (the two new routes **only**), `app/notifications/config.py`, `app/main.py` (one `include_router`), the `_assert_can_view_note` move, `tests/test_reports.py` (new; S-01..S-16) | R-01..R-10 |
| **P3** | Block API + every filter | `app/blocks.py` (new), `app/routers/blocks_router.py` (new), `app/crud.py`, `app/routers/{notes_router,likes_comments,follow_router,profile_router,users_router,userbooks_router,books_router,reading_activity_router,groups_router}.py`, `app/notifications/dispatcher.py`, `app/routers/auth_router.py` (the cascade **only**), `tests/test_blocks.py` (new; B-01..B-36), `tests/test_query_budget.py` (the 24 numbers + the seed) | R-20..R-29 |
| **P4** | Web client | `book-tracker-frontend-stitch/src/{services/api.js,pages/{HomePage,UserProfilePage,GroupDetailPage,SettingsPage,AdminPage}.jsx,components/*,i18n/locales/*}`, `qa/unit/reportAffordance.test.mjs` (new; C-01, C-03..C-07, C-10) | R-05, R-28, R-30 |
| **P5** | Mobile client | `book-tracker-mobile-stitch/{app.json,src/services/api.js,src/screens/{FeedScreen,UserProfileScreen,GroupDetailScreen,SettingsScreen}.js,src/navigation/AppNavigator.js,src/i18n/locales/*}`, `__tests__/reportAffordance.test.mjs` (new; C-02..C-09) | R-05, R-28, R-30 |
| **P6** | The coverage guard | `tests/test_route_coverage.py` (new; B-32) | R-31 item 3 |

**`app/routers/admin_router.py` and `app/routers/auth_router.py` each appear in one package only, by
design.** P2 owns admin_router's two new routes and goes nowhere near the delete routes at `:538-568`;
P3 owns the cascade in auth_router and nothing else in that file. The split that bit Sprint 4F
(`likes_comments.py` in two packages) and Sprint 4G (`auth_router.py` in two) is avoided by giving each
file to one package, which is possible here because the report and block halves barely overlap.

**The one shared file is `app/routers/likes_comments.py`:** P2 moves `_assert_can_view_note` out of it,
P3 adds a branch to that function. **P2 merges first**, so P3 edits the function in its new home. The
merger confirms that in the diff rather than trusting this paragraph.

### Merge and deploy order

1. **P1 merges.** Inert on its own: two SQLModel tables PostgreSQL does not have yet. **Do not deploy
   it with either schema-guard entry until the matching SQL has run.**
2. **PM runs SQL step 10.** Returns the verification output.
3. **Deploy P1 with `("report", "reason")` only.** `/version` check.
4. **P2 merges and deploys.** `POST /reports` is live and nothing calls it. Every one of S-01..S-16
   runs in CI with no network and no secret.
5. **PM runs SQL step 11.** Returns the verification output.
6. **Deploy the `("block", "blocked_id")` guard entry, then P3.** The filters are no-ops while
   `block` is empty, so P3 can be measured on production before any reader can create a block.
7. **P6 merges** with or after P3 — it needs P3's classification to assert against.
8. **P4 and P5 merge, one store release** (E-5), then the submission with the 1.2 table and the
   screenshots.

**Nothing in steps 1–7 is visible to an existing reader.** That is deliberate: it lets the whole
risky half of this sprint deploy, be measured and be corrected while no client can reach it.

---

## Escalations

Eight. **E-1, E-2, E-3 and E-5 block the build.** E-4, E-6, E-7 and E-8 do not block P1–P3 but each
changes something before submission or leaves a recorded gap.

### E-1 — The block's semantics. **BLOCKING.** This is the PM's call, not the architect's.

spec R-20 proposes: **symmetric** in visibility and interaction, **asymmetric** in control, and the
follow graph **deleted** in both directions.

The reason this is escalated rather than decided is the symmetry's cost: **the blocker loses the
blocked reader's content too.** A reader who blocks the wrong person, or who blocks a prolific reader
after one bad comment, gets a quieter app and the only repair is unblocking — which does not bring the
follows back. The options:

- **(a) The proposed rule — symmetric.** The only version that actually stops the blocked reader
  reaching the blocker (§"Symmetric visibility is the only version that answers the requirement"
  enumerates the six endpoints a one-directional block leaves open). Cost: the blocker is deprived
  too. **Recommended.**
- **(b) One-directional** — the blocker stops seeing, the blocked reader does not. Smaller: no filter
  needed on `/profile/{id}`, `/users/{id}/stats`, `/userbooks/user/{id}` or
  `/reading-activity/user/{id}/daily` from the blocked reader's side, so roughly ten of the 24 budget
  rows stop moving. **Recommended against**, firmly: it does not meet Guideline 1.2 item 3 in
  substance, and a reader who used a button labelled Block and was still being watched would be right
  to be angry.
- **(c) Symmetric, but keep the follows** and filter the nine `follow` readers instead. Reversible —
  unblocking restores the relationship — at the cost of nine more filters, nine more budget movements
  and nine more places to leak. **Recommended against** on the "a block that leaks in one query is
  worse than none" rule.
- **(d) Symmetric, delete the follows, and offer "unfollow only"** as a separate, softer action in the
  same menu. The cheapest way to make (a) safe for the mistaken-block case. Costs one menu item and
  one endpoint that already exists (`DELETE /follow/{id}`, `follow_router.py:63`). **Composes with
  (a) and is worth doing.**

**Recommendation: (a) with (d).** What would change it: if the PM expects blocks to be used as a
"quieter feed" tool rather than a safety tool, (c)'s reversibility starts to matter more than the leak
surface — but then the honest feature is a mute, which spec §"Not building" explicitly excludes.

**Nothing in P3 should be built until this is answered.** The semantics are the package.

### E-2 — Circles. **BLOCKING.** There is no obviously right answer.

A and B are both in circle C. Four options:

- **(a) Blocks are not honoured inside circles at all.** A circle is a shared room, and a conversation
  that reads differently for each member is not a conversation. Cheapest: `BQ-36`, `36p`, `37`, `37p`
  stop moving. Cost: A sees B's posts in the one place A cannot leave without leaving their book club.
- **(b) Hide content, leave structure.** What R-26 proposes: posts and activity filtered, Members,
  `member_count` and the leaderboard untouched. The residual is that A still sees B's name in the
  member list and the leaderboard.
- **(c) Hide content and structure.** Also hide B from `GET /groups/{id}/members`. Then
  `member_count` (`groups_router.py:93`, computed by `_member_count` at `:34-40`) and the leaderboard
  totals disagree with the visible list, per viewer. Either the count becomes viewer-dependent — and a
  leaderboard whose totals differ per viewer is not a leaderboard — or it visibly contradicts the
  list. **Recommended against:** it trades a small residual for an arithmetic inconsistency readers
  will notice and report as a bug.
- **(d) A block makes co-membership impossible.** The block ejects the blocked reader from circles the
  blocker **created**, and `POST /groups/{id}/join`, `POST /groups/join/{invite_code}` and
  `POST /groups/{id}/invite/{user_id}` all refuse for a blocked pair. Removes the residual entirely.
  Cost: **one reader's block removes another reader from a group they belong to** — the most powerful
  thing a block would do in this product, and it is doing it to someone who may have done nothing in
  that circle. Also asymmetric in a new way: it matters who created the circle.

**Recommendation: (b).** It is the only option whose residual is a cosmetic one. But (d) is defensible
for a PM who thinks a circle is exactly where harassment would continue, and if (d) is chosen the
ejection needs its own notification decision (is the ejected reader told why?) which is a second
escalation this document does not pre-empt.

### E-3 — What a report does to content before a human looks, and who answers. **BLOCKING.**

Two halves, and the second is the one Apple actually checks.

**(a) The content.** spec R-04 proposes: **nothing** happens to the content; the reporter is offered a
block in the same flow. Alternatives: auto-hide from the reporter only (a third visibility semantic on
top of block and `is_public`); auto-hide globally at N distinct reports. **On 131 readers, N would have
to be 2 or 3 to ever fire**, which makes it a brigading weapon — three accounts can remove any post,
including an editorial bot's (**F7**). **Recommendation: nothing, plus the block.** If the PM wants
auto-hiding, `is_bot` must be excluded and an appeals path becomes required.

**(b) "Timely responses."** This is not a code question and it cannot be answered in a test. Guideline
1.2 asks for a reporting mechanism *with timely responses*, and a queue with no owner and no target is
not one. The PM needs to commit, in `pm-decisions.md`, to:
- **who** reviews reports (today the answer is "the one admin", see E-6),
- **how fast** — a number, e.g. 24 hours,
- **what channel** they are alerted on. R-03 builds the push, which reaches the admin's own phone
  through the existing dispatcher at no new cost. If the PM would rather have email, that is a new
  outbound dependency and a new secret, and it should be decided now rather than after a rejection.

**Recommendation:** the push, 24 hours, one named person, written into `pm-decisions.md` and quoted in
the App Review submission notes. The commitment is the deliverable here, not the code.

### E-4 — Does blocking also remove past likes and comments? *Non-blocking; R-24 ships "no".*

R-24 leaves a like or comment made before the block in place: the blocker's post keeps its honest
counts, and the blocked reader's comment simply stops being visible to the blocker (R-22 row 4).

**The alternative** is to delete them, which is what a reader might expect from "block" — "get them
off my post". It is also destructive to someone else's content on one reader's say-so, it changes a
third party's view of the thread, and it makes the counts on the post wrong relative to the rows.

**Recommendation: ship "no".** Revisit only if readers ask. Named because it is the kind of thing that
gets quietly added during the build.

### E-5 — One sprint or two, and one client release or two. **BLOCKING on the plan, not on the code.**

This document designs both halves because the semantics interlock — spec R-04's mitigation *is* the
block.
Delivering them is another matter. The three options:

- **(a) One sprint, six packages, 8–12 days, one client release.** Longest-running branch this project
  has had, with the fourteen-path filter unreviewed until the end.
- **(b) Two sprints (4I-A Report, 4I-B Block), two client releases.** Cleanest review surface. Cost:
  **two store submissions and two iOS review waits**, and the product is non-submittable between them
  because Guideline 1.2 needs both. Also two chances to be rejected for something unrelated.
- **(c) Two sprints of API work, one client release.** 4I-A's API deploys and is exercised through
  `curl` and the admin page; 4I-B's API deploys behind an empty `block` table; then one client release
  carries both affordances. **Recommended.**

**Recommendation: (c).** It gets the small review surface of (b) with the single store wait of (a),
and it fits the deploy order in §"Merge and deploy order" exactly — steps 1–7 are invisible to readers
by construction, so there is no half-shipped state for a reader to see.

### E-6 — There is one admin, and reports about the admin land in the admin's queue. *Non-blocking; it is an organisational gap, not a code one.*

`admin_router.py:350` pins `_ALLOWED_ADMIN_EMAILS` to a single address, and `:369-370` refuses to grant
`is_admin` to anyone else, so there is exactly one reviewer and they are also a reader with posts of
their own. A report about them is reviewed by them.

This cannot be fixed in code without inventing a second role, which is a bigger change than this
sprint. What the PM should decide: whether a second trusted address is added to
`_ALLOWED_ADMIN_EMAILS`, and if not, that the single-reviewer arrangement is written down so it is a
known risk rather than a discovered one.

### E-7 — `EXPECTED_ENDPOINTS` does double duty in the budget guard. *Non-blocking; it decides whether the new routes are budgeted at all.*

`tests/test_query_budget.py` uses one literal twice: at `:820-823` to assert the budget table covers 44
distinct endpoints, and at `:850-853` to assert that a regex parse of **Sprint 4E's**
`architecture.md` finds 44 `GET` rows. So adding `GET /admin/reports` or `GET /blocks` to the table
raises the literal to 45 and **breaks the parse against another sprint's document**.

Three ways out:

- **(a) Leave the new routes unbudgeted.** What this sprint proposes, and what Sprint 4G concluded for
  `POST /auth/apple`. Both new reads are admin-only or self-scoped and neither is on a hot path.
- **(b) Split the literal** into `EXPECTED_ENDPOINTS` (the table) and `ARCH_ENDPOINTS = 44` (the
  parse). Three lines, and it unsticks every future sprint that adds a read endpoint. **Touching a
  guard to make room for your own work needs to be the PM's decision, not the builder's.**
- **(c) Add rows to Sprint 4E's architecture table** so the parse finds 45. Editing another sprint's
  architecture to make your test pass is how documents drift, and this project has the drift to prove
  it (§"Citations that have drifted").

**Recommendation: (a) now, (b) as a two-line maintenance item in its own commit.** Not (c).

### E-8 — A block cannot apply to an anonymous viewer. *Non-blocking; it is a stated limit.*

`GET /notes/feed` takes `get_current_user_optional` (`notes_router.py:329`), so an unauthenticated
request has no viewer and no block set, and `BQ-08a` measures exactly that branch. A blocked reader who
signs out sees the public community feed like any visitor.

**This is not fixable while the feed is public**, and making the feed private is a product change far
outside this sprint. The existing control for a reader who wants their posts out of the public feed is
`is_private_profile`, which removes them from `crud.get_notes_feed` at the SQL level
(`crud.py:148-149`).

**What the PM should decide:** whether the block confirm copy says so. Saying "they will no longer see
your posts in the app" is true; saying "they will no longer be able to see your posts" is not.
**Recommendation: word it as "in their app", and point a reader who needs more at the private-profile
setting.** The honest wording costs nothing and the dishonest wording is the kind of thing that ends up
in a support thread.
