---
package: P1 — request plumbing (R-01, R-02)
branch: builder-4e-p1
built: 2026-09-23
files_changed: app/deps.py, app/database.py, tests/test_local_day.py, tests/test_dependencies.py
stack: the pinned one (.venv) — fastapi 0.95.2, starlette 0.27.0, SQLAlchemy 1.4.41, sqlmodel 0.0.8, pytest 9.0.2
---

# Sprint 4E P1 — the once-a-day touch leaves the request path

Scope is the cut sprint (`pm-decisions.md`, 2026-09-23): **R-01 and R-02 only**. Nothing outside
`app/deps.py` and `app/database.py` was touched in product code.

## What changed

### R-01 — `last_active` / `timezone` are persisted after the response

`get_current_user` still does exactly 4C's computation, in 4C's order (the reported zone is put in
place **before** the local-day comparison, D-1). What changed is where the write happens:

- the new values go into the in-memory `user` with
  `sqlalchemy.orm.attributes.set_committed_value()`, so the rest of the request sees the new zone
  and the new `last_active` **without the instance becoming dirty**;
- when something changed, `get_current_user` adds a `BackgroundTasks` task —
  `_persist_user_touch(bind, user_id, timezone, last_active)` — which opens its **own** `Session`
  on the bind the request's session was using (`db.get_bind()`), re-reads the row, applies the two
  fields and commits.

**Why `set_committed_value` and not a plain assignment.** A plain assignment leaves the request's
`Session` dirty, and SQLAlchemy's autoflush then emits the `UPDATE` on the route's very next
`db.exec(...)` — inside the request, which is the cost R-01 exists to remove — and any handler that
commits would write it for real. `set_committed_value` writes the loaded value without history, so
no flush, no commit, no in-request `UPDATE`. This is the load-bearing detail of the package; a
future edit that "simplifies" it back to `user.timezone = reported` silently undoes R-01 and is
exactly mutation M-01.

**Why the task takes a bind and not a `Session`.** FastAPI 0.95.2 runs `yield`-dependency teardown
*after* background tasks, FastAPI ≥ 0.106 *before* them (tests.md K-02). Opening its own session
makes the task correct on either, and L-4E-04 asserts the identity rather than only the outcome, so
the test does not quietly pass on 0.95 for the wrong reason. Taking the *bind* rather than the
module-level engine is also what keeps the task honest under test: `tests/conftest.py` swaps the
engine through `app.dependency_overrides`, which a background task cannot see.

Safety under a stale row: `timezone` is written unconditionally (it is what the device just
reported); `last_active` only if the stored value is still behind the local day the request
computed, so a newer touch is never moved backwards. A row deleted between the response and the
task is an explicit `if user is None: return`, not a bare `except`.

Login is untouched: `POST /auth/google` and `POST /auth/review-login` still write `last_active`
inline and unconditionally (R-01's last bullet, L-4E-06).

**The one constraint this creates, checked:** because the new zone is now only in memory during the
request, a handler that calls `db.commit()` (which expires the identity map) and *then* reads
`current_user.timezone` would see the stored zone, not the reported one. Every current reader of
the caller's zone was checked and none does that: `reading_activity_router.py:39,81` are GETs with
no commit; `userbooks_router.py:92` reads the zone **before** its commit; `users_router.py:220` and
`reading_activity_router.py:247` use the *subject's* zone, read from the database, which is
unaffected; `notifications/dispatcher.py:67` runs in a background task queued after
`get_current_user`'s, so the row it reads has already been written. A future handler that commits
first and asks for the zone second would need the zone captured before the commit.

### R-02 — `pool_pre_ping` is now a decision on the record

`app/database.py`: the value is unchanged (`True`). A comment immediately above it names the
measured cost (one `SELECT 1` per checkout, 170–200 ms), the reason (Supabase closes idle
connections and `pool_recycle=300` discards by **age**, not idle time) and the revisit condition
(co-location; re-measure, and under 5 ms it needs no further thought). `tests/test_dependencies.py
:: test_pool_pre_ping_decision_is_written_down` asserts all three are within 10 lines of the
setting, so the comment cannot rot away silently (ST-4E-02).

## Measured query counts (post-fix, this branch)

Harness: `tests/conftest.py`'s engine and overrides with a `before_cursor_execute` counter and a
`checkout` counter, and `app.deps._persist_user_touch` wrapped to mark where the request phase
ends — Starlette's TestClient runs background tasks **inside** the `client.get()` call, so a naive
counter charges the reader for a write that happens after the response. Numbers below are the
request phase only, which is what the reader actually waits for.

Reader: zone `Asia/Kolkata`, `last_active` = yesterday, so the first request is the first of the
reader's local day. "second" is the next request the same local day.

| endpoint | first: statements / checkouts | second: statements / checkouts | deferred a write |
|---|---|---|---|
| `GET /profile/me` (no books) | 4 / 1 | 4 / 1 | yes |
| `GET /profile/me` (1 finished book) | **5 / 1** | **5 / 1** | yes |
| `GET /notifications/unread-count` | 2 / 1 | 2 / 1 | yes |
| `GET /reading-activity/daily?days=30` | 2 / 1 | 2 / 1 | yes |
| `GET /userbooks/` | 2 / 1 | 2 / 1 | yes |
| `GET /users/following` | 2 / 1 | 2 / 1 | yes |
| `GET /groups/my` | 2 / 1 | 2 / 1 | yes |

**Before P1, on the same seeded reader** (measured by running mutation M-01, which restores the 4C
in-request write): `GET /profile/me` first-of-day = **6 statements / 2 checkouts**, later = 4 / 1.
That is the architecture's measured 6-and-2 vs 4-and-1 reproduced exactly, and the three round
trips R-01 names (the `UPDATE`, the second checkout, the identity-map re-`SELECT`) are all visible
in the statement list the failure prints.

### Notes for P7 (budgets)

- These counts are on a **minimal** account, not P7's `seed_small()`, so they are **not** budget
  values for most endpoints — P7 must measure on its own seed. The number that is P1's deliverable
  is the *relationship*: first request of the local day == later request, and one checkout either
  way, on every authenticated endpoint.
- `GET /profile/me` = **5** statements with at least one userbook (the `book` batch query appears),
  **4** with none. That matches the architecture's "5 before P2" and tests.md's "`n_first == 5`
  before P2". P2, if it ever ships, takes it to 3.
- `GET /notifications/unread-count` = **2** (authentication + the count), which is the floor E-1
  and E-5 describe. P1 does not move it; it only stops it being 4-and-2 on the first call of the
  day, which is the call the nav bar usually makes first.
- After P1 the priming in `_queries_for` / `measure()` is unnecessary but must stay (K-09). L-4E-49
  is the case that proves it, and it belongs to P7.

## Tests added (8)

| case | test | file |
|---|---|---|
| L-4E-01 | `test_first_request_of_the_local_day_costs_the_same_as_the_second` | `tests/test_local_day.py :: TestLastActiveDeferred` |
| L-4E-02 | `test_touch_is_persisted_after_the_response` | same |
| L-4E-03 | `test_reported_zone_is_used_by_the_same_request_that_reported_it` | same |
| L-4E-04 | `test_the_task_uses_its_own_session_not_the_requests` | same |
| L-4E-05 | `test_task_never_moves_last_active_backwards` | same |
| L-4E-06 | `test_login_still_writes_last_active_inline` | same |
| ST-4E-02 | `test_pool_pre_ping_decision_is_written_down` | `tests/test_dependencies.py` |

`tests/test_dependencies.py` also gained `test_get_session_is_get_db`, which pins F-67's alias that
the P1 brief says this file enforces and which it did not actually assert.

4C's `TestLastActive` and `TestZoneHeader` are **not edited** (R-07 / RG-4E-10).

## Mutation proof (house rule)

Every mutation was applied to the product code, run, observed red, and reverted; the suite was
green again after each revert.

| # | file | mutation | case | actual first red line |
|---|---|---|---|---|
| M-01 | `app/deps.py` | restore `if dirty: db.add(user); db.commit()` in place of the background task | L-4E-01 | `AssertionError: first request of the local day ran 6 statements and 2 checkouts, second ran 4 and 1 (must be equal)` — and it prints the statement list, `UPDATE user SET last_active=? WHERE user.id = ?` second in it |
| M-02 | `app/deps.py` | drop the background task entirely (compute, mutate in memory, never persist) | L-4E-02 | `AssertionError: last_active in the database is 2026-09-20 06:00:00, expected 2026-09-21 06:00:00` |
| M-03 | `app/deps.py` | move the in-memory `user.timezone = reported` into the task | L-4E-03 | `AssertionError: day buckets computed for UTC, expected Asia/Kolkata (last bucket 2026-09-17, expected 2026-09-18)` |
| M-04 | `app/deps.py` | the task closes over the request `Session` (`db` passed instead of `db.get_bind()`) | L-4E-04 | `AssertionError: the background task must open exactly one Session of its own — assert 0 == 1` |
| M-05 | `app/deps.py` | the task writes `last_active` unconditionally | L-4E-05 | `AssertionError: last_active moved backwards: 2026-09-21T09:00:00 -> 2026-09-21 06:00:00` |
| M-06 | `app/routers/auth_router.py` (scratch, reverted) | route the review-login write through `_persist_user_touch` | L-4E-06 | `AssertionError: last_active unchanged immediately after POST /auth/review-login` |

On M-04, tests.md predicts `ResourceClosedError` *or* a green pass on FastAPI < 0.106, and says
that is why (b) must assert object identity. On the pinned 0.95.2 the outcome is the second one —
the request session is still open when the task runs, so the write succeeds — and the identity
assertion is what makes the case red. The plan anticipated this; it is recorded here because the
quoted "first red line" in tests.md section 8 is the other branch.

## Findings

1. **tests.md L-4E-01 is not literally implementable as written.** It asks for statements and
   checkouts "on `GET /profile/me`" with the deferred write in place, but Starlette's TestClient
   runs background tasks inside the client call, so a plain counter sees the task's `SELECT` +
   `UPDATE` and its checkout, and assertions (a), (b) and (d) would all fail against a *correct*
   implementation. The harness therefore wraps `app.deps._persist_user_touch` to record where the
   request phase ends and asserts on that prefix. This is a harness correction, not a loosened
   assertion: the case still fails, with the plan's own wording, under M-01.
2. **The P1 brief's baseline of "540 passed, about 16 minutes" does not match this tree.** The
   measured pre-change baseline on `builder-4e-p1` is **535 passed, 0 failed in 7m25s**, which is
   the figure tests.md derived statically (531 `def test` − 1 parametrised + 5 values = 535) and
   the 4C figure it cites. Nothing is missing; the 540 appears to be a stale number.
3. **`tests/test_dependencies.py` did not assert `get_session is get_db`.** The brief states it
   does. It asserted only that every `app.database` dependency reachable from a route is a
   generator — true but weaker (a second, separate generator would pass). Added as
   `test_get_session_is_get_db`.
4. **Pre-existing dead code in `app/deps.py`, left alone.** Lines 25–35 define a stub
   `get_current_user(db, token=Depends(...))` that the real definition below shadows, with a
   duplicate `from typing import Optional` / `from .database import get_db`. It is harmless but it
   does mean `tests/test_local_day.py :: TestStaticRules :: test_seam_used_in_every_4c_path`
   inspects two AST nodes named `get_current_user`. Not this package's call to delete — flagged for
   whoever owns a cleanup.
5. **R-01's third cost is gone for free.** The architecture lists
   `profile_router.py:40` / `notifications/router.py:231,251`'s `db.get(User, current_user.id)` as
   "no code change needed; P1 is what makes them free". Confirmed: with no commit in the request,
   the identity map survives and those are 0 statements — visible as the missing re-`SELECT` in the
   M-01 red output.

## Gates

- `pytest tests -q`: **535 passed, 0 failed in 7m25s** before, **543 passed, 0 failed in 6m38s**
  after (+8 = the
  seven cases above plus `test_get_session_is_get_db`). `--collect-only` reports **543 collected**,
  up by exactly eight, so no test file silently failed to load.
- Files changed: `app/deps.py`, `app/database.py` (owned), `tests/test_local_day.py`,
  `tests/test_dependencies.py` (assigned by tests.md §1). No other product file.
- `tests/conftest.py` untouched — `poolclass=QueuePool` intact (F-66).
- `app/database.py`'s `get_session = get_db` untouched (F-67), and now asserted.
