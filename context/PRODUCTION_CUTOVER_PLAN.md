# Production Cutover Plan — Stitch → Production
**Created:** April 29, 2026  
**Status:** PENDING — will execute next iteration  
**Branch:** `stitch-experiment` → `master`

---

## Infrastructure Reality (READ FIRST)

| | Production (current) | Stitch |
|---|---|---|
| Backend URL | `book-tracker.onrender.com` (or similar) | `book-tracker-stitch.onrender.com` |
| Render tier | **Paid** (always-on) | **Free** (spins down after 15 min inactivity) |
| Database | **Render PostgreSQL** (hosted on Render) | **Supabase PostgreSQL** |
| Users/data | Real users, real data | Test data only |

This means the cutover is **not** just a frontend switch. It requires:
1. Upgrading the stitch Render service to paid tier (or migrating backend to the existing paid service)
2. Migrating all existing user data from Render PostgreSQL → Supabase PostgreSQL
3. Adding all missing schema columns to the prod DB before migration

---

## Phase 0 — Infrastructure & Data Migration (NEW — Do Before Everything Else)

### 0.1 — Decide: upgrade stitch Render service OR move backend to existing paid service

**Option A (recommended) — Upgrade stitch Render service to paid**
- Go to Render dashboard → `book-tracker-stitch` service → Settings → Plan → upgrade to Starter ($7/mo)
- This avoids any URL changes — mobile and web already point to `book-tracker-stitch.onrender.com`
- The existing paid service (`book-tracker`) can then be wound down

**Option B — Deploy stitch code to existing paid Render service**
- Push the stitch backend code to the existing paid Render service
- Update `VITE_API_BASE_URL` and mobile `API_BASE_URL` to point to the paid service URL
- More disruptive — URL changes everywhere

**Option A is strongly preferred.** Proceed with the rest of this plan assuming Option A.

### 0.2 — Add missing schema columns to Render PostgreSQL (prod DB)

The prod Render PostgreSQL has the old schema — it is missing all the columns added for stitch. Run `context/supabase_migration.sql` **adapted for the Render DB** (the SQL is already PostgreSQL-compatible, just run it in the Render PostgreSQL console or via `psql`).

```bash
# Connect to Render PostgreSQL
psql <RENDER_POSTGRES_CONNECTION_STRING>

# Then paste/run context/supabase_migration.sql
```

This is safe — every statement uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`.

**Columns being added to existing tables (user data is preserved):**
- `user`: username, bio, profile_picture, yearly_goal, is_admin, last_active, deletion_requested_at, is_private_profile, notification_prefs
- `userbook`: rating, format, ownership_status, borrowed_from, loaned_to, updated_at
- `note`: emotion, image_url, quote, updated_at
- `book`: tags, description, publisher, published_date, format, pages_source, google_books_id
- `pushtoken`: token_type, device_info, updated_at
- New tables: `reading_activity`, `reading_group`, `group_member`, `group_post`, `notificationlog`, `group_activity`

### 0.3 — Pre-migration audit (run on prod DB BEFORE migration day)

Before touching anything, get a baseline. Run these on the Render PostgreSQL and save the output:

```sql
-- Baseline counts — save this output
SELECT 'user'             AS tbl, COUNT(*) FROM "user"
UNION ALL SELECT 'book',           COUNT(*) FROM book
UNION ALL SELECT 'userbook',       COUNT(*) FROM userbook
UNION ALL SELECT 'note',           COUNT(*) FROM note
UNION ALL SELECT 'follow',         COUNT(*) FROM follow
UNION ALL SELECT 'like',           COUNT(*) FROM "like"
UNION ALL SELECT 'comment',        COUNT(*) FROM comment
UNION ALL SELECT 'pushtoken',      COUNT(*) FROM pushtoken;

-- Check for any constraint violations that would block restore
SELECT COUNT(*) FROM userbook WHERE user_id NOT IN (SELECT id FROM "user");
SELECT COUNT(*) FROM note     WHERE user_id NOT IN (SELECT id FROM "user");
SELECT COUNT(*) FROM follow   WHERE follower_id NOT IN (SELECT id FROM "user")
                             OR  followed_id NOT IN (SELECT id FROM "user");
```

Fix any orphaned rows before migrating — they will cause FK errors during restore.

### 0.3 — Migrate user data from Render PostgreSQL → Supabase

This is the most critical step. All existing users, books, notes, follows, likes, comments, and push tokens must move from the Render DB to Supabase.

**Migration approach — table-by-table COPY (safer than full pg_dump for cross-host migration):**

A full `pg_dump | psql` across two different hosted Postgres providers often fails due to superuser requirements, extension mismatches, and schema ownership conflicts. Use `COPY TO/FROM` per table instead — it's data-only, no DDL, and works across providers.

```bash
# ── Step 1: Run supabase_migration.sql on Supabase FIRST (creates all tables/columns)
psql <SUPABASE_CONNECTION_STRING> -f context/supabase_migration.sql

# ── Step 2: Export each table from Render PostgreSQL as CSV
psql <RENDER_POSTGRES_CONNECTION_STRING> -c "\COPY \"user\"    TO 'user.csv'    CSV HEADER"
psql <RENDER_POSTGRES_CONNECTION_STRING> -c "\COPY book        TO 'book.csv'    CSV HEADER"
psql <RENDER_POSTGRES_CONNECTION_STRING> -c "\COPY userbook    TO 'userbook.csv' CSV HEADER"
psql <RENDER_POSTGRES_CONNECTION_STRING> -c "\COPY note        TO 'note.csv'    CSV HEADER"
psql <RENDER_POSTGRES_CONNECTION_STRING> -c "\COPY follow      TO 'follow.csv'  CSV HEADER"
psql <RENDER_POSTGRES_CONNECTION_STRING> -c "\COPY \"like\"    TO 'like.csv'    CSV HEADER"
psql <RENDER_POSTGRES_CONNECTION_STRING> -c "\COPY comment     TO 'comment.csv' CSV HEADER"
psql <RENDER_POSTGRES_CONNECTION_STRING> -c "\COPY pushtoken   TO 'pushtoken.csv' CSV HEADER"

# ── Step 3: Import into Supabase in FK dependency order
psql <SUPABASE_CONNECTION_STRING> -c "\COPY \"user\"    FROM 'user.csv'    CSV HEADER"
psql <SUPABASE_CONNECTION_STRING> -c "\COPY book        FROM 'book.csv'    CSV HEADER"
psql <SUPABASE_CONNECTION_STRING> -c "\COPY userbook    FROM 'userbook.csv' CSV HEADER"
psql <SUPABASE_CONNECTION_STRING> -c "\COPY note        FROM 'note.csv'    CSV HEADER"
psql <SUPABASE_CONNECTION_STRING> -c "\COPY follow      FROM 'follow.csv'  CSV HEADER"
psql <SUPABASE_CONNECTION_STRING> -c "\COPY \"like\"    FROM 'like.csv'    CSV HEADER"
psql <SUPABASE_CONNECTION_STRING> -c "\COPY comment     FROM 'comment.csv' CSV HEADER"
psql <SUPABASE_CONNECTION_STRING> -c "\COPY pushtoken   FROM 'pushtoken.csv' CSV HEADER"

# New tables will be empty — that's fine (no prod data exists for them yet)

# ── Step 4: Reset all sequences so new INSERTs don't collide with existing IDs
# (paste the setval block from supabase_migration.sql)
```

**Why CSV COPY and not pg_dump:**
- Works across different Postgres hosts without superuser
- No schema DDL conflicts (Supabase has its own schema ownership)
- Each table is independent — if one fails you can fix and retry just that table
- CSV files are human-readable for spot-checking

**After restore — reset Supabase sequences:**
The `supabase_migration.sql` already includes `setval` statements for all sequences. Run them after the restore so new `INSERT` statements don't collide with existing IDs.

### 0.4 — Verify data integrity post-migration

```sql
-- Run in Supabase SQL editor after migration
SELECT COUNT(*) FROM "user";        -- should match prod count
SELECT COUNT(*) FROM userbook;      -- should match prod count
SELECT COUNT(*) FROM note;          -- should match prod count
SELECT COUNT(*) FROM follow;        -- should match prod count
```

Compare against the same counts run on Render PostgreSQL before migration.

### 0.5 — Handle missing/null values for new columns on migrated rows

When existing rows are imported, all the new columns (`username`, `bio`, `profile_picture`, etc.) will be `NULL`. The stitch backend and frontend must handle nulls gracefully — most already do, but verify:

| Column | Null behaviour | Risk |
|---|---|---|
| `user.username` | Falls back to name in UI | Low — already handled |
| `user.profile_picture` | Falls back to initials avatar | Low — already handled |
| `user.yearly_goal` | Goal ring shows 0/empty | Low |
| `userbook.format` | Default 'hardcover' in schema | Low |
| `userbook.ownership_status` | Default 'owned' in schema | Low |
| `note.emotion` | Post shows no emotion chip | Low |
| `userbook.updated_at` | Leaderboard pages_read = 0 | Medium — users show 0 pages until they log activity |

The leaderboard `pages_read` is computed from `reading_activity` rows — migrated users will have 0 until they log new sessions. This is acceptable and expected.

### 0.6 — Switch the stitch backend to point to Supabase (already done)

The stitch backend already uses Supabase via `DATABASE_URL` env var on the stitch Render service. After migration, the data will be there. No code change needed.

### 0.7 — Rollback plan

If anything goes wrong after cutover, the rollback path is:

1. **Revert Render service env var** `DATABASE_URL` back to Render PostgreSQL connection string → backend instantly reads old data again
2. **Revert Vercel** → redeploy previous production build (Vercel keeps history — one click)
3. **Mobile** → cannot roll back an APK already installed, but users can still use old web app; if critical, submit a hotfix build

Keep the Render PostgreSQL alive for a minimum **14 days** after cutover before decommissioning — it's the rollback lifeline.

### 0.9 — Maintenance window strategy

Data migration requires a write-freeze to avoid data written during migration being lost (the "last-mile" problem — data written after the dump but before cutover is silently dropped).

**Recommended approach — minimal window (~30 min):**
1. Do a **dry-run migration** the day before (full export/import on a test Supabase project) — confirm timing and any errors
2. On migration day, pick off-peak hours (e.g. 2–3am IST)
3. Put backend into read-only mode OR take it down entirely for 30 min
4. Do final CSV export → import → verify counts → switch DATABASE_URL → bring backend up
5. Total user-facing downtime: ~30 min

**What users see:** API returns errors / app shows offline state. Acceptable for a 30-min window with prior notice.

---

## Pre-flight Check

Before anything starts, confirm these are true:
- [ ] `book-tracker-stitch.onrender.com` backend is stable and serving both stitch web + mobile currently
- [ ] All device-tested bugs logged in Phase 4 Next Priorities are either fixed or accepted as known issues
- [ ] Play Store listing is in a state to receive a new build (no pending review blocking)

---

## Phase 1 — Backend (Do First, Before Any Frontend)

**CRITICAL: Backend must go before frontend. A stale schema will crash every user query.**

### 1.1 — Run the Supabase migration

`context/supabase_migration.sql` must be run in the Supabase SQL Editor on the **production** database. It is idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) — safe to run even if partially applied.

Tables/columns it adds:
- `group_activity` table (new)
- `notificationlog` table (new)
- `reading_activity`, `reading_group`, `group_member`, `group_post` tables (may already exist)
- `user.is_private_profile`, `user.username`, `user.bio`, `user.profile_picture`, `user.yearly_goal`, `user.notification_prefs`
- `userbook.rating`, `userbook.format`, `userbook.ownership_status`, `userbook.updated_at`
- `note.emotion`, `note.quote`, `note.image_url`, `note.updated_at`
- `pushtoken.token_type`, `pushtoken.device_info`
- `book.description`, `book.publisher`, `book.google_books_id`, etc.

### 1.2 — Cherry-pick missing backend fixes from master → stitch-experiment

`master` has 13 commits not in `stitch-experiment`. These are backend improvements that benefit the stitch frontend:
- Google Books search quality (fetch 40, filter junk, top 15)
- Google Books CDN cover URL fix (images loading on mobile/web)
- Google Books 503 retry logic + 60s cache
- Rate limit error logging

```bash
git checkout stitch-experiment
git cherry-pick c751dc3 74a7b2e ebd8fe2 84853cc  # Google Books fixes
```

---

## Phase 2 — Web Frontend Cutover

### 2.1 — Move stitch frontend into the production Vercel project

Currently: `book-tracker-stitch` Vercel project has production branch = `master`, and `stitch-experiment` creates Preview deployments only.

**Recommended approach — Change the build directory:**
In the `book-tracker-stitch` Vercel project settings:
- Root Directory: change from `book-tracker-frontend` → `book-tracker-frontend-stitch`
- Production branch: stays `master`
- Then merge `stitch-experiment` → `master` (see 2.2)

Do NOT use "Promote to Production" from the preview — it leaves master stale and future pushes would deploy old code.

### 2.2 — Merge stitch-experiment → master

```bash
git checkout master
git merge stitch-experiment
# Resolve any conflicts (likely in app/ backend files)
git push origin master
```

This triggers the production Vercel deployment automatically.

### 2.3 — Environment variable check (Vercel)

Verify these are set in the production Vercel project:
- `VITE_API_BASE_URL` = `https://book-tracker-stitch.onrender.com`
- VAPID keys for web push if configured

### 2.4 — Custom domain

If `trackmyread.com` (or similar) currently points to the old frontend Vercel project:
- Reassign the domain to the `book-tracker-stitch` Vercel project
- Confirm in Vercel Settings → Domains

### 2.5 — Delete dead Vercel project

`book-tracker-frontend` on Vercel has had no production deployment since Nov 2025. After cutover, delete it from the Vercel dashboard.

---

## Phase 3 — Mobile App (Android)

### 3.1 — Fix app.json version

The stitch `app.json` currently has `versionCode: 1` and `version: 1.1.0`. Production is already at versionCode 44. Must bump before building or Play Store will reject it.

```json
"version": "2.0.0",
"versionCode": 45
```

### 3.2 — Confirm google-services.json is correct

`book-tracker-mobile-stitch/google-services.json` exists — verify it's the same Firebase project as production (same `package_name: com.bookpulse.mobile`). SHA-1 certificate fingerprint registered in Firebase must match the EAS build profile.

### 3.3 — Confirm EAS project ID

`app.json` has `projectId: "9b559417-a211-4e49-8ef2-806f7acf9d88"` — confirm this matches the Expo dashboard project that has the FCM V1 key uploaded (verified working March 2026).

### 3.4 — API URL

`book-tracker-mobile-stitch/src/services/api.js` already points to `https://book-tracker-stitch.onrender.com` — correct, no change needed.

### 3.5 — New Architecture flag

`app.json` has `"newArchEnabled": false` — keep this. Avoids surprises with other libraries even though react-native-svg 15.15.4 supports New Architecture.

### 3.6 — Build the AAB

```bash
cd book-tracker-mobile-stitch
eas build --platform android --profile production
```

### 3.7 — Submit to Play Store

```bash
eas submit --platform android --latest
```

Or manually upload AAB in Google Play Console → Production → Create new release.

### 3.8 — Staged rollout

- Start at 10% → monitor crash rate + ANR rate for 24h
- 50% → 100%

---

## Phase 4 — Post-Cutover Verification

**Web checklist:**
- [ ] Login with Google works
- [ ] Feed loads with posts
- [ ] Library shows books
- [ ] Circles / Group detail works
- [ ] Notifications badge shows unread count
- [ ] Profile picture upload works
- [ ] PWA web push notifications still delivered

**Mobile checklist:**
- [ ] Google Sign-In completes (OAuth SHA fingerprint valid)
- [ ] Feed loads, can create post with book + emotion
- [ ] Library pills show correct counts
- [ ] Add Book modal search returns results
- [ ] Leaderboard tab switch is instant
- [ ] Push notifications delivered (trigger a follow/like)
- [ ] Profile picture change propagates to header

**Backend checklist:**
- [ ] `GET /profile/me` returns `is_private_profile` field (confirms migration ran)
- [ ] `GET /groups/{id}/leaderboard` returns `current_book` field (not `currently_reading`)
- [ ] `GET /feed/community` returns emotion in posts

---

## Phase 5 — Cleanup

- [ ] Archive / delete `book-tracker-frontend` Vercel project (dead since Nov 2025)
- [ ] Archive `book-tracker-mobile/` directory (old mobile) — keep for reference, don't delete
- [ ] Update Render service name from `book-tracker-stitch` → `book-tracker` if confusing (optional)
- [ ] Update Play Store listing screenshots + description to match new Stitch UI

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Data loss during pg_dump/restore** | Low | Dump before maintenance window, verify row counts after restore before going live |
| **Data written during migration window is lost** | Medium | Announce maintenance window, take final dump at window start, restore immediately |
| **Sequence collision after restore** | Medium | Run all `setval` statements from supabase_migration.sql after restore |
| **FK constraint violations during restore** | Medium | Restore tables in dependency order (user → book → userbook → note → follow etc.) |
| **Missing columns on prod DB crash backend** | High if skipped | Run schema migration on prod DB BEFORE any backend code deployment |
| **Stitch Render free tier spins down** | High currently | Upgrade to paid ($7/mo) before cutover — free tier will break mobile |
| Play Store rejects versionCode | High if not bumped | Must set versionCode > 44 before build |
| FCM push breaks after new build | Medium | Same Firebase project + same SHA cert → test immediately post-release |
| Google Sign-In fails on new build | Low | Same package name + same SHA → OAuth should work |
| Vercel build fails after root dir change | Low | Test in preview first |

---

## Order of Operations (summary)

```
PRE-MIGRATION
0.  Upgrade stitch Render service to paid tier
1.  Cherry-pick Google Books fixes → stitch-experiment → master
2.  Verify prod DB connection string (Render PostgreSQL)
3.  Run supabase_migration.sql on prod Render PostgreSQL (schema only, adds missing columns)

MAINTENANCE WINDOW START
4.  Announce maintenance (put up static maintenance page or in-app banner)
5.  pg_dump from Render PostgreSQL → prod_dump.sql
6.  pg_restore into Supabase (in FK dependency order)
7.  Run setval sequences in Supabase
8.  Verify row counts match
9.  Switch stitch Render service DATABASE_URL → Supabase (already set, confirm)
10. Smoke test stitch backend against migrated data (login, fetch books, feed)
MAINTENANCE WINDOW END

WEB FRONTEND
11. Bump app.json: versionCode → 45, version → 2.0.0
12. Change Vercel root dir → book-tracker-frontend-stitch
13. Push master → triggers Vercel production deploy
14. Verify web login + core flows

MOBILE
15. eas build --platform android --profile production
16. eas submit --platform android --latest
17. Play Store staged rollout: 10% → 24h → 50% → 100%

CLEANUP
18. Wind down old paid Render service (book-tracker) after 48h stable
19. Delete dead book-tracker-frontend Vercel project
20. Update Play Store listing assets
```
