---
feature: maintenance
status: in-progress
repos: api, web
last_verified: 2026-09-23 (Work Items table only)
---

## What This Feature Is
Home for correctness and hygiene sprints that fix bugs across several features at once (feed, notes, insights, notifications, profile) without adding product surface. Each sprint node lists which feature nodes it touches; learnings are cross-linked back.

## Work Items
| Item | Status | Node |
|---|---|---|
| Sprint 2 — seven audit bugs + git hygiene | tested | [sprint-2-audit-bugs/](sprint-2-audit-bugs/) |
| Sprint 4A — platform audit (api + web; decision-free subset + PM decisions + live probes) | in-progress (architecture complete) | [sprint-4a-platform-audit/](sprint-4a-platform-audit/) |
| Sprint 4D — page load speed (web only; F-69, F-70 + same-pattern F-70b/c, privacy fix F-71 proposed) | planned (architecture complete, spec awaiting PM approval) | [sprint-4d-page-speed/](sprint-4d-page-speed/) |
| Sprint 4E — query budget (api) | **complete 2026-09-23, descoped 7 packages → 3** — branch `sprint-4e-query-budget`. Shipped: P1 (the once-a-day `last_active` write off the request path), the two N+1 loops (`GET /users/{id}/stats`, `GET /groups/my/pending`, both flat at 3), and P7, the query-budget guard: **67 rows over 44 endpoints, 3 targets and 64 ratchets**. `pytest tests -q` 546 → **620 passed**. Dropped: P2 (less the N+1), P3, P4, P5 (less the N+1), P6. **Why it was cut:** the sprint was costed at ~60 ms saved per removed query, which assumed the Oregon→Singapore migration landed differently; the migration shipped 2026-09-22 and a query now costs **3 ms**, so the bulk micro-optimisation no longer paid for its regression risk. The analysis was right when written — it is what found F-68 in the first place. | `sprint-4e-query-budget/` (on its own branch) |

## Cross-Feature Dependencies
- depends_on: features/community (notes, feed, push), features/reading-stats (insights), features/auth (profile)
- depended_by: none
