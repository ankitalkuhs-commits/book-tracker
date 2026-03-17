# Community Features Context

**Feature Owner:** Social & Community  
**Last Updated:** March 14, 2026

---

## Overview
Handles social interactions including following users, activity feeds, likes, comments, and reading journals.

---

## Files in This Feature

### Backend
- `app/routers/follow_router.py` - Follow/unfollow system, followers/following lists
- `app/routers/likes_comments.py` - Likes and comments on posts
- `app/routers/journals.py` - Reading journal entries
- `app/routers/profile_router.py` - User profiles and public info

### Frontend - Web
- `book-tracker-frontend/src/pages/HomePage.jsx` - Main social feed
- `book-tracker-frontend/src/components/Feed.jsx` - Activity feed display
- `book-tracker-frontend/src/components/FollowPanel.jsx` - Follow suggestions
- `book-tracker-frontend/src/components/Profile.jsx` - User profile view
- `book-tracker-frontend/src/components/home/CommunityPulseFeed.jsx` - Community feed
- `book-tracker-frontend/src/components/home/PulsePost.jsx` - Individual post (has `onError` image hiding)
- `book-tracker-frontend/src/components/home/UserSearchModal.jsx` - Find users
- `book-tracker-frontend/src/components/bookpulse/` - BookPulse specific components

### Frontend - Mobile
- `book-tracker-mobile/src/screens/FeedScreen.js` - Community feed + friend search
- `book-tracker-mobile/src/screens/ProfileScreen.js` - User profile with bio editing
- `book-tracker-mobile/src/services/NotificationService.js` - Daily 9PM reading nudges

### Database Tables
- `follows` - User follow relationships
- `journals` - Reading journal posts
- `likes` - Likes on journal entries
- `comments` - Comments on posts

---

## Key Design Decisions

### 1. Follow System (Not Friendship)
**Decision:** One-way follow model (like Twitter)  
**Why:**
- Asymmetric relationships more flexible
- Users can follow without requiring approval
- Reduces friction for discovery
- Privacy controlled by user (public/private accounts)

**Implementation:**
- `follows` table: follower_id → followed_id
- No mutual acceptance required
- Count followers and following separately

### 2. Activity Feed Algorithm
**Decision:** Chronological feed of followed users  
**Why:**
- Simple to implement
- Predictable for users
- No black-box algorithm
- Real-time updates easier

**Implementation:**
- Query journals from followed users
- Order by created_at DESC
- Include user's own posts
- Paginate results

### 3. Journal Entries for Activity
**Decision:** Explicit journal posts (not auto-generated)  
**Why:**
- Users control what they share
- More meaningful than auto-posts
- Encourages thoughtful updates
- Can include rich text and thoughts

**Fields:**
- `book_id` - What they're reading
- `entry_text` - User's thoughts
- `is_public` - Visibility control
- `entry_type` - update/review/quote

### 4. Likes & Comments Separation
**Decision:** Separate tables for likes and comments  
**Why:**
- Different data structures
- Easier to count likes quickly
- Comments need more fields (text, replies)
- Can query independently

### 5. Profile Privacy Controls
**Decision:** Public profiles by default, optional privacy  
**Why:**
- Social platform encourages discovery
- Users opt-in to privacy
- Simpler permission model
- Can add granular controls later

---

## Notes/Posts API Endpoints (notes_router.py)

> **Note:** The primary "social posts" in this app are called **notes** (stored in `notes` table, served from `app/routers/notes_router.py`). They differ from `journals` (separate system).

#### GET `/notes/feed`
Get public posts from followed users + self. Returns:
```json
{
  "id": 1, "text": "...", "emotion": "...", "image_url": "...",
  "is_public": true, "created_at": "...", "updated_at": "...",
  "user": {"id": 1, "name": "Alice"},
  "book": {"id": 2, "title": "Dune", "author": "Frank Herbert"},
  "likes_count": 5, "comments_count": 2, "user_has_liked": false
}
```

#### PUT `/notes/{note_id}`
Update own note. Now sets `updated_at` timestamp on save.

#### DELETE `/notes/{note_id}`  *(fixed March 2026)*
Delete a note. **Owner or admin** can delete. Returns `{"message": "Note deleted successfully"}`.
- Fixed: was admin-only with a critical placement bug (code placed before `router` was defined)
- Fixed: now all authenticated owners can delete their own posts

### Follow System

#### POST `/follow/{user_id}`
Follow a user (authenticated)

#### DELETE `/follow/{user_id}`
Unfollow a user (authenticated)

#### GET `/follow/followers`
Get current user's followers list

#### GET `/follow/following`
Get users current user is following

#### GET `/follow/feed`
Get activity feed from followed users
```json
{
  "entries": [
    {
      "id": 1,
      "user": {...},
      "book": {...},
      "entry_text": "Loving this book!",
      "created_at": "2026-01-10T12:00:00"
    }
  ]
}
```

### Journals

#### POST `/journals/`
Create reading journal entry
```json
{
  "book_id": 1,
  "entry_text": "Amazing chapter!",
  "entry_type": "update",
  "is_public": true
}
```

#### GET `/journals/{user_id}`
Get user's journal entries (if public or own)

#### PUT `/journals/{entry_id}`
Update journal entry (own entries only)

#### DELETE `/journals/{entry_id}`
Delete journal entry (own entries only)

### Likes & Comments

#### POST `/likes/journal/{journal_id}`
Like a journal entry

#### DELETE `/likes/journal/{journal_id}`
Unlike a journal entry

#### GET `/likes/journal/{journal_id}`
Get all likes on an entry

#### POST `/comments/journal/{journal_id}`
Comment on journal entry
```json
{
  "comment_text": "Great insight!"
}
```

#### GET `/comments/journal/{journal_id}`
Get comments on an entry

### Profiles

#### GET `/profile/{user_id}`
Get user's public profile
```json
{
  "id": 1,
  "username": "booklover",
  "bio": "Reading enthusiast",
  "profile_picture": "url",
  "followers_count": 42,
  "following_count": 15,
  "books_read": 100
}
```

#### PUT `/profile/`
Update own profile (bio, picture, privacy)

---

## Database Schema

### follows table
```sql
CREATE TABLE follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    followed_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (follower_id) REFERENCES users(id),
    FOREIGN KEY (followed_id) REFERENCES users(id),
    UNIQUE(follower_id, followed_id)
);
```

### journals table
```sql
CREATE TABLE journals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER,
    entry_text TEXT NOT NULL,
    entry_type TEXT,  -- update, review, quote, milestone
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (book_id) REFERENCES books(id)
);
```

### likes table
```sql
CREATE TABLE likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    journal_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (journal_id) REFERENCES journals(id),
    UNIQUE(user_id, journal_id)
);
```

### comments table
```sql
CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    journal_id INTEGER NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (journal_id) REFERENCES journals(id)
);
```

---

## Common Workflows

### Following a User
1. User searches for username
2. Clicks "Follow" button
3. POST to `/follow/{user_id}`
4. Backend creates follow relationship
5. UI updates to show "Following" state
6. User now sees their activity in feed

### Posting Journal Entry
1. User clicks "Share Update" from book
2. Writes their thoughts
3. Selects entry type (update/review)
4. Chooses public/private visibility
5. POST to `/journals/`
6. Entry appears in followers' feeds (if public)

### Viewing Feed
1. User visits home page
2. GET `/follow/feed`
3. Backend queries journals from followed users
4. Joins user and book data
5. Returns chronological list
6. Frontend displays with like/comment counts

---

## Frontend Components

### HomePage.jsx
- Main container for social feed
- Includes post composer
- Renders PulsePost components
- Infinite scroll for pagination

### PulsePost.jsx
- Individual post card
- Shows: user, book, entry text, timestamp
- Like button with count
- Comment button with count
- Share/bookmark options

### FollowPanel.jsx
- Shows suggested users to follow
- Displays follower/following stats
- Quick follow/unfollow buttons

### UserSearchModal.jsx
- Search users by username
- Display profile previews
- Follow directly from search

---

## Privacy & Permissions

### What's Public by Default
- Profile information (username, bio, picture)
- Public journal entries
- Follower/following counts
- Reading statistics

### What's Private
- Email address
- Private journal entries
- Exact reading progress (unless shared)
- Personal notes

### Permission Checks
```python
def can_view_journal(journal, current_user):
    if journal.is_public:
        return True
    return journal.user_id == current_user.id
```

---

## Notifications (Future)

### Planned Notification Types
- New follower
- Like on your post
- Comment on your post
- Friend finished a book
- Reading milestone reached

**Current Status:** Not implemented yet

---

## Future Enhancements

### Short Term
- [ ] Notification system
- [ ] User search autocomplete
- [ ] Tagged users in posts
- [ ] Hashtags for books/genres
- [ ] Pin favorite posts

### Long Term
- [ ] Direct messaging
- [ ] Book clubs (group feature)
- [ ] Reading challenges together
- [ ] Shared reading lists
- [ ] Story/highlight feature

---

## Mobile-Specific Notes (FeedScreen.js)

### PostImage Component
Custom component that hides itself on any image load failure:
```javascript
const PostImage = ({ uri, style }) => {
  const [failed, setFailed] = useState(false);
  if (failed || !uri) return null;
  return (
    <Image source={{ uri }} style={style} resizeMode="contain"
      onError={() => setFailed(true)}
      onLoad={(e) => {
        const { width, height } = e.nativeEvent.source;
        if (width <= 1 || height <= 1) setFailed(true); // catches Open Library 1x1 placeholder
      }}
    />
  );
};
```

### Feed UI Changes (March 2026)
- "Following" tab renamed to **"Your Friends"**
- Friend search user cards no longer navigate on tap (prevented crash) — follow button still works
- `✕` clear button added to friend search input
- Post timestamps show **"Edited X ago"** when `updated_at` differs from `created_at`

### Web Feed (PulsePost.jsx)
- `<img>` tags have `onError` handler that hides the parent container on failure
- Prevents blank white spaces from broken Open Library cover URLs

### Notification Service (NotificationService.js)
Schedules a 9PM daily reading nudge. **Fixed bug (March 2026):**
- Old: only rescheduled on first open of the day → second open cancelled without rescheduling
- New: always cancel + reschedule on every app open; `scheduleNudgeFor9PM()` self-guards (no-op if 9PM passed)

### Bio Editing (ProfileScreen.js)
- Profile screen now shows user bio below name/email
- Tap bio (or "Add a bio…" placeholder) to enter edit mode
- TextInput with Cancel / Save; Save calls `userAPI.updateProfile({ bio })`
- Backend: `PUT /profile/me` — `bio` field fully supported

---

## Troubleshooting

### Feed not showing updates
- Check user is following someone
- Verify followed users have public posts
- Check journal `is_public` flag
- Ensure proper join on user/book tables

### Can't follow user
- Verify user exists
- Check for existing follow relationship
- Ensure not trying to follow self
- Check for database constraint errors

### Likes not counting
- Verify unique constraint (user_id, journal_id)
- Check double-like prevention
- Ensure like table has proper indexes

---

## Performance Considerations

### Feed Query Optimization
```sql
-- Index on follows for fast lookup
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_followed ON follows(followed_id);

-- Index on journals for feed queries
CREATE INDEX idx_journals_user_created ON journals(user_id, created_at DESC);
```

### Caching Strategy
- Cache follower/following counts
- Denormalize like counts on journals
- Paginate feed (20-50 entries per page)

---

## Related Context

- See [../auth/README.md](../auth/README.md) for user authentication
- See [../library/README.md](../library/README.md) for book integration
- See [../PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) for overall design
