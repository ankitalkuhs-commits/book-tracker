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
BOT_LOGIN_SECRET=                             # see "Editorial bots" below (Sprint 4F)
BOT_LOGIN_EMAILS=tmrbot@trackmyread.com,tmrprompts@trackmyread.com,tmrquotes@trackmyread.com,tmrcircles@trackmyread.com
APPLE_AUDIENCES=                              # see "Sign in with Apple" below (Sprint 4G)
APPLE_TEAM_ID=                                # R-13 revocation only
APPLE_KEY_ID=                                 # R-13 revocation only
APPLE_PRIVATE_KEY=                            # R-13 revocation only, the .p8 PEM
```

`BOT_LOGIN_SECRET` and `BOT_LOGIN_EMAILS` are **both** required for `POST /auth/bot-login`
to exist at all. With either unset the route returns 404, so it does not exist locally, in
tests, or in a fork.

`APPLE_AUDIENCES` is required for `POST /auth/apple` to exist at all — with it unset the route
returns 404, the same contract. The three `APPLE_*` revocation variables are independent of it:
with any of them unset, sign-in still works and **R-13 is inert** (see "Sign in with Apple").

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

## Editorial bots (Sprint 4F)

Four automated accounts post seven times a week to the community feed. They run on GitHub
Actions (`.github/workflows/tmr-bots.yml`), not on Render — the paid "TMR bot Cron Job"
Render service is **deleted**, not suspended, and the old `editorial_bot.py` is unscheduled.

### The bots hold no database credential

The repository is **public** (`gh repo view --json visibility` -> `PUBLIC`). Workflow files
and every run log are world-readable, so a production connection string in Actions would be
an unrecoverable disclosure. The bots therefore have **zero** direct database access: they
post with `POST /notes/` and read `GET /bots/posted`, both with a 15-minute token.

> **`DATABASE_URL` must never be created as a GitHub Actions secret.** Not temporarily, not
> "just for dedup", not behind a comment saying it will be removed. If something appears to
> need one, that is an escalation, not a workflow edit. Check it by name after every change:
> Settings -> Secrets and variables -> Actions. There must be no `DATABASE_URL` in the list.

### What the PM must create

**GitHub repository secrets** — Settings -> Secrets and variables -> Actions -> *Secrets*
tab -> **New repository secret**:

| Name | Value |
|---|---|
| `BOT_LOGIN_SECRET` | a long random string; the **same** value set on the Render API service |
| `NYT_API_KEY` | existing NYT Books API key (already held for `editorial_bot.py`) |
| `GEMINI_API_KEY` | existing Gemini key (already held for `editorial_bot.py`) |

**GitHub repository variable** — same page, ***Variables* tab** -> **New repository
variable**:

| Name | Value |
|---|---|
| `BOT_ENABLED` | `true` to let the bots post; anything else stops every run |

`BOT_ENABLED` is a *variable*, not a secret, so its value is visible — which is the point:
anyone can see at a glance whether the bots are on.

**Render, on the API service** — Environment -> Add Environment Variable:

| Name | Value |
|---|---|
| `BOT_LOGIN_SECRET` | the same string as the GitHub secret |
| `BOT_LOGIN_EMAILS` | `tmrbot@trackmyread.com,tmrprompts@trackmyread.com,tmrquotes@trackmyread.com,tmrcircles@trackmyread.com` |

### Kill switch 1 — `BOT_ENABLED` (no deploy, no restart)

This is the first lever. It stops the next scheduled run at its **first step**, before
checkout, before any dependency is installed and long before a token is minted.

1. Open the repository on github.com.
2. **Settings** (top tab bar of the repository, not your account settings).
3. In the left sidebar, **Secrets and variables** -> **Actions**.
4. Choose the **Variables** tab (next to *Secrets*).
5. Click the pencil / **Edit** on `BOT_ENABLED`.
6. Set the value to `false`. Click **Update variable**.

Effect: the next run reaches step 1, prints

```
BOT_ENABLED is not 'true' (repository variable). Stopping before any post.
Set it back to 'true' in Settings > Secrets and variables > Actions > Variables.
```

and stops there with a failed run. The failure is deliberate: a kill switch that leaves a
green tick is a kill switch somebody forgets is on. No post is made, no token is minted, and
nothing has to be deployed or restarted. Reverse it by setting the value back to `true`.

### Kill switch 2 — clear `BOT_LOGIN_SECRET` on Render (emergency)

This revokes the ability to log in at all, for every bot, immediately. It restarts the API
service, so it is the **second** lever, not the first.

1. Render dashboard -> the API service -> **Environment**.
2. Delete the `BOT_LOGIN_SECRET` variable (or blank its value).
3. **Save Changes** — the service restarts.

With either `BOT_LOGIN_SECRET` or `BOT_LOGIN_EMAILS` unset, `POST /auth/bot-login` returns
404 and no bot can obtain a token. Readers are unaffected: the route is bot-only and no
reader credential passes through it.

### Manual post

Actions -> **TMR bots** -> **Run workflow** -> pick `bestseller | prompt | quote | circles`.
A manual dispatch skips the 0-25 minute jitter (the clustering it prevents cannot happen for
a one-off run). `BOT_ENABLED` still gates it.

### Deploy order

Unchanged from the P1/P2 build notes: the PM runs `PM_SQL_QUEUE.md` step 6, then step 7,
**then** the API is deployed, then `BOT_LOGIN_SECRET` / `BOT_LOGIN_EMAILS` are set on Render,
then `python -m migrations.add_bot_accounts` is run against production. Only after all of
that is `BOT_ENABLED` set to `true`.

---

## Sign in with Apple (Sprint 4G)

Four environment variables on the Render **API service**, in two independent groups. Neither
group needs a code deploy; both are read per request.

| Name | Group | What happens when it is unset |
|---|---|---|
| `APPLE_AUDIENCES` | sign-in | `POST /auth/apple` returns **404**. No Apple sign-in is possible — locally, in CI, or in a fork. |
| `APPLE_TEAM_ID` | revocation (R-13) | revocation is **inert**: nothing is sent, the Render log says `apple revoke: not configured, skipped`, and the deletion completes exactly as before. |
| `APPLE_KEY_ID` | revocation (R-13) | same |
| `APPLE_PRIVATE_KEY` | revocation (R-13) | same |

`APPLE_AUDIENCES` is the **bundle id**, `com.bookpulse.mobile` (kept knowingly — pm-decisions
E-2). It is a comma-separated list so a web client can be added later with no API change;
today it is one value.

### What the PM must create for R-13 — the token revocation key

Apple requires an app that offers Sign in with Apple *and* account deletion to revoke the
reader's tokens as part of the deletion; it is checked in review alongside Guideline 5.1.1(v).
Until the key below exists, **R-13 ships inert and that is a recorded submission risk, not an
oversight** (pm-decisions E-4).

1. **Apple Developer portal -> Certificates, Identifiers & Profiles -> Keys -> `+`.**
   Name it something like `TrackMyRead Sign in with Apple`, tick **Sign in with Apple**,
   configure it against the `com.bookpulse.mobile` primary App ID, and **Continue -> Register**.
2. **Download the `.p8`. It is downloadable exactly once.** Store it in the password manager,
   not in the repository, not in a chat, not in a commit. The existing
   `AuthKey_4W4FHZ8NRR.p8` (the App Store Connect CI key) is a **different** key for a
   different purpose and must not be reused here.
3. Note the **Key ID** shown on the key's page (10 characters, the `AuthKey_<KEYID>.p8`
   fragment of the filename) and the **Team ID** from the top-right of the portal
   (10 characters).
4. **Render -> the API service -> Environment -> Add Environment Variable**, three of them:

   | Name | Value |
   |---|---|
   | `APPLE_TEAM_ID` | the 10-character Team ID |
   | `APPLE_KEY_ID` | the 10-character Key ID of the key from step 1 |
   | `APPLE_PRIVATE_KEY` | the **entire contents** of the `.p8`, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines and the newlines between them |

5. Save. Render restarts the service; there is nothing to deploy and nothing to merge.

**It must never reach GitHub Actions.** This repository is public. Nothing in CI needs it: the
outbound revocation call is injected in every test (`app.apple_keys.http_post`) and every case
signs with an EC key the test generates.

**Rotation** is a new key in the portal plus two env edits (`APPLE_KEY_ID`,
`APPLE_PRIVATE_KEY`). Compromise lets an attacker revoke our readers' Apple sessions — a
nuisance, not a data breach: the key reads nothing and writes nothing in our database.

**Kill switch:** blank `APPLE_PRIVATE_KEY`. Revocation goes inert again on the next request and
account deletion is unaffected, because revocation can never block a deletion.

### Verifying R-13 once the key is set

A one-time manual check with a **throwaway** Apple ID on a TestFlight build (done-checklist 11):
sign in, delete the account in Settings -> Account, then confirm TrackMyRead no longer appears
under that Apple ID's *Settings -> Apple ID -> Password & Security -> Apps Using Apple ID*. The
Render log for that deletion must show one `apple revoke: status <code>` line and nothing else
— no token, no email, no `sub`, no `client_secret`, no response body (P-4G-12).

---

## Known Issues

- ~~`broadcast_push_notification` uses old `send_push_to_many`~~ — fixed in sprint 2 (2026-09-13): per-user Expo + web push, `admin_broadcast` NotificationLog rows.
- `app/utils/push.py` is still imported (unused) by `likes_comments.py` — cleanup item.
