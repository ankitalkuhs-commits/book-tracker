# 🚀 AI Session Starter - Always Read This First

**When starting ANY session on book-tracker, Claude should read this file automatically when instructed.**

---

## Auto-Load Instructions for Claude

When the user says **"start session"** or **"load context"**, do the following:

1. Read this file (you're doing that now!)
2. Ask: "What are you working on today?" 
3. Based on the answer, read the relevant context:
   - **Auth/Login** → Read `context/auth/README.md`
   - **Books/Library** → Read `context/library/README.md`
   - **Social/Community** → Read `context/community/README.md`
   - **Stats/Analytics** → Read `context/reading-stats/README.md`
   - **Database/Deploy** → Read `context/deployment/README.md`
   - **Not sure** → Read `context/INDEX.md` first
4. Also quickly scan `context/PROJECT_CONTEXT.md` for architecture basics

---

## Project Quick Facts

**Tech Stack:**
- Backend: FastAPI (Python) + SQLite
- Frontend: React + Vite + TailwindCSS
- Auth: JWT tokens with bcrypt

**Key Patterns:**
- Feature-based routers (`app/routers/`)
- SQLModel for database
- Pydantic schemas for validation

**Running Locally:**
- Backend: `uvicorn app.main:app --reload` (port 8000)
- Frontend: `npm run dev` in `book-tracker-frontend/` (port 5173)

---

## Common Commands

**User says this** → **Claude does this**

- "start session" → Read this file + ask what feature
- "ctx auth" → Read `context/auth/README.md`
- "ctx library" → Read `context/library/README.md`
- "ctx community" → Read `context/community/README.md`
- "ctx stats" → Read `context/reading-stats/README.md`
- "ctx deploy" → Read `context/deployment/README.md`
- "full context" → Read all feature READMEs
- "wrap up" → AUTO-UPDATE EVERYTHING (see below)

---

## 🤖 Auto-Update on "wrap up"

When user says **"wrap up"**, Claude automatically:

1. ✅ **Analyze what was changed** (which files, which features)
2. ✅ **Update feature README** if we worked on that feature
3. ✅ **Update INDEX.md** if new files were added
4. ✅ **Update PROJECT_CONTEXT.md** if architecture changed
5. ✅ **Create next session's start prompt** with relevant context
6. ✅ **Generate summary** of what was accomplished

**No manual work required - just say "wrap up"!**

---

## Project Status

**Current Version:** 1.0.0  
**Last Updated:** January 10, 2026  
**Active Development:** Yes

**Recently Added:**
- Context system (this file!)
- Session templates

**Next Priorities:**
- (User updates this as needed)

---

**Pro Tip:** User can just say "start session" and you'll guide them through loading the right context!
