# TrackMyRead - Project Index

**Last Updated:** December 27, 2025

## Project Overview
TrackMyRead is a full-stack book tracking and social reading platform where users can manage their reading lists, share reading progress, and connect with other readers.

**Live URL:** https://trackmyread.vercel.app  
**Backend API:** https://book-tracker-backend.onrender.com  
**Tech Stack:** React + Vite (Frontend), FastAPI + PostgreSQL (Backend)

---

## 📁 Repository Structure

### Backend (`/app`)
```
app/
├── main.py              - FastAPI app initialization, CORS, startup events
├── models.py            - SQLModel database schemas (User, Book, UserBook, Note, etc.)
├── database.py          - PostgreSQL connection, engine config, session management
├── auth.py              - JWT token generation, password hashing (bcrypt)
├── crud.py              - Database CRUD operations
├── deps.py              - Dependency injection (auth, optional auth)
├── routers/
│   ├── auth_router.py        - /auth/* - Signup, login, token refresh
│   ├── books_router.py       - /books/* - Book search, details
│   ├── userbooks_router.py   - /userbooks/* - User's library CRUD
│   ├── notes_router.py       - /notes/* - Posts/notes with emotions, Cloudinary images
│   ├── follow_router.py      - /follow/* - Follow/unfollow users
│   ├── profile_router.py     - /profile/* - User profile management
│   ├── googlebooks_router.py - /googlebooks/* - Google Books API integration
│   ├── likes_comments.py     - /notes/*/like - Like/unlike posts
│   └── users_router.py       - /users/* - User search and listing
```

### Frontend (`/book-tracker-frontend/src`)
```
src/
├── App.jsx              - Main router setup, protected routes
├── services/
│   └── api.js           - API client with auth headers, BASE_URL config
├── pages/
│   ├── LoginPage.jsx         - Authentication
│   ├── SignupPage.jsx        - User registration
│   ├── HomePage.jsx          - Community feed + sidebar
│   ├── LibraryPage.jsx       - User's book library with tabs, filters, pagination
│   └── ProfilePage.jsx       - User profile and settings
├── components/
│   ├── home/
│   │   ├── PostComposer.jsx      - Create new posts with text/quote/image
│   │   ├── CommunityPulseFeed.jsx - Display all community posts
│   │   ├── PulsePost.jsx         - Individual post card with like/edit
│   │   └── HomeSidebar.jsx       - Friends reading activity
│   ├── library/
│   │   ├── BookCard.jsx          - Book display in library
│   │   ├── AddBookModal.jsx      - Add books to library
│   │   ├── BookDetailModal.jsx   - View/edit book details
│   │   ├── ReadingStatsTable.jsx - Reading statistics widget
│   │   └── WeeklyPulseChart.jsx  - (commented out) Reading activity chart
│   └── shared/
│       └── Navbar.jsx            - Navigation bar
└── bookpulse.css        - Global styles with responsive design
```

### Configuration Files
```
/
├── requirements.txt     - Python dependencies
├── create_tables.py     - Database initialization script (with retry logic)
├── .gitignore          - Git exclusions
└── book_tracker.db     - SQLite (local dev only)
```

---

## 🎯 Feature Context Files

Detailed documentation for each major feature:

- **[Authentication & User Management](./context/auth/)** - Signup, login, JWT, profile
- **[Book Library Management](./context/library/)** - Add books, track reading status, filters
- **[Community & Social Features](./context/community/)** - Posts, likes, following, feed
- **[Reading Analytics](./context/reading-stats/)** - Statistics, emotions tracking
- **[Deployment & Infrastructure](./context/deployment/)** - Render, Vercel, PostgreSQL, Cloudinary

---

## 🔗 External Services

| Service | Purpose | Config Location |
|---------|---------|----------------|
| **Render** | Backend hosting | Environment: `DATABASE_URL`, `CORS_ORIGINS`, `CLOUDINARY_*` |
| **Vercel** | Frontend hosting | Auto-deploy from `master` branch |
| **PostgreSQL** | Production database | Render-managed, connection via `DATABASE_URL` |
| **Cloudinary** | Image storage | API keys in Render environment |
| **Google Books API** | Book metadata | `/googlebooks/*` endpoints |

---

## 📝 Quick Reference

**Start Local Development:**
```bash
# Backend
cd book-tracker
source venv/bin/activate  # or .venv\Scripts\activate on Windows
uvicorn app.main:app --reload

# Frontend
cd book-tracker-frontend
npm run dev
```

**Database Models:**
- User, Book, UserBook, Note, Follow, Like, Comment, Journal

**Key Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `CORS_ORIGINS` - Allowed frontend origins (comma-separated)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `SECRET_KEY` - JWT signing key

---

## 📚 Session History

For detailed session logs and decisions, see individual feature context folders.
