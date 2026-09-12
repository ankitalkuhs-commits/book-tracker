---
screen: [screen-name]
feature: [feature-name]
test_plan_written: YYYY-MM-DD
last_run: YYYY-MM-DD
pass_rate: [X/Y]
---

## Test Cases
| # | Case | Priority | Status | Notes |
|---|---|---|---|---|
| T01 | [Happy path — primary action works] | P0 | [PASS/FAIL/SKIP] | |
| T02 | [Ownership — user A cannot read/mutate user B's row by changing the id] | P0 | | |
| T03 | [Privacy — private profile / private group content hidden from non-follower / non-member] | P0 | | |
| T04 | [Auth required — unauthenticated request rejected 401] | P0 | | |
| T05 | [Response shape matches dependency-map.md contract; no raw SQLModel returned] | P0 | | |
| T06 | [Empty state renders] | P1 | | |
| T07 | [Error / cold-start state renders with retry] | P1 | | |
| T08 | [Web + mobile parity, or documented exception] | P1 | | |

## Priority Guide
- P0: Ship blocker. Must pass before release.
- P1: Important. Fix within sprint.
- P2: Nice to have.

## Automated
`pytest tests -q` — [which test file/classes cover this screen]

## Failing Tests
[Each failing test, reason, disposition: fix now / deferred to sprint N / accepted risk]
