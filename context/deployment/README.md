# Deployment

**Last Updated:** May 3, 2026

---

## Live Deployments

| Service | URL | Auto-deploys from |
|---|---|---|
| Backend (Render) | `https://book-tracker-stitch.onrender.com` | `master` |
| Web (Vercel) | `https://www.trackmyread.com` | `master` |
| Android (Play Store) | TrackMyRead | EAS build from `master` |

**Render free tier** sleeps after 15 min of inactivity — ~30s cold start. Mobile API timeout is 30s to compensate.

---

## Running Locally

```bash
# Backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload          # port 8000

# Web frontend
cd book-tracker-frontend-stitch
npm run dev                            # port 5173

# Mobile (EAS only — no Expo Go)
cd book-tracker-mobile-stitch
eas build --platform android --profile development
npx expo start --dev-client --tunnel
```

---

## Environment Variables

### Backend (`.env`)
```
SECRET_KEY=
DATABASE_URL=sqlite:///./book_tracker.db     # local
# DATABASE_URL=postgresql://...              # prod (Supabase)
CORS_ORIGINS=http://localhost:5173,https://www.trackmyread.com,https://trackmyread.com
GOOGLE_BOOKS_API_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
VAPID_PRIVATE_KEY=
VAPID_PUBLIC_KEY=
VAPID_CLAIMS_SUB=
REVIEW_LOGIN_SECRET=                          # see "Review accounts" below
REVIEW_LOGIN_EMAILS=review.reader@trackmyread.com,review.friend@trackmyread.com
```

### Web frontend (`.env`)
```
VITE_API_BASE_URL=http://127.0.0.1:8000    # local
# VITE_API_BASE_URL=https://book-tracker-stitch.onrender.com   # prod
VITE_GOOGLE_CLIENT_ID=
```

### Mobile (via `app.json` / EAS secrets)
```
API_BASE_URL=https://book-tracker-stitch.onrender.com
GOOGLE_ANDROID_CLIENT_ID=
```

---

## Review accounts

Two allowlisted `@trackmyread.com` accounts (`review.reader@trackmyread.com`,
`review.friend@trackmyread.com`) log in with a shared secret instead of Google, for QA,
screenshots and post-deploy checks. They are ordinary users in every other respect.

**Env vars:** `REVIEW_LOGIN_SECRET` and `REVIEW_LOGIN_EMAILS` (see the backend `.env` block
above). `POST /auth/review-login` returns **404** unless both are set — local dev and CI have it
switched off by default, and switching it on is a deliberate act on Render.

The Render **key names must be exactly** `REVIEW_LOGIN_EMAILS` and `REVIEW_LOGIN_SECRET`. Keys with
any other name (e.g. `Reader_acc`, `Friend_acc`) are ignored and the endpoint stays 404.

**Domain guard:** every address in `REVIEW_LOGIN_EMAILS` must end in `@trackmyread.com`; anything
else is ignored and gets a 401. A typo can never open login for a real user's Gmail.

Generate the secret:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```
Set it in **Render → Environment**, and locally in `.env.review` at the repo root (gitignored via
`.env.*`).

Get a token:
```bash
curl -s -X POST https://book-tracker-stitch.onrender.com/auth/review-login \
  -H "Content-Type: application/json" \
  -d '{"email":"review.reader@trackmyread.com","secret":"<SECRET>"}'
```

Seed the two accounts:
```bash
python scripts/seed_review_accounts.py --base-url https://book-tracker-stitch.onrender.com
```
Idempotent — a second run reports `created 0`.

Log a browser in: open `https://www.trackmyread.com`, then in the console
```js
localStorage.setItem('bt_token', '<access_token>'); location.href = '/home';
```

**Confirm which build is live** (the sprint-2 gap this closes):
```bash
curl -s https://book-tracker-stitch.onrender.com/version
# {"commit":"b8b6124…","service":"book-tracker-stitch","branch":"master"}
```
Compare `commit` against `git rev-parse HEAD`.

**Post-deploy screenshots** (logs in as `review.reader` via the endpoint above, screenshots
Home / Library / Circles / Insights / Profile / Notifications on desktop plus Home / Library on
mobile, and writes `report.json` with console errors and failed API calls per page):
```bash
npm --prefix qa install          # once; Playwright 1.60.0, reuses the cached Chromium
node qa/screenshots.mjs --web https://www.trackmyread.com --api https://book-tracker-stitch.onrender.com --out qa/screenshots/<date>-prod
```
Reads the secret from `REVIEW_LOGIN_SECRET` or `.env.review` (`--secret-file` to override; not
`--env-file`, which Node 22 claims for itself). Exit codes: `0` all pages rendered logged-in with no
failed API calls · `1` a page redirected to login or had failed API calls · `2` no secret · `3` login
refused (`404` = env vars not set on Render). Output under `qa/screenshots/` is gitignored.

---

## Database Migrations

**Production is PostgreSQL (Supabase). Dev is SQLite. They are NOT compatible for schema introspection.**

### CRITICAL: always use `information_schema` (not `sqlite_master` or `PRAGMA`)

```python
# ✅ Works on both SQLite + PostgreSQL:
SELECT column_name FROM information_schema.columns WHERE table_name = 'user'

# ❌ SQLite-only (breaks on prod):
SELECT name FROM sqlite_master WHERE type='table'
PRAGMA table_info(tablename)
```

### Migration workflow

1. Add column to `app/models.py`
2. Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` to `context/supabase_migration.sql`
3. Run the migration in **Supabase → SQL Editor → New Query** (paste the new statement)
4. Confirm "Migration complete" in query results
5. Push `master` → Render auto-deploys

**Never push `models.py` changes to production without first running the migration in Supabase.** New columns with no DB counterpart crash every query on that table (broke prod login April 2026).

### Migration file
`context/supabase_migration.sql` — append new `ALTER TABLE IF NOT EXISTS` statements at the end. Safe to re-run the whole file (all statements are idempotent).

---

## Mobile (EAS Builds)

### Build profiles (`eas.json`)
| Profile | Output | Use for |
|---|---|---|
| `development` | Dev client APK | Hot reload via `--dev-client --tunnel` |
| `preview` | APK (`buildType: apk`) | Internal testing / sideload |
| `production` | AAB (`buildType: app-bundle`, `autoIncrement: true`) | Play Store submission |

**Run EAS commands from the mobile sub-directory:**
```powershell
cd book-tracker-mobile-stitch
eas build --platform android --profile preview
```

### Firebase / FCM Setup (Android Push)

Required files:
- `book-tracker-mobile-stitch/google-services.json` — Firebase config (project: `trackmyread2504`, package: `com.bookpulse.mobile`)
- `app.json` must include `"android": { "googleServicesFile": "./google-services.json" }`

Without `google-services.json`, `getExpoPushTokenAsync()` silently fails — no push tokens are ever registered.

FCM V1 service account key must be uploaded to:  
**Expo Dashboard → Projects → book-tracker-mobile → Credentials → Android → FCM V1**

### Current build version
`versionCode: 44`, AAB submitted to Play Store (as of May 2026).

---

## Push Notifications

Two delivery channels:
- **Expo FCM** — Android mobile (token type `expo`)
- **VAPID / pywebpush** — Web PWA (token type `web`)

`fire_event()` in `app/notifications/dispatcher.py` routes to the correct channel automatically.

Backend push token endpoints:
- `POST /push-tokens/` — register token
- `DELETE /push-tokens/` — deregister on logout

---

## CORS

Configured in `app/main.py`:
```python
origins = ["https://www.trackmyread.com", "https://trackmyread.com", "http://localhost:5173"]
```

If seeing CORS errors in prod, check that the exact origin (including `www.`) is in the list.

---

## File Uploads

All file uploads (profile pictures + note images) go to **Cloudinary** — no local filesystem storage.

- Profile picture: `POST /profile/me/picture` → Cloudinary → stores URL in `user.profile_picture`
- Note/post images: `POST /notes/upload-image` → Cloudinary → returns `image_url`

Cloudinary validates image format server-side; no local validation needed.

---

## Known Issues

- ~~`broadcast_push_notification` uses old `send_push_to_many`~~ — fixed in sprint 2 (2026-09-13): per-user Expo + web push, `admin_broadcast` NotificationLog rows.
- `app/utils/push.py` is still imported (unused) by `likes_comments.py` — cleanup item.
