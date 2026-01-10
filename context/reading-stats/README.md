# Reading Analytics & Statistics

**Feature Owner:** Analytics Module  
**Last Updated:** December 27, 2025

---

## Overview

Personal reading statistics dashboard showing books read, pages tracked, and emotional engagement with readings.

---

## Architecture

### Backend Files
- `app/routers/notes_router.py` - GET `/notes/me` for emotions count
- `app/routers/userbooks_router.py` - Library data for stats calculation
- `app/models.py` - UserBook, Note models

### Frontend Files
- `src/components/library/ReadingStatsTable.jsx` - Main statistics widget
- `src/components/library/WeeklyPulseChart.jsx` - (Commented out) Activity chart

---

## Key Decisions

### 1. Stats Calculation Strategy
**Client-Side Computation:**
- Receives raw library data from API
- Calculates stats in browser (reduces server load)
- Real-time updates when library changes

**Rationale:** Stats are derived from existing data, no need for separate endpoints

### 2. Metrics Tracked
```javascript
{
  booksThisYear: 0,      // Books added in current year
  currentlyReading: 0,   // status === 'reading'
  booksFinished: 0,      // status === 'finished'
  pagesRead: 0,          // Sum of current_page across all books
  emotionsLogged: 0      // Count of notes/posts from API
}
```

### 3. Emotions Logged Evolution
**v1 (Broken):**
```javascript
const emotionsLogged = Math.floor(Math.random() * 200);  // ❌ Random!
```

**v2 (Current):**
```javascript
const notes = await apiFetch('/notes/me');
const emotionsLogged = notes.length;  // ✅ Actual count
```

**Fixed Issue:** Random number changed on every render, causing confusion

### 4. Books This Year Logic
```javascript
const currentYear = new Date().getFullYear();
const booksThisYear = library.filter(ub => {
  const createdYear = new Date(ub.created_at).getFullYear();
  return createdYear === currentYear;
}).length;
```

**Rationale:** Tracks books added to library in current calendar year, not reading completion year

---

## API Endpoints

### GET `/notes/me`
**Description:** Get all notes created by current user  
**Used For:** Emotions Logged count  
**Response:** Array of Note objects

### GET `/userbooks/`
**Description:** Get user's library  
**Used For:** All other statistics calculations  
**Response:** Array of UserBook objects

---

## UI Display

### Stats Grid (5 Cards)
1. **Books This Year** 📚
   - Count of books added in current year
   - Icon: Book emoji

2. **Currently Reading** 📖
   - Count of books with status='reading'
   - Icon: Open book emoji

3. **Books Finished** ✅
   - Count of books with status='finished'
   - Icon: Checkmark emoji

4. **Pages Read** 📄
   - Sum of current_page across all books
   - Formatted with commas (e.g., "1,234")
   - Icon: Page emoji

5. **Emotions Logged** 💭
   - Count of posts/notes created
   - Icon: Thought bubble emoji

### Additional Insights
- **Avg. Pages/Book:** `pagesRead / booksFinished`
- **Reading Streak:** Hardcoded "7 days 🔥" (future implementation)

---

## CSS Styling

### Stats Grid
```css
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}
```

### Individual Stat Card
```css
.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1.5rem;
  border-radius: 12px;
  text-align: center;
}
```

---

## Future Enhancements

🔮 **Planned:**

### 1. Weekly Pulse Chart
- Activity heatmap (like GitHub contributions)
- Shows reading sessions per day
- Color intensity = pages read that day

### 2. Reading Streak Tracking
- Consecutive days with reading activity
- Longest streak vs current streak
- Gamification with badges

### 3. Advanced Metrics
- **Average Reading Speed:** Pages per day
- **Genre Breakdown:** Pie chart of genres read
- **Author Diversity:** Unique authors read
- **Reading Goals:** Progress toward annual goal
- **Monthly/Yearly Trends:** Line chart over time

### 4. Social Comparisons
- Rank among friends
- Reading challenges and leaderboards
- Community average comparisons

### 5. Time-Based Analytics
- Reading sessions duration
- Preferred reading times
- Time to complete book (start → finish)

---

## Data Accuracy Considerations

### Current Limitations
1. **Pages Read:** Only counts current_page, not total pages in finished books
2. **Books This Year:** Based on when added to library, not when read
3. **Reading Streak:** Not yet implemented (hardcoded placeholder)

### Improvement Ideas
1. Track `total_pages` in Book model
2. Add `started_at` and `finished_at` to UserBook
3. Store reading sessions with timestamps
4. Calculate actual reading speed and time

---

## Testing Checklist

- [ ] Stats update when adding new book
- [ ] Stats update when changing book status
- [ ] Stats update when updating current_page
- [ ] Emotions Logged matches actual notes count
- [ ] Books This Year only counts current year
- [ ] Avg. Pages/Book calculation correct
- [ ] Stats render correctly with 0 books
- [ ] Large numbers formatted with commas
- [ ] Stats responsive on mobile devices
