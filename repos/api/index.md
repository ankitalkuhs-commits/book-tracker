---
repo: api
path: app/
purpose: FastAPI backend — both clients consume this
tech: FastAPI 0.95, SQLModel 0.0.8, SQLAlchemy 1.4, PostgreSQL (Supabase) / SQLite (dev)
deploy: Render free tier → https://book-tracker-stitch.onrender.com, auto-deploys from master
last_verified: 2026-09-12
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

## Health (2026-09-12)
- pytest: 103 pass / 12 fail (stale `add-to-library` response-shape expectations in tests)
- No CI on backend (workflows only build the Android app)
- Render free tier sleeps → 14:30 UTC scheduler job rarely fires
- See dependency-map.md and the Sept 2026 audit memory for open findings
