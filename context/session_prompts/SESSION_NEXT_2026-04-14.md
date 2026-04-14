# Next Session Pickup — 2026-04-14 Evening

## Read These First
- `context/STITCH_CONTEXT.md` — full plan, stack, phase breakdown
- `context/API_REGISTRY.md` — endpoint ownership tracking
- `TRACKMYREAD_PLATFORM.md` — complete platform reference for Stitch

## Current Branch
`stitch-experiment` (pushed to GitHub)

## What Was Done Today
- Created `stitch-experiment` branch
- Scaffolded `book-tracker-frontend-stitch/` — this is where Stitch generates web UI
- Wrote context and registry files
- Decided on stack: FastAPI on Render (new service) + Supabase (PostgreSQL) + Vercel (preview)
- Production backend, mobile app, master branch — all frozen, untouched

## What Sonal Needs To Do Before We Can Continue

### 1. Reset Supabase password (URGENT)
The old password was accidentally exposed in chat.
- Supabase → project `book-tracker-stitch` → Settings → Database → Reset database password
- Save the new connection string somewhere safe (password manager, not chat)

### 2. Create new Render service
- Render dashboard → New → Web Service
- Connect GitHub repo → branch: `stitch-experiment`
- Name: `book-tracker-stitch`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### 3. Add env vars to the new Render service
Copy these from the production Render service:
```
DATABASE_URL=<new supabase postgresql URL — after password reset>
CORS_ORIGINS=http://localhost:5173
GOOGLE_BOOKS_API_KEY=<copy from prod Render>
VAPID_PUBLIC_KEY=<copy from prod Render>
VAPID_PRIVATE_KEY=<copy from prod Render>
CLOUDINARY_CLOUD_NAME=<copy from prod Render>
CLOUDINARY_API_KEY=<copy from prod Render>
CLOUDINARY_API_SECRET=<copy from prod Render>
```
Do NOT set SECRET_KEY, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET — these are hardcoded in the backend and don't need env vars.

### 4. Run DB migrations on new Render service
Once the Render service deploys successfully:
- Render → book-tracker-stitch → Shell tab
- Run: `python create_tables.py`

## Once Above Is Done — What We Do Next
- Configure Stitch MCP (user has access to it)
- Feed `TRACKMYREAD_PLATFORM.md` as context to Stitch
- Generate all 9 pages into `book-tracker-frontend-stitch/`
- Wire each page to the stitch Render backend URL
- Test end-to-end

## 9 Pages To Build (in order)
1. Login / Landing
2. Home — Community Feed (tabs: Community / Friends / Your Friends)
3. Library — books, progress, reading chart
4. Search — Google Books + add to library
5. My Profile — editable, 30-day chart
6. User Profile — public view, follow/unfollow
7. Notifications — bell, unread count, list
8. Settings — edit profile, delete account, logout
9. Admin — stats, users, push test (admin only)

## Key Things To Remember
- Status values: `to-read`, `reading`, `finished` — exact strings, nothing else
- JWT stored as `bt_token` in localStorage
- All auth requests: `Authorization: Bearer <token>`
- Always handle broken images with onError (Open Library returns 1x1 placeholders)
- `userbook` is the pivot — notes belong to userbook, not directly to book
- Phase 2 (after web done): rebuild mobile app to match same design system
