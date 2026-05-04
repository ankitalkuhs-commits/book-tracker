# TrackMyRead — Project Context

**Last Updated:** May 4, 2026
**Version:** 1.1.0

---

## What It Is

A social book tracking platform: track reading progress, share reflections, discover what friends are reading, join literary circles (groups), and analyse reading habits.

---

## Architecture

### Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI (Python), SQLModel ORM |
| Database | PostgreSQL on Supabase (prod) / SQLite (local dev) |
| Web frontend | React 18 + Vite + TailwindCSS (custom design tokens) |
| Mobile | React Native, Expo SDK, EAS builds (NOT Expo Go) |
| Auth | Google OAuth 2.0 → JWT tokens |
| File uploads | Cloudinary (profile pictures + note images) |
| Push | Expo FCM (Android mobile) + VAPID via pywebpush (web PWA) |
| Hosting | Render (backend auto-deploys from `master`), Vercel (web frontend) |

### Deployments

| Service | URL | Branch |
|---|---|---|
| Backend (Render) | `https://book-tracker-stitch.onrender.com` | `master` |
| Web (Vercel) | `https://www.trackmyread.com` | `master` |
| Android (Play Store) | TrackMyRead | EAS build from `master` |

---

## Core Design Principles

### 1. Feature-Based Organization
- Backend: one router per feature (`auth_router.py`, `books_router.py`, etc.)
- Frontend: one page per route, one screen per screen
- No shared "utils" sprawl — logic lives close to where it's used

### 2. Event-Driven Notifications
Always use `fire_event()` from `app/notifications/dispatcher.py`. It routes to the correct channel (Expo FCM for mobile tokens, pywebpush for web subscriptions) and writes to `NotificationLog`. Never call `send_push_notification_to_user` directly.

### 3. Optimistic UI
Status changes, progress updates, and likes update instantly in state. API error reverts the change. This compensates for Render free tier cold-start (~30s wake time).

### 4. Migration Safety
Production is PostgreSQL, dev is SQLite. Always use `information_schema` for schema introspection. Every `models.py` change needs a corresponding `ALTER TABLE IF NOT EXISTS` in `context/supabase_migration.sql`, run in Supabase SQL Editor before pushing.

### 5. Social by Design
Follow system (one-way), public/private posts, likes/comments, group feeds, leaderboards, recommendations from friends' activity.

---

## Component Hierarchy (Web)

```
App.jsx
├── Nav.jsx              (Home · Library · Circles · Insights · Notifications · Profile)
├── AppTour.jsx          (8-step coach marks for new users)
└── Pages (React Router)
    ├── /login           LoginPage
    ├── /onboarding      OnboardingPage      (ONBOARDING_KEY gated, 5 steps)
    ├── /home            HomePage            (feed + PostComposer with emotion chips + image)
    ├── /library         LibraryPage
    ├── /library/book/:id BookDetailPage     (survives refresh via list fetch)
    ├── /groups          GroupsPage          (My/Pending/Invites/Discover)
    ├── /groups/:id      GroupDetailPage     (NewPostModal with emotion chips + image)
    ├── /groups/new      CreateGroupPage
    ├── /join/:code      JoinGroupPage
    ├── /insights        InsightsPage
    ├── /notifications   NotificationsPage   (deep-link routing)
    ├── /profile         ProfilePage
    ├── /profile/:id     UserProfilePage     (getUserStats() fetched separately)
    ├── /settings        SettingsPage        (notif prefs + Goodreads import)
    ├── /search          SearchPage          (route exists, not in Nav)
    └── /admin           AdminPage           (is_admin gated)
```

---

## Mobile Navigation

```
AppNavigator (React Navigation)
├── LoginScreen          (root, shown when not authed)
├── OnboardingScreen     (root, shown when is_new = true)
└── MainTabs (Bottom Tab Navigator)
    ├── HomeStack        FeedScreen → BookPreviewScreen → UserProfileScreen
    ├── LibraryStack     LibraryScreen → BookDetailScreen
    ├── CirclesStack     GroupsScreen → GroupDetailScreen → UserProfileScreen
    └── InsightsStack    InsightsScreen
    (Accessed via AppHeader, not tabs:)
    ├── ProfileScreen    → SettingsScreen
    ├── NotificationsScreen
    └── UserProfileScreen (also in root stack for notification deep-links)
```

---

## State Management

- **Auth**: `AuthContext` (web), `authTokenRef` + `setIsLoggedIn` (mobile App.js)
- **Preloaded data**: `PreloadContext` in App.js — profile, library, feed preloaded after login
- **Unread count**: `NotificationContext` — consumed by AppHeader without prop drilling
- **Local state**: `useState`/`useEffect` per component — no Redux
- **API caching**: 60s TTL in-memory cache in web `services/api.js` (`_cache` Map)

---

## Security Model

- JWT Bearer tokens required for all authenticated endpoints
- `get_current_user` dep: validates token, returns User or raises 401
- `get_admin_user` dep: calls `get_current_user` then checks `is_admin`, raises 403 if not
- Frontend admin checks (e.g. showing delete buttons) are UI-only; backend always enforces
- CORS configured for `www.trackmyread.com` and `trackmyread.com`
- File uploads go to Cloudinary — no local filesystem storage, Cloudinary validates image format
- Private profiles (`is_private_profile`) enforced on `GET /profile/{id}` — returns locked view to non-followers

---

## Data Model Key Decisions

### `userbook` — the link table
`User` ↔ `Book` is many-to-many via `UserBook`. Status (`reading`/`to-read`/`finished`) lives on `UserBook`, not `Book`. Allows same book to have different statuses for different users.

### `note` vs `group_post`
- `note` — general reflection, can be public or private, appears in community/friends feed
- `group_post` — scoped to a group, only visible to group members
- Both now have `emotion` and `image_url` fields

### Soft approach to deletions
When deleting a `note`, first delete its `Like` and `Comment` rows (PostgreSQL FK constraint). No soft-delete pattern — hard deletes only.

### `reading_activity` — daily log
Stores pages read per day per userbook. Powers InsightsScreen charts, velocity calculations, and group leaderboards.

---

## Notification Event Types

| Event | Triggered by | Extra payload |
|---|---|---|
| `new_follower` | follow_router.py | `actor_id` |
| `post_liked` | likes_comments.py | `note_id` |
| `post_commented` | likes_comments.py | `note_id` |
| `book_added` | books_router.py | `book_title` |
| `book_completed` | userbooks_router.py | `book_title` |
| `reading_streak_reminder` | scheduler | — |
| `group_invite` | groups_router.py | `group_id`, `group_name` |
| `group_join_request` | groups_router.py | `group_id` |

---

## Known Gotchas

| Gotcha | Detail |
|---|---|
| Render cold start | Free tier sleeps after 15min inactivity, ~30s wake. Mobile timeout is 30s. |
| `adjustsFontSizeToFit` | Kills text visibility on Android — never use it |
| `type.label` spread | Spreading `...type.label` (custom font family) can make text invisible before font load — use explicit `fontSize`/`fontWeight` for critical UI |
| `react-native-svg` | Must be `15.15.4` — `15.8.0` breaks New Architecture build |
| Modal safe area | Modals with `presentationStyle="pageSheet"` need `insets.top + N` on their header, not just `paddingTop: N` |
| `is_new` flag | `auth_router.py` returns `is_new: true` only on the very first Google login for an account |
| `ONBOARDING_KEY` | Change `'bt_onboarding_v1'` → `'bt_onboarding_v2'` to reset onboarding for all web users |
