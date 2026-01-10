# Book Tracker - Context Index

**Last Updated:** January 10, 2026

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
- `app/routers/books_router.py` - Book catalog endpoints
- `app/routers/userbooks_router.py` - User reading status
- `app/routers/googlebooks_router.py` - External book search
- `book-tracker-frontend/src/pages/LibraryPage.jsx` - Library UI
- `book-tracker-frontend/src/components/library/` - Library components

**Key Decisions:** See [library/README.md](library/README.md)

---

### 👥 [Community Features](community/)
**Files:**
- `app/routers/follow_router.py` - Follow/unfollow system
- `app/routers/likes_comments.py` - Social interactions
- `app/routers/journals.py` - Reading journals
- `book-tracker-frontend/src/pages/HomePage.jsx` - Social feed
- `book-tracker-frontend/src/components/home/` - Community components

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
