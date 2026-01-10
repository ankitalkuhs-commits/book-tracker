# Deployment Context

**Feature Owner:** DevOps & Infrastructure  
**Last Updated:** January 10, 2026

---

## Overview
Database management, migrations, environment setup, and deployment configurations.

---

## Files in This Feature

### Database Setup
- `create_tables.py` - Python script to initialize database
- `create_tables.sql` - SQL schema definition
- `check_db.py` - Database validation utility
- `check_setup.bat` - Windows setup verification

### Migrations
- `migrations/` - Database migration scripts
  - `add_follow_id.py` - Add follow system
  - `migrate_db.py` - General migration runner
  - `migrate_book_format_ownership.py` - Book format migration
  - `migrate_status_values.py` - Status field migration
  - `add_note_columns.py` - Add notes fields

### Configuration
- `requirements.txt` - Python dependencies
- `app/database.py` - Database connection setup
- `.env` (not in repo) - Environment variables

### Uploads
- `uploads/profile_pictures/` - User avatars
- `uploads/notes/` - Note attachments

---

## Key Design Decisions

### 1. SQLite for Development
**Decision:** Use SQLite locally, PostgreSQL for production  
**Why:**
- Zero configuration for dev
- File-based, easy backup
- SQLModel is database-agnostic
- Simple migration to PostgreSQL

**Migration Path:**
```python
# DATABASE_URL in .env
# Local: sqlite:///./book_tracker.db
# Prod: postgresql://user:pass@host/db
```

### 2. Manual Migration Scripts
**Decision:** Python scripts instead of Alembic  
**Why:**
- Simpler for small project
- More control over migrations
- Easy to understand and debug
- Can run selective migrations

**Pattern:**
```python
def migrate():
    with Session(engine) as session:
        # Migration logic
        session.execute(text("ALTER TABLE..."))
        session.commit()
```

### 3. Environment Variables
**Decision:** Use `.env` file for local, env vars for production  
**Why:**
- Keep secrets out of code
- Different configs per environment
- Standard practice
- Easy deployment to Render/Railway

**Required Variables:**
```
SECRET_KEY=
DATABASE_URL=
CORS_ORIGINS=
GOOGLE_BOOKS_API_KEY=
```

### 4. File Upload Storage
**Decision:** Local filesystem (not S3 yet)  
**Why:**
- Simpler for MVP
- No external dependencies
- Free
- Can migrate to S3 later

**Structure:**
```
uploads/
├── profile_pictures/
│   └── {user_id}_{timestamp}.jpg
└── notes/
    └── {note_id}_{timestamp}.pdf
```

### 5. Database Backup Strategy
**Decision:** Manual backups for now  
**Why:**
- SQLite is single file (easy copy)
- Can automate with cron later
- Backup before migrations
- Version control backups

---

## Environment Setup

### Local Development (Windows)

#### 1. Python Environment
```powershell
cd C:\Users\sonal\Documents\projects\book-tracker
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

#### 2. Environment Variables
Create `.env` file:
```
SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite:///./book_tracker.db
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
GOOGLE_BOOKS_API_KEY=your-google-api-key
```

#### 3. Database Initialization
```powershell
python create_tables.py
```

#### 4. Run Backend
```powershell
uvicorn app.main:app --reload
```

#### 5. Run Frontend
```powershell
cd book-tracker-frontend
npm install
npm run dev
```

---

## Database Management

### Creating Tables
```python
# create_tables.py
from app.database import engine
from app.models import SQLModel

SQLModel.metadata.create_all(engine)
```

### Checking Database
```powershell
python check_db.py  # Lists all tables and row counts
```

### Manual SQL Queries
```powershell
sqlite3 book_tracker.db
.tables
SELECT * FROM users;
.quit
```

---

## Migration Workflow

### Before Migration
```powershell
# Backup database
cp book_tracker.db book_tracker.db.bak
```

### Running Migration
```powershell
python migrations/migrate_db.py
```

### Verify Migration
```powershell
python check_db.py
# Check affected tables
```

### Rollback (if needed)
```powershell
# Restore backup
cp book_tracker.db.bak book_tracker.db
```

---

## Production Deployment

### Platform: Render.com (Recommended)

#### Backend Service
1. Connect GitHub repo
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Environment variables:
   ```
   SECRET_KEY=<generate-strong-key>
   DATABASE_URL=<postgresql-connection-string>
   CORS_ORIGINS=https://your-frontend.com
   GOOGLE_BOOKS_API_KEY=<your-key>
   ```

#### Database
- Provision PostgreSQL database
- Copy connection string to `DATABASE_URL`
- Run migrations: `python create_tables.py`

#### Frontend
1. Build command: `npm run build`
2. Publish directory: `dist`
3. Environment variable:
   ```
   VITE_API_BASE_URL=https://your-backend.onrender.com
   ```

### Alternative: Railway.app

Similar process:
1. Connect repo
2. Add PostgreSQL plugin
3. Set environment variables
4. Deploy

---

## File Upload Configuration

### Local Setup
```python
# app/main.py
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
```

### Production Setup
**Option 1: Same server**
- Keep files on server
- Mount uploads directory
- Backup regularly

**Option 2: S3 (Future)**
- Use boto3 for uploads
- Store URLs in database
- Better scalability

---

## Environment Variables Reference

### Backend (.env)
```bash
# Security
SECRET_KEY=your-super-secret-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200  # 30 days

# Database
DATABASE_URL=sqlite:///./book_tracker.db  # Local
# DATABASE_URL=postgresql://user:pass@host:5432/dbname  # Production

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:5174

# APIs
GOOGLE_BOOKS_API_KEY=your-google-books-api-key

# File Uploads
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760  # 10MB
```

### Frontend (.env)
```bash
VITE_API_BASE_URL=http://127.0.0.1:8000  # Local
# VITE_API_BASE_URL=https://your-backend.onrender.com  # Production
```

---

## Database Schema Versioning

### Current Schema Version: 1.0

### Migration History
1. **v1.0** - Initial schema (create_tables.sql)
2. **v1.1** - Add follow system (add_follow_id.py)
3. **v1.2** - Book format fields (migrate_book_format_ownership.py)
4. **v1.3** - Status enum values (migrate_status_values.py)
5. **v1.4** - Note attachments (add_note_columns.py)

---

## Backup Strategy

### Automated Backup (Future)
```powershell
# Backup script
$date = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item book_tracker.db "backups/book_tracker_$date.db"

# Keep last 7 days
Get-ChildItem backups/*.db | 
  Where-Object {$_.CreationTime -lt (Get-Date).AddDays(-7)} | 
  Remove-Item
```

### Manual Backup
```powershell
# Before major changes
cp book_tracker.db book_tracker.db.bak
```

---

## Monitoring & Logging

### Current: Console Logging
FastAPI default logging to stdout

### Future: Structured Logging
```python
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

### Production Monitoring
- Use Render logs
- Add Sentry for error tracking
- Monitor database size
- Track API response times

---

## Security Checklist

### Pre-Deployment
- [x] SECRET_KEY is strong and unique
- [x] Passwords are bcrypt hashed
- [x] CORS origins restricted
- [x] SQL injection prevented (SQLModel)
- [ ] HTTPS enforced
- [ ] Rate limiting configured
- [ ] File upload size limits
- [ ] Input validation on all endpoints

---

## Troubleshooting

### Database locked error
SQLite issue with concurrent writes
```python
# Solution: Use WAL mode
engine = create_engine(
    "sqlite:///./book_tracker.db",
    connect_args={"check_same_thread": False, "timeout": 30}
)
```

### Migration failed
```powershell
# Rollback to backup
cp book_tracker.db.bak book_tracker.db

# Check what went wrong
python check_db.py
```

### File upload permission errors
```powershell
# Ensure upload directories exist
mkdir uploads\profile_pictures
mkdir uploads\notes
```

---

## Performance Optimization

### Database Indexes
```sql
-- Add indexes for common queries
CREATE INDEX idx_userbooks_user_status ON userbooks(user_id, status);
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_journals_created ON journals(created_at DESC);
```

### Connection Pooling
Already handled by SQLModel for SQLite

For PostgreSQL:
```python
engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10
)
```

---

## Future Infrastructure Plans

### Short Term
- [ ] Automated database backups
- [ ] Error monitoring (Sentry)
- [ ] API rate limiting
- [ ] Request logging

### Long Term
- [ ] Move to PostgreSQL
- [ ] S3 for file storage
- [ ] Redis for caching
- [ ] CDN for static assets
- [ ] Docker containerization

---

## Related Context

- See [../PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) for architecture
- See [../auth/README.md](../auth/README.md) for security setup
- See [GOOGLE_OAUTH_SETUP.md](../../GOOGLE_OAUTH_SETUP.md) for OAuth setup
