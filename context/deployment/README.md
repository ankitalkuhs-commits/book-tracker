# Deployment & Infrastructure

**Feature Owner:** DevOps  
**Last Updated:** December 27, 2025

---

## Overview

Production deployment on Render (backend) and Vercel (frontend) with PostgreSQL database and Cloudinary image storage.

---

## Infrastructure

### Backend: Render
- **Service Type:** Web Service
- **Runtime:** Python 3.13
- **Plan:** Free tier (upgradable)
- **Region:** Oregon (US West)
- **Start Command:** `gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
- **Port:** 10000 (auto-assigned by Render)
- **Build Command:** `pip install -r requirements.txt`

### Frontend: Vercel
- **Framework:** Vite + React
- **Plan:** Free tier
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Auto-Deploy:** Enabled on `master` branch push
- **Domain:** trackmyread.vercel.app

### Database: PostgreSQL (Render)
- **Service Type:** PostgreSQL
- **Version:** 16
- **Plan:** Free tier
- **Region:** Oregon (US West)
- **Backups:** Not included in free tier
- **Connection:** Internal Database URL via `DATABASE_URL` env var

### Image Storage: Cloudinary
- **Plan:** Free tier (25 GB storage, 25 GB bandwidth/month)
- **Folder Structure:** `book_tracker/notes/`
- **URL Format:** Secure HTTPS URLs
- **CDN:** Global delivery

---

## Environment Variables

### Render Backend

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db` |
| `SECRET_KEY` | JWT signing key | Random 32+ char string |
| `CORS_ORIGINS` | Allowed frontend URLs | `https://trackmyread.vercel.app` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account name | `your-cloud-name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `123456789012345` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `abcdef123456` |

### Vercel Frontend

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `https://book-tracker-backend.onrender.com` |

---

## Deployment Pipeline

### Backend Deployment
1. **Trigger:** Push to `master` branch on GitHub
2. **Render Detection:** Webhook from GitHub
3. **Build Phase:**
   - Clone repository
   - Install Python 3.13
   - Run `pip install -r requirements.txt`
   - Build takes ~2-3 minutes
4. **Deploy Phase:**
   - Start gunicorn with uvicorn workers
   - App startup event creates database tables
   - Health check on `/` endpoint
   - Service goes live (~1 minute)
5. **Total Time:** 3-5 minutes from push to live

### Frontend Deployment
1. **Trigger:** Push to `master` branch on GitHub
2. **Vercel Detection:** Git integration
3. **Build Phase:**
   - Install Node.js dependencies
   - Run `npm run build` (Vite)
   - Build takes ~1-2 minutes
4. **Deploy Phase:**
   - Deploy to Vercel CDN
   - Preview URL generated
   - Production domain updated
5. **Total Time:** 2-3 minutes from push to live

---

## Critical Deployment Decisions

### 1. Database Table Creation Strategy

**Evolution:**
- ❌ **v1:** Separate `create_tables.py` script in start command
  - Issue: SSL connection failures blocked app startup
- ✅ **v2:** App startup event with error handling
  - Benefit: App starts even if table creation fails (tables likely exist)

**Current Implementation:**
```python
@app.on_event("startup")
async def startup_event():
    try:
        SQLModel.metadata.create_all(engine)
    except Exception as e:
        print(f"Warning: {e}")
        # Continue anyway - tables likely exist
```

### 2. PostgreSQL Connection Configuration

**SSL Settings:**
```python
connect_args={
    "sslmode": "prefer",      # Flexible SSL requirement
    "connect_timeout": 30,    # Increased timeout
    "keepalives": 1,          # TCP keepalives
    "keepalives_idle": 30,
    "keepalives_interval": 10,
    "keepalives_count": 5,
}
```

**Rationale:** Render's PostgreSQL requires SSL but "prefer" mode handles cert issues gracefully

### 3. Connection Pool Sizing
```python
pool_size=5        # Reduced from 10
max_overflow=10    # Reduced from 20
```

**Rationale:** Free tier database has connection limits, smaller pool prevents exhaustion

### 4. DATABASE_URL Format Conversion
```python
# Render provides postgres://, SQLAlchemy needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
```

**Rationale:** Compatibility between Render's format and SQLAlchemy 1.4+

### 5. Static File Handling
```python
# Backend uploads directory (ephemeral on Render)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
```

**Issue:** Files deleted on redeploy  
**Solution:** Migrated to Cloudinary for persistence

---

## Monitoring & Debugging

### Render Logs
Access via: Dashboard → Service → Logs tab

**Key Log Patterns:**
```
✅ Database tables initialized successfully!
⚠️ Warning: Could not create tables (they may already exist)
❌ Error: SSL connection has been closed unexpectedly
```

### Vercel Logs
Access via: Dashboard → Deployments → Function Logs

**Useful for:**
- Build errors
- Runtime errors
- API call failures

### Database Monitoring
Access via: Render → PostgreSQL Service → Metrics

**Metrics:**
- Connection count
- Storage usage
- Query performance

---

## Common Deployment Issues

### Issue 1: Backend Shows "Failed Service"
**Symptoms:** Red status, app won't start  
**Causes:**
1. Database connection failure (SSL errors)
2. Missing environment variables
3. Syntax errors in code
4. Port binding issues

**Solutions:**
1. Check `DATABASE_URL` is set correctly
2. Verify all required env vars present
3. Check logs for Python tracebacks
4. Ensure start command uses `$PORT`

### Issue 2: Free PostgreSQL Database Suspended
**Symptoms:** "SSL connection has been closed unexpectedly"  
**Cause:** Free tier database deleted after inactivity  
**Solution:**
1. Create new PostgreSQL service on Render
2. Copy Internal Database URL
3. Update `DATABASE_URL` in backend service
4. Redeploy (tables auto-created)

### Issue 3: CORS Errors on Frontend
**Symptoms:** Browser console shows CORS policy errors  
**Cause:** Frontend URL not in `CORS_ORIGINS`  
**Solution:** Add frontend URL to `CORS_ORIGINS` env var (comma-separated for multiple)

### Issue 4: Images Not Loading
**Symptoms:** Broken image icons in posts  
**Causes:**
1. Cloudinary credentials not set
2. Old local file URLs in database

**Solutions:**
1. Verify `CLOUDINARY_*` env vars
2. Re-upload images (new uploads use Cloudinary)

### Issue 5: Build Timeout on Render
**Symptoms:** Build fails with timeout error  
**Cause:** Large dependencies or slow download  
**Solutions:**
1. Check `requirements.txt` for unnecessary packages
2. Use `--no-cache-dir` in pip install
3. Upgrade to paid plan for faster builds

---

## Backup & Recovery

### Current State (Free Tier)
❌ **No automated backups**  
⚠️ **Risk:** Database loss if service deleted

### Recommended Approach
1. **Upgrade Database:** Starter plan ($7/mo) includes daily backups
2. **Manual Exports:** Periodic pg_dump via Render shell
3. **Code Backups:** GitHub repository (code is safe)
4. **Image Backups:** Cloudinary retains images permanently

### Manual Backup Command
```bash
# Access Render shell for PostgreSQL service
pg_dump $DATABASE_URL > backup.sql
```

---

## Performance Optimization

### Backend
- ✅ Gunicorn with 2 uvicorn workers (parallelism)
- ✅ Connection pooling (reuse DB connections)
- ✅ Pool pre-ping (detect stale connections)
- ⏳ TODO: Redis caching for frequent queries
- ⏳ TODO: Database query optimization (indexes)

### Frontend
- ✅ Vite build optimization (code splitting)
- ✅ Vercel CDN (global distribution)
- ✅ Cloudinary CDN for images
- ⏳ TODO: Lazy loading for images
- ⏳ TODO: React.memo for expensive components

---

## Cost Analysis

### Current Monthly Costs
- **Render Backend:** $0 (Free tier)
- **Render PostgreSQL:** $0 (Free tier, limited)
- **Vercel Frontend:** $0 (Free tier)
- **Cloudinary:** $0 (Free tier)
- **Total:** $0/month

### Recommended Paid Upgrades
1. **PostgreSQL Starter:** $7/mo
   - Daily backups
   - 256 MB RAM → 1 GB RAM
   - More connections
   - Better performance

2. **Render Starter:** $7/mo (when needed)
   - No cold starts
   - More compute
   - Better uptime SLA

**Total Recommended:** $7-14/month for production-ready setup

---

## Scaling Roadmap

### Phase 1: Current (Free Tier)
- Single backend instance
- Free database with limits
- Auto-sleep after inactivity

### Phase 2: Paid Starter ($7-14/mo)
- Persistent backend (no sleep)
- Reliable database with backups
- 100+ concurrent users

### Phase 3: Growth ($50+/mo)
- Multiple backend instances
- Production database plan
- Redis caching layer
- CDN optimization

### Phase 4: Scale ($200+/mo)
- Load balancer
- Database replication
- Separate worker processes
- Advanced monitoring (DataDog, Sentry)
