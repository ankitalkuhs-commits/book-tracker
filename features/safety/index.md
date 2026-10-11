---
feature: safety
status: design
repos: api, web, mobile
last_verified: 2026-10-11
---

## What This Feature Is

Reader safety on user-generated content: reporting, blocking, and the moderation surface the PM works
from. This is the feature area App Store Review Guideline **1.2** governs, and it is a product area
rather than a hardening pass — `features/security/` stays the home for cross-cutting Platform Guardian
findings that are not reader-facing.

Guideline 1.2 asks for four things of an app that shows user-generated content. As of master
`1162479`:

| # | Requirement | State |
|---|---|---|
| 1 | A method for filtering objectionable material | **Partial** — admin hard-delete of a note (`app/routers/admin_router.py:538-554`) or a comment (`:557-568`) |
| 2 | A mechanism to report offensive content, with timely responses | **Missing** |
| 3 | The ability to block abusive users | **Missing** |
| 4 | Published contact information | **Done** — `trackmyread.com/support` |

## Screens / Work Items

| Item | Status | Node |
|---|---|---|
| Sprint 4I — Report and Block (Guideline 1.2 items 2 and 3; `report` and `block` tables, `POST /reports` + an admin queue with a push to the admin, `POST`/`DELETE /blocks` honoured at **fourteen** serving paths, both clients) | **design draft, eight escalations open — E-1 the block symmetry, E-2 circles, E-3 what a report does before review and the response-time commitment, and E-5 the sprint split all block the build.** Two PM SQL steps (10, 11) gate the two deploys. Honestly 8–12 days; the recommended shape is **two sprints of API work behind one store release**. 24 of the query-budget guard's 67 rows move by +1 and are re-measured, not relaxed. | [sprint-4i-report-block/](sprint-4i-report-block/) |

## Cross-Feature Dependencies

- depends_on: `features/auth` (`get_current_user`, `get_current_user_optional`, `get_admin_user`,
  `deny_bot_actor`), `features/community` (every surface a block filters), `features/maintenance`
  (Sprint 4E's query-budget guard, which this sprint moves 24 rows of).
- depended_by: the iOS submission. The build cannot be submitted until items 2 and 3 above exist.
