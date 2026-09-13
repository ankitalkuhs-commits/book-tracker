---
feature: maintenance
status: in-progress
repos: api
last_verified: 2026-09-13
---

## What This Feature Is
Home for correctness and hygiene sprints that fix bugs across several features at once (feed, notes, insights, notifications, profile) without adding product surface. Each sprint node lists which feature nodes it touches; learnings are cross-linked back.

## Work Items
| Item | Status | Node |
|---|---|---|
| Sprint 2 — seven audit bugs + git hygiene | in-progress | [sprint-2-audit-bugs/](sprint-2-audit-bugs/) |

## Cross-Feature Dependencies
- depends_on: features/community (notes, feed, push), features/reading-stats (insights), features/auth (profile)
- depended_by: none
