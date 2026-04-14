# TrackMyRead — Platform Overview
> Built for reference when designing the frontend via Stitch platform.

---

## What Is TrackMyRead?

TrackMyRead is a **social reading tracker** — think Goodreads meets Instagram for book lovers. Users track which books they're reading, log their progress page by page, write notes and highlights, share their reading life with friends, and discover what people in their network are reading.

The platform runs as:
- A **FastAPI backend** (Python) hosted on Render with PostgreSQL
- A **React web app** (PWA-capable) deployed on Vercel
- A **React Native mobile app** (Expo SDK) on Google Play Store
- Version: `1.1.0` as of March 2026

---

## What The Platform Is Expected To Do (Product Vision)

### Core Reading Tracker
- A user searches for a book (via Google Books API or custom catalog)
- They add it to their personal library with a status: **Want to Read → Reading → Finished**
- While reading, they log their current page number as they go
- The app auto-calculates pages read per day and charts it
- When they finish, they can rate the book and mark it done

### Social Layer
- Users follow each other (asymmetric, like Twitter)
- They write **notes/posts** tied to books (quotes, highlights, thoughts, emotions)
- A **community feed** shows all public posts chronologically
- A **friends feed** shows posts only from people you follow
- Posts can be liked and commented on
- You can see what your friends are currently reading

### Notifications
- When someone follows you → push notification
- When someone likes your post → push notification
- When a friend finishes a book → push notification to their followers
- When a friend adds a new book → push notification to their followers
- Daily reading nudge at 9PM if you haven't logged reading that day

### Discovery
- Search for users by username
- See a user's public profile: their library, bio, and reading activity chart
- "Your Friends" tab shows who you follow + what they're reading

### Analytics
- 30-day bar chart of pages read per day (mobile)
- 7-day bar chart of reading activity (web)
- Reading statistics: total books, pages, average pages/day

### Admin
- Admin dashboard: platform stats, user list, book catalog
- Send test push notifications to specific users
- Broadcast push to all users
- Grant admin role to other users

---

## What Has Been Built (Current State)

### Backend — Fully Built

**Framework:** FastAPI (Python), SQLModel ORM, PostgreSQL in production, SQLite locally.

**Auth:**
- Google OAuth 2.0 (primary sign-in method)
- JWT tokens (HS256, 30-day expiry) stored in `localStorage` (web) / `AsyncStorage` (mobile)
- No email/password auth — Google only
- Demo login endpoint exists for testing
- Admin role via `is_admin` flag on user

**Database Models (all tables exist and working):**

| Table | Purpose |
|-------|---------|
| `user` | Accounts, profile, bio, picture, is_admin |
| `book` | Global catalog (title, author, cover, ISBN, pages, publisher) |
| `userbook` | User ↔ book relationship (status, current_page, rating, format, ownership) |
| `note` | Posts/highlights tied to a book (text, quote, image, emotion, is_public) |
| `follow` | Who follows whom (asymmetric) |
| `like` | User liked a note |
| `comment` | User commented on a note |
| `reading_activity` | Daily page tracking (auto-logged when progress updated) |
| `push_token` | Device tokens for Expo (mobile) and VAPID (web push) |
| `notification_log` | History of all push notifications sent |
| `journal` | Legacy journal entries (less active feature) |

**Reading Status Values — exactly these three strings:**
- `to-read`
- `reading`
- `finished`

**All API Endpoints:**

| Group | Endpoints |
|-------|-----------|
| Auth | `POST /auth/google`, `POST /auth/demo-login`, `POST /auth/delete-account` |
| Books | `GET /books/`, `GET /books/{id}`, `POST /books/`, `POST /books/add-to-library`, `DELETE /books/{id}` |
| User Books | `GET /userbooks/`, `POST /userbooks/`, `PUT /userbooks/{id}/progress`, `PUT /userbooks/{id}/finish`, `DELETE /userbooks/{id}`, `GET /userbooks/user/{user_id}`, `GET /userbooks/friends/currently-reading` |
| Notes/Posts | `GET /notes/feed`, `GET /notes/me`, `GET /notes/friends-feed`, `GET /notes/userbook/{id}`, `POST /notes/`, `POST /notes/upload-image`, `PUT /notes/{id}`, `DELETE /notes/{id}` |
| Follow | `POST /follow/{user_id}`, `DELETE /follow/{user_id}`, `GET /follow/followers`, `GET /follow/following`, `GET /follow/feed` |
| Profiles | `GET /profile/me`, `PUT /profile/me`, `GET /profile/{user_id}` |
| Likes | `POST /{note_id}/like`, `DELETE /{note_id}/like` |
| Comments | `POST /{note_id}/comments`, `GET /{note_id}/comments` |
| Reading Activity | `GET /reading-activity/daily?days=N`, `GET /reading-activity/user/{id}/daily?days=N` |
| Push | `POST /push-tokens/`, `DELETE /push-tokens/` |
| Notifications | `GET /notifications/vapid-public-key`, `POST /notifications/web-subscribe`, `GET /notifications/unread`, `GET /notifications/list`, `PUT /notifications/{id}/read` |
| Users | `GET /users/search?q=`, `GET /users/following`, `GET /users/{id}/stats` |
| Google Books | `GET /googlebooks/search?q=`, `GET /googlebooks/book/{google_book_id}` |
| Admin | `GET /admin/stats`, `GET /admin/users`, `GET /admin/books`, `POST /admin/set-admin/{id}`, `POST /admin/push/test/{id}`, `POST /admin/push/broadcast`, `POST /admin/bot/trigger` |

**Push Notifications:**
- Dispatcher pattern: `fire_event(db, event_type, actor_id, actor_name, recipient_ids, extra)`
- Event types: `new_follower`, `post_liked`, `book_completed`, `book_added`, `reading_streak_reminder`
- Two channels: Expo push (mobile) and VAPID/PyWebPush (web PWA)
- APScheduler fires daily nudge at 9PM

---

### Web Frontend — Partially Built (React + Vite)

**What exists:**

| Page / Component | Status |
|-----------------|--------|
| `HomePage.jsx` | Built — community feed + friends tab |
| `LibraryPage.jsx` | Built — personal book library + stats |
| `AdminPage.jsx` | Built — admin dashboard |
| `ModernHeader.jsx` | Built — responsive pill nav (icons + labels) |
| `CommunityPulseFeed.jsx` | Built — infinite scroll post list |
| `PulsePost.jsx` | Built — single post card with like/comment |
| `PostComposer.jsx` | Built — write a new post |
| `YourFriendsTab.jsx` | Built — find friends + what they're reading |
| `BookCard.jsx` | Built — book tile in library |
| `BookDetailModal.jsx` | Built — book info + progress update |
| `AddBookModal.jsx` | Built — search Google Books + add to library |
| `WeeklyPulseChart.jsx` | Built — 7-day reading bar chart |
| `AuthForm.jsx` | Built — Google OAuth login button |
| `UserSearchModal.jsx` | Built — search users by username |
| `PWAInstallBanner.jsx` | Built — install app prompt |
| `AboutPage.jsx`, `PrivacyPage.jsx`, `TermsPage.jsx`, `HelpPage.jsx` | Built — static pages |
| Public user profile page | Not built as dedicated page — exists in legacy `Profile.jsx` |
| Notification center / bell | Not built |
| Individual post page | Not built |
| Onboarding flow | Not built |
| Settings page | Not built |

**Routing:** Hash-based (`/#/home`, `/#/library`, `/#/admin`)

**Auth:** `@react-oauth/google` — single Google Sign-In button handles both login and signup.

**PWA:** Service worker + manifest — installable on Android/Desktop.

**Web Push:** VAPID subscriptions registered via `registerWebPush()` on login.

**Styling:** TailwindCSS 4 + PostCSS. Responsive mobile-first design.

---

### Mobile App — Fully Built (React Native + Expo)

**What exists:**

| Screen | Status |
|--------|--------|
| `LoginScreen.js` | Built — Google OAuth + demo login |
| `LibraryScreen.js` | Built — books with status tabs + search |
| `BookDetailScreen.js` | Built — book info, notes, progress update |
| `FeedScreen.js` | Built — posts feed + "Your Friends" tab |
| `ProfileScreen.js` | Built — bio, editing, 30-day reading chart |
| `UserProfileScreen.js` | Built — public profile of another user |
| `SearchScreen.js` | Built — Google Books search + add to library |

**Navigation:** Bottom tab navigation (Library, Feed, Search, Profile)

**Push Notifications:** Expo push tokens + Firebase FCM for Android. Registered on login, deregistered on logout.

**Build/Deploy:** EAS Build → Google Play Store (AAB format). Package: `com.bookpulse.mobile`

---

## Data Shapes (API Responses)

These are the key objects returned by the API that the frontend will consume:

### User / Profile
```json
{
  "id": 1,
  "name": "Sonal Sharma",
  "username": "sonal_reads",
  "email": "sonal@gmail.com",
  "bio": "I read 50 books a year",
  "profile_picture": "https://...",
  "is_admin": false,
  "created_at": "2025-11-01T10:00:00"
}
```

### Book
```json
{
  "id": 42,
  "title": "Atomic Habits",
  "author": "James Clear",
  "cover_url": "https://...",
  "description": "...",
  "total_pages": 320,
  "isbn": "9780735211292",
  "publisher": "Avery",
  "published_date": "2018-10-16"
}
```

### UserBook (User's copy of a book)
```json
{
  "id": 7,
  "user_id": 1,
  "book_id": 42,
  "status": "reading",
  "current_page": 150,
  "rating": null,
  "format": "paperback",
  "ownership_status": "owned",
  "created_at": "2025-12-01T08:00:00",
  "updated_at": "2026-04-10T20:00:00",
  "book": { ...book object... }
}
```

### Note / Post
```json
{
  "id": 99,
  "user_id": 1,
  "userbook_id": 7,
  "text": "This chapter changed how I think about habits.",
  "quote": "You do not rise to the level of your goals...",
  "emotion": "inspired",
  "page_number": 138,
  "image_url": "https://...",
  "is_public": true,
  "created_at": "2026-04-12T15:30:00",
  "updated_at": "2026-04-12T15:30:00",
  "user": { ...user object... },
  "book": { ...book object... },
  "likes_count": 5,
  "comments_count": 2,
  "liked_by_me": true
}
```

### Reading Activity
```json
[
  { "date": "2026-04-13", "pages_read": 35, "current_page": 185 },
  { "date": "2026-04-12", "pages_read": 22, "current_page": 150 },
  ...
]
```

### Notification
```json
{
  "id": 12,
  "event_type": "post_liked",
  "title": "Ankit liked your post ❤️",
  "body": "Ankit liked your note about Atomic Habits",
  "read_at": null,
  "sent_at": "2026-04-14T09:00:00"
}
```

---

## Frontend Pages Needed (For Stitch)

These are the screens/pages that need to be built or rebuilt for the web frontend. The backend is complete — all these pages just need to call existing APIs.

### 1. Login / Landing Page
- Google Sign-In button
- Brief pitch: "Track your reading. Share your journey."
- Demo login option
- Links to About, Privacy, Terms

### 2. Home — Community Feed
- Tab 1: Community Feed (all public posts)
- Tab 2: Friends Feed (posts from people you follow)
- Tab 3: Your Friends (people you follow + what they're reading)
- Post composer (write a new note)
- Each post card: avatar, name, book cover, text, quote, image, like/comment

### 3. Library
- My books grid, filterable by: All / Reading / Want to Read / Finished
- Book card: cover, title, author, progress bar
- Click → Book detail modal (update pages, add note, see notes)
- Add book button → Search Google Books → Add to library
- Sidebar: 7-day reading activity bar chart + stats

### 4. Search
- Search books via Google Books API
- Preview result: cover, title, author, description
- Add to library (select status)

### 5. Profile (My Profile)
- Avatar, name, username, bio (editable)
- Reading stats: total books, pages read
- 30-day reading activity chart
- My notes/posts
- Followers / Following count

### 6. User Profile (Someone Else's Profile)
- Their avatar, name, username, bio
- Reading stats + 30-day chart
- Their public notes/posts
- Their library (public books)
- Follow / Unfollow button
- Followers / Following count

### 7. Notifications
- Bell icon in header with unread badge count
- Dropdown or page: list of notifications
- Mark as read

### 8. Settings / Account
- Edit bio and profile picture (`PUT /profile/me`)
- Request account deletion
- Log out

### 9. Admin (admin users only)
- Platform stats (users, books, posts)
- User list with admin toggle
- Test push notifications
- Broadcast push

---

## Key UX Patterns Already Established

These patterns exist in the current web and mobile apps and should be preserved:

- **No email/password** — Google Sign-In only (+ demo login for testing)
- **Hash-based routing** — `/#/home`, `/#/library`, `/#/profile` etc.
- **Status tabs** — filter library by `to-read` / `reading` / `finished` (these exact strings)
- **Responsive nav** — large screen: horizontal pills with icon + label; mobile: stacked icon/label
- **Post editing** — shows "Edited X ago" when `updated_at ≠ created_at`
- **Image fallback** — broken images (Open Library placeholders) must be hidden, not shown as blank boxes
- **Infinite-scroll feed** — posts load in chronological desc order
- **Reading chart** — bar chart, one bar per day, showing pages read

---

## API Base URL

- **Local development:** `http://localhost:8000`
- **Production:** Render backend URL (set via `VITE_API_BASE_URL` env var)

### Auth Header
```
Authorization: Bearer <jwt_token>
```
Token is obtained from `POST /auth/google` and stored in `localStorage` as `bt_token`.

---

## Notable Constraints and Gotchas

1. **Reading status values** — must be exactly `to-read`, `reading`, `finished`. Not `want_to_read`, not `completed`.

2. **Google Books covers** — sometimes return 1×1 placeholder images from Open Library. Always add `onError` fallback to hide the image element.

3. **Comments feature** — the API exists (`POST /{note_id}/comments`, `GET /{note_id}/comments`) but push notifications for new comments have a bug. The UI can show comments; just don't expect the notification.

4. **Token expiry** — JWT tokens last 30 days. No refresh token exists yet. User must log in again after expiry.

5. **Admin routes** — require `is_admin: true` on the user. Regular users hit 403.

6. **Post visibility** — `is_public: true` = visible in community feed. `is_public: false` = only visible to the author.

7. **Follow model is asymmetric** — following user A does not mean A follows you back.

8. **`userbook` is the pivot** — a user's relationship with a book lives in `userbook`, not `book`. A `note` belongs to a `userbook`, not directly to a `book`.

---

## Architecture Diagram

```
┌────────────────────┐     ┌──────────────────────────┐
│   Web (React PWA)  │     │  Mobile (React Native)   │
│   Vercel           │     │  Google Play Store        │
└────────┬───────────┘     └──────────────┬────────────┘
         │                                │
         │  REST/JSON — JWT Bearer header │
         ▼                                ▼
    ┌─────────────────────────────────────────────────┐
    │           FastAPI Backend (Render)               │
    │                                                  │
    │  /auth  /books  /userbooks  /notes  /follow      │
    │  /profile  /likes  /comments  /reading-activity  │
    │  /push-tokens  /notifications  /googlebooks      │
    │  /users  /admin                                  │
    │                                                  │
    │  ┌───────────────────────────────────────────┐  │
    │  │  Notification Dispatcher (fire_event)      │  │
    │  │  → Expo Push (mobile)                     │  │
    │  │  → VAPID/PyWebPush (browser)              │  │
    │  └───────────────────────────────────────────┘  │
    └────────────────────────┬────────────────────────┘
                             │
                             │  SQLModel ORM
                             ▼
                   ┌──────────────────┐
                   │  PostgreSQL       │
                   │  (Render)         │
                   │                  │
                   │  user, book,     │
                   │  userbook, note, │
                   │  follow, like,   │
                   │  comment,        │
                   │  reading_activity│
                   │  push_token      │
                   │  notification_log│
                   └──────────────────┘
```

---

## What To Build With Stitch

The backend is complete. The mobile app is complete. What remains is a **polished, modern web frontend** that covers:

1. **Auth flow** — Google login, store JWT, redirect to home
2. **Home feed** — community + friends posts, post composer, like/comment interactions
3. **Library** — personal book management, progress tracking, notes per book, reading chart
4. **Search** — Google Books search + add to library
5. **Profiles** — own profile (editable) + other users' profiles (with follow/unfollow)
6. **Notifications** — bell icon, unread count, notification list
7. **Settings** — edit profile, delete account, logout
8. **Admin panel** — stats, user management, push test (only show to admins)

The existing web frontend (`book-tracker-frontend/`) has most of this partially built. Stitch should produce clean, full implementations of each page connecting to the live API documented above.
