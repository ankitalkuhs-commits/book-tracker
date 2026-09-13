---
screen: sprint-2-audit-bugs
feature: maintenance
last_verified: 2026-09-13
---

## Web (book-tracker-frontend-stitch)
No web files touched this sprint — no page, component, or `api.js` change (spec Parity: web = no change).

## Mobile (book-tracker-mobile-stitch)
No mobile files touched this sprint — no screen, `api.js`, or `app.json` change (spec Parity: mobile = no change, no build).

## Backend (app/)
| What | File | Notes |
|---|---|---|
| Route handler (R1) | `app/routers/notes_router.py :: get_friends_feed()` | Sort block replaced with a single-key stable sort on mutual-ness only; DB already returns newest-first and `list.sort` is stable in CPython, so order inside each group is preserved without touching `created_at`. |
| Route handler (R2) | `app/routers/notes_router.py :: get_my_notes()` | Added a batched `liked_set` query (`Like.user_id == current_user.id`, `IN(note_ids)`) after the `comments_map` block; `liked_by_me` and `user_has_liked` are now both set from `user_has_liked = n.id in liked_set` instead of the hardcoded `True`. |
| Route handler (R3) | `app/routers/notes_router.py :: create_note()` | `fire_group_activity_for_user(..., "note_posted", ...)` now runs only `if is_public:`. `update_note()` untouched — confirmed it fires nothing. |
| Route handler (R4) | `app/routers/reading_activity_router.py :: get_reading_insights()` | Streak anchor: `check = today if today in active_dates else today - timedelta(days=1)`. Month buckets: walk back by decrementing year/month instead of `- timedelta(days=i*30)`, then `.reverse()` for oldest-first. `longest_streak` and both `/daily` routes untouched. |
| Route handler (R5) | `app/routers/profile_router.py :: get_profile()` | Deleted the `import logging` + `_log_data` dict + `logging.warning(...)` block (was lines 80-93). No replacement log at any level. Response dict below it is byte-identical. |
| Scheduler (R6) | `app/notifications/scheduler.py :: _send_inactivity_reminders()` | Removed `from .push_mobile import send_expo_push`; added `from .dispatcher import fire_event`. Recipient query no longer filters `PushToken.token_type` (was `== "expo"`) — now `select(PushToken.user_id).distinct()` across all channels. Body now builds `recipient_ids` and calls `fire_event(event_type="reading_streak_reminder", actor_id=0, actor_name="TrackMyRead", recipient_ids=...)` instead of calling `send_expo_push` + writing `NotificationLog` by hand. `start_scheduler` / `stop_scheduler` / `CronTrigger(hour=14, minute=30)` untouched. |
| Config (R7) | `app/notifications/config.py` | Added `"admin_broadcast"` entry to `NOTIFICATION_EVENTS` (Operational block, end of dict): `is_active: True`, `daily_cap: False`, placeholder `title`/`body` (admin supplies real values at call time; this event does not go through `fire_event`'s templating). |
| Route handler (R7) | `app/routers/admin_router.py :: broadcast_push_notification()` | Removed `from ..utils.push import send_push_to_many`; added `from ..notifications.push_mobile import send_expo_push`, `from ..notifications.push_web import send_web_push`, `from ..notifications.config import NOTIFICATION_EVENTS`. Handler now: checks `admin_broadcast.is_active` (early-return guard, see Diverged From Brief), queries `select(PushToken.user_id).distinct()`, and per distinct user calls `send_expo_push` + `send_web_push` + writes one `NotificationLog(event_type="admin_broadcast", actor_id=admin_user.id, ...)` row, single `db.commit()` at the end. Response shape unchanged: `{message, sent_to}`; `sent_to` now counts distinct users, not devices. `fire_event` import (used by `test_push_notification`) kept. |
| Tests | `tests/test_notes.py` | +`TestFriendsFeedOrder` (9), +`TestMyNotesLikeState` (6), +`TestPrivateNotesAndGroupActivity` (9), extended `TestFeed` (+2: community feed shape, private-profile 403), extended `TestLikesComments` (+1: notification log). Added module-level helpers `_backdate`, `_create_group`, `_note_posted_events`. |
| Tests | `tests/test_reading_activity.py` | +`TestInsightsMonthBuckets` (6), +`TestInsightsStreak` (6), extended `TestDailyStats` (+1: shape unchanged). Added `_log_activity` helper. |
| Tests | `tests/test_follow_profile.py` | +`TestProfileMeNoPII` (5): no-email-at-WARNING, response shape, no-PII-at-DEBUG, public profile shape (incl. locked view), follow still writes `NotificationLog`. |
| Tests | `tests/test_admin.py` | +`TestAdminBroadcast` (10), autouse fixture patches `app.routers.admin_router.send_expo_push` / `send_web_push` so no test hits Expo's live API. Added helpers `_give_token`, `_distinct_token_user_ids`, `_broadcast_rows`. |
| Tests | `tests/test_scheduler.py` | New file, 8 module-level tests. `scheduler_env` fixture monkeypatches `app.notifications.scheduler.engine` to the test engine and patches `app.notifications.dispatcher.send_expo_push` / `send_web_push`. Covers expo recipient, web-only recipient, active-today skip, preference opt-out (+ per-key isolation), daily cap, no-token skip, config `is_active: False` no-op, and "never starts APScheduler." |
| Migration | none | No `models.py` change; no `context/supabase_migration.sql` edit — every column used already exists and is already written by shipped code. |

## Repo hygiene (R8)
| What | File | Notes |
|---|---|---|
| Git index | `app/__pycache__/` (7 files), `app/routers/__pycache__/` (10 files), `book_tracker.db` | `git rm -r --cached app/__pycache__ app/routers/__pycache__` + `git rm --cached book_tracker.db` staged (18 files total). **Not committed** — the orchestrator commits, per this sprint's instructions. All files remain on disk untouched (`--cached` only). |
| Ignore rule | `.gitignore` | Not edited — already covers `__pycache__/`, `*.py[cod]`, `*.pyc`, `*.db`, `book_tracker.db` (lines 8, 9, 11, 14, 15). |

## Dependency map (R9)
| What | File | Notes |
|---|---|---|
| Regenerated appendix | `dependency-map.md` (generated section) | `python scripts/gen_dependency_map.py` re-run: 107 routes, 2 orphan client calls, 11 unused fns, 14 high fan-out endpoints. Diff is line-number shifts only (files grew from the guard/import additions) — no route added, removed, or re-authed; no `⚠️` appeared or disappeared. |
| Curated section | `dependency-map.md` → `### app/notifications/dispatcher.py :: fire_event() + config.py` | Already updated by the Architect before build: records `scheduler.py` as a `fire_event` caller (`reading_streak_reminder`, `actor_id=0`) and documents `admin_broadcast` as the one deliberate exception that bypasses `fire_event`. Confirmed the generator did not overwrite this block. |

## Notes
- `app/utils/push.py` is **not** dead: `app/routers/likes_comments.py:7` still imports `send_push_notification_to_user` from it (imported, never called — pre-existing, unrelated to this sprint). Left both files untouched per spec.
- The `_check_daily_cap` local-vs-UTC day-window mismatch (`dispatcher.py`) is pre-existing and out of scope; `tests/test_scheduler.py::test_inactivity_reminder_daily_cap_prevents_second_send` calls the function twice in immediate succession within the same test process, so it is not exposed to the midnight–05:30 IST window described in tests.md T42 — no time-freezing was needed to keep it deterministic in this run, but if it ever flakes in that window it is the documented pre-existing issue, not a sprint-2 regression.
- `tests/conftest.py`'s shared in-memory DB means R6/R7 tests scan `PushToken` rows created by other test files too; every assertion in the new tests is scoped to that test's own user id, never a global count (per the brief's guidance).
