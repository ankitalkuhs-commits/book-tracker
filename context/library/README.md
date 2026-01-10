# Library Management Context

**Feature Owner:** Library & Books  
**Last Updated:** January 10, 2026

---

## Overview
Manages book catalog, user reading lists, book search, and reading status tracking.

---

## Files in This Feature

### Backend
- `app/routers/books_router.py` - Book catalog CRUD operations
- `app/routers/userbooks_router.py` - User's reading list and status
- `app/routers/googlebooks_router.py` - External book search integration
- `app/models.py` - Book and UserBook models

### Frontend
- `book-tracker-frontend/src/pages/LibraryPage.jsx` - Main library view
- `book-tracker-frontend/src/components/library/BookCard.jsx` - Book display card
- `book-tracker-frontend/src/components/library/AddBookModal.jsx` - Add book UI
- `book-tracker-frontend/src/components/library/BookDetailModal.jsx` - Book details
- `book-tracker-frontend/src/components/AddBook.jsx` - Legacy add book form
- `book-tracker-frontend/src/components/BookList.jsx` - Legacy book list

### Database Tables
- `books` - Master book catalog
- `userbooks` - User reading status and progress
- `book_ownership` - Tracking physical/ebook ownership

---

## Key Design Decisions

### 1. Separate Book Catalog from User Books
**Decision:** Split `books` and `userbooks` tables  
**Why:**
- One book can be read by many users
- Avoids duplicating book metadata
- Easier to share books between users
- Cleaner data model

**Implementation:**
- `books` table: title, author, ISBN, cover, description (shared)
- `userbooks` table: user_id, book_id, status, progress (personal)

### 2. Reading Status Options
**Decision:** Fixed set of statuses  
**Options:**
- `want_to_read` - Wishlist/planned
- `reading` - Currently reading
- `completed` - Finished
- `did_not_finish` - Started but didn't finish

**Why:**
- Clear user intent
- Easy filtering and statistics
- Matches common reading apps (Goodreads pattern)

### 3. Google Books Integration
**Decision:** Use Google Books API for search  
**Why:**
- Comprehensive book database
- Free tier available
- Rich metadata (covers, descriptions, ISBNs)
- Reduces manual data entry

**Implementation:**
- Search endpoint proxies to Google Books
- Parse and normalize response
- Store selected books in local database

### 4. Book Format Tracking
**Decision:** Track physical, ebook, audiobook separately  
**Why:**
- Users often own multiple formats
- Affects reading experience
- Useful for collection statistics

**Fields:**
- `format` - physical/ebook/audiobook
- `owns_physical`, `owns_ebook`, `owns_audiobook` booleans

### 5. Progress Tracking
**Decision:** Store page number and percentage  
**Why:**
- Page numbers for physical books
- Percentage for ebooks/audiobooks
- Both provide different insights

**Fields:**
- `current_page` - For physical books
- `total_pages` - Total book length
- Auto-calculate percentage when updated

---

## API Endpoints

### Books Catalog

#### GET `/books/`
List all books in catalog (paginated)

#### GET `/books/{book_id}`
Get specific book details

#### POST `/books/`
Add book to catalog (authenticated)
```json
{
  "title": "string",
  "author": "string",
  "isbn": "string",
  "cover_image": "url",
  "description": "text"
}
```

### User Books

#### GET `/userbooks/`
Get current user's reading list with status filter
```
Query params: ?status=reading
```

#### POST `/userbooks/`
Add book to user's library
```json
{
  "book_id": 1,
  "status": "want_to_read",
  "format": "physical"
}
```

#### PUT `/userbooks/{userbook_id}`
Update reading status or progress
```json
{
  "status": "reading",
  "current_page": 150,
  "total_pages": 400
}
```

#### DELETE `/userbooks/{userbook_id}`
Remove book from user's library

### Google Books Search

#### GET `/googlebooks/search?q={query}`
Search Google Books API
Returns: Array of book objects with metadata

---

## Database Schema

### books table
```sql
CREATE TABLE books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT,
    isbn TEXT UNIQUE,
    cover_image TEXT,
    description TEXT,
    published_date TEXT,
    page_count INTEGER,
    google_books_id TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### userbooks table
```sql
CREATE TABLE userbooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    format TEXT,
    current_page INTEGER,
    total_pages INTEGER,
    rating INTEGER,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (book_id) REFERENCES books(id),
    UNIQUE(user_id, book_id)
);
```

---

## Common Workflows

### Adding a Book to Library
1. User searches via Google Books
2. Frontend displays results
3. User selects book
4. Check if book exists in local catalog (by ISBN)
5. If not, create book entry
6. Create userbook entry linking user to book
7. Set initial status (e.g., want_to_read)

### Updating Reading Progress
1. User opens book detail
2. Updates current page / percentage
3. PUT to `/userbooks/{id}`
4. Backend updates progress
5. Auto-update status if reaching 100%

### Filtering Library
1. Frontend requests `/userbooks/?status=reading`
2. Backend filters by status
3. Joins with books table for metadata
4. Returns enriched list

---

## Frontend State Management

### Library Page State
```javascript
const [books, setBooks] = useState([]);
const [filter, setFilter] = useState('all');
const [loading, setLoading] = useState(true);
```

### Book Card Actions
- View details → Open modal
- Update status → Dropdown menu
- Update progress → Progress bar click
- Delete → Confirmation then API call

---

## Statistics & Analytics

### Reading Stats Calculated
- Total books read
- Currently reading count
- Books by status
- Average pages per book
- Reading completion rate
- Books read per month

**Related:** See [../reading-stats/README.md](../reading-stats/README.md)

---

## Google Books API Integration

### API Key Setup
```bash
# Environment variable
GOOGLE_BOOKS_API_KEY=your_api_key_here
```

### Search Query Format
```
GET https://www.googleapis.com/books/v1/volumes?q={query}&key={api_key}
```

### Response Parsing
Extract:
- `volumeInfo.title`
- `volumeInfo.authors[0]`
- `volumeInfo.imageLinks.thumbnail`
- `volumeInfo.description`
- `volumeInfo.industryIdentifiers` (ISBN)

### Rate Limits
- Free tier: 1000 requests/day
- Implement caching to reduce calls
- Store frequently searched books locally

---

## Future Enhancements

### Short Term
- [ ] Book series tracking
- [ ] Reading goals (books per year)
- [ ] Book recommendations based on library
- [ ] Import from Goodreads CSV
- [ ] Bulk status updates

### Long Term
- [ ] AI-powered book suggestions
- [ ] Library sharing with friends
- [ ] Reading challenges
- [ ] Book club features
- [ ] ISBN barcode scanner

---

## Troubleshooting

### Book duplicates in catalog
- Check ISBN matching logic
- Ensure unique constraint on ISBN
- Normalize ISBN-10 vs ISBN-13

### Google Books search not working
- Verify API key is valid
- Check rate limits
- Ensure CORS proxy working
- Test direct API call

### Progress not updating
- Verify userbook_id in request
- Check user owns this book
- Ensure total_pages is set
- Validate current_page <= total_pages

---

## Related Context

- See [../PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) for database design
- See [../reading-stats/README.md](../reading-stats/README.md) for analytics
- See [../community/README.md](../community/README.md) for sharing books
