---
feature: security
status: in-progress
repos: api
last_verified: 2026-09-12
---

## What This Feature Is
Cross-cutting hardening work: auth on every route, ownership/privacy enforcement, push-channel integrity, repo hygiene. Not a user-facing feature — a home for Platform Guardian findings that become sprints.

## Screens / Work Items
| Item | Status | Node |
|---|---|---|
| Sprint 1 hardening (books auth, push token_type, stale tests, venv untracking) | in-progress | [sprint-1-hardening/](sprint-1-hardening/) |

## Cross-Feature Dependencies
- depends_on: features/auth (`get_current_user`, `get_admin_user`)
- depended_by: features/library (books endpoints), features/community (push tokens)
