---
screen: sprint-4f-activity-engine
feature: community
repo: api + web + mobile (Android 2.2.4 / versionCode 63 — not yet built) + ci
status: approved
last_verified: 2026-09-23
approved_by: PM, 2026-09-23 (escalations answered in pm-decisions.md)
source: code read on branch sprint-4f-community-activity (base master @ b98228a, revised @ 3065172) — editorial_bot.py, migrations/add_editorial_bot.py, app/routers/{notes,admin,auth,follow,likes_comments,profile,users}_router.py, app/{deps,crud,models,schema_guard,localday,database,main}.py, app/notifications/{config,dispatcher,scheduler}.py, .github/workflows/keep-oregon-awake.yml, web HomePage.jsx / GroupDetailPage.jsx / UserProfilePage.jsx, mobile FeedScreen.js / GroupDetailScreen.js / UserProfileScreen.js
---

## What It Does

The community page gets a small, dependable heartbeat: four **openly labelled non-human accounts** that post on a schedule, each with its own editorial voice. Every one of their posts carries a bot badge that a reader cannot miss, on every screen where the post or the account appears. They post through the public API with their own credentials, on GitHub Actions rather than a paid Render cron, under a hard daily cap and a kill switch that works without a deploy. They never like, follow or comment on anything a reader wrote, and they are excluded from — or separately counted in — every platform metric.

This replaces `editorial_bot.py`, which today opens a database connection and runs `INSERT INTO note` directly (`editorial_bot.py:287-290`), on a suspended paid Render cron job, with no cap and no off switch.

## User story

As a reader opening the community page on a quiet Tuesday, I want something to read and something to answer, and I want to know instantly that it came from the app and not from a person, so that I learn what this page is for without being misled about who is talking.

- **Evidence:** our decision, not user feedback. The page is thin on quiet days; `@TMRBot` was built for exactly this and is currently switched off (its Render cron is suspended).
- **Success metric:**
  - Seven posts land per week, at the scheduled local times, for four consecutive weeks, with no day carrying more than two.
  - Every bot post rendered by a current web build and by Android ≥ 2.2.4 shows the badge. Sampled by hand on the three surfaces in R-06.
  - Zero likes, comments or follows exist in the database with a bot as the actor, measured at the end of the four weeks.
  - `/admin/stats` reports reader counts that do not move when a bot posts.

## Appetite

Max complexity: medium (4–6 days across five packages: API, CI/bot, web, Android, docs). Two PM database steps sit in front of it. Unchanged by E-5: moving dedup into the API adds about half a day to the API package and removes about the same from the bot package.

### Not building

- **Accounts that read as ordinary readers.** The PM asked for these on 2026-09-22. They are refused and are not designed anywhere in this sprint. The app carries Amazon affiliate tags, so an invented reader praising a book is a fabricated consumer review attached to a commercial benefit. That is the conduct the US FTC's 2024 rule on fake reviews and testimonials prohibits (it reaches reviews written by anyone the business controls, and reviews by non-existent people), and India's Department of Consumer Affairs guidance on online reviews points the same way. The exposure is not only regulatory: a reader who later works out that the enthusiastic reader was us loses trust in every real review on the page. **Distinct editorial voices are in scope and wanted; disguised humans are not.** If the PM still wants this, it is a new sprint with a legal answer attached, not a variation of this one.
- Bots replying to readers, running polls with a result, or holding conversations. A bot post is a one-way broadcast that readers may reply to among themselves.
- Bots joining circles, or posting into a circle. All bot posts are community-feed posts (`note.is_public = true`, no `group_id`).
- Any bot reading a reader's private data. The circle-roundup content type (R-11) uses public, aggregate counts only, at the privacy floor confirmed in E-3.
- Any direct database access for the bot. E-5/E-7 settled this: the bot gets none, and `DATABASE_URL` is never a GitHub Actions secret. Dedup is an API concern (R-07, R-15).
- Image generation. Bestseller posts keep the existing cover-lookup chain; quote cards are text.
- Moderation tooling for bot output. The kill switch plus `DELETE /notes/{id}` (admin, already exists) is the whole control surface.
- Retiring `editorial_post`. Its rows are history; R-14 leaves them alone.
- Backfilling a missed run (R-09).
- A bot on the Literary Circles activity feed or in notifications. Both render server-composed strings with no element to badge (`GroupDetailPage.jsx:71-83`, mobile `GroupDetailScreen.js:60-72`, `NotificationsPage.jsx:188-237`), so a bot must never appear there — see R-05.

## Requirements

Instants are UTC unless marked otherwise. "Bot account" means a `user` row with `is_bot = true`.

### The label — a reader can never mistake a bot for a person

- [ ] **R-01 A bot account is marked in the database, not by its name.**
  - **Defect:** today the only thing distinguishing `@TMRBot` from a reader is its email string, read by `editorial_bot.py:34`. Nothing in the API or either client knows it exists.
  - **Accept:**
    - `user.is_bot` exists, is boolean, defaults false, and is true for exactly the four bot accounts.
    - Every other `user` row is false, including `@TMRBot`'s followers and the review accounts.
    - A bot account has `is_admin = false`. A single statement asserting this is part of the deploy check.
- [ ] **R-02 The API tells every client which posts are a bot's.**
  - **Accept:**
    - The `user` object embedded in a note carries `is_bot` at all seven note-serialising sites: `notes_router.py:197` (create), `:252` (update), `:318` (`/notes/feed`), `:380` (`/notes/friends-feed`), `:453` (`/notes/user/{id}`), `:504` (`/notes/userbook/{id}`), `:606` (friends-feed second shape).
    - `GET /profile/{user_id}` returns `is_bot` (`profile_router.py:228`).
    - `GET /users/search` results carry `is_bot` (`users_router.py:15` `UserSearchResult`, route at `:37`).
    - Comment author objects carry `is_bot` (`likes_comments.py:157`, `:192`).
    - The value is always present and boolean — never absent, never null — so a client can branch on it without a fallback.
    - No existing key changes name, type or value. The response-shape regression tests stay green unedited.
- [ ] **R-03 Every web surface that shows a bot's name shows the badge next to it.**
  - **Accept:** a badge reading **BOT** renders at each of:
    - `HomePage.jsx:175` — community and friends feed post header (one component serves both tabs).
    - `HomePage.jsx:291` — comment author row (covers the case where a bot post's comments are listed; the bot itself never comments, R-05).
    - `UserProfilePage.jsx:386` — profile display name.
    - `HomePage.jsx:641` — sidebar user-search result.
    - `HomePage.jsx:655` — sidebar following list.
    - `GroupDetailPage.jsx:111` and `:965` — group post header and member row. A bot can never appear here (R-05), but the badge is added so that a future mistake is visible rather than silent.
    - The badge follows the existing pill convention (`GroupDetailPage.jsx:967`, the Curator badge) — it is not a new design system.
    - A reader account renders no badge and no extra whitespace.
- [ ] **R-04 Every Android surface that shows a bot's name shows the badge next to it.**
  - **Accept:** a badge renders at each of `FeedScreen.js:660` (feed post name), `FeedScreen.js:697` (the "is feeling…" sentence — the second place the same card prints the name), `FeedScreen.js:751` (comment row), `FeedScreen.js:593` (user search result row), `GroupDetailScreen.js:724` (group post), `UserProfileScreen.js:303` (profile header).
  - The badge reuses `FeedScreen.js` `userBadge` / `userBadgeText` (styles at `:1055-1057`), the existing Mutual / Follows-you pill.
  - **This requirement ships in a store build and reaches nobody until they update.** The app has no OTA channel (`eas.json` sets `appVersionSource: "local"`; there is no `expo-updates`), and the last Play release is 2.2.1 / versionCode 60 while 2.2.3 / 62 is built but unshipped. R-05a is what covers readers in the meantime. **The PM has accepted this (E-1): the API and web ship now and the bots start behind the in-text label; the badge arrives as an upgrade.** The bots do not wait for 2.2.4 adoption.
- [ ] **R-05a A bot post is self-describing in its own text.**
  - **Why:** R-03 and R-04 depend on the client. An Android 2.2.1 reader, a stale 60-second API cache (`api.js:10-44`), a screen-reader user and any future surface that prints a name into a sentence all see the text and not the badge. The label must survive all of them.
  - **Accept:**
    - Every bot post ends with a final line in exactly this form (E-2, decided): an em dash, a space, then `automated post from @<handle>`. For the prompt account that is verbatim `— automated post from @TMRPrompts`; the only thing that varies between accounts is the handle.
    - The form is a fixed string in `bots/common.py`, asserted character-for-character by test C-01. Lower-case "automated", em dash not hyphen, no trailing punctuation.
    - The line is produced by the bot, stored in `note.text`, and therefore present for every client, every cache state and every export.
    - It is never generated by the language model, so it cannot drift.
    - The badge in R-03/R-04 is still required. This line is the floor, not the ceiling.
- [ ] **R-05 A bot never touches a reader's content or a reader's inbox.**
  - **Accept:**
    - `POST /follow/{id}`, `POST /notes/{id}/like`, `DELETE /notes/{id}/like` and `POST /notes/{id}/comments` return **403** when the caller is a bot account, before any row is written and before any notification is queued.
    - The 403 is decided from `user.is_bot` read from the database, never from a token claim.
    - `fire_event` never delivers to a bot account, and never names a bot as `actor`.
    - The evening streak reminder (`notifications/scheduler.py:48`) never selects a bot account.
    - A bot posting fires no group activity (it is in no circle, and `fire_group_activity_for_user` is a no-op for it — R-13 keeps it that way by assertion, not by luck).
    - A reader following a bot account is allowed and unchanged. The prohibition is one-directional.
- [ ] **R-06 Existing `@TMRBot` posts get the badge with no data migration of notes.**
  - **Accept:**
    - Setting `is_bot = true` on the one `@TMRBot` row causes every post it has ever made to render the badge, because the badge is derived from the post's author and not from the post.
    - No `note` row is read, written or moved.
    - The account keeps its id, its posts, its followers and its history.

### Posting through the API

- [ ] **R-07 The bot reaches the database only through the public API. It holds no database credential at all.**
  - **Defect:** `editorial_bot.py:287-290` writes `INSERT INTO note` with its own engine. What that skips today is narrower than it looks and should be stated honestly: post creation fires no reader notification for anybody, so no notification is being lost. What it does skip is `POST /notes/`'s content validation, its `is_public` contract (F-17), its group-activity hook, and the response contract — and, structurally, it means every future change to `POST /notes/` silently diverges from the bot.
  - **Decided (E-5, E-7):** the repository is verified public. The bot therefore gets **zero** direct database access, for posting *and* for dedup. `DATABASE_URL` must never be created as a GitHub Actions secret — not temporarily, not as a fallback.
  - **Accept:**
    - The bot creates posts with `POST /notes/` and an `Authorization: Bearer` header, against `https://api.trackmyread.com`.
    - It passes `is_public: true` explicitly. Omitting it would make the post private (`notes_router.py:150`, the F-17 default).
    - `POST /notes/` accepts an optional `dedup_key: str | None` on the request body. It is **honoured only when `current_user.is_bot` is true**, and on a reader's request it is **silently ignored**.
      - *Why ignored and not 422:* `NoteCreateSchema` is shared by `POST /notes/` and `PUT /notes/{id}` (`notes_router.py:54` says so in its own F-17 comment), so a 422 would have to be duplicated on a route that has no dedup concept at all; and rejecting an unknown-to-the-caller key would make an old client that round-trips a note body start failing. Ignoring costs one `and` in the handler and cannot break a reader.
    - When the caller is a bot **and** `dedup_key` is present, the server writes the `bot_post` row **in the same transaction as the note**: either both rows exist or neither does. There is no window between them.
    - A `dedup_key` that collides with an existing `(content_type, dedup_key)` returns **409** and **creates no note**. The collision is caught as an `IntegrityError` on the unique index and rolled back, the same shape `follow_router.py:39-44` already uses.
    - The bot opens no database connection for anything. It holds `BOT_LOGIN_SECRET`, `NYT_API_KEY` and `GEMINI_API_KEY`, and nothing else.
    - A non-2xx response makes the run fail loudly. Because the dedup row is the server's to write, a failed post leaves nothing behind to clean up.
- [ ] **R-08 A bot gets a short-lived token from a secret it holds, and nothing longer-lived is ever stored.**
  - **Accept:**
    - `POST /auth/bot-login` takes `{email, secret}` and returns an access token valid for **15 minutes**.
    - It returns **404** unless both `BOT_LOGIN_SECRET` and `BOT_LOGIN_EMAILS` are set on the API service — so the route does not exist in local dev, in tests or in a fork. (`/auth/review-login` already works exactly this way, `auth_router.py:122-133`.)
    - It returns **401**, with one message, unless *all* of: the email is in the allowlist, the email ends `@trackmyread.com`, the row exists, the row has `is_bot = true`, and the secret matches under a constant-time compare.
    - It **never creates a user**. `/auth/review-login` creates one when missing (`auth_router.py:152-157`); a bot-login that could conjure an account is a different and worse thing.
    - It does not write `last_active` (R-12).
    - The GitHub secret store holds the shared secret only. No long-lived JWT is ever written down.
    - The token is a normal user token for a user that owns no reader data. **It carries no scope claim** (E-4, decided) — `is_bot` on the row is the single authority. See the security review §1.

### What they post, and when

- [ ] **R-09 Four accounts, four voices, seven posts a week, at times that suit India.**
  - **Accept:** the schedule is exactly:

    | Local (IST) | UTC cron | Account | Content type |
    |---|---|---|---|
    | Mon 18:30 | `30 13 * * 1` | `@TMRBot` — *TrackMyRead Bestsellers* | Bestseller teaser |
    | Tue 18:30 | `30 13 * * 2` | `@TMRPrompts` — *The Reading Prompt* | Prompt of the day |
    | Wed 18:30 | `30 13 * * 3` | `@TMRBot` | Bestseller teaser |
    | Thu 18:30 | `30 13 * * 4` | `@TMRCircles` — *Circle Roundup* | What circles are reading — **falls back to a second `@TMRPrompts` prompt when the R-11 floor is not met** (E-3) |
    | Fri 18:30 | `30 13 * * 5` | `@TMRBot` | Bestseller teaser |
    | Sat 10:30 | `30 05 * * 6` | `@TMRPrompts` | Prompt of the day |
    | Sun 10:30 | `30 05 * * 0` | `@TMRQuotes` — *Margin Notes* | Quote card |

    - Each run sleeps a uniformly random **0–25 minutes** before posting, so posts do not all land on the half hour.
    - 18:30 IST is chosen to sit clear of the 20:00 IST streak reminder.
    - A missed run is **not** made up. There is no catch-up, no backfill and no double post. GitHub delays scheduled runs under load — `keep-oregon-awake.yml` already documents this — and a bestseller that was not posted is simply still unposted tomorrow, because the dedup table never marked it.
    - Every workflow is also `workflow_dispatch`, so the PM can post one by hand.
    - **Seven a week is shipped and then measured** (E-8, decided). After four weeks, if bot posts outnumber reader posts in the feed, the bestsellers drop to one a week. R-13's 2-per-bot-per-day cap is a safety limit and is never read as headroom.
- [ ] **R-10 The prompt is the post that teaches the page.**
  - **Accept:**
    - A prompt post asks one open question and names the action: posting a reply is a normal post.
    - Example: *"What's a book that changed your mind about something? Share it as a post — tag the book so it shows up on its page. — automated post from @TMRPrompts"*
    - The question comes from a **checked-in list in the repository**, not from the language model, and rotates without repeating inside 60 days.
- [ ] **R-11 The circle roundup is the other post that teaches the page, and it names nobody.**
  - **Accept:**
    - It reports aggregate, public information only: how many circles are active, and the titles most read across them, as counts.
    - It never names a reader, never names a private circle, and never reveals a number small enough to identify one person. **The floor is at least 3 readers across at least 2 public circles** (E-3, decided). Lowering it is not an option that exists; if the roundup never fires, the content type is dropped instead.
    - Example: *"This week in Literary Circles: 6 circles are active, and the book turning up most often is **Tomorrow, and Tomorrow, and Tomorrow** — 9 readers across 4 circles. Browse circles from the Circles tab. — automated post from @TMRCircles"*
    - If the floor is not met, the roundup is **not** softened, reworded or posted. The Thursday slot posts a second prompt from `@TMRPrompts` instead (E-3), subject to the same 60-day no-repeat window as R-10.
- [ ] **R-12 Bestseller and quote posts are inventory, and are labelled as such internally.**
  - **Accept:**
    - Bestseller teaser: unchanged in substance from today's output — title, author, list rank, weeks on list, a teaser of at most 30 words. It keeps the existing cover-lookup chain (Open Library → Google Books → NYT). Example is today's live output plus the R-05a line. The posting account's display name is *TrackMyRead Bestsellers* (E-9).
    - Quote card: a quote with its author and source, in `note.quote`, **from a public-domain work only** (E-6, decided). The quote pool is a checked-in list of public-domain lines in `bots/content/quotes.json` — never model output, never an arbitrary book. Contemporary quotes are a separate question for a separate sprint; "Margin Notes" leans into being old-fashioned.
    - Neither teaches a reader what the page is for. They are there so the page is not empty. This document says so rather than pretending otherwise, because it is what decides the cadence if the PM wants fewer posts: cut these two first.

### Limits and controls

- [ ] **R-13 A hard cap, enforced by the server.**
  - **Accept:**
    - `POST /notes/` returns **429** when the caller is a bot account that already has **2** notes created in the previous 24 hours.
    - The check runs only when `current_user.is_bot` is true, so a reader's post pays nothing for it.
    - The cap is a server rule. The bot's own restraint is not a control.
    - A 429 fails the workflow run visibly; it never retries into the cap.
- [ ] **R-14 A kill switch that works without a deploy.**
  - **Accept:**
    - Setting the GitHub **repository variable** `BOT_ENABLED` to `false` stops every bot workflow at its first step. It takes effect on the next scheduled run with no deploy, no restart and no code change, and the PM can set it from the GitHub UI.
    - The emergency stop, which also revokes the ability to log in at all, is clearing `BOT_LOGIN_SECRET` on the API service. That restarts the service, so it is the second lever, not the first.
    - Both are written into the deployment documentation with the exact click path.
- [ ] **R-15 Dedup is the server's job, and it is atomic.**
  - **Accept:**
    - A bestseller is never posted twice, across all lists, as today.
    - A prompt is never repeated inside 60 days; a quote is never repeated inside 180 days.
    - `GET /bots/posted?content_type=…&since=…` returns the `dedup_key`s already used for that content type since that instant, so a run filters its candidate pool **before** it composes anything and before it spends a Gemini call. It requires a bot token and returns 403 for a reader (nothing in it is reader data, but it exists only for bots and should not be a public surface).
    - The `bot_post` row is written by the server inside the note's transaction (R-07), so the two either both land or neither does.
    - **There is no "the post succeeded and the dedup write then failed" failure mode.** The old design had one, because the bot wrote the dedup row itself after reading a 2xx. That window no longer exists: a single transaction has no gap for a run to die in, and a crashed run between the `GET` and the `POST` has written nothing at all.
    - A key already taken between the filter and the post — a re-dispatched run, a retried workflow, two runs racing — is a **409**, and the note is not created. The run fails visibly with nothing posted, rather than double-posting.

### Metrics

- [ ] **R-16 Bot activity never inflates a reader number.**
  - **Defect this creates:** posting through the API means `deps.get_current_user` stamps `last_active` on the bot's first request of each local day (`deps.py:87`). Today's SQL bot does not do that. Moving to the API therefore *introduces* a bot into any future "active today" count, and into the admin user list's `last_active` column. This requirement is what keeps that honest.
  - **Accept:**
    - `/admin/stats` `total_users` counts readers only (`admin_router.py:91`); the same for `new_users_this_week` / `_this_month` (`:95`, `:100`).
    - `/admin/stats` `total_notes` counts readers' notes only (`:127`).
    - Two new fields, `bot_users` and `bot_notes`, report the excluded figures, so nothing disappears.
    - `GET /admin/users` (`:172`) returns `is_bot` per row, and the admin users table shows it.
    - `GET /admin/content/notes` (`:460`) returns `is_bot` on the author, so a bot post can be told apart when moderating.
    - The Admin overview tab labels the reader figures as readers.
    - `/notes/feed` still includes bot posts. That is the point of the sprint; only the counting changes.

## Done checklist

1. The PM has run the two SQL steps (the `is_bot` column; the `bot_post` table), and the verification query returns the four bot rows with `is_bot = true` and `is_admin = false`.
2. `pytest tests -q` passes with no edits to the existing response-shape tests.
3. The web build shows the badge on a bot post in the community feed, on the bot's profile, and in a user search — checked by hand on production.
4. Android 2.2.4 shows the badge on the feed card and the profile header — checked on a device. Until that build is on Play, R-05a's text line is the only label an installed app shows; the PM accepted that in E-1 and the bots do not wait for it.
5. Seven posts land in one full week at the scheduled times, none on the hour, none more than two on a day.
6. `SELECT count(*) FROM "like" l JOIN "user" u ON u.id = l.user_id WHERE u.is_bot` and the equivalents for `comment` and `follow` all return 0.
7. Setting `BOT_ENABLED=false` stops the next run; the workflow log says why.
8. `/admin/stats` numbers are unchanged by a bot post, and `bot_notes` moves instead.
9. The Render cron job "TMR bot Cron Job" is deleted, not merely suspended, and the paid service is confirmed gone from the bill.
10. The repository's Actions secrets contain **no** `DATABASE_URL` — checked in Settings → Secrets and variables → Actions, by name, after the bots are live (E-5/E-7).
11. Re-dispatching a bestseller run for a key already posted returns 409 and creates no note — checked once by hand with `workflow_dispatch`.
