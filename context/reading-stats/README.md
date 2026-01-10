# Reading Statistics Context

**Feature Owner:** Analytics & Stats  
**Last Updated:** January 10, 2026

---

## Overview
Tracks and displays reading statistics, progress analytics, notes/highlights, and reading insights.

---

## Files in This Feature

### Backend
- `app/routers/notes_router.py` - Notes and highlights system
- `app/models.py` - Notes model definition

### Frontend
- `book-tracker-frontend/src/components/library/ReadingStatsTable.jsx` - Statistics table
- `book-tracker-frontend/src/components/library/WeeklyPulseChart.jsx` - Visual analytics
- `book-tracker-frontend/src/components/bookpulse/WeeklyPulse.jsx` - Weekly reading summary

### Database Tables
- `notes` - User notes and highlights with page references
- `userbooks` - Reading progress and completion data

---

## Key Design Decisions

### 1. Notes with Page References
**Decision:** Store notes tied to specific pages/locations  
**Why:**
- Easy to reference while reading
- Can display in context
- Useful for studying/reviewing
- Matches physical book experience

**Implementation:**
- `page_number` field for location
- `note_text` for content
- Optional `highlight_text` for quotes
- Links to specific book via `book_id`

### 2. Reading Progress Tracking
**Decision:** Track both page-based and percentage progress  
**Why:**
- Physical books use pages
- Ebooks use percentages
- Both provide insights
- Can calculate reading speed

**Fields:**
- `current_page` & `total_pages`
- Auto-calculate percentage
- Track `started_at` and `completed_at` timestamps

### 3. Statistics Calculation
**Decision:** Calculate stats on-demand (not stored)  
**Why:**
- Always accurate
- No sync issues
- Database is source of truth
- Can add new metrics easily

**Calculated Metrics:**
- Books read (count where status=completed)
- Currently reading (status=reading)
- Average pages per book
- Reading velocity (pages/day)
- Completion rate

### 4. Notes Privacy
**Decision:** Notes are always private by default  
**Why:**
- Personal thoughts and insights
- May contain spoilers
- Study material
- Optional sharing can be added later

### 5. Weekly Pulse Analytics
**Decision:** Week-based reading summaries  
**Why:**
- Manageable time frame
- Encourages consistency
- Easy to visualize
- Aligns with habit tracking

---

## API Endpoints

### Notes

#### POST `/notes/`
Create new note or highlight
```json
{
  "book_id": 1,
  "page_number": 42,
  "note_text": "Interesting insight about...",
  "highlight_text": "Actual quote from book",
  "note_type": "note"  // or "highlight", "bookmark"
}
```

#### GET `/notes/?book_id={book_id}`
Get all notes for a specific book (authenticated)

#### GET `/notes/{note_id}`
Get specific note

#### PUT `/notes/{note_id}`
Update existing note

#### DELETE `/notes/{note_id}`
Delete note (soft delete)

### Statistics (Computed)

#### GET `/stats/reading`
Get reading statistics for current user
```json
{
  "total_books": 47,
  "books_reading": 3,
  "books_completed": 42,
  "books_wishlist": 15,
  "total_pages_read": 12450,
  "avg_pages_per_book": 297,
  "completion_rate": 0.89
}
```

#### GET `/stats/weekly`
Get weekly reading progress
```json
{
  "week_of": "2026-01-05",
  "pages_read": 350,
  "books_started": 2,
  "books_finished": 1,
  "notes_created": 8
}
```

---

## Database Schema

### notes table
```sql
CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    page_number INTEGER,
    note_text TEXT,
    highlight_text TEXT,
    note_type TEXT,  -- note, highlight, bookmark
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (book_id) REFERENCES books(id)
);
```

### Relevant userbooks fields
```sql
current_page INTEGER,
total_pages INTEGER,
started_at TIMESTAMP,
completed_at TIMESTAMP,
rating INTEGER
```

---

## Statistics Calculations

### Books Read
```python
books_read = userbooks.filter(status="completed").count()
```

### Reading Velocity
```python
def calculate_reading_velocity(user_id):
    recent_books = get_recently_completed_books(user_id, days=30)
    total_pages = sum(book.total_pages for book in recent_books)
    days_reading = (recent_books[-1].completed_at - recent_books[0].started_at).days
    return total_pages / days_reading if days_reading > 0 else 0
```

### Completion Rate
```python
started = userbooks.filter(status__in=["reading", "completed", "did_not_finish"]).count()
completed = userbooks.filter(status="completed").count()
completion_rate = completed / started if started > 0 else 0
```

### Weekly Progress
```python
def get_weekly_stats(user_id, week_start):
    week_end = week_start + timedelta(days=7)
    
    pages_read = sum_page_progress_in_range(user_id, week_start, week_end)
    books_started = count_books_started_in_range(user_id, week_start, week_end)
    books_finished = count_books_completed_in_range(user_id, week_start, week_end)
    
    return {
        "pages_read": pages_read,
        "books_started": books_started,
        "books_finished": books_finished
    }
```

---

## Frontend Visualization

### ReadingStatsTable.jsx
Displays tabular statistics:
- Total books by status
- Total pages read
- Average rating
- Reading streaks
- Monthly/yearly totals

### WeeklyPulseChart.jsx
Visual chart showing:
- Pages read per day (bar chart)
- Reading consistency (heatmap)
- Progress over time (line graph)
- Books completed timeline

---

## Notes Features

### Note Types
1. **Text Note** - Free-form thoughts
2. **Highlight** - Quoted passages
3. **Bookmark** - Page marker only

### Note Organization
- Sorted by page number
- Filterable by book
- Searchable by content
- Exportable (future)

### Common Use Cases
- Study notes
- Favorite quotes
- Discussion points
- Book club talking points
- Review material

---

## File Attachments

### Current Implementation
- `uploads/notes/` directory
- Image attachments supported
- Reference stored in `note_attachment` field

### Supported Types
- Images (jpg, png)
- PDFs (future)
- Audio notes (future)

---

## Future Enhancements

### Short Term
- [ ] Reading goals (pages/day, books/month)
- [ ] Streak tracking (consecutive reading days)
- [ ] Genre-based statistics
- [ ] Reading time estimates
- [ ] Export notes to PDF/Markdown

### Long Term
- [ ] AI-generated reading insights
- [ ] Reading pattern analysis
- [ ] Book recommendation based on stats
- [ ] Comparison with other readers
- [ ] Reading challenges/achievements

### Advanced Analytics
- [ ] Reading speed by genre
- [ ] Completion time predictions
- [ ] Optimal reading times
- [ ] Comprehension tracking
- [ ] Vocabulary growth

---

## Performance Optimization

### Indexes for Stats Queries
```sql
CREATE INDEX idx_userbooks_user_status ON userbooks(user_id, status);
CREATE INDEX idx_userbooks_completed ON userbooks(user_id, completed_at);
CREATE INDEX idx_notes_user_book ON notes(user_id, book_id);
```

### Caching Strategy
- Cache calculated stats for 1 hour
- Invalidate on book status change
- Pre-calculate weekly stats
- Use materialized views for heavy queries

---

## Data Export

### Export Formats (Planned)
- **CSV** - For spreadsheet analysis
- **JSON** - For backup/migration
- **Markdown** - For notes/highlights
- **PDF** - For printing/sharing

### What to Export
- Reading list with metadata
- All notes and highlights
- Statistics summary
- Reading timeline

---

## Troubleshooting

### Notes not saving
- Check user is authenticated
- Verify book_id exists
- Ensure file upload permissions (if attachment)
- Check note_text is not empty

### Statistics showing 0
- Verify userbooks entries exist
- Check status values are correct
- Ensure completed_at dates are set
- Validate SQL query filters

### Chart not rendering
- Check data format matches chart library
- Verify dates are valid
- Ensure no null values
- Check browser console for errors

---

## Privacy Considerations

### What's Always Private
- All notes and highlights
- Reading progress details
- Time spent reading
- Detailed statistics

### What Can Be Shared (Future)
- Total books read count
- Favorite quotes (opted in)
- Reading goals progress
- General statistics

---

## Related Context

- See [../library/README.md](../library/README.md) for book tracking
- See [../community/README.md](../community/README.md) for sharing stats
- See [../PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) for data architecture
