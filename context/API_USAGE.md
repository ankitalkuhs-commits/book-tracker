# API Usage Registry

Every API function in `book-tracker-frontend-stitch/src/services/api.js`, what it calls,
what it returns, and which pages use it.

---

## Auth

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `googleLogin(token)` | POST `/auth/google` | `{ access_token, user }` | LoginPage |
| `demoLogin()` | POST `/auth/demo-login` | `{ access_token, user }` | LoginPage |
| `deleteAccount()` | POST `/auth/delete-account/me` | `{ ok }` | SettingsPage |

---

## Profile

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `getMyProfile()` | GET `/profile/me` | `{ id, name, username, bio, email, profile_picture, yearly_goal, followers_count, following_count, books_count }` | ProfilePage, SettingsPage |
| `updateMyProfile(data)` | PUT `/profile/me` | updated profile object | ProfilePage, SettingsPage |
| `uploadProfilePicture(file)` | POST `/profile/me/picture` (multipart) | `{ profile_picture: url }` | SettingsPage |
| `getPublicProfile(userId)` | GET `/profile/{userId}` | same shape as getMyProfile + `is_following` | UserProfilePage |

---

## Books

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `searchLocalBooks(q)` | GET `/books/search?q=` | `[ { id, title, author, cover_url, ... } ]` | SearchPage |
| `searchGoogleBooks(q)` | GET `/googlebooks/search?query=` | normalized array with `google_books_id, author, isbn` | LibraryPage (AddBookModal), SearchPage, GroupDetailPage |
| `getRecommendations()` | GET `/books/recommendations` | `[ { id, title, author, cover_url, reason } ]` | HomePage |
| `addToLibrary(data)` | POST `/books/add-to-library` | `{ userbook_id, book_id }` | LibraryPage, SearchPage, HomePage |

---

## User Books

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `getMyBooks(status?)` | GET `/userbooks/?status=` | `[ { id, status, current_page, rating, book: {...} } ]` | LibraryPage, ProfilePage, HomePage |
| `getUserBooks(userId)` | GET `/userbooks/user/{userId}` | same array for another user | UserProfilePage |
| `updateUserBook(id, data)` | PATCH `/userbooks/{id}` | `{ status, userbook }` | LibraryPage (status change, rating) |
| `updateProgress(id, page)` | PUT `/userbooks/{id}/progress` | updated userbook | LibraryPage |
| `markFinished(id)` | POST `/userbooks/{id}/finish` | `{ ok, userbook }` | LibraryPage |
| `removeFromLibrary(id)` | DELETE `/userbooks/{id}` | null (204) | LibraryPage |
| `getFriendReading()` | GET `/userbooks/friends/currently-reading` | `[ { user, book, current_page, total_pages } ]` | HomePage (sidebar) |

---

## Notes / Feed

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `getCommunityFeed()` | GET `/notes/feed` | `[ note ]` — all public notes | HomePage |
| `getFriendsFeed()` | GET `/notes/friends-feed` | `[ note ]` — only followed users | HomePage |
| `getMyNotes()` | GET `/notes/me` | `[ note ]` | ProfilePage |
| `getNotesForBook(userbookId)` | GET `/notes/userbook/{id}` | `[ note ]` | LibraryPage (BookDetailPanel) |
| `getUserNotes(userId)` | GET `/notes/user/{userId}` | `[ note ]` | UserProfilePage |
| `createNote(data)` | POST `/notes/` | created note | HomePage (PostComposer), LibraryPage |
| `updateNote(noteId, data)` | PUT `/notes/{noteId}` | updated note | HomePage (PostCard edit) |
| `deleteNote(noteId)` | DELETE `/notes/{noteId}` | null | HomePage (PostCard delete), LibraryPage, ProfilePage |

**Note object shape:**
```json
{
  "id", "text", "quote", "image_url", "emotion", "page_number",
  "is_public", "created_at", "updated_at",
  "user": { "id", "name", "profile_picture" },
  "book": { "id", "title", "author", "cover_url" },
  "likes_count", "comments_count", "liked_by_me"
}
```

---

## Likes & Comments

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `likeNote(noteId)` | POST `/notes/{noteId}/like` | `{ liked: true }` | HomePage |
| `unlikeNote(noteId)` | DELETE `/notes/{noteId}/like` | null | HomePage |
| `getComments(noteId)` | GET `/notes/{noteId}/comments` | `[ { id, text, user, created_at } ]` | HomePage |
| `addComment(noteId, text)` | POST `/notes/{noteId}/comments` | created comment | HomePage |

---

## Follow

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `followUser(userId)` | POST `/follow/{userId}` | `{ following: true }` | UserProfilePage |
| `unfollowUser(userId)` | DELETE `/follow/{userId}` | null | UserProfilePage |
| `getFollowers()` | GET `/follow/followers` | `[ { id, name, username, profile_picture } ]` | (not currently used in any page) |
| `getFollowing()` | GET `/users/following` | `[ { id, name, username, profile_picture } ]` | HomePage (sidebar), ProfilePage |

---

## Users

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `searchUsers(q)` | GET `/users/search?q=` | `[ { id, name, username, profile_picture } ]` | HomePage (sidebar), GroupDetailPage, CreateGroupPage |
| `getUserStats(userId)` | GET `/users/{userId}/stats` | `{ books_finished, pages_read, ... }` | UserProfilePage |
| `searchUsersForInvite(q)` | GET `/users/search?q=` | same as searchUsers (alias) | GroupDetailPage, CreateGroupPage |

---

## Reading Activity

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `getMyActivity(days?)` | GET `/reading-activity/daily?days=N` → unwraps `.data` | `[ { date, pages_read, current_page } ]` | LibraryPage (sidebar chart), ProfilePage |
| `getUserActivity(userId, days?)` | GET `/reading-activity/user/{userId}/daily?days=N` → unwraps `.data` | same array | UserProfilePage |
| `getReadingInsights()` | GET `/reading-activity/insights` | `{ total_books, finished, pages_read, avg_rating, streak, longest_streak, yearly_goal, books_this_year, monthly_breakdown, projected_books }` | InsightsPage, ProfilePage |

---

## Notifications

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `getUnreadCount()` | GET `/notifications/unread-count` | `{ count: N }` | Nav (bell badge) |
| `getNotifications()` | GET `/notifications/history` | `[ { id, event_type, title, body, is_read, sent_at, actor_id } ]` | NotificationsPage |
| `markAllNotificationsRead()` | POST `/notifications/mark-read` | `{ ok }` | NotificationsPage |
| `getVapidPublicKey()` | GET `/notifications/vapid-public-key` | `{ public_key }` | (push subscription setup — not yet wired in UI) |
| `webSubscribe(subscription, deviceInfo)` | POST `/notifications/web-subscribe` | `{ ok }` | (not yet wired in UI) |

---

## Groups

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `getMyGroups()` | GET `/groups/my` | `[ group ]` | GroupsPage |
| `discoverGroups(q?)` | GET `/groups/discover?q=` | `[ group ]` | GroupsPage |
| `getGroup(id)` | GET `/groups/{id}` | full group object with `membership_role`, `membership_status` | GroupDetailPage |
| `createGroup(data)` | POST `/groups/` | created group | CreateGroupPage |
| `updateGroup(id, data)` | PUT `/groups/{id}` | updated group | GroupDetailPage (edit modal) |
| `deleteGroup(id)` | DELETE `/groups/{id}` | null | GroupDetailPage |
| `joinGroup(id)` | POST `/groups/{id}/join` | `{ status: 'active'/'pending' }` | GroupsPage |
| `leaveGroup(id)` | DELETE `/groups/{id}/leave` | null | GroupDetailPage |
| `getGroupMembers(id)` | GET `/groups/{id}/members` | `[ { user_id, name, role, status } ]` | GroupDetailPage |
| `getPendingMembers(id)` | GET `/groups/{id}/pending` | `[ { user_id, name } ]` | GroupDetailPage (curator) |
| `approveGroupMember(id, userId)` | POST `/groups/{id}/approve/{userId}` | `{ ok }` | GroupDetailPage |
| `rejectGroupMember(id, userId)` | POST `/groups/{id}/reject/{userId}` | `{ ok }` | GroupDetailPage |
| `removeGroupMember(id, userId)` | DELETE `/groups/{id}/remove/{userId}` | null | GroupDetailPage |
| `inviteToGroup(id, userId)` | POST `/groups/{id}/invite/{userId}` | `{ ok }` | GroupDetailPage |
| `joinByInviteCode(code)` | POST `/groups/join/{code}` | `{ status }` | JoinGroupPage |
| `acceptGroupInvite(id)` | POST `/groups/{id}/accept` | `{ ok }` | GroupsPage |
| `declineGroupInvite(id)` | DELETE `/groups/{id}/decline` | null | GroupsPage |
| `getGroupPosts(id)` | GET `/groups/{id}/posts` | `[ { id, text, quote, user, created_at } ]` | GroupDetailPage |
| `createGroupPost(id, data)` | POST `/groups/{id}/posts` | created post | GroupDetailPage |
| `deleteGroupPost(id, postId)` | DELETE `/groups/{id}/posts/{postId}` | null | GroupDetailPage |
| `getGroupLeaderboard(id, period?)` | GET `/groups/{id}/leaderboard?period=` | `[ { rank, user_id, name, pages_read, books_finished, current_book } ]` | GroupDetailPage |
| `getGroupGoal(id)` | GET `/groups/{id}/goal` | `{ goal_pages, goal_period, pages_read, pct }` | GroupDetailPage |
| `setGroupBook(id, book)` | PUT `/groups/{id}/book` | `{ id, title, author, cover_url }` | GroupDetailPage |
| `clearGroupBook(id)` | DELETE `/groups/{id}/book` | null (204) | GroupDetailPage |
| `getMyGroupInvites()` | GET `/groups/invites/pending` | `[ group + invited_by_name ]` | GroupsPage |
| `apiFetch('/groups/{id}/activity')` | GET `/groups/{id}/activity` | `[ { id, event_type, payload, created_at, user } ]` | GroupDetailPage |

**Group object shape:**
```json
{
  "id", "name", "description", "is_private", "invite_code",
  "cover_preset", "member_count", "membership_role", "membership_status",
  "current_book": { "id", "title", "author", "cover_url" },
  "goal": { "goal_pages", "goal_period", "pct" }
}
```

---

## Admin

| Function | Method + Endpoint | Returns | Used In |
|---|---|---|---|
| `getAdminStats()` | GET `/admin/stats` | `{ total_users, total_books, total_notes, ... }` | AdminPage |
| `getAdminUsers()` | GET `/admin/users` | `[ { id, name, email, is_admin, created_at } ]` | AdminPage |
| `setAdminRole(userId)` | POST `/admin/set-admin/{userId}` | `{ ok }` | AdminPage |
| `sendTestPush(userId)` | POST `/admin/push/test/{userId}` | `{ ok }` | AdminPage |
| `broadcastPush(data)` | POST `/admin/push/broadcast` | `{ sent }` | AdminPage |
| `triggerBot()` | POST `/admin/bot/trigger` | `{ ok }` | AdminPage |

---

## Known Issues / Gaps

| API Function | Issue |
|---|---|
| `getFollowers()` | Defined but not used anywhere in the UI |
| `getVapidPublicKey()` | Defined but push permission flow not wired in UI |
| `webSubscribe()` | Defined but push subscription not wired in UI |
| `getUserStats()` | Called in UserProfilePage but return shape should be verified |
| `updateNote()` | Only supports `text` field in current frontend edit form — quote/emotion not editable |
