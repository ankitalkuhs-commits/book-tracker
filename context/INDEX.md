# TrackMyRead — Context Index

**Last Updated:** May 6, 2026

> Start every session by reading `LOAD_ME_FIRST.md`. This file is for navigation.

---

## Context Files

| File | Purpose |
|---|---|
| [`LOAD_ME_FIRST.md`](LOAD_ME_FIRST.md) | **Session starter** — tech stack, critical patterns, recent changes, file map |
| [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) | Architecture decisions, design principles, component hierarchy |
| [`PLATFORM_MAP.md`](PLATFORM_MAP.md) | Full feature map (Mermaid diagrams), user journeys, notification flow |
| [`supabase_migration.sql`](supabase_migration.sql) | **Run before pushing models.py changes** — all DB column additions |
| [`PRODUCTION_CUTOVER_PLAN.md`](PRODUCTION_CUTOVER_PLAN.md) | Plan for shipping stitch as prod (web + Android) |
| [`MOBILE_STITCH_PHASE3.md`](MOBILE_STITCH_PHASE3.md) | Per-screen mobile rebuild changelog (April 2026) |

---

## Feature READMEs

| Area | README | Key Files |
|---|---|---|
| Auth | [`auth/README.md`](auth/README.md) | `app/routers/auth_router.py`, `app/auth.py` |
| Library | [`library/README.md`](library/README.md) | `books_router.py`, `userbooks_router.py`, `LibraryPage.jsx`, `LibraryScreen.js` |
| Community | [`community/README.md`](community/README.md) | `notes_router.py`, `follow_router.py`, `likes_comments.py`, `HomePage.jsx`, `FeedScreen.js` |
| Reading Stats | [`reading-stats/README.md`](reading-stats/README.md) | `InsightsPage.jsx`, `InsightsScreen.js` |
| Deployment | [`deployment/README.md`](deployment/README.md) | `eas.json`, `google-services.json`, Render, Supabase |

---

## Backend Routers (`app/routers/`)

| Router | Endpoints |
|---|---|
| `auth_router.py` | `POST /auth/google`, `DELETE /auth/delete-account/me` |
| `books_router.py` | `GET /books/search`, `GET /books/recommendations` |
| `userbooks_router.py` | `GET/POST /userbooks/`, `PATCH /userbooks/{id}` |
| `notes_router.py` | `GET /notes/feed`, `POST /notes/`, `POST /notes/upload-image`, `DELETE /notes/{id}` (removes likes+comments first) |
| `likes_comments.py` | `POST/DELETE /notes/{id}/like`, `GET/POST /notes/{id}/comments`, sends `note_id` in `post_liked` extra |
| `follow_router.py` | `POST/DELETE /follow/{id}` |
| `profile_router.py` | `GET/PUT /profile/me`, `POST /profile/me/picture`, `GET /profile/{id}` |
| `groups_router.py` | Full groups CRUD, membership, `GET/POST /groups/{id}/posts` (with emotion+image_url), leaderboard, activity feed |
| `import_router.py` | `POST /import/goodreads` (CSV upload) |
| `admin_router.py` | Admin stats, user management, `DELETE /admin/content/comment/{id}` (get_admin_user enforces 403) |
| `notifications_router.py` | Unread count, history, mark read, prefs |

---

## Web Pages (`book-tracker-frontend-stitch/src/pages/`)

| Page | Route | Notes |
|---|---|---|
| `LoginPage.jsx` | `/login` | Google OAuth, redirects to `/onboarding` if first time |
| `OnboardingPage.jsx` | `/onboarding` | 5-step flow; gated by `ONBOARDING_KEY` in localStorage |
| `HomePage.jsx` | `/home` | Feed (Community/Friends tabs), PostComposer with emotion chips + image upload |
| `LibraryPage.jsx` | `/library` | Book grid, Add Book modal |
| `BookDetailPage.jsx` | `/library/book/:userbookId` | Survives refresh; optimistic progress |
| `GroupsPage.jsx` | `/groups` | My Circles, Pending Requests, Pending Invites, Discover |
| `GroupDetailPage.jsx` | `/groups/:groupId` | Group detail, NewPostModal with emotion chips + image upload |
| `CreateGroupPage.jsx` | `/groups/new` | Create group form |
| `JoinGroupPage.jsx` | `/join/:inviteCode` | Join by invite link |
| `InsightsPage.jsx` | `/insights` | Charts, stats, goal ring |
| `NotificationsPage.jsx` | `/notifications` | Deep-link routing, push permission banner |
| `ProfilePage.jsx` | `/profile` | Own profile |
| `UserProfilePage.jsx` | `/profile/:userId` | Public profile; fetches `getUserStats()` separately |
| `SettingsPage.jsx` | `/settings` | Notif prefs, Goodreads import, account deletion |
| `AdminPage.jsx` | `/admin` | `is_admin` gated |
| `SearchPage.jsx` | `/search` | Exists but removed from Nav — LibraryPage Add Book handles quick adds |

---

## Mobile Screens (`book-tracker-mobile-stitch/src/screens/`)

| Screen | Navigator | Notes |
|---|---|---|
| `LoginScreen.js` | Root | Google OAuth, multicolor G icon (react-native-svg 15.15.4) |
| `OnboardingScreen.js` | Root | 5-step, triggered by `is_new` flag from backend |
| `FeedScreen.js` | HomeStack tab | Inline composer, For You recs, admin delete comment |
| `LibraryScreen.js` | LibraryStack tab | Add Book button inline with header tab row |
| `BookDetailScreen.js` | LibraryStack | Optimistic status, unknown-pages TextInput modal |
| `GroupsScreen.js` | CirclesStack tab | My/Discover/Pending; fetches own profile if preload null |
| `GroupDetailScreen.js` | CirclesStack | Composer with emotion chips + image upload + safe-area |
| `InsightsScreen.js` | InsightsStack tab | GoalRing (pure View), BarChart, 30-day activity |
| `ProfileScreen.js` | Root stack | Accessed via AppHeader avatar |
| `UserProfileScreen.js` | Multiple stacks | Correct stats fields (`stats.finished`, not `stats.finished_books`) |
| `SettingsScreen.js` | ProfileStack | Notif prefs, Goodreads import, DiceBear avatars |
| `NotificationsScreen.js` | Root stack | Accessed via AppHeader bell; deep-link routing |
| `BookPreviewScreen.js` | Multiple stacks | From search/feed; "Add to Library" or "View in My Library" |

---

## Shared Mobile Components (`book-tracker-mobile-stitch/src/components/`)

| Component | Purpose |
|---|---|
| `AppHeader.js` | Top bar: logo + bell (unread badge) + avatar (profile_picture or initials) |

---

## Database Tables (Supabase PostgreSQL)

| Table | Key Fields |
|---|---|
| `user` | `id`, `email`, `name`, `profile_picture`, `yearly_goal`, `is_admin`, `is_private_profile`, `notification_prefs` |
| `book` | `id`, `title`, `author`, `cover_url`, `google_books_id`, `total_pages`, `description` |
| `userbook` | `id`, `user_id`, `book_id`, `status`, `current_page`, `total_pages`, `rating`, `format`, `ownership_status` |
| `note` | `id`, `user_id`, `userbook_id`, `text`, `quote`, `emotion`, `image_url`, `is_public` |
| `reading_group` | `id`, `name`, `is_private`, `invite_code`, `cover_preset`, `current_book_id`, `goal_pages` |
| `group_member` | `id`, `group_id`, `user_id`, `role`, `status`, `invited_by` |
| `group_post` | `id`, `group_id`, `user_id`, `text`, `quote`, `emotion`, `image_url`, `userbook_id` |
| `group_activity` | `id`, `group_id`, `user_id`, `event_type`, `payload` |
| `notificationlog` | `id`, `user_id`, `event_type`, `title`, `body`, `data`, `is_read` |
| `reading_activity` | `id`, `user_id`, `userbook_id`, `date`, `pages_read`, `current_page` |
| `follow` | `id`, `follower_id`, `followed_id` |
| `like` | `id`, `user_id`, `note_id` |
| `comment` | `id`, `user_id`, `note_id`, `text` |
| `pushtoken` | `id`, `user_id`, `token`, `token_type` (`expo`/`web`), `device_info` |
