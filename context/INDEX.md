# Book Tracker - Context Index

**Last Updated:** May 2, 2026

## Overview
This index maps all context files for the Book Tracker project. Use this as your starting point to navigate project documentation and AI context.

---

## Core Project Files

### Main Documentation
- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) - High-level architecture and design decisions
- [../README.md](../README.md) - Setup and installation guide

### Configuration
- `requirements.txt` - Python dependencies
- `book-tracker-frontend/package.json` - Frontend dependencies
- Database: SQLite (`book_tracker.db`)

---

## Feature Areas

### 🔐 [Authentication](auth/)
**Files:**
- `app/auth.py` - Auth utilities (password hashing, JWT tokens)
- `app/routers/auth_router.py` - Login/signup endpoints
- `book-tracker-frontend/src/components/AuthForm.jsx` - Login/signup UI

**Key Decisions:** See [auth/README.md](auth/README.md)

---

### 📚 [Library Management](library/)
**Files:**
- `app/routers/books_router.py` - Book catalog + recommendations (returns `friend_name` in rec results)
- `app/routers/userbooks_router.py` - User reading status; `PATCH /{id}` accepts `total_pages`; `GET /{id}` single-item endpoint added
- `app/routers/googlebooks_router.py` - External book search
- `book-tracker-frontend-stitch/src/pages/LibraryPage.jsx` - Library UI
- `book-tracker-frontend-stitch/src/pages/BookDetailPage.jsx` - Dedicated book detail page (`/library/book/:userbookId`); survives refresh via list fetch; optimistic progress bar
- `book-tracker-mobile-stitch/src/screens/LibraryScreen.js` - Mobile library; Add Book button in tab row
- `book-tracker-mobile-stitch/src/screens/BookDetailScreen.js` - Mobile book detail; optimistic status changes; total-pages modal; absolute note timestamps

**Key Decisions:** See [library/README.md](library/README.md)

---

### 👥 [Community Features](community/)
**Files:**
- `app/routers/follow_router.py` - Follow/unfollow system
- `app/routers/likes_comments.py` - Social interactions
- `app/routers/notes_router.py` - Notes/posts + feed; **delete_note now removes Likes+Comments first** (PostgreSQL FK fix)
- `book-tracker-frontend-stitch/src/pages/HomePage.jsx` - Social feed (Community/Your Friends pill tabs); For You recs show friend name, remove on shelve
- `book-tracker-frontend-stitch/src/pages/UserProfilePage.jsx` - Fetches `getUserStats()` separately; shows member since, finished/reading/this-year, speed
- `book-tracker-mobile-stitch/src/screens/FeedScreen.js` - Mobile feed; `followInFlight` ref, comment `submitting` flag, aspect [2,3] image crop, For You recs with friend name
- `book-tracker-mobile-stitch/src/screens/UserProfileScreen.js` - Shows member since, correct stats fields (`stats.finished` not `stats.finished_books`), reading count, speed from activity, this-year always visible
- `book-tracker-mobile-stitch/src/services/NotificationService.js` - Push token registration; 30s axios timeout
- `book-tracker-mobile-stitch/App.js` - Root app; `authTokenRef` + `safePushRegistration()` fix

**Key Decisions:** See [community/README.md](community/README.md)

---

### 📊 [Reading Statistics](reading-stats/)
**Files:**
- `app/routers/notes_router.py` - Notes and highlights
- `book-tracker-frontend/src/components/library/ReadingStatsTable.jsx` - Stats display
- `book-tracker-frontend/src/components/library/WeeklyPulseChart.jsx` - Analytics charts

**Key Decisions:** See [reading-stats/README.md](reading-stats/README.md)

---

### 🚀 [Deployment](deployment/)
**Files:**
- `create_tables.py` - Database initialization
- `migrations/` - Database migration scripts
- Environment variables configuration
- `book-tracker-mobile/eas.json` - EAS build profiles (development APK, preview APK, production AAB)
- `book-tracker-mobile/google-services.json` - Firebase Android config (required for FCM push token generation)

**Mobile Build Commands:**
```powershell
# Dev client APK (for testing with hot-reload)
eas build --platform android --profile development
# Connect live:
npx expo start --dev-client --tunnel

# Production AAB (Play Store)
eas build --platform android --profile production
```
> Note: Expo Go cannot be used — app has native Google Sign-In module

**Key Decisions:** See [deployment/README.md](deployment/README.md)

---

## Database Schema

**Core Tables:**
- `users` - User accounts
- `books` - Book catalog
- `userbooks` - Reading status tracking
- `notes` - User notes and highlights
- `follows` - User follow relationships
- `journals` - Reading journal entries
- `likes`, `comments` - Social interactions

See: `create_tables.sql`, `app/models.py`

---

## API Structure

**Base URL:** `http://127.0.0.1:8000` (local)

**Main Routers:**
- `/auth/*` - Authentication
- `/books/*` - Book catalog
- `/userbooks/*` - Reading tracking
- `/notes/*` - Notes system
- `/follow/*` - Social following
- `/profile/*` - User profiles
- `/googlebooks/*` - External search

**Swagger Docs:** `http://127.0.0.1:8000/docs`

---

## Frontend Structure

**Framework:** React + Vite + TailwindCSS

**Main Pages:**
- `HomePage.jsx` - Social feed and community
- `LibraryPage.jsx` - Personal library
- `BPFeed.jsx` - BookPulse feed
- `BPLibrary.jsx` - BookPulse library view

**Shared Components:**
- `ModernHeader.jsx` - Navigation
- `Sidebar.jsx` - Side navigation

---

## Session Prompts

Use these templates for AI coding sessions:
- [session_prompts/SESSION_START_TEMPLATE.md](session_prompts/SESSION_START_TEMPLATE.md)
- [session_prompts/SESSION_END_TEMPLATE.md](session_prompts/SESSION_END_TEMPLATE.md)

---

## Quick Links

**Working on auth?** → [auth/README.md](auth/README.md)  
**Working on library?** → [library/README.md](library/README.md)  
**Working on social features?** → [community/README.md](community/README.md)  
**Working on analytics?** → [reading-stats/README.md](reading-stats/README.md)  
**Deploying changes?** → [deployment/README.md](deployment/README.md)
