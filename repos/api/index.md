---
repo: api
path: app/
purpose: FastAPI backend — both clients consume this
tech: FastAPI 0.95, SQLModel 0.0.8, SQLAlchemy 1.4, PostgreSQL (Supabase) / SQLite (dev)
deploy: Render free tier → https://book-tracker-stitch.onrender.com, auto-deploys from master
last_verified: 2026-09-13 (sprint-2-audit-bugs: R1–R7 shipped, 72/72 verdict PASS, pytest 213/0)
---

## Entry Points
| File | Purpose |
|---|---|
| app/main.py | App entry, CORS list, router mounts, scheduler start |
| app/database.py | engine + `get_db` (generator, closes) / `get_session` (raw Session — legacy, prefer get_db) |
| app/deps.py | `get_current_user` (401), `get_current_user_optional`, `get_admin_user` (403) |
| app/models.py | All SQLModel tables — **every change needs context/supabase_migration.sql run first** |
| app/routers/ | One router per feature |
| app/notifications/dispatcher.py | `fire_event()` — the only way to send push |
| app/notifications/config.py | NOTIFICATION_EVENTS registry (title/body templates) |
| tests/ | pytest suite, in-memory SQLite (`pytest tests -q`) |

## Features Served
- [auth](../../features/auth/) · [library](../../features/library/) · [community](../../features/community/) · [reading-stats](../../features/reading-stats/)

## Calls Into
- Supabase PostgreSQL · Google OAuth (token verify) · Google Books API · Cloudinary (images) · Expo Push · Web Push (VAPID) · Gemini + NYT (editorial_bot.py, cron)

## Called By
- web (`book-tracker-frontend-stitch/src/services/api.js`) · mobile (`book-tracker-mobile-stitch/src/services/api.js`)

## Health (2026-09-13 — sprint 2)
- pytest: 213 passed, 0 failed (was 150; sprint-2-audit-bugs +63 new tests)
- Venvs + `.pyc` files untracked from git; `book_tracker.db` untracked (12,313 files removed from index; both .venv/ and venv/ remain on disk)
- No CI on backend (workflows only build the Android app)
- Render free tier sleeps → 14:30 UTC; scheduler fires but is queued inefficiently (all users per-recipient sequentially)
- Seven audit bugs fixed: friends-feed reorder (mutuals first), own-note likes (real state), private-note privacy (group activity), insights months/streak (calendar math), profile PII logging, streak reminder through dispatcher, admin broadcast on both channels
- Carried open items: `/auth/signup|login` PM decision, `/api/googlebooks/*` auth PM decision, dead client calls (web `demoLogin`, mobile `userAPI.getUser`), DB repair for pre-May-4 rating bugs, unused `send_push_notification_to_user` import, missing `og-image.png`, Vercel `build:ssg` unverified
