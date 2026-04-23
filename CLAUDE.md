## Session start

**Always read `context/LOAD_ME_FIRST.md` at the start of every session.** It contains current project status, tech stack, running commands, and what was recently built. Then read the relevant feature context based on what you're working on.

---

## Live context updates (non-negotiable)

During every session, proactively update these files as the work unfolds — do not wait until the end or for a "wrap up" command:

- **`context/LOAD_ME_FIRST.md`** — Update the "Recently Added/Fixed" section and "Project Status" after any meaningful change. Keep "Next Priorities" current.
- **`context/PROJECT_CONTEXT.md`** — Update architecture, file map, and feature status whenever something ships or changes structurally.
- **`context/INDEX.md`** — Update if new files or features are added.
- **`context/<feature>/README.md`** — Update the relevant feature context whenever that feature is modified.
- **Memory files** (`~/.claude/projects/.../memory/`) — Write new memory files for decisions, failed approaches, or feedback that should persist across sessions.

**When to trigger an update:**
- After any code is written or edited
- After a design decision is made or reversed
- After discovering a bug, regression, or failed approach
- After evaluating options and choosing one
- Before switching to a different feature/topic

**CRITICAL patterns to always record in `context/LOAD_ME_FIRST.md`:**
- Anything under "CRITICAL PATTERN" or "GOTCHA" — these have burned time before; always document
- Failed approaches with the reason they failed
- Any migration gotchas (e.g., `information_schema` not `sqlite_master` for cross-DB compatibility)

---

## Architecture reminder

- Backend: FastAPI (Python) — `app/routers/`, `app/models.py`, `app/deps.py`
- Web frontend: React + Vite — `book-tracker-frontend/src/`
- Mobile: React Native (Expo SDK, EAS builds) — `book-tracker-mobile/`
- DB: SQLite (dev) / PostgreSQL (prod) — migrations must use `information_schema` not `sqlite_master`
- Notifications: always use `fire_event()` from `app/notifications/dispatcher.py` — never `send_push_notification_to_user`
