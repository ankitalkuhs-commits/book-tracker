---
screen: sprint-2-audit-bugs
feature: maintenance
repo: api (+ repo root for git hygiene)
status: tested
last_verified: 2026-09-13
approved_by: PM ("Next sprint", 2026-09-13) — scope chosen from retros/doc-sync-2026-09-13.md carried items
---

## What It Does
Fixes the seven backend correctness bugs found in the 2026-09-12 read-through (`context/LOAD_ME_FIRST.md` → September 12 audit) and removes the last accidentally-tracked files from git. Backend only. No response-shape changes. No client changes, no mobile build, no DB migration.

## Appetite
Max complexity: simple–medium (1–2 days). Each item is a few lines; the cost is in the tests.

Not building:
- Removing `/auth/signup` + `/auth/login` — PM decision still open
- Auth on `/api/googlebooks/*` — PM decision still open
- Dead client calls (web `demoLogin`, mobile `userAPI.getUser`) — client edits, mobile needs a build
- DB repair for userbooks whose status was reset by the pre-May-4 rating bug — production data write, needs explicit PM approval
- Making the streak reminder actually fire on the free tier (Render is asleep at 14:30 UTC) — infra decision
- Deleting `crash.txt` or the loose `migrate_*.py` / `check_*.py` scripts from disk — mention only

## Requirements
- [ ] R1 **Friends feed order** — `GET /notes/friends-feed` (`notes_router.get_friends_feed`) returns posts from mutual follows first, then non-mutual, each group newest-first. Today the sort key + `reverse=True` puts non-mutual first.
- [ ] R2 **`/notes/me` liked_by_me** — `GET /notes/me` computes `liked_by_me` / `user_has_liked` from the caller's `Like` rows (same batch pattern as `/notes/feed`) instead of the hardcoded `True`.
- [ ] R3 **Private notes stay private in groups** — `POST /notes/` fires `note_posted` group activity only when `is_public` is true; `PUT /notes/{id}` does not fire anything new. A private note's title/text never reaches `GET /groups/{id}/activity`.
- [ ] R4 **Insights month buckets + streak** — `GET /reading-activity/insights`: `monthly_pages` is the last 12 calendar months by real month arithmetic (never skips February, never duplicates a month); `current_streak` counts back from today if there is activity today, else from yesterday (a reader who read yesterday but not yet today shows their streak, not 0). `longest_streak` unchanged.
- [ ] R5 **No PII in logs** — `profile_router.get_profile` no longer logs the profile (`logging.warning` with email etc.) on every call. Remove the block; do not replace with a debug log of the same data.
- [ ] R6 **Streak reminder through the dispatcher** — `notifications/scheduler.py` sends via `fire_event(event_type="reading_streak_reminder", actor_id=0, actor_name="TrackMyRead", recipient_ids=[...])` so user prefs, daily cap, web push and NotificationLog all apply (today it calls `send_expo_push` directly, ignores `reading_streak_reminder=false`, and never reaches web). Recipients: users with **any** push token (expo or web) who were not active today. The `title`/`body` come from `config.py` as before.
- [ ] R7 **Admin broadcast on both channels** — `POST /admin/push/broadcast` delivers to every user with any push token via the dispatcher's channel senders (`send_expo_push` + `send_web_push` per distinct user) with the admin-supplied title/body, and writes a `NotificationLog` row per recipient (`event_type="admin_broadcast"`, `actor_id=<admin id>`). `send_push_to_many` / `app/utils/push.py` are no longer imported by any router (leave the file; mention if it becomes dead).
- [ ] R8 **Git hygiene** — `app/**/__pycache__/*.pyc` and `book_tracker.db` removed from the git index only (both are already covered by `.gitignore`); `git status` no longer lists `.pyc` changes. Own commit, like the venvs.
- [ ] R9 `pytest tests -q` stays green with new tests for R1–R7. `python scripts/gen_dependency_map.py` re-run.

## Screen States
Not applicable — no UI. Client-visible effects: friends feed reorders; own-notes list shows real like state; group activity stops leaking private notes; insights charts show correct months and streak.

## Done Checklist (PM verifies after deploy)
1. As a user who follows A (mutual) and B (not mutual), with B's post newer than A's → `GET /notes/friends-feed` lists A's post first.
2. Like one of my own notes → `GET /notes/me` shows `liked_by_me: true` for it and `false` for the others.
3. Post a note with `is_public: false` while in a group → `GET /groups/{id}/activity` has no `note_posted` entry for it.
4. `GET /reading-activity/insights` → `monthly_pages` has 12 entries, consecutive `YYYY-MM`, ending this month.
5. Render logs after `GET /profile/me` → no `/profile/me response:` line.
6. Admin broadcast from AdminPage → a web-push subscriber receives it, and their `/notifications/history` shows an `admin_broadcast` row.

## Parity
- [x] api
- [ ] web — no change
- [ ] mobile — no change, no build
