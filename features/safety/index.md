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
| 2 | A mechanism to report offensive content, with timely responses | **Built 2026-10-11** (4I-A, merged, not yet deployed). `POST /reports` from every surface, a push to the admin, `GET /admin/reports`. Commitment: 2 working days, matching trackmyread.com/support. |
| 3 | The ability to block abusive users | **4I-B in build.** Symmetric, deletes the follow rows and any pending circle request or invite, honoured at fourteen serving paths. |
| 4 | Published contact information | **Done** — `trackmyread.com/support` |

## Screens / Work Items

| Item | Status | Node |
|---|---|---|
| Sprint 4I — Report and Block (Guideline 1.2 items 2 and 3) | **4I-A merged** (855 tests, zero query budgets moved, PM SQL step 10 outstanding). **4I-B in build** — symmetric block at fourteen serving paths, PM SQL step 11, 24 of the 67 budget rows move +1 and are re-measured. All eight escalations answered in `pm-decisions.md` (2026-10-11): symmetric block, report changes nothing globally, one client release for both halves. Clients (P4/P5) and the admin Reports tab still to build. | [sprint-4i-report-block/](sprint-4i-report-block/) |

## Cross-Feature Dependencies

- depends_on: `features/auth` (`get_current_user`, `get_current_user_optional`, `get_admin_user`,
  `deny_bot_actor`), `features/community` (every surface a block filters), `features/maintenance`
  (Sprint 4E's query-budget guard, which this sprint moves 24 rows of).
- depended_by: the iOS submission. The build cannot be submitted until items 2 and 3 above exist.
