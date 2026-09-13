---
screen: sprint-1-hardening
feature: security
repo: api (+ repo root for git hygiene)
status: production
last_verified: 2026-09-13
approved_by: PM ("run the first sprint", 2026-09-12)
---

## What It Does
Closes the four CRITICAL/HIGH items from the 2026-09-12 read-through audit (`context/LOAD_ME_FIRST.md` → Recently Shipped, September 12). No user-visible behaviour changes for either client; the visible effect is that anonymous callers can no longer read or delete the book catalog, and a user who uses both web and mobile keeps both push channels.

## Appetite
Max complexity: simple (1 day). Backend + repo hygiene only. No mobile build required (no client code changes).

Not building:
- Removing the legacy password endpoints `/auth/signup`, `/auth/login` (PM decision pending — see retros/doc-sync-2026-09-12.md)
- Auth on `/api/googlebooks/*` (separate decision — the landing page may want anonymous search later)
- The friends-feed sort, `/notes/me liked_by_me`, scheduler, insights bucket, streak, private-note activity, profile logging bugs (next sprint)
- Deleting `crash.txt`, the loose `migrate_*.py` scripts, or `book_tracker.db` from git (mention, do not do)

## Requirements
- [ ] R1 — `books_router.py`: `GET /books/`, `GET /books/{id}`, `POST /books/` require `get_current_user`; `DELETE /books/{id}` requires `get_admin_user`. `GET /books/` gets a `limit` (default 50, max 200).
- [ ] R2 — `POST /auth/delete-account` (the anonymous Play-Store deletion form, backed by `account-deletion.html`) stays unauthenticated. Not a bug. Record why in learnings.
- [ ] R3 — `push_router.py`: register and deregister select/upsert `PushToken` **with `token_type == "expo"`**; a user's web-push row is never touched by mobile register/logout. Registering the same Expo token twice does not create a duplicate row.
- [ ] R4 — `pytest tests -q` is fully green. The 12 failures in `tests/test_books.py` and `tests/test_reading_activity.py` are fixed by updating the helpers to the current flat `add-to-library` response shape (the shape is the contract; the tests were stale). Add tests for R1 and R3.
- [ ] R5 — `.venv/` and `venv/` are removed from the git index (`git rm -r --cached`), `.venv/` is added to `.gitignore`, and `git status` no longer shows any `.venv/`/`venv/` lines. Working directories are NOT deleted from disk.
- [ ] R6 — `python scripts/gen_dependency_map.py` re-run; the ⚠️ marks on the four `/books` routes are gone.

## Screen States
Not applicable — no UI. Client behaviour with an expired token is unchanged (401 → clearToken → login), because both clients already send `Authorization` on every call to these routes.

## Done Checklist (PM verifies)
1. ✅ 2026-09-13 08:21 UTC+5:30 — `curl -X DELETE https://book-tracker-stitch.onrender.com/books/1` no token → `HTTP/1.1 401 Unauthorized` (verified live after Render deploy of 0cd4e09).
2. ✅ 2026-09-13 — anonymous `GET /books/` → `401` (was `200` until the deploy landed at 08:21:53); anonymous `GET /books/1` → `401`. Token path covered by `TestCatalogList` in pytest.
3. ⏳ PM — log in on web, subscribe to web push, then log in on the Android app → `SELECT token_type, count(*) FROM pushtoken WHERE user_id = me` shows one `web` and one `expo`. Log out on mobile → the `web` row remains.
4. `pytest tests -q` → 0 failed.
5. `git status --short | grep -c venv` → `0`.

## Parity
- [x] api
- [ ] web — no change
- [ ] mobile — no change, no build
