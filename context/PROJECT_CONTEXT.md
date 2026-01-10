# Book Tracker - Project Context

**Last Updated:** January 10, 2026  
**Project Version:** 1.0.0

---

## Project Purpose

A social book tracking platform where users can:
- Track their reading progress
- Share reading updates with friends
- Discover what others are reading
- Take notes and highlights
- Analyze reading statistics

---

## High-Level Architecture

### Backend Stack
- **Framework:** FastAPI (Python)
- **Database:** SQLite (local development)
- **Auth:** JWT tokens with OAuth2 password flow
- **Password Security:** Bcrypt hashing
- **File Uploads:** Profile pictures, note attachments

### Frontend Stack
- **Framework:** React 18
- **Build Tool:** Vite
- **Styling:** TailwindCSS
- **State Management:** React Context API
- **Routing:** React Router
- **API Client:** Axios

### Data Flow
```
User Browser
    ↓
React Frontend (Port 5173)
    ↓ HTTP/REST
FastAPI Backend (Port 8000)
    ↓
SQLite Database (book_tracker.db)
```

---

## Core Design Principles

### 1. **Feature-Based Organization**
- Backend routers are feature-specific (`auth_router.py`, `books_router.py`, etc.)
- Frontend components organized by feature (`library/`, `home/`, `bookpulse/`)
- Database tables aligned with features

### 2. **Authentication First**
- JWT tokens required for most endpoints
- Passwords hashed with bcrypt
- Token expiration: 30 days
- Secure password requirements enforced

### 3. **Social by Design**
- Follow system to connect users
- Public/private reading activities
- Comments and likes on reading updates
- Community feed of friend activities

### 4. **External Integration**
- Google Books API for book search
- Import book metadata automatically
- Avoid manual data entry

### 5. **Local-First Development**
- SQLite for simple setup
- No external services required for dev
- Easy migration path to PostgreSQL for production

---

## Key Architectural Decisions

### Why FastAPI?
- Fast, modern Python framework
- Automatic API documentation (Swagger)
- Built-in validation with Pydantic
- Async support for scalability
- Type hints improve code quality

### Why SQLite for Development?
- Zero configuration
- No separate database server
- Portable (single file)
- Easy backup and migration
- Production can use PostgreSQL (SQLModel compatible)

### Why JWT Tokens?
- Stateless authentication
- No server-side session storage
- Works well with REST APIs
- Easy to scale horizontally
- Frontend can store in localStorage

### Why Feature-Based Folders?
- Clear ownership boundaries
- Easier to find related code
- Reduces merge conflicts
- Scales better than monolithic files
- Each feature can evolve independently

---

## Database Design Philosophy

### Normalized Structure
- Users, books, and reading records are separate
- `userbooks` links users to books with status
- Avoids data duplication

### Soft Deletes
- No hard deletes on user content
- Maintains referential integrity
- Allows "undo" functionality

### Timestamps
- `created_at`, `updated_at` on all tables
- Enables audit trails
- Supports chronological queries

---

## Frontend Architecture

### Component Hierarchy
```
App.jsx
├── Header / ModernHeader
├── Sidebar
└── Pages
    ├── HomePage (Community Feed)
    ├── LibraryPage (Personal Books)
    ├── BPFeed (BookPulse Feed)
    └── BPLibrary (BookPulse Library)
```

### State Management Strategy
- Auth context for user session
- Local state for component UI
- API calls via centralized `services/api.js`
- No Redux (keep it simple)

### Styling Approach
- TailwindCSS utility classes
- Consistent color scheme across app
- Responsive by default
- Dark mode ready (future)

---

## Security Considerations

### Backend
- All passwords hashed with bcrypt
- JWT secrets stored in environment variables
- CORS configured for specific origins
- SQL injection prevented by SQLModel/SQLAlchemy
- File upload validation

### Frontend
- Tokens stored in localStorage (not cookies to avoid CSRF)
- API calls include Authorization header
- Input validation on forms
- XSS prevention via React's escaping

---

## Development Workflow

### Starting Backend
```bash
cd book-tracker
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

### Starting Frontend
```bash
cd book-tracker-frontend
npm run dev
```

### Database Migrations
- Manual SQL scripts in `migrations/`
- Run via Python scripts (e.g., `migrate_db.py`)
- No ORM migrations framework (keep it simple)

---

## Future Considerations

### Scalability
- Move to PostgreSQL for production
- Add Redis for caching
- Consider API rate limiting
- Implement CDN for static files

### Features
- Email notifications
- Reading challenges
- Book recommendations
- Mobile app (React Native)
- Export data (CSV, JSON)

### Technical Debt
- Add comprehensive test coverage
- Implement logging system
- Add error tracking (Sentry)
- Create automated backup system
- Document all API endpoints

---

## Environment Variables

### Backend
- `SECRET_KEY` - JWT signing key
- `BOOK_TRACKER_DB` - Database file path
- `CORS_ORIGINS` - Allowed frontend URLs
- `GOOGLE_BOOKS_API_KEY` - Google Books API access

### Frontend
- `VITE_API_BASE_URL` - Backend API URL

---

## File Organization Standards

### Python Files
- One router per feature
- Models in `app/models.py`
- Schemas in `app/schemas.py`
- Database setup in `app/database.py`
- Auth utilities in `app/auth.py`

### React Files
- Components in feature folders
- Shared components in `shared/`
- Services in `services/`
- Pages in `pages/`

### Naming Conventions
- Python: `snake_case` for files and functions
- React: `PascalCase` for components
- Database: `snake_case` for tables and columns

---

## When This Should Be Updated

Update this file when:
- Switching frameworks or major libraries
- Changing database structure significantly
- Adding new major features (not just endpoints)
- Modifying authentication approach
- Changing deployment architecture
- Updating core design principles

**Don't update for:**
- Adding individual endpoints
- UI tweaks
- Bug fixes
- Minor refactoring
