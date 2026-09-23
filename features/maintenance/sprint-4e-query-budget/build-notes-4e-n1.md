---
screen: sprint-4e-query-budget
feature: maintenance
package: the two N+1 loops (the only surviving part of P2 and P5 after the 2026-09-23 descope)
branch: builder-4e-n1
built: 2026-09-23
---

# Sprint 4E — the two N+1 loops

Scope, from `pm-decisions.md`: **only** the two loops whose cost grows with row count.
Nothing else in `users_router.py` or `groups_router.py` was touched. In particular the
Follow-gate fold (L-4E-10 / M-10) and `group_context` (L-4E-31..33) are **not** built —
they are part of the dropped bulk of P2 and P5.

## What changed

| file | function | change |
|---|---|---|
| `app/routers/users_router.py` | `get_user_stats` (`GET /users/{id}/stats`) | the shelf fetch became `select(UserBook, Book).outerjoin(Book, Book.id == UserBook.book_id)`; the page total now reads the joined `Book` instead of the lazy `userbook.book` |
| `app/routers/groups_router.py` | `get_my_pending_groups` (`GET /groups/my/pending`) | the per-circle `count(*)` in the list comprehension became one grouped OUTER join; the `status == "active"` predicate sits in the **ON** clause so a circle with no active members still appears with `0` |

Both joins are OUTER on purpose. An INNER join would silently drop rows — proven by
mutations M-11 and M-34b below. `.order_by(ReadingGroup.id)` was added with the `GROUP BY`
so the row order stays the de-facto order the old `WHERE id IN (...)` scan produced;
without it the grouped plan is free to reorder.

**No response body changed.** Same keys, same types, same values.

## Measured query counts (before → after)

Counted with the F-08 `before_cursor_execute` listener on the test engine, one count per
statement sent to the cursor, after a priming request that absorbs the once-per-local-day
`last_active` UPDATE. The count includes the `get_current_user` auth SELECT.

### `GET /users/{id}/stats` (subject ≠ caller, public profile)

| finished books on the shelf | before | after |
|---:|---:|---:|
| 0 | 3 | **3** |
| 1 | 4 | **3** |
| 10 | 13 | **3** |
| 50 | 53 | **3** |
| **100** | **103** | **3** |

Before = 3 + F, exactly as `spec.md` says. After = flat 3 (auth · user row · the joined
shelf). Architecture target 3, budget 4 — met at 3.

### `GET /groups/my/pending`

| pending circles | before | after |
|---:|---:|---:|
| 0 | 2 | **2** |
| 1 | 4 | **3** |
| 5 | 8 | **3** |
| **25** | **28** | **3** |
| 50 | 53 | **3** |

Before = 3 + n. After = flat 3 (auth · memberships · the joined circles+counts). The
empty case is still 2 because the `if not memberships: return []` guard fires first — that
guard is untouched. Architecture target 3, budget 3 — met at 3.

**For P7:** these are post-fix numbers, not ratchets. `/users/{id}/stats` → 3 and
`/groups/my/pending` → 3 (2 empty) are genuine targets and should be recorded as such.

## Tests added

| case | file | what it pins |
|---|---|---|
| L-4E-11 | `tests/test_users_stats_values.py :: TestUserStatsValues` | all seven stat values on a mixed shelf, including the row whose book is missing |
| L-4E-12 | `tests/test_users_stats_values.py :: TestUserStatsQueryCount` | 5 finished books and 50 finished books cost the same, and ≤ 4 |
| L-4E-34 | `tests/test_groups.py :: TestPendingGroupsQueryCount` | 4 and 29 pending circles cost the same and ≤ 3; per-row `member_count` excludes pending members; a 0-active circle survives; a pending **invite** stays out |

Collected test count rose from **535** to **538** — +3, matching the three cases added, so
no file failed to import (the trap where an unimportable symbol silently voids a whole
file). Full run: **538 passed, 0 failed, 7m24s**.

**The 540 in the package brief is wrong for this tree.** `pytest tests --collect-only -q`
with the three new cases excluded returns **535**, which is exactly the figure tests.md's
front-matter derived statically (531 `def test` − 1 parametrised + 5 values). 535 → 538 is
the real before/after; nothing was lost.

## Mutation proof

Every row was run: green → mutate → red → revert → green.

| mutation | where | test | first red line |
|---|---|---|---|
| **M-11** (as written in tests.md) | `users_router.py` `.outerjoin(Book…)` → `.join(Book…)` | L-4E-11 | `AssertionError: total_books == 7, expected 8` |
| **M-12′** (see finding F-N1-02) | `users_router.py` — drop the join, restore `select(UserBook)` + `ub.book` | L-4E-12 | `AssertionError: 5 finished books cost 8 queries, 50 cost 53 (must be equal)` |
| **M-34** (as written in tests.md) | `groups_router.py:301` — restore the per-circle `count(*)` in the comprehension | L-4E-34 | `AssertionError: 4 pending circles cost 7 queries, 29 cost 32 (must be equal)` |
| **M-34b** (added) | `groups_router.py` — move `status == "active"` from the ON clause to the WHERE | L-4E-34 | `AssertionError: got circles [1, 2, 3], expected [1, 2, 3, 4]` |
| **M-34c** (added) | `groups_router.py` — drop the `status == "active"` predicate entirely | L-4E-34 | `AssertionError: circle 1 member_count == 5, expected 2` |

### Proof the new tests fail against the **unmodified** handlers

Both count cases were written and run **before** either fix existed, on `HEAD`:

- `L-4E-12`: `AssertionError: 5 finished books cost 8 queries, 50 cost 53 (must be equal)` —
  and the printed statement list showed statements 4..8 as identical `SELECT book…` lazy loads.
- `L-4E-34`: `AssertionError: 4 pending circles cost 7 queries, 29 cost 32 (must be equal)` —
  statements 4..8 identical `SELECT count(group_member.id) … WHERE group_member.group_id = ?`.

L-4E-11 passed against the unmodified handler, which is correct: it is a
behaviour-preservation case, and its mutation (M-11) can only exist once the join does.

## Findings — things in the plan that are wrong

**F-N1-01 — L-4E-11's seed is impossible, and its expected values do not add up.**
The case asks for "one finished userbook whose `book_id` is null". `userbook.book_id` is
`NOT NULL` in every schema this app has (`app/models.py:77` declares it as a non-Optional
`int`; `create_tables.sql:35` is `INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE`).
That row cannot be created anywhere. The reachable equivalent, which the test uses, is a
userbook whose `book` row is absent (SQLite does not enforce the FK). Separately the
case's own arithmetic is inconsistent: 4 finished + 2 reading + 1 to-read + 1 extra
finished row = **8** userbooks and **5** finished, but the case asserts `total_books == 7`
and `finished == 4`, while `total_pages == 1125` only holds if the extra row exists and
contributes 0. The test asserts the arithmetically correct 8 / 5 / 1125.

**F-N1-02 — M-12 does not go red, and cannot.**
tests.md names M-12 as "restore `userbook.book` lazy access inside the loop". Applied on
top of the join it is **green**: the OUTER join has already put those `Book` objects in
the session's identity map, and SQLAlchemy's many-to-one lazy loader resolves a simple FK
from the identity map without emitting SQL. The mutation that actually exercises the loop
is dropping the join (M-12′ above), which is red at 8 vs 53. Recorded rather than fixed —
this is a defect in the mutation, not in the test. (It also means the fix is robust to a
later edit that reaches `userbook.book` again, except for a row whose book is missing,
which would cost one extra query. The handler uses the joined `Book` so that cannot happen.)

**F-N1-03 — `/groups/my/pending`'s architecture target of 3 is only reachable by joining
the circles and the counts into one statement.** The `/groups/my` pattern the file already
uses (a separate `GROUP BY` statement) would land at 4, over the stated budget of 3. The
single grouped join is what this package shipped. It selects whole `ReadingGroup` rows
while grouping by the primary key, which PostgreSQL 9.1+ allows by functional dependency
and SQLite allows unconditionally. No `FILTER (WHERE`, no `DISTINCT ON` — ST-4E-06 clean.

**F-N1-05 — `GET /groups/my/pending` had no test at all before this package.**
`grep -rn "my/pending" tests/` returned nothing outside `invites/pending`. The endpoint is
consumed by both clients (`book-tracker-frontend-stitch/src/services/api.js:318`,
`book-tracker-mobile-stitch/src/services/api.js:159`). Same shape of hole as K-01, one
router over. `TestPendingGroupsQueryCount` now covers the row set, the member counts and
the invite filter as well as the count.

**F-N1-04 — spec/architecture `/users/{id}/stats` "after = 3" assumed the Follow-gate
fold.** With the fold descoped, 3 still holds for a **public** subject (auth · `db.get`
user · shelf). A **private** subject viewed by a follower still costs 4, because the
`Follow` lookup at `users_router.py:195-204` is untouched. P7's budget row `BQ-24f`
(private, follower) should stay at 4, and it is a ratchet, not a target, until the fold is
re-opened.

## Adjacent things noticed and deliberately NOT fixed

- `app/deps.py` lines 26-36 contain a dead, half-written `get_current_user` stub
  (`token: str = Depends(...)`, body `...`) that is shadowed by the real one below it.
  Harmless today; it is P1's file, not this package's.
- `groups_router.py` still has `_member_count` (one `count(*)` per call) used by other
  handlers, and `/groups/discover` fetches up to 200 circles and filters in Python. Both
  are the dropped part of P5.
