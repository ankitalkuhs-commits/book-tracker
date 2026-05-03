# Library Feature

**Last Updated:** May 3, 2026

---

## Overview

Manages the user's personal book library: searching Google Books, adding books, tracking reading status and progress, format/ownership metadata, and reading activity logging.

---

## Key Files

### Backend
| File | Purpose |
|---|---|
| `app/routers/books_router.py` | Book search, add-to-library, recommendations |
| `app/routers/userbooks_router.py` | User library CRUD, progress updates, status changes |
| `app/routers/googlebooks_router.py` | Google Books API proxy, `normalize_google_cover_url()` |
| `app/routers/import_router.py` | Goodreads CSV import (`POST /import/goodreads`) |

### Web
| File | Purpose |
|---|---|
| `src/pages/LibraryPage.jsx` | Book grid, status filter tabs, Add Book modal (inline with header tab row) |
| `src/pages/BookDetailPage.jsx` | `/library/book/:userbookId` — survives refresh, optimistic progress bar |

### Mobile
| File | Purpose |
|---|---|
| `src/screens/LibraryScreen.js` | Book grid, status filter tabs, Add Book button in header tab row |
| `src/screens/BookDetailScreen.js` | Optimistic status updates, unknown-pages TextInput modal, progress |
| `src/screens/BookPreviewScreen.js` | Search result preview — "Add to Library" or "View in My Library" |

---

## API Endpoints

### Books
```
POST /books/add-to-library    Add a Google Books result; dedupes by ISBN; fires book_added notification
GET  /books/search            Search local catalog by title/author
GET  /books/recommendations   Personalised recs (friends reading, friends loved, author affinity)
GET  /books/{id}              Single book
```

### User Library
```
GET    /userbooks/                   All userbooks for current user (with embedded book data)
POST   /userbooks/                   Add existing book_id to library
GET    /userbooks/{id}               Single userbook
PATCH  /userbooks/{id}               Update status/page/rating/format/ownership; accepts total_pages → updates Book
DELETE /userbooks/{id}               Remove from library
PUT    /userbooks/{id}/progress      Update current_page; auto-sets status; logs ReadingActivity
POST   /userbooks/{id}/finish        Mark finished; fires book_completed notification
GET    /userbooks/user/{userId}      Another user's library (respects is_private_profile)
GET    /userbooks/friends/currently-reading  Books friends are reading (mutual follow highlighted)
```

### Goodreads Import
```
POST /import/goodreads    Multipart CSV upload; maps Goodreads statuses to reading/to-read/finished
```

---

## Status Values

Three values only — backend, mobile, and web must all use exactly these strings:

| Value | Meaning |
|---|---|
| `to-read` | Want to read / Wishlist |
| `reading` | Currently reading |
| `finished` | Completed |

Status auto-updates when progress is logged:
- `current_page == 0` → `to-read`
- `0 < current_page < total_pages` → `reading`
- `current_page >= total_pages` → `finished` (fires `book_completed` notification)

---

## Book Format Options

`format` field on `UserBook`:  
`hardcover` · `paperback` · `ebook` · `kindle` · `pdf` · `audiobook`

## Ownership Status Options

`ownership_status` field on `UserBook`:  
`owned` · `borrowed` · `loaned`

When `borrowed`: `borrowed_from` (text, person's name) is set.  
When `loaned`: `loaned_to` (text, person's name) is set.

---

## Progress & Reading Activity

Every call to `PUT /userbooks/{id}/progress` with `new_page > old_page`:
- Calculates `pages_read = new_page - old_page`
- Upserts a `ReadingActivity` row for today (one row per userbook per day)
- Auto-updates status
- Fires `book_completed` + `book_finished` group activity if newly finished
- Fires `milestone_reached` group activity at 25%, 50%, 75%

---

## Recommendations Logic (`GET /books/recommendations`)

Three signals, in priority order:
1. **Friends reading** (score 3) — books with `status=reading` from followed users; returns `friend_name`
2. **Friends loved** (score 4) — books finished with `rating >= 4` from followed users; returns `friend_name`
3. **Author affinity** (score 2) — other books by authors the user has read (up to 5 authors)

Response includes `reason` (`friends_reading` | `friends_loved` | `author_affinity`) and `friend_name` (first name, or null).

---

## Web: BookDetailPage

- Route: `/library/book/:userbookId`
- Survives hard refresh: fetches full `GET /userbooks/` list and finds the matching entry by ID (no direct `GET /userbooks/{id}` needed on load)
- Optimistic progress bar: updates UI immediately, reverts on API error

## Mobile: BookDetailScreen

- Optimistic status changes (immediate UI update, revert on error)
- "Unknown pages" modal: uses `TextInput` inside a modal (NOT `Alert.prompt` — broken on Android)
- Max-page validation: warns if `current_page > total_pages` before submitting
- Absolute timestamps on notes (not relative)

---

## Add Book Flow

Both platforms search Google Books via the app backend proxy:

```
GET /googlebooks/search?q={query}
→ User taps result → BookPreviewScreen (mobile) / inline modal (web)
→ POST /books/add-to-library  (dedupes by ISBN, creates Book if new, creates UserBook)
→ Fires book_added notification to followers
```

Error on duplicate: `"This book is already in your library in the '{tab}' tab."`

---

## Private Profile Enforcement

`GET /userbooks/user/{userId}` enforces `is_private_profile`:
- If target user is private and requester does not follow them → 403

---

## Amazon Affiliate Links

Shown on BookDetail for purchasing:
- India (`.in` timezone): `amazon.in` with tag `trackmyread-21`
- Global: `amazon.com` with tag `trackmyread-20`
- Timezone detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`
