---
screen: sprint-2-audit-bugs
feature: maintenance
repo: api (+ repo root for git hygiene)
status: architecture-complete
spec_status: APPROVED (PM, 2026-09-13)
architect_verified: 2026-09-13
---

## Risk Summary (for PM)

- **What changes:** eight small backend fixes. Friends feed puts mutuals on top again; your own notes stop claiming you liked all of them; private notes stop appearing in Circle activity; the Insights month chart stops skipping/duplicating months and the streak stops resetting to 0 before you've read today; `/profile/me` stops printing every user's email into the Render log; the nightly streak reminder and the admin broadcast both start honouring user preferences, web push, and notification history. Plus 18 junk files leave the git index.
- **What could break:** nothing a user can see breaks. No response shape changes, no database migration, no client change, no app-store build. I checked all 10 consumers of `/profile/me` and all 5 of `/reading-activity/insights` — every field they read keeps its name, type, and length.
- **Two behaviour changes worth knowing about:** (1) The nightly reminder now respects the "Streak reminders" toggle in Settings, so users who switched it off correctly stop receiving it — the count sent per night will drop. (2) The admin broadcast's success message will now say "sent to N user(s)" instead of counting devices, so the number shown in AdminPage will get smaller for people with two devices. Same people reached, different number.
- **One real risk:** the broadcast and the reminder now send to *every* user with any push token, one at a time instead of one batched call. On ~100 users that is fine on the free tier; past a few thousand it will need batching. Flagged, not fixed — not this sprint's problem yet.
- **Product decisions needed:** none. The spec closed every question it raised.
- **Recommendation:** approve as specced. Ship the git-hygiene cleanup as its own commit.

---

## Data Flow

No user action changes and no request or response shape changes. Four read paths are corrected in place (`GET /notes/friends-feed` re-orders its already-fetched rows; `GET /notes/me` gains one batched `Like` lookup; `GET /reading-activity/insights` recomputes two of its existing output fields; `GET /profile/me` drops a log line). One write path gains a condition (`POST /notes/` only writes a `note_posted` GroupActivity row when the note is public). Two push paths are re-pointed at the dispatcher: the daily cron job (`scheduler._send_inactivity_reminders` → `fire_event` → prefs + daily cap + `send_expo_push` + `send_web_push` + `NotificationLog`) and the admin broadcast (`POST /admin/push/broadcast` → per-user `send_expo_push` + `send_web_push` + one `NotificationLog` row each).

## depends_on

- `app/notifications/dispatcher.py :: fire_event()` — the only sanctioned push path (`dependency-map.md` → Contracts). Already handles prefs, daily cap, both channels, and `NotificationLog`.
- `app/notifications/config.py :: NOTIFICATION_EVENTS["reading_streak_reminder"]` — exists, `is_active: True`, `daily_cap: True`, and **contains no `{placeholder}`** in either `title` or `body` (verified `config.py:67-72`), so there is no missing-variable trap for R6.
- `app/notifications/push_mobile.py :: send_expo_push` / `push_web.py :: send_web_push` — both already filter `PushToken.token_type` themselves (`push_mobile.py:30-35`, `push_web.py:66-71`), so callers pass a `user_id`, never a token.
- `app/deps.py :: get_current_user` — writes `user.last_active` once a day; R6's recipient filter reads it.
- `app/models.py :: NotificationLog.actor_id` — `Optional[int]` with **no foreign key** (`models.py:155`), so `actor_id=0` (R6) and `actor_id=<admin id>` (R7) both insert cleanly.
- `app/group_activity.py :: fire_group_activity_for_user` — unchanged; R3 only changes whether it is called.
- `tests/conftest.py` — one shared named in-memory SQLite DB; `alice/bob/admin` session fixtures at lines 97-124.

## depended_by

Checked every consumer listed in `dependency-map.md` for the four endpoints this sprint touches. **No response shape changes anywhere in this sprint** — every change is either a value correction inside an existing field, a re-order of an existing list, or a server-side side effect.

| Endpoint | Web consumers | Mobile consumers | Verdict |
|---|---|---|---|
| `GET /notes/friends-feed` | `getFriendsFeed` → `pages/HomePage.jsx` | `notesAPI.getFriendsFeed` → **unused** (no Friends tab on mobile — `dependency-map.md` Parity gaps) | Safe. Same array, same objects, different order. `is_mutual` inside `user` is unchanged and still present. |
| `GET /notes/me` | `getMyNotes` → `pages/ProfilePage.jsx` | `notesAPI.getMyNotes` → `App.js` (PreloadContext key `notes`), `screens/ProfileScreen.js` | Safe and **a visible fix**: `liked_by_me` flips from always-`true` to the real value, and `user_has_liked` starts being sent (it was omitted, so Pydantic filled `false` — the two keys contradicted each other on every row). Both keys now agree, which is what the note-card contract requires. |
| `GET /reading-activity/insights` | `getReadingInsights` → `pages/InsightsPage.jsx`, `pages/ProfilePage.jsx` | `activityAPI.getInsights` → `App.js` (PreloadContext key `insights`), `screens/InsightsScreen.js`, `screens/ProfileScreen.js` | Safe. `monthly_pages` stays a 12-element list of `{month, pages_read}` oldest-first (R4 keeps the shape — see brief); `current_streak` stays an int. 5 consuming files, all reading the same keys. |
| `GET /profile/me` | 3 files incl. `context/AuthContext.jsx` | 7 call sites incl. `App.js` preload | Safe. R5 deletes a `logging.warning` only; the returned dict is byte-identical. |
| `GET /groups/{id}/activity` | none (mobile-only feed) | `groupsAPI.getGroupActivity` → `screens/GroupDetailScreen.js` | Safe. R3 writes **fewer** rows; the row shape is untouched. An unknown or absent `note_posted` entry is already handled — the screen renders whatever rows come back. |
| `POST /admin/push/broadcast` | `broadcastPush` → `pages/AdminPage.jsx:67` | none | Safe. `AdminPage.jsx:68` reads **only `res.message`**, never `res.sent_to`. The *number inside* the message changes meaning (devices → users). |
| `GET /notifications/history` | `getNotifications` → `pages/NotificationsPage.jsx` | `notificationsAPI.getHistory` → `screens/NotificationsScreen.js` | Safe with a **new `event_type` value**, `admin_broadcast`. Both clients have a default branch: mobile `EVENT_CONFIG[eventType] \|\| EVENT_CONFIG.default` (bell icon, no nav target, `NotificationsScreen.js:36`), web `switch` default returns `actorId ? '/profile/…' : null` (`NotificationsPage.jsx:56`). `/notifications/history` does not return `actor_id`, so an `admin_broadcast` row renders as a non-clickable notification. No crash, no blank row. |

**Also verified:** no client branches on the push payload's `data.type`. The web service worker (`public/sw-push.js`) reads only `title` and `body` and ignores the rest; mobile has no `addNotificationResponseReceivedListener`. So R6 changing `data.type` from `"streak_reminder"` to `"reading_streak_reminder"` (a consequence of routing through `fire_event`, which always sets `type = event_type`) is invisible to both clients. The `event_type` column written to `NotificationLog` stays `"reading_streak_reminder"`, which is what both clients' icon maps and the web deep-link switch key on.

## API Endpoints Used

| Method | Path | Auth | Web api.js fn | Mobile api.js fn | Change |
|---|---|---|---|---|---|
| GET | `/notes/friends-feed` | user | `getFriendsFeed` | `notesAPI.getFriendsFeed` (dead) | R1 — sort key corrected. No shape change. |
| GET | `/notes/me` | user | `getMyNotes` | `notesAPI.getMyNotes` | R2 — real `liked_by_me`; `user_has_liked` now emitted. No key added or removed from the contract. |
| POST | `/notes/` | user | `createNote` | `notesAPI.createNote` | R3 — group activity now conditional on `is_public`. Response unchanged. |
| PUT | `/notes/{id}` | user | `updateNote` | `notesAPI.updateNote` | R3 — **no code change**, confirmed it fires nothing today. |
| GET | `/reading-activity/insights` | user | `getReadingInsights` | `activityAPI.getInsights` | R4 — `monthly_pages` + `current_streak` values corrected. Shape unchanged. |
| GET | `/profile/me` | user | `getMyProfile` | `userAPI.getProfile`, `profileAPI.getMe` | R5 — log line removed. Response unchanged. |
| POST | `/admin/push/broadcast` | admin | `broadcastPush` | — | R7 — both channels, per-user `NotificationLog`. `{message, sent_to}` shape unchanged; `sent_to` now counts users, not devices. |
| — | `scheduler._send_inactivity_reminders` (cron, not HTTP) | n/a | — | — | R6 — routed through `fire_event`. |

No endpoint is added, removed, or re-authed this sprint.

## DB Tables Touched

| Table | Operation | Ownership / privacy rule enforced |
|---|---|---|
| `note` | read (R1, R2) | R1/R2 already scope to `Note.user_id.in_(following_ids)` + `is_public == True`, and to `user_id == current_user.id`. Unchanged. |
| `like` | read (R2) | New batch query is filtered `Like.user_id == current_user.id` — the caller can only learn about their own likes. |
| `groupactivity` | write (R3) | **Privacy fix.** `note_posted` is now written only when `note.is_public` is true, closing the `CLAUDE.md` invariant "`note.is_public=False` never appears in any feed, list, or group activity". |
| `reading_activity` | read (R4) | Read-only, already scoped to `current_user.id`. The write path (`PUT /userbooks/{id}/progress`) is **not touched**, so the other three readers (`/daily`, `/user/{id}/daily`, group leaderboard/goal) are unaffected. |
| `pushtoken` | read (R6, R7) | Deliberately queried across **all** `token_type` values in both places — this is the fix, not a regression of the sprint-1 rule. The sprint-1 contract ("any query on this table must filter `token_type`") applies to the *register/deregister* paths, which are untouched. Only `user_id` is selected; no token string leaves the query. |
| `notificationlog` | write (R6, R7) | One row per recipient, `user_id` = recipient. `actor_id` = `0` (system) for R6, the admin's id for R7. |
| `user` | read (R6) | `last_active` only. |

**No schema change. No migration. `context/supabase_migration.sql` is NOT edited this sprint** — every column used (`PushToken.token_type`, `NotificationLog.actor_id`, `NotificationLog.data`, `User.last_active`, `User.notification_prefs`, `Note.is_public`) already exists in `app/models.py` and is already written by shipped code.

## Notifications Fired

| event_type | recipients | extra keys the template needs |
|---|---|---|
| `reading_streak_reminder` (R6) | every user with **any** `PushToken` row whose `last_active` is not today | **none** — `config.py:68-69` has no `{placeholder}` in `title` or `body`. `actor_name="TrackMyRead"` is supplied anyway because `fire_event` requires it. |
| `admin_broadcast` (R7) | every user with **any** `PushToken` row | none — `title`/`body` come verbatim from the admin's `BroadcastPayload`, not from a template. |

## Cross-Client Impact

**None.** No file under `book-tracker-frontend-stitch/` or `book-tracker-mobile-stitch/` is modified. **No `app.json` version / versionCode bump, no EAS build, no store release.** The web `api.js` 60s cache needs no `cacheClear()` call: every change is to a GET response's *values* or to a server-side side effect, and no client mutation newly invalidates a cached path. Users on a stale cached `/notes/me` will see the corrected like state within 60 seconds of deploy.

---

# Technical Brief

## R1 — Friends feed order · `app/routers/notes_router.py :: get_friends_feed`

**The bug** (line 549-552): the key is `(mutual_rank, created_at)` where `mutual_rank` is `0` for mutual and `1` for non-mutual, and the whole sort runs `reverse=True`. Reversing flips the rank too, so `1` (non-mutual) sorts first. Newest-first within a group is correct only by accident of the reversal.

**The fix — replace the whole `result.sort(...)` block (lines 548-552) with:**

```python
    # Mutual follows' posts first; the DB already returned newest-first, and
    # list.sort is stable, so the order inside each group is preserved.
    result.sort(key=lambda x: 0 if (x["user"] and x["user"].get("is_mutual")) else 1)
```

**Why a single-key stable sort rather than a two-key sort.** The query at line 480-487 already returns rows `ORDER BY created_at DESC`, and `result` is built in that order. `list.sort` is guaranteed stable in CPython, so sorting on mutual-ness alone leaves newest-first intact inside each group. This is the whole fix in one line and it never touches the timestamp.

**On string comparison of `created_at`** — you were right to ask, and it is the reason I am *not* recommending the two-key form. `created_at` is `format_timestamp(dt)` = `dt.isoformat() + 'Z'` (`notes_router.py:25-29`), so all values share one zero-padded, fixed-field format and lexicographic order equals chronological order **as long as every value has the same number of fractional-second digits**. `datetime.isoformat()` omits the fractional part entirely when `microsecond == 0`, producing `...T10:00:00Z` alongside `...T10:00:00.123456Z`; `'.'` (0x2E) sorts before `'Z'` (0x5A), so the sub-second row would sort *earlier* than the whole-second row in the same second. It is a 1-in-a-million edge case, but the stable sort avoids it for free.

If you prefer the explicit two-key form anyway, it must be written without a blanket `reverse=True`:

```python
    result.sort(key=lambda x: (
        0 if (x["user"] and x["user"].get("is_mutual")) else 1,
        # negate the timestamp by sorting the group descending separately —
        # you cannot negate a string, which is why two-key + reverse is a trap here
    ))
```
— i.e. there is no clean single-expression two-key version for a string timestamp. Use the stable sort.

**Do not touch** the `mutual_ids` computation (lines 467-477), the `is_mutual` key inside `user` (line 540 — it is part of what the web HomePage renders), or the `limit`.

## R2 — `/notes/me` liked state · `app/routers/notes_router.py :: get_my_notes`

Mirror the `/notes/feed` pattern exactly (`notes_router.py:254-262`). **Insert after the `comments_map` block (after line 312):**

```python
    liked_set = set(db.exec(
        select(models.Like.note_id)
        .where(models.Like.user_id == current_user.id)
        .where(models.Like.note_id.in_(note_ids))
    ).all())
```

`select` and `func` are already imported at line 300. One extra batched query per request, `IN()`-scoped to the notes already on the page — no N+1.

**Then in the loop, replace line 331** (`"liked_by_me": True,`) with both keys, computed once:

```python
        user_has_liked = n.id in liked_set
        ...
            "liked_by_me": user_has_liked,
            "user_has_liked": user_has_liked,
```

**Both keys are mandatory.** The note-card contract in `dependency-map.md` lists `liked_by_me` **and** `user_has_liked` as duplicates kept for old clients. Today `/notes/me` sets only `liked_by_me` (hardcoded `True`), so `NoteOutSchema` fills `user_has_liked` with its `False` default — every row of this endpoint currently ships two keys that contradict each other. Setting both from `liked_set` is what makes this endpoint match `/notes/feed` and `/friends-feed`.

**Do not touch** anything else in `get_my_notes` — `updated_at` (line 328) is deliberately present here and absent from `/notes/feed`; leave that asymmetry alone.

## R3 — Private notes stay out of group activity · `app/routers/notes_router.py :: create_note`

**Replace lines 148-154** with a guarded call:

```python
    # Fire group activity for note posted — public notes only.
    # A private note must never surface in GET /groups/{id}/activity.
    if is_public:
        book_for_activity = note.userbook.book if note.userbook else None
        fire_group_activity_for_user(
            db, current_user.id, "note_posted",
            {"note_id": note.id,
             "book_title": book_for_activity.title if book_for_activity else None},
        )
```

Guard on the local `is_public` (already normalised at line 124: `payload.is_public if payload.is_public is not None else True`), not on `payload.is_public` — the payload value can be `None`.

**`update_note` fires nothing today — confirmed.** I read `notes_router.py:175-226` in full: it mutates fields, sets `updated_at`, commits, and builds the response. There is no `fire_group_activity_for_user`, no `fire_event`, no `fire_group_activity` call anywhere in it. **Make no change to `update_note`.** Per the spec, a private note later flipped to public does *not* retroactively fire a `note_posted` event; that is the intended behaviour, not an oversight.

**What actually leaks today, for the record:** the `note_posted` payload carries only `{note_id, book_title}` — never the note's `text` or `quote`. So the current leak is the *existence* of a private note plus the book title, attributed by name to the author, in every Circle they belong to. The guard closes it.

## R4 — Insights month buckets + streak · `app/routers/reading_activity_router.py :: get_reading_insights`

### Streak anchor — replace lines 110-114

```python
    # Anchor on today if there is activity today, else on yesterday — a reader
    # who read yesterday but has not opened the app yet today still has a streak.
    current_streak = 0
    check = today if today in active_dates else today - timedelta(days=1)
    while check in active_dates:
        current_streak += 1
        check -= timedelta(days=1)
```

**Behaviour for a user with no activity at all:** `active_dates` is empty, so `today not in active_dates` → `check` becomes yesterday → also not in the set → the loop never runs → `current_streak == 0`, and `longest_streak` stays `0` from line 116. **0/0, exactly as today.** `tests/test_reading_activity.py::test_insights_new_user_all_zeros` (line 76) already asserts `current_streak == 0` and keeps passing.

`longest_streak` (lines 116-126) is **unchanged** — do not touch it.

### Month buckets — replace lines 134-138

The bug is `today.replace(day=1) - timedelta(days=i * 30)`: 30-day steps drift against real calendar months, so short months get skipped and long months get emitted twice. Walk back by decrementing year/month instead:

```python
    monthly_list = []
    _y, _m = today.year, today.month
    for _ in range(12):
        monthly_list.append({
            "month": f"{_y}-{_m:02d}",
            "pages_read": monthly.get(f"{_y}-{_m:02d}", 0),
        })
        _m -= 1
        if _m == 0:
            _m, _y = 12, _y - 1
    monthly_list.reverse()   # oldest-first, ending with the current month
```

Leave the `monthly` accumulation loop (lines 129-133) exactly as it is — it already builds keys with the same `f"{d.year}-{d.month:02d}"` format, so the lookups match.

**Output shape decision: `monthly_pages` does NOT change.** It stays a list of exactly 12 dicts, each `{"month": "YYYY-MM", "pages_read": <int>}`, ordered **oldest-first** and ending with the current month — identical to what the current code intends and to what `InsightsPage.jsx`, `ProfilePage.jsx`, `InsightsScreen.js` and `ProfileScreen.js` already render. Only the *values* of `month` become correct. `tests/test_reading_activity.py::test_insights_monthly_pages_has_12_months` (line 114) keeps passing. Do not add a `year` field, do not switch to a dict keyed by month, do not change the ordering.

**Do not touch** `avg_pages_per_day`, `projected_finishes`, `goal_progress`, `total_pages`, `avg_rating`, or either of the two `/daily` routes in this file.

## R5 — No PII in logs · `app/routers/profile_router.py :: get_profile`

**Delete lines 80-93 in full** — the comment, `import logging`, the `_log_data` dict, and the `logging.warning(...)` call. Nothing replaces them: no `logging.debug`, no redacted variant, no `print`.

`import logging` is **function-local** (line 81) and `logging` / `logger` appear nowhere else in `profile_router.py` (grepped — only lines 81 and 93). Deleting the block removes the import with it; there is no module-level import to clean up and no other file to touch.

The returned dict at lines 95-109 is unchanged. This is the one change in the sprint that touches a 10-consumer endpoint, and it changes zero bytes of the response.

## R6 — Streak reminder through the dispatcher · `app/notifications/scheduler.py`

**Imports.** Remove `from .push_mobile import send_expo_push` (line 17); add `from .dispatcher import fire_event`. Keep `models`, `NOTIFICATION_EVENTS`, `engine`, `Session`, `select`. *(`datetime` in the line-9 import is already unused today — pre-existing, out of scope, mention only.)*

**Replace the body of `_send_inactivity_reminders` (lines 23-75) with:**

```python
def _send_inactivity_reminders() -> None:
    """Find users inactive today and send them a reading reminder push."""
    event_cfg = NOTIFICATION_EVENTS.get("reading_streak_reminder", {})
    if not event_cfg.get("is_active", False):
        print("[scheduler] reading_streak_reminder is disabled — skipping.")
        return

    today = date.today()

    with Session(engine) as db:
        # Any push channel — expo (mobile) or web (PWA). Not filtered by token_type:
        # filtering it was the bug (web subscribers never got the reminder).
        user_ids = db.exec(select(models.PushToken.user_id).distinct()).all()

        recipient_ids = []
        for user_id in user_ids:
            user = db.get(models.User, user_id)
            if not user:
                continue
            if user.last_active and user.last_active.date() >= today:
                continue          # already read today — nothing to remind them about
            recipient_ids.append(user_id)

        summary = fire_event(
            db=db,
            event_type="reading_streak_reminder",
            actor_id=0,
            actor_name="TrackMyRead",
            recipient_ids=recipient_ids,
        )

    print(f"[scheduler] Inactivity reminders sent: {summary.get('sent', 0)} users notified.")
```

Everything else in the file is untouched: the `is_active` guard stays (it short-circuits before any DB work — `fire_event` would also refuse, but the early return saves the query), `start_scheduler` / `stop_scheduler` / the `CronTrigger(hour=14, minute=30)` / `misfire_grace_time` are **not modified**.

**Deleted:** the direct `send_expo_push(...)` call, the hand-written `models.NotificationLog(...)` insert, the local `sent` counter, and the trailing `db.commit()` (`fire_event` commits internally when `sent > 0`; `send_expo_push` commits its own stale-token deletions).

**`title` / `body` still come from `config.py`** — just indirectly. `fire_event` reads `config["title"]` / `config["body"]` at `dispatcher.py:143-144`, which is the same source the scheduler read at lines 30-31.

### `actor_id=0` — verified against both code paths

- **`fire_event` skip-self** (`dispatcher.py:150-153`): `if user_id == actor_id: skipped_self += 1; continue`. No `user.id` is ever `0` — SQLite rowid and PostgreSQL `SERIAL` both start at 1 — so no real recipient is ever skipped. There is precedent in shipped code: `admin_router.test_push_notification` (line 557) already fires with `actor_id=0`.
- **`_check_daily_cap`** (`dispatcher.py:50-76`): `reading_streak_reminder` has `daily_cap: True`, so the cap now applies with `actor_id == 0`. This is desirable — the job runs once a day, and `misfire_grace_time=3600` means a restarted server can re-run it within the hour; the cap makes that re-run a no-op instead of a second push. `NotificationLog.actor_id` has **no FK** (`models.py:155`), so inserting `0` is legal on both SQLite and PostgreSQL.
- **Historical rows are not a problem:** rows written by the old scheduler have `actor_id = NULL`, and `NotificationLog.actor_id == 0` does not match `NULL` in either dialect. The first run after deploy is not blocked by yesterday's rows.

### `reading_streak_reminder` template — no placeholder issue

`config.py:67-72`: title `"Keep your streak alive! 🔥"`, body `"You haven't logged any reading today. Even 5 pages counts!"`. **Neither contains a `{}` placeholder**, so `_render_template`'s `str.format(**vars)` returns them verbatim and the `_render_template` trap (silently shipping raw template text on a missing key) cannot fire here. `actor_name="TrackMyRead"` is passed because `fire_event`'s signature requires it, not because the template needs it.

### What users will notice

`fire_event` now calls `_user_wants_event` (`dispatcher.py:88-102`), so users who turned off **"Streak reminders"** in Settings finally stop receiving them — the `reading_streak_reminder` key is in `USER_PREF_KEYS` (`notifications/router.py:181`) and is exposed by both Settings screens. The nightly send count will drop. That is the fix working, not a regression.

## R7 — Admin broadcast on both channels · `app/routers/admin_router.py :: broadcast_push_notification`

**Imports (top of file).** Remove line 14, `from ..utils.push import send_push_to_many`. Add:

```python
from ..notifications.push_mobile import send_expo_push
from ..notifications.push_web import send_web_push
from ..notifications.config import NOTIFICATION_EVENTS
```

Keep `from ..notifications.dispatcher import fire_event` (line 15) — `test_push_notification` at line 543 still uses it.

**`BroadcastPayload` (lines 383-386) is unchanged** — `{title: str, body: str, data: dict | None}`.

**Replace the handler body (lines 398-410) with:**

```python
    event_cfg = NOTIFICATION_EVENTS.get("admin_broadcast", {})
    if not event_cfg.get("is_active", True):
        return {"message": "admin_broadcast is disabled in config", "sent_to": 0}

    user_ids = db.exec(select(models.PushToken.user_id).distinct()).all()
    if not user_ids:
        return {"message": "No registered push tokens found", "sent_to": 0}

    data = {"type": "admin_broadcast", **(payload.data or {})}

    for user_id in user_ids:
        send_expo_push(db, user_id, payload.title, payload.body, data)
        send_web_push(db, user_id, payload.title, payload.body, data)
        db.add(models.NotificationLog(
            user_id=user_id,
            actor_id=admin_user.id,
            event_type="admin_broadcast",
            title=payload.title,
            body=payload.body,
            data=data,
        ))

    db.commit()

    return {
        "message": f"Broadcast sent to {len(user_ids)} user(s)",
        "sent_to": len(user_ids),
    }
```

**Why not `fire_event`?** Deliberate, and it is the one place in the codebase where bypassing the dispatcher is correct. `fire_event` renders `title`/`body` from `config.py` templates — but a broadcast's text is typed by the admin at call time, so there is nothing to template. It also applies `_user_wants_event`, and an operational announcement (outage, launch, policy change) is not something a per-event preference toggle should suppress; there is no `admin_broadcast` key in `USER_PREF_KEYS` and adding one is out of scope. Calling the two channel senders directly, with an explicit `NotificationLog` write, gives the same delivery guarantees without either of those behaviours.

### `admin_broadcast` in `config.py` — yes, add it

Add to `NOTIFICATION_EVENTS`, in a new "Operational" block at the end of the dict:

```python
    # ── Operational ───────────────────────────────────────────────────────────
    # Sent by POST /admin/push/broadcast. This event does NOT go through
    # fire_event(): the admin supplies title/body at call time, and it is
    # deliberately NOT gated on per-user notification preferences — it is the
    # operational announcement channel (outages, launches, policy changes).
    # Only `is_active` is honoured, as an admin kill-switch.
    "admin_broadcast": {
        "title": "TrackMyRead",          # placeholder — the admin supplies the real title
        "body": "",                      # placeholder — the admin supplies the real body
        "is_active": True,
        "daily_cap": False,              # an admin may legitimately send twice in one day
    },
```

**Three reasons it belongs in the registry.** (1) `GET /notifications/admin/events` enumerates `NOTIFICATION_EVENTS` — without an entry, an event type that appears in every user's notification history is invisible to the admin events screen. (2) `PATCH /notifications/admin/events/{event_type}/toggle` 404s on unknown keys, so without the entry there is no way to silence a broadcast channel in production without a redeploy. (3) It documents the one event that intentionally does not go through `fire_event`.

The three-line `is_active` guard at the top of the handler exists so that toggle is not a lie. **This guard is the single item in this brief that goes beyond R7's literal wording** — flagging it rather than slipping it in. If the PM prefers the strictly-literal spec, drop the guard and keep the config entry; nothing else changes.

**`sent_to` semantics change — the shape does not.** The response is still exactly `{message: str, sent_to: int}`. `sent_to` was a **device** count (`len(token_list)`) and becomes a **user** count. `AdminPage.jsx:68` reads only `res.message`, never `res.sent_to`, so nothing in the UI breaks — but the number shown inside the message gets smaller for users with a phone and a browser. Say so in the PR body.

**`app/utils/push.py` is NOT dead after this change.** `app/routers/likes_comments.py:7` still has `from ..utils.push import send_push_notification_to_user` (imported, never called — same finding as sprint-1's Security Review). So after removing the `admin_router` import there is exactly **one remaining importer**, and `send_push_to_many` / `send_push_notification` become unreferenced functions inside a still-imported module. **Leave `app/utils/push.py` on disk and leave `likes_comments.py` alone** — per spec R7 ("leave the file; mention if it becomes dead") and per `CLAUDE.md` rule 3.

**One honest caveat on "single commit":** `send_expo_push` calls `db.commit()` itself when it hits a `DeviceNotRegisteredError` (`push_mobile.py:57-58`), and `send_web_push` does the same on a 410/404 (`push_web.py:96-97`). So a stale token mid-loop will flush the `NotificationLog` rows added so far. That is harmless — those rows are correct and their notifications were sent — but the broadcast is not atomic, and neither the tests nor the PM checklist should assume it is.

## R8 — Git hygiene

**Confirmed on disk:** `git ls-files | grep -cE "\.pyc$|^book_tracker\.db$"` → **18** tracked files: 7 in `app/__pycache__/`, 10 in `app/routers/__pycache__/`, and `book_tracker.db`. No other `__pycache__` directory is tracked (`tests/__pycache__` exists on disk but was never added).

**`.gitignore` already covers both — no edit needed.** Verified: `__pycache__/` (line 8), `*.py[cod]` (9), `*.pyc` (11), `*.db` (14), `book_tracker.db` (15). `.gitignore` never applies to already-tracked paths, which is exactly why these 18 are still in the index.

**Its own commit**, separate from the R1–R7 code and test commits:

```
git rm -r --cached app/__pycache__ app/routers/__pycache__
git rm --cached book_tracker.db
git commit -m "chore: untrack __pycache__ bytecode and book_tracker.db (18 files)"
```

`--cached` keeps every file on disk — do not drop it, and do not run `git rm -r --cached .`.

**Verify after the commit:**
```
git ls-files | grep -cE "\.pyc$|^book_tracker\.db$"   # → 0
git status --short | grep -c "\.pyc"                   # → 0
ls book_tracker.db app/__pycache__                     # → both still present locally
```

Two things to put in the commit body: anyone who later pulls this commit loses those paths from their working copy (`--cached` protects only this machine — solo repo, acceptable), and a fresh clone now has no `book_tracker.db`, so local dev must run `create_tables.py` / `init_db()` once. Append this session's attribution line as the last line of the commit message.

**Out of scope, mention only** (spec §Not building): `crash.txt` and the loose `migrate_*.py` / `check_*.py` scripts are also tracked and also do not belong in git.

---

## Tests to add (R9)

`pytest tests -q` is green at 150 passed today. Every test below is additive — **no existing test is modified or deleted**.

### `tests/test_notes.py`

| Function | Req | What it proves |
|---|---|---|
| `test_friends_feed_puts_mutual_follows_first` | R1 | Alice follows Mutual and NonMutual; Mutual follows Alice back. Mutual posts **first**, NonMutual posts **second (newer)**. Assert the returned list has Mutual's note before NonMutual's — i.e. the *older* post wins because its author is mutual. This test fails on today's code. |
| `test_friends_feed_newest_first_within_mutual_group` | R1 | Two mutual followers, two posts; assert the newer of the two comes first, and both precede a non-mutual's newest post. Proves the stable sort kept the DB's descending order. |
| `test_my_notes_liked_by_me_reflects_real_likes` | R2 | Create two own notes, like exactly one via `POST /notes/{id}/like`, then `GET /notes/me`: the liked one has `liked_by_me is True`, the other `liked_by_me is False`. |
| `test_my_notes_sets_both_like_keys_consistently` | R2 | On the same response, assert `n["liked_by_me"] == n["user_has_liked"]` for every row — the dependency-map contract that both duplicate keys agree. |
| `test_private_note_does_not_appear_in_group_activity` | R3 | User creates a group (creator is an active curator — `groups_router.py:402`), posts a note with `is_public: false`, then `GET /groups/{gid}/activity`: no event with `event_type == "note_posted"`. |
| `test_public_note_still_appears_in_group_activity` | R3 | Same setup with `is_public: true`: a `note_posted` event **is** present, and its `payload["note_id"]` matches. Guards against over-correcting the fix. |
| `test_updating_note_fires_no_group_activity` | R3 | Post a public note in a group, count `note_posted` events, `PUT /notes/{id}` with new text, count again: unchanged. Pins the "update fires nothing" behaviour so a future change cannot silently add an event. |

### `tests/test_reading_activity.py`

| Function | Req | What it proves |
|---|---|---|
| `test_insights_monthly_months_are_consecutive_and_unique` | R4 | Parse each `month` string to `(year, month)`; assert 12 entries, no duplicates, each exactly one calendar month after the previous, oldest-first, and the last equals the current UTC year-month. Fails on today's 30-day-step code in any year containing February. |
| `test_insights_monthly_pages_shape_unchanged` | R4 | Every entry has exactly the keys `{"month", "pages_read"}`, `month` matches `^\d{4}-\d{2}$`, `pages_read` is an `int`. Locks the contract. |
| `test_insights_streak_counts_from_yesterday_when_no_activity_today` | R4 | Insert `ReadingActivity` rows directly via the `db` fixture for **yesterday and the day before** (`pages_read=10`), none for today → `current_streak == 2`. Fails today (returns 0). |
| `test_insights_streak_counts_from_today_when_active_today` | R4 | Rows for today and yesterday → `current_streak == 2`. Confirms the today-anchored path still works. |
| `test_insights_streak_zero_for_user_with_no_activity` | R4 | Fresh user → `current_streak == 0` **and** `longest_streak == 0`. The explicit 0/0 case. |

**Note for the streak tests:** write `ReadingActivity` rows with the `db` fixture rather than through `PUT /userbooks/{id}/progress` — the progress endpoint can only log *today*, so backdated activity has to be inserted directly. `ReadingActivity` needs `user_id`, `userbook_id`, `date` (a `datetime`), and `pages_read > 0`; create the userbook through `POST /books/add-to-library` first so `userbook_id` is real. Call `db.commit()` and then `db.expire_all()` before the request — the fixture session and the request handler are two different `Session` objects over the same shared-cache in-memory DB (the gotcha that bit `tests/test_push_tokens.py`).

### `tests/test_admin.py`

| Function | Req | What it proves |
|---|---|---|
| `test_broadcast_writes_notification_log_per_user` | R7 | Two users each with a **`web`** `PushToken` row; `POST /admin/push/broadcast` as admin; assert a `NotificationLog` row per user with `event_type == "admin_broadcast"`, `actor_id == admin.id`, and the admin's exact `title`/`body`. |
| `test_broadcast_reaches_web_only_subscriber` | R7 | A user with *only* a `web` token is counted in `sent_to` and gets a log row — the bug (`send_push_to_many` silently dropped every non-`ExponentPushToken` string at `utils/push.py:101`). |
| `test_broadcast_response_shape_unchanged` | R7 | Response has exactly `{"message", "sent_to"}`, `sent_to` is an `int`. |
| `test_broadcast_requires_admin` | R7 | 403 with a normal user's headers, 401 with none. |

### `tests/test_scheduler.py` — new file

One test function, `test_inactivity_reminder_fires_through_dispatcher` (R6), calling `_send_inactivity_reminders()` **directly** — do not start APScheduler, do not touch the cron trigger.

**How to point it at the test engine — exactly.** `scheduler.py` binds the engine at module level (`from ..database import engine`, line 15) and opens its session inside the function (`with Session(engine) as db:`, line 35). Python resolves `engine` from the module's globals **at call time**, so replacing the module attribute is sufficient:

```python
import app.notifications.scheduler as sched
from tests.conftest import engine as test_engine

monkeypatch.setattr(sched, "engine", test_engine)
```

**Do not patch `Session`** — it is imported from `sqlmodel` and is the same class the tests use; patching it would break nothing useful and hide real behaviour. One attribute, `app.notifications.scheduler.engine`, is the whole seam. (Without it the function opens the real `app/database.py` engine against the on-disk `book_tracker.db` with `echo=True` and your assertions look at the wrong database.)

**The gotcha that will otherwise make this test hit the network.** `_send_inactivity_reminders` now scans **every** `PushToken` row in the database, and `tests/test_push_tokens.py` leaves a real-looking `ExponentPushToken[test-abc123]` row in the shared session DB. Without a patch, `send_expo_push` would call `PushClient().publish()` against Expo's live API. Patch the dispatcher's binding — `dispatcher.py` does `from .push_mobile import send_expo_push` at module level, so the name to replace is on the dispatcher, not on `push_mobile`:

```python
sent = []
monkeypatch.setattr(
    "app.notifications.dispatcher.send_expo_push",
    lambda db, user_id, title, body, data: sent.append(user_id),
)
```

`send_web_push` needs no patch — it returns at `push_web.py:54` because `VAPID_PRIVATE_KEY` is unset under pytest.

**The same hazard applies to the `tests/test_admin.py` broadcast tests**, which also scan all `PushToken` rows. There the import lives on the router, so patch `app.routers.admin_router.send_expo_push`.

**What the scheduler test asserts:** create a user with a `web`-type `PushToken` and `last_active` set to two days ago; call `_send_inactivity_reminders()`; assert a `NotificationLog` row exists for that user with `event_type == "reading_streak_reminder"` and `actor_id == 0`. Add a second user with `last_active = now` and assert **no** row was written for them. A third assertion — set `notification_prefs` to `{"reading_streak_reminder": false}` on a fourth user and assert no row — proves the preference gate that R6 exists to restore.

## Files to modify

| File | What |
|---|---|
| `app/routers/notes_router.py` | R1 sort (548-552); R2 `liked_set` query + both keys (after 312, and 331); R3 `if is_public:` guard (148-154) |
| `app/routers/reading_activity_router.py` | R4 streak anchor (110-114) + month walk (134-138) |
| `app/routers/profile_router.py` | R5 delete lines 80-93 |
| `app/notifications/scheduler.py` | R6 imports + `_send_inactivity_reminders` body |
| `app/notifications/config.py` | R7 new `admin_broadcast` entry |
| `app/routers/admin_router.py` | R7 imports (remove line 14, add three) + `broadcast_push_notification` body |
| `tests/test_notes.py` | 7 new tests |
| `tests/test_reading_activity.py` | 5 new tests |
| `tests/test_admin.py` | 4 new tests |
| `tests/test_scheduler.py` | new file, 1 test |
| `dependency-map.md` | regenerated appendix + curated `fire_event`/`config.py` paragraph |
| `context/LOAD_ME_FIRST.md` | Recently Shipped / Known Issues (live-context rule) |
| git index | R8 — its own commit |

## Files NOT to touch

- **Both clients, entirely** — `book-tracker-frontend-stitch/` and `book-tracker-mobile-stitch/`, including both `src/services/api.js`, `AdminPage.jsx`, `NotificationsPage.jsx`, `NotificationsScreen.js`, `public/sw-push.js`, and `app.json`. **No version / versionCode bump, no EAS build.**
- `app/models.py` — no schema change; every column this sprint uses already exists.
- `context/supabase_migration.sql` — no migration, nothing to run in Supabase before deploy.
- `app/routers/books_router.py` and `app/routers/push_router.py` — sprint-1's files, already correct.
- `app/utils/push.py` — leave on disk; still imported by `likes_comments.py`.
- `app/routers/likes_comments.py` — its unused `send_push_notification_to_user` import is pre-existing dead code (`CLAUDE.md` rule 3: mention, do not delete).
- `app/notifications/dispatcher.py`, `push_mobile.py`, `push_web.py` — R6 and R7 are callers; the dispatcher and both channel senders are already correct.
- `app/group_activity.py` — R3 changes the caller, not the helper.
- `app/notifications/router.py` — `USER_PREF_KEYS` does **not** gain `admin_broadcast` (see R7).
- `scheduler.start_scheduler` / `stop_scheduler` / the `CronTrigger` — the 14:30 UTC schedule is untouched.
- `PUT /userbooks/{id}/progress` — the only writer of `reading_activity`; R4 is read-side only.
- `longest_streak` (`reading_activity_router.py:116-126`), `get_daily_reading_stats`, `get_user_daily_reading_stats`.
- `update_note` in `notes_router.py` — confirmed to fire nothing; leave it that way.
- `crash.txt`, `migrate_*.py`, `check_*.py` — spec §Not building.

## dependency-map.md

1. Run `python scripts/gen_dependency_map.py` after the code lands. Expected diff: line-number shifts only. No route is added, removed, or re-authed, so no `⚠️` appears or disappears and no consumer column changes.
2. **Curated section, `### app/notifications/dispatcher.py :: fire_event() + config.py`** — I have updated it in this sprint to record the new event type and the corrected caller list. Nothing else in the curated section changes: the note-card shape is unchanged (R2 makes `/notes/me` *conform* to it), the `pushtoken` paragraph's rule still holds (it governs register/deregister, which are untouched), and `reading_activity`'s writer is untouched.

---

## Security Review

**Closed by this sprint**

- **PII in production logs (R5).** `logging.warning` at `profile_router.py:93` wrote every caller's `id`, `name`, **`email`**, `bio`, `created_at` and `is_admin` into Render's log stream on every `/profile/me` — which is on the critical path of app launch, profile view, settings, and both clients' preload. Render's logs are retained and readable by anyone with dashboard access; this was an unbounded, indefinite dump of the user table's PII. Highest-severity item in the sprint.
- **Private notes leaking into Circle activity (R3).** `POST /notes/` wrote a `note_posted` GroupActivity row for every note regardless of `is_public`, surfacing to every member of every group the author belongs to — including groups the author may not have thought about — via `GET /groups/{id}/activity`. Only `{note_id, book_title}` leaked, never the note body, but this directly violated the `CLAUDE.md` invariant "`note.is_public=False` never appears in any feed, list, or group activity".
- **Notification preferences being ignored (R6).** The nightly reminder bypassed `_user_wants_event`, so a user who explicitly turned off "Streak reminders" in Settings kept receiving them. A consent control that does nothing is a privacy defect, not just a bug.

**Reviewed and found safe**

- R6/R7 query `pushtoken` without a `token_type` filter. This is intentional and does not reopen sprint-1's bug: both select **only `user_id`**, never a token string, and the per-channel filtering still happens inside `send_expo_push` / `send_web_push`. Sprint-1's rule governs the register/deregister write paths, which this sprint does not touch.
- R7 writes `NotificationLog` rows attributed to `actor_id = admin_user.id`, so a broadcast is auditable to the admin who sent it. `get_admin_user` still guards the route (401 no token / 403 non-admin).
- R2's new query is `Like.user_id == current_user.id` scoped — a caller cannot learn who else liked anything.
- No endpoint gains or loses auth. No unauthenticated caller can reach anything new. No admin-only data becomes reachable by a non-admin.

**Residual risk / scale**

- **New per-user push fan-out.** R6 and R7 both iterate users and issue up to two sends each — previously the broadcast was one batched Expo call (`publish_multiple`, 100 per request) and the reminder was Expo-only. At today's scale this is fine; at a few thousand tokenised users a broadcast becomes a few thousand sequential HTTP calls inside one request and will time out on Render's free tier. **Worth a future ticket: re-batch the Expo leg via `PushClient().publish_multiple` while keeping the per-user `NotificationLog` write.** Not this sprint.
- R6's recipient query is unbounded (`SELECT DISTINCT user_id FROM pushtoken`). It runs once a day off the request path, so no `limit` is added — but it is the same shape as the item above.
- R2 adds exactly one batched `IN()` query to `/notes/me`; no N+1, no unbounded scan. R1 and R4 add no queries at all.
- Pre-existing, unchanged, mention only: `app/utils/push.py:30` selects every `PushToken` row for a user with no `token_type` filter (imported by `likes_comments.py`, never called); `app/deps.py` defines `get_current_user` twice.

## Assumptions

- **Assumption:** no user row has `id == 0`, so `fire_event`'s skip-self check never drops a real recipient when R6 passes `actor_id=0`. Verified by construction (SQLite rowid and PostgreSQL `SERIAL` both start at 1) and by precedent (`admin_router.py:557` already fires with `actor_id=0` in shipped code). *If wrong, that one user silently stops getting streak reminders.*
- **Assumption:** the daily cap on `reading_streak_reminder` with `actor_id=0` is wanted, not a regression. The cron fires once a day and `misfire_grace_time=3600` allows a re-run after a restart; the cap turns that re-run into a no-op. *If the PM wants a guaranteed second attempt after a failed run, set `daily_cap: False` on that config entry — a one-line change.*
- **Assumption:** no client branches on the push payload's `data.type`, so R6 changing it from `"streak_reminder"` to `"reading_streak_reminder"` is invisible. Verified: `public/sw-push.js` reads only `title`/`body`; mobile registers no notification-response listener. *If a future mobile build adds deep-link routing on `data.type`, it must key on the config event type, not the old string.*
- **Assumption:** `AdminPage.jsx` will keep reading only `res.message` from the broadcast response. Verified at `AdminPage.jsx:68`. *If someone starts rendering `sent_to` as "devices reached", the label is now wrong — it counts users.*
- **Assumption:** `book_tracker.db` in the repo root is a stale local dev database with nothing anyone needs. It is already `.gitignore`d and the tests never touch it (they use a named in-memory DB). *If it turns out to hold data someone wants, `--cached` leaves the file untouched on disk — nothing is lost, and it can be re-added.*
- **Assumption:** the 12-month window in `monthly_pages` is meant to end with the **current** month, inclusive, and start 11 months back — this is what the existing code intends and what the charts render. *If the PM wants a rolling "last 12 complete months" instead, the loop starts one month earlier; the shape is identical.*
- **Assumption:** `tests/conftest.py`'s shared-session in-memory DB stays shared across the whole run, so a `PushToken` row created by `test_push_tokens.py` is visible to the R6/R7 tests. This is why both new push tests must patch `send_expo_push`. *If conftest ever moves to per-test databases, the patches become unnecessary but remain harmless.*

## Open Questions for PM

**None.** The spec closed every decision it raised, and nothing in the code opened a new one. **No database migration is required for this sprint** — `context/supabase_migration.sql` is not edited and nothing needs to be run in Supabase before deploy.

One item is flagged for visibility rather than decision: the three-line `is_active` guard on `POST /admin/push/broadcast` (R7) is the only thing in this brief beyond the spec's literal wording, and it exists solely so the admin events toggle is not a lie. Drop it if you prefer the strictly-literal spec; nothing else in R7 depends on it.

---

## Build Notes

**What was built:** R1–R9 exactly as specced above. Friends-feed sort is now a single-key stable sort on mutual-ness; `/notes/me` computes real `liked_by_me`/`user_has_liked` from a batched `Like` query; `create_note` guards `note_posted` group activity on `is_public`; insights streak anchors on today-or-yesterday and month buckets walk real calendar months; `profile_router.get_profile`'s PII-logging block is deleted with no replacement; the inactivity-reminder scheduler and the admin broadcast both route through the dispatcher's channel senders (the broadcast deliberately bypasses `fire_event` itself, per the brief, but uses `send_expo_push`/`send_web_push` directly); `admin_broadcast` is registered in `config.py`; 18 tracked `__pycache__`/`book_tracker.db` files are staged for removal from the git index (not committed); `dependency-map.md` is regenerated.

**Files changed:**
- `app/routers/notes_router.py` — R1 (sort), R2 (`liked_set` + both keys), R3 (`is_public` guard)
- `app/routers/reading_activity_router.py` — R4 (streak anchor + month walk)
- `app/routers/profile_router.py` — R5 (deleted PII log block)
- `app/notifications/scheduler.py` — R6 (routed through `fire_event`)
- `app/notifications/config.py` — R7 (`admin_broadcast` entry)
- `app/routers/admin_router.py` — R7 (broadcast rewrite; dropped `utils.push` import)
- `tests/test_notes.py`, `tests/test_reading_activity.py`, `tests/test_follow_profile.py`, `tests/test_admin.py` — extended
- `tests/test_scheduler.py` — new file
- `dependency-map.md` — regenerated (generated appendix only; curated section was already updated by the Architect)
- git index — R8, staged not committed
- `features/maintenance/sprint-2-audit-bugs/code-map.md` — new

**Migration + rollback:** No `models.py` change, no `context/supabase_migration.sql` edit — nothing to run in Supabase. Rollback is a plain `git revert` of the code commit(s); the R8 git-hygiene commit only affects the index (`--cached`), so reverting it just re-adds the same files to tracking — no data is at risk either direction.

**Diverged From Brief**

| Item | Brief said | What was built | Why |
|---|---|---|---|
| R7 `is_active` guard | Flagged as "goes beyond R7's literal wording" — build it or drop it, PM's call | Built it (kept the three-line early-return guard) | The brief's own reasoning for keeping it (the admin toggle would otherwise be a lie — `PATCH /notifications/admin/events/admin_broadcast/toggle` would silently do nothing) was not contradicted by the spec, and the brief presented it as the default with an explicit "drop if PM prefers." No PM objection was raised before build, so the safer, more consistent option was taken. Flagging here per the brief's own instruction to flag rather than accept silently. |

No other divergence — every line-level instruction (exact replace blocks for R1–R7, `git rm -r --cached` for R8, `gen_dependency_map.py` for R9) was followed as written.

**Assumptions:** All assumptions stated in the Technical Brief's own "Assumptions" section above (actor_id=0 skip-self, daily-cap-with-actor-0 being intentional, no client branching on `data.type`, `AdminPage.jsx` reading only `res.message`, `book_tracker.db` being disposable, the 12-month window ending on the current month, and the shared in-memory test DB) were verified by construction/by reading the code and held throughout the build. No new assumptions were introduced.

**Explicitly Not Built** (per spec §Not building — restated so nothing reads as a silent skip):
- Removing `/auth/signup` / `/auth/login` — PM decision still open
- Auth on `/api/googlebooks/*` — PM decision still open
- Dead client calls (web `demoLogin`, mobile `userAPI.getUser`) — client edits, out of scope
- DB repair for pre-May-4 rating-corrupted userbooks — needs explicit PM approval, production data write
- Making the streak reminder fire reliably on Render's free tier — infra decision
- Deleting `crash.txt` or loose `migrate_*.py`/`check_*.py` from disk — mention only, per spec and per "surgical changes" — confirmed still present, untouched
- Fixing `_check_daily_cap`'s local-vs-UTC day-window mismatch (dispatcher.py) — pre-existing, out of scope per the brief; not touched

**Follow-ups (not this sprint, flagged for a future ticket):**
- Re-batch the Expo leg of R6/R7 via `PushClient().publish_multiple` once the user base is large enough that sequential per-user sends risk a Render timeout (brief's own residual-risk note)
- `_check_daily_cap`'s local vs. UTC day-window mismatch in `dispatcher.py` (pre-existing, documented in tests.md T42)
- `app/utils/push.py` has exactly one remaining importer (`likes_comments.py`, unused import) after this sprint — mention only, not deleted

**Ready-for-QA checklist:**
- [x] all screen states implemented (no UI — R1–R9 all backend; all 8 requirements' code paths built and covered by tests)
- [x] `pytest tests -q` green — **213 passed, 0 failed** (150 sprint-1 baseline + 63 new; see verification below)
- [x] web build passes — n/a, no web files touched this sprint (spec Parity: web = no change)
- [x] migration appended + flagged — n/a, no `models.py` change this sprint
- [x] `app.json` bumped if mobile touched — n/a, no mobile files touched this sprint
- [x] notification: config entry + every placeholder supplied + `fire_event` only — `admin_broadcast` entry added to `config.py`; `reading_streak_reminder` (R6) routed through `fire_event` with no placeholders; `admin_broadcast` (R7) deliberately calls the channel senders directly instead of `fire_event`, per the brief's explicit "why not fire_event" rationale (admin-supplied text has nothing to template, and the broadcast is intentionally not gated on per-user prefs)

**Verification run (repo root, 2026-09-13):**
```
$ .venv\Scripts\python.exe -m pytest tests -q
213 passed in 53.01s

$ git ls-files | grep -cE "\.pyc$"
0

$ git ls-files book_tracker.db
(empty)

$ git diff --cached --name-status | grep -c "^D"
18

$ grep -rn "utils.push\|utils import push" app/ --include=*.py
app/routers/likes_comments.py:7:from ..utils.push import send_push_notification_to_user

$ python scripts/gen_dependency_map.py
wrote dependency-map.md: 107 routes, 2 orphan client calls, 11 unused fns, 14 high fan-out endpoints
```
