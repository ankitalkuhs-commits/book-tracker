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

**Phase 3 — Mobile ↔ Webapp parity fixes (April 23–24, 2026) — ALL SCREENS COMPLETE:**
> Full per-screen changelog: `context/MOBILE_STITCH_PHASE3.md`

- Screen-by-screen diff between `book-tracker-mobile-stitch/` and `tracker-stitch.vercel.app`
- **LoginScreen:** button copy fixed, quote card redesigned (format-quote-open icon), tagline color fixed to `colors.secondary`, subtitle added, community feed removed from auth screen
- **FeedScreen:** FAB+modal composer replaced with inline composer card (tag book, quote, emotion fields), "For You" recs shelf added, post cards updated (heart icon, comment count, book label, ··· menu), tab "Your Friends"→"Friends", `AppHeader` added; post author tap → UserProfile
- **LibraryScreen:** title "My Library"→"Your Library" + subtitle, tab order swapped (tabs above search), tab pills now have border (were invisible on cream bg), spine width 9→5 (slimmer), "Done"→"Finished", status text below author, Add Book modal: larger covers (72×108), card style results, publisher shown; options panel: 110×165 cover + description
- **AppHeader.js (NEW):** `src/components/AppHeader.js` — shared top bar with TrackMyRead logo + bell icon (red unread badge, 9+) + avatar; all tab screens now use this header
- **NotificationContext.js (NEW):** `src/context/NotificationContext.js` — React context providing `unreadCount` from App.js to AppHeader without prop drilling
- **AppNavigator.js (REWRITE):** 4 tabs (Home/Library/Circles/Insights); Notifications + Profile moved to root Stack (accessed via header bell/avatar); UserProfile in FeedStack, GroupsStack, ProfileStack, and root Stack (for Notifications nav)
- **GroupsScreen:** replaced StatusBar + hardcoded paddingTop with AppHeader
- **GroupDetailScreen:** hero card redesigned (dark teal bg, rgba back btn), leaderboard/member rows now `TouchableOpacity` → navigate to UserProfile
- **InsightsScreen (REWRITE):** AppHeader added, stat cards redesigned (label top + value large), "THIS YEAR" + "CURRENTLY READING" cards, streak redesign (two-halves row with divider), goal redesign (ring left + text right + "On track" badge), projected finishes as cards
- **SettingsScreen (REWRITE):** back arrow top bar, avatar hero with "Choose avatar" + "Upload photo" buttons, 12 DiceBear adventurer presets in modal grid (4-col), `handleSelectAvatar` saves URL via `profileAPI.updateMe`
- **BookDetailScreen (REWRITE):** `useSafeAreaInsets`, status pills segmented style, star rating only for finished books, always-visible note composer (no toggle), "NOTES & REFLECTIONS" label, empty state text, remove link at bottom (no header trash icon), `pageAltRow` for non-reading statuses
- **UserProfileScreen (REWRITE):** square avatar (borderRadius 14) with teal border, small-caps stats pills, Yearly Progress section (golden bar), VelocityChart redesign (30D/90D toggle, taller bars), "Curated Library" + "View All →", NEW "By The Numbers" section (3 stat cards + Currently Reading up to 3 books with covers + progress), Public Notes (formatted dates APR DD YYYY, share button)
- **NotificationsScreen:** back arrow added to header (now a pushed screen, not a tab)
- **ProfileScreen:** `useSafeAreaInsets` added, back arrow in top bar (now a pushed screen), removed hardcoded `paddingTop: 56`
- **Safe-area fixes:** all screens use `useSafeAreaInsets` via AppHeader or explicit `insets.top` — no hardcoded paddingTop values remain
- **api.js:** added `booksAPI.getRecommendations()`

**Phase 2 — Mobile rebuild (April 2026) — COMPLETE:**
- All screens fully rebuilt in `book-tracker-mobile-stitch/` with webapp parity
- Added: `src/theme.js` — Stitch color palette (primary #00464a, surface #fbf9f4, etc.) for React Native
- Updated: `src/services/api.js` — switched to `https://book-tracker-stitch.onrender.com`, token key `bt_token`, added `notificationsAPI`, `groupsAPI`, `profileAPI`, `activityAPI`; fixed `profileAPI.uploadPicture` → `/profile/me/picture`; fixed `profileAPI.deleteAccount` → POST `/auth/delete-account/me`; added all missing `groupsAPI` methods (`getPendingMembers`, `approveGroupMember`, `rejectGroupMember`, `removeGroupMember`, `setGroupBook`, `clearGroupBook`, `deleteGroupPost`)
- Updated: `AppNavigator.js` — 5 tabs: Home, Library, Circles, Insights (new), Notifications; Search tab removed (search integrated into Library); InsightsStack added
- Added: `LibraryScreen.js` — 2-col grid, 3D book cover effect (spine View + `rotateY: '-12deg'`), 8 color palettes, progress bars on reading cards, star ratings on finished cards, inline AddBookModal (Google Books search → status/format/ownership chips → `booksAPI.addToLibrary()`)
- Added: `InsightsScreen.js` — GoalRing (pure-View circular progress), BarChart (pure-View), stats grid, 30-day activity chart, monthly pages chart, projected finishes; uses `activityAPI`
- Rebuilt: `ProfileScreen.js` — avatar camera upload, followers/following/books pills, GoalRing, Currently Reading, ActivityChart (30-bar), full Notes section with inline comments; uses `activityAPI` + `notesAPI`
- Rebuilt: `SettingsScreen.js` — avatar upload, display name/bio/yearly reading goal, correct notification pref keys (`new_follower, post_liked, post_commented, book_completed, reading_streak_reminder`), privacy toggle, delete account
- Rebuilt: `NotificationsScreen.js` — `useFocusEffect` auto-refresh, tap-to-navigate (follow → UserProfile), optimistic mark-read, unread banner
- Added: `UserProfileScreen.js` — profile picture/initials fallback, followers/following/books pills, VelocityChart (30d/90d toggle), 3-col book grid, note cards, locked profile state for private profiles
- Rebuilt: `GroupDetailScreen.js` — SetGroupBookModal (Google Books), group book display, pending members (approve/reject), remove member, leaderboard period toggle (weekly/monthly), fix `deleteGroupPost`
- Added: `GroupsScreen.js` — My Circles + Discover tabs, create group modal, join by invite code modal
- **CRITICAL PATTERN:** Notification pref keys are `new_follower, post_liked, post_commented, book_completed, reading_streak_reminder` — NOT `follows, likes, comments, book_finished, group_activity`

**Recently Fixed (April 19, 2026 — stitch-experiment session):**
- **Perf:** Eliminated ALL remaining N+1 queries across the entire backend:
  - `groups_router.py`: invites/pending loop, get_my_groups, discover, get_members, get_pending — all now use batch IN() queries instead of per-row db.get()
  - `books_router.py`: recommendations endpoint — 3 loops fixed (friends_reading, friends_loved, author_affinity)
  - `likes_comments.py`: GET /notes/{id}/comments — batch user lookup (was missed in first audit pass)
- **Fix:** Book cover in feed posts now shows as small thumbnail (48×72px mobile / 80×120px desktop) instead of full-width portrait — `PostCard` changed from `flex-col md:flex-row` to always `flex-row`
- **Fix:** `post.image_url` (used by editorial bot) now constrained to `max-w-[160px] max-h-48` instead of `w-full max-h-64` — prevents bot book covers from going full-width
- **Fix:** Post composer book picker now loads ALL library books (was filtered to `status=reading` only)
- **Fix:** Group invitation bug — `GET /{group_id}/pending` was returning curator-invited members alongside self-join requests; now filters `invited_by IS NULL` so only join requests appear for curator approval
- **Fix:** JSX syntax error in `UserProfilePage.jsx` line 402 — missing closing `}` for `{!profile.locked && <div>}` conditional caused Vercel build to fail
- **Feat:** Loading states added across web + mobile:
  - Leaderboard period switch: skeleton rows while loading
  - Approve/reject/remove member: spinner + disabled per user
  - Remove book from library: "Removing..." disabled state
  - Mobile bio save: ActivityIndicator spinner on Save button
- **Feat:** Recommendation confirmation modal — clicking a book in "For You" now opens bottom sheet with cover, title, author, reason; user picks "Want to Read" or "Start Reading Now"; spinner → success → auto-dismiss
- **CRITICAL PATTERN:** `GET /{group_id}/pending` = self-join requests (invited_by IS NULL). `GET /invites/pending` = curator-sent invites for the current user. Never mix them.
- **CRITICAL PATTERN:** Never push `app/models.py` changes without confirming Supabase migration has been run. New model fields with no matching DB column will crash the entire backend (every User query fails). Run `context/supabase_migration.sql` in Supabase SQL Editor BEFORE or simultaneously with the push.
- **GOTCHA — Vercel deployment:** `book-tracker-stitch` Vercel project production branch is set to `master`. Pushing to `stitch-experiment` creates a Preview deployment only. To update `book-tracker-stitch.vercel.app`, go to Overview → Active Branches → `...` next to `stitch-experiment` → Promote to Production. (Or change production branch in Settings → General.)

**Next Priorities:**
- **APK build in progress** — EAS build from `book-tracker-mobile-stitch/` on `stitch-experiment` branch
- Test end-to-end on device against Stitch backend (`https://book-tracker-stitch.onrender.com`) after APK install
- Verify group API endpoints (`/groups/{id}/pending`, `/groups/{id}/approve/{userId}`, `/groups/{id}/reject/{userId}`, `/groups/{id}/remove/{userId}`, `/groups/{id}/book` PUT/DELETE) exist on stitch backend before testing GroupDetailScreen
- After device testing: fix any regressions found, then EAS submit to Play Store

---

**Pro Tip:** User can just say "start session" and you'll guide them through loading the right context!
