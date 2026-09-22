---
screen: sprint-4f-activity-engine
feature: community
status: architecture-complete, all nine escalations decided
last_verified: 2026-09-23
architect_verified: 2026-09-22 — every file:line in this document was read on branch sprint-4f-community-activity (base master @ b98228a). Line numbers are from that commit; Sprint 4E rewrites several of the same functions (see "Merge order").
revised: 2026-09-23 @ 3065172 — E-5/E-7 replaced the direct-connection dedup with an API-side atomic dedup. The files read for that revision, on this branch: `app/routers/notes_router.py:46-61` (`NoteCreateSchema`), `:133-199` (`create_note`), `app/crud.py:112-131` (`crud.create_note`), `app/database.py:60-68` (`get_db`), `app/routers/follow_router.py:37-44` (the IntegrityError → error-response precedent), `app/models.py:30-43` (`User`), `app/main.py:133-148` (router registration). Every other line number in this document is unchanged from the 2026-09-22 verification.
depends_on: Sprint 4C (shipped code, unshipped release — `app/localday.py`, `app/schema_guard.py`), Sprint 4E (in build — heavy file overlap in `notes_router.py`)
---

## Risk summary (for the PM)

| Risk | Where it bites | What this design does |
|---|---|---|
| **A reader mistakes a bot for a person.** The regulated failure mode, and the reason the "ordinary readers" idea is refused. | Feed, profile, search, comments | Two independent labels: a database flag surfaced in every API author object and badged by both clients (R-01..R-04), plus a fixed line inside the post text that every client, every cache state and every screen reader gets for free (R-05a). |
| **Android cannot be updated remotely.** No OTA channel; last Play release is 2.2.1. The badge reaches installed apps only when readers update. | Android feed and profile | R-05a is the floor, and the PM accepted it as the label Android readers get for some weeks (E-1). The bots start now; the badge arrives as an upgrade. |
| **The bot token is a normal reader token.** If it leaks it can act as that account. | Anything `POST`-able | The account owns no reader data; every engagement endpoint 403s on `is_bot` (R-05); the token lives 15 minutes; only a shared secret is stored, and clearing it on Render revokes everything. |
| **A production database credential in a world-readable CI.** The repository is verified **PUBLIC**. | GitHub Actions | The bot holds no database credential. `DATABASE_URL` is never an Actions secret (E-5/E-7). Dedup moved into the API, inside the note's own transaction. |
| **Moving to the API introduces the bot into reader metrics.** `deps.py:87` stamps `last_active` on every authenticated request. Today's SQL bot never authenticates. | `/admin/stats`, admin user list | R-16 excludes bots from the counts and reports them separately. This is a cost of doing the right thing, not an accident. |
| **The circle roundup aggregates other readers' reading.** | `@TMRCircles` posts | Public circles only, aggregate counts only, and the k-anonymity floor the PM confirmed in E-3 (≥3 readers across ≥2 public circles). Below the floor the slot posts a second prompt. |
| **Quotes from in-copyright books.** | `@TMRQuotes` posts | Public-domain pool only, checked into the repository, decided (E-6). |
| **File overlap with Sprint 4E.** 4E's package P3 rewrites the same functions this sprint edits. | `notes_router.py`, `likes_comments.py`, `crud.py`, `admin_router.py`, `deps.py` | 4F merges after 4E. See "Merge order". |

---

## The labelling design

This is the part the sprint exists for, so it is specified before anything else.

### Three layers, and why three

1. **The database flag — `user.is_bot`.** One boolean on the account. Everything else derives from it, which is what makes R-06 free: the badge hangs off the post's *author*, so `@TMRBot`'s entire back catalogue is labelled by a single `UPDATE`, without touching one `note` row.
2. **The API field — `user.is_bot` in every author object.** Always present, always boolean. A client can branch without a fallback, and an old client that does not know the key simply ignores it (verified: neither `api.js` shapes or allowlists response keys — web `src/services/api.js`, mobile `src/services/api.js:113-132`).
3. **The text line — inside `note.text`.** Because layers 1 and 2 are only as good as the client rendering them, and the Android client cannot be updated remotely.

A name convention (`@TMRBot`, "TrackMyRead Bot") is deliberately **not** one of the layers. It is not a control: names are chosen by us and read as branding, and the PM requirement is explicit that a badge is required, not a naming habit.

### Why the flag is not `is_admin`-shaped

`is_admin` is an authorisation input. `is_bot` is the opposite: it *removes* capability (R-05) and *adds* disclosure. They are never checked together, and a bot must never be an admin — asserted in the deploy check, because a bot with `is_admin` could delete any reader's post (`notes_router.py:638`).

### Where the badge is drawn

Neither client has a shared author component — both have two independent local `Avatar` helpers and inline name rendering at every site. So the badge is added per site. The full list is in spec R-03 and R-04; the shape:

- **Web:** a `<BotBadge />` in `src/components/BotBadge.jsx` (new file, owned by package P3) rendered next to the name. Styling copies the Curator pill verbatim (`GroupDetailPage.jsx:967`): `text-xs font-bold uppercase tracking-wider text-secondary bg-secondary/10 px-1.5 py-0.5 rounded-full shrink-0`. It renders `null` when `is_bot` is falsy, so call sites need no conditional and a reader's card gains no whitespace.
- **Android:** a `BotBadge` in `src/components/BotBadge.js` (new file, owned by P4) reusing `FeedScreen.js` `userBadge` / `userBadgeText` (`:1055-1057`, the existing Mutual pill). `FeedScreen.js:654-662` wraps the name in a bare `<View style={{flex:1}}>`, so the feed card needs the `userNameRow` pattern from `:593` before the badge fits beside the name.
- `GroupDetailScreen.js:42-49` defines a local initials-only `Avatar`. It is the single best insertion point for that screen, but it takes a `name` string, not a user object — it gains an `isBot` prop rather than being rewritten.

### Where a badge is impossible, and what happens instead

Three surfaces render an actor's name into a server-composed **string**, with no element to attach a pill to:

| Surface | File:line | Consequence |
|---|---|---|
| Circle activity feed (web) | `GroupDetailPage.jsx:71-83` | A bot must never appear. It is in no circle. |
| Circle activity feed (Android) | `GroupDetailScreen.js:60-72` | Same. |
| Notifications, both clients | `NotificationsPage.jsx:188-237`, `NotificationsScreen.js:43-60` | A bot is never an actor and never a recipient (R-05), so no notification can name one. |

These are the reason R-05's prohibitions are enforced **server-side** rather than left to the bot's own good behaviour: the failure mode of a bot leaking into one of these surfaces is an unlabelled bot name in a sentence, which is precisely the harm the sprint is meant to prevent.

---

## Call sites

Line numbers are master @ b98228a.

### P1 — the flag, the token, the guards (API, security-bearing)

| File:line | Today | After |
|---|---|---|
| `app/models.py:36` (`User`) | `is_admin`, `is_private_profile`, … | `+ is_bot: bool = Field(default=False, index=True)`. Indexed because R-16's counts filter on it on every `/admin/stats` call |
| `app/models.py` (new class) | — | `BotPost` — the SQLModel for the `bot_post` table below. It has to exist as a model, not just a table, because the API now writes it (E-5) inside `create_note`'s session |
| `app/schema_guard.py:11` `REQUIRED_COLUMNS` | 2 entries (4C) | `+ ("user", "is_bot")` and `+ ("bot_post", "dedup_key")` — **added in the deploy that follows the migration, never in the same push.** The guard exits the process at startup when a column is missing (`schema_guard.py:31-34`), which is the intended behaviour and is why the ordering in "Deploy order" is not negotiable. A *missing table* produces no `information_schema` row either, so the same entry covers it. On SQLite the guard returns immediately (`:17-18`) and `create_all` builds `bot_post` for the test suite |
| `app/routers/auth_router.py:122` `review_login` | the pattern to copy | unchanged |
| `app/routers/auth_router.py` (new, after `:169`) | — | `POST /auth/bot-login`. Env-gated 404, allowlist + domain + `is_bot` + constant-time secret, all evaluated before one 401. **Never creates a user.** Returns `create_access_token({"sub": user.email}, expires_delta=timedelta(minutes=15))` |
| `app/deps.py` (new, after `get_admin_user` at `:129`) | — | `deny_bot_actor(current_user = Depends(get_current_user))` → 403 `"Automated accounts cannot interact with readers' posts"` when `current_user.is_bot`. Reads the row, not a claim |
| `app/routers/follow_router.py:13` | `user = Depends(get_current_user)` | `+ _: None = Depends(deny_bot_actor)` |
| `app/routers/likes_comments.py:31` (like), `:83` (unlike), `:114` (comment) | same | same dependency |
| `app/notifications/dispatcher.py` `_user_wants_event` | no bot concept | skip a recipient whose row has `is_bot` |
| `app/notifications/scheduler.py:48` | selects candidates for the streak reminder | `+ .where(User.is_bot == False)`. A bot holds no push token today so nothing is delivered, but the query should not depend on that |

### P2 — serialisation and metrics (API)

| File:line | Today | After |
|---|---|---|
| `notes_router.py:197`, `:252` | `{"id", "name"}` | `+ "is_bot"` |
| `notes_router.py:318`, `:380`, `:606` | `{"id","name","username","profile_picture"}` (+`is_mutual` on `:606`) | `+ "is_bot": bool(user.is_bot)` |
| `notes_router.py:453`, `:504` | `{"id","name"}` | `+ "is_bot"` |
| `notes_router.py:80` `NoteOutSchema.user` | `Optional[dict]` | unchanged — an untyped dict, so no schema edit is needed |
| `likes_comments.py:157`, `:192` | comment author dict | `+ "is_bot"` |
| `profile_router.py:228` (`base`) | public profile | `+ "is_bot"` |
| `users_router.py:15` `UserSearchResult` | typed model | `+ is_bot: bool = False` |
| `groups_router.py:844`, `:883`, `:1129` | group post / member author | `+ "is_bot"`. A bot cannot post here; the field exists so an accident renders visibly |
| `notes_router.py:46` `NoteCreateSchema` | 8 optional fields | `+ dedup_key: Optional[str] = None`. The schema is shared with `PUT /notes/{id}` (`:54`'s own comment says so), which simply never reads the field |
| `notes_router.py:134` `create_note` | no cap | after `get_current_user`, `if current_user.is_bot:` count that user's notes in the last 24 h and raise **429** above 2. One query, bots only |
| `notes_router.py:161` (the `crud.create_note` call) | one `db.commit()` inside `crud.create_note` (`crud.py:129`) | the bot-dedup path calls it with `commit=False` and commits once itself, with the `BotPost` row in the same transaction. See "Atomic dedup" below |
| `app/crud.py:112` `create_note` | `db.add` → `db.commit` → `db.refresh` (`:128-130`) | `+ commit: bool = True`. When false: `db.add(note)`, `db.flush()` (which assigns the `SERIAL` id), return — no commit, no refresh. `notes_router.py:161` is its **only** caller in `app/`, so the default keeps every existing path byte-identical |
| `app/routers/bots_router.py` (new) | — | `GET /bots/posted?content_type=…&since=…` → `{"dedup_keys": [...]}`. `Depends(get_current_user)`, then 403 unless `current_user.is_bot`. Read-only, no reader data, one indexed query on `ix_bot_post_posted` |
| `app/main.py:148` | 16 `include_router` calls | `+ app.include_router(bots_router.router)` |
| `admin_router.py:91`, `:95`, `:100` | `count(User.id)` | `+ .where(User.is_bot == False)` |
| `admin_router.py:127` | `count(Note.id)` | `+ join User, .where(User.is_bot == False)` |
| `admin_router.py:23` `PlatformStats` | 14 fields | `+ bot_users: int = 0`, `+ bot_notes: int = 0` |
| `admin_router.py:39` `UserSummary` / `:218` | admin user row | `+ is_bot` |
| `admin_router.py:460` `list_recent_notes` | recent notes for moderation | author gains `is_bot` |
| `admin_router.py:354` `trigger_editorial_bot` | `subprocess.run([sys.executable, "editorial_bot.py"])` on the **API host** | **deleted.** It shells out on the web service, depends on the repo layout, and would now need the bot secret on the API host to work at all. Its replacement is the workflow's `workflow_dispatch` button |

### P3 — web

| File:line | Change |
|---|---|
| `src/components/BotBadge.jsx` (new) | the badge; renders `null` unless `user?.is_bot` |
| `HomePage.jsx:175`, `:291`, `:641`, `:655`, `:704` | badge beside the name |
| `UserProfilePage.jsx:386` | badge beside the `<h1>` |
| `GroupDetailPage.jsx:111`, `:965` | badge beside the name (defence in depth) |
| `AdminPage.jsx:281-312` | `is_bot` column in the users table; overview figures relabelled as readers, with `bot_users` / `bot_notes` shown beside them |
| `AdminPage.jsx:454` + `src/services/api.js:356` `triggerBot()` | remove the "trigger editorial bot" control — its endpoint is deleted |

### P4 — Android

| File:line | Change |
|---|---|
| `src/components/BotBadge.js` (new) | the badge |
| `FeedScreen.js:654-662` | wrap the name in a `userNameRow` (pattern at `:593`), then the badge |
| `FeedScreen.js:697`, `:751`, `:593` | badge beside the name |
| `GroupDetailScreen.js:42-49` `Avatar`, `:724` | `isBot` prop; badge beside the post author |
| `UserProfileScreen.js:303` | badge beside the display name |
| `app.json` | `version` → 2.2.4, `android.versionCode` → 63 (`scripts/check-version-bump.js --strict` fails the AAB build otherwise) |

### P5 — the bot and its CI

| File | Change |
|---|---|
| `bots/` (new package) | `bots/common.py` (login, `GET /bots/posted`, post, cap/409 handling, the R-05a line), `bots/bestsellers.py` (the NYT + Gemini logic lifted from `editorial_bot.py`, **minus** its `create_engine` / `INSERT` — `editorial_bot.py:287-290`), `bots/prompts.py`, `bots/quotes.py`, `bots/circles.py` (falls through to `bots/prompts.py` below the k-floor, E-3), `bots/content/prompts.json`, `bots/content/quotes.json`. **No `sqlalchemy` import anywhere in `bots/`, and a test asserts that** |
| `editorial_bot.py` | **deleted** once `bots/bestsellers.py` has posted successfully twice in production. Not before — it is the only working implementation of the cover-lookup chain and the Gemini fallback |
| `.github/workflows/tmr-bots.yml` (new) | one workflow, seven cron entries, a `content_type` chosen from the day, plus `workflow_dispatch` with a `type` input |
| `context/deployment/README.md` | the new env vars, both kill switches with the click path, and the note that the Render cron job is deleted |
| `context/PM_SQL_QUEUE.md` | the two SQL steps |

---

## Data

### `user.is_bot` — new column, **a separate PM step**

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ix_user_is_bot ON "user" (is_bot);
```

Metadata-only in PostgreSQL for the `ALTER` (a non-volatile default does not rewrite the table on any supported version). The index is a separate line because creating indexes is, by house rule, never bundled — the PM decides it.

Then, in the same session, the four accounts. `@TMRBot` already exists; the other three are created by a migration script that hashes an unusable random password, exactly as `migrations/add_editorial_bot.py:60` does today:

```sql
UPDATE "user" SET is_bot = true
 WHERE email IN ('tmrbot@trackmyread.com','tmrprompts@trackmyread.com',
                 'tmrquotes@trackmyread.com','tmrcircles@trackmyread.com');

-- E-9: rename @TMRBot and give every bot a bio that opens "Automated account."
-- Same session, same step. The other three bios are set by add_bot_accounts.py at creation.
UPDATE "user"
   SET name = 'TrackMyRead Bestsellers',
       bio  = 'Automated account. Weekly picks from the New York Times bestseller lists.'
 WHERE email = 'tmrbot@trackmyread.com';

-- verify: must return 0
SELECT count(*) FROM "user" WHERE is_bot AND COALESCE(bio,'') NOT LIKE 'Automated account.%';

-- verify: must return exactly 4 rows, every is_bot true, every is_admin false
SELECT id, email, username, is_bot, is_admin FROM "user" WHERE is_bot;
-- verify: must return 0
SELECT count(*) FROM "user" WHERE is_bot AND is_admin;
```

### `bot_post` — new table, **a separate PM step**

`editorial_post` is left exactly as it is (spec R-14). Its shape is ISBN-specific (`nyt_isbn VARCHAR(50) NOT NULL UNIQUE`, `migrations/add_editorial_bot.py:28-36`) and cannot carry a prompt id or a quote id without abusing the column. A second, general table costs less than a migration of live history:

```sql
CREATE TABLE IF NOT EXISTS bot_post (
    id           SERIAL PRIMARY KEY,
    bot_email    VARCHAR(255) NOT NULL,
    content_type VARCHAR(32)  NOT NULL,   -- bestseller | prompt | quote | circles
    dedup_key    VARCHAR(255) NOT NULL,   -- ISBN, prompt id, quote id, or ISO week
    note_id      INTEGER,
    posted_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_post ON bot_post (content_type, dedup_key);
CREATE INDEX IF NOT EXISTS ix_bot_post_posted ON bot_post (content_type, posted_at DESC);
```

**Only the API ever touches this table** (E-5). The bot reads it through `GET /bots/posted` and never writes it at all — the write is the server's, inside the note's transaction. `note_id` stays nullable because it is audit information, not the dedup key; correctness lives entirely in `uq_bot_post`.

Bestsellers read **both** tables when deciding what is already posted, so no book that `@TMRBot` has ever posted comes back. `GET /bots/posted?content_type=bestseller` therefore returns the union of `bot_post.dedup_key` and `editorial_post.nyt_isbn` — the union is computed server-side, in one place, rather than by every caller. New bestseller rows are written to `bot_post` only; `editorial_post` becomes read-only history.

Both statements are additive, re-runnable and touch no existing row. **Neither is run by this sprint.** They go into `context/PM_SQL_QUEUE.md` as new steps 4 and 5, in that order, and the PM runs them.

### Atomic dedup — verified buildable

This is the part of E-5's decision that could have failed, so it was checked against the code rather than assumed.

`crud.create_note` (`app/crud.py:112-131`) is a plain `db.add(note)` / `db.commit()` / `db.refresh(note)` — no nested transaction, no `begin()`, no savepoint — and `notes_router.py:161` is its **only** caller in `app/` (verified by grep over `app/`). `get_db` (`app/database.py:60-68`) yields one `Session` per request and only closes it; it never commits or begins on the caller's behalf. So the request handler owns the transaction boundary outright, and the note's `INSERT` and the `bot_post` `INSERT` can share one commit:

```python
# notes_router.py, create_note — the bot branch only
dedup = payload.dedup_key if current_user.is_bot else None   # reader: silently ignored
note = crud.create_note(db, ..., commit=(dedup is None))
if dedup is not None:
    db.add(models.BotPost(bot_email=current_user.email, content_type=...,
                          dedup_key=dedup, note_id=note.id))   # note.id exists: flush assigned it
    try:
        db.commit()
    except IntegrityError:
        db.rollback()          # the note goes with it — nothing was committed
        raise HTTPException(status_code=409, detail="Already posted")
    db.refresh(note)
```

Three things make this correct rather than merely plausible:

- `db.flush()` inside the `commit=False` branch assigns the `SERIAL` primary key without ending the transaction, so `note_id` is real and the row is still rollback-able.
- The `IntegrityError` rollback discards the **whole** transaction, which is why a 409 creates no note. That is the required semantics, not a side effect to be worked around.
- The `except IntegrityError: db.rollback(); raise HTTPException(...)` shape is already how this codebase turns a unique-index collision into an error response — `follow_router.py:39-44` does exactly this for the `follow` unique constraint.

**Placement.** The block goes immediately after the `crud.create_note` call (`notes_router.py:161-173`) and **before** the group-activity hook and the response-shape block that follow it, so a 409 raises before `background_tasks.add_task` is reached. Both of those blocks then read a committed note, exactly as they do today. (In practice the hook is a no-op for a bot — it posts no `userbook_id` and is in no circle — but the ordering should not depend on that.)

The `commit` keyword is the only change to `crud.py`, it defaults to the present behaviour, and the single existing call site does not pass it. **The two-endpoint fallback (`GET`/`POST /bots/dedup`) is therefore not needed and is not specified.**

**One field, not two.** `bot_post` needs a `content_type` as well as a key, but adding a second request field to a schema shared with `PUT` is worse than namespacing the one. The bot sends `dedup_key` as `"<content_type>:<id>"` — `bestseller:9780593321447`, `prompt:41`, `quote:12`, `circles:2026-W39` — and the server splits on the first colon. A `dedup_key` whose prefix is not one of the four known content types is a **422**: unlike the reader case above, this field is bot-only and there is no old-client compatibility to protect, so failing loudly is free.

### Deploy order (not negotiable)

1. PM runs the `is_bot` SQL and returns the verification output.
2. PM runs the `bot_post` SQL.
3. Deploy the API **with** `("user","is_bot")` and `("bot_post","dedup_key")` in `schema_guard.REQUIRED_COLUMNS`. If step 1 or 2 were skipped, Render fails the deploy and the previous version keeps serving — which is the guard doing its job (`schema_guard.py:2-6`).
4. Set `BOT_LOGIN_SECRET` and `BOT_LOGIN_EMAILS` on the API service. Until this moment `/auth/bot-login` is a 404 and no bot can post.
5. Add the GitHub Actions secrets — **`BOT_LOGIN_SECRET`, `NYT_API_KEY`, `GEMINI_API_KEY`, and nothing else** — and the `BOT_ENABLED` repository variable (`true`). **`DATABASE_URL` is not on that list and must never be added** (E-5/E-7).
6. Deploy web.
7. Delete the Render cron job "TMR bot Cron Job".
8. Android 2.2.4 ships on its own timeline (E-1).

---

## Data flow — one run

```
GitHub Actions cron (UTC)
  └─ step 1: if vars.BOT_ENABLED != 'true' -> echo and exit 0
  └─ step 2: sleep $((RANDOM % 1500))            # 0–25 min jitter
  └─ step 3: python -m bots.<type>
       ├─ POST https://api.trackmyread.com/auth/bot-login {email, secret}   -> 15-min token
       │     404 -> the route is not enabled on this service: fail loudly
       │     401 -> wrong secret / not a bot row: fail loudly, never retry
       ├─ GET /bots/posted?content_type=<type>&since=<window>  -> ["bestseller:978…", …]
       │     the keys already used. Filter the candidate pool BEFORE composing,
       │     so no Gemini call is spent on something that would 409
       ├─ build content
       │     bestseller: NYT list of the day -> drop ISBNs already returned above
       │                 (the server's answer is editorial_post ∪ bot_post)
       │                 -> Gemini teaser (fallback: first sentence of the NYT description)
       │     prompt:     next unused id from bots/content/prompts.json (60-day window)
       │     quote:      next unused id from bots/content/quotes.json  (180-day window)
       │     circles:    GET /groups/public aggregate; k-floor;
       │                 below the floor -> fall through to a prompt (E-3)
       │     -> append the R-05a line
       └─ POST /notes/  {text, quote?, image_url?, is_public: true, dedup_key: "<type>:<id>"}
             201 -> the note AND its bot_post row were committed together. Done
             409 -> the key was taken between the GET and the POST. No note was created.
                    Fail the run. Never retry
             429 -> the server cap. Fail the run. Never retry
             4xx/5xx -> fail the run. Nothing was written
```

**The bot opens no database connection at all, and the run ends at the `POST`.** There is no second write for a run to die between, which is why spec R-15 no longer has a "posted but unrecorded" failure mode to describe.

---

## Scheduling on GitHub Actions

One workflow file, seven `schedule` entries, one job. The type is derived from the UTC day-of-week so that a single file holds the whole calendar and the `workflow_dispatch` input can override it.

```yaml
on:
  schedule:
    - cron: '30 13 * * 1'   # Mon 18:30 IST — bestseller
    - cron: '30 13 * * 2'   # Tue 18:30 IST — prompt
    - cron: '30 13 * * 3'   # Wed 18:30 IST — bestseller
    - cron: '30 13 * * 4'   # Thu 18:30 IST — circles
    - cron: '30 13 * * 5'   # Fri 18:30 IST — bestseller
    - cron: '30 05 * * 6'   # Sat 10:30 IST — prompt
    - cron: '30 05 * * 0'   # Sun 10:30 IST — quote
  workflow_dispatch:
    inputs:
      type: { description: 'bestseller | prompt | quote | circles', required: true }
```

Notes that matter:

- **Cron is UTC and has no DST.** India does not observe DST, so 13:30 UTC is 18:30 IST all year. No drift, unlike a US- or Europe-anchored schedule.
- **GitHub delays scheduled runs under load** — sometimes by tens of minutes, and it drops them entirely at peak. `keep-oregon-awake.yml` already carries that warning in its header comment. A bot post is not time-critical, so the delay is acceptable and a drop is a skipped day.
- **The jitter is a `sleep` before the work, not a cron trick.** 0–25 minutes, uniform. Combined with GitHub's own delay, posts land across a wide band and never on the half hour.
- **Missed run: nothing.** No catch-up branch, no "post two today", no queue. The dedup table makes this safe: an unposted bestseller was never marked, so it is still eligible tomorrow.
- **The secrets this workflow holds, in full:** `BOT_LOGIN_SECRET`, `NYT_API_KEY`, `GEMINI_API_KEY`. The repository variable `BOT_ENABLED` is not a secret. **`DATABASE_URL` is not on this list and must never be added to it** — the bot has no database credential and no direct database access (E-5/E-7). If a future change appears to need one, that is a new escalation, not a workflow edit.
- **Cost is not a constraint.** The repository is verified **PUBLIC** (`gh repo view --json visibility` → `{"visibility":"PUBLIC"}`, recorded in `pm-decisions.md`), and public repositories get unlimited GitHub-hosted Actions minutes. The keep-alive's ~4,300 runs a month and these seven runs a week cost nothing. What being public *does* cost is confidentiality: the workflow file, its logs and every `echo` in it are world-readable. See Security review §6.

---

## Security review

The bot token is the sharp edge, so it is treated first.

### 1. What a bot token can do, and why that is acceptable

`POST /auth/bot-login` mints a token that `get_current_user` cannot distinguish from a reader's (`deps.py:60-95`). Deliberately: adding a `scope` claim would create a second authority that has to agree with the first, and the two would eventually disagree. **`user.is_bot` on the row is the single authority**, re-read from the database on every request, so revocation is an `UPDATE` and not a token-expiry problem.

What a leaked bot token reaches, endpoint by endpoint:

| Capability | Reachable? | Why |
|---|---|---|
| Read or write another reader's books, notes, profile, circles | **No** | Every endpoint scopes by `current_user.id`. There is no endpoint that takes a target user id and writes |
| Delete another reader's post | **No** | `notes_router.py:638` requires ownership **or** `is_admin`. Bots are asserted non-admin, and the deploy check proves it |
| Anything under `/admin/*` | **No** | `get_admin_user` (`deps.py:129`) |
| Follow / like / comment | **No** | `deny_bot_actor` 403s before any row is written (R-05) |
| Post to the public feed | **Yes, capped** | 2 posts / 24 h, server-enforced (R-13) |
| Read `GET /bots/posted` | **Yes** | It returns ISBNs, prompt ids and quote ids the bots have already used. No reader data, no reader identifier |
| Reach the database directly | **No** | The bot holds no database credential at all (E-5). This is the capability the old design had and this one does not |
| Read the public feed and public profiles | **Yes** | The same as any signed-in reader |
| Build a library, post privately | **Yes** | Harmless and unused. Closing it would mean a capability model the codebase does not have; noted, not built |

So the worst case of a leaked bot secret is **two unwanted public posts a day until the secret is cleared**, both of them badged as a bot. That is a defensible blast radius. It is defensible *because of* `deny_bot_actor` and the cap, not despite them — without those two, the same token could like, follow and comment on readers' content at will.

### 2. The secret, not a token, is what is stored

A long-lived JWT in a GitHub secret would be a 30-day bearer credential (`auth.py:18`) that cannot be revoked without rotating `SECRET_KEY` for every reader. Instead the secret store holds only `BOT_LOGIN_SECRET`, and each run exchanges it for a 15-minute token. Clearing the env var on Render revokes every bot immediately and affects no reader.

### 3. `/auth/bot-login`, line by line

It is the one new endpoint, and it is justified: the alternative is a long-lived credential (above) or a password login the API does not have — there is no password login endpoint at all; sign-in is `/auth/google` and the env-gated `/auth/review-login`. Its rules, copied from `review_login` (`auth_router.py:122-146`) and then tightened:

1. **404 when not configured.** Both `BOT_LOGIN_SECRET` and `BOT_LOGIN_EMAILS` must be set, read per request so tests can patch them and an operator can change them without a code deploy. The route does not exist locally, in CI, or in a fork.
2. **Domain guard.** The email must end `@trackmyread.com`, independently of the allowlist, so a typo'd env var cannot admit an outside address.
3. **`is_bot` must already be true.** A reader's email in the allowlist is not enough.
4. **Constant-time compare** (`hmac.compare_digest`) and **one 401 for every failure**, evaluated after all checks, so the response cannot separate "unknown email" from "wrong secret".
5. **It never creates a user.** This is the one place it diverges from `review_login`, which does create (`auth_router.py:152-157`). A login route that can conjure an account, combined with an env var an operator edits, is a different risk class.
6. **`include_in_schema=False`**, as `review_login` is.
7. **No `last_active` write**, so the bot does not appear as "active" through the login path either.
8. Rate limiting: the API has none anywhere, so none is added here. The 401 path does one indexed lookup and one constant-time compare, and the 404 path does nothing at all. Noted as a known gap, consistent with the rest of the service.

### 4. `deny_bot_actor` placement

It is a FastAPI dependency, so it runs **before** the handler body — before the `Like` row, before `fire_event`, before the `IntegrityError` branch. Putting the check inside the handlers would leave four places to forget it; as a dependency it is one line per route and visible in the route signature.

It deliberately does **not** guard `POST /notes/` (a bot must post) or any `GET` (a bot reads the public feed to build the circle roundup).

`GET /bots/posted` takes the **opposite** guard — 403 unless `current_user.is_bot` — so it is a separate three-line check in the route, not `deny_bot_actor` inverted. Two dependencies with opposite senses and similar names would be a mistake waiting to happen.

### 5. Privacy of the circle roundup

The only content type that touches other readers' data. Rules, all enforced in `bots/circles.py`, all confirmed by the PM in E-3:
- Public circles only. A private circle contributes nothing, not even to a count.
- Aggregate counts only. No reader name, no username, no profile link, no circle name unless the circle is public.
- A k-anonymity floor: a title is named only when at least 3 readers across at least 2 circles are reading it. Below the floor, the roundup is not written at all — the slot posts a prompt instead, rather than a reworded roundup.
- The bot reads this through the same API it posts with, as an ordinary signed-in account, so it can only see what any reader can see. It does not query the database for it.

### 6. Secrets in a public repository

**The repository is public. Verified, not inferred:** `gh repo view --json visibility` returned `{"visibility":"PUBLIC"}` for `ankitalkuhs-commits/book-tracker` (E-7, recorded in `pm-decisions.md`). Everything below follows from that fact rather than from the Actions-minutes guess the earlier draft made.

Two consequences, in opposite directions.

**The minutes concern is withdrawn.** Public repositories get unlimited GitHub-hosted Actions minutes. The keep-alive's ~4,300 runs a month and the seven bot runs a week cost nothing, and no part of this design needs to be trimmed for budget. E-7's "if private, confirm the minutes budget" branch is dead.

**The credential concern is real and is what changed the design.** The workflow file, every run log and every `echo` in it are world-readable. So:

- **No `DATABASE_URL`.** It is not created as an Actions secret, not for this sprint, not temporarily, not behind a comment saying it will be removed later. A production database URL in a public repository's CI is a credential whose disclosure is total and unrecoverable — the reason dedup moved into the API (E-5). The whole of the bot's database access is now `POST /notes/` and `GET /bots/posted`, both of which need only a 15-minute bot token.
- The three secrets that do exist are each survivable. `BOT_LOGIN_SECRET` buys a 15-minute token for an account that owns no reader data and cannot follow, like or comment (§1); revoking it is one Render env edit. `NYT_API_KEY` and `GEMINI_API_KEY` are third-party read keys, rotatable, already in use.
- **Masking is not a control.** GitHub masks secret values in logs on a best-effort basis: it does not survive base64, JSON-escaping, or a secret echoed as part of a larger string. So `bots/common.py` never prints a response body, never prints a header, and prints only a status code, a content type and a note id. Test C-12 enforces it, and runs its detector against a deliberately leaking call to prove the detector works.
- The prompt and quote pools being public is harmless, and slightly good: a reader who finds `bots/content/prompts.json` learns exactly what the account is.

### 7. What is deliberately removed

`POST /admin/bot/trigger` (`admin_router.py:354`) shells out to `editorial_bot.py` with `subprocess.run` on the API host. It depends on the repository being checked out beside the running app, it would now need the bot secret on the API service to work at all, and it hands an admin a 60-second blocking subprocess on the web process. It is deleted, and the workflow's `workflow_dispatch` button replaces it.

---

## Test strategy

Severity: **Critical** = labelling, authorisation, privacy, ownership. **Major** = a content type or the schedule is dead. **Minor** = cosmetic.

House rule: every Critical and Major case names the **one-line product change that must turn it red**. A case with no such mutation does not count as coverage.

### API (pytest, `tests/test_bots.py` — new file)

| # | Case | Sev | Mutation that must turn it red |
|---|---|---|---|
| B-01 | `/auth/bot-login` returns 404 when either env var is unset | Crit | Delete the `if not configured_secret or not allowlist` guard |
| B-02 | Right secret + allowlisted bot email → 200 and a token that authenticates | Crit | Invert the `email_ok and secret_ok` condition |
| B-03 | Right secret + an email whose row has `is_bot = false` → 401 | Crit | Drop the `user.is_bot` check from the login |
| B-04 | Right secret + an allowlisted email that is not `@trackmyread.com` → 401 | Crit | Delete the domain guard |
| B-05 | Wrong secret and unknown email produce **byte-identical** responses | Crit | Give the two branches different `detail` strings |
| B-06 | An email not in the database → 401 and **no user row is created** | Crit | Add `review_login`'s find-or-create block |
| B-07 | The token expires in 15 minutes, not 30 days | Crit | Remove `expires_delta` from `create_access_token` |
| B-08 | A bot token on `POST /follow/{id}` → 403, and no `follow` row exists after | Crit | Remove `deny_bot_actor` from the route |
| B-09 | …on `POST /notes/{id}/like` → 403, no `like` row, **and no `post_liked` notification queued** | Crit | Remove `deny_bot_actor` from the route |
| B-10 | …on `DELETE /notes/{id}/like` → 403 | Crit | Remove the dependency |
| B-11 | …on `POST /notes/{id}/comments` → 403, no `comment` row | Crit | Remove the dependency |
| B-12 | A **reader** token on all four of those still succeeds | Crit | Change `deny_bot_actor` to reject everyone (guards against a blanket lock-out) |
| B-13 | A bot's 3rd post in 24 h → 429; the 2nd succeeds | Crit | Raise the cap constant to 99 |
| B-14 | A reader's 3rd post in 24 h succeeds | Major | Drop the `current_user.is_bot` condition from the cap |
| B-15 | The cap window slides: a post 25 h old does not count | Major | Change the window to "all time" |
| B-16 | `is_bot` is present and boolean in the `user` object of **every** note-serialising route (parametrised over all seven sites) | Crit | Remove the key from any one site |
| B-17 | `is_bot` is present in `/profile/{id}`, `/users/search`, comment authors, group post authors | Crit | Remove the key from any one |
| B-18 | A reader's `is_bot` is `false`, never `null`, never absent | Crit | Emit `getattr(user, "is_bot", None)` |
| B-19 | `/admin/stats` `total_users` and `total_notes` do not move when a bot posts; `bot_notes` moves by 1 | Crit | Remove the `is_bot == False` filter from either count |
| B-20 | `/admin/users` and `/admin/content/notes` carry `is_bot` | Major | Remove the field |
| B-21 | `fire_event` delivers nothing to a bot recipient | Major | Remove the recipient filter |
| B-22 | The streak-reminder query never selects a bot | Major | Remove `.where(User.is_bot == False)` from the scheduler |
| B-23 | Every existing test in `tests/` passes **unedited** | Crit | Rename any existing key in a `user` dict |
| B-24 | `POST /admin/bot/trigger` returns 404 | Minor | Restore the route |
| B-25 | `schema_guard.REQUIRED_COLUMNS` contains `("user","is_bot")` and `("bot_post","dedup_key")` | Major | Remove either entry (this is what makes a pre-migration deploy fail loudly) |
| B-26 | A bot posting with a fresh `dedup_key` → 201, and exactly one `bot_post` row exists with that key and the returned note id | Crit | Drop the `db.add(BotPost(...))` |
| B-27 | A bot posting with a `dedup_key` already used → **409, and `count(Note)` is unchanged** | Crit | Catch the `IntegrityError` without `db.rollback()`, so the note survives the collision |
| B-28 | A **reader** posting with a `dedup_key` → 201, no `bot_post` row, no error | Crit | Honour the field without the `current_user.is_bot` condition |
| B-29 | `GET /bots/posted` → 403 for a reader token, 200 for a bot token; the `bestseller` response includes an id present only in `editorial_post` | Crit | Read only `bot_post` for the union; or drop the `is_bot` check |
| B-30 | `crud.create_note` called without `commit=` still commits (every existing note test passes unedited) | Crit | Flip the default to `commit=False` |

### The bot package (pytest, `tests/test_bot_content.py` — new file, no network)

| # | Case | Sev | Mutation |
|---|---|---|---|
| C-01 | Every generated post ends with the exact E-2 string for its account, compared character-for-character (em dash, lower-case "automated", the handle, no trailing punctuation) | Crit | Make the line optional for one content type, or change the em dash to a hyphen |
| C-02 | The R-05a line is appended after model output, so a model that returns nothing still yields a labelled post | Crit | Move the append before generation |
| C-03 | `is_public: true` is in the `POST /notes/` body for every type | Crit | Drop the key (F-17 would make every post private) |
| C-04 | Every `POST /notes/` body carries a `dedup_key` of the form `<content_type>:<id>` | Crit | Omit the key for one content type (the post would then be undeduplicated) |
| C-04a | `bots/` imports no database driver — no `sqlalchemy`, no `psycopg2`, no `create_engine`, and no code reads `DATABASE_URL` | Crit | Re-add `editorial_bot.py:287-290`'s engine to `bots/common.py` |
| C-05 | A 429 **or a 409** fails the run and does not retry | Major | Add a retry loop |
| C-05a | Candidates returned by `GET /bots/posted` are filtered out **before** the Gemini call | Major | Move the filter after content generation (correct, but it burns a model call per skip) |
| C-06 | Gemini raising still produces a bestseller post, via the description fallback | Major | Remove the `except` around `generate_post_text` |
| C-07 | NYT raising produces **no** post and exit code 0 (a skipped day, not a fabricated one) | Major | Substitute placeholder book data on failure |
| C-08 | Prompts do not repeat inside 60 days; quotes inside 180 | Major | Ignore `bot_post` when choosing |
| C-09 | A bestseller already in **`editorial_post`** (not `bot_post`) is not re-posted — the bot honours what `GET /bots/posted` returned | Crit | Ignore the response and post the first NYT entry |
| C-10 | The circle roundup names no reader and no private circle | Crit | Include the top reader's name in the text |
| C-11 | Below the k-floor, the roundup posts **a prompt**, never a softened roundup | Crit | Lower the floor to 1 |
| C-12 | No log line contains the secret, a token, or a response body | Crit | `print(response.text)` on error |

### Clients

| # | Case | Sev | Mutation |
|---|---|---|---|
| W-01 | A feed post with `user.is_bot === true` renders the badge; a reader's does not | Crit | Make `BotBadge` return the pill unconditionally, or never |
| W-02 | The badge renders on the bot's profile header and in user search | Crit | Remove the badge from either site |
| W-03 | A post whose `user` object **lacks** `is_bot` (a stale 60 s cache) renders no badge and does not crash | Major | Use a truthy default in `BotBadge` |
| A-01 | Android feed card, profile header, comment row and search row render the badge | Crit | Remove the badge from any one |
| A-02 | A 2.2.1-shaped render path (no `is_bot` handling) still shows the R-05a text line | Crit | Strip the trailing line from the post text before rendering |

### Production checks (owned by QA/PM after deploy)

| # | Check |
|---|---|
| P-01 | `SELECT id,email,is_bot,is_admin FROM "user" WHERE is_bot` → exactly 4 rows, all `is_bot`, none `is_admin` |
| P-02 | `SELECT count(*) FROM "like" l JOIN "user" u ON u.id=l.user_id WHERE u.is_bot` → 0. Same for `comment` and `follow` (as follower) |
| P-03 | Seven posts in one week, at the scheduled times ± the jitter band, none more than two on a day |
| P-04 | `BOT_ENABLED=false` → the next run exits at step 1, and the log says why |
| P-05 | An old `@TMRBot` post, made before this sprint, shows the badge on web |
| P-06 | `/admin/stats` before and after a bot post: reader figures identical, `bot_notes` +1 |
| P-07 | Settings → Secrets and variables → Actions lists **exactly** `BOT_LOGIN_SECRET`, `NYT_API_KEY`, `GEMINI_API_KEY` for these workflows, and **no `DATABASE_URL`** (E-5/E-7) |
| P-08 | Re-dispatch a bestseller run for an already-posted key: 409 in the log, and `count(*)` on `note` for that bot is unchanged |

### Non-vacuity rules (from 4C, K-08 onward)

- Every test that injects a bot asserts a **control** that fails if the injection did not take effect (a reader in the same test that behaves normally).
- B-16/B-17 are parametrised over an explicit list of routes, and the test first asserts the list is the full set, so a new note route cannot silently escape.
- C-12 runs its detector against a synthetic positive (a deliberately leaking log call) to prove the detector works.

---

## Work packages

Five. File sets are disjoint. P1 must land before P2 (P2 reads the column P1 declares); P3, P4 and P5 depend only on P2's response shape and can run in parallel with each other.

| # | Package | Files (exclusive) | Requirements |
|---|---|---|---|
| **P1** | Flag, models, token, guards | `app/models.py` (`User.is_bot` **and** the `BotPost` model), `app/schema_guard.py`, `app/routers/auth_router.py`, `app/deps.py`, `app/routers/follow_router.py`, `app/notifications/dispatcher.py`, `app/notifications/scheduler.py`, `migrations/add_bot_accounts.py` (new), `tests/test_bots.py` (B-01..B-12, B-21..B-25) | R-01, R-05, R-08 |
| **P2** | Serialisation, cap, metrics, dedup | `app/routers/notes_router.py`, `app/crud.py` (the `commit=` kwarg **only**), `app/routers/bots_router.py` (new), `app/main.py` (one `include_router`), `app/routers/likes_comments.py`, `app/routers/profile_router.py`, `app/routers/users_router.py`, `app/routers/groups_router.py`, `app/routers/admin_router.py`, `tests/test_bots.py` (B-13..B-20, B-26..B-30) | R-02, R-07, R-13, R-15, R-16 |
| **P3** | Web | `book-tracker-frontend-stitch/src/components/BotBadge.jsx` (new), `HomePage.jsx`, `UserProfilePage.jsx`, `GroupDetailPage.jsx`, `AdminPage.jsx`, `src/services/api.js` | R-03, R-16 (admin UI) |
| **P4** | Android | `book-tracker-mobile-stitch/src/components/BotBadge.js` (new), `FeedScreen.js`, `GroupDetailScreen.js`, `UserProfileScreen.js`, `app.json` | R-04 |
| **P5** | Bot + CI + docs | `bots/**` (new), `.github/workflows/tmr-bots.yml` (new), `tests/test_bot_content.py` (new), `context/deployment/README.md`, `context/PM_SQL_QUEUE.md`, `features/community/index.md` | R-05a, R-07, R-09..R-12, R-14, R-15 |

`likes_comments.py` appears in **both** P1 (the `deny_bot_actor` dependency on three routes) and P2 (`is_bot` in two author dicts). Rather than split a small file across two builders, **P1 owns `likes_comments.py` entirely** and makes both changes; P2 treats it as read-only. That is the only file that would otherwise collide.

`editorial_bot.py` is deleted by P5, but **only after two successful production runs of `bots/bestsellers.py`**. Until then it stays in the tree, unused and unscheduled.

### Estimate after E-5

Still **4–6 days**, unchanged. The dedup decision moved work rather than adding it:

- **P2 gains about half a day** — one optional field, the `commit=` kwarg on `crud.create_note`, the `BotPost` insert and its 409 branch, one small read route, and B-26..B-30.
- **P5 loses about as much** — no `create_engine`, no connection handling, no `INSERT`, no "the post landed but the dedup row didn't" recovery path to write or test, and one fewer secret to plumb through the workflow.

The one-endpoint-plus-one-field shape the PM specified is also cheaper than the two-endpoint `GET`/`POST /bots/dedup` form the old E-5 costed at half a day, because the write is a side effect of a request the bot was already making.

---

## Merge order and file overlap

**4F merges after 4E.** The overlap is not incidental:

| File | 4E package | What 4E does | Collision |
|---|---|---|---|
| `app/routers/notes_router.py` | P3 | Rewrites `_note_relations` (deletes it for list routes), replaces the three engagement queries with `note_engagement()`, rewrites the `user` dict construction at every feed site | **Direct.** 4F adds a key to the same dicts 4E rebuilds. Trivial to reconcile by hand, ugly as a merge |
| `app/routers/likes_comments.py` | P3 | Rewrites the comments query to `comment JOIN user` | Direct at `:192` |
| `app/crud.py` | P3 | `get_notes_feed` gains joins | **New since E-5:** 4F now adds a `commit: bool = True` kwarg to `crud.create_note` (`crud.py:112-131`). 4E touches `get_notes_feed` (`:134`), a different function in the same file. Low |
| `app/routers/admin_router.py` | P6 | Query reductions; imports `note_engagement` | Same file, different functions. Low |
| `app/deps.py` | P1 | Moves the `last_active` write to after the response | Same file, different function. 4F appends `deny_bot_actor`. Low — **but note that 4E's move makes R-16's `last_active` observation slightly worse, not better: the write still happens, just later** |
| `app/routers/profile_router.py`, `users_router.py`, `groups_router.py` | P2, P5 | Query reductions | Same files, different lines. Low |

If the PM wants 4F first, it is possible but the cost lands on 4E: 4E's P3 would rewrite functions that 4F has just edited, and the `is_bot` key would have to be re-added by hand at each rebuilt site. **Recommendation: 4E first.** 4F's client and CI packages (P3, P4, P5) have no overlap with 4E at all and can start immediately in parallel; only P1 and P2 wait.

Sprint 4C is a dependency of both and is code-complete, blocked on its own migration.

---

## Escalations

**All nine are answered. `features/community/sprint-4f-activity-engine/pm-decisions.md` (2026-09-23) is the binding record; the body of this document and of `spec.md` already reflect every decision.** The reasoning below is kept because it is why each answer is the right one and what would have to change for it to be revisited — but none of these is an open question, and nothing downstream waits on them.

### E-1 — Android cannot be updated remotely. **DECIDED: (b), ship now behind the in-text label.** (`pm-decisions.md` §Accepted as recommended, E-1)

The badge in R-04 reaches a reader only when they install a new build. There is no `expo-updates` channel (`eas.json`, `appVersionSource: "local"`), releases are a manual `workflow_dispatch` AAB plus a manual Play upload, and the last shipped release is **2.2.1 / versionCode 60** while 2.2.3 / 62 is built but unshipped. Play rollout to an existing base typically takes weeks and never reaches everyone.

Options: (a) hold the bots until 2.2.4 adoption crosses a threshold — weeks of delay, and the threshold is never reached; (b) ship the API and web now, start the bots, and rely on R-05a's in-text line for Android until 2.2.4 spreads; (c) ship a server-side text label only and drop the badge — refused, the PM requirement is explicit that a name or text convention alone is not enough.

**(b) was taken.** The in-text line is a real label: every Android version shows it, it survives caching and screen readers, and it names the account. The badge arrives as an upgrade rather than a gate. The PM accepted explicitly that, for some weeks, some readers see the label only as text.

### E-2 — The exact wording of the in-text label. **DECIDED: the trailing named form, `— automated post from @<handle>`.** (`pm-decisions.md` §Accepted as recommended, E-2)

Draft: a final line, `— automated post from @TMRPrompts`. Alternatives: a leading line (`🤖 Automated post`), which is more visible and uglier on every card; or a shorter `— automated`, which does not name the account.

**The trailing named form was taken**, em dash and lower-case "automated", fixed string, never model-generated, asserted character-for-character by C-01. It names the account (so a reader can go and look at it), it does not fight the first line of the post for attention, and it is short enough not to dominate a two-line quote.

### E-3 — The circle roundup's privacy floor. **DECIDED: the floor stays at ≥3 readers across ≥2 public circles; Thursday falls back to a second prompt.** (`pm-decisions.md` §Accepted as recommended, E-3)

This is the only content type that aggregates other readers' behaviour. With a small user base, "the book most read in circles this week" can easily mean one person. The draft floor is: a title is named only when at least 3 readers across at least 2 public circles are reading it; below that, nothing is posted.

**The floor was kept, and the Thursday slot substitutes a second prompt when it is not met.** The PM's words: lowering the floor "is not an option that exists". If the roundup turns out never to fire, the answer is to drop the content type — the alternative is a post that effectively announces what one identifiable reader is reading.

### E-4 — Should the bot token carry a scope claim? **DECIDED: no claim. `user.is_bot` is the single authority.** (`pm-decisions.md` §Accepted as recommended, E-4)

A `scope: "bot"` claim in the JWT would let the API reject bot tokens without a database read. But it creates two authorities that must agree, and `get_current_user` already loads the row on every request (`deps.py:60-95`), so the flag costs nothing extra. A claim would also be the thing an attacker who obtained `SECRET_KEY` could forge, whereas the row cannot be forged and revocation is one `UPDATE`.

**No claim was added.** A `scope: "bot"` claim would create two authorities that must agree, and `get_current_user` already loads the row on every request (`deps.py:60-95`), so the flag costs nothing extra. A claim would also be the thing an attacker with `SECRET_KEY` could forge, whereas the row cannot be forged and revocation is one `UPDATE`. Revisit only if the API ever gains a token type that does not resolve to a user row.

### E-5 — Should the bot have a database connection at all? **DECIDED: no. Zero direct access, and `DATABASE_URL` is never an Actions secret.** (`pm-decisions.md` §"The one that changed the design")

**This is the one escalation whose answer changed the design.** The draft kept one direct connection for the dedup table, on the explicit condition that E-7 came back private. E-7 came back **public**, so the condition failed and the endpoint option was taken — and simplified while being taken.

The PM specified **one endpoint plus one field**, not the two endpoints the draft costed:

- `POST /notes/` takes an optional `dedup_key`, honoured only for a bot caller, written in the same transaction as the note. A duplicate is a 409 and no note is created.
- `GET /bots/posted` returns the keys already used, so a run filters before it composes.

That is smaller than the draft *and* strictly safer: it deletes the draft's own stated failure mode — "the post succeeds and the dedup write then fails" — because there is no longer a window between the two writes. Spec R-15 has been rewritten to say so rather than to describe a failure mode that no longer exists.

**The fallback was not needed.** The PM asked for a plain statement if the atomic form did not fit the existing `create_note` transaction boundary. It does fit: see "Atomic dedup — verified buildable" above for the evidence (`crud.py:112-131`, `database.py:60-68`, `follow_router.py:39-44`). So the two-endpoint `GET`/`POST /bots/dedup` form is not specified anywhere in this document. Under no circumstance does either form fall back to `DATABASE_URL` in Actions.

### E-6 — Quote copyright. **DECIDED: public-domain pool only, checked into the repository.** (`pm-decisions.md` §Accepted as recommended, E-6)

A "quote card" bot posting lines from in-copyright books is reproduction, not commentary, and the app carries affiliate tags, so it is commercial reproduction. Short attributed quotations may be defensible, but the volume (one a week, indefinitely, from a single account whose whole purpose is quoting) is what makes it a pattern rather than an incident.

**The pool is a checked-in list of public-domain works only** (pre-1929 US, plus anything explicitly licensed), never model output. That is a narrow, slightly old-fashioned voice, and "Margin Notes" leans into it. Contemporary quotes are a separate question with a separate answer, and are not in this sprint.

### E-7 — Is the repository public? **DECIDED: yes, verified.** (`pm-decisions.md` §"The one that changed the design")

`gh repo view --json visibility` returned `{"visibility":"PUBLIC"}` for `ankitalkuhs-commits/book-tracker`. The draft inferred this from the keep-alive's ~4,300 runs a month; it is now checked rather than inferred, which matters because it flipped E-5.

Both consequences:

- **The minutes concern is withdrawn.** Public repositories have unlimited GitHub-hosted Actions minutes. Neither the keep-alive nor the seven bot runs a week cost anything, and the draft's "if private, confirm the minutes budget" branch is dead.
- **Workflow files and every run log are world-readable.** Fine for the prompt and quote pools. Not fine for a production database credential — hence E-5. Security review §6 carries the full consequence.

### E-8 — Seven posts a week is a guess. **DECIDED: ship seven, review after four weeks.** (`pm-decisions.md` §Accepted as recommended, E-8)

Nothing in the data says seven is right. It is two "teaching" posts (prompt, roundup), three inventory posts (bestsellers) and one quote, which felt like a heartbeat without feeling like a feed takeover on a page that currently gets a handful of reader posts a week.

**Seven ships, and is measured after four weeks.** If bot posts outnumber reader posts in the feed, the bestsellers drop to one a week — they are the least instructive. The cap in R-13 (2/bot/day) is a safety limit, not a target, and the PM restated that it must never be read as headroom.

### E-9 — `@TMRBot`'s display name. **DECIDED: rename to *TrackMyRead Bestsellers*; every bio begins "Automated account."** (`pm-decisions.md` §Accepted as recommended, E-9)

It is currently "TrackMyRead Bot" with the bio "📚 Your daily editorial picks…" (`migrations/add_editorial_bot.py:18-20`). With three sibling accounts it needs a voice name — *TrackMyRead Bestsellers* — and each new account needs a bio that says plainly what it is and that it is automated. That is a one-row `UPDATE` per account, in the same PM SQL step.

**Renamed, and every bot bio begins with the words "Automated account."** One `UPDATE` per account, in the same PM SQL step as the `is_bot` flag. The name is not a control (that is what the badge is for), but four accounts called "Bot" would be confusing, and the bio is the first thing on the profile a curious reader opens.
