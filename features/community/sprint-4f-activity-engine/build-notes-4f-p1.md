---
screen: sprint-4f-activity-engine
feature: community
package: P1 — the flag, the token, the guards
built_by: Builder (branch `builder-4f-p1`)
built: 2026-09-23
requirements: R-01, R-05, R-08
---

# Build notes — Sprint 4F, Package P1

## What was built

| File | Change |
|---|---|
| `app/models.py` | `User.is_bot: bool = Field(default=False, index=True)`; new `BotPost` model (`bot_post`, unique index on `(content_type, dedup_key)`) |
| `app/schema_guard.py` | `REQUIRED_COLUMNS` gains `("user","is_bot")` and `("bot_post","dedup_key")` |
| `app/routers/auth_router.py` | `POST /auth/bot-login` (`include_in_schema=False`), `_bot_login_config()`, `BOT_LOGIN_TOKEN_MINUTES = 15` |
| `app/deps.py` | `deny_bot_actor` dependency + `BOT_ACTOR_DENIED` message constant |
| `app/routers/follow_router.py` | `_: None = Depends(deny_bot_actor)` on `POST /follow/{followed_id}` |
| `app/routers/likes_comments.py` | the same dependency on like, unlike and comment — **and nothing else** (`is_bot` on comment-author dicts belongs to P2) |
| `app/notifications/dispatcher.py` | `_user_wants_event` returns False for a bot recipient; `fire_event` returns early when the actor row is a bot |
| `app/notifications/scheduler.py` | the streak-reminder candidate query gains `.where(User.is_bot == False)` |
| `migrations/add_bot_accounts.py` | **new.** Creates the three NEW bot accounts (`@TMRPrompts`, `@TMRQuotes`, `@TMRCircles`) with `is_bot=True`, `is_admin=False`, an unusable password and a bio starting `"Automated account."`. Idempotent. It does **not** touch `@TMRBot` — the PM's SQL does that. |
| `tests/test_bots.py` | **new.** 28 cases (below) |
| `tests/conftest.py` | `_StatementCounter` gains `.inserts` (K-10). Purely additive |
| `tests/test_local_day.py`, `tests/test_sql_artifacts.py` | 3 forced edits — see **Finding 1** |

### Suite numbers

| | Collected | Passed | Failed |
|---|---:|---:|---:|
| Baseline, this worktree at `2d1f1be` | 540 | 540 | 0 |
| After P1 (`5b55c1b`) | **568** | **568** | **0** |

568 − 540 = **28**, exactly the number of cases added — so no test file failed to load and no
assertion was silently skipped (`--collect-only -q` confirms 568 separately). Wall time 447 s.

**Caution for anyone repeating this:** the first "baseline" run of this build was contaminated —
it was started before the edits and finished after them, and the deferred `from app.schema_guard
import ...` calls inside test bodies picked up the half-edited tree. It reported 10 failures that
were partly artefacts. Take the baseline on a clean tree, with no editing in flight.

### `/auth/bot-login`, and the thing it must not do

It is `review_login` with the find-or-create block **deliberately absent**. A bot-login that can
conjure an account, driven by an env var an operator edits on Render, is a different risk class
from one that can only sign in as a row that already exists. B-06 pins that: a 401 for an
allowlisted, correctly-domained address with no row, `count(User)` unchanged, and — as the
control — `/auth/review-login` on the same shape *does* create, so the divergence is proved to
be a divergence and not a broken test.

It also does not write `last_active` (R-12), reads both env vars per request (so clearing
`BOT_LOGIN_SECRET` on Render is an instant kill switch), raises **one** 401 for all five failure
modes after evaluating all of them, and mints a **900-second** token with no scope claim.

### Why `deny_bot_actor` is a dependency

FastAPI resolves route dependencies before the handler body. That ordering *is* R-05's "before
any row is written and before any notification is queued" — the four handlers all reach
`db.add(...)` and `background_tasks.add_task(fire_event, ...)` only after every dependency has
returned. A check inside a handler body would return the same 403 and satisfy a status-code test
while writing the row first. B-12a proves the placement structurally by walking `app.routes` and
asserting `deny_bot_actor` is in `route.dependant` for **exactly** those four routes and no
others; B-12c proves the consequence by asserting `stmt_counter.inserts == 0` on the 403 path.

The flag is read from the database row `get_current_user` just loaded, never from a token claim
(E-4). B-12b proves both directions: a token minted while the row said reader is refused once the
row says bot, and a token minted while the row said bot is accepted once the row says reader.

---

## Deploy order — in my own words

**This commit must not be deployed until the PM has run both SQL steps.**

`app/schema_guard.assert_migrated` runs at startup and raises when a column named in
`REQUIRED_COLUMNS` is absent from `information_schema` on PostgreSQL. That is the point of it:
Render fails the deploy and the previous version keeps serving, instead of the new version
booting and crashing every `User` query. This commit adds two entries to that tuple. If it is
deployed first, the deploy fails — safely, but it fails.

A missing **table** produces no `information_schema.columns` row either, so
`("bot_post","dedup_key")` covers the whole `bot_post` table and no separate table check is
needed.

So, in order:

1. PM runs the `is_bot` SQL (below) and returns the verification output.
2. PM runs the `bot_post` SQL (below).
3. **Then** deploy this commit.
4. Set `BOT_LOGIN_SECRET` and `BOT_LOGIN_EMAILS` on the API service. Until that moment
   `/auth/bot-login` is a 404 and no bot can obtain a token.
5. Run `python -m migrations.add_bot_accounts` against production to create the three new
   accounts, then re-run the verification query — it must return **4** rows.

Steps 4 and 5 are after the deploy on purpose: nothing before step 3 can serve `/auth/bot-login`
at all.

On SQLite (dev, the whole test suite) `assert_migrated` returns immediately and `create_all`
builds `bot_post`, so none of this affects local work.

---

## The SQL the PM must run

### Step A — the `is_bot` column (the one this package depends on)

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ix_user_is_bot ON "user" (is_bot);

UPDATE "user" SET is_bot = true
 WHERE email IN ('tmrbot@trackmyread.com','tmrprompts@trackmyread.com',
                 'tmrquotes@trackmyread.com','tmrcircles@trackmyread.com');

-- E-9: rename @TMRBot and give it a bio that opens "Automated account."
UPDATE "user"
   SET name = 'TrackMyRead Bestsellers',
       bio  = 'Automated account. Weekly picks from the New York Times bestseller lists.'
 WHERE email = 'tmrbot@trackmyread.com';
```

The `ALTER` is metadata-only on every supported PostgreSQL version (a non-volatile default does
not rewrite the table). The index is a separate statement because creating indexes is never
bundled in this project — the PM decides it.

Note the `UPDATE` sets `is_bot` for all four emails, but only `@TMRBot` exists before step 5
above; the other three rows are created by `migrations/add_bot_accounts.py`, which sets
`is_bot = true` itself. Re-running this `UPDATE` after step 5 is harmless and idempotent.

### Verification query for Step A

```sql
-- must return exactly 4 rows, every is_bot true, every is_admin false
SELECT id, email, username, is_bot, is_admin FROM "user" WHERE is_bot;

-- must return 0 — a bot is never an admin (R-01)
SELECT count(*) FROM "user" WHERE is_bot AND is_admin;

-- must return 0 — every bot bio opens "Automated account." (E-9, K-12)
SELECT count(*) FROM "user" WHERE is_bot AND COALESCE(bio,'') NOT LIKE 'Automated account.%';

-- must return 0 — no reader was caught by the UPDATE
SELECT count(*) FROM "user" WHERE is_bot AND email NOT LIKE '%@trackmyread.com';
```

Run the first query **immediately after the ALTER + UPDATE** (it returns 1 row then — `@TMRBot`
only) and again after step 5 (it must return 4).

### Step B — the `bot_post` table (needed because `schema_guard` now requires it)

```sql
CREATE TABLE IF NOT EXISTS bot_post (
    id           SERIAL PRIMARY KEY,
    bot_email    VARCHAR(255) NOT NULL,
    content_type VARCHAR(32)  NOT NULL,
    dedup_key    VARCHAR(255) NOT NULL,
    note_id      INTEGER,
    posted_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_post ON bot_post (content_type, dedup_key);
CREATE INDEX IF NOT EXISTS ix_bot_post_posted ON bot_post (content_type, posted_at DESC);
```

Verification:

```sql
-- must return one row with column_name = 'dedup_key'
SELECT column_name FROM information_schema.columns
 WHERE table_schema = current_schema() AND table_name = 'bot_post' AND column_name = 'dedup_key';

-- must return 'uq_bot_post' and 'ix_bot_post_posted'
SELECT indexname FROM pg_indexes WHERE tablename = 'bot_post';
```

Both statements are additive, re-runnable and touch no existing row. **No `note` row is read,
written or moved** (R-06).

---

## Mutation-proof table

Every one of the 28 cases was run green, then run again against the named one-line break in
**product** code, and the actual first `E` line is recorded below. Each mutation was reverted
immediately afterwards and `tests/test_bots.py` re-run: **28 passed** after every revert.

Driver: `scratchpad/p1-4f/mut4f.py` (applies one exact anchored replacement, runs one pytest
node id, restores the file byte-for-byte in a `finally`). Node ids are full, never `-k`
substrings (rule 6).

| MUT | Case | Product change | Result | Actual first RED line |
|---|---|---|---|---|
| MUT-4F-01 | B-31 | `models.py` → `is_bot: Optional[bool] = Field(default=None, index=True)` | RED | `E AssertionError: assert True is False` (`col.nullable is False`) |
| MUT-4F-02 | B-25 | drop `("bot_post","dedup_key")` from `REQUIRED_COLUMNS` | RED | `E AssertionError: assert ('bot_post', 'dedup_key') in (('user','timezone'), ('reading_activity','local_day'), ('user','is_bot'))` |
| MUT-4F-03 | B-25a | `add_bot_accounts` → `user.is_bot = False` | RED | `E AssertionError: assert False is True` |
| MUT-4F-03b | B-25a | `add_bot_accounts` → `user.is_admin = True` | RED | `E AssertionError: assert True is False` |
| MUT-4F-05 | B-01 | delete the `if not configured_secret or not allowlist: 404` gate | RED | `E AssertionError: assert 500 == 404` (unconfigured now reaches `None.encode`) |
| MUT-4F-06 | B-01a | drop `include_in_schema=False` | RED | `E AssertionError: assert '/auth/bot-login' not in {...}` |
| MUT-4F-07 | B-02 | invert to `if (email_ok and row_ok and secret_ok):` | RED | `E assert 401 == 200` |
| MUT-4F-08 | B-03 | `row_ok = user is not None` (drop the `is_bot` check) | RED | `E assert 200 == 401` |
| MUT-4F-09 | B-04 | `email_ok = email in set(allowlist)` (delete the domain guard) | RED | `E assert 200 == 401` |
| MUT-4F-10 | B-05 | add an early `401 "Unknown account"` branch | RED | `E assert b'{"detail":"...own account"}' == b'{"detail":"...credentials"}'` |
| MUT-4F-11 | B-06 | drop `row_ok` from the check **and** paste `review_login`'s find-or-create | RED | `E assert 200 == 401` |
| MUT-4F-12 | B-07 | remove `expires_delta=timedelta(minutes=15)` | RED | `E AssertionError: expected a 900 s token, got 2592000 s` |
| MUT-4F-13 | B-07a | `secret_ok = payload.secret == configured_secret` | RED | `E AssertionError: assert ['payload.sec..._digest call'] == []` |
| MUT-4F-14 | B-07b | copy `review_login`'s `last_active` write into `bot_login` | RED | `E AssertionError: assert datetime.datetime(2026, 9, 23, 6, 0) is None` |
| MUT-4F-15 | B-07c | read both env vars once, at import, into module constants | RED | `E assert 404 == 200` |
| MUT-4F-16 | B-08 | remove `Depends(deny_bot_actor)` from `POST /follow/{id}` | RED | `E assert 200 == 403` |
| MUT-4F-17 | B-09 | remove the dependency from `like_note` | RED | `E assert 201 == 403` |
| MUT-4F-18 | B-10 | remove the dependency from `unlike_note` | RED | `E assert 200 == 403` |
| MUT-4F-19 | B-11 | remove the dependency from `create_comment` | RED | `E assert 201 == 403` |
| MUT-4F-17b | B-11a | remove the dependency from `like_note` | RED | `E AssertionError: assert 201 == 403` |
| MUT-4F-20 | B-12 | `deny_bot_actor` → `if True:` (reject everyone) | RED | `E AssertionError: assert 403 == 200` |
| MUT-4F-21a | B-12a | add `deny_bot_actor` to `POST /notes/` | RED | `E AssertionError: expected 4 guarded routes, found 5: [... ('POST','/notes/') ...]` |
| MUT-4F-21b | B-12a | remove it from `POST /follow/{id}` | RED | `E AssertionError: expected 4 guarded routes, found 3: [...]` |
| MUT-4F-22 | B-12b | decide from a JWT `is_bot` claim instead of the row | RED | `E AssertionError: the row now says bot; the token predates it` |
| MUT-4F-23 | B-12c | move the check out of the dependency, into `like_note`'s body | RED | `E assert 1 == 0` (`stmt_counter.inserts`) |
| MUT-4F-24 | B-21 | remove the recipient `is_bot` filter from `_user_wants_event` | RED | `E assert 2 == 1` |
| MUT-4F-25 | B-21a | remove the actor filter from `fire_event` | RED | `E AssertionError: assert 1 == 0` |
| MUT-4F-26 | B-22 | remove `.where(User.is_bot == False)` from the scheduler | RED | `E AssertionError: assert 4 not in [4, 5]` |
| MUT-4F-28 | B-23' | commit a **deletion** of a K-01 assertion instead of amending it | RED | `E assert ['tests/test_notes.py: deleted without an equivalent replacement: ...'] == []` |
| MUT-4F-28b | B-23' (2nd) | commit a deletion in `tests/test_dependencies.py`, a file K-01 does not list | RED | `E AssertionError: tests/test_dependencies.py has deleted lines and is not in K-01's list` |

**No mutation stayed green.** Two needed rewriting before they bit, and both rewrites are
reported rather than swapped in silently:

- **MUT-4F-11 as tests.md words it does not bite.** "Paste `review_login`'s find-or-create
  block" alone leaves the `row_ok` term in the credentials check, so a missing row still 401s
  before the paste is ever reached and B-06 stays green. The faithful mutation is the *whole*
  copy — `review_login`'s check (`email_ok and secret_ok`, no row term) **plus** its
  find-or-create. That is also the realistic defect: someone copies the route wholesale. The
  table above records that two-edit form.
- **MUT-4F-15's obvious form does not bite either.** A `try/except NameError` cache never
  populates, so the config is still re-read every request. The mutation that reproduces the
  defect is hoisting both `os.getenv` calls to module scope, which is what "read at import
  time" actually means.

The two B-23' mutations are the only ones that need a commit (the case reads
`git diff origin/master...HEAD`). Each was committed on `builder-4f-p1`, run, and removed with
`git reset --hard 5b55c1b`; `git status` was verified clean afterwards both times.

---

## Findings — things in the spec / architecture / test plan that are wrong or unbuildable

### Finding 1 (Critical) — K-01's list of 14 edited assertions is incomplete. Three more assertions break, in two files K-01 does not name.

Adding anything to `schema_guard.REQUIRED_COLUMNS` breaks three existing assertions that had
hard-coded the 4C pairs:

- `tests/test_local_day.py::TestSchemaGuard::test_guard_passes_when_both_present` — its
  `_StubEngine` serves only the two 4C pairs, so "everything present" became "two missing".
- `tests/test_local_day.py::TestSchemaGuard::test_startup_refuses_before_scheduler_when_column_missing`
  — its `good_engine` had the same literal.
- `tests/test_sql_artifacts.py::TestMigration4C::test_4c_column_types_match_code` — it walks
  **all** of `REQUIRED_COLUMNS` and asserts every column name appears in the 4C migration's
  STEP 1 text. That assertion says "no sprint after 4C may add a column", which cannot be what
  it meant; `schema_guard.py`'s own docstring says "Every future column migration appends to
  REQUIRED_COLUMNS".

Five further cases fail as a cascade: `TestClockIndependence::test_subset_passes_under_tz[*]`
spawns a nested pytest over `tests/test_local_day.py`, so the two failures above reappear inside
it (measured: 8 failures in total from the two-line `schema_guard` change).

**What I did.** The two `_StubEngine` call sites now serve `list(REQUIRED_COLUMNS)`, so they
never need editing again; the deliberate *omission* in the "missing column" case is untouched.
`test_4c_column_types_match_code` is scoped to a local `C4_PAIRS` literal and additionally
asserts `set(C4_PAIRS) <= set(REQUIRED_COLUMNS)`.

**What the PM/Architect must decide.** K-01's amended R-02 bullet ("The only permitted edit to
`tests/` is adding the new key to an enumerated key set — 14 assertions") is now false as
written. B-23' in `tests/test_bots.py` implements it with a **named, bounded exemption**:
`SCHEMA_GUARD_EXEMPT = {"tests/test_local_day.py", "tests/test_sql_artifacts.py"}`, asserted to
contain exactly two files, and every line added to an exempt file must carry one of
`REQUIRED_COLUMNS` / `C4_PAIRS` / `Sprint 4F` / a comment. The exemption therefore cannot widen
silently. It should be written back into tests.md K-01 rather than left living only here.

### Finding 2 (Major) — B-07's stated assertion is not computable. `exp - iat` does not exist.

tests.md B-07 says *"decode the token with `app.auth`; assert `exp - iat == 900`"*.
`app/auth.py:create_access_token` writes **only** `exp` — there is no `iat` claim anywhere in
this codebase, so `exp - iat` raises `KeyError`. The case is implemented as
`exp - timegm(issue_instant.utctimetuple()) == 900 ± 5 s`, which measures the same quantity.

Two related traps, both real, both hit while building:

- `datetime.utcnow().timestamp()` reads the naive value as **local** time. On this machine that
  is a 19,800 s error (IST), and it is what the first version of the test measured (it reported
  a "20700 s token"). `calendar.timegm(dt.utctimetuple())` is correct.
- `freeze_at` cannot be used here at all. `app/auth.py` calls `datetime.utcnow()` directly, not
  `localday.utcnow()`, so the clock seam the rest of the suite uses does not reach it. The
  "16 minutes later is 401 / 14 minutes later is 200" half of B-07 is done by shifting
  `app.auth.datetime` inside a `monkeypatch.context()` for the **mint** and leaving the real
  clock for the **request** — i.e. an genuinely old token, not a patched validator.

### Finding 3 (Major) — three P1 cases need files P1 does not own. Two are not built.

tests.md §1 assigns 29 P1 cases. Three of them cannot be built inside P1's file set:

| Case | Needs | Owner per architecture §Work packages | Built? |
|---|---|---|---|
| B-24 `POST /admin/bot/trigger` is gone | `app/routers/admin_router.py` | **P2** | **No** |
| B-25b `TestBotSQL` over `PM_SQL_QUEUE.md` | `context/PM_SQL_QUEUE.md` | **P5** | **No** |
| B-25a migration script | `migrations/add_bot_accounts.py` (new file, nobody else's) | P1 | Yes |

B-24 and B-25b must be reassigned to P2 and P5 respectively, or P1's file ownership widened.
They are **not** silently skipped: they do not exist in `tests/test_bots.py`, so nothing green
is claiming to cover them. P1 therefore delivers **28** cases, not 29.

A second problem with B-25b as written: architecture §Data says the 4F SQL goes into
`context/PM_SQL_QUEUE.md` "as new steps 4 and 5". **Steps 4 and 5 already exist** on this branch
(`## 4. Rating-reset repair`, `## 5. One leftover from QA`). Whoever builds B-25b must number
them 6 and 7, and K-15's "bounded section from its `## 4.` heading" must be re-pointed.

### Finding 4 (Minor) — B-04's mutation only bites if the domain guard is not duplicated.

Architecture §Security review 3.2 says the domain guard is applied "independently of the
allowlist", while `review_login` — the stated pattern to copy — filters the *allowlist* by
domain (`permitted = {e for e in allowlist if e.endswith(...)}`). Doing both gives two guards,
and B-04's named mutation ("delete the domain guard") then leaves the other one standing and the
test stays green. `bot_login` therefore has exactly **one** domain check, applied to the
request: `email in set(allowlist) and email.endswith(TRACKMYREAD_DOMAIN)`. Worth saying out loud
because "copy `review_login`" is what the architecture literally instructs.

### Finding 5 (Minor) — `deny_bot_actor` on `DELETE /notes/{id}/like` changes a 200 into a 403 for a row that already exists.

`unlike_note` returns 200 `{"message": "Not liked"}` when there is nothing to delete. With the
guard, a bot that somehow already owns a `Like` row gets 403 and the row survives — which is
what B-10 asserts and what R-05 wants (a bot must not touch reader-facing engagement state at
all), but it means the *only* way to remove such a row is the PM's SQL. Given P-4F-02 asserts
there are none, this is correct rather than a gap; recorded so nobody reads it as an oversight.

### Finding 6 (Minor) — the allowlist lookup short-circuits the database read.

`bot_login` does `user = crud.get_user_by_email(db, email) if email_ok else None`, so a
non-allowlisted address is answered without a database round trip while an allowlisted one is
not. The **responses** are byte-identical (B-05 proves that on `content`, `content-type` and
`content-length`), and the secret comparison is constant-time, so nothing secret-derived leaks —
but an attacker with a stopwatch could distinguish "in `BOT_LOGIN_EMAILS`" from "not in it".
`BOT_LOGIN_EMAILS` is operator configuration and not a secret, and the API has no rate limiting
anywhere (architecture §Security review 3.8 records that as a known gap), so this is accepted
rather than fixed. Recorded so it is a decision and not an oversight.

### Finding 7 (Informational) — `fire_event`'s actor guard costs one extra `SELECT` per call.

B-21a needs `fire_event` to refuse a bot **actor**, which means reading the actor's row. That is
one `db.get(User, actor_id)` per `fire_event` call (identity-map cached within a session, and
skipped entirely for the scheduler's `actor_id=0`). No existing query-count test measures a real
`fire_event` — `tests/test_scheduler.py::test_reminder_query_shape_no_n_plus_one` patches it —
so nothing regressed, but P2's B-33 should be measured with this in place.
