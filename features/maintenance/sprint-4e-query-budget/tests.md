---
screen: sprint-4e-query-budget
feature: maintenance
test_plan_written: 2026-09-21
last_run: —
pass_rate: —
written_by: Senior QA (before Builder; branch HEAD b245acf is docs only — no 4E product or harness code exists)
sources: spec.md (R-00..R-08), architecture.md (authoritative — the 44-endpoint table, packages P1–P7, escalations E-1..E-6, security review, test strategy), qa/reports/page-perf-2026-09-21.md and .json (post-4D re-measure, master 66ce145), qa/reports/page-perf-2026-09-19.md (the 4D baseline the architecture's table was summed from), app/server_timing.py, tests/conftest.py, tests/test_notes.py (TestNoteQueryCount, `_queries_for`, `query_counter`), and product code read at b245acf for gates and values (app/deps.py, app/database.py, app/crud.py, app/routers/{profile,users,notes,likes_comments,userbooks,books,reading_activity,groups,admin}_router.py, app/notifications/router.py). House style: features/maintenance/sprint-4d-page-speed/tests.md (branch sprint-4d-page-speed) — its mutation table and its "harness corrections" section.
baseline_measured: 2026-09-21 in the worktree. `git branch --show-current` → `sprint-4e-query-budget`; `git log --oneline -1` → `b245acf`. **pytest could not be run here**: `.venv/Scripts` holds only the activate scripts and `dotenv.exe`, and the ambient Python 3.11 has no `pytest` (`ModuleNotFoundError`). The suite size was therefore checked statically: 531 `def test` across `tests/*.py`, one `@pytest.mark.parametrize` (`test_local_day.py:1252`, 5 values) → **531 − 1 + 5 = 535 collected**, which matches the 4C figure in the brief. The gate below still requires a real run. Ambient stack: fastapi 0.136.3, sqlmodel 0.0.25, **SQLAlchemy 2.0.43** — see K-02.
---

## How to read this plan

- Section 0 is the decisions and findings. Everything after it assumes section 0.
- Cases are grouped by work package (P1–P7), the same packages the architecture defines, so a Builder reads only their own section plus section 0, section 2 and the gates.
- **Ids.**
  - `L-4E-NN`: a case. One series, numbered in package order.
  - `M-NN`: the one-line product change that must turn `L-4E-NN` red. **The numbers match**: M-17 is L-4E-17's mutation. Guard-level mutations are M-46..M-50.
  - `BQ-NN`: a row of the query-budget table (section 7.1). Rows are data, not cases; the whole table is asserted by L-4E-46.
  - `ST-4E`: static check. `P-4E`: production check. `RG-4E`: regression row. `G-4E`: gate.
- **Severity:** Critical = privacy, ownership, auth, data loss, feature dead. Major = a promise of the sprint not kept, or a value silently wrong. Minor = defensive or cosmetic. **Privacy and ownership cases are Critical and are never downgraded**, including when the merge that threatens them is "only a performance change".
- **Priority:** P0 ship blocker · P1 fix within the sprint · P2 nice to have.
- **Every Critical and Major case names a mutation** and the exact first red line. Section 8 is the table the Builders fill in. **A mutation that no test catches blocks the merge** — house rule since 2026-09-18, when five agent-written tests passed while the product was broken. This sprint is the most exposed the house has been to that failure mode: fourteen of the changes replace a set of values with one aggregate, and the tests that guard them today assert key sets only (K-05).
- "Expected" is what spec.md and architecture.md promise as amended by section 0, not what the code does today.
- Where a case says "unchanged", the assertion is against a **captured before value**, not against a literal typed into the test. Section 2.5 gives the capture helper.

---

## 0. Decisions, findings and escalations — read before building

### 0.1 Escalations — PM decisions (2026-09-21, all following the architecture's recommendation)

| # | Decision | What this plan does because of it |
|---|---|---|
| **E-1** | **Leave the per-request user lookup in `get_current_user`.** It is a security control: it is simultaneously the authentication check, the account-still-exists check, the admin check and 4C's zone source. | Every authenticated budget row includes exactly **one** auth query and says so. `GET /notes/feed` gets a second row measured **anonymously** (BQ-08a) — it is the only route on `get_current_user_optional`, so it is the only place the auth query's presence is observable as a difference. `/notifications/unread-count` stays at budget 2 and L-4E-39 asserts the floor is authentication + count, not a payload size. |
| **E-2** | **Move the `last_active` write after the response** (`BackgroundTasks`, its own `Session`), keeping 4C's once-per-local-day semantics. | P1 cases L-4E-01..06. The in-request mutation of the in-memory `user` stays, so 4C's `test_header_persisted_before_last_active_compared` keeps passing unedited (L-4E-03). L-4E-04 pins A-2: the task must not touch the request's session. |
| **E-3** | **Keep `pool_pre_ping=True`**, with the measured cost, the reason and the revisit condition written into `app/database.py`. | ST-4E-02 is a static check on `app/database.py:33`: the value is still `True` and a comment within 10 lines names the measured cost, the Supabase idle-close reason and the co-location revisit condition. P-4E-09 measures `total;dur − db;dur` on `/version` in production so the number in that comment stays checkable. |
| **E-4** | **The possibly-missing indexes are a separate PM step. 4E creates none, and this plan assumes none.** | No case, no budget row and no timing expectation here depends on an index existing. `npm`-style "it got faster" is never an assertion: every gate in this plan is a **statement count**, which is index-independent. The read-only `pg_indexes` query in the architecture is recorded as P-4E-10, **reported not asserted**, so the PM has the answer when they take that step. `context/supabase_migration.sql` and `schema_guard.REQUIRED_COLUMNS` must be byte-identical at the end of the sprint (ST-4E-05). |
| **E-5** | **Out of scope, logged as F-75** (the 60 s `/notifications/unread-count` poll). | No case. RG-4E-11 only records that the endpoint still answers and still costs 2. |
| **E-6** | **Out of scope, logged as F-76** (`/profile/me` fetched twice on `/profile` and `/settings`). | No case. The budget table counts one `/profile/me`; the page totals in section 7.3 count it twice, as the pages actually send it, so the "after" page numbers stay honest. |

### 0.2 What 4E has to fix, in the numbers 4D left behind

`qa/reports/page-perf-2026-09-21.md` (master `66ce145`) is the post-4D re-measure. It matters to this plan because it is the evidence for what 4E must now deliver, and it is the only place where 4D made something **worse**:

| page | 09-19 (pre-4D) | 09-21 (post-4D) | 4D's effect |
|---|---:|---:|---|
| Home feed `/home` desktop ready | 5.40 s | **5.99 s** | **+0.59 s** |
| Home feed `/home` mobile ready | 8.14 s | **9.40 s** | **+1.26 s** |
| Admin `/admin` desktop ready | 4.56 s | **5.05 s** | **+0.49 s** |
| everything else (13 signed-in pages) | 58.99 s total | 45.92 s total | −22 % desktop, −15 % mobile |

The report's own diagnosis, which this plan adopts: 4D starts a page's calls at once, so `/books/recommendations` (12 queries) and `/notes/feed` (8 queries) now **contend** for a 5-connection pool in front of a database ~200 ms away, instead of queueing behind each other. Parallelism did not create the cost; it exposed it. 4E is the half that turns it into a gain — recommendations 12 → 4 and the feed 8 → 3 remove 13 of the 20 queries the home page's parallel batch fires at that pool.

**So this plan states the expected effect on those two pages as a release gate, not as a hope** — P-4E-06 (Home) and P-4E-07 (Admin), section 6.3. Both are secondary to the query counts, which are deterministic; the timings are noisy and are asserted as a band with a re-run rule.

### 0.3 Findings from writing this plan

Ten. **K-01, K-02, K-04, K-05 and K-06 need an answer before the relevant package is built.** Each carries the resolution this plan assumes until told otherwise.

| # | Finding (evidence, read at `b245acf`) | Recommended resolution — and what this plan assumes | Owner |
|---|---|---|---|
| **K-01** | **Critical coverage hole: `GET /userbooks/user/{id}` has no test anywhere in `tests/`.** `grep -rn "userbooks/user" tests/` returns **nothing**. P4 rewrites exactly that handler's private-profile gate (`userbooks_router.py:493-498` — user fetch, then a *conditional* `Follow` lookup, then 403) into "user row + `is_following` flag, always". The architecture's security review lists this endpoint in its second row but the "test that must go red" column names only `test_notes.py` / `test_follow_profile.py` / `test_reading_activity.py` cases, **none of which touch `/userbooks/user/{id}`**. If P4 drops that `raise`, every test in the suite still passes and a private reader's whole shelf becomes public. | **New Critical case L-4E-24**, written as a *new* test (`tests/test_books.py :: TestUserbookPrivacy`), red-first against a scratch mutation of today's code (M-24). It is the one genuinely new privacy test this sprint needs. Note this is a pre-existing hole, not one 4E creates — but 4E is what makes it dangerous. | QA → P4 |
| **K-02** | **Major, environment: the stack the suite runs on is not the stack `requirements.txt` pins.** Installed here: fastapi **0.136.3**, sqlmodel **0.0.25**, SQLAlchemy **2.0.43**. `requirements.txt` (UTF-16LE, which is why `grep` misses it) pins `fastapi==0.95.2`, `sqlmodel==0.0.8`, `SQLAlchemy==1.4.41`; a stray `requirements.txt.txt` beside it pins sqlalchemy 2.0.x. The architecture's `depends_on` says "SQLAlchemy 1.4.x". Two things in 4E straddle that boundary: (a) `union_all` over `LIMIT`-carrying branches is spelled differently in 1.4 and 2.0; (b) **FastAPI runs `BackgroundTasks` *before* `yield`-dependency teardown from 0.106 onward and *after* it below that** — which is precisely assumption A-2, the one R-01's design rests on. | **The design is safe either way** (the task opens its own `Session`, so it never depends on the request session still being open) and L-4E-04 asserts that directly, so this does not block. But the gate output must make the stack visible: **G-4E-01 prints `pip freeze | grep -iE "^(fastapi|sqlmodel|sqlalchemy)="` above the pytest line**, and the PM confirms which of the two pinnings production installs. If production really installs 1.4.41/0.95.2, every count in the architecture's table was measured on a stack production does not run, and A-1 needs re-testing before merge. | PM / Architect |
| **K-03** | **Major, harness: the empty-state budget rows cannot be measured on the shared conftest database.** `tests/conftest.py` uses one shared in-memory SQLite DB for the whole session, and `test_notes.py` seeds 100+ public notes into it. `/notes/feed`'s early return is `if not notes: return []` (`notes_router.py:265`) and `crud.get_notes_feed` is **global** — it is not scoped to the caller — so once any module has run, an empty feed is unreachable and the architecture's "empty-account costs 1–2 queries" row is unmeasurable. The same shared DB also makes `/admin/stats` totals depend on which test files ran first. | **`tests/test_query_budget.py` owns its own engine** (section 2.2): a second named shared-cache in-memory database, swapped into `app.dependency_overrides` by a module-scoped autouse fixture and restored on teardown. The counter listens on *that* engine. This makes empty states real, makes counts independent of test-file order, and makes the SMALL/LARGE seeds exact. It is a departure from the architecture's "module-scoped fixture" wording and is the single largest harness decision in this plan. | QA |
| **K-04** | **Major: `/groups/{id}/leaderboard` will silently return a table of zeros if the merged statement throws.** `groups_router.py:936-957` wraps both aggregates in `try: ... except Exception: finished_map = {}` / `pages_map = {}`. P5 merges those two into one `UNION ALL`. If that statement is invalid on PostgreSQL but fine on SQLite (A-4's exact risk), production swallows the error and every member shows `books_finished: 0, pages_read: 0` — **with the full key set intact and rank still computed**. The only existing leaderboard tests are `TestGroupLeaderboard::test_leaderboard_returns_members` (asserts `isinstance(r.json(), list)`) and `TestGroupsRegression`'s key set (`test_groups.py:371-372`). Neither would notice. | **L-4E-35 is a value case and is mandatory**, and P5 must either (a) not put the merged statement inside the existing `except`, or (b) make the `except` fall back to the current two-query path, as `/admin/stats` is required to do. A bare `except` that yields zeros is a defect in this sprint even though it is pre-existing code. ST-4E-04 is a static check that no new bare `except:` appears and that no `except` clause in a touched router assigns an empty dict or zero without re-running a fallback query. | Architect → P5 |
| **K-05** | **Major: all fourteen `/admin/stats` values are unasserted today, and two of them are structurally zero.** `TestAdminRegression::test_stats_and_lists_unchanged` asserts `set(stats.json().keys()) == STATS_KEYS` and nothing else. Worse for a value test: `/admin/stats` filters `status == "completed"` (`admin_router.py:118`) and `status == "want_to_read"` (`:123`), but **the rest of the app only ever writes `to-read` / `reading` / `finished`** (`userbooks_router.py:29` is `Literal["to-read", "reading", "finished"]`; `import_router.py:60` maps to `finished`). So `books_completed` and `books_wishlist` are 0 for every row any test can create through the API, and a merged statement that dropped those two filters, or aliased them to another subquery, would be caught only by luck. | **L-4E-40 asserts all fourteen as deltas** (before → seed → after), not absolutes — the shared DB makes absolutes meaningless, and the budget module's own engine (K-03) is not used by `test_admin.py`. **The seed writes legacy `status="completed"` and `status="want_to_read"` rows directly through the ORM**, so those two aggregates are non-zero and distinguishable from `total_userbooks`, `books_being_read` and each other. **Their present-day values are the contract** (R-00): P6 must not "fix" the vocabulary mismatch. If the PM wants it fixed, that is a separate step with its own response-change review. | QA → P6 |
| **K-06** | **Major: R-00 and R-06 contradict each other about editing `tests/`.** R-00: "no test file in `tests/` is edited to loosen an assertion. Editing one is a defect, not a fix." R-06: "the older, looser numbers in `TestNoteQueryCount` are tightened to match." Both cannot be read literally. | Read as: **no assertion may be loosened; tightening the five `assert n_b <= X` ceilings in `tests/test_notes.py :: TestNoteQueryCount` is the only permitted edit to an existing test file this sprint.** New values: feed `<= 8 → <= 4`, friends-feed `<= 10 → <= 5`, me `<= 8 → <= 4`, user `<= 9 → <= 5`, userbook `<= 6 → <= 4` (`test_notes.py:967, 986, 1001, 1016, 1035`). **G-4E-08 enforces it**: `git diff --stat tests/` at the end of the sprint shows `tests/test_query_budget.py` (new), `tests/conftest.py`, and `tests/test_notes.py` with **5 changed lines and nothing else**, plus the new files this plan adds (K-01's `TestUserbookPrivacy`, the P2/P5/P6 value classes). Doc Sync reconciles the two requirement texts. | Doc Sync / QA |
| K-07 | Minor: the architecture's `/users/{id}/stats` row and `/profile/*` rows count books with `status == "finished"` (`users_router.py:240`, `profile_router.py:51`), while `/admin/stats` counts `"completed"`. A single seed helper used by both value cases would give wrong expectations for one of them. | Section 2.6 defines **two** seed vocabularies and names which case uses which. No shared "seed a finished book" helper crosses that line. | QA |
| K-08 | Minor: the private-profile gate on **`GET /profile/{id}` is not a 403** — it returns **200 with `locked: true, stats: null`** (`test_follow_profile.py:273-278` documents this explicitly, and the 4A build notes record the earlier misstatement). spec.md's R-08 says "403/locked" and is right; the Done Checklist item 5 correctly lists only the four content endpoints as 403. | L-4E-09 asserts the locked-200 shape for `/profile/{id}` and 403 for the four content endpoints. No case asserts 403 on `/profile/{id}`. | — |
| K-09 | Minor: `_queries_for` in `test_notes.py:97` primes with one extra request to absorb the daily `last_active` write. After P1 that priming is unnecessary. It must stay: a guard that assumes P1 is correct cannot also be the thing that catches P1 regressing (the architecture says the same). | Priming stays in both the old helper and the new guard. **L-4E-49** is the separate case that asserts primed == unprimed, and it is the only place that assumption is tested. | — |
| K-10 | Info: `GET /notes/feed` is the only route on `get_current_user_optional` (`notes_router.py:259`). Anonymously it runs no auth query and takes no my-likes branch. | BQ-08a measures it anonymously; L-4E-17 asserts the anonymous body still carries `liked_by_me: false` on every row and that the INNER-join privacy filter still applies with no viewer. | — |

---

### PM resolutions of section 0 (2026-09-21)

- **K-02 is withdrawn — its premise is wrong.** The interpreter that runs this suite is `.venv\Scripts\python.exe`, and it has **pytest 9.0.2 installed** and **exactly the pinned versions**: `fastapi 0.95.2`, `starlette 0.27.0`, `SQLAlchemy 1.4.41`, `sqlmodel 0.0.8`, matching `requirements.txt` (UTF-16). The QA agent inspected a different Python, found no pytest there, and inferred a version mismatch that does not exist. **Build for FastAPI 0.95.2 semantics** — in particular, a dependency's `yield` teardown runs *after* background tasks on this version, the opposite of 0.106+. Every count in the architecture was measured on the stack production runs. Always run tests as `C:/Users/sonal/Documents/projects/book-tracker/.venv/Scripts/python.exe -m pytest`.
- **K-01 accepted, and it is the most valuable find in this plan.** `GET /userbooks/user/{id}` has no test anywhere, and P4 rewrites its private-profile gate: deleting that `raise` today leaves the whole suite green while a private reader's shelf goes public. L-4E-24 / M-24 are mandatory, and P4 does not merge until M-24 is demonstrated red.
- **K-03 accepted.** The budget tests own their engine, with G-4E-05 checking it does not leak.
- **K-04 accepted, and M-35 blocks the sprint if it stays green.** `groups_router.py:936-957` swallows leaderboard failures into `{}`, so a `UNION ALL` that is valid on SQLite and invalid on PostgreSQL would serve a leaderboard of zeros with the key set and ranks intact — and every existing test would pass.
- **K-05 accepted as written.** `/admin/stats`'s `books_completed` and `books_wishlist` filter on `completed` / `want_to_read`, which this app never writes, so both are structurally 0. **4E must not change the vocabulary**: its job is to cut queries, and the present values are the contract. Logged separately as F-77 for a product decision.
- **K-06..K-10 accepted** as resolved in this plan.

## 1. Summary

| Package | Files it owns | New cases | Where they live | Gate |
|---|---|---:|---|---|
| **P1** Request plumbing | `app/deps.py`, `app/database.py` | **6** — L-4E-01..06 | `tests/test_local_day.py :: TestLastActiveDeferred` (new class, same file as 4C's), `tests/test_dependencies.py` | G-4E-03 |
| **P2** Profile, users, follows | `profile_router.py`, `users_router.py` | **9** — L-4E-07..15 | `tests/test_follow_profile.py :: TestFollowAggregateValues`, `tests/test_users_stats_values.py` (new) | G-4E-03 |
| **P3** Notes, likes, comments | `notes_router.py`, `likes_comments.py`, `crud.py` | **7** — L-4E-16..22 | `tests/test_notes.py :: TestMergedJoinPrivacy`, `:: TestEngagementValues` | G-4E-03 |
| **P4** Library, books, activity | `userbooks_router.py`, `books_router.py`, `reading_activity_router.py` | **8** — L-4E-23..30 | `tests/test_books.py :: TestUserbookPrivacy` (K-01), `tests/test_reading_activity.py :: TestAggregateValues` | G-4E-03 |
| **P5** Circles | `groups_router.py` | **8** — L-4E-31..38 | `tests/test_groups.py :: TestGroupContextGate`, `:: TestLeaderboardValues` | G-4E-03 |
| **P6** Notifications, admin | `notifications/router.py`, `admin_router.py` | **7** — L-4E-39..45 | `tests/test_admin.py :: TestAdminValueRegression`, `tests/test_notifications_api.py` | G-4E-03 |
| **P7** The guard | `tests/test_query_budget.py` (new), `tests/conftest.py` | **5** — L-4E-46..50, over **68 budget rows** | `tests/test_query_budget.py` | G-4E-04 |
| Regression wall | — | 0 new (existing suites, **unedited**) | section 5 | G-4E-02, G-4E-08 |
| Static | ST-4E-01..08 | — | section 4 | G-4E-06 |
| Production | P-4E-01..10 | — | section 6 | release |

**50 cases. 47 of them are Critical or Major and carry a mutation** (L-4E-27, 41 and 50 are Minor). **17 are Critical**: 09, 10, 16, 17, 19, 20, 21, 23, 24, 29, 31, 32, 33, 39, 45, plus 03 and 06 (4C behaviour that a mis-placed background task silently destroys) and 46 is Major only because the privacy cases carry the privacy weight.

---

## 2. Harness mechanics — `tests/test_query_budget.py` (new, P7-owned)

### 2.1 What counts a query

The same `before_cursor_execute` listener the production `Server-Timing` header uses (`app/server_timing.py:25`) and the same one `tests/test_notes.py:86 :: query_counter` has used since F-08. **One callback per statement sent to the DBAPI cursor**, counted regardless of verb, so an `UPDATE` from the `last_active` touch counts like a `SELECT`. `executemany` counts once — which is correct here, since it is one round trip.

```python
class BudgetCounter:
    """Counts and records every statement executed on the budget engine."""
    def __init__(self):
        self.statements = []          # normalised text, in order
    @property
    def n(self):
        return len(self.statements)
    def reset(self):
        self.statements.clear()
    def _before(self, conn, cursor, statement, parameters, context, executemany):
        self.statements.append(" ".join(statement.split())[:160])
```

Registered with `event.listen(budget_engine, "before_cursor_execute", counter._before)` and removed in the fixture's `finally`. **Never on the `Engine` class** — that would also count the other modules' engine and make the number depend on nothing.

A **second** listener counts pool checkouts, which R-01 needs and which a statement counter cannot see:

```python
@event.listens_for(budget_engine, "checkout")
def _checkout(dbapi_conn, record, proxy): checkouts.append(1)
```

### 2.2 The budget module owns its engine (K-03)

```python
BUDGET_DB_URL = "sqlite:///file:budgetdb?mode=memory&cache=shared&uri=true"
budget_engine = create_engine(BUDGET_DB_URL, connect_args={"check_same_thread": False},
                              poolclass=QueuePool)
SQLModel.metadata.create_all(budget_engine)

@pytest.fixture(scope="module", autouse=True)
def _own_database():
    prev = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _budget_session
    app.dependency_overrides[get_session] = _budget_session
    try:
        yield
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(prev)
```

Rules that follow from this and are not optional:

- **`tests/test_query_budget.py` uses none of conftest's `alice` / `bob` / `admin` / `*_headers` fixtures.** They are bound to the other database and would silently create a user that does not exist in this one (the request would 401 and the case would "pass" at 1 query). The module builds its own users. **A case whose request does not return the expected status code fails before any count is compared** — section 2.4.
- `QueuePool` and `check_same_thread=False` are copied from conftest for the reason its comment gives (`SingletonThreadPool` closes other threads' connections above 5 threads).
- conftest's autouse `pinned_now` still applies, so the local-day seam is pinned here too.
- The module restores `dependency_overrides` exactly; `test_reading_activity.py` runs after it alphabetically and must see the shared DB again. **G-4E-05 runs `pytest tests -q` twice, once with `-p no:randomly`-style default order and once with `tests/test_query_budget.py` named first**, and both must give the same total. A leak shows up as a mass failure in the module that follows.

### 2.3 Priming (K-09)

```python
def measure(client, method, url, headers=None, expect=200):
    r0 = client.request(method, url, headers=headers)      # prime: absorbs the daily last_active write
    assert r0.status_code == expect, f"{method} {url} primed with {r0.status_code}, expected {expect}"
    counter.reset(); checkouts.clear()
    r = client.request(method, url, headers=headers)
    assert r.status_code == expect, f"{method} {url} returned {r.status_code}, expected {expect}"
    return counter.n, list(counter.statements), len(checkouts), r
```

The prime stays after P1 lands. L-4E-49 is what proves it has become unnecessary; it is deliberately a *different* case from the budget rows so that a P1 regression fails one named test rather than shifting 68 numbers at once.

### 2.4 The failure message

R-06 requires the endpoint, the budget and the actual count. The exact first line, which the mutation table quotes verbatim:

```
GET /notes/feed [signed in] ran 6 queries, budget 4, expected 3 (was 8 before Sprint 4E).
A query was added to this endpoint, or a batched load became per-row.
Statements:
  1. SELECT "user".id, "user".email ... WHERE "user".email = ?
  2. SELECT note.id ... JOIN "user" ON "user".id = note.user_id WHERE note.is_public = 1 ...
  3. SELECT note_id, count(id) FROM "like" WHERE note_id IN (?, ?, ?) GROUP BY note_id
  ...
```

Printing the statements is what makes the failure actionable; the counter already holds them. The list is truncated at 160 characters per statement and at 40 statements, so an N+1 regression prints a readable head rather than 200 lines.

### 2.5 Capturing "unchanged" (R-00's mechanism)

No value case types an expected JSON literal for a whole body. Each uses:

```python
def capture(client, url, headers):           # run against the pre-merge code, stored in the case
    return client.get(url, headers=headers).json()
```

For **P2–P6 value cases the comparison is inside one test run**, not across commits: the case seeds known data, computes the expected number in Python from the seeded rows (`sum(b.total_pages for b in seeded if b.status == "finished")`), and asserts the endpoint's value equals it. That is what makes the case survive a re-baseline and what makes it red for a mis-aliased subquery. Cross-commit before/after JSON diffs (R-00's third bullet) are a **Junior QA gate**, G-4E-07, not a pytest case: `scripts/` is not extended for it, the diff is taken with the `dump_endpoints` helper in section 6.4.

### 2.6 Seeds

Three, all built by the budget module or the value case that needs them. **Never shared across the status-vocabulary line (K-07).**

- **`seed_small()`** — the architecture's realistic account, at the small size: 12 users, 30 books, 8 userbooks each, 2 notes per userbook, follows in both directions (including 3 mutual pairs), likes and comments on a third of the notes, 20 notification rows (12 unread), reading activity for 30 local days, 3 circles (one public, one private, one where the caller is curator), active + pending members, one pending self-join and one pending invite per caller. **Every conditional branch has data**, so no endpoint is measured on an accidental early return.
- **`seed_large()`** — the same shape with each collection multiplied by 10 (so ≥ 50 rows behind every list endpoint, ≥ 50 finished books on the stats subject, ≥ 25 pending circles). Used only by L-4E-47.
- **`seed_empty_viewer()`** — a fresh user with no follows, no circles, no notes, no notifications. Used by the empty rows. On the budget module's own engine (K-03) the whole database can also be emptied, which is the only way BQ-08e (`/notes/feed` empty) is measurable at all.
- **Status vocabulary:** `to-read` / `reading` / `finished` everywhere **except** `/admin/stats`, `/admin/books` and `/admin/users` value cases, which additionally seed legacy `completed` and `want_to_read` rows through the ORM (K-05).

---

## 3. Cases

### 3.1 P1 — request plumbing (R-01, R-02) — 6 cases

Files: `app/deps.py`, `app/database.py`. Tests live in `tests/test_local_day.py :: TestLastActiveDeferred` (new class beside 4C's `TestLastActive`, which is **not edited**) and `tests/test_dependencies.py`.

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4E-01** | reader with `last_active` set to **yesterday** in their zone (`freeze_at`, zone `Asia/Kolkata`); count statements **and pool checkouts** on `GET /profile/me` with no priming; then immediately count the second request | (a) `n_first == n_second` (b) `checkouts_first == checkouts_second == 1` (c) `n_first == 3` after P2, `== 5` before it — the case asserts **equality between the two**, never an absolute, so P1 lands and passes before P2 exists (d) no statement matching `^\s*UPDATE\s+"?user"?` appears in either request's list | **M-01** `app/deps.py:90`: restore `if dirty: db.add(user); db.commit()` in place of the background task → `FAIL L-4E-01 first request of the local day ran 6 statements and 2 checkouts, second ran 4 and 1 (must be equal)` | Major P0 |
| **L-4E-02** | reader with `last_active` = yesterday, zone `Asia/Kolkata`, `pinned_now` at 06:00 UTC (= 11:30 IST); `GET /notifications/unread-count`; after the response, re-read the user **from a new `Session`** | (a) the response body is the normal one (b) `user.last_active` in the database is the seam's `utcnow()`, i.e. `localday.local_date(last_active, zone) == localday.local_today(zone, now)` (c) a **second** request the same local day writes nothing: capture `updated_at`-free evidence by asserting no `UPDATE "user"` statement is executed on the engine during it (d) a request on the **next** local day (`freeze_at` +1 day) writes again | **M-02** `deps.py`: drop the `BackgroundTasks` task entirely (compute, mutate in memory, never persist) → `FAIL L-4E-02 last_active in the database is 2026-09-20T…, expected 2026-09-21T06:00:00` | Major P0 |
| **L-4E-03** | 4C's ordering. Reader whose stored `timezone` is `UTC`; one request carrying `X-Timezone: Asia/Kolkata` to an endpoint whose body depends on the zone (`GET /reading-activity/daily?days=7`) | (a) the response is computed with **`Asia/Kolkata`**, in the same request that reported it — identical to the body 4C produces today (b) the persisted `timezone` is `Asia/Kolkata` after the response (c) `tests/test_local_day.py :: TestZoneHeader :: test_header_persisted_before_last_active_compared` passes **unedited** | **M-03** `deps.py`: move the in-memory `user.timezone = reported` assignment into the background task, leaving the request to use the old zone → `FAIL L-4E-03 day buckets computed for UTC, expected Asia/Kolkata (first bucket 2026-09-21, expected 2026-09-22)` | Critical P0 |
| **L-4E-04** | A-2 / K-02. Reader with `last_active` = yesterday; a request to any authenticated route; the background task instrumented so the case can see which `Session` it used (assert on `id(session)` recorded by a monkeypatched session factory, or simply that the write succeeds **after** the request session is closed) | (a) `last_active` is persisted (b) the object the task wrote through is **not** the request's `Session` (c) the task still succeeds when the request's `yield` dependency has already torn down — asserted by running under the installed FastAPI and by a direct unit call of the task function with the request session explicitly closed | **M-04** `deps.py`: the task closes over the request's `db` instead of opening its own → `FAIL L-4E-04 background task raised on a closed session: ResourceClosedError`, or on a FastAPI below 0.106 it passes — which is why (b) asserts the object identity, not only the outcome | Major P0 |
| **L-4E-05** | Race and staleness. Reader with `last_active` = yesterday; between the response and the task running, the row is changed by another session (`timezone` set to `Europe/Berlin`, `last_active` set to today) | (a) the task does not raise (b) `timezone` is written unconditionally (the value the header reported) (c) `last_active` is **not** moved backwards: it is written only if still behind the computed local day (d) two concurrent first-of-day requests leave exactly one `last_active` value, and neither 500s | **M-05** `deps.py`: task writes `last_active` unconditionally → `FAIL L-4E-05 last_active moved backwards: 2026-09-21T09:00:00 → 2026-09-21T06:00:00` | Major P1 |
| **L-4E-06** | Login stays inline. `POST /auth/review-login` and `POST /auth/google` (stubbed verifier, as `tests/test_auth.py :: TestGoogleLoginLastActive` does) for a reader whose `last_active` is already today | (a) `last_active` is updated **inline and unconditionally** — asserted by reading the row immediately after the response with no background task having a chance to run (b) `tests/test_auth.py :: TestGoogleLoginLastActive` and `TestReviewLogin::test_last_active_set_to_today` pass **unedited** | **M-06** `auth_router.py:90` (scratch): route the login write through the same background task → `FAIL L-4E-06 last_active unchanged immediately after POST /auth/review-login` | Critical P0 |

> **Why 03 and 06 are Critical.** Neither is privacy, but both are 4C semantics that a background task silently destroys and that no reader would report: a wrong zone changes which day a reading streak falls on, and a missing login touch silences the inactivity reminder. R-07 says 4C is not to be undone; a Major would let them be deferred.

**ST-4E-02** covers R-02 (the `pool_pre_ping` comment) — section 4.

### 3.2 P2 — profile, users, follows (endpoints 2, 3, 22, 23, 24) — 9 cases

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4E-07** | `GET /profile/me`. Reader with **3** followers and **5** following, none mutual; plus a shelf of 4 finished / 2 reading / 1 to-read with known `total_pages` | (a) `stats.followers == 3`, `stats.following == 5` — the two `len()`-ed row fetches became one aggregate and the numbers are unchanged (b) `total`, `finished`, `reading`, `to_read` and the pages total equal the values computed from the seed (c) the key set equals `TestProfileRegression`'s, and every Android alias (`totalBooks`, `toRead`, `reading_goal`, `average_rating`, `books_this_year`, `projected_finish_date`) is present with its current value (d) zero follower / zero following gives `0`, not `None` | **M-07** `profile_router.py:45-47`: swap the two aggregate columns → `FAIL L-4E-07 stats.followers == 5, expected 3` | Major P0 |
| **L-4E-08** | `GET /profile/{id}`, four relationship combinations in one case: (i) A follows B only (ii) B follows A only (iii) mutual (iv) neither | per combination: (a) `is_following` (b) `follows_you` (c) `followers_count` (d) `following_count` all equal the seeded truth — these are the four `Follow` queries the merge collapses into one statement, and swapping any two of them is invisible to a key-set test | **M-08** `profile_router.py:212-224`: swap the `is_following` and `follows_you` expressions in the merged statement → `FAIL L-4E-08 (i) is_following=False follows_you=True, expected True/False` | Major P0 |
| **L-4E-09** | Private profile, `/profile/{id}`. B sets `is_private_profile=True`; A does not follow B, then follows | (a) non-follower: **200** with `locked is True` and `stats is None` (K-08) — and **no** `email`, `password_hash`, `notification_prefs` or `deletion_reason` key anywhere in the body, at any nesting depth (b) follower: `locked` is absent/False and `stats` is populated (c) B viewing B is never locked (d) `TestProfileMeNoPII` and `test_private_profile_locked_for_non_followers` pass unedited | **M-09** `profile_router.py:204`: build the response from the joined row mapping (`dict(row._mapping)`) instead of field by field → `FAIL L-4E-09 (a) forbidden key 'email' present in GET /profile/{id} body` | Critical P0 |
| **L-4E-10** | Private profile, `/users/{id}/stats`. Same setup | (a) non-follower → **403** (b) follower → 200 (c) self → 200 (d) a **public** profile's stats are 200 for a stranger — proving the now-unconditional Follow flag did not start refusing public profiles | **M-10** `users_router.py:195-204`: delete the `raise HTTPException(403)` after folding the flag in → `FAIL L-4E-10 (a) GET /users/{b}/stats → 200, expected 403` | Critical P0 |
| **L-4E-11** | `/users/{id}/stats` values, N+1 removal. Subject with a mixed shelf: 4 `finished` books of 100/200/300/400 pages (two of them `updated_at` inside 30 days, one in the previous calendar year in the **subject's** zone), 2 `reading` with `current_page` 50 and 75, 1 `to-read`, **and one finished userbook whose `book_id` is null** | (a) `total_books == 7` (b) `finished == 4` (c) `reading == 2` (d) `to_read == 1` (e) `last_month == 2` (f) `this_year == 3` (g) `total_pages == 1000 + 125 == 1125` (h) the null-book row contributes 0 and does not 500 — this is the LEFT-join case the lazy load used to hide | **M-11** `users_router.py:240`: change the join to INNER so the null-book row disappears → `FAIL L-4E-11 (a) total_books == 6, expected 7` | Major P0 |
| **L-4E-12** | `/users/{id}/stats` N+1 **by count** (R-05). Subject with **5** finished books → measure; add **45** more finished books → measure again. Both measured through `measure()` | (a) `n_small == n_large` (b) `n_large <= 4` (c) the two responses differ only in the expected numbers (`total_books` 5→50), proving the second request really did more work | **M-12** `users_router.py:240-241`: restore `userbook.book` lazy access inside the loop → `FAIL L-4E-12 5 finished books cost 3 queries, 50 cost 48 (must be equal)` | Major P0 |
| **L-4E-13** | `/users/search?q=`. Four users matching the query, one in each relationship combination with the searcher | (a) each row's `is_following` and `is_mutual` (or whichever flags the endpoint returns today — captured, not invented) match the seeded truth (b) the searcher is excluded (c) `q=""` still returns `[]` without running the merged statement (d) key set unchanged | **M-13** `users_router.py:53-83`: drop one side of the double `LEFT JOIN follow` so mutual collapses to following → `FAIL L-4E-13 user d is_mutual=True, expected False` | Major P0 |
| **L-4E-14** | `/users/following`. Reader following 5 users, 2 of them mutual; plus a reader following nobody | (a) 5 rows, the 2 mutual rows flagged, 3 not (b) order unchanged (c) the empty reader gets `[]` and the early-return guard still fires — asserted by count in BQ-22e, by body here | **M-14** `users_router.py:120-137`: delete `if not following: return []` → `FAIL L-4E-14 (c)` via BQ-22e `GET /users/following [empty] ran 3 queries, budget 2` | Major P1 |
| **L-4E-15** | `PUT /profile/me` shares the GET's helper (A-3). Save `{name, bio, yearly_goal, is_private_profile, profile_picture}`; compare the PUT response with the body `GET /profile/me` returns immediately after | (a) the two bodies are **equal** apart from nothing (b) both carry the full key set and the Android aliases (c) `TestProfileRegression::test_put_profile_other_fields_unchanged` passes unedited | **M-15** `profile_router.py:124-135`: merge the GET but leave the PUT on the old helper, and drop one alias from the PUT's dict → `FAIL L-4E-15 PUT body missing keys {'totalBooks'} present in GET body` | Major P0 |

### 3.3 P3 — notes, likes, comments (endpoints 8–13) — 7 cases

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4E-16** | **The sharpest merge in the sprint.** `crud.get_notes_feed` gains `LEFT JOIN userbook LEFT JOIN book` while its `user` join **stays INNER** with `is_private_profile == False`. Seed: (i) a public note by a **private-profile** author (ii) a public note by a public author whose `userbook_id` is **null** (iii) a public note whose userbook's `book_id` is **null** (iv) a private (`is_public=False`) note by a public author (v) a normal public note | (a) (i) is **absent** from `GET /notes/feed` — for a signed-in viewer, for an anonymous caller, and for a viewer who *follows* the private author (b) (iv) is absent (c) (ii) and (iii) are **present**, with `book: null` or the degraded book dict the route builds today — this is what proves `userbook`/`book` are LEFT and not INNER (d) (v) is present with its book (e) `test_notes.py :: TestFeed :: test_private_notes_excluded_from_community_feed` and `test_private_note_absent_from_every_public_list` pass unedited | **M-16** `crud.py:136`: `.join(models.User, ...)` → `.outerjoin(models.User, ...)` (the exact mistake a "reach userbook and book in one statement" rewrite invites) → `FAIL L-4E-16 (a) private-profile author's note 8123 present in GET /notes/feed` | **Critical P0** |
| **L-4E-17** | `/notes/feed` anonymously (K-10). No `Authorization` header; the same seed as L-4E-16 | (a) 200, not 401 (b) the same row set as the signed-in viewer's, in the same order (c) every row has `liked_by_me is False` and `user_has_liked is False` — the my-likes branch is skipped, not defaulted to someone else's likes (d) the private-author note is still absent (e) no `email` or other PII in any nested `user` dict: `set(row["user"].keys()) == {"id", "name", "profile_picture", "username"}` | **M-17** `notes_router.py:286-292`: run the merged engagement statement with `viewer_id = None` bound as `0` and let `sum(case when user_id = :me …)` match a real user id → `FAIL L-4E-17 (c) row 8130 liked_by_me=True for an anonymous caller` | Critical P0 |
| **L-4E-18** | The `UNION ALL` engagement helper, across **all four** list routes (`/feed`, `/me`, `/user/{id}`, `/friends-feed`) plus `/admin/content/notes` once P6 imports it. Seed one note with **3** likes (one of them the viewer's) and **2** comments, and a second note with 0 and 0 | (a) `likes_count == 3`, `comments_count == 2` on every route (b) `liked_by_me is True` **and** `user_has_liked is True` for the viewer, both `False` for a different viewer (c) the zero note reports `0`/`0` and `False`, not `null` (d) a note the caller cannot see contributes nothing — the aggregate is scoped to the already-authorised page of ids (e) `TestMyNotesLikeState` and `test_my_notes_sets_both_like_keys_consistently` pass unedited | **M-18** `notes_router.py`: in the `UNION ALL`, label the comment branch `'like'` so its rows land in the like bucket → `FAIL L-4E-18 (a) /notes/feed note 8140 likes_count == 5, expected 3` | Major P0 |
| **L-4E-19** | `/notes/user/{id}` with the Follow gate folded into the user fetch | (a) private author, non-follower → **403** (b) private author, follower → 200 (c) public author, stranger → 200 (d) the author's own `is_public=False` notes are absent from (b) and (c) and present for the author themselves (e) `test_user_notes_private_profile_still_403` passes unedited | **M-19** `notes_router.py:404-406`: compute the flag but never `raise` → `FAIL L-4E-19 (a) GET /notes/user/{b} → 200, expected 403` | Critical P0 |
| **L-4E-20** | `/notes/userbook/{id}` reusing the gate's row. A owns userbook U with 2 notes (one private); B owns userbook V | (a) B requesting U → **404** (not 403, not 200) and the body contains no note text (b) A requesting U → both notes, including the private one (c) A requesting V → 404 (d) the gate query runs **before** the notes query — asserted from the recorded statement list: the first statement after auth selects `userbook`, and no statement selects `note` when the response is 404 (e) `test_private_note_still_visible_to_owner_via_userbook` passes unedited | **M-20** `notes_router.py:480`: reuse the joined row but move the `ub.user_id != current_user.id` check after the notes query → `FAIL L-4E-20 (d) statement 2 selects note on a 404 response` | Critical P0 |
| **L-4E-21** | `/notes/{id}/comments` — note gate separate, comment+user merged. Cases: a private note; a public note by a private-profile author, caller not following; a public note | (a) private note → **404** (b) private-profile author's note → **403** (c) public note → 200 with each comment's `user_name` correct (d) on (a) and (b) **no statement selects `comment`** — the visibility gate is still its own, earlier statement (e) `test_get_comments_private_note_404` and `test_comment_private_profile_non_follower_403` pass unedited | **M-21** `likes_comments.py`: merge the note gate into the comment join so the gate becomes a `WHERE` on the joined set → `FAIL L-4E-21 (a) GET /notes/{id}/comments → 200 with 2 comments, expected 404` | Critical P0 |
| **L-4E-22** | `/notes/friends-feed` ordering and empty guard. Reader following 6 authors, 3 mutual, each with 2 public notes | (a) all mutual authors' notes precede all non-mutual authors' notes (b) within each group the existing order is preserved (c) each row's `user.is_mutual` matches (d) a reader following nobody gets `[]` (e) `TestFriendsFeedOrder` passes unedited | **M-22** `notes_router.py:523-534`: return the mutual flag from the merged statement but sort on `followed_id` → `FAIL L-4E-22 (a) non-mutual note at index 0, first mutual note at index 4` | Major P0 |

### 3.4 P4 — library, books, reading activity (endpoints 4–7, 14, 26, 27) — 8 cases

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4E-23** | `/userbooks/{id}` ownership on the joined row. A owns U, B owns V | (a) B requesting U → **404**, body contains no title, author or page count (b) A requesting U → 200 with the nested `book` key set including `google_books_id` (c) a userbook whose `book_id` is null → 200 with the degraded `book` the route builds today, not a 500 | **M-23** `userbooks_router.py:359-362`: evaluate `user_id == current_user.id` after building the response dict → `FAIL L-4E-23 (a) GET /userbooks/{u} → 200 for a non-owner` | Critical P0 |
| **L-4E-24** | **K-01 — new coverage.** `/userbooks/user/{id}` private-profile gate. B sets `is_private_profile=True` with 3 books; A does not follow, then follows | (a) non-follower → **403**, and the body contains none of B's book titles (b) follower → 200 with 3 rows (c) B viewing B → 200 (d) a **public** profile's shelf is 200 for a stranger (e) each row's nested `book` key set is unchanged, `google_books_id` included | **M-24** `userbooks_router.py:496-498`: delete the `raise HTTPException(403)` → `FAIL L-4E-24 (a) GET /userbooks/user/{b} → 200 with 3 books, expected 403` | **Critical P0** |
| **L-4E-25** | `/userbooks/` and `/userbooks/{id}` after `userbook LEFT JOIN book`. Shelf of 5, one with `book_id` null, one whose book has null `total_pages` and null `cover_url` | (a) all 5 rows returned, in the same order as before the merge (`updated_at desc nulls last`, then `created_at desc`) (b) the null-book row present with the same degraded shape (c) nulls stay null, never `0` or `""` (d) `TestUserbookRegression` and `TestListUserbooks` pass unedited | **M-25** `userbooks_router.py:313-320`: INNER join → `FAIL L-4E-25 (a) 4 rows, expected 5` | Major P0 |
| **L-4E-26** | `/books/recommendations` — the library is fetched **once** (`books_router.py:239` and `:296` run the identical statement today). Reader with a 10-book library and 3 followed friends with distinct books | (a) the item list and its order are unchanged from the captured pre-merge body for the same seed (b) no recommended book is already in the reader's library (c) no recommendation comes from a user the reader does not follow (d) `my_authors`-driven affinity rows are still present (e) the recorded statement list contains **no two identical normalised statements** — the duplicate library fetch is gone (f) `TestRecommendations` passes unedited | **M-26** `books_router.py:245`: replace the `following_ids` subquery with "all users" → `FAIL L-4E-26 (c) recommendation from user 44, who the reader does not follow` | Major P0 |
| **L-4E-27** | A-4 fallback. If the `UNION ALL` of two `LIMIT 30` branches proves awkward, the two branches stay separate at 5 queries | (a) whichever shape ships, the body is identical to (a) of L-4E-26 (b) the count is `<= 5` — BQ-14 is a `varies` row for exactly this reason (section 7.2) | — (Minor) | Minor P2 |
| **L-4E-28** | `/reading-activity/daily` — rows summed in Python become a `GROUP BY` (payload fix, count stays 2). Seed a reader with activity on days 1, 3 and 7 of the last 7 local days, two rows on day 3 | (a) the returned day list has the same length and the same day labels as before, **including days with no activity** (the zero-filled days must still appear) (b) day 3's total is the **sum of both rows**, not one of them (c) the labels are the reader's **local** days (4C), verified with `X-Timezone: Pacific/Kiritimati` against `UTC` (d) `TestDailyStats` and the `test_local_day.py` read-days cases pass unedited | **M-28** `reading_activity_router.py:43`: `GROUP BY` the UTC `date` instead of the local day label → `FAIL L-4E-28 (c) first bucket 2026-09-21, expected 2026-09-22 for Pacific/Kiritimati` | Major P0 |
| **L-4E-29** | `/reading-activity/user/{id}/daily` gate folded into the user fetch | (a) private subject, non-follower → **403** (b) follower → 200 (c) public subject, stranger → 200 (d) the day buckets are the **subject's** local days, not the viewer's (4C R-04) (e) `TestPublicUserDaily::test_private_profile_blocked_for_non_follower` / `test_private_profile_visible_to_follower` pass unedited | **M-29** `reading_activity_router.py:234-240`: compute the flag, drop the `raise` → `FAIL L-4E-29 (a) GET /reading-activity/user/{b}/daily → 200, expected 403` | Critical P0 |
| **L-4E-30** | `/userbooks/friends/currently-reading` — following + mutual merged into one, then `userbook JOIN user JOIN book` merged into one. Reader following 4 users (2 mutual), 3 of whom are `reading` something | (a) exactly the 3 rows, same order as captured (b) a user the reader does **not** follow, who is reading, is absent (c) nested `user` and `book` shapes unchanged (d) `TestFriendsReading` passes unedited | **M-30** `userbooks_router.py:553-564`: drop the follow scope from the merged statement → `FAIL L-4E-30 (b) row for user 51, who the reader does not follow` | Major P0 |

### 3.5 P5 — circles (endpoints 28–38) — 8 cases

`group_context(db, group_id, user_id, require_active=True)` replaces `_group_or_404` + `_is_member` on seven endpoints. The gate is the query.

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4E-31** | Private circle, non-member, **all seven** sub-endpoints in one parametrised case: `/groups/{id}`, `/members`, `/leaderboard`, `/goal`, `/posts`, `/activity`, `/pending` | per endpoint: (a) **403** (b) the response body contains **none** of the circle's fields — no name, description, `invite_code`, `cover_preset`, member name, post text or activity line (asserted by substring over `r.text`, which is what catches a handler that serialises first and raises second) (c) a missing circle id is still **404**, not 403 (d) `test_groups.py :: test_private_group_goal_fields_still_403_for_non_member` passes unedited | **M-31** `groups_router.py`: in one handler, build the group dict from `group_context`'s row before the 403 check → `FAIL L-4E-31 /groups/{id}/goal 403 body contains the circle name "QA Private Circle"` | Critical P0 |
| **L-4E-32** | `require_active` semantics. A user whose membership is **pending** (not active) in a private circle | (a) all seven sub-endpoints → **403** for the pending member (b) the circle still appears in that user's `/groups/my/pending` with the right `member_count` — `_serialize_group` deliberately wants pending memberships, so `require_active=False` must still be reachable (c) an **active** member gets 200 everywhere | **M-32** `groups_router.py:21-28`: make `group_context` always `require_active=True` → `FAIL L-4E-32 (b) GET /groups/my/pending returned 0 circles, expected 1` | Critical P0 |
| **L-4E-33** | `/groups/{id}/pending` curator gate from `group_context`. Four callers: curator, active non-curator member, pending member, non-member | (a) curator → 200 with the pending list (b) active member → **403** (c) pending member → 403 (d) non-member → 403 (e) `test_pending_requests_only_visible_to_curator` passes unedited | **M-33** `groups_router.py:624`: gate on `membership is not None` alone, dropping `status == "active" and role == "curator"` → `FAIL L-4E-33 (b) GET /groups/{id}/pending → 200 for an active non-curator` | Critical P0 |
| **L-4E-34** | **R-05's first N+1.** `/groups/my/pending`. Reader with **3** pending self-join requests to circles with 2, 5 and 9 active members → measure; then **25** pending requests → measure | (a) `n_small == n_large` (b) `n_large <= 3` (c) each row's `member_count` equals the seeded active-member count — the `GROUP BY` must not count pending or removed members (d) a circle with 0 active members reports `0`, and is not dropped from the list by an INNER `GROUP BY` (e) no pending **invite** (`invited_by` not null) appears — the self-join filter survives | **M-34** `groups_router.py:301`: restore the per-circle `count(*)` inside the list comprehension → `FAIL L-4E-34 3 pending circles cost 3 queries, 25 cost 25 (must be equal)` | Major P0 |
| **L-4E-35** | **K-04 — mandatory value case.** `/groups/{id}/leaderboard`, `period=monthly` and `alltime`. Three active members: M1 with 2 books finished this month (200 + 300 pages of activity), M2 with 1 finished last month and 50 pages this month, M3 with nothing; M1 is `reading` a known book | (a) `books_finished` per member: monthly `{M1: 2, M2: 0, M3: 0}`, alltime `{M1: 2, M2: 1, M3: 0}` (b) `pages_read`: `{M1: 500, M2: 50, M3: 0}` monthly (c) `current_book` is M1's most recently updated `reading` title, `None` for the others (d) `rank` orders by pages then books: M1=1, M2=2, M3=3 (e) a member with **zero** rows still appears, with zeros, not missing (f) the key set still equals `TestGroupsRegression`'s leaderboard keys | **M-35** `groups_router.py:945` (scratch): raise inside the merged aggregate so the existing `except Exception` yields `{}` → `FAIL L-4E-35 (a) M1 books_finished == 0, expected 2` — **if this mutation does NOT go red, the sprint is blocked** (that is K-04) | Major P0 |
| **L-4E-36** | `/groups/{id}/goal`, member list becomes a subquery inside the sum. Circle with `goal_pages=1000`, `goal_period=monthly`, 3 active members contributing 120 + 200 + 80 pages this month and 500 pages **last** month; one **pending** member with 999 pages | (a) `pages_read == 400` (b) `pct == 40` (c) the pending member's pages are **excluded** (d) the month window is still **UTC** (4C decision E-3): a member's activity at 23:00 UTC on the last day of the previous month is excluded regardless of their zone (e) `goal_pages: None` → `{"goal_pages": None, "pages_read": 0, "pct": 0}` (f) `GET /groups/{id}`'s `pages_read_total` equals `/goal`'s `pages_read` — `test_groups.py:86` asserts this today and must stay green unedited | **M-36** `groups_router.py:48-68`: drop the `status == "active"` filter from the member subquery → `FAIL L-4E-36 (c) pages_read == 1399, expected 400` | Major P0 |
| **L-4E-37** | The three circle lists: `/groups/my`, `/groups/discover`, `/groups/invites/pending`. Reader is an active member of 2 circles, has 1 pending invite, and there are 3 other public circles | (a) `/groups/my` returns exactly the 2, with `member_count`, `creator_name`, `current_book` and `cover_preset` correct (b) `/groups/discover` returns exactly the 3 the reader has **not** joined — the `NOT EXISTS (active membership)` must not also exclude circles where the reader is merely pending (seed one such) (c) `/groups/discover`'s per-row "my membership status/role" via `max(case when user_id = :me …)` matches (d) `/groups/invites/pending` returns the 1, with `invited_by_name` correct (e) all three return `[]` for an empty reader and their early-return guards still fire (counts in BQ-28e/29e/30e) (f) `TestGroupsRegression`'s 16-key shape passes unedited | **M-37** `groups_router.py:327`: make the `NOT EXISTS` match any membership rather than an active one → `FAIL L-4E-37 (b) discover returned 2 circles, expected 3 (the pending one was excluded)` | Major P0 |
| **L-4E-38** | `/groups/{id}/posts` and `/activity` joins. 4 posts, 2 of them carrying a book card (one whose `userbook` was since deleted), 5 activity events by 3 users | (a) every post has its author's name and avatar (b) the 2 book cards carry title and cover; the orphaned one degrades to `null` rather than dropping the post (c) the other 2 posts have no book card and are present (d) activity rows carry the right actor name and order (e) `TestGroupPosts` passes unedited | **M-38** `groups_router.py:815-828`: INNER-join `userbook` → `FAIL L-4E-38 (a) 3 posts, expected 4` | Major P0 |

### 3.6 P6 — notifications and admin (endpoints 17, 39–44) — 7 cases

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4E-39** | `/notifications/unread-count`: rows → `count(*)` (`notifications/router.py:130`). Reader with 7 unread and 4 read rows; a **second** reader with 3 unread | (a) `{"unread": 7}` (b) the second reader sees `{"unread": 3}` — the `user_id` scope survives (c) marking one read gives 6 (d) zero unread gives `{"unread": 0}` (e) the key is still `unread` and the value is an `int`, not a string (f) the recorded statements contain **no** `SELECT` of `notificationlog.data` — the payload fix is the point (g) budget stays **2** | **M-39** `notifications/router.py:130`: drop the `user_id == current_user.id` predicate from the merged count → `FAIL L-4E-39 (b) reader 2 unread == 10, expected 3` | Critical P0 |
| **L-4E-40** | **K-05 — `/admin/stats`, all fourteen values, as deltas.** Capture stats; seed: 2 users (one created 2 days ago, one 20 days ago), 3 books, 6 userbooks (2 `reading`, 2 `finished`, **1 legacy `completed`, 1 legacy `want_to_read`**), 4 notes, 5 follows, 3 likes, 2 comments, 2 push tokens for **one** user; capture again | each of the fourteen moves by exactly: `total_users +2`, `new_users_this_week +1`, `new_users_this_month +2`, `total_books +3`, `total_userbooks +6`, `books_being_read +2`, `books_completed +1`, `books_wishlist +1`, `total_notes +4`, `total_follows +5`, `total_journals +0`, `total_likes +3`, `total_comments +2`, `push_subscribed_users +1` (distinct users, not tokens) | **M-40** `admin_router.py`: in the combined statement, swap the `books_completed` and `books_wishlist` subqueries **or** drop one `status` filter → `FAIL L-4E-40 books_completed delta == 6, expected 1` | Major P0 |
| **L-4E-41** | A-5 fallback. Monkeypatch the combined statement to raise (simulating a missing `journal` / `like` / `comment` table) | (a) the response is **200**, not 500 (b) the three guarded values are `0` (c) **the other eleven are still correct** — the fallback must re-run the fourteen-query path, not zero everything (d) the key set is unchanged | — (Minor) | Minor P1 |
| **L-4E-42** | `/admin/users` — three per-user aggregates as one `UNION ALL`. Seed a user with 4 userbooks, 3 followers and 2 following; and a user with none | (a) `books_count 4`, `followers_count 3`, `following_count 2` (b) the empty user reports `0/0/0`, not `null`, and is **not** dropped from the list (c) `last_active` is present and reflects P1's deferred write (d) `USER_KEYS` unchanged | **M-42** `admin_router.py`: swap the follower and following branches of the `UNION ALL` → `FAIL L-4E-42 followers_count == 2, expected 3` | Major P0 |
| **L-4E-43** | `/admin/books` — the aggregate and the adder names from one join. A book with 3 readers (2 `reading`, 1 legacy `completed`) added by 3 named users | (a) `users_reading 2`, `users_completed 1`, `total_users 3` (b) `added_by_users` lists the 3 names (c) a book nobody has added still appears with zeros (d) `BOOK_KEYS` unchanged | **M-43** `admin_router.py`: INNER-join `user` so books with no adder vanish → `FAIL L-4E-43 (c) book 912 absent from GET /admin/books` | Major P0 |
| **L-4E-44** | `/admin/follows` (two aliased `user` joins) and `/admin/content/notes` / `/content/comments` | (a) each follow row's `follower_name` and `followed_name` are the right way round (the alias mistake the merge invites) (b) note rows carry `user_name`, `likes_count` and `comments_count` matching the seed — via the same P3 `note_engagement` helper (c) comment rows carry `user_name` (d) `FOLLOW_KEYS`, `NOTE_KEYS`, `COMMENT_KEYS` unchanged | **M-44** `admin_router.py`: swap the two `user` aliases in the follow join → `FAIL L-4E-44 (a) follow 33 follower_name "Bob", expected "Alice"` | Major P0 |
| **L-4E-45** | Admin auth is untouched. For all six admin routes: anonymous, non-admin reader, admin | (a) anonymous → **401** (b) non-admin → **403** (c) admin → 200 (d) `TestAdminAccess` passes unedited (e) ST-4E-03: the `Depends(...)` list on every route in `app/routers/` and `app/notifications/router.py` is byte-identical to `b245acf` | **M-45** `admin_router.py`: replace `Depends(get_admin_user)` with `Depends(get_current_user)` on `/admin/stats` → `FAIL L-4E-45 (b) GET /admin/stats → 200 for a non-admin` | Critical P0 |

### 3.7 P7 — the guard — 5 cases

| # | Setup → steps | Assertions | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|
| **L-4E-46** | The budget table. Parametrised over **all 68 rows** of section 7.1, on `seed_small()`, through `measure()` | per row: (a) the request returns the row's expected status (b) `actual == expected` for a fixed row, or `actual <= budget` for a `varies` row (section 7.2) (c) the failure message is exactly the section 2.4 format (d) the row's `before` number is printed, so the message says what was lost | **M-46** any handler: add one `db.exec(select(func.count(models.User.id))).one()` → `FAIL L-4E-46[GET /notes/feed] GET /notes/feed [signed in] ran 4 queries, budget 4, expected 3 (was 8 before Sprint 4E)` | Major P0 |
| **L-4E-47** | The N+1 killer. For every **list** row: count on `seed_small()`, then on `seed_large()` (≥ 50 rows behind each list, ≥ 50 finished books, ≥ 25 pending circles) | (a) `n_small == n_large` for every list endpoint (b) the two responses differ in length, proving the large seed was really served (c) a row whose counts differ fails **even if both are under budget** — growth with `n` is the defect, not the absolute number | **M-47** `groups_router.py:301` or `users_router.py:240` (either N+1 restored) → `FAIL L-4E-47[GET /groups/my/pending] 3 queries at n=3, 25 queries at n=25 — this endpoint scales with row count` | Major P0 |
| **L-4E-48** | Empty accounts (the early-return guards). `seed_empty_viewer()` for `/notes/friends-feed`, `/groups/my`, `/groups/discover`, `/groups/my/pending`, `/users/following`; the **emptied database** for `/notes/feed` (only possible because of K-03) | (a) each returns `[]` (b) each costs exactly its BQ row's empty count (1–2) (c) a merge that deletes `if not rows: return []` and runs the big statement anyway is caught by (b), not by (a) | **M-48** `notes_router.py:265`: delete `if not notes: return []` → `FAIL L-4E-48 GET /notes/feed [empty] ran 3 queries, budget 2, expected 2` | Major P0 |
| **L-4E-49** | **The guard's own assumption (K-09).** For 6 representative endpoints, count **without** priming on a reader whose `last_active` is yesterday, and compare with the primed count | (a) primed == unprimed for all 6 (b) pool checkouts equal too (c) this is the only case that does not prime — everything else in the file does | **M-49** = M-01 (`deps.py` commit restored) → `FAIL L-4E-49 GET /profile/me unprimed 5 statements / 2 checkouts, primed 3 / 1` | Major P0 |
| **L-4E-50** | The guard fails loudly. A deliberately impossible row (`budget=0` for `/profile/me`) run through the same reporter, inside `pytest.raises(AssertionError)` | (a) the message matches the section 2.4 regex exactly (b) it names the endpoint, the budget, the actual and the before number (c) it prints at least the first 3 statements (d) it does not print any bound parameter value — no email, no token, no note text | — (Minor; it is itself the anti-rot check) | Minor P1 |

---

## 4. Static checks

| # | Check | Command / rule | Sev |
|---|---|---|---|
| ST-4E-01 | No response is built from a row mapping | `grep -rnE "dict\(row|_mapping|\*\*row|return .*\bUserBook\b\s*$" app/routers/ app/crud.py app/notifications/` returns nothing new vs `b245acf`. Backs CLAUDE.md's "never return a raw SQLModel". | Critical |
| ST-4E-02 | **R-02 / E-3** | `app/database.py:33` still reads `pool_pre_ping=True`, and a comment within 10 lines of it names (i) the measured cost (170–200 ms), (ii) the Supabase idle-close reason and `pool_recycle=300`'s age-not-idle behaviour, (iii) the revisit condition ("if the API and the database are co-located, re-measure; under 5 ms needs no further thought"). Asserted as a pytest case in `tests/test_dependencies.py` so it cannot be skipped. | Minor |
| ST-4E-03 | No route gains or loses an auth dependency | `python scripts/gen_dependency_map.py`; `git diff dependency-map.md` shows **no new ⚠️** and no endpoint gaining or losing a consumer. Backs L-4E-45 (e). | Critical |
| ST-4E-04 | **K-04** — no aggregate may fail into zeros | In every file P2–P6 touch: no new bare `except:`; and no `except` clause assigns `{}`, `0` or `[]` to an aggregate result without a fallback query in the same block. Reviewed by hand against the diff, recorded in the build notes. | Major |
| ST-4E-05 | **E-4** — no migration | `git diff --stat context/supabase_migration.sql create_tables.sql app/schema_guard.py app/models.py` is empty. No `CREATE INDEX` anywhere in the diff. | Major |
| ST-4E-06 | Postgres/SQLite portability (A-4) | The diff contains no `FILTER (WHERE`, no `DISTINCT ON`, no new `ILIKE`, no `information_schema` outside `schema_guard`; every conditional count is `sum(case when … then 1 else 0 end)`; every `UNION ALL` branch carrying a `LIMIT` is a parenthesised subquery. | Major |
| ST-4E-07 | No web / mobile / build change | `git diff --stat` touches no file under `book-tracker-frontend-stitch/`, `book-tracker-mobile-stitch/`, and no `app.json`. | Minor |
| ST-4E-08 | The budget table covers the architecture's table | A test in `test_query_budget.py` asserts the set of endpoints in `BUDGETS` is a **superset** of the 44 rows of the architecture's table, parsed from `features/maintenance/sprint-4e-query-budget/architecture.md`. This is what stops the table being quietly trimmed to the endpoints that pass. | Major |

---

## 5. Regression — what must stay green, **unedited**

R-00's protection. **If a package needs one of these edited to pass, the package is wrong** — the architecture's rule, and there is no exception this sprint (K-06 is the single, narrowly-scoped carve-out).

| # | File :: class | Pins | Pri |
|---|---|---|---|
| RG-4E-01 | `tests/test_follow_profile.py :: TestProfileRegression`, `:: TestProfileMeNoPII` | `/profile/me` and `/profile/{id}` key sets, nested `stats` keys, the Android aliases, **and the absence of PII** — the canary for "a join widens the row, not the response" | P0 Critical |
| RG-4E-02 | `tests/test_books.py :: TestUserbookRegression`, `:: TestRecommendations`, `:: TestFriendsReading`, `:: TestCatalogList`, `:: TestListUserbooks`, `:: TestImportRegression` | the flat userbook shape and its nested `book` keys; recommendation and friends-reading item keys | P0 Critical |
| RG-4E-03 | `tests/test_notes.py :: TestNoteShapeRegression`, `:: TestFeed`, `:: TestMyNotesLikeState`, `:: TestFriendsFeedOrder`, `:: TestPrivateNotesAndGroupActivity`, `:: TestLikesComments` | note-card top-level keys, both like keys, `updated_at`, book dedup keys, friends-feed ordering, and every private-note exclusion | P0 Critical |
| RG-4E-04 | `tests/test_notes.py :: TestNoteQueryCount` | the five per-endpoint ceilings. **The only existing test class this sprint may edit**, and only to tighten (K-06) | P0 Major |
| RG-4E-05 | `tests/test_groups.py :: TestGroupsRegression`, `:: TestGroupLeaderboard`, `:: TestGroupsCRUD`, `:: TestGroupMembership`, `:: TestGroupPosts` | the 16-key circle shape, the 7-key `current_book`, the goal endpoint's four keys, `invited_by_name`, `pages_read_total == goal.pages_read == 120` | P0 Critical |
| RG-4E-06 | `tests/test_reading_activity.py :: TestDailyStats`, `:: TestInsights`, `:: TestInsightsMonthBuckets`, `:: TestInsightsStreak`, `:: TestPublicUserDaily` | insights keys including the Android ≤ 2.2.1 aliases, `monthly_pages` shape, streak and month-bucket values | P0 Critical |
| RG-4E-07 | `tests/test_admin.py :: TestAdminRegression`, `:: TestAdminAccess`, `:: TestSetAdmin`, `:: TestAdminBroadcast` | `STATS_KEYS`, `USER_KEYS`, `BOOK_KEYS`, `FOLLOW_KEYS`, `NOTE_KEYS`, `COMMENT_KEYS`, and 403 for non-admins | P0 Critical |
| RG-4E-08 | `tests/test_notifications_api.py :: TestPrefsRegression`, `:: TestNotificationPrefs`, `:: TestMarkOneRead` | prefs shape; the unread count after marking one read | P0 Major |
| RG-4E-09 | `tests/test_googlebooks.py :: TestSearchRegression` | search item keys | P1 Major |
| RG-4E-10 | `tests/test_local_day.py` — **all of it**, in particular `TestLastActive`, `TestZoneHeader`, `TestTravel`, `TestCutoverBridge`, `TestSchemaGuard`, `TestReadDays`, `TestClockIndependence` | R-07: everything 4C built. `TestZoneHeader::test_header_persisted_before_last_active_compared` is the specific case P1 is most likely to break | P0 Critical |
| RG-4E-11 | `tests/test_server_timing.py` — all 4 | the header still reports the real count and still leaks no SQL or data. **4E changes the number this header reports on nearly every endpoint**, so `test_query_count_matches_the_statements_actually_run` is the test that proves the production instrument still tells the truth | P0 Major |
| RG-4E-12 | `tests/test_dependencies.py`, `tests/test_auth.py :: TestGoogleLoginLastActive` / `TestReviewLogin`, `tests/test_scheduler.py`, `tests/test_pydantic_v1_compat.py`, `tests/test_sql_artifacts.py`, `tests/test_uniqueness.py`, `tests/test_security_headers.py`, `tests/test_push_tokens.py`, `tests/test_version.py` | one session and one checkout per request; login's inline `last_active`; the 20:00–22:00 inactivity reminder that reads `last_active` (P1's only real consumer); the SQL artefacts and schema guard E-4 forbids touching | P0 Critical |

---

## 6. Production checks — reading the budget off `Server-Timing`

`app/server_timing.py` puts `Server-Timing: db;dur=<ms>;desc="<n> queries", total;dur=<ms>` on **every** response. That is the same counter the guard uses, so the budget is checkable live, on the real stack, against the real database. The header carries durations and a count only — never SQL, parameters or data.

### 6.1 How to read one

```bash
TOKEN=...        # a review account's bearer token; never echoed, never committed
API=https://book-tracker-stitch.onrender.com

read_timing () {   # $1 = path
  curl -sS -o /dev/null -D - -H "Authorization: Bearer $TOKEN" "$API$1" \
    | tr -d '\r' | grep -i '^server-timing:'
}
```

Two rules, both from the architecture's deploy notes and both non-negotiable:

1. **Sample twice, read the second.** The first request of the reader's local day carries the `last_active` write. After P1 that should no longer be true — and **P-4E-02 is exactly that check**: sample 1 and sample 2 must report the same count.
2. `curl -sI` (HEAD) works because Starlette registers HEAD alongside GET and still runs the handler, but the GET form above is what these checks use, so nothing depends on that.

### 6.2 Per-endpoint release checks

| # | Check | Command | Expected | Pri |
|---|---|---|---|---|
| P-4E-00 | The right commit is live | `curl -sS $API/version` | the 4E merge SHA | P0 |
| P-4E-01 | `/version` still 0 queries | `read_timing /version` | `desc="0 queries"` | P0 |
| **P-4E-02** | **R-01 on production** | `read_timing /profile/me` twice, ≥ 1 s apart, as the **first** call of that reader's local day | both report the **same** count (`desc="3 queries"`), and the first's `total;dur` is not ~575 ms above the second's | P0 |
| P-4E-03 | The headline endpoints | `read_timing` for `/notes/feed`, `/profile/me`, `/books/recommendations`, `/groups/{id}`, `/groups/{id}/leaderboard`, `/admin/stats`, `/groups/my/pending`, `/users/{id}/stats` | `≤ 4`, `≤ 4`, `≤ 5`, `≤ 5`, `≤ 6`, `≤ 3`, `≤ 3`, `≤ 4` queries — the budget column of section 7.1 | P0 |
| P-4E-04 | The N+1s are really gone in production data | `read_timing /users/{a reader with ≥ 50 finished books}/stats` and `/groups/my/pending` for an account with ≥ 5 pending circles | the same counts as P-4E-03, **on real row counts** — this is the check the local seed cannot make | P0 |
| P-4E-05 | Every remaining endpoint | `read_timing` for all 44 | each at or under its budget; any that is not is recorded with its count in `qa/reports/` before the release is called done | P1 |
| **P-4E-06** | **Home is faster, not slower (§0.2)** | `node qa/page_perf.mjs --runs 3`, compare `/home` with `page-perf-2026-09-21.json` | desktop `ready` (first visit) **≤ 4.5 s** and strictly below both 5.99 s (09-21) and 5.40 s (09-19); mobile **≤ 7.5 s** and below 9.40 s and 8.14 s. `GET /books/recommendations` is no longer the slowest call on the page. Arithmetic: 21 queries removed from the page's parallel batch at ~200 ms each, of which recommendations (12→4) and the feed (8→3) are 13 | P0 |
| **P-4E-07** | **Admin is faster (§0.2)** | same run, `/admin` | desktop `ready` **≤ 3.5 s**, below 5.05 s (09-21) and 4.56 s (09-19). `/admin/stats` 15→2 alone is ~2.5 s | P0 |
| P-4E-08 | No page regressed | same run, all 15 signed-in pages | no page's desktop `ready` is more than **0.3 s** above its 09-21 figure. A page that regressed is re-run once on a quiet machine before it is called real | P1 |
| P-4E-09 | The pre-ping cost, on the record (E-3) | `read_timing /version` | `total;dur − db;dur` is 170–200 ms, matching the number ST-4E-02 requires in `app/database.py`'s comment. If it has moved, the comment is updated in the same release | P2 |
| P-4E-10 | **E-4 — reported, not asserted** | the architecture's `pg_indexes` query in the Supabase SQL editor | the result is pasted into `qa/reports/` for the PM's separate index step. **4E does not act on it.** If a merged query shows up far above the ~200 ms/query baseline in P-4E-05, that is the evidence the PM wanted | P2 |

### 6.3 What "expected effect on Home and Admin" means if it does not happen

If P-4E-06 or P-4E-07 fails while P-4E-03 passes — counts down, wall clock not — the cause is **not** in 4E's scope and must be recorded as such rather than fixed by loosening the gate. The two candidates, in order: F-68 (the Oregon↔Singapore split, which 4E was explicitly sized to be worth doing either way) and E-4 (a missing index making one remaining query far more expensive than the ~200 ms baseline). P-4E-05's per-endpoint durations tell them apart: an index problem is one endpoint far above the line; a region problem is every endpoint on the line.

### 6.4 The before/after body diff (R-00's third bullet)

Junior QA runs, on the merge branch and on `sprint-4c-local-day`, against the **same** seeded local database:

```
python -m scripts.dump_endpoints --out /tmp/4e-before.json   # on sprint-4c-local-day
python -m scripts.dump_endpoints --out /tmp/4e-after.json    # on the 4E branch
diff <(jq -S . /tmp/4e-before.json) <(jq -S . /tmp/4e-after.json)
```

`dump_endpoints` is a throwaway script (it is **not** committed; ST-4E-07 would flag it) that hits every endpoint in the budget table with a fixed seed and writes the bodies. **Expected: empty diff**, including list order where the route rather than the database determines it (friends-feed mutual-first, userbooks by `updated_at`, leaderboard by pages then books). G-4E-07.

---

## 7. The budget table

### 7.1 Rows (68)

`expected` = the measured post-fix count. `budget` = the ceiling in the failure message, at most `expected + 1` (R-06). `before` = the architecture's "now" column, printed so the message says what was lost. **`expected` is taken from the package's build notes, not from this table** — if a package lands at a different number, the build-note number is the truth and the discrepancy is explained there (the architecture's build-note discipline). The numbers below are the architecture's and are what the plan is written against.

| BQ | endpoint | branch | before | expected | budget |
|---|---|---|---:|---:|---:|
| 01 | `GET /version` | — | 0 | 0 | 0 |
| 02 | `GET /profile/me` | signed in | 5 | 3 | 4 |
| 03 | `GET /profile/{id}` | public subject | 7 | 3 | 4 |
| 03p | `GET /profile/{id}` | private, non-follower (locked 200) | 7 | 3 | 4 |
| 03f | `GET /profile/{id}` | private, follower | 7 | 3 | 4 |
| 04 | `GET /userbooks/` | — | 3 | 2 | 3 |
| 05 | `GET /userbooks/{id}` | owner | 3 | 2 | 3 |
| 06 | `GET /userbooks/user/{id}` | public subject | 4 | 3 | 4 |
| 06f | `GET /userbooks/user/{id}` | private, follower | 5 | 3 | 4 |
| 07 | `GET /userbooks/friends/currently-reading` | — | 6 | 3 | 4 |
| 08 | `GET /notes/feed` | signed in | 8 | 3 | 4 |
| 08a | `GET /notes/feed` | **anonymous** (K-10) | 7 | 2 | 3 |
| 08e | `GET /notes/feed` | **empty database** (K-03) | 2 | 2 | 2 |
| 09 | `GET /notes/friends-feed` | — | 10 | 4 | 5 |
| 09e | `GET /notes/friends-feed` | follows nobody | 2 | 2 | 2 |
| 10 | `GET /notes/me` | — | 8 | 3 | 4 |
| 11 | `GET /notes/user/{id}` | public author | 9 | 4 | 5 |
| 11f | `GET /notes/user/{id}` | private author, follower | 10 | 4 | 5 |
| 12 | `GET /notes/userbook/{id}` | owner | 6 | 3 | 4 |
| 13 | `GET /notes/{id}/comments` | — | 4 | 3 | 4 |
| 14 | `GET /books/recommendations` | **varies** (A-4, L-4E-27) | 12 | 4 | 5 |
| 14n | `GET /books/recommendations` | follows nobody | 12 | 4 | 5 |
| 15 | `GET /books/{id}` | — | 2 | 2 | 2 |
| 16 | `GET /books/search` | — | 2 | 2 | 2 |
| 17 | `GET /notifications/unread-count` | — | 2 | 2 | 2 |
| 18 | `GET /notifications/history` | — | 2 | 2 | 2 |
| 19 | `GET /notifications/prefs` | — | 1 | 1 | 1 |
| 20 | `GET /follow/followers` | — | 2 | 2 | 2 |
| 21 | `GET /follow/following` | — | 2 | 2 | 2 |
| 22 | `GET /users/following` | — | 4 | 2 | 3 |
| 22e | `GET /users/following` | follows nobody | 2 | 2 | 2 |
| 23 | `GET /users/search` | `q` matches 4 | 4 | 2 | 3 |
| 23e | `GET /users/search` | `q=""` (early return) | 1 | 1 | 1 |
| 24 | `GET /users/{id}/stats` | public subject, 50 finished | 3+F | 3 | 4 |
| 24f | `GET /users/{id}/stats` | private, follower | 4+F | 3 | 4 |
| 25 | `GET /reading-activity/daily` | — | 2 | 2 | 2 |
| 26 | `GET /reading-activity/insights` | — | 4 | 3 | 4 |
| 27 | `GET /reading-activity/user/{id}/daily` | public subject | 3 | 3 | 3 |
| 27f | `GET /reading-activity/user/{id}/daily` | private, follower | 4 | 3 | 3 |
| 28 | `GET /groups/my` | 3 circles | 6 | 3 | 4 |
| 28e | `GET /groups/my` | no circles | 2 | 2 | 2 |
| 29 | `GET /groups/my/pending` | 25 pending | 3+n | 3 | 3 |
| 29e | `GET /groups/my/pending` | none pending | 2 | 2 | 2 |
| 30 | `GET /groups/discover` | 3 public circles | 7 | 3 | 4 |
| 30e | `GET /groups/discover` | none | 2 | 2 | 2 |
| 31 | `GET /groups/invites/pending` | 1 invite | 7 | 3 | 4 |
| 31e | `GET /groups/invites/pending` | none | 2 | 2 | 2 |
| 32 | `GET /groups/{id}` | public circle | 8 | 4 | 5 |
| 32p | `GET /groups/{id}` | private, active member | 9 | 4 | 5 |
| 33 | `GET /groups/{id}/members` | public | 4 | 3 | 3 |
| 33p | `GET /groups/{id}/members` | private, member | 5 | 3 | 3 |
| 34 | `GET /groups/{id}/leaderboard` | public, monthly | 8 | 5 | 6 |
| 34p | `GET /groups/{id}/leaderboard` | private, member, alltime | 9 | 5 | 6 |
| 34e | `GET /groups/{id}/leaderboard` | no active members | 3 | 3 | 3 |
| 35 | `GET /groups/{id}/goal` | public | 4 | 3 | 3 |
| 35p | `GET /groups/{id}/goal` | private, member | 5 | 3 | 3 |
| 36 | `GET /groups/{id}/posts` | with book cards | 7 | 3 | 4 |
| 36p | `GET /groups/{id}/posts` | private, member | 4 | 3 | 4 |
| 37 | `GET /groups/{id}/activity` | public | 4 | 3 | 3 |
| 37p | `GET /groups/{id}/activity` | private, member | 5 | 3 | 3 |
| 38 | `GET /groups/{id}/pending` | curator | 4 | 3 | 3 |
| 39 | `GET /admin/stats` | — | 15 | 2 | 3 |
| 39f | `GET /admin/stats` | **varies** — fallback path (A-5, L-4E-41) | 15 | — | 16 |
| 40 | `GET /admin/users` | — | 5 | 3 | 4 |
| 41 | `GET /admin/books` | — | 5 | 3 | 4 |
| 42 | `GET /admin/follows` | — | 3 | 2 | 3 |
| 43 | `GET /admin/content/notes` | — | 5 | 3 | 4 |
| 44 | `GET /admin/content/comments` | — | 3 | 2 | 3 |

**Every authenticated row includes the one `get_current_user` lookup that E-1 leaves in place.** BQ-08a is the only row without it.

### 7.2 What the guard does when a count legitimately varies

Three rules, in order. They are what stops the table rotting into `<=` everywhere.

1. **A branch is a row, not a range.** Public vs private, empty vs populated, curator vs member, anonymous vs signed in: each gets its own row with its own `expected`, and the guard asserts **`actual == expected`**. Exactness is the point — a row that says `<= 5` cannot tell 3 from 5, and 3 might mean a permission query was dropped.
2. **Row count never varies a count.** `expected` is measured on `seed_small()` and L-4E-47 asserts the same number on `seed_large()`. A difference between the two fails **even when both are under budget**. This is the rule that would have caught `/groups/my/pending` and `/users/{id}/stats` in 4A, and it is why the guard cannot be satisfied by raising a budget.
3. **Exactly two rows may vary, each with a written reason.** A row marked `varies` asserts only `actual <= budget`, and the reason is in the table:
   - **BQ-14** `/books/recommendations` — A-4 permits the two friend branches to stay separate (5 queries) if the parenthesised `UNION ALL` proves awkward on one of the two databases. The body is identical either way, which L-4E-26 asserts; the count is the only thing that moves.
   - **BQ-39f** `/admin/stats` — A-5's fallback re-runs the fourteen-query path when a table is missing. It is not reachable on a healthy database; the row exists so that a fallback that *is* being hit in production shows up as a budget breach on P-4E-05 instead of passing silently.

   **No package may add a third `varies` row** without a PM note. A new `varies` row is the shape a rotted guard takes, so G-4E-04's expected output names the count: `2 varies rows`.
4. **A count that comes in *under* `expected`** does not fail — but `L-4E-46` prints `UNDER: GET /x ran 2, expected 3` and **Junior QA must explain every UNDER line**: either a real improvement (re-baseline `expected` in the same commit, with the build note saying which query went) or a lost permission check (the privacy cases in section 3 are the real gate; the UNDER line is the tripwire that sends someone to look).

### 7.3 Page totals (reported, not asserted)

Summed over the endpoints each page actually sends, **counting `/profile/me` twice on `/profile` and `/settings`** because E-6 leaves the duplicate in place:

| page | now | after | removed |
|---|---:|---:|---:|
| `/home` | 40 | 19 | 21 |
| `/groups/{id}` (curator) | 43 | 29 | 14 |
| `/profile/{id}` | 36 + F | 24 | 12 + F |
| `/profile` | 30 | 19 | 11 |
| `/admin` | 27 | 10 | 17 |
| `/groups` | 30 + n | 17 | 13 + n |

These are the architecture's numbers; they are the sprint's headline and the input to P-4E-06/07, and no pytest case asserts them (a page total is a property of the web client's call list, which 4E does not own).

---

## 8. Mutation-proof table (Builders fill in; required by G-4E-09)

**Procedure per row:**
1. Apply the one-line change. Rows marked **(scratch)** change files the sprint does not ship in that state, or restore pre-4E code; apply them in a scratch copy of the worktree and revert immediately.
2. Run only the named case: `pytest tests/<file>.py::<Class>::<test> -q`, or `pytest tests/test_query_budget.py -q -k "<row>"`.
3. Paste the **first failing line**.
4. `git checkout -- <file>`, re-run, record green.

A row whose case stays green is **not caught**, and the merge is blocked until the case is fixed — not until the mutation is reworded. The failing line must come from the named assertion, not from a setup or precondition failure. **M-35 is the row this sprint exists to prove** (K-04).

| MUT | Pkg | File | One-line change | Case | Expected first red line | Observed | Caught | Restored |
|---|---|---|---|---|---|---|---|---|
| M-01 | P1 | `app/deps.py:90` | restore `if dirty: db.add(user); db.commit()` | L-4E-01 | `first request of the local day ran 6 statements and 2 checkouts, second ran 4 and 1` | | | |
| M-02 | P1 | `app/deps.py` | drop the background task entirely | L-4E-02 | `last_active in the database is 2026-09-20T…, expected 2026-09-21T06:00:00` | | | |
| M-03 | P1 | `app/deps.py` | move `user.timezone = reported` into the task | L-4E-03 | `day buckets computed for UTC, expected Asia/Kolkata` | | | |
| M-04 | P1 | `app/deps.py` | the task closes over the request `Session` | L-4E-04 | `background task used the request session (id match)` | | | |
| M-05 | P1 | `app/deps.py` | task writes `last_active` unconditionally | L-4E-05 | `last_active moved backwards: …T09:00:00 → …T06:00:00` | | | |
| M-06 (scratch) | P1 | `app/routers/auth_router.py:90` | route the login write through the task | L-4E-06 | `last_active unchanged immediately after POST /auth/review-login` | | | |
| M-07 | P2 | `profile_router.py:45-47` | swap the two aggregate columns | L-4E-07 | `stats.followers == 5, expected 3` | | | |
| M-08 | P2 | `profile_router.py:212-224` | swap `is_following` / `follows_you` | L-4E-08 | `(i) is_following=False follows_you=True, expected True/False` | | | |
| M-09 | P2 | `profile_router.py:204` | build the body from `dict(row._mapping)` | L-4E-09 | `forbidden key 'email' present in GET /profile/{id} body` | | | |
| M-10 | P2 | `users_router.py:195-204` | delete the 403 `raise` | L-4E-10 | `GET /users/{b}/stats → 200, expected 403` | | | |
| M-11 | P2 | `users_router.py:240` | INNER-join `book` | L-4E-11 | `total_books == 6, expected 7` | | | |
| M-12 | P2 | `users_router.py:240-241` | restore the per-row `userbook.book` access | L-4E-12 | `5 finished books cost 3 queries, 50 cost 48 (must be equal)` | | | |
| M-13 | P2 | `users_router.py:53-83` | drop one `LEFT JOIN follow` side | L-4E-13 | `user d is_mutual=True, expected False` | | | |
| M-14 | P2 | `users_router.py:120` | delete `if not following: return []` | L-4E-14 / BQ-22e | `GET /users/following [empty] ran 3 queries, budget 2, expected 2` | | | |
| M-15 | P2 | `profile_router.py:124-135` | leave `PUT` on the old helper, drop one alias | L-4E-15 | `PUT body missing keys {'totalBooks'} present in GET body` | | | |
| **M-16** | P3 | `app/crud.py:136` | `.join(models.User…)` → `.outerjoin(…)` | L-4E-16 | `private-profile author's note 8123 present in GET /notes/feed` | | | |
| M-17 | P3 | `notes_router.py:286-292` | bind `viewer_id=0` and let it match | L-4E-17 | `row 8130 liked_by_me=True for an anonymous caller` | | | |
| M-18 | P3 | `notes_router.py` | label the comment `UNION ALL` branch `'like'` | L-4E-18 | `/notes/feed note 8140 likes_count == 5, expected 3` | | | |
| M-19 | P3 | `notes_router.py:404-406` | compute the flag, never `raise` | L-4E-19 | `GET /notes/user/{b} → 200, expected 403` | | | |
| M-20 | P3 | `notes_router.py:480` | move the ownership check after the notes query | L-4E-20 | `statement 2 selects note on a 404 response` | | | |
| M-21 | P3 | `likes_comments.py` | merge the note gate into the comment join | L-4E-21 | `GET /notes/{id}/comments → 200 with 2 comments, expected 404` | | | |
| M-22 | P3 | `notes_router.py:523-534` | sort on `followed_id`, not the mutual flag | L-4E-22 | `non-mutual note at index 0, first mutual note at index 4` | | | |
| M-23 | P4 | `userbooks_router.py:359-362` | check ownership after building the dict | L-4E-23 | `GET /userbooks/{u} → 200 for a non-owner` | | | |
| **M-24** | P4 | `userbooks_router.py:496-498` | delete the 403 `raise` | L-4E-24 | `GET /userbooks/user/{b} → 200 with 3 books, expected 403` | | | |
| M-25 | P4 | `userbooks_router.py:313-320` | INNER-join `book` | L-4E-25 | `4 rows, expected 5` | | | |
| M-26 | P4 | `books_router.py:245` | `following_ids` subquery → all users | L-4E-26 | `recommendation from user 44, who the reader does not follow` | | | |
| M-28 | P4 | `reading_activity_router.py:43` | `GROUP BY` the UTC date | L-4E-28 | `first bucket 2026-09-21, expected 2026-09-22 for Pacific/Kiritimati` | | | |
| M-29 | P4 | `reading_activity_router.py:234-240` | drop the 403 `raise` | L-4E-29 | `GET /reading-activity/user/{b}/daily → 200, expected 403` | | | |
| M-30 | P4 | `userbooks_router.py:553-564` | drop the follow scope | L-4E-30 | `row for user 51, who the reader does not follow` | | | |
| M-31 | P5 | `groups_router.py` (one handler) | serialise the group before the 403 check | L-4E-31 | `403 body contains the circle name "QA Private Circle"` | | | |
| M-32 | P5 | `groups_router.py:21-28` | `group_context` always `require_active=True` | L-4E-32 | `GET /groups/my/pending returned 0 circles, expected 1` | | | |
| M-33 | P5 | `groups_router.py:624` | gate on `membership is not None` alone | L-4E-33 | `GET /groups/{id}/pending → 200 for an active non-curator` | | | |
| M-34 | P5 | `groups_router.py:301` | restore the per-circle `count(*)` | L-4E-34 | `3 pending circles cost 3 queries, 25 cost 25 (must be equal)` | | | |
| **M-35** (scratch) | P5 | `groups_router.py:945` | raise inside the merged aggregate, letting the existing `except Exception` return `{}` | L-4E-35 | `M1 books_finished == 0, expected 2` — **if green, the sprint is blocked (K-04)** | | | |
| M-36 | P5 | `groups_router.py:48-68` | drop `status == "active"` from the member subquery | L-4E-36 | `pages_read == 1399, expected 400` | | | |
| M-37 | P5 | `groups_router.py:327` | `NOT EXISTS` matches any membership | L-4E-37 | `discover returned 2 circles, expected 3` | | | |
| M-38 | P5 | `groups_router.py:815-828` | INNER-join `userbook` | L-4E-38 | `3 posts, expected 4` | | | |
| M-39 | P6 | `app/notifications/router.py:130` | drop the `user_id` predicate from the count | L-4E-39 | `reader 2 unread == 10, expected 3` | | | |
| M-40 | P6 | `admin_router.py` | swap `books_completed` / `books_wishlist` subqueries | L-4E-40 | `books_completed delta == 6, expected 1` | | | |
| M-42 | P6 | `admin_router.py` | swap the follower/following `UNION ALL` branches | L-4E-42 | `followers_count == 2, expected 3` | | | |
| M-43 | P6 | `admin_router.py` | INNER-join `user` in `/admin/books` | L-4E-43 | `book 912 absent from GET /admin/books` | | | |
| M-44 | P6 | `admin_router.py` | swap the two `user` aliases in the follow join | L-4E-44 | `follow 33 follower_name "Bob", expected "Alice"` | | | |
| M-45 | P6 | `admin_router.py` | `Depends(get_admin_user)` → `Depends(get_current_user)` | L-4E-45 | `GET /admin/stats → 200 for a non-admin` | | | |
| M-46 | P7 | any handler | add one `db.exec(select(func.count(models.User.id))).one()` | L-4E-46 | `GET /notes/feed [signed in] ran 4 queries, budget 4, expected 3 (was 8 before Sprint 4E)` | | | |
| M-47 | P7 | `groups_router.py:301` **or** `users_router.py:240` | restore either N+1 | L-4E-47 | `3 queries at n=3, 25 queries at n=25 — this endpoint scales with row count` | | | |
| M-48 | P7 | `notes_router.py:265` | delete `if not notes: return []` | L-4E-48 | `GET /notes/feed [empty] ran 3 queries, budget 2, expected 2` | | | |
| M-49 | P7 | = M-01 | (the same change, different case) | L-4E-49 | `GET /profile/me unprimed 5 statements / 2 checkouts, primed 3 / 1` | | | |
| M-50 | P7 | `tests/test_query_budget.py` | change the reporter's format string | L-4E-50 | `message did not match the R-06 format` | | | |

**Not mutated, by design:** L-4E-27, L-4E-41 (both are fallback paths whose *presence* is the assertion) and L-4E-50's subject (the reporter, which M-50 covers from the other side).

---

## 9. Gate summary

| Gate | Protects | Command | Exact expected output |
|---|---|---|---|
| **G-4E-00** | the right tree | `git -C .claude/worktrees/sprint-4e branch --show-current`; `git log --oneline -1` | `sprint-4e-query-budget`; base includes `b245acf`. 4C is the base and 4D merges to master first (deploy notes) |
| **G-4E-01** | **the stack is visible (K-02)** | `python -m pip freeze \| grep -iE "^(fastapi\|sqlmodel\|sqlalchemy)="` printed above every pytest run | three lines, recorded in the build notes. `pytest` and `tzdata` must be installed first — `.venv` has neither today (`ModuleNotFoundError: No module named 'pytest'`) and `app.localday` refuses to import without `tzdata` |
| **G-4E-02** | **baseline, before any 4E code** | `.venv\Scripts\python -m pytest tests -q` on `b245acf` | **`535 passed`** (531 `def test` + the 5-way parametrize at `test_local_day.py:1252`, minus the function it replaces). Any other number is investigated before building — a 4C tree that is not 535 means the base moved |
| **G-4E-03** | every package's cases, and nothing else broken | `.venv\Scripts\python -m pytest tests -q` after each package | `535 + <that package's new cases> passed`, 0 failed. Cumulative after P1–P6: **535 + 45 = 580 passed** |
| **G-4E-04** | **the budget guard** | `.venv\Scripts\python -m pytest tests/test_query_budget.py -q` | **`73 passed`** — 68 BQ rows (L-4E-46) + L-4E-47..50 + ST-4E-08. The run prints `budget guard: 68 rows, 2 varies rows, 0 UNDER` (section 7.2). A third `varies` row, or an unexplained UNDER line, blocks the merge |
| **G-4E-05** | the budget module does not leak its engine (K-03) | `pytest tests -q` **and** `pytest tests/test_query_budget.py tests -q` | the same total both times. A different total means `app.dependency_overrides` was not restored |
| **G-4E-06** | static rules | ST-4E-01..08 | as section 4; ST-4E-03's `git diff dependency-map.md` shows no new ⚠️ |
| **G-4E-07** | **R-00 on real bodies** | section 6.4's `dump_endpoints` diff, 4C base vs 4E branch | **empty diff**, including list order |
| **G-4E-08** | **the regression wall was not edited (K-06)** | `git diff --stat tests/` at the end of the sprint | `tests/test_notes.py` with **5 changed lines** (the five ceilings), `tests/conftest.py` (the counter extension), plus **new** files/classes only. Any other existing test file in the diff blocks the merge |
| **G-4E-09** | the tests test something | section 8 | every Critical/Major row caught and restored. **M-35 and M-24 are the two rows the PM should read first** |
| G-4E-10 | the full suite, final | `.venv\Scripts\python -m pytest tests -q` | **`535 + 50 = 585 passed`**, 0 failed (45 package cases + 5 guard cases; the 68 budget rows are parametrised within L-4E-46 and are counted inside G-4E-04's 73, so the suite total counts them once) |
| G-4E-11 | the dependency map | `python scripts/gen_dependency_map.py && git diff --stat dependency-map.md` | no change, or only the curated 4E note Doc Sync writes. An unexpected diff means a route signature moved |
| G-4E-12 | production | section 6, P-4E-00 → P-4E-10 | P-4E-02, 03, 04, 06, 07 are P0 |

> **On the suite totals.** 535 is the 4C baseline, verified statically here (frontmatter) and to be confirmed by G-4E-02 on a machine with pytest installed. If G-4E-02 reports a different number, **every total in this table shifts by the same delta** and the plan is not wrong — but the delta must be explained before building, because the most likely cause is that the base is not 4C.

---

## Test Cases (index)

| IDs | Package / area | Count | Severity |
|---|---|---:|---|
| L-4E-01..06 | P1 request plumbing (R-01, R-02) | 6 | 03, 06 Critical; 01, 02, 04, 05 Major |
| L-4E-07..15 | P2 profile, users, follows | 9 | 09, 10 Critical; 7 Major |
| L-4E-16..22 | P3 notes, likes, comments | 7 | 16, 17, 19, 20, 21 Critical; 18, 22 Major |
| L-4E-23..30 | P4 library, books, activity | 8 | 23, 24, 29 Critical; 25, 26, 28, 30 Major; 27 Minor |
| L-4E-31..38 | P5 circles | 8 | 31, 32, 33 Critical; 34–38 Major |
| L-4E-39..45 | P6 notifications, admin | 7 | 39, 45 Critical; 40, 42, 43, 44 Major; 41 Minor |
| L-4E-46..50 | P7 the guard | 5 | 46–49 Major; 50 Minor |
| BQ-01..44 (+24 branch rows) | budget rows | 68 | asserted by L-4E-46 |
| ST-4E-01..08 | static | 8 | 01, 03 Critical; 04, 05, 06, 08 Major; 02, 07 Minor |
| P-4E-00..10 | production | 11 | 02, 03, 04, 06, 07 P0 |
| RG-4E-01..12 | regression wall | 12 | mostly Critical |
| M-01..M-50 | mutations | 48 | one per Critical/Major case, plus M-50 on the reporter itself |

**Critical cases (17):** 03, 06, 09, 10, 16, 17, 19, 20, 21, 23, 24, 29, 31, 32, 33, 39, 45 — and L-4E-46 carries the sprint's Major weight because it is the only case that cannot rot.

## Priority Guide
- **P0:** ship blocker. Must pass before merge (pytest) or before the release is called done (production).
- **P1:** important. Fix within the sprint.
- **P2:** nice to have.

## Automated
- `pytest tests -q` — 535 today, **585** after 4E.
- `pytest tests/test_query_budget.py -q` — **73**, the guard on its own, the CI-shaped run.
- `node qa/page_perf.mjs --runs 3` — the production page timings for P-4E-06/07/08.
- `curl` + `Server-Timing` — P-4E-01..05, 09, the only way a budget is checked on the real stack.
- Not needed: any web or mobile harness. 4E changes no client file (ST-4E-07).

## Failing Tests
None run yet. Junior QA records each failure here with its reason and disposition: fix now / deferred to sprint N / accepted risk. **Any UNDER line from L-4E-46 is recorded here too, even though it does not fail the run** (section 7.2 rule 4).
