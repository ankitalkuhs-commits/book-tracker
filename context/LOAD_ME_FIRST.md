# 🚀 AI Session Starter - Always Read This First

**When starting ANY session on book-tracker, Claude should read this file automatically when instructed.**

---

## Auto-Load Instructions for Claude

When the user says **"start session"** or **"load context"**, do the following:

1. Read this file (you're doing that now!)
2. Ask: "What are you working on today?" 
3. Based on the answer, read the relevant context:
   - **Auth/Login** → Read `context/auth/README.md`
   - **Books/Library** → Read `context/library/README.md`
   - **Social/Community** → Read `context/community/README.md`
   - **Stats/Analytics** → Read `context/reading-stats/README.md`
   - **Database/Deploy** → Read `context/deployment/README.md`
   - **Not sure** → Read `context/INDEX.md` first
4. Also quickly scan `context/PROJECT_CONTEXT.md` for architecture basics

---

## Project Quick Facts

**Tech Stack:**
- Backend: FastAPI (Python) + SQLite
- Frontend: React + Vite + TailwindCSS
- Auth: JWT tokens with bcrypt

**Key Patterns:**
- Feature-based routers (`app/routers/`)
- SQLModel for database
- Pydantic schemas for validation

**Running Locally:**
- Backend: `uvicorn app.main:app --reload` (port 8000)
- Frontend: `npm run dev` in `book-tracker-frontend/` (port 5173)

---

## Common Commands

**User says this** → **Claude does this**

- "start session" → Read this file + ask what feature
- "ctx auth" → Read `context/auth/README.md`
- "ctx library" → Read `context/library/README.md`
- "ctx community" → Read `context/community/README.md`
- "ctx stats" → Read `context/reading-stats/README.md`
- "ctx deploy" → Read `context/deployment/README.md`
- "full context" → Read all feature READMEs
- "wrap up" → AUTO-UPDATE EVERYTHING (see below)

---

## 🤖 Auto-Update on "wrap up"

When user says **"wrap up"**, Claude automatically:

1. ✅ **Analyze what was changed** (which files, which features)
2. ✅ **Update feature README** if we worked on that feature
3. ✅ **Update INDEX.md** if new files were added
4. ✅ **Update PROJECT_CONTEXT.md** if architecture changed
5. ✅ **Create next session's start prompt** with relevant context
6. ✅ **Generate summary** of what was accomplished

**No manual work required - just say "wrap up"!**

---

## Project Status

**Current Version:** 1.1.0
**Last Updated:** March 21, 2026  
**Active Development:** Yes

**Recently Added/Fixed (March 21, 2026):**
- Fixed: Web push (PWA) notifications fully working ✅ — `registerWebPush()` added to `App.jsx`, called automatically post-login via `loadCurrentUser()`
- Fixed: ROOT CAUSE of `Invalid push token` — `follow_router.py` was using old `send_push_notification_to_user` (sends all tokens to Expo API, which rejects web push JSON). Fixed by switching to `fire_event` dispatcher which routes Expo tokens → Expo API and web tokens → pywebpush correctly
- Fixed: Same pattern in `likes_comments.py` (like notification) and `admin_router.py` (test push endpoint) — all now use `fire_event` dispatcher
- Fixed: `POST /notifications/web-subscribe` payload format — now sends `{subscription: sub.toJSON(), device_info: 'Chrome/Web'}` not raw `sub.toJSON()`
- Fixed: `vapid_public_key` → `public_key` field name mismatch between backend response and frontend destructuring
- Fixed: Backend `web_subscribe` now replaces all existing web tokens for user (prevents stale token accumulation)
- Fixed: `versionCode` field in `app.json` warning (EAS remote versioning ignores this value)
- Built: Android AAB v1.1.0 (versionCode 44) — logo change, submitted to Play Store
- **CRITICAL PATTERN:** Always use `fire_event` from `app/notifications/dispatcher.py` for ALL push notifications. Never use the old `send_push_notification_to_user` from `utils/push.py` — it blindly sends all tokens (including web push subscriptions) to Expo's API which rejects them
- Note: `broadcast_push_notification` in `admin_router.py` still uses `send_push_to_many` — will break for web push users if admin broadcasts. Needs separate fix.
- Note: `book-tracker-frontend` Vercel project is a dead duplicate (No Production Deployment since Nov 2025) — delete it from Vercel dashboard to reduce noise
- Fixed: Web feed no longer shows empty gray box for posts with null `image_url` — removed `.post-image` background, added `'null'` string guard and tiny-image `onLoad` check in `PulsePost.jsx`
- Fixed: Mobile push notifications fully working ✅ — `google-services.json` added, race condition fixed in `App.js`, `fire_event("book_added")` added to `books_router.py`, FCM V1 key uploaded to Expo dashboard. Verified end-to-end March 21.
- **GOTCHA (repeated multiple times):** Migration scripts must use `information_schema` NOT `sqlite_master`/`PRAGMA` — production is PostgreSQL, dev is SQLite. See `context/deployment/README.md` for the correct pattern.
- Added: Event-driven notification system (`app/notifications/`) — `fire_event()` dispatcher, mobile (Expo) + PWA (VAPID) dual-channel, `NotificationLog` table, admin toggle endpoints
- Fixed: Push notification race condition — `handleLoginSuccess` now stores token in `authTokenRef` BEFORE calling `setIsLoggedIn(true)`
- Fixed: Added `google-services.json` (Firebase Android config) — was missing, causing `getExpoPushTokenAsync` to silently fail
- Fixed: `app.json` wired with `android.googleServicesFile: "./google-services.json"`
- Added: Diagnostic logging throughout `NotificationService.js` to expose future FCM failures
- Note: EAS build from `book-tracker-mobile/` subdirectory requires running from the sub-repo root, not the parent monorepo root
- Fixed: WeeklyPulseChart bars no longer overflow into chart title (CSS flex fix)
- Added: "Your Friends" tab to webapp homepage (Find Friends search + What Friends Are Reading)
- UI: Homepage Community/Your Friends tabs are now a pill switcher
- UI: Nav buttons — large screen = icon+label side by side (pill active), small screen (≤768px) = icon above label (blue text active)
- Removed: "What Friends Are Reading" widget from HomeSidebar (redundant with Your Friends tab)
- Fixed: delete post endpoint (was admin-only, now owner/admin)
- Fixed: notification service logic, bio editing, community feed images, library tabs

**Tech Stack:**
- Backend: FastAPI (Python) + SQLite (dev) / PostgreSQL (prod)
- Web Frontend: React + Vite + TailwindCSS
- Mobile: React Native (Expo SDK) — uses EAS builds, NOT Expo Go
- Auth: Google OAuth + JWT tokens

**Recently Added/Fixed (Stitch branch — April 2026):**
- Added: Group activity feed backend table + events (member_joined, book_started, book_finished, milestone_reached, note_posted, group_book_changed)
- Added: Edit/delete own posts in HomePage feed (inline edit + ··· menu)
- Added: Edit notes in ProfilePage (text + quote inline editing)
- Added: Notifications page navigation — clicking a notification routes to relevant page, optimistic read mark
- Added: Share button on UserProfilePage notes (Web Share API + clipboard fallback)
- Added: Push permission banner in NotificationsPage with FOMO copy
- Added: Notification badge auto-refresh every 60s in Nav
- Added: Privacy settings (#7) — `is_private_profile` field on User model + SettingsPage toggle + enforcement in GET /profile/{id} — locked view in UserProfilePage for non-followers
- **MIGRATION NEEDED:** Run `context/supabase_migration.sql` in Supabase SQL editor (adds `group_activity` table + `is_private_profile` column)
- Fixed: #9 Group activity feed pagination — `visibleActivity` (8 per page) + "Load more" button in GroupDetailPage (posts already had it)
- Fixed: #11 WeeklyPulseChart "m" suffix — all active bars now show label with "m" suffix, not just today's bar
- Fixed: #12 Search tab clear — switching tabs now clears query + both result sets + searched state
- Confirmed done: #8 notification prefs (SettingsPage), #10 admin user search/sort (AdminPage), #13 profile picture upload (ProfilePage)

**Phase 2 — Mobile rebuild (April 2026):**
- Added: `src/theme.js` — Stitch color palette (primary #00464a, surface #fbf9f4, etc.) for React Native
- Updated: `src/services/api.js` — switched to `https://book-tracker-stitch.onrender.com`, token key `bt_token`, added `notificationsAPI`, `groupsAPI`, `profileAPI`
- Added: `NotificationsScreen.js` — list + mark-all-read, event type icons, unread highlight
- Added: `SettingsScreen.js` — profile edit, privacy toggle, notification prefs per-type, logout, delete account
- Added: `GroupsScreen.js` — My Circles + Discover tabs, create group modal, join by invite code modal
- Updated: `App.js` — 5 tabs (Home, Library, Circles, Updates, Profile), Stitch tab bar colors, unread badge on Updates tab (polled every 60s), Settings wired via ProfileStack, old backend URLs removed

- Restyled: FeedScreen, LibraryScreen, ProfileScreen, SearchScreen — all use theme.js tokens (teal primary, surface backgrounds, rounded cards)
- ProfileScreen: header now shows Settings gear icon → navigates to SettingsScreen via ProfileStack
- Added: GroupDetailScreen — leaderboard, activity feed (paginated), group posts (paginated + composer modal), members list; wired into GroupsStack

**Recently Fixed (April 19, 2026 — stitch-experiment session):**
- **Perf:** Eliminated ALL remaining N+1 queries across the entire backend:
  - `groups_router.py`: invites/pending loop, get_my_groups, discover, get_members, get_pending — all now use batch IN() queries instead of per-row db.get()
  - `books_router.py`: recommendations endpoint — 3 loops fixed (friends_reading, friends_loved, author_affinity)
  - `likes_comments.py`: GET /notes/{id}/comments — batch user lookup (was missed in first audit pass)
- **Fix:** Book cover in feed posts now shows as small thumbnail (48×72px mobile / 80×120px desktop) instead of full-width portrait — `PostCard` changed from `flex-col md:flex-row` to always `flex-row`
- **Fix:** Post composer book picker now loads ALL library books (was filtered to `status=reading` only)
- **Fix:** Group invitation bug — `GET /{group_id}/pending` was returning curator-invited members alongside self-join requests; now filters `invited_by IS NULL` so only join requests appear for curator approval
- **Feat:** Loading states added across web + mobile:
  - Leaderboard period switch: skeleton rows while loading
  - Approve/reject/remove member: spinner + disabled per user
  - Remove book from library: "Removing..." disabled state
  - Mobile bio save: ActivityIndicator spinner on Save button
- **CRITICAL PATTERN:** `GET /{group_id}/pending` = self-join requests (invited_by IS NULL). `GET /invites/pending` = curator-sent invites for the current user. Never mix them.

**Next Priorities:**
- EAS build + Play Store release (Phase 3)
- Test end-to-end on device against Stitch backend (`https://book-tracker-stitch.onrender.com`)

---

**Pro Tip:** User can just say "start session" and you'll guide them through loading the right context!
