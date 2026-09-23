---
screen: sprint-4e-query-budget
feature: maintenance
package: P7 — the query-budget guard (R-06, tests.md L-4E-46..50, ST-4E-08)
branch: builder-4e-p7
built: 2026-09-23
files_changed: tests/test_query_budget.py (new)
files_owned_but_untouched: tests/conftest.py
---

# Sprint 4E P7 — the query-budget guard

Scope is the cut sprint (`pm-decisions.md`, 2026-09-23). **No product code was changed.** This
package measures and records; where an endpoint costs more than it should, the number is written
down as a ratchet and left alone.

## What the numbers mean — the thing to get right

Six of the seven packages were dropped, so for all but two endpoints there is **no optimised
"after" count** and `architecture.md`'s "after" column describes work that was never done. Every
row of the table therefore carries a `kind`, as a **column**, and the failure message prints it:

| kind | meaning |
|---|---|
| **ratchet** | "no worse than measured today", on this tree, **with the optimisation not done**. It is not evidence of anything. The architecture's "after" number for that endpoint is still outstanding work. |
| **target** | the measured post-fix count of a package that actually shipped, and it matches the architecture's target. |

Only two endpoints are targets, both from `build-notes-4e-n1.md`: `GET /users/{id}/stats` at **3**
and `GET /groups/my/pending` at **3** (**2** when the reader has nothing pending). Three table rows
carry `target` — BQ-24, BQ-29, BQ-29e — because `/groups/my/pending` has two branch rows.
`TestTableIntegrity::test_only_two_targets_the_rest_are_ratchets` pins that set against a literal,
so nobody can promote a ratchet to a target without doing the work and editing that assertion in
the same commit.

Two more decisions that follow from the cut:

- **`budget == expected` on every row — margin zero, not one.** R-06 permits "at most one". For a
  ratchet, one query of slack is exactly one query of silent regression: "no worse than today"
  means today's number. The margin-of-one rule is still enforced as a ceiling
  (`test_the_table_is_whole` fails a budget more than one above its expected count).
- **A count that falls does not fail.** It prints
  `UNDER: GET /x [branch] ran 2, expected 3 (ratchet) — lower the budget in the same commit that
  earned it`, per `pm-decisions.md`. `tests.md` 7.2 rule 1 ("assert `actual == expected`") and rule
  4 ("a count under `expected` does not fail") contradict each other; rule 4 is the one that matches
  the PM's ratchet, so that is what shipped. Recorded as finding F-P7-01.

## The budget table — 67 rows, 44 endpoints

All 67 rows measured on `seed(scale=1)` (below). `arch. before` is `architecture.md`'s "now"
column, printed in the failure message so it says what was lost.

| BQ | endpoint | branch | kind | budget | arch. before | measured on |
|---|---|---|---|---:|---|---|
| 01 | `GET /version` | — | **ratchet** | 0 | 0 | seed(1) |
| 02 | `GET /profile/me` | signed in | **ratchet** | 5 | 5 | seed(1) |
| 03 | `GET /profile/{id}` | public subject | **ratchet** | 7 | 7 | seed(1) |
| 03p | `GET /profile/{id}` | private, non-follower (locked 200) | **ratchet** | 6 | 7 | seed(1) |
| 03f | `GET /profile/{id}` | private, follower | **ratchet** | 7 | 7 | seed(1) |
| 04 | `GET /userbooks/` | — | **ratchet** | 3 | 3 | seed(1) |
| 05 | `GET /userbooks/{id}` | owner | **ratchet** | 3 | 3 | seed(1) |
| 06 | `GET /userbooks/user/{id}` | public subject | **ratchet** | 4 | 4 | seed(1) |
| 06f | `GET /userbooks/user/{id}` | private, follower | **ratchet** | 5 | 5 | seed(1) |
| 07 | `GET /userbooks/friends/currently-reading` | — | **ratchet** | 6 | 6 | seed(1) |
| 08 | `GET /notes/feed` | signed in | **ratchet** | 8 | 8 | seed(1) |
| 08a | `GET /notes/feed` | anonymous (K-10) | **ratchet** | 6 | 7 | seed(1) |
| 08e | `GET /notes/feed` | empty database (K-03) | **ratchet** | 2 | 2 | empty db |
| 09 | `GET /notes/friends-feed` | — | **ratchet** | 10 | 10 | seed(1) |
| 09e | `GET /notes/friends-feed` | follows nobody | **ratchet** | 2 | 2 | empty viewer |
| 10 | `GET /notes/me` | — | **ratchet** | 8 | 8 | seed(1) |
| 11 | `GET /notes/user/{id}` | public author | **ratchet** | 9 | 9 | seed(1) |
| 11f | `GET /notes/user/{id}` | private author, follower | **ratchet** | 10 | 10 | seed(1) |
| 12 | `GET /notes/userbook/{id}` | owner | **ratchet** | 6 | 6 | seed(1) |
| 13 | `GET /notes/{id}/comments` | — | **ratchet** | 5 | 4 | seed(1) |
| 14 | `GET /books/recommendations` | — | **ratchet** | 12 | 12 | seed(1) |
| 14n | `GET /books/recommendations` | follows nobody | **ratchet** | 4 | 12 | empty viewer |
| 15 | `GET /books/{id}` | — | **ratchet** | 2 | 2 | seed(1) |
| 16 | `GET /books/search` | — | **ratchet** | 2 | 2 | seed(1) |
| 17 | `GET /notifications/unread-count` | — | **ratchet** | 2 | 2 | seed(1) |
| 18 | `GET /notifications/history` | — | **ratchet** | 2 | 2 | seed(1) |
| 19 | `GET /notifications/prefs` | — | **ratchet** | 1 | 1 | seed(1) |
| 20 | `GET /follow/followers` | — | **ratchet** | 2 | 2 | seed(1) |
| 21 | `GET /follow/following` | — | **ratchet** | 2 | 2 | seed(1) |
| 22 | `GET /users/following` | — | **ratchet** | 4 | 4 | seed(1) |
| 22e | `GET /users/following` | follows nobody | **ratchet** | 2 | 2 | empty viewer |
| 23 | `GET /users/search` | q matches several | **ratchet** | 4 | 4 | seed(1) |
| 23e | `GET /users/search` | `q=""` (early return) | **ratchet** | 1 | 1 | seed(1) |
| 24 | `GET /users/{id}/stats` | public subject, 50 finished | **target** | 3 | 3+F | seed(1) |
| 24f | `GET /users/{id}/stats` | private, follower | **ratchet** | 4 | 4+F | seed(1) |
| 25 | `GET /reading-activity/daily` | — | **ratchet** | 2 | 2 | seed(1) |
| 26 | `GET /reading-activity/insights` | — | **ratchet** | 4 | 4 | seed(1) |
| 27 | `GET /reading-activity/user/{id}/daily` | public subject | **ratchet** | 3 | 3 | seed(1) |
| 27f | `GET /reading-activity/user/{id}/daily` | private, follower | **ratchet** | 4 | 4 | seed(1) |
| 28 | `GET /groups/my` | 4 circles | **ratchet** | 6 | 6 | seed(1) |
| 28e | `GET /groups/my` | no circles | **ratchet** | 2 | 2 | empty viewer |
| 29 | `GET /groups/my/pending` | 25 pending | **target** | 3 | 3+n | seed(1) |
| 29e | `GET /groups/my/pending` | none pending | **target** | 2 | 2 | empty viewer |
| 30 | `GET /groups/discover` | public circles not joined | **ratchet** | 7 | 7 | seed(1) |
| 30e | `GET /groups/discover` | none | **ratchet** | 2 | 2 | empty db |
| 31 | `GET /groups/invites/pending` | 1 invite | **ratchet** | 7 | 7 | seed(1) |
| 31e | `GET /groups/invites/pending` | none | **ratchet** | 2 | 2 | empty viewer |
| 32 | `GET /groups/{id}` | public circle | **ratchet** | 8 | 8 | seed(1) |
| 32p | `GET /groups/{id}` | private, active member | **ratchet** | 9 | 9 | seed(1) |
| 33 | `GET /groups/{id}/members` | public | **ratchet** | 4 | 4 | seed(1) |
| 33p | `GET /groups/{id}/members` | private, member | **ratchet** | 5 | 5 | seed(1) |
| 34 | `GET /groups/{id}/leaderboard` | public, monthly | **ratchet** | 8 | 8 | seed(1) |
| 34p | `GET /groups/{id}/leaderboard` | private, member, alltime | **ratchet** | 9 | 9 | seed(1) |
| 34e | `GET /groups/{id}/leaderboard` | no active members | **ratchet** | 3 | 3 | seed(1) |
| 35 | `GET /groups/{id}/goal` | public | **ratchet** | 4 | 4 | seed(1) |
| 35p | `GET /groups/{id}/goal` | private, member | **ratchet** | 5 | 5 | seed(1) |
| 36 | `GET /groups/{id}/posts` | with book cards | **ratchet** | 6 | 7 | seed(1) |
| 36p | `GET /groups/{id}/posts` | private, member | **ratchet** | 7 | 8 | seed(1) |
| 37 | `GET /groups/{id}/activity` | public | **ratchet** | 4 | 4 | seed(1) |
| 37p | `GET /groups/{id}/activity` | private, member | **ratchet** | 5 | 5 | seed(1) |
| 38 | `GET /groups/{id}/pending` | curator | **ratchet** | 4 | 4 | seed(1) |
| 39 | `GET /admin/stats` | — | **ratchet** | 15 | 15 | seed(1) |
| 40 | `GET /admin/users` | — | **ratchet** | 5 | 5 | seed(1) |
| 41 | `GET /admin/books` | — | **ratchet** | 5 | 5 | seed(1) |
| 42 | `GET /admin/follows` | — | **ratchet** | 3 | 3 | seed(1) |
| 43 | `GET /admin/content/notes` | — | **ratchet** | 5 | 5 | seed(1) |
| 44 | `GET /admin/content/comments` | — | **ratchet** | 3 | 3 | seed(1) |

**Seven rows came in under the architecture's "now" number** (03p, 08a, 13, 14n, 36, 36p, and
BQ-29/24 by the two fixes). None of them is an optimisation: 03p, 08a and 14n are branches that
return before part of the work; 13 is one *more* than the architecture said (5, not 4 — the
`_assert_can_view_note` author lookup was not in its count); 36/36p are one fewer because the
architecture's "7 with book cards" assumed a separate userbook and book batch per post shape.
All are recorded at their measured value, as ratchets.

### Row counts each budget was measured at — `seed(scale=1)`

This is the part that decides whether the guard is worth anything. A budget measured on an empty
account is worthless: `/users/{id}/stats` costs 3 queries at zero books **and** 103 at a hundred
books if the loop is back.

| behind this endpoint | rows at seed(1) | rows at seed(10) |
|---|---:|---:|
| `/users/{id}/stats` subject's shelf (finished) | **50** (55 userbooks total) | **500** (505) |
| `/groups/my/pending` pending circles | **25** | **250** |
| followed users (`/users/following`, `/notes/friends-feed`, `/books/recommendations`) | 7 (5 friends, 3 mutual, + 2) | 52 |
| notes visible in `/notes/feed` | 21 in the page (limit 50) | 50 |
| comments on the `/notes/{id}/comments` note | 10 | 100 |
| notifications (`/notifications/history`, `unread-count`) | 20 (12 unread) | 200 (120) |
| reading-activity rows for the caller | 30 days | 300 |
| active members of the measured circles | 5 | 50 |
| pending self-join requests in the curator's circle | 4 | 40 |
| group posts / activity events per circle | 10 / 10 | 100 / 100 |
| public circles for `/groups/discover` | 3 | 30 |

`build-notes-4e-n1.md` measured `/users/{id}/stats` at 0/1/10/50/100 finished books: 3, 4, 13, 53,
103 before the fix, flat 3 after. The budget seed sits at **50**, where a restored loop reads 58
instead of 3 — proven below.

## Cases (5 + 3 table-integrity = 8 test functions, 74 collected)

| case | test | what it pins |
|---|---|---|
| L-4E-46 | `test_query_budget[<BQ>]` (67 params) | every row, on seed(1), through `measure()` |
| L-4E-47 | `test_no_endpoint_scales_with_row_count` | 52 rows re-measured on seed(10); any difference fails even under budget |
| L-4E-48 | `test_empty_accounts_keep_their_early_returns` | the 8 `if not rows: return []` guards, by count not by body |
| L-4E-49 | `test_priming_the_reader_does_not_change_any_count` | K-09 — the only case that does not prime |
| L-4E-50 | `test_the_guard_fails_loudly` | the R-06 message format, and that no bound parameter leaks into it |
| ST-4E-08 | `TestTableIntegrity::test_the_table_covers_the_architectures_44_endpoints` | the table is a superset of architecture.md's 44 rows, parsed from the file |
| — | `TestTableIntegrity::test_the_table_is_whole` | **67 rows / 44 endpoints against literals** — a parametrised test with zero params is silently green; this is the only thing that catches it |
| — | `TestTableIntegrity::test_only_two_targets_the_rest_are_ratchets` | the target set, against a literal list |

Collected count: **546 → 620**, up by exactly 74, so the new file loaded (the trap where an
unimportable symbol voids a whole file with one error and no assertions).

## Harness

* **Its own databases (K-03).** Three private shared-cache in-memory databases — small, large,
  empty — each with its own engine, `QueuePool` and `check_same_thread=False` copied from conftest
  for F-66's reason. conftest's shared database has 100+ public notes seeded by `test_notes.py`, so
  `/notes/feed` can never be empty there and `/admin/*` counts depend on file order. The module
  restores `app.dependency_overrides` exactly on teardown.
* **None of conftest's `alice`/`bob`/`admin` fixtures are used** — they belong to the other
  database; a request with their token would 401 here and the row would "pass" at 1 query.
  `measure()` asserts the status code **before** comparing any count.
* **The P1 trap.** Starlette's TestClient runs background tasks inside `client.get()`, so a naive
  counter charges the reader for the deferred `last_active` write. `app.deps._persist_user_touch`
  is wrapped; the recorder records where the request phase ends and every number above is the
  request phase only. Without this, every budget would be one statement and one checkout too high
  on the first request of a reader's local day, and L-4E-49 could not exist.
* **`_use(db)` rebinds the app's overrides**, so the client is rebuilt immediately before each
  measurement. Holding a "small client" and a "large client" at the same time makes both talk to
  whichever database was wired last — L-4E-47 compared a seed with itself and passed until this was
  fixed. Noted because it is an easy regression for whoever edits that case next.
* **Zero `varies` rows.** `tests.md` 7.2 allowed two: BQ-14 (`/books/recommendations`, A-4's two
  shapes) and BQ-39f (`/admin/stats`, A-5's fallback). Both belonged to dropped packages, so
  neither shape exists on this tree and both rows assert exactly. BQ-39f is dropped entirely
  (finding F-P7-02), which is why the table has 67 rows and not tests.md's 68.
* `tests/conftest.py` is owned by this package but **needed no change**; `poolclass=QueuePool` is
  intact (F-66).

## Mutation proof (house rule)

Every row: green → mutate → run → red → revert → green. Actual first red line quoted.

| # | file | mutation | case(s) that went red | actual red output |
|---|---|---|---|---|
| **M-46** | `app/routers/notes_router.py` | add one `db.exec(select(func.count(models.User.id))).one()` to `get_feed` | L-4E-46 [08], [08a], [08e]; L-4E-48 | `AssertionError: GET /notes/feed [signed in] ran 9 queries, budget 8 (ratchet), expected 8 (was 8 before Sprint 4E).` — statement 2 of the printed list is `SELECT count(user.id) AS count_1 FROM user` |
| **M-47** | `app/routers/groups_router.py` | restore the per-circle `count(*)` in `get_my_pending_groups` (the N+1) | L-4E-46 [29]; L-4E-47 | `AssertionError: GET /groups/my/pending [25 pending] ran 28 queries, budget 3 (target), expected 3 (was 3+n before Sprint 4E).` and, from L-4E-47, `BQ-29 GET /groups/my/pending [25 pending]: 28 queries on the small seed, 253 on the large seed — this endpoint scales with row count` |
| **M-47b** | `app/routers/users_router.py` | drop the outer join in `get_user_stats`, restore `userbook.book` per row (the other N+1) | L-4E-46 [24], [24f]; L-4E-47 | `AssertionError: GET /users/3/stats [public subject, 50 finished] ran 58 queries, budget 3 (target), expected 3 (was 3+F before Sprint 4E).` and `BQ-24 …: 58 queries on the small seed, 508 on the large seed — this endpoint scales with row count` |
| **M-48** | `app/routers/notes_router.py` | delete `if not notes: return []` | L-4E-46 [08e]; L-4E-48 | `AssertionError: GET /notes/feed [empty database (K-03)] ran 5 queries, budget 2 (ratchet), expected 2 (was 2 before Sprint 4E).` — the printed statements show the three engagement batches running against `IN (SELECT 1 FROM (SELECT 1) WHERE 1!=1)` |
| **M-49** (= M-01) | `app/deps.py` | 4C's plain assignments **and** `db.add(user); db.commit()` back inside `get_current_user` | L-4E-49 | `AssertionError: the first request of a reader's local day costs more than a later one — P1's deferred last_active write is back on the request path:` then `GET /profile/me unprimed 7 statements / 2 checkouts, primed 5 / 1`, with `UPDATE user SET last_active=? WHERE user.id = ?` second in the list |
| **M-50** | `tests/test_query_budget.py` | change the reporter's format string (`[branch]`→`(branch)`, `ran`→`used`, `budget`→`limit`) | L-4E-50 | `AssertionError: message did not match the R-06 format: 'GET /profile/me (signed in) used 5 queries, limit 0 (ratchet), expected 0 (was 5 before Sprint 4E).'` |
| **M-T1** (added) | `tests/test_query_budget.py` | delete BQ-44 from `BUDGETS` | `test_the_table_is_whole`; ST-4E-08 | `AssertionError: the budget table has 66 rows, expected 67. Rows were added or removed without updating the literal — a trimmed table is how this guard rots.` and `AssertionError: the budget table does not cover: ['GET /admin/content/comments']` |
| **M-T2** (added) | `tests/test_query_budget.py` | relabel BQ-39 `RATCHET` → `TARGET` without doing P6 | `test_only_two_targets_the_rest_are_ratchets` | `AssertionError: targets are ['GET /admin/stats', 'GET /groups/my/pending', 'GET /users/{id}/stats']; only the two N+1 loops that shipped (build-notes-4e-n1.md) are targets. Everything else is a ratchet.` |
| **M-T3** (added) | `tests/test_query_budget.py` | shrink the stats subject's shelf from 50 finished books to 1 | L-4E-47 | `AssertionError: the stats subject has only 1 finished books; a budget measured there could not tell 3 queries from 3 + F` |

**M-49 needed correcting, and the correction is itself a finding (F-P7-04).** Applied as
`tests.md` M-01 words it — "restore `if dirty: db.add(user); db.commit()`" — while leaving P1's
`set_committed_value()` calls in place, the mutation is **green**: the committed value already
equals the new value, so the flush finds no net change and emits no `UPDATE`. The mutation only
bites when the `set_committed_value()` calls are also reverted to plain assignments. That is
exactly the load-bearing detail P1's build notes name, and it means a future edit that
"simplifies" `set_committed_value` back to `user.timezone = reported` **and keeps the background
task** would still be caught (the task would then double-write), but an edit that changes only
the commit would not. L-4E-49 as written catches the whole-revert case, which is the realistic one.

**M-T3 is the mutation that matters most for this package**, because it is the only one that
tests the guard's premise rather than the product. With the seed shrunk to one finished book,
M-47b's restored N+1 costs 4 queries against a budget of 3 — still red, but barely; at zero
finished books it costs 3 and the guard would have passed a live N+1. The seed size is part of
the contract, which is why it is asserted inside L-4E-47 rather than left as a comment.

## Gates

- `pytest tests/test_query_budget.py -q`: **74 passed** in ~5 s.
- `pytest tests -q`: **546 passed, 0 failed** before (7m41s) → **620 passed, 0 failed** after.
  `--collect-only` reports 546 → 620, up by exactly 74.
- G-4E-05 (the module does not leak its engine): `pytest tests/test_query_budget.py tests -q`
  gives the same totals as the default order, so `app.dependency_overrides` is restored.
- `git diff --stat` on product code: **empty**. The only change in this package is the new test
  file. `tests/conftest.py` untouched, `poolclass=QueuePool` intact.

## Findings — things in the plan that are wrong

**F-P7-01 — `tests.md` 7.2 contradicts itself, and contradicts `pm-decisions.md`.** Rule 1 says
the guard asserts `actual == expected`; rule 4 says a count under `expected` does not fail.
`pm-decisions.md` says a count that drops is "a chance to lower the budget, not a failure". Rule 4
and the PM agree, so the guard fails only when a count **rises** and prints an `UNDER:` line
otherwise. Rule 1's exactness is preserved where it actually earns its keep — branch rows
(public/private, empty/populated, curator/member) each get their own row rather than one `<=`.

**F-P7-02 — BQ-39f cannot be measured on this tree, and is dropped.** It is `/admin/stats`'s A-5
fallback path, which belongs to P6. P6 was descoped, `/admin/stats` is still the fourteen-scalar
version, and there is no combined statement to fall back from. The three `try/except` blocks that
do exist (`Journal`, `Like`, `Comment`) are not that fallback. Keeping a row that asserts
`<= 16` against a path that does not exist would be the exact rot the plan warns about, so the
table is 67 rows, not 68. G-4E-04's `73 passed` is likewise stale: the file collects **74**
(67 rows + 5 cases + 3 table-integrity, of which L-4E-46 is the parametrised 67 and ST-4E-08 is one
of the three).

**F-P7-03 — the guard cannot cover `varies` at all, because neither `varies` row's alternative
shape exists.** BQ-14 (`/books/recommendations`) is a `varies` row only because A-4 permitted two
query shapes; A-4 was P4, dropped. It measures 12 exactly and is a plain ratchet.
`0 varies rows` is the honest count on this branch, not `2`.

**F-P7-04 — `tests.md` M-01/M-49 does not go red as worded.** See the mutation table above.
Recorded, not worked around.

**F-P7-05 — the brief's baseline of "543 passed" is stale for this tree.** `builder-4e-p7` has
both merges (`8d458d5` P1, `c36bf7f` the two N+1 loops). 535 + 8 (P1) + 3 (N+1) = **546**, which is
what `pytest tests -q` reports. 543 is P1's number before the N+1 package merged.

**F-P7-06 — three budget rows are higher than `architecture.md` says they are "now", which means
the architecture's "now" column is not reliable as a baseline.** `GET /notes/{id}/comments` is 5,
not 4 — the architecture's count missed `_assert_can_view_note`'s author lookup
(`likes_comments.py:21`). `GET /groups/{id}` is 8 public / 9 private as stated, but only because
this seed deliberately gives the circles a creator other than the caller: when `created_by` is the
caller, `_serialize_group`'s creator lookup is answered from the identity map and the endpoint
measures one query cheaper than it costs any other reader. A budget taken on a self-created circle
would have been a query too generous. Recorded in the seed with a comment.

**F-P7-07 — endpoints that are over their architecture target, recorded and NOT fixed** (this
package writes guards, it does not optimise). The largest gaps, all ratchets:
`/admin/stats` 15 vs target 2; `/books/recommendations` 12 vs 4; `/notes/friends-feed` 10 vs 4;
`/notes/user/{id}` 9/10 vs 4; `/groups/{id}` 8/9 vs 4; `/notes/feed` 8 vs 3; `/notes/me` 8 vs 3;
`/groups/{id}/leaderboard` 8/9 vs 5; `/profile/{id}` 7 vs 3; `/groups/discover` 7 vs 3;
`/groups/invites/pending` 7 vs 3; `/userbooks/friends/currently-reading` 6 vs 3;
`/groups/my` 6 vs 3; `/notes/userbook/{id}` 6 vs 3; `/profile/me` 5 vs 3. Those are the dropped
P2–P6 packages, and these ratchets are the fence that stops them getting worse while they wait.

**F-P7-08 — `GET /groups/my/pending` is a target at 3 but `/groups/invites/pending` next door is a
ratchet at 7.** Same shape of data, same router, one was in scope and one was not. Worth knowing
when P5 is re-opened: the invite list still does five batch queries the pending list no longer
needs.

## Adjacent things noticed and deliberately NOT fixed

- `app/deps.py` lines 25–35 still hold the dead `get_current_user` stub P1 and N1 both flagged.
  Still nobody's package.
- `app/routers/groups_router.py` `_member_count` (one `count(*)` per call) is still used by
  `_serialize_group`, so `GET /groups/{id}` pays for it once per request; `/groups/discover`
  still fetches up to 200 circles and filters in Python. Both are the dropped part of P5, both are
  now fenced by BQ-32/32p and BQ-30.
- `/admin/stats` filters `status == "completed"` and `status == "want_to_read"`, which nothing in
  the app writes (K-05). The budget rows do not depend on it; the value case that would have
  caught it was L-4E-40, in dropped P6.
