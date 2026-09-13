# TrackMyRead — Session Starter

**Always read this file at the start of every session.**

---

## Project Quick Facts

| | |
|---|---|
| **Product** | TrackMyRead — social book tracking platform |
| **Web** | [www.trackmyread.com](https://www.trackmyread.com) — React + Vite + TailwindCSS |
| **Mobile** | Android app on Play Store — React Native (Expo SDK, EAS builds) |
| **Backend** | FastAPI (Python) → `https://book-tracker-stitch.onrender.com` |
| **Database** | PostgreSQL on Supabase (prod) / SQLite (local dev) |
| **Branch** | Everything on `master` — `stitch-experiment` was deleted |
| **Version** | 2.2.1 (versionCode 60) |

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

## Architecture

```
book-tracker/
├── app/                          # FastAPI backend
│   ├── routers/                  # One file per feature
│   ├── models.py                 # SQLModel ORM models
│   ├── deps.py                   # Auth dependencies (get_current_user, get_admin_user)
│   └── notifications/dispatcher.py  # fire_event() — ALWAYS use this for push
│
├── book-tracker-frontend-stitch/ # React web app
│   └── src/
│       ├── pages/                # One file per route
│       ├── components/           # Shared UI components
│       └── services/api.js       # All API calls
│
└── book-tracker-mobile-stitch/   # React Native app
    └── src/
        ├── screens/              # One file per screen
        ├── components/           # AppHeader, etc.
        ├── services/api.js       # Axios client → Render backend
        └── theme.js              # Design tokens
```

---

## CRITICAL PATTERNS (learn these before touching anything)

### Confirm a deploy
Deploy verification is unauthenticated and does not depend on login working:
```bash
curl -s https://book-tracker-stitch.onrender.com/version
# Expected: {"commit":"<GIT_SHA>","service":"book-tracker-stitch","branch":"master"}
# Compare commit against: git rev-parse HEAD
```

### QA login (review accounts)
For screenshots and post-deploy checks (no UI — endpoint only):
```bash
# Get a token (secret in .env.review or env var REVIEW_LOGIN_SECRET):
curl -X POST https://book-tracker-stitch.onrender.com/auth/review-login \
  -H "Content-Type: application/json" \
  -d '{"email":"review.reader@trackmyread.com","secret":"<SECRET>"}'

# Seed accounts (idempotent):
python scripts/seed_review_accounts.py --base-url https://book-tracker-stitch.onrender.com

# Log browser in:
localStorage.setItem('bt_token', '<access_token>'); location.href = '/home';
```

**Critical:** Render env vars must be **exactly** named `REVIEW_LOGIN_SECRET` and `REVIEW_LOGIN_EMAILS` (not `Reader_acc` / `Friend_acc`).

### Push Notifications
```python
# ✅ ALWAYS use this:
from app.notifications.dispatcher import fire_event
fire_event("post_liked", actor_id=me.id, target_user_id=note.user_id, extra={...})

# ❌ NEVER use these — they break web push:
send_push_notification_to_user(...)
send_push_to_many(...)
```

### DB Migrations
```sql
-- ✅ Always use information_schema (works on both SQLite dev + PostgreSQL prod):
SELECT column_name FROM information_schema.columns WHERE table_name = 'user'

-- ❌ Never use sqlite_master or PRAGMA — breaks on production PostgreSQL
```

### models.py Changes → REQUIRE Supabase Migration
> **⚠️ Never push models.py to prod without first running the migration in Supabase SQL Editor.**  
> New columns with no DB counterpart crash every query on that table.  
> Migration file: `context/supabase_migration.sql` — append new ALTER TABLE statements there.

### Notification Pref Keys
The correct key names (backend + frontend must match):
`new_follower` · `post_liked` · `post_commented` · `book_completed` · `reading_streak_reminder` · `group_invite` · `group_join_request`

### GET /groups/{id}/pending vs /invites/pending
- `/groups/{id}/pending` = self-join requests waiting for curator approval (`invited_by IS NULL`)
- `/groups/invites/pending` = curator-sent invites for the current user
- Never mix these two.

### Amazon Affiliate Links
- India (`.in` TZ): tag = `trackmyread-21` → `amazon.in`
- Global: tag = `trackmyread-20` → `amazon.com`
- Detect via: `Intl.DateTimeFormat().resolvedOptions().timeZone`

---

## Recently Shipped (September 13, 2026 — Review login + /version)

### QA login + deploy verification endpoints (pytest 252/252, 5 BLOCKED live checks)

**What changed:** Backend now has `POST /auth/review-login` (allowlisted review accounts with a shared secret, gated by env, 404 when unconfigured) and `GET /version` (returns the running commit SHA so a deploy can be verified without logging in). `scripts/seed_review_accounts.py` populates both accounts through the API with books, notes, a mutual follow, and a public Circle. QA can now take post-deploy screenshots without a Google account or UI changes. `/version` closes the sprint-2 verification gap — behaviour-only deploys leave `/openapi.json` byte-identical, so only the commit SHA proves it worked.

**Where to find it:** `features/auth/review-login/{spec,architecture,tests,code-map,learnings}.md` → requirements R1–R6; all implemented and tested 2026-09-13.

**Gotchas:** `POST /auth/review-login` returns **404 unless both `REVIEW_LOGIN_SECRET` and `REVIEW_LOGIN_EMAILS` env vars are set on Render** — PM action required. Keys must be named **exactly** `REVIEW_LOGIN_SECRET` and `REVIEW_LOGIN_EMAILS` (not `Reader_acc` or `Friend_acc`). The seed script reads the secret from env var first, then from `.env.review` at the repo root (gitignored). Live checks (seed twice, production screenshots with `/version` verify, sprint-2 live checks 1–4) are **BLOCKED** until the PM sets those keys.

**Next sprint:** PM to set `REVIEW_LOGIN_SECRET` (generated with `python -c "import secrets; print(secrets.token_urlsafe(32))"`) and `REVIEW_LOGIN_EMAILS=review.reader@trackmyread.com,review.friend@trackmyread.com` in Render → Environment. Then run the live checks and `/auth/signup|login` + `/api/googlebooks/*` PM decisions can proceed.

---

## Recently Shipped (September 13, 2026 — Sprint 2)

### Audit Bug Fixes (72/72 verdict PASS, pytest 213/0)

**What changed:** Seven backend correctness fixes across feed, notes, insights, notifications, and profile. Friends feed reorders (mutuals first, then non-mutual within each group). Own notes show real like state instead of always-true. Private notes no longer appear in group activity feeds. Insights month chart fixed (no skipped Feb, no dups) and streak no longer resets to 0 if you haven't read today yet (anchors on yesterday when today empty). `/profile/me` stops logging user emails into Render logs. Nightly streak reminder and admin broadcast both now honour user preferences, web push, and notification history by routing through the dispatcher.

**Where to find it:** `features/maintenance/sprint-2-audit-bugs/spec.md` → R1–R7; all shipped 2026-09-13.

**Gotchas:** Admin broadcast now sends to every user with any push token (one at a time, not batched) — fine at current scale, will need batching past ~1,000 users. Streak reminder still cannot fire before 14:30 UTC (Render free tier sleeps). Pre-existing 00:00–05:30 IST window where daily cap can misjudge (not a blocker; tests avoid it with time control).

**Next sprint:** Carried items: `/auth/signup|login` PM decision (keep or remove), `/api/googlebooks/*` auth decision, dead client calls (web + mobile build needed), DB repair for pre-May-4 rating bugs (needs PM approval).

---

## Recently Shipped (September 12, 2026)

### Agent process installed (ported from School ERP)

- `AGENTS_DESIGN.md`, `agents/*.md` (7 prompts, adapted: multi-tenancy → ownership + privacy), `specs/PM_PLAYBOOK.md`
- `dependency-map.md` — curated contracts + a generated endpoint→consumer table; regenerate with `python scripts/gen_dependency_map.py`
- `features/{auth,community,library,reading-stats}/index.md` — moved from `context/*/README.md`; templates in `features/_templates/`; `repos/{api,web,mobile}/index.md`
- `CLAUDE.md` rewritten around the process. No application code changed.

### Full read-through audit (no fixes applied yet — this is the first sprint's backlog)

**CRITICAL**
- `DELETE /books/{id}`, `POST /books/`, `GET /books/`, `GET /books/{id}` have **no auth** (`books_router.py`). Prod schema cascades `userbook.book_id`, so an anonymous DELETE removes every user's library row for that book.
- `push_router.py` selects `PushToken` by `user_id` only — a mobile login overwrites the user's web-push row (`token_type` stays `web`, token becomes Expo); mobile logout can delete the web subscription.

**Tests:** 103 pass / 12 fail — all `KeyError: 'userbook'`; `tests/test_books.py::_add_book` callers expect the pre-May-4 nested shape.

**Bugs:** friends-feed sort inverted (`notes_router.py` — non-mutual first) · `/notes/me` hardcodes `liked_by_me: True` · scheduler bypasses `fire_event` (no prefs, no web push; Render is asleep at 14:30 UTC anyway) · insights monthly buckets step 30 days (February can vanish) · streak starts at today (yesterday-only reader = 0) · `note_posted` group activity fires for private notes · `profile_router.py` logs the full profile incl. email at WARNING on every call · admin broadcast still uses `send_push_to_many` · dead client calls: web `demoLogin`, mobile `userAPI.getUser`.

**Repo hygiene:** `venv/` AND `.venv/` are tracked in git (`.venv/` not in .gitignore) · `book_tracker.db` tracked (empty) · `crash.txt` 3 MB at root · `requirements.txt` is UTF-16 · `deps.py` has a dead shadowed `get_current_user` stub · `get_session` used as a Depends returns a raw Session (never closed).

**Web:** `og:image` → `/og-image.png` does not exist · Vercel build must be `build:ssg` (unverified).

**GOTCHA — the Bash tool truncates long heredocs on this machine.** Files over ~6 KB written via `cat <<'EOF'` fail with "unexpected EOF while looking for matching quote". Use the Write tool for anything long.

---

## Recently Shipped (May 6, 2026)

### Mobile Prefetch — Instant Tab Navigation

**What changed:** Expanded `preloadData()` in `App.js` to fire 9 parallel requests (up from 4) during the login loading screen. All tab data is ready before the user lands on Feed.

**Added to parallel preload:**
- `activityAPI.getInsights()` → seeds InsightsScreen
- `activityAPI.getMyActivity(30)` → seeds InsightsScreen + ProfileScreen
- `notesAPI.getMyNotes()` → seeds ProfileScreen
- `groupsAPI.getMyGroups()` → seeds GroupsScreen (no spinner on Circles tab)
- `groupsAPI.getMyPendingGroups()` → seeds GroupsScreen pending section

**PreloadContext keys now available:** `profile`, `library`, `feed`, `insights`, `activity`, `notes`, `groups`, `pendingGroups`

**Screen changes (stale-while-revalidate pattern):**
- `InsightsScreen.js` — now imports PreloadContext; seeds all 4 state values from preload; `loading=false` if preloaded; `useFocusEffect` does silent background refresh
- `ProfileScreen.js` — seeds `notes`, `activity`, `insights` from preload (previously always started empty); cleaned up redundant double `load()` call
- `GroupsScreen.js` — seeds `myGroups`, `pendingGroups` from preload; `loading=false` if data exists

**User experience:** Tapping any tab (Circles, Insights, Profile) shows content instantly — no spinner. Data refreshes silently in the background on each focus. Pull-to-refresh still works as before.

**Pattern used:** Stale-while-revalidate — show preloaded data immediately, fetch fresh data in background, swap in when ready.

---

## Recently Shipped (May 5, 2026)

### Security Audit — 3 Issue Types Fixed

**1. Authorization gaps (backend)**
- `GET /groups/{id}/members` — now returns 403 if group is private and caller is not a member
- `GET /groups/{id}/goal` — same private group membership check added
- Previously any authenticated user could read private group membership lists and goal progress

**2. Unbounded API queries (backend)**
- `GET /notes/me` — added `limit` param (default 50), passed to `crud.get_notes_for_user`
- `GET /notes/userbook/{id}` — capped at 100 results
- `GET /groups/discover` — capped at 200 public groups

**3. Console logging in production (web + mobile)**
- All `console.error`/`console.warn`/`console.log` calls now wrapped in `__DEV__` (mobile) or `import.meta.env.DEV` (web) guards
- Changed to log only `err?.message` — never full error objects with potential stack traces or tokens
- Fixed files: `FeedScreen.js`, `GroupDetailScreen.js`, `NotificationService.js` (mobile); `AuthContext.jsx`, `LoginPage.jsx`, `NotificationsPage.jsx` (web)

**Version bumped:** 2.1.2 → 2.1.3 / versionCode 56 → 57

---

## Recently Shipped (May 4, 2026)

### API Response Shape Audit + Bug Fixes

**Critical bugs fixed:**

1. **Rating corrupted book status** — `handleRating` was calling `PUT /userbooks/{id}/progress` with `{ rating }`. `UserBookProgress` only accepts `current_page`, so the backend received `current_page=0`, set `status="to-read"`, and reset the page counter. Every rating on a finished book silently corrupted it in the DB. Fixed: `handleRating` now uses `PATCH /userbooks/{id}`.

2. **`POST /books/add-to-library` response shape mismatch** — Returned `{ message, book, userbook }` but `BookPreviewScreen` stored the whole object as `myUserbook`. Navigating to `BookDetailScreen` gave `ub.id = undefined` → `PATCH /userbooks/undefined 422`. Fixed: endpoint now returns the same flat `{ id, status, book: {...}, ... }` shape as `GET /userbooks/`.

3. **`google_books_id` missing from all userbook responses** — `GET /userbooks/`, `GET /userbooks/{id}`, `GET /userbooks/user/{id}` all omitted `google_books_id` from the nested `book` object, so `BookPreviewScreen`'s duplicate detection via `google_books_id` never fired. Fixed.

4. **`PATCH /userbooks/{id}` returned raw SQLModel** — Returned `{ status: "ok", userbook: <raw_model> }` requiring fragile `result?.userbook || result` fallback on client. Fixed: now returns flat `{ id, status, current_page, rating, updated_at, book_total_pages }`.

**GOTCHA — API response shape consistency:**
- All userbook-returning endpoints must include `google_books_id` in the nested `book` object
- `POST /books/add-to-library` must match the shape of `GET /userbooks/` items
- `PUT /progress` and `PATCH /{id}` return minimal dicts — never raw SQLModel objects
- `handleRating` uses `patchUserbook` (PATCH), `handleSaveProgress` uses `updateProgress` (PUT)

### Test Suite + Security Fixes (also May 4)

- **115 API tests** — all passing (conftest.py, test_auth, test_books, test_notes, test_follow_profile, test_groups, test_admin, test_reading_activity, test_import)
- **Security fixes**: JWT secret from env var; private profile enforcement on stats/feed endpoints; admin email allowlist; `getMyBooks()` feed filters private profiles; group posts validate `userbook_id` ownership; follow 404 on unknown user; empty comment → 400
- **BookPreviewScreen crash** — root cause traced from Render logs (`PATCH /userbooks/undefined`); fixed by standardizing `add-to-library` response shape

### User Profile Parity (Web + Mobile)
- **Backend `GET /profile/{id}`** — now returns `follows_you` (for Follow Back label) and `yearly_goal`
- **Web UserProfilePage** — added: Follow Back button label, "Follows you" hint, yearly goal progress bar, Currently Reading section with progress bars, interactive like/unlike on note cards
- **Mobile UserProfileScreen** — fixed broken profile load (`profileAPI.getPublicProfile` not `userAPI`), fixed `is_private` field name, added: admin delete note, functional Share button, "Follows you" label + Follow Back text
- **Version bump** — `2.0.3` → `2.1.0`, versionCode `53` → `54`

---

## Recently Shipped (May 3, 2026)

### Parity Fixes — Web & Mobile
- **Web PostComposer (HomePage)** — 14 emotion emoji chips (replaced plain text input) + image upload with preview + `uploadNoteImage()` API
- **Web GroupDetailPage NewPostModal** — same: emotion chips + image upload
- **Web GroupsPage** — "Pending Requests" section for groups awaiting curator approval; after sending join request, group immediately appears in pending section
- **Mobile GroupDetailScreen composer** — emotion chip selector (14 options, horizontal scroll) + ImagePicker image upload; safe-area fix (`insets.top + 20` on header)
- **Mobile FeedScreen** — admin users can delete comments (trash icon per comment row, `adminDeleteComment` API call)

### Bug Fixes (QA audit)
- **GroupPost model** — added `emotion` and `image_url` fields (were silently dropped); `supabase_migration.sql` updated with `ALTER TABLE group_post ADD COLUMN IF NOT EXISTS emotion/image_url`
- **GroupDetailScreen** — `postText = useState(false)` → `useState('')` (was crashing `.trim()`)
- **GroupDetailScreen** — Cancel button now clears `postImageUri` (stale image was persisting)
- **FeedScreen** — image upload failure now prompts "Post without image?" instead of silent swallow
- **GroupsScreen** — shows `?` avatar when Render cold-start causes preload null; now fetches profile independently on mount
- **HomePage + GroupDetailPage** — `URL.revokeObjectURL()` called on image preview cleanup (memory leak fix)

---

## Recently Shipped (May 2, 2026)

- **Delete post (PostgreSQL FK)** — notes_router.py deletes Likes + Comments before Note
- **Comment double-post** — `submitting` flag on Post button
- **Follow button loading** — `followInFlight` ref pattern
- **Image crop** — `aspect: [2, 3]` (portrait) not `[4, 3]`
- **For You recs** — remove after shelving; show `friend_name` from backend
- **Library Add Book button** — moved to tab row, never clips
- **BookDetailScreen (mobile)** — optimistic status updates, unknown-pages modal (`TextInput` not `Alert.prompt`), max-page validation, absolute note timestamps
- **Web BookDetailPage** — survives refresh (fetches userbook list + finds by ID), optimistic progress bar
- **Member profiles** — tapping leaderboard member → UserProfileScreen/Page; "Member since", correct stats fields (`stats.finished` not `stats.finished_books`), speed from activity, This Year always visible

---

## Recently Shipped (April 30, 2026)

- **Parity audit fixes** — notification deep-linking (mobile + web), `post_liked` sends `note_id` extra, Settings group notif prefs, Search format filter chips, BookDetailPage (web)
- **Web onboarding** — 5-step flow (`OnboardingPage.jsx`), `ONBOARDING_KEY = 'bt_onboarding_v1'` (bump to reset for all users)
- **Goodreads CSV import** — web (drag-and-drop in SettingsPage) + mobile (DocumentPicker in SettingsScreen); `POST /import/goodreads`
- **GroupsScreen** — pending join requests section added

---

## Recently Shipped (March–April 2026)

- **Push notifications** — `fire_event()` dispatcher, FCM Android + VAPID web, dual-channel routing
- **Phase 3 mobile parity** — all screens rebuilt (FeedScreen, LibraryScreen, GroupDetailScreen, InsightsScreen, SettingsScreen, UserProfileScreen, NotificationsScreen, ProfileScreen)
- **AppHeader.js** — shared top bar with logo + bell badge + avatar (profile_picture or initials)
- **Group activity feed** — backend table + 6 event types
- **Privacy settings** — `is_private_profile` field, locked profile view for non-followers
- **N+1 query elimination** — batch IN() queries throughout groups_router, books_router, likes_comments

---

## Recently Shipped (September 12, 2026 — sprint-1-hardening)

- `app/routers/books_router.py` — `GET /books/`, `GET /books/{id}`, `POST /books/` now require `get_current_user`; `DELETE /books/{id}` now requires `get_admin_user`. `GET /books/` takes `limit: int = Query(50, ge=1, le=200)` (out-of-range → 422, not clamped). No response shape changed.
- `app/routers/push_router.py` — register/deregister now filter `PushToken.token_type == "expo"`, so a mobile login/logout never touches a user's `web` push row. Register upserts the single `expo` row per user; deregister deletes every `expo` row for the user (cleans up any historical duplicate).
- `POST /auth/delete-account` deliberately left unauthenticated — it backs the public Play-Store account-deletion form (`account-deletion.html`), which must be reachable with no token. Not a bug; see `features/security/sprint-1-hardening/`.
- Fixed 12 stale tests in `tests/test_books.py` / `tests/test_reading_activity.py` that asserted the pre-May-4 `add.json()["userbook"]["id"]` shape instead of the current flat `add.json()["id"]`. Added `TestCatalogAuth`, `TestCatalogList`, `TestCatalogCreate`, `TestRecommendations`, `tests/test_push_tokens.py`, and `TestPublicDeleteAccountForm`. Suite: 150 passed, 0 failed.
- `.venv/` and `venv/` (12,313 files) removed from the git index (`git rm -r --cached`, kept on disk); `.venv/` added to `.gitignore` next to `venv/`.
- `python scripts/gen_dependency_map.py` re-run — the four `/books` routes show `user`/`user`/`user`/`admin` with no ⚠️; `/auth/delete-account` and `/api/googlebooks/*` correctly keep theirs (out of scope).
- **Pushed 2026-09-13** (origin/master = 0cd4e09): e8c8e8b process install, 390606b venv untracking, 2aeab8b the R1–R4 fixes + tests, 0cd4e09 sprint-close docs. Render deployed 2026-09-13 08:21; live-verified anonymous `DELETE /books/1` and `GET /books/` → 401. Push-token live check (spec Done #3) still PM's. Render deploys from master on push, so the live server still has old code until PM pushes. After deploy, PM runs spec Done Checklist items 1–3 on Render to verify.
- Full detail: `features/security/sprint-1-hardening/{spec,architecture,tests,code-map}.md`.

## Known Issues / Next Priorities

**BLOCKED (PM action pending):**
- `REVIEW_LOGIN_SECRET` and `REVIEW_LOGIN_EMAILS` not yet set on Render → the two live checks (T47, T74–T77) cannot run; no production screenshots or sprint-2 live verifications until these are set. See "Recently Shipped (September 13 — Review login)" above.

**HIGH:** None — all critical/auth/security items closed.

**MEDIUM (Carried from sprints 1–2):**
1. Web `/search` route still exists but removed from Nav — decide: keep or delete route
2. Onboarding "Add a Book" step (mobile) — verify book search + add flow end-to-end after tour changes
3. **PM decisions pending:** Remove `/auth/signup|login` (unused, password-based, now fully redundant)? Add auth to `/api/googlebooks/*` (landing page may want anonymous search)?

**LOW:**
4. Users who rated books before May 4, 2026 may have had their book status reset to "to-read" — consider a DB repair script to restore finished status for affected userbooks (needs PM approval)
5. Dead client calls need removal + mobile build: web `demoLogin` in LoginPage, mobile `userAPI.getUser` in App.js
6. Unused `send_push_notification_to_user` import in `likes_comments.py` (cleanup item; module still in use elsewhere, don't delete yet)
7. `book_tracker.db`, `crash.txt`, loose `migrate_*.py`/`check_*.py` tracked in git (pre-existing junk; batch removal in future cleanup pass)
8. Missing `og-image.png` at web root (referenced but not committed)
9. Vercel `build:ssg` unverified (web build script may not run correctly)

---

## Key File Map (Stitch)

### Backend
| File | Purpose |
|---|---|
| `app/routers/auth_router.py` | Google OAuth, JWT, returns `is_new` flag |
| `app/routers/books_router.py` | Book search, recommendations (returns `friend_name`) |
| `app/routers/userbooks_router.py` | Reading status, progress, `PATCH /{id}` accepts `total_pages` |
| `app/routers/notes_router.py` | Notes/posts, feed, upload-image, admin delete comment |
| `app/routers/groups_router.py` | Groups CRUD, membership, posts (with emotion+image_url), leaderboard |
| `app/routers/follow_router.py` | Follow/unfollow, uses `fire_event` |
| `app/routers/profile_router.py` | Profile GET/PUT, picture upload |
| `app/routers/admin_router.py` | Admin dashboard, `get_admin_user` dep enforces 403 |
| `app/routers/import_router.py` | Goodreads CSV import |
| `app/notifications/dispatcher.py` | `fire_event()` — single entry point for all push |

### Web Frontend
| File | Purpose |
|---|---|
| `src/pages/HomePage.jsx` | Feed (Community/Friends tabs), PostComposer (emotion chips + image upload) |
| `src/pages/LibraryPage.jsx` | Book grid, Add Book modal |
| `src/pages/BookDetailPage.jsx` | `/library/book/:userbookId` — survives refresh |
| `src/pages/GroupsPage.jsx` | Circles list, pending requests, pending invites |
| `src/pages/GroupDetailPage.jsx` | Group detail, NewPostModal (emotion chips + image upload) |
| `src/pages/InsightsPage.jsx` | Reading stats, charts |
| `src/pages/NotificationsPage.jsx` | Deep-link routing on tap |
| `src/pages/SettingsPage.jsx` | Notif prefs (incl. group_invite/group_join_request), Goodreads import |
| `src/pages/UserProfilePage.jsx` | Fetches `getUserStats()` separately |
| `src/pages/OnboardingPage.jsx` | 5-step new-user flow, gated by `ONBOARDING_KEY` |
| `src/pages/AdminPage.jsx` | Admin dashboard, `is_admin` gated |
| `src/services/api.js` | All API calls; `uploadNoteImage()`, `getMyPendingGroups()`, `uploadNoteImage()` |

### Mobile
| File | Purpose |
|---|---|
| `src/screens/FeedScreen.js` | Feed + inline composer + For You recs + admin delete comment |
| `src/screens/LibraryScreen.js` | Library grid, Add Book button inline with header |
| `src/screens/BookDetailScreen.js` | Book detail, optimistic status, unknown-pages modal |
| `src/screens/GroupsScreen.js` | Circles + discover + pending requests; fetches own profile on mount |
| `src/screens/GroupDetailScreen.js` | Group detail, composer (emotion chips + image upload, safe-area fix) |
| `src/screens/InsightsScreen.js` | Stats, GoalRing, charts |
| `src/screens/UserProfileScreen.js` | Public profile, correct stats fields |
| `src/screens/SettingsScreen.js` | Profile, notif prefs, Goodreads import |
| `src/screens/OnboardingScreen.js` | 5-step new-user flow, triggered by `is_new` flag |
| `src/components/AppHeader.js` | Logo + bell badge + avatar (profile_picture or initials) |
| `src/context/NotificationContext.js` | `unreadCount` via context (no prop drilling) |
| `src/services/api.js` | Axios → `https://book-tracker-stitch.onrender.com`, 30s timeout |
| `src/theme.js` | Design tokens (primary `#00464a`, surface `#fbf9f4`) |
