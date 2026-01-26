# BookPulse - AI Coding Instructions

## Project Overview
Social book tracking platform with FastAPI backend (Python) and React frontend. Users track reading, share updates, follow friends, and analyze stats. Google OAuth for auth, SQLite (dev) / PostgreSQL (prod).

## Architecture Patterns

### Backend: Feature-Based Routers
All endpoints organized by domain in `app/routers/`:
- Auth endpoints: `auth_router.py`
- Book catalog: `books_router.py`, `googlebooks_router.py`
- User reading: `userbooks_router.py`, `notes_router.py`
- Social: `follow_router.py`, `likes_comments.py`, `journals.py`
- Admin: `admin_router.py`

**Critical**: New endpoints go in domain-specific routers, then register in `app/main.py`:
```python
app.include_router(your_router.router)
```

### Database: SQLModel with Dual Support
- **Dev**: SQLite (`book_tracker.db`) - zero config, single file
- **Prod**: PostgreSQL via `DATABASE_URL` env var
- **Models**: `app/models.py` - SQLModel classes define both Pydantic schemas and SQL tables
- **Migrations**: Manual SQL scripts in `migrations/` directory

**Key tables**: `user`, `book`, `userbook` (join table for reading status), `note`, `follows`, `journal`

### Auth Flow: JWT + Google OAuth
1. Google OAuth sign-in via `@react-oauth/google` (frontend)
2. Backend validates with `google-auth` library at `/auth/google`
3. Returns JWT token (sub = user_id OR email, depending on endpoint)
4. Token required via `get_current_user` dependency (`app/deps.py`)

**Password auth removed** - Google OAuth only. Old bcrypt code remains for migration.

### Frontend: Hash Routing + No State Library
- **Routing**: Hash-based (`#/library`, `#/feed`) - see `App.jsx` route matching
- **State**: Plain `useState`/`useEffect` - NO Context API, Redux, or global state
- **API calls**: Custom wrapper in `src/services/api.js` with token injection
- **Styling**: TailwindCSS + inline styles (no CSS modules)

**Component organization**: 
- `components/bookpulse/` - main app features
- `components/library/` - library-specific
- `components/home/` - feed/social
- `pages/` - top-level page components

## Development Workflow

### Running Locally (Windows PowerShell)
**Backend**:
```powershell
cd book-tracker
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload  # Port 8000
```

**Frontend**:
```powershell
cd book-tracker-frontend
npm run dev  # Port 5173
```

**CRITICAL**: Backend MUST run from project root (not `app/` dir) for imports to work.

### Database Changes
1. Add/modify model in `app/models.py`
2. Create migration script in `migrations/` (Python or SQL)
3. For new tables: Update `create_tables.sql` for future deploys
4. Run migration manually (no auto-migration tool)

### API Testing
- Local Swagger docs: http://127.0.0.1:8000/docs
- Use "Authorize" button with token from `/auth/google` response
- All protected endpoints return 401 without valid Bearer token

## Critical Conventions

### CORS Configuration
Backend allows specific origins via `CORS_ORIGINS` env var (comma-separated). Default in dev: `localhost:5173-5177`. **Never use `allow_origins=["*"]` in production**.

### Error Handling Pattern
```python
# Backend routers
raise HTTPException(status_code=404, detail="Book not found")

# Frontend
try {
  const res = await fetch(...)
  if (!res.ok) throw new Error(...)
} catch (err) {
  alert(err.message)  // Simple alerts for now
}
```

### File Uploads
- Stored in `uploads/` directory (profile pics, note images)
- Backend mounts as static files: `app.mount("/uploads", StaticFiles(...))`
- Access via `/uploads/profile_pictures/filename.jpg`

### UserBook Status Values
Only 3 allowed: `"to-read"`, `"reading"`, `"finished"`. Validated on backend. Frontend uses these exact strings.

### Context Documentation System
`context/` directory contains AI session guides:
- **Always read**: `LOAD_ME_FIRST.md` at session start
- **Feature docs**: `auth/`, `library/`, `community/`, `reading-stats/`, `deployment/`
- **Auto-update**: When user says "wrap up", update relevant context files per `AUTO_UPDATE_GUIDE.md`

## Common Gotchas

1. **Import errors**: Run `uvicorn` from project root, NOT `app/` directory
2. **Token format**: Must be `user_id` (int) OR `email` (str) in JWT `sub` - check `deps.py` logic
3. **Database locked**: SQLite doesn't handle concurrent writes - use PostgreSQL for production
4. **React strict mode**: Components mount twice in dev - use cleanup in `useEffect`
5. **Hash routing**: Links must use `#/path` not `/path` - see `App.jsx` for route handling
6. **Google OAuth**: Requires valid `GOOGLE_CLIENT_ID` env var in frontend `.env`

## External Integrations

### Google Books API
- Search: `GET /api/googlebooks/search?q=term`
- Details: `GET /api/googlebooks/book/{google_books_id}`
- Returns normalized book data (title, author, ISBN, cover, pages)
- Frontend imports via "Add Book" flow

### Deployment
- **Backend**: Render.com - auto-deploys from GitHub `main` branch
- **Frontend**: Vercel - auto-deploys from GitHub `main` branch
- **Required env vars**: See `context/deployment/README.md`

## Code Examples

### Adding a New Router
```python
# app/routers/myfeature_router.py
from fastapi import APIRouter, Depends
from ..deps import get_current_user

router = APIRouter(prefix="/myfeature", tags=["myfeature"])

@router.get("/")
def get_items(user=Depends(get_current_user)):
    return {"items": []}

# Then in app/main.py:
from .routers import myfeature_router
app.include_router(myfeature_router.router)
```

### Protected API Call (Frontend)
```javascript
const token = localStorage.getItem('token');
const res = await fetch(`${API_BASE_URL}/userbooks/`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
if (!res.ok) throw new Error('Failed to fetch');
const data = await res.json();
```

---

*For detailed feature context, see `context/LOAD_ME_FIRST.md`. Update this file when architecture changes.*
