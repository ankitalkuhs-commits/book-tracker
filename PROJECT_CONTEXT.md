# TrackMyRead - Project Context

**Last Updated:** December 27, 2025  
**Project Status:** Production (Live)

---

## 🎯 Project Vision

TrackMyRead is a social book tracking platform that combines personal library management with community engagement. Users can:
- Track their reading journey with detailed book management
- Share reading emotions and thoughts through community posts
- Follow friends and see what they're reading
- View reading statistics and analytics

---

## 🏗️ Architecture Overview

### Technology Stack

**Frontend:**
- React 19.2.0 + Vite 7.1.9
- Deployed on Vercel (auto-deploy from `master` branch)
- Client-side routing with React Router
- API communication via fetch with JWT auth

**Backend:**
- FastAPI (Python 3.13)
- SQLModel + SQLAlchemy for ORM
- PostgreSQL database (Render-hosted)
- Deployed on Render with Gunicorn + Uvicorn workers
- Port: 10000 (ephemeral filesystem)

**External Services:**
- Cloudinary for image persistence
- Google Books API for book metadata
- JWT for stateless authentication

### Key Architectural Decisions

1. **Stateless Authentication**
   - JWT tokens with 7-day expiration
   - Refresh token mechanism via `/auth/refresh`
   - Optional authentication for public endpoints (community feed)

2. **Image Storage Strategy**
   - Moved from local filesystem to Cloudinary (Dec 2025)
   - Reason: Render's ephemeral storage deleted images on redeploy
   - Images stored in `book_tracker/notes` folder

3. **Database Connection Handling**
   - PostgreSQL with connection pooling (pool_size=5, max_overflow=10)
   - SSL mode: "prefer" for Render compatibility
   - Table creation moved to app startup event (not separate script)
   - Retry logic with graceful degradation

4. **CORS Security**
   - Explicit origins list from `CORS_ORIGINS` env var
   - Changed from wildcard `["*"]` for production security
   - Credentials enabled for authenticated requests

5. **Responsive Design**
   - Mobile-first CSS Grid layout
   - CSS `order` property for mobile reordering
   - Sidebar shows first on mobile, right side on desktop

---

## 🗄️ Database Schema

### Core Models

**User**
- id, email, name, hashed_password, created_at
- Profile customization support

**Book**
- id, title, author, isbn, cover_url, description
- Shared across all users

**UserBook**
- Links User to Book with reading metadata
- status: 'reading' | 'to-read' | 'finished'
- current_page, rating, private_notes
- format, ownership_status, borrowed_from, loaned_to

**Note (Community Posts)**
- User's reading emotions/thoughts
- text, emotion, quote, image_url, page_number, chapter
- is_public flag for privacy
- Cloudinary image URLs

**Follow**
- Social graph: follower_id → followed_id

**Like**
- Post engagement: user_id + note_id

**Comment**
- (Future implementation) Post comments

**Journal**
- (Future implementation) Private reading journal

---

## 🔐 Authentication Flow

1. **Signup:** POST `/auth/signup` → User created, JWT returned
2. **Login:** POST `/auth/login` → Validate credentials, JWT returned
3. **Authenticated Requests:** Bearer token in Authorization header
4. **Token Refresh:** POST `/auth/refresh` → New token issued
5. **Optional Auth:** Public endpoints return `None` for unauthenticated users

---

## 🎨 UI/UX Patterns

### Community Feed
- Non-logged-in users: See posts, no user details, no actions
- Logged-in users: Full access with like/edit capabilities
- Auto-refresh every 5 minutes (300000ms)
- Edit button (pencil icon) only for post owners

### Library Management
- Tab navigation: All, Currently Reading, Want to Read, Finished
- Dual filters: Format + Ownership Status
- Search by title/author
- Pagination: 6 books per page with smart ellipsis

### Reading Stats
- Books This Year, Currently Reading, Books Finished
- Pages Read, Emotions Logged (from actual API data)
- Scrollable friends list (max 2 visible entries)

---

## 🚀 Deployment Pipeline

### Backend (Render)
1. Push to GitHub `master` branch
2. Render auto-detects changes
3. Builds Python 3.13 environment
4. Installs requirements.txt
5. Runs start command: `gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
6. App startup event creates database tables
7. Health check on root endpoint `/`

### Frontend (Vercel)
1. Push to GitHub `master` branch
2. Vercel auto-builds Vite project
3. Deploys to trackmyread.vercel.app
4. Environment variable: `VITE_API_URL` points to Render backend

---

## 📊 Current Feature Status

✅ **Implemented:**
- User authentication (signup, login, JWT)
- Book library management (CRUD, filters, search, pagination)
- Community posts with emotions and images
- Social following system
- Like functionality on posts
- Post editing (owner only)
- Reading statistics dashboard
- Mobile-responsive design
- Cloudinary image storage
- Public feed access for non-authenticated users
- Google Books API integration

⏳ **In Progress:**
- None currently

🔮 **Planned:**
- Comments on posts
- Private reading journal
- Weekly reading activity chart
- ISBN barcode scanning
- Advanced book recommendations
- Reading goals and challenges

---

## 🐛 Known Issues & Solutions

### Issue: PostgreSQL SSL Connection Errors
**Symptom:** "SSL connection has been closed unexpectedly"  
**Solution:** 
- Updated database.py with `sslmode: "prefer"` 
- Added connection keepalives
- Moved table creation to app startup event
- Database recreation on Render

### Issue: Images Disappearing After Deployment
**Symptom:** Uploaded images lost on Render redeploy  
**Cause:** Render uses ephemeral filesystem  
**Solution:** Migrated to Cloudinary for persistent storage

### Issue: Free PostgreSQL Database Suspended
**Symptom:** Database connection failures, missing database service  
**Solution:** Recreate PostgreSQL instance on Render, update DATABASE_URL

---

## 🔄 Development Workflow

1. **Feature Development:** Create feature branch, implement, test locally
2. **Code Review:** Self-review changes, check for errors
3. **Commit:** Descriptive commit messages
4. **Push to Master:** Triggers automatic deployment
5. **Monitor:** Check Render/Vercel logs for successful deployment
6. **Update Context:** Update relevant feature context files

---

## 📞 Support & Resources

- **GitHub Repo:** ankitalkuhs-commits/book-tracker
- **Documentation:** See `/context/*` folders for feature-specific docs
- **API Docs:** https://book-tracker-backend.onrender.com/docs (Swagger)
