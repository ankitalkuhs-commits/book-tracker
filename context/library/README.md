# Book Library Management

**Feature Owner:** Library Module  
**Last Updated:** December 27, 2025

---

## Overview

Personal book library with status tracking, filtering, search, and pagination. Integrates with Google Books API for metadata.

---

## Architecture

### Backend Files
- `app/routers/userbooks_router.py` - Library CRUD operations
- `app/routers/books_router.py` - Book search and details
- `app/routers/googlebooks_router.py` - Google Books integration
- `app/models.py` - Book, UserBook models

### Frontend Files
- `src/pages/LibraryPage.jsx` - Main library view
- `src/components/library/BookCard.jsx` - Individual book display
- `src/components/library/AddBookModal.jsx` - Add books to library
- `src/components/library/BookDetailModal.jsx` - View/edit book details

---

## Key Decisions

### 1. Book Status System
```python
status: 'reading' | 'to-read' | 'finished'
```

**Rationale:** Simple 3-state system covers most reading workflows. Can be extended with 'paused', 'abandoned', etc.

### 2. Dual Ownership Model
- **Book Table:** Shared across all users (deduplication by ISBN/title)
- **UserBook Table:** User-specific metadata (status, rating, notes, current_page)

**Benefit:** Reduces database redundancy, enables social features (see what others read)

### 3. Filter Architecture
```javascript
// Filters: Tab (status) + Format + Ownership + Search
const filteredBooks = library.filter(ub => {
  // Status, format, ownership, and search query filters
});
```

**Chaining:** Multiple filters work together for precise results

### 4. Pagination Strategy
- **Page Size:** Fixed at 6 books per page
- **Smart Ellipsis:** Shows "1 ... 5 6 7 ... 20" for large page counts
- **Reset on Filter:** Page resets to 1 when filters change

### 5. Book Formats
Supported formats:
- hardcover, paperback, ebook, kindle, pdf, audiobook

**Rationale:** Covers most common reading formats, allows filtering by preferred format

---

## API Endpoints

### GET `/userbooks/`
**Description:** Get current user's library  
**Response:** Array of UserBook objects with nested Book data

### POST `/userbooks/`
**Request:**
```json
{
  "book_id": 123,
  "status": "reading",
  "format": "paperback",
  "ownership_status": "owned"
}
```

### PATCH `/userbooks/{id}`
**Request:** Partial update (status, current_page, rating, notes, etc.)

### DELETE `/userbooks/{id}`
**Description:** Remove book from library (cascades to notes)

### GET `/googlebooks/search?q={query}`
**Description:** Search Google Books API for book metadata

---

## Database Schema

### UserBook Model
```python
class UserBook(SQLModel, table=True):
    id: int
    user_id: int  # FK to User
    book_id: int  # FK to Book
    status: str  # 'reading' | 'to-read' | 'finished'
    current_page: int = 0
    rating: Optional[int] = None  # 1-5 stars
    private_notes: Optional[str] = None
    format: Optional[str] = None
    ownership_status: Optional[str] = None
    borrowed_from: Optional[str] = None
    loaned_to: Optional[str] = None
    created_at: datetime
    updated_at: datetime
```

---

## UI Features

### Tab Navigation
- **All:** Shows all books
- **Currently Reading:** status='reading'
- **Want to Read:** status='to-read'
- **Finished:** status='finished'

Each tab shows count badge.

### Filter System
1. **Format Filter:** Dropdown with all formats + "All Formats"
2. **Ownership Filter:** owned | borrowed | loaned
3. **Search:** Real-time filter by title or author (case-insensitive)
4. **Clear Filters:** Button appears when any filter is active

### Pagination
- Shows "X-Y of Z books"
- Previous/Next buttons
- Page number buttons with smart ellipsis
- Disabled state for first/last page

### Book Card Actions
- Quick status change dropdown
- "Add Note" button → Opens detail modal
- "⋮" menu → View details, Delete

---

## Common Patterns

### Adding a Book
1. User clicks "+ Add Book"
2. Modal opens with Google Books search
3. User searches and selects book
4. POST `/googlebooks/add` creates Book + UserBook
5. Library reloads to show new book

### Updating Reading Progress
1. User opens book detail modal
2. Updates current_page field
3. PATCH `/userbooks/{id}` with new data
4. UI updates optimistically

### Deleting a Book
1. User clicks delete in menu
2. Confirmation dialog
3. DELETE `/userbooks/{id}`
4. Book removed from local state (optimistic UI)
5. Associated notes are cascaded

---

## Future Enhancements

🔮 **Planned:**
- ISBN barcode scanning for quick book addition
- Bulk import from Goodreads/CSV
- Reading history timeline
- Book recommendations based on library
- Tags/categories for books
- Reading goals (e.g., "Read 50 books this year")
- Library analytics (genres, authors, reading speed)

---

## Testing Checklist

- [ ] Add book via Google Books search
- [ ] Add book manually (custom title/author)
- [ ] Change book status (reading → finished)
- [ ] Update current page and verify progress
- [ ] Filter by format (show only eBooks)
- [ ] Filter by ownership status
- [ ] Search for book by title
- [ ] Search for book by author
- [ ] Pagination with 20+ books
- [ ] Delete book from library
- [ ] Verify notes are deleted with book
