---
screen: sprint-4e-query-budget
feature: maintenance
status: descoped — approved 2026-09-23
decided_by: PM
---

# Sprint 4E is cut from seven packages to three

## Why — the sprint's own premise expired

`spec.md` justifies the sprint with: *"a removed query saves ~200 ms today and still ~60 ms after
co-location."* That 60 ms assumed the outcome where the API moved to Singapore and the database
moved to Mumbai. **That is not what happened.** F-68 shipped on 2026-09-22 with API and database
both in Singapore, and the measured per-query cost is **3 ms**, not 60.

Re-costing this sprint's own "after" column against the 3 ms that queries actually cost now:

| page | queries | saved at 3 ms/query |
|---|---|---|
| Home feed | 40 → 19 | 63 ms |
| Circle detail | 43 → 29 | 42 ms |
| `/admin/stats` | 15 → 2 | 39 ms |

Signed-in pages now finish in ~740 ms desktop. Rewriting six routers for 40–65 ms is a poor trade
against the regression risk, and the risk is real: P2–P6 touch every endpoint a reader hits.

**This is not a reversal of the analysis. The analysis was right when it was written**, and it is
what identified F-68 in the first place. The migration is what changed the arithmetic.

## What still ships, and why each survived

### KEEP — P1, request plumbing (`app/deps.py`, `app/database.py`)

R-01 and R-02. Three round trips off the first request of every reader's local day. Small,
contained, and it applies to every authenticated endpoint rather than to one page.

### KEEP — the two N+1 loops only

These are the **only** part of the sprint whose cost is not a constant. Everything else saves a
fixed number of milliseconds; an N+1 gets worse every time a reader adds a row.

- `GET /users/{id}/stats` — 3 queries + one per finished book. A reader with 100 finished books
  costs 103 queries. That was ~20 s before the migration and is ~310 ms now, and it keeps growing.
- `GET /groups/my/pending` — 3 queries + one per pending circle.

Scope is the two loops, **not** the rest of P2 and P5. A Builder fixing the loop does not get to
"while I'm here" the surrounding file — the point of the cut is to stop touching those routers.

### KEEP — P7, the query-budget guard (`tests/test_query_budget.py`, `tests/conftest.py`)

The most valuable thing in the sprint and the cheapest. A test that fails the build, naming the
endpoint and both numbers, when a count rises.

**Its budgets change meaning under this cut.** P7 was specified to take its budgets from the
post-fix counts in each package's build notes. With P2–P6 dropped there are no post-fix counts for
most endpoints, so:

- Every endpoint's budget is set to its **measured count on this branch after P1 and the two N+1
  fixes land** — a ratchet meaning "no worse than today", not "as good as 4E would have made it".
- The budget file records, per endpoint, that the number is a ratchet rather than a target, so
  nobody later reads it as evidence the optimisation was done.
- A count that drops later is a chance to lower the budget, not a failure.

## DROPPED — P2 (less the N+1), P3, P4, P5 (less the N+1), P6

The bulk micro-optimisation. Not cancelled on merit — re-open it if per-page timings regress or the
query counts grow. The measurements in `architecture.md` stay valid and are the starting point if
it comes back.

## Second payoff: 4F stops waiting

4E's **P3** (`notes_router.py`, `likes_comments.py`, `crud.py`) was the sole reason Sprint 4F had
to merge after 4E. With P3 dropped, that file overlap disappears and the two sprints are
independent. The merge-order constraint in `features/community/sprint-4f-activity-engine/architecture.md`
is lifted — **except** for `crud.py`, which 4F touches for its own reason (the `commit=` kwarg) and
4E no longer touches at all. So there is no longer any collision in either direction.

Whoever merges either branch must confirm that in the diff rather than trusting this paragraph.
