# Reading Stats Feature

**Last Updated:** May 3, 2026

---

## Overview

Insights and analytics for a user's reading habits: pages-per-day bar charts, 30-day activity heatmap, yearly goal ring, reading velocity, and streak tracking. Data is sourced from the `reading_activity` table which is populated on every progress update.

---

## Key Files

### Backend
| File | Purpose |
|---|---|
| `app/routers/userbooks_router.py` | `PUT /userbooks/{id}/progress` — writes `ReadingActivity` rows |
| `app/routers/profile_router.py` | `GET /profile/{userId}` — returns `stats` object (separately from profile) |

### Web
| File | Purpose |
|---|---|
| `src/pages/InsightsPage.jsx` | Charts, stats, yearly goal ring |

### Mobile
| File | Purpose |
|---|---|
| `src/screens/InsightsScreen.js` | GoalRing (pure View, not SVG), BarChart (30-day activity), stats cards |

---

## Data Model

### `reading_activity` table
One row per user per userbook per day. Created/updated by `PUT /userbooks/{id}/progress` when `new_page > old_page`.

| Field | Type | Notes |
|---|---|---|
| `user_id` | int | FK → user |
| `userbook_id` | int | FK → userbook |
| `date` | timestamp | Truncated to midnight UTC |
| `pages_read` | int | Delta pages for this day (accumulated) |
| `current_page` | int | Absolute page at last update |

### Stats Object (from `GET /profile/{userId}`)

```json
{
  "stats": {
    "finished": 12,
    "reading": 2,
    "in_library": 30
  }
}
```

**CRITICAL:** Use `stats.finished` (not `stats.finished_books`). Use `stats.in_library` (not `stats.total`).

---

## Insights Screen / Page

### Yearly Goal Ring

- User sets `yearly_goal` (books per year) in profile settings
- `InsightsScreen`: GoalRing is built with pure `View` elements (NOT `react-native-svg`) to avoid SVG rendering issues on New Architecture
- Displays: books finished this year / goal, percentage arc

### 30-Day Activity Chart

- Reads `reading_activity` for the last 30 days
- Bar chart showing pages read per day
- Empty days show as zero bars (not gaps)

### Stats Cards

- "Finished" — count of `status=finished` userbooks
- "Reading" — count of `status=reading` userbooks
- "To Read" — count of `status=to-read` userbooks
- Reading velocity — pages per day based on recent activity

---

## API Endpoints Used

```
GET /profile/me                      Own profile (includes yearly_goal)
GET /userbooks/                      Full library (to count by status)
GET /reading-activity/stats          30-day activity data for charts
```

---

## Group Leaderboard (part of Groups feature)

Group leaderboard is powered by `reading_activity`. See [community/README.md](../community/README.md) for details.

- Sums `pages_read` per user within the group for the current period
- `GET /groups/{id}/leaderboard`

---

## Known Gotchas

- **GoalRing must use pure View** — SVG ring was replaced because `react-native-svg 15.8.0` breaks New Architecture builds; `15.15.4` is the pinned safe version but the ring uses Views to be safe
- **`stats.finished` not `stats.finished_books`** — the stats object uses `finished`, not `finished_books`; using the wrong key silently shows 0
