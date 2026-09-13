---
date: 2026-09-13
agent: Doc Sync (haiku)
input: review-login sprint closing (spec tested, 252/0 pytest, qa/screenshots.mjs added)
---

# Doc Sync Retro — Review Login + /version

## Files Created or Updated

| File | Status | Notes |
|---|---|---|
| `features/auth/review-login/spec.md` | Updated | status → `tested`; last_verified 2026-09-13 |
| `features/auth/review-login/learnings.md` | Created | 8 learnings (a–h): auth model, env keys, Node flags, paths, preview_start, Builder cutoff, server cleanup, deploy verification |
| `features/auth/index.md` | Updated | Row: Review login status → `tested` |
| `repos/api/index.md` | Updated | Health: pytest 252/0 (was 213); `/version` exists; review-login gated; last_verified 2026-09-13 |
| `context/LOAD_ME_FIRST.md` | Updated | Added "Recently Shipped (Sept 13 — Review login + /version)" section; added two CRITICAL PATTERNS (Confirm a deploy, QA login); moved PM action to Known Issues |
| `context/INDEX.md` | Updated | Added `features/auth/review-login/`, `qa/screenshots.mjs`, new `meta_router.py` entry |
| Memory: `project_review_login.md` | Created | How to use, files, secret location, key facts |
| Memory: `feedback_check_auth_model_first.md` | Created | When proposing QA logins, state auth model first |
| Memory: `MEMORY.md` | Updated | Two new lines pointing to project/feedback files |

## Spec → Built Divergences

| What | Spec said | Built | Why |
|---|---|---|---|
| `.env.*` gitignore line | R4 to add | Already present | Orchestrator added it ahead of build; only the README section was new |

## Accepted Open Issues (for PM Review)

Three items below require PM review.

---

## Needs PM Review

### 1. Set Render environment variables (blocks live checks)
**Action:** Set on Render → Environment:
- `REVIEW_LOGIN_SECRET`: generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`; paste the 43-char output
- `REVIEW_LOGIN_EMAILS`: `review.reader@trackmyread.com,review.friend@trackmyread.com`

**Why:** The endpoint returns 404 until both are set (safe by design). The live checks (T47, T74–T77) — seed twice, production screenshots with `/version` verify, sprint-2 live checks 1–4 — cannot run without this.

**When:** Before running Done Checklist items 4 and the sprint-2 live verifications.

**Critical:** The key names are case-sensitive and **exact** — misnamed keys (e.g., `Reader_acc`, `Friend_acc`) are silently ignored and the endpoint stays 404. `GET /version` will confirm the deploy is live and will prove whether the keys are set.

---

### 2. `/auth/signup` and `/auth/login` are now fully redundant
**Finding:** The review-login endpoint is the only reason these password-based routes are needed. All existing users authenticate via Google, and QA now has an allowlisted backend route. Both endpoints remain untouched in this sprint (spec §Not building), but removing them next sprint is recommended.

**Decision pending:** Keep or remove?

---

### 3. `/api/googlebooks/*` authorization decision
**Finding:** The two review accounts will use `GET /api/googlebooks/search` to find books. The route is currently unauthenticated, which is fine for QA and for a public landing-page search flow. But it also means any user can enumerate the entire Google Books database with no rate limit.

**Decision pending:** Require auth? Add rate limiting? Leave as-is for now?

---

## Test Summary

**JUnit / pytest:** 252 passed, 0 failed (was 213; +39 new for review-login)
- R1 (`POST /auth/review-login`): 32 tests covering 404s (unconfigured, blank, empty list), 401s (email, secret, domain), domain guard, case-insensitivity, name derivation, token validity, last_active, ownership, OpenAPI schema, 405 on GET
- R2 (`GET /version`): 7 tests covering null env, env reflection, exactly three keys, no auth required, no env dump, partial env, per-request read
- Regression: all sprint-1 and sprint-2 tests pass unchanged

**Live checks:** 5 blocked on PM action (Render env keys)
- T47: seed idempotency (second run creates 0)
- T74–T77: production `/version` matches HEAD, seed, screenshots, sprint-2 live checks 1–4

---

## Known Issues Noted (Not Fixed)

- Pre-existing: `app/main.py` and `create_tables.py` print emoji on startup, raising `UnicodeEncodeError` on Windows cp1252 console (worked around with `PYTHONIOENCODING=utf-8` for smoke test; not a code fix)
- Pre-existing: local `book_tracker.db` was stale schema (missing `user.profile_picture`); deleted and regenerated (throwaway dev data, acceptable per orchestrator)
- Out of scope: `TestGoogleAuth` missing (no automated test for `POST /auth/google` anywhere — recommend next sprint)
