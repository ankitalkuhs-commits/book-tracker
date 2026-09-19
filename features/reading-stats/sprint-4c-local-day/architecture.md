---
screen: sprint-4c-local-day
feature: reading-stats
repo: api + web + mobile (Android 2.2.3 / versionCode 62)
status: architecture-complete
spec_status: PM decision 2026-09-18 ("readers own day always", F-62). spec.md is drafted and awaits the PM's APPROVED.
architect_verified: 2026-09-18 (code read on branch sprint-4c-local-day at bca729d; `.venv` Python 3.11.2, tzdata 2026.2, APScheduler 3.11.2)
---

## Risk Summary (for PM)

- **What changes:** every "today" becomes the reader's own day: where logged pages land, the chart's last bar, streaks, Insights' year and month, "active today", the 8 PM reminder and "once a day" caps.
- **How:** both apps send the phone's or browser's time zone with every request, and the server keeps the latest one.
- **Your actions, in order:** once 4A is live and the 2.2.2 AAB is built, run the 4C SQL (two new empty columns) in Supabase and check it lists 2 rows. Then I merge, you deploy the backend, then the web. Android 2.2.3 comes last.
- **Old Android apps (≤ 2.2.2):** readers who never open the website are treated as India time. That fixes Indian readers at once; others get India days until they update or visit the web once. Their reminder stays at 8 PM IST, as today.
- **History is not rewritten:** past days stay where they were. A one-time rule stops after-midnight readers' streaks breaking at the switch.
- **Could break:** a reader flying east may lose a streak day (accepted; E-6 asks you to confirm).
- **Honest limit:** reminders still only go out while Render is awake. The window is now 2 hours instead of 1.
- **Safety net:** if the SQL was skipped, the new backend refuses to start and the old one keeps serving. No repeat of April's login outage.
- **Decisions for you** (E-1..E-6, each with a recommendation): India fallback, the streak bridge, circle months stay UTC, a Privacy-page sentence, no keep-alive, no travel forgiveness.
- **No response field is removed or renamed;** `GET /profile/me` gains `timezone`. **Recommendation: approve.**

---

## Data Flow

**Reporting the zone.**
- Web `apiFetchRaw` and the Android axios request interceptor add `X-Timezone: <Intl zone>` to every request.
- `get_current_user` accepts the value only if it is a known IANA name, and stores it in `user.timezone` when it differs.
- It then refreshes `last_active` on the reader's first request of each **local** day.

**Writing a day.**
- `PUT /userbooks/{id}/progress` computes the label: the caller's local date as a naive midnight.
- It upserts `reading_activity` for `(user, userbook, label)` over the half-open range `[label, label+1d)`.
- A new row gets `local_day = true`.

**Reading days.**
- `/reading-activity/daily`, `/insights`, `/user/{id}/daily` and `/users/{id}/stats` compute "today" and the year in the zone of the reader **whose data it is**.
- Labels are compared as calendar dates, so old UTC-day rows and new local-day rows are read the same way.
- The streak adds at most one cutover bridge day (D-5).

**Reminder.**
- APScheduler runs `_send_inactivity_reminders` every 15 minutes (`:00/:15/:30/:45` UTC).
- Each run loads push-channel users in one `IN()` query. It keeps those whose local time is in `[20:00, 22:00)`, who are not active today (local), and who have had no reminder yet on their local day. Then it calls `fire_event` once.

**Caps.** `fire_event`'s daily cap compares the recipient's last matching `NotificationLog.sent_at` with "now" on the recipient's local calendar.

**Clock.** Every server "now" in these paths comes from `app.localday.utcnow()`, one module-level function. Tests replace it.

## depends_on
- **`app/deps.py :: get_current_user`**, every authenticated route. Today: 1 SELECT, plus 1 UPDATE per user per UTC day. After 4C: 1 SELECT, plus 1 UPDATE per user per **local** day, plus 1 UPDATE when the reported zone changes. It is the same commit, never two.
- **`app/notifications/dispatcher.py :: fire_event`**:
  - `_user_wants_event` already does `db.get(User, recipient_id)`, so the cap's recipient lookup is an identity-map hit, not a query.
  - `NotificationLog.sent_at` is `default_factory=datetime.utcnow` today; 4C sets it explicitly from the seam.
- **`app/notifications/scheduler.py`:**
  - Started in `main.py:157-161` `startup_event`, stopped at shutdown.
  - `AsyncIOScheduler(timezone="UTC")`, with no job store: jobs live in memory and are re-registered at every process start. That is correct for a sleeping free tier.
- **Python `zoneinfo`** (3.9+; Render `runtime.txt` = 3.11.0) and **`tzdata`**:
  - Installed in `.venv` (2026.2), but only transitively. It is **not** in `requirements.txt`.
  - On Windows (dev) `zoneinfo` has no system database and depends on `tzdata`. On Render (Linux) it depends on the image's `/usr/share/zoneinfo`.
  - 4C pins `tzdata` so both are identical. `zoneinfo.available_timezones()` returns 598 keys here; `Asia/Calcutta` is included, `localtime` and `posixrules` are not.
- **Stack** (unchanged from 4A, verified): Pydantic 1.10.24, FastAPI 0.95.2, SQLModel 0.0.8, SQLAlchemy 1.4.41.
  - FastAPI 0.95 dependencies can take `request: Request`.
  - `CORSMiddleware(allow_headers=["*"])` (`main.py:117-122`) mirrors requested headers on preflight, so `X-Timezone` needs no CORS change.
  - Web requests already preflight (they carry `Authorization` and JSON `Content-Type`), so the header adds **no extra round trip**.
- **`tests/conftest.py`:**
  - One shared in-memory SQLite DB; shared users `alice_f`, `bob_f`, `admin_f` are created at import.
  - **Any test that sends `X-Timezone` must use its own freshly created user.** Otherwise the stored zone leaks into later tests.
- **Deploy:**
  - `context/deployment/README.md` (May 2026) says Render auto-deploys from `master`.
  - The 4A runbook treats "Deploy `master` on Render" as a separate PM step, which implies auto-deploy is off.
  - **This plan is safe either way:** the SQL runs **before the merge** to `master` (see Assumptions A-2).

## depended_by
Consumers are from `dependency-map.md` (generated table, rows 376-396, and the curated sections).

### Response-shape changes (additive only)
| Change | Endpoint | Web consumers | Android consumers | Removed / renamed? |
|---|---|---|---|---|
| + `timezone` (string or null) | `GET /profile/me` (10 files) | `context/AuthContext.jsx`, `pages/ProfilePage.jsx`, `pages/SettingsPage.jsx` | `App.js`, `FeedScreen.js`, `GroupDetailScreen.js`, `GroupsScreen.js`, `ProfileScreen.js`, `InsightsScreen.js`, `SettingsScreen.js` | No. Every consumer reads named keys, and none iterates the object. The strict key-set test `tests/test_follow_profile.py:313-322` is updated **deliberately** |

### Request, behaviour and semantic changes (no shape change)
| Change | Endpoint / component | Callers | Result |
|---|---|---|---|
| New optional request header `X-Timezone` | every route (read in `get_current_user`) | Web `api.js apiFetchRaw` (4C); Android `api.js` interceptor (2.2.3). Old clients omit it | Absent or invalid → ignored. Status codes never change |
| Day label = writer's local date; merge over `[label, label+1d)`; `local_day=true` | `PUT /userbooks/{id}/progress` | Web `BookDetailPage.jsx`, `LibraryPage.jsx`; Android `BookDetailScreen.js` | Response unchanged `{id, status, current_page, rating, updated_at}` |
| "today" = caller's local date | `GET /reading-activity/daily` | Web `LibraryPage.jsx` (7 d), `ProfilePage.jsx` (30 d); Android `App.js` preload `activity`, `InsightsScreen.js`, `ProfileScreen.js` | Same `{days, data:[{date, pages_read}]}`. The last element is still "today", and every client treats it positionally (`LibraryPage.jsx:95`, `InsightsScreen.js:195`) |
| streak / monthly / 30-day avg / projected / year counts on the caller's local date, plus the cutover bridge | `GET /reading-activity/insights` | Web `InsightsPage.jsx`, `ProfilePage.jsx`; Android `App.js` preload `insights`, `InsightsScreen.js`, `ProfileScreen.js` | Same keys, including the 4A aliases. `monthly_pages` stays exactly `{month, pages_read}` (`test_reading_activity.py:247,360`) |
| "today" = **subject's** local date | `GET /reading-activity/user/{id}/daily` | Web `UserProfilePage.jsx` (30/90); Android `UserProfileScreen.js` | Same shape; privacy gate unchanged |
| `this_year` = subject's local year | `GET /users/{id}/stats` | Web `UserProfilePage.jsx`; Android `UserProfileScreen.js` | Same `UserStats` model. `last_month` stays a rolling 30 days |
| `last_active` refreshed per local day; always at login | `get_current_user`, `POST /auth/google`, `POST /auth/review-login` | Read by the scheduler and by admin user lists (`admin_router.py:218`, an instant; unchanged) | Instants stay naive UTC |
| Reminder at 20:00–22:00 local, every 15 min, once per local day | `scheduler.py` | Push recipients (Expo + web) | Same event, title and body; `actor_id=0` |
| Cap "today" = recipient's local day | `fire_event` for `book_completed`, `book_added`, `reading_streak_reminder` | All `fire_event` callers (`dependency-map.md` → dispatcher section) | Same signature and summary dict |
| No change (labels, compared with a UTC month start) | `GET /groups/{id}/leaderboard`, `/goal`, `GET /groups/{id}` `pages_read_total` | Group screens | Circle months stay UTC (E-3) |

## API Endpoints Used
| Method | Path | Auth | Items | Change |
|---|---|---|---|---|
| * | every authenticated route | user | R-07, R-08, R-10 | Reads `X-Timezone` in `get_current_user`; persists a valid, changed zone; local-day `last_active` |
| POST | `/auth/google`, `/auth/review-login` | none (login) | R-10, R-16 | `last_active = now` unconditionally |
| PUT | `/userbooks/{id}/progress` | user (owner, unchanged 404) | R-01, R-02 | Local label; range merge; `local_day` |
| GET | `/reading-activity/daily` | user | R-03 | Local today |
| GET | `/reading-activity/insights` | user | R-03, R-06 | Local today; bridge |
| GET | `/reading-activity/user/{id}/daily` | user + private gate | R-04 | Subject's today |
| GET | `/users/{id}/stats` | user + private gate | R-04 | Subject's local year |
| GET | `/profile/me` | user | R-13 | + `timezone` |

**No route is added or removed. No auth level changes.**

## DB Tables Touched
| Table | Operation | Ownership / privacy rule enforced |
|---|---|---|
| `user` | **new column `timezone VARCHAR(64) NULL`**; written by `get_current_user` (own row only); `last_active` writes (own row) | The zone is written only from the caller's own request, onto the caller's own row. Read back only by `GET /profile/me` (own) and by server-side computations |
| `reading_activity` | **new column `local_day BOOLEAN NULL`**; insert/update by progress (owner-checked, unchanged) | `userbook.user_id == current_user.id` → else 404 (`userbooks_router.py:50`, unchanged) |
| `notificationlog` | read (cap, scheduler dedupe); `sent_at` set explicitly | Queries filter `user_id` = the recipient |
| `pushtoken` | read (scheduler recipients) | unchanged |

**Migration: YES, flagged ⚑.**
- Two nullable columns, no default, no backfill. Both are metadata-only `ALTER`s in PostgreSQL, so there is no table rewrite and only a momentary lock.
- **Existing rows:**
  - `user.timezone` is NULL, which means "never reported": the fallback zone applies (D-3).
  - `reading_activity.local_day` is NULL, which means "written before 4C, labelled with its UTC day". Those rows stay exactly as they are (D-4).

## Notifications Fired
| event_type | recipients | extra keys the template needs |
|---|---|---|
| `reading_streak_reminder` (existing) | push-channel users, local time in `[20:00, 22:00)`, not active today (local), not reminded yet today (local), pref not disabled | none: title and body have no placeholders (`config.py:67-72`); unchanged |
| `book_completed`, `book_added` (existing) | unchanged | unchanged. Only the cap's notion of "today" changes |

`config.py` is **not** changed.

## Cross-Client Impact
**Web (deploys minutes after the backend):**
- The header on every request.
- Date-only strings are rendered as local calendar dates.
- The zone is persisted on the reader's first request after deploy, so web users are fully on their own day from then on.

**Android 2.2.2 and older (no build):**
- They are served normally with no header.
- The reader's stored zone applies if they ever used the web; otherwise `Asia/Kolkata`.
- Their reminder time is unchanged.

**Android 2.2.3 / versionCode 62 (new EAS build):**
- The header in the interceptor.
- Local parsing of date-only strings in `InsightsScreen.js`.
- Built **after** the 4C backend is live. Harmless either way: an old backend ignores the header.

**Build order:**
- The 2.2.2 AAB must be built **before** 4C merges. 4C bumps `app.json` on `master` to 2.2.3/62, after which a 2.2.2 build from `master` is impossible.
- Tag the 2.2.2 build SHA `android-2.2.2`.

**PreloadContext:** no new key, no new preload request.

**Web 60 s cache:** unaffected. No new mutation, and the cache key is the path; the header does not alter results for the same user in the same zone.

---

## Decisions (the brief's questions, answered)

Each is ADR-shaped: context, the options, the choice and why. The Builder may split them into `decisions/ADR-001..008.md` at Doc Sync.

### D-1 · How the zone reaches the server: **both** — per-request header + stored profile field
- **Options:**
  - **(A) Stored only**, via `PUT /profile/me {timezone}` at app start. The client must remember to call it, and a traveller is wrong until the next app start.
  - **(B) Header only.** The scheduler has no request, and neither does reading another reader's data.
  - **(C) Header on every request, persisted on change.**
- **Decision: (C).**
  - It is self-healing: the stored value is at most one request stale.
  - It needs no new endpoint and no new client call site, just one line in each `api.js`.
  - The scheduler, old clients and cross-user reads use the stored value.
- **Name:** `X-Timezone`.
- **Precedence inside a request:** a valid header is persisted first, then used. A request's "today" is therefore always the device's "today".

### D-2 · Validation: exact membership in the IANA set, silent ignore on garbage
- **Accept:** a `str`, 1–64 characters, present in `frozenset(zoneinfo.available_timezones())`, which is computed once at import.
- **Why the allowlist is strict:**
  - It rejects every path trick (`../`, absolute paths).
  - It rejects case variants: Windows `zoneinfo` would otherwise resolve `asia/kolkata` from the filesystem.
  - It never touches the filesystem with attacker input at request time.
- **On garbage:** ignore it. Do not store it and do not raise. Return the normal response.
  - A 4xx would break every request from a client with an odd Intl implementation. The old value, or the fallback, is always safe.
  - The raw value is never logged (log injection, and it is location data).
- **Stored values are re-validated on read** (`zone_of`), so a bad DB value falls back instead of raising `ZoneInfoNotFoundError`.
- **Legacy aliases** such as `Asia/Calcutta` (old Android) are valid IANA links and are stored as sent. A reader whose web reports `Asia/Kolkata` and phone `Asia/Calcutta` causes one UPDATE per device switch. That is harmless and bounded.

### D-3 · Fallback zone for never-reported readers: **`Asia/Kolkata`**. PM to confirm (E-1)
**Why IST:**
- **It is the only fallback that keeps the reminder where it is.**
  - Production fires at 14:30 UTC = 20:00 IST (`scheduler.py:61`).
  - A `UTC` fallback would move every old-app reader's reminder to 20:00 UTC = 01:30 IST, and old-app readers are the ones who cannot be updated remotely.
- **The product is India-first today:** the reminder is hard-coded to IST, and Amazon links pick `.in` for `Asia/Kolkata|Asia/Calcutta` (`BookDetailScreen.js:18-20`).
- **Indian readers on 2.2.2 get the fix at deploy**, with no app update.
- **One zone per reader for every "today"** (stamp, streak, active, reminder, cap). Mixing bases is exactly what F-62 is.

**Cost:** a reader outside India on Android ≤ 2.2.2 who has never opened the web gets India days until they do either. Before 4C they got UTC days, so they were already on the wrong day; the error grows for the Americas (from 4–8 h to 9.5–13.5 h). This closes as soon as the reader opens trackmyread.com once, or installs 2.2.3.

**Where it lives:** one constant, `app.localday.FALLBACK_ZONE`.

### D-4 · Existing rows: keep their labels; treat labels as calendar dates everywhere
- `reading_activity.date` has always held a **label** (a naive midnight), not an instant: `userbooks_router.py:92` wrote `utcnow().replace(hour=0…)`. 4C keeps that representation; only the day it names changes.
- Readers already do `a.date.date()` and compare dates, so old and new rows need no read-side branching. The only exception is the one-time bridge (D-5).
- **Why the rows cannot be re-bucketed** (confirming the PM decision):
  - `reading_activity.created_at` does exist, but it is the instant of the **first** update of that UTC day. Pages from later updates were added to the same row.
  - An IST row therefore holds reading from two IST days (05:30 → 05:30), with no way to split it.
- **No double counting, by construction:**
  - `pages_read` is a delta, added to exactly one row per update.
  - The upsert looks up `[label, label+1d)` for the same userbook, and new rows are only created when no row carries that label.
  - So no userbook ever has two rows for one label, and deploy-time totals are identical.
- **"Future" rows:**
  - A reader west of UTC who read just before deploy (say 21:00 New York = 01:00 UTC next day) has a pre-4C row labelled the next date.
  - After deploy, that evening's reading gets today's label, a new row. The next day's reading merges into the future row when its date arrives.
  - `/daily` never shows a label after today, since its fill loop runs from today backwards. The streak is anchored at today, so the row only counts once its day arrives.

### D-5 · Streaks at the switch: a one-time, one-day bridge (PM to confirm, E-2)
**The problem:**
- Old rules shift after-midnight reading one day earlier; new rules don't.
- A reader who reads only between 00:00 and 05:30 IST therefore has pre-4C labels `…, D-3, D-2` (reading on local D-2 and D-1) and post-4C labels `D, D+1, …`. Day D-1 is never labelled.
- Their current streak would reset to the post-deploy run.
- Readers west of UTC get the opposite effect: two days share one label. That shortens the number of labels but never makes a gap, so it needs no fix.

**Rule:**
- `old` = labels of rows with `local_day` NULL, and `new` = labels with `local_day` true, both with `pages_read > 0`.
- If both are non-empty and `min(new) − max(old) == 2 days`, the day between them is added to the dates used for **`current_streak` and `longest_streak` only**.
- It is never added to charts, `monthly_pages`, averages or totals.

**Properties:**
- It fires at most once per reader, only across the cutover.
- It can over-forgive one genuinely skipped day that happens to fall exactly on the cutover. That is harmless: streaks are private vanity stats, and no leaderboard reads them.
- **Why the `local_day` column:** it is the only reliable way to tell a pre-4C row from a post-4C row. The deploy instant is not known to the code, and `created_at` cannot distinguish the rules. A boolean holds no location; the rejected alternative, a per-row zone string, would be travel history.

### D-6 · The reminder: 8 PM in each reader's zone, via a 15-minute catch-up window
**Options:**
- **(A)** One job per zone. That means dynamic job management in memory, lost on every sleep.
- **(B)** An hourly job firing at 20:00 local. It misses `:30` and `:45` zones (India itself is +05:30).
- **(C)** Every 15 minutes, a window, and a DB-backed "already reminded today".

**Decision: (C).** `CronTrigger(minute="0,15,30,45", timezone="UTC")`, `coalesce=True`, `max_instances=1`, `misfire_grace_time=600`. Each run sends to a reader when **all** of these hold:
- local time is in `[20:00, 22:00)`
- `last_active` is not on the local today
- no `reading_streak_reminder` NotificationLog row for them has a local date equal to today

**Why this is robust on a sleeping free tier:**
- There is no persistent job state. The "already sent" truth is the NotificationLog table, which survives sleep and restarts.
- A process that wakes anywhere inside a reader's 2-hour window still reminds them.
- Re-runs are idempotent: the pre-filter plus `fire_event`'s own daily cap.
- Every offset works: `:30` zones hit exactly at 20:00, `:45` zones (Kathmandu, Chatham) at 20:15 via the `:00/:15/:30/:45` grid.
- **Cost per run:**
  - 1 `DISTINCT` query, 1 `IN()` user load, and 1 `IN()` NotificationLog lookup (48 h lookback) for in-window users only. Then `fire_event`.
  - 96 runs/day ≈ 300 small queries/day.

**Why 22:00:**
- It gives a sleeping instance two hours to wake.
- It never sends "you haven't logged any reading today" in the small hours.
- Later than 22:00 is intrusive; earlier than 20:00 changes the product.

**Never-reported readers:** the first eligible run is 14:30 UTC, the same instant as today.

**Honest limit:** the scheduler runs only while Render is awake. That is unchanged from today, whose 1-hour misfire grace is narrower (E-5).

### D-7 · DST and zone changes (travel)
- **DST:**
  - All local math goes through `zoneinfo`, from a naive-UTC instant to an aware local time.
  - A 23-hour or 25-hour local day is simply one label.
  - The reminder uses wall-clock 20:00. No current zone moves its clocks at 20:00.
  - **No code computes "local midnight as an instant."** Caps and "active today" compare `local_date(instant)` with `local_date(now)`, so a transition at midnight (for example Santiago or Beirut) cannot misplace a boundary.
- **Travel:**
  - The zone follows the device on the next request (D-1). Rows already written never move.
  - **Flying west:** a local date repeats, so both days' pages go to one label (merge).
  - **Flying east:** a local date can be skipped, so a streak may break if the only reading fell in the skipped hours. It is accepted and not bridged (E-6).
  - **Reminder:** fires in the last stored zone until the reader opens the app in the new one.
  - **`last_active`:** compared in the current zone. After a big eastward jump, the next request may register as a new local day, which is correct.

### D-8 · 30-day and 7-day windows: **no change**
| Site | Kind | Decision |
|---|---|---|
| `admin_router.py:86-88` `week_ago`, `month_ago` (new users) | rolling duration; admin, not a reader | unchanged |
| `notifications/router.py:146-147` history cutoff 30 d | rolling duration | unchanged |
| `users_router.py:219-226` `last_month` = finished in the last 30 × 24 h | rolling duration | unchanged. Only `now` moves to the seam |
| `reading_activity_router.py:150` `thirty_ago` (avg pages/day) and `/daily?days=` | **calendar-label windows** | follow the local day automatically, because they are computed from local `today` |

A rolling window is "the last N×24 hours". A reader's zone shifts it by nothing, so changing it would add code and change no answer.

---

# Technical Brief

**Conventions for every snippet:**
- Pydantic **v1** only.
- Every instant stays **naive UTC** in the DB, as today.
- Every server "now" in the listed paths is `localday.utcnow()`, called **through the module attribute** (`from .. import localday` / `from . import localday`, then `localday.utcnow()`). **Never** `from app.localday import utcnow`: that copies the function and defeats the test patch. A static test enforces this.
- No log line contains a zone string, email, token or query string.

## Every call site (server and clients)

"Seam" means the site switches to `localday.utcnow()` with no semantic change.

| # | Site (as of bca729d) | Today | 4C |
|---|---|---|---|
| 1 | `app/routers/userbooks_router.py:86` `updated_at = datetime.utcnow()` | instant | seam (`now`) |
| 2 | `userbooks_router.py:88-116` activity label and "today's row" lookup | UTC midnight; `date >= today` | **local label; `[label, label+1d)`; `local_day=True`; `created_at=now`** (R-01, R-02) |
| 3 | `userbooks_router.py:188` finish `updated_at` | instant | unchanged: an instant, read through `local_date` (#6) |
| 4 | `app/routers/reading_activity_router.py:23` `/daily` `end_date` | UTC date | **caller's `local_today`** |
| 5 | `reading_activity_router.py:64` insights `today` | UTC date | **caller's `local_today`** |
| 6 | `reading_activity_router.py:65, 71-74` `year_start`, `finished_this_year` via `updated_at.date()` | UTC date of instant | **`local_date(updated_at, zone) >= date(today.year,1,1)`** |
| 7 | `reading_activity_router.py:80` `day_of_year` (`on_track`) | UTC | from local `today` (follows #5) |
| 8 | `reading_activity_router.py:100-129` streaks | UTC anchor | local anchor + **bridge** (D-5) |
| 9 | `reading_activity_router.py:131-147` `monthly_pages` | ends at the UTC month | ends at the local month (follows #5) |
| 10 | `reading_activity_router.py:150-155` 30-day average | from UTC today | from local today (follows #5) |
| 11 | `reading_activity_router.py:165` `projected_finish` | UTC today + n | local today + n (follows #5) |
| 12 | `reading_activity_router.py:224` `/user/{id}/daily` `end_date` | UTC date | **subject's `local_today`** |
| 13 | `app/deps.py:78-85` `last_active` touch | UTC date `<` UTC date | **header zone persisted; local date `<` local date** |
| 14 | `app/routers/auth_router.py:90-96` Google login | `date.today()` (server-local) vs `utcnow()` | **`last_active = localday.utcnow()` unconditionally** |
| 15 | `auth_router.py:161-168` review login | same | same as #14; remove the now-unused local `date` import |
| 16 | `app/notifications/scheduler.py:5, 30, 42, 59-68` | `date.today()`; cron 14:30 UTC | **per-reader local window, every 15 min** (D-6) |
| 17 | `app/notifications/dispatcher.py:65` `_check_daily_cap` | `date.today()` midnight (server-local) | **recipient-local date of the last matching log vs now** |
| 18 | `dispatcher.py:175` `NotificationLog(...)` | `sent_at` = model default | **`sent_at=now`** (seam), so caps are testable |
| 19 | `app/routers/users_router.py:219-230` `/users/{id}/stats` | `year_start = datetime(now.year,1,1)` UTC | **subject's local year**; `last_month` rolling (seam `now`) |
| 20 | `app/routers/profile_router.py:80-94` `GET /profile/me` | no zone | **+ `"timezone": user.timezone`** |
| 21 | `app/models.py:40` `User` | — | **+ `timezone: Optional[str] = None`** ⚑ |
| 22 | `app/models.py:180-194` `ReadingActivity` | — | **+ `local_day: Optional[bool] = None`** ⚑ |
| 23 | `app/main.py:157-161` `startup_event` | starts the scheduler | **schema guard first** (R-14) |
| 24 | `admin_router.py:86-88`; `notifications/router.py:146-147` | rolling windows | unchanged (D-8) |
| 25 | `groups_router.py:60, 412, 491, 926` circle month start | UTC | unchanged (E-3) |
| 26 | `auth.py:66` token expiry; `crud.py:73`; `books_router.py:84,111-112,214`; `push_router.py:57`; `notes_router.py:232`; `group_activity.py:37,68`; `import_router.py:239,256`; `auth_router.py:185`; model `default_factory`s | instants | unchanged |
| 27 | Web `src/services/api.js:45-51` `apiFetchRaw` headers | — | **+ `X-Timezone`** |
| 28 | Web `src/pages/InsightsPage.jsx:190` `new Date(p.projected_finish)` | UTC-midnight parse | **`parseDayLabel`** (R-15) |
| 29 | Android `src/services/api.js:21-29` request interceptor | — | **+ `X-Timezone`** |
| 30 | Android `src/screens/InsightsScreen.js:22-38` `shortMonth`, `shortDate`, `daysLeft` | UTC-midnight parse | **`parseDayLabel`**; days from local midnight |
| 31 | Web `InsightsPage.jsx:271`, `ProfilePage.jsx:662,684`, `UserProfilePage.jsx:354`; Android `InsightsScreen.js:257`, `ProfileScreen.js:572`, `UserProfileScreen.js:213` `new Date().getFullYear()` | device-local year | unchanged: already the reader's own year |
| 32 | Web `InsightsPage.jsx:16` `monthLabel` → `new Date(+y, +m-1)` | local constructor | unchanged: already correct |
| 33 | Web `BookDetailPage.jsx:78`, `BookPreviewModal.jsx:14`; Android `BookDetailScreen.js:18`, `BookPreviewScreen.js:19` (Amazon store) | device zone | unchanged |

**Grep proof, re-run by the Builder before and after:**
- `grep -rn "utcnow\|date\.today\|datetime\.now\|\.date()" app/` must show only rows 1–26.
- After the change, `date.today(` and a bare `datetime.now()` have **zero** hits in `app/` (test T-4C-S1).

---

## Package API — `app/`, `context/`, `requirements.txt`, `tests/`

### `app/localday.py` (new): the only place "today" is computed
```python
# app/localday.py
"""A reader's day is their own local day (Sprint 4C, F-62; PM decision 2026-09-18).

Every server-side "now" in the reading, activity and notification paths comes from utcnow()
below. Call it as `localday.utcnow()` so tests can replace it. Instants stay naive UTC.
reading_activity.date holds a calendar *label* (naive midnight), never an instant.
"""
from datetime import date, datetime, timezone as _utc_tz
from typing import Optional
from zoneinfo import ZoneInfo, available_timezones

ZONE_HEADER = "X-Timezone"
FALLBACK_ZONE = "Asia/Kolkata"   # D-3: never-reported readers (Android <= 2.2.2) — keeps the 8 PM IST reminder
MAX_ZONE_LEN = 64
_VALID_ZONES = frozenset(available_timezones())

if FALLBACK_ZONE not in _VALID_ZONES:   # no tz database → refuse to start rather than 500 on every request
    raise RuntimeError("IANA tz database unavailable: install the pinned 'tzdata' package")


def utcnow() -> datetime:
    """Naive UTC now — the single clock seam."""
    return datetime.utcnow()


def valid_zone(name) -> Optional[str]:
    """The name if it is a known IANA zone, else None. Never raises; never touches the filesystem."""
    if not isinstance(name, str) or not (0 < len(name) <= MAX_ZONE_LEN):
        return None
    return name if name in _VALID_ZONES else None


def zone_of(user) -> ZoneInfo:
    """The reader's zone: stored value if valid, else the fallback. `user` may be None."""
    return ZoneInfo(valid_zone(getattr(user, "timezone", None)) or FALLBACK_ZONE)


def local_date(instant: datetime, zone: ZoneInfo) -> date:
    """Calendar date of an instant in `zone`. Naive instants are UTC (the DB convention)."""
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=_utc_tz.utc)
    return instant.astimezone(zone).date()


def local_now(zone: ZoneInfo, now: Optional[datetime] = None) -> datetime:
    """Aware wall-clock time in `zone`."""
    n = now or utcnow()
    return n.replace(tzinfo=_utc_tz.utc).astimezone(zone)


def local_today(zone: ZoneInfo, now: Optional[datetime] = None) -> date:
    return local_date(now or utcnow(), zone)


def day_label(d: date) -> datetime:
    """reading_activity.date value for local day d: a naive midnight — a label, not an instant."""
    return datetime(d.year, d.month, d.day)
```
- **`ZoneInfo(key)` caches instances**, so the per-request cost is a dict lookup.
- **The import-time check** turns a missing tz database into a failed deploy (the previous version keeps serving; A-1) instead of a 500 on every request.

### `app/models.py` ⚑ (gated: the 4C SQL runs first; see Deploy order)
```python
class User(SQLModel, table=True):
    ...
    last_active: Optional[datetime] = None
    timezone: Optional[str] = None            # Sprint 4C: device IANA zone, latest valid report (X-Timezone). NULL = never reported.
    ...

class ReadingActivity(SQLModel, table=True):
    ...
    # date used for stats queries — a calendar LABEL (naive midnight). Pre-4C rows: the UTC day.
    # 4C rows: the writer's local day (local_day = True). See features/reading-stats/sprint-4c-local-day.
    date: datetime = Field(default_factory=datetime.utcnow, index=True)
    ...
    local_day: Optional[bool] = None          # Sprint 4C: True = labelled with the reader's local day. NULL = pre-4C (UTC day).
```
- **Only these two field additions,** plus the comment on `date`. Nothing else in `models.py`.
- SQLite tests get both columns from `create_all` at conftest import.
- The local dev `book_tracker.db` needs them added by hand. SQLite has no `IF NOT EXISTS` for columns, so run it once:
  ```sql
  ALTER TABLE user ADD COLUMN timezone VARCHAR(64);
  ALTER TABLE reading_activity ADD COLUMN local_day BOOLEAN;
  ```

### `context/supabase_migration.sql` ⚑ (append; the PM runs STEP 1 then STEP 2, **before the 4C merge to `master`**)
```sql
-- ════════════════════════════════════════════════════════════════════════════
-- Sprint 4C · F-62 · a reader's day is their own local day
-- Run STEP 1, then STEP 2, BEFORE the 4C branch is merged to master (and so before any
-- 4C backend deploy). Precondition: the Sprint 4A backend is live (GET /version = 4A SHA).
-- Both columns are nullable with no default: metadata-only in PostgreSQL, no table rewrite,
-- existing rows untouched. Re-running either step is harmless. Rollback at the end.
-- ════════════════════════════════════════════════════════════════════════════

-- STEP 1 — add the columns
ALTER TABLE "user"           ADD COLUMN IF NOT EXISTS timezone  VARCHAR(64);
ALTER TABLE reading_activity ADD COLUMN IF NOT EXISTS local_day BOOLEAN;

-- STEP 2 — READ-ONLY verify: must list exactly 2 rows, then both SELECTs must succeed
SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = current_schema()
   AND ((table_name = 'user' AND column_name = 'timezone')
     OR (table_name = 'reading_activity' AND column_name = 'local_day'))
 ORDER BY table_name;
SELECT COUNT(*) AS users_with_zone        FROM "user"           WHERE timezone  IS NOT NULL;   -- 0 before deploy
SELECT COUNT(*) AS local_day_rows         FROM reading_activity WHERE local_day IS TRUE;       -- 0 before deploy

-- ROLLBACK (only AFTER the backend is back on a pre-4C SHA; pre-4C code never selects these
-- columns, so leaving them in place is also safe):
-- ALTER TABLE reading_activity DROP COLUMN IF EXISTS local_day;
-- ALTER TABLE "user"           DROP COLUMN IF EXISTS timezone;
```
**Why each line:**
- **`"user"` is quoted**, as everywhere else in the file: `user` is reserved in PostgreSQL.
- **`timezone` is not a PostgreSQL keyword.** It is a function name and a setting name, not reserved. The STEP 2 `SELECT … WHERE timezone IS NOT NULL` proves that SQLAlchemy's unquoted form works before any code depends on it (A-6).
- **`VARCHAR(64)`** matches `MAX_ZONE_LEN`. The longest IANA name in tzdata 2026.2 is 32 characters (verified).
- **No index:** nothing filters on either column. The scheduler loads push users by id.
- **Pre-4C code keeps working after STEP 1.** SQLAlchemy selects only mapped columns, and new nullable columns are invisible to it. So STEP 1 can run at any time after 4A is live, days before 4C merges.

### `app/schema_guard.py` (new) + `app/main.py` startup: the backstop for R-14
```python
# app/schema_guard.py
"""Refuse to start on PostgreSQL if a column the models need has not been migrated.

April 2026: pushing a models.py column before its Supabase migration crashed every User query
(login down). A process exit at startup instead makes Render fail the deploy and keep the previous
version serving (assumption A-1). Every future column migration appends to REQUIRED_COLUMNS.
"""
from sqlalchemy import text

REQUIRED_COLUMNS = (
    ("user", "timezone"),              # Sprint 4C
    ("reading_activity", "local_day"), # Sprint 4C
)


def assert_migrated(engine) -> None:
    if engine.dialect.name != "postgresql":
        return                                   # SQLite dev/tests: create_all owns the schema
    wanted = {t for t, _ in REQUIRED_COLUMNS}
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT table_name, column_name FROM information_schema.columns "
                     "WHERE table_schema = current_schema() AND table_name = ANY(:t)"),
                {"t": list(wanted)},
            ).all()
    except Exception as e:                       # a DB hiccup on a cold start must not block startup
        print(f"[schema_guard] check skipped: {type(e).__name__}")
        return
    present = {(r[0], r[1]) for r in rows}
    missing = [f"{t}.{c}" for t, c in REQUIRED_COLUMNS if (t, c) not in present]
    if missing:
        raise RuntimeError("Migration not applied — missing column(s): " + ", ".join(missing)
                           + ". Run context/supabase_migration.sql (Sprint 4C STEP 1) first.")
```
```python
# app/main.py — startup_event, first line
@app.on_event("startup")
async def startup_event():
    from .database import engine
    from .schema_guard import assert_migrated
    assert_migrated(engine)                      # R-14: exits before serving if the 4C SQL has not run
    from .notifications.scheduler import start_scheduler
    start_scheduler()
    print("✅ Application started.")
```
- **Fail-closed only on a definitive "missing" answer.** It fails open on a query error, because the free tier cold-starts on every wake and a transient DB stall must not stop the app.
- **Cost:** one small query per process start.
- **Not the primary control.** The deploy order is. This makes a skipped step fail the deploy instead of breaking login.

### `app/deps.py :: get_current_user`
```python
from fastapi import Depends, HTTPException, Request, status
from . import crud, auth, localday

def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    ...  # token → user, unchanged through line 76

    # Sprint 4C (R-07, R-10): the device zone, then last_active once per LOCAL day — one commit.
    now = localday.utcnow()
    dirty = False
    reported = localday.valid_zone(request.headers.get(localday.ZONE_HEADER))
    if reported and reported != user.timezone:
        user.timezone = reported
        dirty = True
    zone = localday.zone_of(user)
    if user.last_active is None or localday.local_date(user.last_active, zone) < localday.local_date(now, zone):
        user.last_active = now
        dirty = True
    if dirty:
        db.add(user)
        db.commit()
    return user
```
- Delete the old lines 78-85 (`from datetime import datetime as _dt` … `db.commit()`).
- `get_current_user_optional` is **not** changed. Its only users are the optional-auth feed and Google Books routes, which compute no "today".
- **Query count:** unchanged for a request with no zone change and no new local day. The F-08 counter test in `tests/test_notes.py:98` already warms up once to absorb the daily write, and it sends no header.

### `app/routers/auth_router.py` (both login paths)
- **`google_auth`, lines 90-96, becomes:**
  ```python
          # Login is activity on the reader's day, whatever their zone (R-10). No date comparison.
          user.last_active = localday.utcnow()
          db.add(user)
          db.commit()
          db.refresh(user)
  ```
- **`review_login`, lines 161-168:** the same replacement. Remove `from datetime import datetime, date` at line 137 once nothing in that function uses it.
- **Module import:** `from .. import localday`. Remove a module-level `date` import only if it becomes unused (Builder greps).

### `app/routers/userbooks_router.py :: update_progress`
```python
from datetime import datetime, timedelta
from .. import localday
...
    now = localday.utcnow()
    # ✅ Always update timestamp
    userbook.updated_at = now

    # ✅ Log reading activity if pages increased — on the reader's LOCAL day (R-01, R-02)
    if new_page > old_page:
        pages_read = new_page - old_page
        label = localday.day_label(localday.local_today(localday.zone_of(current_user), now))
        existing_activity = db.exec(
            select(models.ReadingActivity)
            .where(models.ReadingActivity.user_id == userbook.user_id)
            .where(models.ReadingActivity.userbook_id == userbook_id)
            .where(models.ReadingActivity.date >= label)
            .where(models.ReadingActivity.date < label + timedelta(days=1))
        ).first()
        if existing_activity:
            existing_activity.pages_read = (existing_activity.pages_read or 0) + pages_read
            existing_activity.current_page = new_page
            db.add(existing_activity)          # an old (local_day NULL) row keeps its flag — D-5 depends on it
        else:
            db.add(models.ReadingActivity(
                user_id=userbook.user_id, userbook_id=userbook_id, date=label,
                pages_read=pages_read, current_page=new_page,
                local_day=True, created_at=now,
            ))
```
- The half-open range replaces `>= today`. It is what stops a write merging into a **future** pre-4C row (D-4). It also tolerates test rows stored with a time of day.
- `current_user` is the owner here (`:50` 404 check), and `get_current_user` has already applied the request's header, so `zone_of(current_user)` is the device zone.
- Remove the redundant local `from ..models import ReadingActivity` at `:90`.

### `app/routers/reading_activity_router.py`
```python
from datetime import datetime, timedelta, date as date_type
from .. import localday

def _label(v):
    return v.date() if isinstance(v, datetime) else v

def _cutover_bridge(old_days: set, new_days: set) -> set:
    """D-5 / R-06: pre-4C labels shift after-midnight reading one day earlier; forgive the single
    day this leaves between the last pre-4C label and the first local-day label. Once per reader."""
    if not old_days or not new_days:
        return set()
    last_old, first_new = max(old_days), min(new_days)
    if first_new - last_old == timedelta(days=2):
        return {last_old + timedelta(days=1)}
    return set()
```
- **`/daily` (`:23`):** `end_date = localday.local_today(localday.zone_of(current_user))`.
- **`/user/{user_id}/daily` (`:224`):** `end_date = localday.local_today(localday.zone_of(user))`. This uses **`user`**, the subject loaded at `:211`, not `current_user`.
- **`/insights`:**
  ```python
      zone = localday.zone_of(current_user)
      today = localday.local_today(zone)
      year_start = date_type(today.year, 1, 1)
      ...
      finished_this_year = [
          ub for ub in finished_ubs
          if ub.updated_at and localday.local_date(ub.updated_at, zone) >= year_start
      ]
      ...
      active_dates, old_days, new_days = set(), set(), set()
      for a in activities:
          d = _label(a.date)
          active_dates.add(d)
          (new_days if a.local_day else old_days).add(d)
      streak_dates = active_dates | _cutover_bridge(old_days, new_days)
      # current_streak and longest_streak iterate streak_dates (was active_dates); the
      # monthly, 30-day and projected blocks keep iterating `activities` exactly as now.
  ```
- The response dict is **byte-identical in keys**, including the 4A aliases. Replace the three inline `a.date.date() if isinstance(...)` expressions with `_label(a.date)`.

### `app/routers/users_router.py :: get_user_stats`
```python
from .. import localday
...
    zone = localday.zone_of(user)                       # the SUBJECT's zone (R-04)
    now = localday.utcnow()
    one_month_ago = now - timedelta(days=30)            # rolling window, unchanged (D-8)
    year_start = date(localday.local_today(zone, now).year, 1, 1)
    ...
    this_year = len([
        b for b in all_books
        if b.status == "finished" and b.updated_at and localday.local_date(b.updated_at, zone) >= year_start
    ])
```
`from datetime import date` is added to the existing import line.

### `app/routers/profile_router.py :: get_profile` (`GET /profile/me` only)
- Add `"timezone": getattr(user, "timezone", None),` after `"is_private_profile"`.
- **Not** in `get_public_profile` (`:201`), and not in `update_profile`'s response. `PUT /profile/me` does **not** accept `timezone`; the header is the only way in (D-1).

### `app/notifications/dispatcher.py`
```python
from datetime import datetime, timedelta
from .. import localday

def _check_daily_cap(db: Session, actor_id: int, recipient_id: int, event_type: str, now: datetime) -> bool:
    """True = allowed. "Today" is the RECIPIENT's local day (R-12)."""
    from ..models import NotificationLog, User
    zone = localday.zone_of(db.get(User, recipient_id))     # identity-map hit: _user_wants_event loaded it
    last = db.exec(
        select(NotificationLog.sent_at)
        .where(
            NotificationLog.user_id == recipient_id,
            NotificationLog.actor_id == actor_id,
            NotificationLog.event_type == event_type,
            NotificationLog.sent_at >= now - timedelta(hours=48),
        )
        .order_by(NotificationLog.sent_at.desc())
    ).first()
    return last is None or localday.local_date(last, zone) < localday.local_date(now, zone)
```
- **In `fire_event`:**
  - Compute `now = localday.utcnow()` once, after the config checks.
  - Pass it to `_check_daily_cap(db, actor_id, user_id, event_type, now)`.
  - Construct `NotificationLog(..., sent_at=now)`.
- **Signature, summary dict and every caller: unchanged.**
- **Why 48 h:** a local day starts at most 26 h before "now" in any zone (UTC+14, 25-hour DST day). The bound keeps the query on recent rows.
- Remove the `date` import if unused.

### `app/notifications/scheduler.py`
```python
"""
Inactivity reminder (Sprint 4C, D-6): every 15 minutes, remind readers whose OWN clock reads
20:00–21:59, who have not been active on their local today and have not been reminded on it.
Idempotent across restarts and Render sleep: "already reminded" is the NotificationLog table.
"""
from datetime import timedelta
...
from .. import models, localday

REMINDER_EVENT = "reading_streak_reminder"
WINDOW_START_HOUR, WINDOW_END_HOUR = 20, 22     # local wall clock, [start, end)


def _send_inactivity_reminders() -> None:
    event_cfg = NOTIFICATION_EVENTS.get(REMINDER_EVENT, {})
    if not event_cfg.get("is_active", False):
        print("[scheduler] reading_streak_reminder is disabled — skipping.")
        return

    now = localday.utcnow()
    with Session(engine) as db:
        # Any push channel — expo (mobile) or web (PWA). Not filtered by token_type (unchanged).
        user_ids = db.exec(select(models.PushToken.user_id).distinct()).all()
        if not user_ids:
            return
        users = db.exec(select(models.User).where(models.User.id.in_(user_ids))).all()

        due = {}                                   # user_id -> (zone, local today)
        for user in users:
            zone = localday.zone_of(user)
            wall = localday.local_now(zone, now)
            if not (WINDOW_START_HOUR <= wall.hour < WINDOW_END_HOUR):
                continue
            today = wall.date()
            if user.last_active and localday.local_date(user.last_active, zone) >= today:
                continue                           # active on their own today
            due[user.id] = (zone, today)

        if due:
            sent_rows = db.exec(
                select(models.NotificationLog.user_id, models.NotificationLog.sent_at).where(
                    models.NotificationLog.event_type == REMINDER_EVENT,
                    models.NotificationLog.user_id.in_(list(due)),
                    models.NotificationLog.sent_at >= now - timedelta(hours=48),
                )
            ).all()
            for uid, sent_at in sent_rows:
                if uid in due and localday.local_date(sent_at, due[uid][0]) == due[uid][1]:
                    del due[uid]                   # already reminded on their local today

        recipient_ids = sorted(due)
        if not recipient_ids:
            return
        summary = fire_event(db=db, event_type=REMINDER_EVENT, actor_id=0,
                             actor_name="TrackMyRead", recipient_ids=recipient_ids)
    print(f"[scheduler] Inactivity reminders sent: {summary.get('sent', 0)} users notified.")


def start_scheduler() -> None:
    scheduler.add_job(
        _send_inactivity_reminders,
        CronTrigger(minute="0,15,30,45", timezone="UTC"),
        id="inactivity_reminder",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
        misfire_grace_time=600,
    )
    if not scheduler.running:
        scheduler.start()
    print("[scheduler] Started — inactivity reminder runs every 15 min; each reader at 20:00–22:00 their time.")
```
- **Unchanged:**
  - The early `return`s. There is nothing to log when no one is due; 96 runs/day must not spam the Render log.
  - `stop_scheduler`, and the `AsyncIOScheduler(timezone="UTC")` construction.
- **The per-user `db.get` loop at `:38-44` goes** (it was N+1), replaced by one `IN()`.

### `requirements.txt`
- Add `tzdata==2026.2` (the version verified in `.venv`).
- **The file is UTF-16 LE with a BOM** (`file requirements.txt`). Edit it with an encoding-preserving tool, then check `pip install -r requirements.txt --dry-run` parses it.
- `requirements.txt.txt` (ASCII, stale) is **not** touched.

### API tests (see the Test Strategy section for the full list)
- **New:** `tests/test_local_day.py`.
- **Changed:**
  - `tests/conftest.py` (clock fixtures)
  - `tests/test_reading_activity.py`
  - `tests/test_scheduler.py`
  - `tests/test_auth.py` (F-62 test)
  - `tests/test_follow_profile.py` (key set + `timezone`)
  - `tests/test_sql_artifacts.py` (4C SQL section)

---

## Package WEB — `book-tracker-frontend-stitch/` + `qa/unit/`

### `src/utils/localDate.js` (new, no imports)
```js
// Sprint 4C (F-62): the reader's day is their device's day.
// deviceTimeZone(): the IANA zone to send as X-Timezone, or null.
// parseDayLabel(): a server calendar label ("YYYY-MM-DD" or "YYYY-MM") as a LOCAL Date at midnight.
//   new Date("2026-10-03") is UTC midnight, which shows Oct 2 anywhere west of UTC.
export function deviceTimeZone(intl = globalThis.Intl) {
  try {
    const z = intl?.DateTimeFormat?.().resolvedOptions?.().timeZone
    return typeof z === 'string' && z.length > 0 && z.length <= 64 ? z : null
  } catch {
    return null
  }
}

export function parseDayLabel(s) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(typeof s === 'string' ? s : '')
  return m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1) : null
}
```

### `src/services/api.js :: apiFetchRaw`
```js
import { deviceTimeZone } from '../utils/localDate'
...
  const token = getToken();
  const tz = deviceTimeZone();              // read per request: follows a device zone change without a reload
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tz ? { 'X-Timezone': tz } : {}),
    ...options.headers,
  };
```
- The raw `fetch` in `uploadProfilePicture` is left alone: the server falls back to the stored zone.
- No cache change.

### `src/pages/InsightsPage.jsx:190`
- `new Date(p.projected_finish).toLocaleDateString(...)` becomes `parseDayLabel(p.projected_finish)?.toLocaleDateString('default', { month: 'short', day: 'numeric' })`.
- `monthLabel` (`:13-17`) is already local-safe; leave it.

### `qa/unit/localDate.test.mjs` (new; `node --test qa/unit/`)
- It imports `book-tracker-frontend-stitch/src/utils/localDate.js` via the `pathToFileURL` pattern of `qa/unit/navigation.test.mjs`. See the Test Strategy section: W-01..W-06.

---

## Package ANDROID — `book-tracker-mobile-stitch/`

### `src/services/localDate.js` (new, import-free like `httpPolicy.js`, so `node --test` can load it)
- The same two functions as web, plus:
```js
// Whole local days from today's local midnight to the label's (DST-safe: rounds 23/25-hour days).
export function daysUntil(label, now = new Date()) {
  const d = parseDayLabel(label)
  if (!d) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((d - today) / 86_400_000)
}
```

### `src/services/api.js` request interceptor (`:21-29`)
```js
import { deviceTimeZone } from './localDate';
...
    if (token) config.headers.Authorization = `Bearer ${token}`;
    const tz = deviceTimeZone();
    if (tz) config.headers['X-Timezone'] = tz;
```
Hermes already evaluates `Intl.DateTimeFormat().resolvedOptions().timeZone` in shipped 2.2.x (`BookDetailScreen.js:18`), so this adds no Intl dependency.

### `src/screens/InsightsScreen.js:22-38`
- `shortMonth` / `shortDate` use `parseDayLabel(dateStr)` instead of `new Date(dateStr)`, and return `''` on null.
- `daysLeft(dateStr)` becomes `const n = daysUntil(dateStr); return n > 0 ? n : null;`.

### `app.json`
- `version` becomes `2.2.3` and `android.versionCode` becomes `62`.
- `scripts/check-version-bump.js` (`__tests__/versionGuard.test.mjs`) compares against `release/last-released.json`. That file is updated by the 2.2.2 release step, **not** by this package.

### `__tests__/localDate.test.mjs` (new): M-01..M-07.

---

## History: how old and new rows are read (R-05, R-06)

| Question | Answer |
|---|---|
| Which rows are old? | `reading_activity.local_day IS NULL`: everything written before the 4C deploy. Labelled with the UTC day of the write |
| Are they changed at deploy? | No. No UPDATE, no backfill. STEP 1 adds an empty column |
| How are they read? | As calendar labels, exactly like new rows: `/daily`, `monthly_pages`, the 30-day average, circle totals and streak sets all use `date.date()` |
| Can one day's pages count twice? | No. Pages are deltas, and each update adds to exactly one row: the one carrying that userbook's label, or a new one. `[label, label+1d)` means no two rows per userbook share a label |
| Can a total change at deploy? | No. Deploy writes nothing, so every sum is identical before and after (T-4C-H1) |
| Can a new write land in an old row? | Yes, when the labels match (same day). Its pages are added, and the row keeps `local_day` NULL. It is still one row, one label |
| Old rows labelled after today (west of UTC)? | Excluded from `/daily` and from the current streak until their date. Later reading that day merges into them (D-4) |
| Streak across the switch? | The union of labels, plus at most one bridge day (D-5). The chart shows the gap as it is: the pages really are on the earlier label |
| Readers who report a zone later (2.2.3 update, first web visit) | Treated like travel. No second bridge (D-7) |

---

## Test Strategy — deterministic regardless of the machine's clock and zone

### The clock seam and the pin (`tests/conftest.py`)
```python
from datetime import datetime
import app.localday as localday

@pytest.fixture(autouse=True)
def pinned_now(monkeypatch):
    """Every test sees localday.utcnow() == today's UTC date at 06:00:00.

    06:00 UTC is the same calendar date from UTC−6 to UTC+14, including IST (11:30) and UTC,
    so tests that build data with the real datetime.utcnow() agree with the server's "today".
    The hour is fixed, so no test can depend on the wall-clock hour (F-62). Boundary tests
    override with freeze_at()."""
    pinned = datetime.utcnow().replace(hour=6, minute=0, second=0, microsecond=0)
    monkeypatch.setattr(localday, "utcnow", lambda: pinned)
    return pinned

@pytest.fixture()
def freeze_at(monkeypatch):
    """freeze_at("2026-09-17T19:00:00") → localday.utcnow() returns that naive-UTC instant."""
    def _freeze(iso: str) -> datetime:
        t = datetime.fromisoformat(iso)
        monkeypatch.setattr(localday, "utcnow", lambda: t)
        return t
    return _freeze
```
**Why the date floats but the hour does not:**
- Code outside the seam still reads the real clock: circle month starts (`groups_router.py:60,926`) and model `default_factory` timestamps.
- A fixed date (say 2026-06-15) would put a progress row outside the real month's circle window and break `test_groups.py:71-86`.
- Floating the date keeps both clocks on one date. Fixing the hour removes every time-of-day dependency, which is F-62's whole failure class.
- **Every boundary test pins a full explicit instant**, and builds its rows with explicit datetimes, not `datetime.utcnow()`.

**Machine zone independence:**
- `app/` stops calling any server-local clock, enforced by T-4C-S1.
- All zone math uses explicit `ZoneInfo`.
- The machine's `TZ` therefore cannot reach any assertion.
- **Senior QA's proof run:** run the suite twice on Windows, once with the OS zone at IST and once at `America/Los_Angeles` (Settings → Time), plus once inside 00:00–05:30 IST. All three must be identical.

**Isolation rule:** a test that sends `X-Timezone` or sets `user.timezone` creates its **own** user (unique email). Shared users `alice_f`, `bob_f` and `admin_f` must keep `timezone = NULL`.

### F-62's three tests (R-16)
| Test | Why it failed 00:00–05:30 IST | 4C fix |
|---|---|---|
| `tests/test_auth.py::TestReviewLogin::test_last_active_set_to_today` | Asserted `last_active.date() == date.today()`: a UTC instant against the machine's local date | Assert `user.last_active == pinned_now` (login sets it to the seam's now). Add T-4C-A3 at an explicit boundary |
| `tests/test_scheduler.py::test_inactivity_reminder_skips_user_active_today` | Scheduler `date.today()` (local) vs `last_active` UTC | `freeze_at("<pinned date>T14:30:00")`; `last_active = frozen − 1 h`; assert no row |
| `tests/test_scheduler.py::test_inactivity_reminder_daily_cap_prevents_second_send` | Cap used `date.today()` midnight (local) vs `sent_at` UTC | `freeze_at(...T14:30:00)`; two runs, one row. The cap and `sent_at` share the seam |

**All other scheduler tests** (`test_scheduler.py:52-143`):
- Add `freeze_at("<date>T14:30:00")` (20:00 IST), because the default pin of 06:00 UTC is 11:30 IST, outside the window.
- `_inactive_user` sets `last_active = frozen − 2 days` instead of `datetime.utcnow() − 2 days`.

**Retire the triage's "gate correction":** after 4C, every pytest gate is an exact count again. Record that in `qa/reports/triage-2026-09-13.md` (Doc Sync).

### New and changed API tests (ids for Senior QA's tests.md)
**`tests/test_local_day.py` (new)**

| id | Asserts |
|---|---|
| T-4C-U1 | `valid_zone`: accepts `Asia/Kolkata`, `America/New_York`, `UTC`, `Asia/Calcutta`; rejects `Mars/Olympus`, `../../etc/passwd`, `/etc/localtime`, `asia/kolkata`, `""`, `None`, `123`, a 65-character string, `localtime`, `posixrules` |
| T-4C-U2 | `zone_of`: `None` user → Kolkata; `timezone=None` → Kolkata; `timezone="garbage"` → Kolkata; valid → that zone |
| T-4C-U3 | `local_date`: `2026-09-17T19:00` naive → IST `2026-09-18`, New York `2026-09-17`, UTC `2026-09-17`; an aware input is honoured |
| T-4C-U4 | DST: New York `2026-03-08T04:59Z` → 3-07 (23:59 EST); `05:00Z` → 3-08; `07:30Z` → 3-08 with `local_now` hour 3 (02:xx does not exist); `2026-11-01T04:30Z` → 11-01 (00:30 EDT); `local_now` hour at `2026-11-02T01:00Z` = 20 (EST) |
| T-4C-U5 | `day_label(date(2026,9,18)) == datetime(2026,9,18,0,0)` |
| T-4C-H1 | **Header persisted:** new user, `GET /profile/me` with `X-Timezone: America/New_York` → 200, `timezone == "America/New_York"`, DB row equal |
| T-4C-H2 | **Garbage ignored:** same user, each rejected value from U1 → 200, `timezone` unchanged; no response differs except `timezone` stays |
| T-4C-H3 | **Header never logged:** `caplog` + `capsys` contain no `Mars/Olympus` or `etc/passwd` after H2 |
| T-4C-H4 | **Absent header:** stored zone unchanged; a user who never sent one has `timezone: null` |
| T-4C-H5 | **Travel:** Kolkata, then `Europe/London` → the stored zone follows; exactly one UPDATE per change (SQLAlchemy `before_cursor_execute` counter, as in F-08) |
| T-4C-H6 | **CORS preflight:** `OPTIONS /profile/me` with `Origin: https://www.trackmyread.com`, `Access-Control-Request-Headers: authorization,content-type,x-timezone` → 200 and `access-control-allow-headers` contains `x-timezone` |
| T-4C-H7 | **Not exposed:** `/profile/{id}` (followed and locked), `/users/search`, `/users/{id}/stats` and admin `/admin/users` contain no `timezone` key for a user whose zone is set |
| T-4C-L1 | **`last_active` per local day:** IST user; `freeze_at("2026-09-17T18:00")` request → set; `freeze_at("2026-09-17T19:00")` (00:30 IST 18 Sep) request → **updated** (the UTC date is unchanged) |
| T-4C-L2 | New York user at `2026-09-18T03:00Z` (23:00 EDT 17 Sep) then `03:30Z` → **not** updated (same local day) |
| T-4C-P1 | **R-01:** IST user, `freeze_at("2026-09-17T19:00")`, PUT progress +10 → row `date == 2026-09-18 00:00`, `local_day is True`, `created_at == frozen` |
| T-4C-P2 | Same instant, New York user → `2026-09-17`; UTC user → `2026-09-17` |
| T-4C-P3 | **R-02 merge across UTC midnight:** IST, `2026-09-17T19:00` +10 and `2026-09-18T18:00` (23:30 IST) +5 → one row `2026-09-18`, pages 15 |
| T-4C-P4 | Split at local midnight: IST `2026-09-18T18:29` +5 and `18:31` +5 → two rows, `09-18` and `09-19` |
| T-4C-P5 | **Future-row guard:** seed old row (`local_day` NULL) labelled `2026-09-19`; New York user at `2026-09-18T20:00Z` (16:00 EDT 18 Sep) +7 → a **new** row `09-18`; the `09-19` row is unchanged |
| T-4C-P6 | **Merge into a same-label old row:** seed old row `09-18` (NULL); IST user at `2026-09-18T10:00Z` +4 → the same row +4, `local_day` still NULL, row count unchanged |
| T-4C-R1 | `/daily` at `2026-09-17T19:00Z`: IST user's last element `date == "2026-09-18"`; New York user's `"2026-09-17"` |
| T-4C-R2 | `/user/{id}/daily`: a **New York** viewer reads an **IST** subject at `2026-09-17T19:00Z` → last element `"2026-09-18"` (the subject's day) |
| T-4C-R3 | Insights year boundary: IST user, a book finished (`updated_at`) at `2026-12-31T20:00Z`; `freeze_at("2027-01-01T02:00")` → `finished_this_year == 1`. The same for a UTC user → 0. `monthly_pages[-1].month == "2027-01"` for IST |
| T-4C-R4 | `/users/{id}/stats` `this_year` follows the **subject's** zone, with the same data as R3 |
| T-4C-R5 | `projected_finish` = local today + `days_left` (IST at `2026-09-17T19:00Z` → counted from `2026-09-18`) |
| T-4C-B1 | **Bridge:** IST user; seed old rows `09-14`, `09-15`, `09-16` (NULL) and a new row `09-18` (True); `freeze_at("2026-09-18T10:00")` → `current_streak == 5`, `longest_streak == 5` |
| T-4C-B2 | No bridge across a 3-day gap: old `09-15`, new `09-18` → `current_streak == 1` |
| T-4C-B3 | No bridge between two new rows: new `09-16` and `09-18` → 1 |
| T-4C-B4 | No bridge when there are no new rows: old `09-16`, today `09-18` → `current_streak == 0` |
| T-4C-B5 | The bridge touches only streaks: B1's `/daily` has `pages_read == 0` on `09-17`, and `monthly_pages` equals the seeded sum |
| T-4C-B6 | West future row: New York, old row `09-19`, new row `09-18`, at `2026-09-18T20:00Z` → `current_streak` counts `09-18`, not 2; `/daily` last element is `09-18` and holds no `09-19` pages |
| T-4C-H8 | **Deploy invariance:** seed 40 old rows across 3 users; GET `/daily?days=60`, insights and `/groups/{id}/goal` → sums equal the seeded sums; every row's `(date, pages_read, local_day)` is unchanged after the reads |
| T-4C-G1 | `assert_migrated` with a stub engine: `dialect.name="sqlite"` → no query; `"postgresql"` + rows missing `local_day` → `RuntimeError` naming `reading_activity.local_day`; both present → returns; `connect()` raises → returns (fail-open), with a log line naming only the exception type |
| T-4C-G2 | `app.localday` import guard: patch `zoneinfo.available_timezones` to a set without the fallback, then `importlib.reload(app.localday)` → `RuntimeError`. **Teardown reloads it again, unpatched**, so later tests see the real module. Senior QA may drop this case if the reload proves brittle, and record that in Build Notes |
| T-4C-S1 | **Static:** walking `app/**/*.py` (AST, not regex) finds no call to `date.today()`, `datetime.today()`, or `datetime.now()` / `time.localtime()` without an argument |
| T-4C-S2 | **Static:** no `from app.localday import utcnow` / `from ..localday import utcnow` / `from .localday import utcnow` anywhere in `app/` |

**`tests/test_scheduler.py` (rewritten fixtures, plus new cases).** Every case uses `freeze_at`.

| id | Asserts |
|---|---|
| T-4C-N1 | Never-reported user, inactive: 14:30Z → sent; 14:15Z (19:45 IST) → not; 16:30Z (22:00 IST) → not |
| T-4C-N2 | `Asia/Kathmandu` user: 14:15Z (20:00 NPT) → sent; 14:00Z → not |
| T-4C-N3 | `America/New_York` user on `2026-09-18`: 14:30Z → not; `2026-09-19T00:00Z` (20:00 EDT) → sent |
| T-4C-N4 | **F-62 regression:** IST user, `last_active = 2026-09-17T19:00Z` (00:30 IST 18 Sep); run at `2026-09-18T14:30Z` → **not** sent. Pre-4C code sends here |
| T-4C-N5 | Catch-up and once-per-day: IST, runs at 15:45Z, 16:00Z and 16:15Z → exactly one row; next local day 14:30Z → a second row |
| T-4C-N6 | DST: New York, `2026-11-02T01:00Z` (20:00 EST) → sent; `2026-11-02T00:00Z` (19:00 EST) → not |
| T-4C-N7 | Query shape: with 20 push users, one run issues ≤ 3 SELECTs before `fire_event` (counter) — the N+1 is gone |
| T-4C-N8 | **Cap per recipient day:** actor A → B (IST) `book_completed` at `2026-09-18T17:30Z` (23:00 IST) and `2026-09-18T19:00Z` (00:30 IST 19 Sep) → 2 rows; at `04:30Z` and `12:30Z` the same day → 1 row |
| T-4C-N9 | Existing preference, disabled-event, no-token and web-only cases keep passing under `freeze_at` |

**Changed existing tests**
- `test_follow_profile.py::test_profile_me_response_shape_unchanged`: add `"timezone"` to the key set, with a comment naming 4C R-13.
- `test_reading_activity.py`:
  - Any test asserting on "today" must be correct under the default pin.
  - `_log_activity` keeps its signature; it inherits the pinned date.
  - `:86`, `:304`, `:330`, `:347-349` compute "today" as `localday.local_today(localday.zone_of(None))`, not `datetime.utcnow().date()`.
- `test_sql_artifacts.py`: the 4C section exists and contains both `ADD COLUMN IF NOT EXISTS` statements, the verify `SELECT`, and both `DROP COLUMN` lines only inside comments.

### Client tests
**Web: `qa/unit/localDate.test.mjs`**

| id | Asserts |
|---|---|
| W-01 | `deviceTimeZone()` returns a string under Node |
| W-02 | A stub Intl returning `undefined`, `""`, a 65-character string, or throwing → `null` |
| W-03 | With `process.env.TZ = 'America/Los_Angeles'`, `parseDayLabel('2026-10-03').getDate() === 3` **and** `new Date('2026-10-03').getDate() === 2` (proves the bug the fix removes) |
| W-04 | `parseDayLabel('2026-10')` → October 1, local |
| W-05 | Bad inputs → `null` |
| W-06 | Source rule: `apiFetchRaw` sets `'X-Timezone'` from `deviceTimeZone()` (text or AST check on `api.js`) |

**Android: `__tests__/localDate.test.mjs`**
- M-01..M-05 mirror W-01..W-05.
- **M-06:** `daysUntil('2026-11-02', new Date(2026, 10, 1, 23, 0))` in `America/New_York` → 1 (across the 25-hour day).
- **M-07:** an AST test via `_ast.mjs`: the request interceptor in `src/services/api.js` sets `config.headers['X-Timezone']`, and `InsightsScreen.js` no longer calls `new Date(dateStr)` in `shortMonth`, `shortDate` or `daysLeft`.

### Mutation proof (required before any gate is trusted; see project memory "mutation-test agent tests")
**Senior QA breaks each fix with a one-line revert and records the red message.** Then restore with `git checkout -- <file>`.

| Revert | Must fail |
|---|---|
| Label back to `utcnow().replace(hour=0…)` | P1, R1 |
| `>= label` without the upper bound | P5 |
| Drop `_cutover_bridge` from `streak_dates` | B1 |
| Bridge condition `== 2` → `>= 2` | B2 |
| `deps` compares UTC dates | L1 |
| Header persistence removed | H1, H5 |
| `valid_zone` returns the raw string | H2 |
| Scheduler window check removed | N1 (14:15Z send) |
| Scheduler uses `zone_of(None)` for everyone | N3 |
| Cap back to `date.today()` | N8 |
| Subject → viewer zone in `/user/{id}/daily` | R2 |
| `localday` imported with `from … import utcnow` in one router | S2 |
| Web `parseDayLabel` → `new Date(s)` | W-03 |

---

## Execution Plan — three Builder packages, disjoint file sets

| Package | Scope | Files (exhaustive) |
|---|---|---|
| **API** | R-01..R-14, R-16 (all server work, migration, guard, tests) | `app/localday.py` (new), `app/schema_guard.py` (new), `app/models.py` ⚑, `context/supabase_migration.sql` ⚑, `app/main.py`, `app/deps.py`, `app/routers/auth_router.py`, `app/routers/userbooks_router.py`, `app/routers/reading_activity_router.py`, `app/routers/users_router.py`, `app/routers/profile_router.py`, `app/notifications/dispatcher.py`, `app/notifications/scheduler.py`, `requirements.txt` (UTF-16), `tests/conftest.py`, `tests/test_local_day.py` (new), `tests/test_scheduler.py`, `tests/test_reading_activity.py`, `tests/test_auth.py`, `tests/test_follow_profile.py`, `tests/test_sql_artifacts.py` |
| **WEB** | R-07 (web), R-15 (web) | `book-tracker-frontend-stitch/src/utils/localDate.js` (new), `book-tracker-frontend-stitch/src/services/api.js`, `book-tracker-frontend-stitch/src/pages/InsightsPage.jsx`, `qa/unit/localDate.test.mjs` (new) |
| **ANDROID** | R-07 (Android), R-15 (Android), R-17 | `book-tracker-mobile-stitch/src/services/localDate.js` (new), `book-tracker-mobile-stitch/src/services/api.js`, `book-tracker-mobile-stitch/src/screens/InsightsScreen.js`, `book-tracker-mobile-stitch/app.json`, `book-tracker-mobile-stitch/__tests__/localDate.test.mjs` (new), `book-tracker-mobile-stitch/__tests__/versionGuard.test.mjs` (tests.md K-11: its hard-coded `/61/` / `/60/` fail at the 2.2.3/62 bump) |

**Why one API package:**
- Every server change depends on `app/localday.py`.
- Splitting it would need a pre-committed shared module (the 4A `noteVisibility.js` pattern) for roughly 250 changed lines. That is more coordination than the work.

**Disjointness (verified by listing):**
- No file appears in two packages.
- WEB and ANDROID each own a `localDate.js` copy. There is deliberately no shared file across clients, matching the repo's existing per-client duplication (`noteVisibility.js`, `httpPolicy.js`).

**Cross-package dependencies:** none at edit time. At run time:
- WEB and ANDROID are harmless against the pre-4C backend (the header is ignored; CORS already allows it).
- API is correct without either client (stored or fallback zone).

## Merge and deploy order
**Preconditions (gate G-0; all must hold before step 1):**
- **4A backend live:** `GET https://book-tracker-stitch.onrender.com/version` returns the 4A release SHA, and the 4A runbook steps 3 and 7 are complete.
- **2.2.2 AAB built** from its own SHA, and that SHA is tagged `android-2.2.2`. Merging 4C bumps `app.json` to 2.2.3 on `master`.
- `pytest tests -q` is green on `sprint-4c-local-day` rebased onto the then-current `master`. That means **exact counts**, since F-62's exception no longer applies on this branch.
- `node --test qa/unit/` and `node --test book-tracker-mobile-stitch/__tests__/` are green, and `npm --prefix book-tracker-frontend-stitch run build` exits 0.

**Order:**
1. **PM, Supabase:** run the 4C **STEP 1**, then **STEP 2**. STEP 2 must list 2 rows, and both `COUNT(*)` queries must return 0. Send me the output. (It is safe to run days early: pre-4C code ignores the columns.)
2. **Claude:**
   - Merge `sprint-4c-local-day` to `master`.
   - Run `python scripts/gen_dependency_map.py`.
   - Re-run the pytest, node and build gates on the merged tree, then push.
   - Verify `git ls-remote origin -h refs/heads/master` equals the local HEAD.
   - **If Render auto-deploys from `master`, this push is the deploy.** That is why step 1 comes first.
3. **PM:** deploy the backend on Render (if not automatic). **Claude:**
   - `GET /version` returns the new SHA. A deploy is not live until it does.
   - The Render log contains `Started — inactivity reminder runs every 15 min` and no `schema_guard` error.
   - As review.reader: `curl -H "X-Timezone: Asia/Kolkata" …/profile/me` → `"timezone": "Asia/Kolkata"`.
   - `-H "X-Timezone: ../../etc/passwd"` → 200 and still `Asia/Kolkata`.
   - `/profile/{review.reader}` as review.friend has no `timezone`.
4. **PM:** deploy the web on Vercel. **Claude:** confirm the new bundle is served, and that a browser request carries `X-Timezone` (Playwright `request.headers()` on `/profile/me`).
5. **Observe the first evening:** the 14:30 UTC run logs a send count. Runs outside every reader's window log nothing.
6. **Android 2.2.3:** build the AAB with the manual `build-stitch-aab.yml` **only after step 3 is live**. Then the PM device check (header present via the backend's stored `timezone` for the review account; Insights dates) and the PM's Play release decision.

**Rollback:**
- **Backend:** redeploy the previous SHA on Render.
  - Pre-4C code never selects the new columns, so no SQL is needed.
  - Rows written by 4C remain valid labels. Old code reads them the same way, with only the `>= today` merge quirk.
- **Columns:** drop only after a backend rollback is final (the commented SQL). Leaving them is harmless.
- **Web:** redeploy the previous Vercel build.
- **Android:** halt the rollout. The server stays correct for 2.2.2.

## Files NOT to touch
- `app/routers/groups_router.py`: circle periods stay UTC (E-3). Its `ReadingActivity.date >= since` compares labels to a UTC month start, and that is intended.
- `app/routers/admin_router.py`, `app/notifications/router.py`: rolling windows (D-8).
- `app/notifications/config.py`: no event change.
- `app/auth.py`, `app/crud.py`, `app/group_activity.py`, `app/routers/import_router.py`, `app/routers/notes_router.py`, `app/routers/books_router.py`, `app/routers/push_router.py`, `app/routers/meta_router.py`.
- `deps.get_current_user_optional`.
- `requirements.txt.txt`.
- Web: `BookDetailPage.jsx`, `BookPreviewModal.jsx` (Amazon zone logic), `LibraryPage.jsx`, `ProfilePage.jsx`, `UserProfilePage.jsx` (positional "today", already correct), `src/utils/noteVisibility.js`, `src/utils/navigation.js`.
- Android: `BookDetailScreen.js`, `BookPreviewScreen.js`, `ProfileScreen.js`, `UserProfileScreen.js`, `App.js` (no preload change), `src/services/httpPolicy.js`, `release/last-released.json`.
- Production data: no UPDATE or backfill of any row, ever, in this sprint.

## dependency-map.md: curated-section changes (the Builder applies them at merge, tag **(4C — in build)**)
*Not edited on this design branch, by instruction; Doc Sync removes the tag at release.*
1. **`app/deps.py :: get_current_user`:**
   - Replace "writes `user.last_active` once per day" with: "reads `X-Timezone`, stores a valid IANA zone in `user.timezone` when it changed, and writes `last_active` once per **local** day. All in one commit: 1 SELECT, +1 UPDATE per local day or zone change."
2. **`reading_activity` table:**
   - "**Writer:** `PUT /userbooks/{id}/progress` upserts per userbook per **local** day label over `[label, label+1d)`. `date` is a calendar label (naive midnight), not an instant."
   - "`local_day` = true for 4C rows; NULL = pre-4C UTC-day rows, never rewritten."
   - "Insights streaks add one cutover bridge day (4C D-5)."
3. **`GET /profile/me`:** "+ `timezone` (own profile only; never on `/profile/{id}` or any other response)."
4. **`fire_event()` section:**
   - "Daily cap = the recipient's local day."
   - "The scheduler runs every 15 min: `reading_streak_reminder` goes out at 20:00–22:00 in each reader's zone, once per local day."
5. **New section "Time zone (4C)":**
   - "`app/localday.py` is the only clock (`localday.utcnow()`) and the only zone logic."
   - "Clients send `X-Timezone` (web `apiFetchRaw`, Android interceptor)."
   - "Fallback `Asia/Kolkata`."
   - "Another reader's data is computed on **their** day."
   - "`app/schema_guard.py :: REQUIRED_COLUMNS` must list every column added by a migration."
6. **`context/supabase_migration.sql` ↔ `app/models.py`:** add "…and append the column to `app/schema_guard.py :: REQUIRED_COLUMNS`, so a missed migration fails the deploy instead of the app."

Generated appendix: the regenerated table should show **no row changes**, since no route is added or removed and no client function is renamed.

## Security Review
**New input:** `X-Timezone` on every request, fully attacker-controlled.
- **Allowlisted** by exact membership in a frozenset built at import from tzdata.
- **Length-capped** at 64 characters before any lookup.
- **Never touches the filesystem at request time.** `ZoneInfo` is only constructed from allowlisted keys.
- **Never logged,** never echoed to other users, never in an error message.
- Invalid values are ignored with no status change, so the header cannot be used to probe anything.

**Ownership:**
- The zone is written only on the authenticated caller's own row, inside `get_current_user`.
- There is no route to set another user's zone. `PUT /profile/me` does not accept it.
- Progress writes keep the `userbook.user_id == current_user.id` → 404 check.

**Privacy:**
- A time zone is coarse location. It is returned only in the owner's `GET /profile/me`, and is absent from `/profile/{id}`, `/users/search`, `/users/{id}/stats`, the feed, admin lists and notifications (T-4C-H7).
- It is removed with the `user` row on account deletion (`auth_router.delete_own_account`, unchanged).
- `reading_activity.local_day` is a boolean, with no location or travel history (D-5 rejected a per-row zone for this reason).
- Escalation E-4 covers the Privacy page.

**Cross-user reads:**
- `/reading-activity/user/{id}/daily` and `/users/{id}/stats` use the subject's zone internally. Neither returns it, and the `is_private_profile` + follow gates are unchanged.
- One inference remains: the last bar's date reveals whether the subject's day has rolled over (±1 day). This is weaker than the zone itself. **Residual, accepted.**

**Abuse:**
- A user can pick any zone. That moves only **their own** reminder and day labels.
- Alternating extreme zones (UTC+14 / UTC−12) can manufacture an extra streak day. Streaks are self-only and feed no leaderboard; circle leaderboards sum page deltas, which a zone cannot inflate. **Residual, accepted.**
- A client alternating zones on every request causes one UPDATE per request on its own row. That is bounded by its own request rate, with no amplification.

**Availability:**
- A missing tz database, or a missing column on PostgreSQL, stops the process **at startup** (fail the deploy), never per request.
- The schema check fails **open** on a query error, so a slow cold start is not blocked.
- The scheduler's per-run work is 3 bounded queries.

**Unchanged:**
- Auth levels, routes, notification recipients and templates.
- `get_current_user_optional`.

**Residual:**
- **Two processes in flight during a deploy overlap can both send a reminder in the same run.** The pre-filter and cap are check-then-insert, not atomic. This is pre-existing and rare, since a Render overlap is seconds long.
- **A multi-worker start command would multiply the scheduler** (A-3).

## Assumptions
- **A-1:** when a new deploy's process exits at startup, Render marks the deploy failed and keeps the previous deploy serving (Render's zero-downtime behaviour for web services).
  - **Verify:** the PM confirms in the Render dashboard or docs before step 3.
  - **If wrong:** the guard still converts "login broken" into "service down" and names the fix in the log, so it is no worse. The primary control is the deploy order.
- **A-2:** Render auto-deploy from `master` is **off** (the 4A runbook deploys manually). If it is on, the order is still correct: the SQL precedes the merge.
- **A-3:** production runs **one** process (`uvicorn`, as in the docs; `gunicorn` is in `requirements.txt` but not documented as the start command).
  - **If multiple workers:** each runs its own scheduler. The NotificationLog pre-filter and cap stop most duplicates, but not same-instant races.
  - **Verify** the Render start command.
- **A-4:** Hermes `Intl.DateTimeFormat().resolvedOptions().timeZone` returns the IANA zone on the supported Android versions. It is already used in shipped 2.2.x. If it returns nothing, the header is omitted and the stored or fallback zone applies.
- **A-5:** most readers who will never report a zone are in India. This is inferred from the IST reminder and the `.in` Amazon routing. **The PM can confirm** with the Play Console country report. If wrong, `FALLBACK_ZONE` is one constant.
- **A-6:** `timezone` needs no quoting in PostgreSQL. STEP 2's `WHERE timezone IS NOT NULL` proves it before any code depends on it. If STEP 2 errors, stop: the Builder renames the column (`tz`) in the SQL, the model and the guard.
- **A-7:** every production `reading_activity.date` is a midnight label. Pre-4C code only ever wrote `replace(hour=0…)`, and the F-53 dedupe repoints `userbook_id` without touching `date`. The half-open range tolerates non-midnight values anyway.
- **A-8:** `tzdata==2026.2` installs on Render's Python 3.11.0 (pure-Python wheel).
- **A-9:** the device clock's zone is the reader's day. A reader who sets their phone to a zone they don't live in gets that zone's day, which is the PM's "own day" taken literally.

## Escalations (product choices; each has a recommendation, and none blocks the build)
| # | Question | Recommendation | If the PM chooses otherwise |
|---|---|---|---|
| **E-1** | Fallback zone for readers whose app never reports one (Android ≤ 2.2.2 who never use the web) | **`Asia/Kolkata`** (D-3): keeps their reminder at 8 PM IST and fixes Indian readers at once | `UTC`: labels as today for them, but their reminder must then stay pinned to 14:30 UTC by a special case. That brings back two bases; not recommended |
| **E-2** | Bridge the one missing day at the switch for after-midnight readers (D-5) | **Yes**: once per reader, streaks only | No: drop `_cutover_bridge` and the `local_day` column. Some night readers see their streak reset once |
| **E-3** | Circle goal and leaderboard months: whose day? | **Keep UTC.** A circle is shared; there is no single "own day". The error is ±1 day at month edges | A creator-zone or per-member rule is a separate design (circle periods touch 4 sites in `groups_router.py`) |
| **E-4** | Privacy page: say we store the device time zone | **Yes, one sentence:** "We store your device's time zone to work out your reading days and when to send reminders." That is WEB `src/pages/PrivacyPage.jsx`, plus its i18n keys if the page is translated. It is added to the WEB package only on approval | No text change; the zone is still minimised as described |
| **E-5** | Keep Render awake so reminders never miss (for example, a cron ping every 10 min, 14:00–17:00 UTC and other evening bands) | **Not in 4C.** Reliability is already better than today (2 h window vs 1 h grace). A pinger uses free-tier hours and needs its own decision | A GitHub Actions `schedule` workflow pinging `/version`; decide on cost |
| **E-6** | Forgive a streak gap caused by eastward travel | **No.** It is rare, hard to prove, and needs zone history, which we deliberately do not keep | Needs a per-user zone-change log (privacy cost) |

### PM decisions on the escalations (2026-09-19)
| # | Decision | By |
|---|---|---|
| E-1 | **Accepted: `Asia/Kolkata`** is the fallback zone | PM |
| E-2 | **Accepted: bridge once**, for streaks only (`_cutover_bridge` and `reading_activity.local_day` stay in scope) | PM |
| E-3 | **Accepted: keep UTC** for circle goal and leaderboard months | PM reviewer, on the recommendation |
| E-4 | **Accepted: add the one sentence** to the Privacy page, exactly as worded above | PM |
| E-5 | **Accepted: not in 4C** | PM reviewer, on the recommendation |
| E-6 | **Accepted: no** travel forgiveness | PM reviewer, on the recommendation |

**Merge order (restated as a gate):** 4A is live, then the 2.2.2 AAB is built and its commit tagged, then the 4C SQL runs, and only then does 4C merge to `master`.

## Out of scope (observed, not changed)
- **"Active today" means any authenticated request, not logging pages.** Yet the reminder says "You haven't logged any reading today." That is a pre-existing product mismatch; candidate finding for the next triage.
- **`PATCH /userbooks/{id}` with `current_page`** (Android `BookDetailScreen.js:101`) changes progress without writing `reading_activity`, so those pages never appear in charts or streaks. This is pre-existing.
- **Web `LibraryPage.jsx` `WeeklyPulseChart`** labels bars with a fixed `M T W T F S S`, regardless of the actual weekdays. This is cosmetic and pre-existing.
- **F-61** (`/health`) is unaffected. The schema guard does not add a health route.

## Build Notes
_Each Builder fills this in per package: what was built, files changed, deviations from the brief, assumptions confirmed, and verification output. The mutation-proof table must record each revert and its red message._
