---
screen: review-login
feature: auth
last_verified: 2026-09-13
---

## Web (book-tracker-frontend-stitch)
No change. No file touched. No login UI added (spec §Not building) — a review token is placed
into `localStorage.bt_token` by hand.

## Mobile (book-tracker-mobile-stitch)
No change. No file touched. No app.json version / versionCode bump, no EAS build.

## Backend (app/)
| What | File | Notes |
|---|---|---|
| Route handler | `app/routers/auth_router.py` → `review_login()` | Appended after `google_auth`. `_review_login_config()` reads `REVIEW_LOGIN_SECRET` / `REVIEW_LOGIN_EMAILS` at request time. `ReviewLoginIn` schema added beside `GoogleAuthIn`. |
| Route handler | `app/routers/meta_router.py` → `get_version()` | New file. `APIRouter(tags=["meta"])` with **no `prefix=`**, so it serves at `/version` — see ADR-001. |
| Wiring | `app/main.py` | `meta_router` added to the routers import list; `app.include_router(meta_router.router)` added after `import_router.router`. Nothing else changed. |
| Model | none | No column, no table. Review users are ordinary `user` rows created via unmodified `crud.create_user`. |
| Migration | none | `context/supabase_migration.sql` not touched — nothing to run in Supabase before this deploy. |
| Tests | `tests/test_auth.py::TestReviewLogin` (32 tests) | Appended after `TestPublicDeleteAccountForm`. `REVIEW_SECRET` module constant + `_configure()` helper. |
| Tests | `tests/test_version.py::TestVersion` (7 tests) | New file, one class. |

## Scripts
| What | File | Notes |
|---|---|---|
| Seed script | `scripts/seed_review_accounts.py` | New file. Plain `requests` client, no `app/` import, no DB access. Reads `REVIEW_LOGIN_SECRET` from env, then from `--env-file` (default: repo-root `.env.review`). Idempotent per-step (books by `google_books_id`, notes by exact text, follow/circle/membership/post each checked before creating). |

## Docs
| What | File | Notes |
|---|---|---|
| Deployment guide | `context/deployment/README.md` | Two `REVIEW_LOGIN_*` lines added to the backend `.env` block (empty secret value); new `## Review accounts` section inserted between `## Environment Variables` and `## Database Migrations`. `## Known Issues` untouched. |
| Dependency map | `dependency-map.md` | Curated `### Auth / review` subsection (pre-existing, written by the Architect); generated appendix regenerated — 109 routes (was 107), both new routes appear as `NONE` + ⚠️ with `—` in both client columns. |
| ADR | `features/auth/review-login/decisions/ADR-001-version-route-placement.md` | Why `/version` lives in a standalone router with no prefix, not in `main.py` or `auth_router.py`. |

## Notes

- `.gitignore` already contained `.env.*` before this sprint (added by the orchestrator ahead of the build) — R4's gitignore requirement was already satisfied; only the README section was new work.
- **Diverged from brief:** `scripts/seed_review_accounts.py` takes an additional `--env-file` option (default: repo-root `.env.review`), per the orchestrator's instruction, so the missing-secret path (T41) is testable without touching the real `.env.review`. Secret resolution order is unchanged: `REVIEW_LOGIN_SECRET` env var first, then the file at `--env-file`.
- **Bug fixed during the local smoke test, in this sprint's own new file only:** the seed script's final summary used Unicode box-drawing characters (`─`) and an em-dash in two note strings; on a Windows console using the `cp1252` code page (no `PYTHONIOENCODING` set) this raised `UnicodeEncodeError` after all API work had already completed, crashing before the summary printed. Replaced with plain ASCII (`-`) throughout the script. No other file was touched for this.
- The local smoke test hit two **pre-existing, unrelated** issues that are not part of this sprint's scope and were **not fixed** as code changes (both are documented, not silently worked around):
  1. `app/main.py`'s `startup_event` and `create_tables.py` both `print()` a checkmark emoji; on this machine's Windows console (cp1252) that raises `UnicodeEncodeError` when stdout isn't UTF-8, which crashed the app at FastAPI startup. Worked around for the smoke test only by setting `PYTHONIOENCODING=utf-8` on the uvicorn/`create_tables.py` invocations — no source file was changed.
  2. The local `book_tracker.db` (untracked dev data) predated a schema change (missing `user.profile_picture`), so `crud.get_user_by_email` 500'd on first use. Deleted the stale local file and reran `create_tables.py` (PYTHONIOENCODING=utf-8) to get a fresh schema — this is throwaway local dev data per the orchestrator's own instructions, not a tracked file.
