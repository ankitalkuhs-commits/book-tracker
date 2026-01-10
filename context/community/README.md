# Community & Social Features

**Feature Owner:** Social Module  
**Last Updated:** December 27, 2025

---

## Overview

Social reading platform where users share reading emotions, follow friends, and engage with posts through likes and (future) comments.

---

## Architecture

### Backend Files
- `app/routers/notes_router.py` - Posts/notes CRUD, feed generation
- `app/routers/follow_router.py` - Follow/unfollow relationships
- `app/routers/likes_comments.py` - Like functionality
- `app/routers/users_router.py` - User discovery
- `app/models.py` - Note, Follow, Like models

### Frontend Files
- `src/pages/HomePage.jsx` - Community feed page
- `src/components/home/PostComposer.jsx` - Create new posts
- `src/components/home/CommunityPulseFeed.jsx` - Feed container
- `src/components/home/PulsePost.jsx` - Individual post card
- `src/components/home/HomeSidebar.jsx` - Friends activity widget

---

## Key Decisions

### 1. Public vs Private Posts
```python
class Note:
    is_public: bool = True  # Public by default
```

**Access Control:**
- Public posts: Visible in community feed to all users (including non-logged-in)
- Private posts: Only visible to post owner
- Non-logged-in users: Can view posts but not user details or take actions

### 2. Image Storage Strategy
**Evolution:**
- ❌ **v1:** Local filesystem (`/uploads/notes/`) - Lost on Render redeploy
- ✅ **v2:** Cloudinary cloud storage - Persistent across deployments

**Implementation:**
```python
upload_result = cloudinary.uploader.upload(
    file_contents,
    folder="book_tracker/notes",
    public_id=unique_id
)
image_url = upload_result['secure_url']
```

### 3. Feed Algorithm
**Current:** Chronological (newest first)  
**Query:** All public notes, sorted by created_at DESC  
**Limit:** 50 posts per load

**Future Enhancement:** Personalized feed with:
- Posts from followed users weighted higher
- Engagement-based ranking
- Topic/genre relevance

### 4. Auto-Refresh Strategy
- **Interval:** 5 minutes (300000ms)
- **Trigger:** Also refreshes on page navigation back to home
- **Rationale:** Balance between freshness and server load

### 5. Privacy for Non-Authenticated Users
**What they see:**
- Post content (text, quote, image)
- Book information
- Timestamp
- "📚 Community Post" header (no user details)

**What they DON'T see:**
- User names and avatars
- Like button / like counts
- Edit functionality
- Any interactive elements

---

## API Endpoints

### GET `/notes/feed`
**Authentication:** Optional (uses `get_current_user_optional`)  
**Response:** Public posts with like counts and user_has_liked flag

### POST `/notes/`
**Request:**
```json
{
  "userbook_id": 123,
  "text": "This book is amazing!",
  "emotion": "😍",
  "quote": "To be or not to be...",
  "page_number": 42,
  "chapter": "Chapter 3",
  "is_public": true
}
```

### POST `/notes/upload-image`
**Content-Type:** multipart/form-data  
**Returns:** Cloudinary secure_url

### PUT `/notes/{note_id}`
**Authorization:** Required (must be post owner)  
**Request:** Updated text, quote, and metadata

### DELETE `/notes/{note_id}`
**Authorization:** Required (must be post owner)

### POST `/notes/{note_id}/like`
### DELETE `/notes/{note_id}/like`

### GET `/follow/following`
**Returns:** List of users current user follows

### POST `/follow/{user_id}`
### DELETE `/follow/{user_id}`

---

## Database Schema

### Note Model
```python
class Note(SQLModel, table=True):
    id: int
    user_id: int  # FK to User
    userbook_id: Optional[int]  # FK to UserBook
    text: Optional[str]
    emotion: Optional[str]  # Emoji
    quote: Optional[str]
    image_url: Optional[str]  # Cloudinary URL
    page_number: Optional[int]
    chapter: Optional[str]
    is_public: bool = True
    created_at: datetime
    updated_at: datetime
```

### Follow Model
```python
class Follow(SQLModel, table=True):
    id: int
    follower_id: int  # User who follows
    followed_id: int  # User being followed
    created_at: datetime
```

### Like Model
```python
class Like(SQLModel, table=True):
    id: int
    user_id: int
    note_id: int
    created_at: datetime
```

---

## UI Features

### Post Composer
- **Text Area:** Main thought/emotion (placeholder: "What are you feeling from your read?")
- **Quote Field:** Optional favorite quote
- **Image Upload:** Cloudinary integration
- **Book Selection:** Link post to specific book in library
- **Height:** 2 rows (reduced for compact UI)

### Individual Post (PulsePost)
- **Avatar:** User initials in gradient circle (if logged in)
- **Username & Header:** "John Doe shared this" (if logged in)
- **Book Info:** Title below username
- **Content:** Text and/or quote in styled blockquote
- **Image:** Full-width responsive image
- **Actions:** Like button with count (if logged in)
- **Edit Button:** Pencil icon (✏️) for post owner only
- **Timestamp:** Relative (e.g., "2 hours ago") or absolute

### Edit Mode
- Inline editing with textareas for text and quote
- Save/Cancel buttons
- Owner validation (403 if not owner)
- Optimistic UI update

### Friends Reading Widget
- Shows books friends are currently reading
- Max 2 visible entries with scroll
- Commented out "Community Highlights" (future feature)

---

## Frontend Patterns

### Optimistic UI Updates
**Like Button:**
```javascript
// Immediately update UI
setLiked(!liked);
setLikes(liked ? likes - 1 : likes + 1);

try {
  await apiFetch(...);  // Confirm with server
} catch {
  // Revert on error
  setLiked(previousLiked);
  setLikes(previousLikes);
}
```

### Image URL Handling
```javascript
// Support both Cloudinary and legacy local URLs
const imageUrl = post.image_url.startsWith('http') 
  ? post.image_url 
  : `${BACKEND}${post.image_url}`;
```

---

## Security & Privacy

✅ **Implemented:**
- Owner-only edit/delete validation
- Public/private post toggle
- Optional authentication for feed viewing
- No user data exposed to non-authenticated users

⚠️ **Future Improvements:**
- Report/flag inappropriate content
- Block users
- Content moderation queue
- Private messaging
- Granular privacy controls (friends-only posts)

---

## Future Enhancements

🔮 **Planned:**
- **Comments:** Threaded discussions on posts
- **Reactions:** Multiple emoji reactions beyond just "like"
- **Bookmarks:** Save posts for later
- **Shares:** Reshare posts to own feed
- **Mentions:** Tag other users in posts
- **Hashtags:** Topic-based discovery
- **Notifications:** New likes, comments, follows
- **Feed Filters:** By book, genre, followed users only
- **Community Highlights:** Trending posts, top readers

---

## Testing Checklist

- [ ] Create post with text only
- [ ] Create post with text + quote
- [ ] Create post with image upload
- [ ] Link post to book in library
- [ ] View post as owner (edit button visible)
- [ ] View post as other user (no edit button)
- [ ] Edit post text and quote
- [ ] Delete post (confirm cascade to likes)
- [ ] Like a post
- [ ] Unlike a post
- [ ] View feed as non-logged-in user (no user details)
- [ ] Follow a user
- [ ] Unfollow a user
- [ ] Auto-refresh after 5 minutes
- [ ] Public vs private post visibility
