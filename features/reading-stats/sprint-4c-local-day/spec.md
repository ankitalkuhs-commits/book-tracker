---
screen: sprint-4c-local-day
feature: reading-stats
repo: api + web + mobile (Android 2.2.3 / versionCode 62)
status: planned
last_verified: 2026-09-18
approved_by: PM decision 2026-09-18 (qa/reports/triage-2026-09-13.md → "PM decisions — 2026-09-18", F-62) — "readers own day always". This spec was drafted by the Architect acting as PM Helper and stays `planned` until the PM marks it APPROVED.
source: qa/reports/triage-2026-09-13.md row F-62; code read on branch sprint-4c-local-day at bca729d
---

## What It Does
A reader's "today" becomes the reader's own local calendar day everywhere: the day their pages are recorded on, the end of their activity chart, their streak, their Insights "this year" and "this month", whether they count as active today, when the evening reminder arrives, and what "once a day" means for notification caps. Today the server mixes two clocks. Page progress is stamped to the UTC day, so reading done between 00:00 and 05:30 in India lands on the previous day. `last_active` is written in UTC but compared against the server machine's local date. Both clients already know the device time zone and will now send it with every request. The server stores the latest valid zone per reader. Readers whose app never sends one (Android 2.2.2 and older) get India time, which keeps their reminder exactly where it is today.

## User story
As a reader, I want the pages I log after midnight to count for the day I am living in, so that my streak, charts and reminders match my own calendar.
- **Evidence:** our finding, not user feedback. F-62 was found from three tests that fail every day between 00:00 and 05:30 IST. A page logged at 01:00 IST counting as "yesterday" follows from the code (`userbooks_router.py:92`).
- **Success metric:**
  - Zero reading-activity rows labelled with a day other than the writer's local day, for rows written after deploy by clients that report a zone.
  - `pytest tests -q` passes at any wall-clock time, with no F-62 gate correction.
  - The reminder reaches each reader between 20:00 and 22:00 of their own zone.

## Appetite
Max complexity: medium (3–5 days across three packages: API, web, Android).

**Not building:**
- Re-bucketing existing `reading_activity` rows (PM decision 2026-09-18: rows keep the day they were given).
- A manual time-zone picker in Settings. The zone always comes from the device.
- Circle (group) goal and leaderboard periods. A circle spans many readers, so it has no single "own day"; its months stay UTC (Escalation E-3).
- The rolling 7-day and 30-day windows in admin stats, notification history and profile `last_month` (they are durations, not calendar days).
- Streak forgiveness for gaps caused by eastward travel (Escalation E-6).
- Any keep-alive pinger for Render's sleeping free tier (Escalation E-5).
- Changing what "active today" means. It stays "made any authenticated request", not "logged pages".
- Logging progress from `PATCH /userbooks/{id}` (it never wrote activity; out of scope).

## Requirements
Each item says what the reader gets and how it is accepted. Instants are UTC unless marked otherwise.

### Where a day's reading lands
- [ ] **R-01 Progress is recorded on the reader's local day.**
  - **Defect:** `PUT /userbooks/{id}/progress` stamps `reading_activity.date` with the UTC day (`userbooks_router.py:92`).
  - **Accept:**
    - A reader in `Asia/Kolkata` who logs pages at 2026-09-17 19:00 UTC (00:30 IST on 18 Sep) gets a row labelled `2026-09-18`.
    - The same instant labels `2026-09-17` for `America/New_York` and for `UTC`.
    - The row is marked as written under the local-day rule (`local_day = true`).
- [ ] **R-02 One entry per book per local day.**
  - **Accept:**
    - Two updates on the same local day merge into one row, even across UTC midnight: IST 00:30 and 23:30 on 18 Sep are 2026-09-17 19:00 UTC and 2026-09-18 18:00 UTC.
    - Updates at 23:59 and 00:01 local produce two rows.
    - A row with a later label (a "future" row, see R-05) is never merged into.
- [ ] **R-03 Every "today" read follows the reader's day.**
  - **Accept:**
    - `GET /reading-activity/daily` ends at the caller's local today.
    - `GET /reading-activity/insights` computes its streak anchor, `monthly_pages` (ending with the local month), the 30-day average, `projected_finish`, `finished_this_year` and `yearly_goal.on_track` (day of year) from the caller's local today.
    - `finished_this_year` counts a book finished at 2026-12-31 20:00 UTC in the local year 2027 for an IST reader.
- [ ] **R-04 Another reader's data is on that reader's day.**
  - **Accept:**
    - `GET /reading-activity/user/{id}/daily` ends at the *subject's* local today, not the viewer's.
    - `GET /users/{id}/stats` `this_year` is the subject's local year.
    - The privacy gates on both are unchanged.

### The switch (existing data)
- [ ] **R-05 History is untouched and nothing double-counts.**
  - **Accept:**
    - Deploying 4C updates no existing `reading_activity` row.
    - For every reader, the pages summed over `/daily`, `monthly_pages` and circle totals are identical immediately before and after deploy.
    - Rows written before 4C keep their UTC-day labels.
    - A row whose label is later than the reader's local today (possible for readers west of UTC who read just before deploy) is excluded from today's chart and streak until that day arrives.
- [ ] **R-06 The switch does not break a streak.**
  - **Defect it prevents:** a reader who reads only after midnight IST has pre-4C rows shifted one day earlier. Their first post-4C row therefore sits two days after their last pre-4C row.
  - **Accept:** when a reader's first local-day label is exactly two days after their last pre-4C label, the day between them counts toward `current_streak` and `longest_streak`. This happens at most once per reader. It never applies to a gap of 3 or more days, never between two post-4C rows, and never to the daily chart or page totals.

### How the server learns the zone
- [ ] **R-07 Clients report the device zone.**
  - **Accept:**
    - Web (on deploy) and Android 2.2.3 send `X-Timezone: <IANA name>` on every API request.
    - After a reader's first authenticated request, their stored zone equals the device zone.
    - When the device zone changes (travel), the stored zone changes on the next request.
- [ ] **R-08 Only real IANA zones are accepted.**
  - **Accept:**
    - `Asia/Kolkata`, `America/New_York`, `UTC` and `Asia/Calcutta` (legacy alias, still valid) are stored.
    - `Mars/Olympus`, `../../etc/passwd`, `asia/kolkata`, an empty string and a 65-character string are ignored: the request succeeds normally and the stored zone is unchanged.
    - No status code ever changes because of this header.
    - The header value never appears in a log line.
- [ ] **R-09 Readers who never report a zone keep working.**
  - **Accept:**
    - A reader with no stored zone is treated as `Asia/Kolkata`: day labels, "today", reminder time and caps.
    - Android 2.2.2 and older are served normally with no header.
    - A stored value that is somehow invalid falls back the same way, never with a 500.

### Being active, reminders and caps
- [ ] **R-10 "Active today" is judged on the reader's day.**
  - **Accept:**
    - `last_active` is refreshed on the reader's first authenticated request of each **local** day.
    - Login always refreshes it.
    - An IST reader active only at 00:30 IST counts as active for that IST day.
- [ ] **R-11 The evening reminder follows the reader's clock.**
  - **Accept:**
    - `reading_streak_reminder` reaches a reader who has a push channel, has not opted out, and is not active today (local), at their first scheduler run between **20:00 and 22:00 local**.
    - At most once per local day. Never outside that window.
    - For a never-reported reader, the first eligible run is 14:30 UTC, the same as today.
    - A reader in `Asia/Kathmandu` (+05:45) is reminded at the 14:15 UTC run.
    - If the server was asleep at 20:00, the reminder still goes out at the first run before 22:00.
- [ ] **R-12 "Once a day" caps use the recipient's day.**
  - **Accept:**
    - For every `daily_cap` event (`book_completed`, `book_added`, `reading_streak_reminder`), "already sent today" means the same actor, event and recipient on the **recipient's** local day.
    - Two `book_completed` from one friend at 23:00 and 00:30 IST are both delivered. Two at 10:00 and 18:00 IST deliver once.

### Privacy, safety, quality
- [ ] **R-13 A reader's zone is theirs alone.**
  - **Accept:**
    - `GET /profile/me` gains `timezone` (the stored name or `null`).
    - No other response carries it: `/profile/{id}`, `/users/search`, `/users/{id}/stats`, admin lists, notifications, feed.
    - It is deleted with the account.
- [ ] **R-14 The new columns can never deploy ahead of their migration.**
  - **Accept:**
    - The deploy order runs the 4C SQL and verifies both columns before the 4C code reaches `master`.
    - On PostgreSQL, the backend refuses to start if either column is missing, so a failed deploy leaves the previous version serving.
- [ ] **R-15 Dates show as the calendar day the server sent.**
  - **Defect:** web `InsightsPage.jsx:190` and Android `InsightsScreen.js:22-38` parse `"YYYY-MM-DD"` / `"YYYY-MM"` with `new Date(str)`, which is UTC midnight. West of UTC that shows the previous day or month.
  - **Accept:** with the device in `America/Los_Angeles`, `projected_finish: "2026-10-03"` shows "Oct 3", and month `"2026-10"` shows "Oct". Android's "N days left" counts from local midnight.
- [ ] **R-16 The test suite is clock-proof, and F-62 closes.**
  - **Accept:**
    - `pytest tests -q` gives the same result at any wall-clock time and in any machine time zone.
    - `TestReviewLogin::test_last_active_set_to_today`, `test_inactivity_reminder_skips_user_active_today` and `test_inactivity_reminder_daily_cap_prevents_second_send` pass inside 00:00–05:30 IST.
    - A static test fails if `app/` calls `date.today()`, `datetime.now()` with no zone, or `datetime.today()`.
    - The F-62 "gate correction" in the triage is retired.
- [ ] **R-17 Android 2.2.3.** `app.json` is `2.2.3` / versionCode `62`, built only after the 4C backend is live and after the 2.2.2 AAB was built from its own SHA.

## Screen States
No screen gains a new state. The visible changes are which day a number belongs to, and when the reminder arrives.

| State | Trigger | What User Sees |
|---|---|---|
| loading | unchanged (Insights / Profile preload, web 60 s cache) | unchanged |
| empty | new reader, no activity | unchanged: zero bars, streak 0 |
| error | Render cold start (~30 s) | unchanged. The header adds no failure path; a bad zone never errors |
| default | activity exists | the bar for "today" is the reader's local day; the streak counts local days |
| cutover | first days after deploy | no streak break for readers who read only after midnight (R-06). Old bars stay where they were |
| never-reported zone | Android ≤ 2.2.2, never used the web | behaves as India time (R-09) |
| traveller | device zone changed | next request moves "today" to the new zone. Already-recorded days do not move |

## Parity
- [x] Web: `src/services/api.js` (header), `src/utils/localDate.js` (new), `src/pages/InsightsPage.jsx` (date display)
- [x] Mobile: `src/services/api.js` (header), `src/services/localDate.js` (new), `src/screens/InsightsScreen.js` (date display), `app.json` 2.2.3
- Android ≤ 2.2.2 is served correctly, but as India time, until the reader updates or opens the web app once (R-09). This is a known parity gap, closed by 2.2.3.

## Privacy and notifications (PM Helper checklist)
- **Another user's data:** the zone is never exposed to anyone but its owner (R-13). Reads of another reader's chart and stats keep their `is_private_profile` + follow gates, unchanged.
- **Notifications:** no new event type. `reading_streak_reminder` changes *when* it fires. Recipients can still turn it off with the existing Settings switch (`reading_streak_reminder` pref key, both clients).

## Done checklist (verification, written before build)
1. **Happy path.** As review.reader on the web, with the laptop set to `Asia/Kolkata`, `GET /profile/me` shows `"timezone": "Asia/Kolkata"`. Log a page between 00:00 and 05:30 IST: `/reading-activity/daily`'s last bar (today) holds it, and the streak counts today.
2. **Edge (west of UTC).** Set the browser or OS zone to `America/Los_Angeles` and reload: `timezone` flips on the next request, and Insights' projected-finish dates and month labels show the same dates as the API JSON.
3. **Edge (bad input).** `curl -H "X-Timezone: ../../etc/passwd" <api>/profile/me` as review.reader returns 200 and `timezone` is unchanged.
4. **Other user cannot see X.** As review.friend, `GET /profile/{review.reader id}` and `/users/search?q=review` contain no `timezone` key.
5. **Reminder.** On the first evening after deploy, the Render log shows the 14:30 UTC run notifying never-reported readers, and no reminder at the 14:00 or 16:30 UTC runs for an IST reader.
