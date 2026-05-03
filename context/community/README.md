# Community Features

**Last Updated:** May 3, 2026

---

## Overview

Social layer of TrackMyRead: feed of notes/reflections, follows, likes, comments, user profiles, groups (Literary Circles), and push notifications.

---

## Key Files

### Backend
| File | Purpose |
|---|---|
| `app/routers/notes_router.py` | Notes/posts CRUD, community feed, friends feed, upload-image, admin delete comment |
| `app/routers/likes_comments.py` | Like/unlike, get/add comments; sends `note_id` in `post_liked` extra |
| `app/routers/follow_router.py` | Follow/unfollow; uses `fire_event("new_follower")` |
| `app/routers/profile_router.py` | GET/PUT profile, upload picture, public profile (locked for private profiles) |
| `app/routers/groups_router.py` | Groups CRUD, membership, posts, leaderboard, activity feed |
| `app/notifications/dispatcher.py` | `fire_event()` — ALWAYS use this, never `send_push_notification_to_user` |

### Web
| File | Purpose |
|---|---|
| `src/pages/HomePage.jsx` | Feed (Community/Friends pill tabs), PostComposer with emotion chips + image upload |
| `src/pages/UserProfilePage.jsx` | Public profile; `getUserStats(userId)` fetched separately (not embedded in profile response) |
| `src/pages/GroupsPage.jsx` | My Circles, Pending Requests, Pending Invites, Discover |
| `src/pages/GroupDetailPage.jsx` | Group detail, activity feed, leaderboard, NewPostModal with emotion chips + image upload |

### Mobile
| File | Purpose |
|---|---|
| `src/screens/FeedScreen.js` | Inline post composer, For You recs, admin delete comment |
| `src/screens/UserProfileScreen.js` | Public profile; use `stats.finished` (not `stats.finished_books`) |
| `src/screens/GroupsScreen.js` | My/Discover/Pending tabs; fetches own profile on mount if preload null |
| `src/screens/GroupDetailScreen.js` | Group detail; composer has emotion chips + image upload + safe-area fix |

---

## Notes / Posts

The primary social objects are `Note` records (table: `note`). They are NOT called "journals" — that's the old system.

### Note fields
`text` · `quote` · `emotion` · `image_url` · `is_public` · `userbook_id` (optional book tag)

### Key API endpoints
```
GET  /notes/feed              Community feed (all public notes)
GET  /notes/friends-feed      Friends feed (followed users only)
POST /notes/                  Create note
PUT  /notes/{id}              Edit own note (sets updated_at)
DELETE /notes/{id}            Owner or admin — deletes Likes+Comments first (PostgreSQL FK)
POST /notes/upload-image      Multipart upload → Cloudinary, returns image_url
GET  /notes/{id}/comments     List comments
POST /notes/{id}/comments     Add comment
POST /notes/{id}/like         Like
DELETE /notes/{id}/like       Unlike
```

### Posting from frontend

**Web PostComposer (HomePage.jsx)**
- 14 emotion emoji chips (tap to select/deselect): Joyful 😄, Moved 🥹, Surprised 😲, Mind-blown 🤯, Peaceful 😌, Thoughtful 🤔, Tense 😬, Amused 😂, Emotional 😢, Frustrated 😤, Shocked 😱, Inspired ✨, Melancholic 😔, In love with it 🥰
- Image upload: file input → `uploadNoteImage(file)` → `image_url` passed to `createNote`
- `URL.revokeObjectURL()` called on image preview cleanup

**Mobile FeedScreen inline composer**
- Same 14 emotion chips, horizontal ScrollView
- `ImagePicker.launchImageLibraryAsync` → `notesAPI.uploadImage(uri)` → `image_url`
- Image upload failure: prompts "Post without image?" Alert, does not silently swallow

---

## Groups (Literary Circles)

### Membership states
- `active` — full member
- `pending` (invited_by IS NULL) — self-join request awaiting curator approval
- `pending` (invited_by != NULL) — curator-sent invite awaiting user acceptance

### CRITICAL: two different pending endpoints
```
GET /groups/{id}/pending      → self-join requests (invited_by IS NULL) — for curator approval
GET /groups/invites/pending   → curator invites for the current user
```
Never mix these.

### Group posts
`group_post` table has: `text`, `quote`, `emotion`, `image_url`, `userbook_id`  
Both emotion and image_url were added May 2026 — migration in `supabase_migration.sql`.

### Group invite URL
Always use `https://www.trackmyread.com/join/{invite_code}` — never `window.location.origin` (breaks in dev).

---

## Follow System

One-way (Twitter-style). No mutual acceptance. `follow` table: `follower_id` → `followed_id`.

- `followInFlight` ref pattern on both web and mobile — prevents double-tap race conditions
- Follow button shows spinner during API call

---

## Push Notifications

**ALWAYS use `fire_event()`** from `app/notifications/dispatcher.py`. It routes correctly:
- Expo tokens → Expo Push API (FCM for Android)
- Web subscriptions → pywebpush (VAPID)

```python
from app.notifications.dispatcher import fire_event
fire_event("post_liked", actor_id=me.id, target_user_id=note.user_id,
           extra={"note_id": note.id})
```

**⚠️ `admin_router.py` `broadcast_push_notification`** still uses old `send_push_to_many` — will fail for web push users. Known issue, not yet fixed.

### Notification pref keys (exact strings, must match backend + frontend)
`new_follower` · `post_liked` · `post_commented` · `book_completed` · `reading_streak_reminder` · `group_invite` · `group_join_request`

### Deep-link routing on tap
- **Mobile** (`NotificationsScreen.js`): group events → CircTab + GroupDetail; book/post → HomeTab; streak → InsTab; follow → UserProfile
- **Web** (`NotificationsPage.jsx`): `getDestination()` — group_invite/group_join_request → `/groups/:id`; book events → `/home`; streak → `/insights`

---

## User Profiles

- `GET /profile/{userId}` returns locked view for private profiles if requester is not a follower
- `getUserStats(userId)` must be called separately — the profile endpoint does NOT embed stats
- `UserProfilePage.jsx` and `UserProfileScreen.js` both call stats endpoint independently
- Stats fields: `stats.finished` (not `stats.finished_books`), `stats.reading`, `stats.in_library`

---

## Admin Actions

- `DELETE /admin/content/comment/{id}` — protected by `get_admin_user` dep (raises 403 for non-admins)
- Frontend shows trash icon on comment rows only when `currentUser?.is_admin` is true (UI gate only)
- `notesAPI.adminDeleteComment(commentId)` in mobile, `adminDeleteComment(id)` in web api.js

---

## PostImage Component (Mobile)

Hides itself on any load failure including 1×1 placeholder images:
```javascript
const PostImage = ({ uri, style }) => {
  const [failed, setFailed] = useState(false);
  if (failed || !uri) return null;
  return (
    <Image source={{ uri }} style={style} resizeMode="contain"
      onError={() => setFailed(true)}
      onLoad={(e) => {
        const { width, height } = e.nativeEvent.source;
        if (width <= 1 || height <= 1) setFailed(true);
      }}
    />
  );
};
```
