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
| **Version** | 1.1.0 (versionCode 44, AAB submitted to Play Store) |

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

## Known Issues / Next Priorities

**HIGH:**
1. None currently blocking

**MEDIUM:**
2. Web `/search` route still exists but removed from Nav — decide: keep or delete route
3. Onboarding "Add a Book" step (mobile) — verify book search + add flow end-to-end after tour changes

**LOW:**
4. `broadcast_push_notification` in admin_router.py uses old `send_push_to_many` — breaks for web push users on admin broadcasts

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
