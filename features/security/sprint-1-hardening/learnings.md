---
screen: sprint-1-hardening
feature: security
---

## Learnings

- `git commit -- <pathspec>` commits from the WORKING TREE, not the index — it re-added 12,306 `git rm --cached` files from disk; the fix was `git reset --soft`, re-stage, and commit the index with no pathspec. Learned the hard way: the pathspec form is for "interactive commit these specific files from working tree," not "stage first then commit."

- The Bash tool on this machine truncates heredocs above ~6 KB ("unexpected EOF while looking for matching quote") — write long files with the Write tool instead. FastAPI app/main.py and large test files hit this; switching to Write solved it.

- `POST /auth/delete-account` must stay unauthenticated — it backs the public Play Store account-deletion form (`account-deletion.html`). This was counterintuitive during the audit (looks like a gap) but is actually required by App Store policy: a user who has uninstalled the app must be able to request account deletion with no token. Not a bug; a spec requirement.

- `app/__pycache__/*.pyc` files are tracked in git despite `__pycache__/` in .gitignore (they were committed before the rule) — same class of hygiene debt as the venvs; not fixed this sprint. Confirmed they exist at `app/__pycache__/__init__.cpython-311.pyc` etc.; left for a future cleanup pass alongside the remaining git-tracked database files.

- A user who registered mobile before this fix may hold a `web`-typed row containing an Expo token (the old code picked "any token row for this user") — it self-heals when they re-enable browser notifications (`/notifications/web-subscribe` replaces all web rows). No database migration needed; the row repairs itself on next action. Captured in architecture.md as an assumption.
