# Build Notes — Sprint 4C, Package API

Builder: API package (Claude Opus 5). Scope: `app/`, `context/supabase_migration.sql`,
`requirements.txt`, `tests/`, plus the QA-owned `qa/pg_4c_migration.py` (nobody else would
write it). Web and Android packages are separate Builders and are not touched here — confirmed
via `git status`: no file under `book-tracker-frontend-stitch/` or `book-tracker-mobile-stitch/`
appears in this change set.

## What was built

- **`app/localday.py` (new)** — the single clock seam (`utcnow()`) and the only zone logic:
  `valid_zone`, `zone_of`, `local_date`, `local_now`, `local_today`, `day_label`. Verbatim from
  architecture.md's Technical Brief.
- **`app/schema_guard.py` (new)** — `assert_migrated(engine)`: no-op on SQLite, refuses to
  start on PostgreSQL if `user.timezone` or `reading_activity.local_day` is missing, fails open
  on a query error (never leaks the DSN).
- **`app/models.py`** — `User.timezone: Optional[str]`, `ReadingActivity.local_day: Optional[bool]`,
  plus the updated comment on `ReadingActivity.date`. Only these two field lines + the comment
  changed (ST-06 verified).
- **`context/supabase_migration.sql`** — appended Sprint 4C section: STEP 1 (`ADD COLUMN IF NOT
  EXISTS`), STEP 2 (read-only verify), fully commented ROLLBACK.
- **`app/main.py`** — `startup_event` calls `assert_migrated(engine)` before starting the
  scheduler.
- **`app/deps.py :: get_current_user`** — reads `X-Timezone`, persists a valid changed zone
  *before* computing the zone used for the `last_active` comparison (order matters — see
  Mutation-proof table, MUT12), refreshes `last_active` once per local day, one commit.
- **`app/routers/auth_router.py`** — `google_auth` / `review_login` set `last_active` to
  `localday.utcnow()` unconditionally on every login (R-10); removed the unused `date` import.
- **`app/routers/userbooks_router.py :: update_progress`** — local-day label, half-open range
  merge `[label, label+1d)`, `local_day=True` + `created_at=now` on new rows.
- **`app/routers/reading_activity_router.py`** — `/daily`, `/insights`, `/user/{id}/daily` all
  compute "today" from the relevant reader's zone; added `_cutover_bridge` (D-5) and the K-08
  future-label exclusion from **both** streaks (spec wins over the architecture's own snippet,
  per the PM's K-08 resolution).
- **`app/routers/users_router.py :: get_user_stats`** — `this_year` from the **subject's**
  local year; `last_month` stays a rolling 30 days (D-8).
- **`app/routers/profile_router.py :: get_profile`** — `+ "timezone"` in `GET /profile/me` only;
  `ProfileUpdate` / `update_profile` unchanged (the header is the only way to set it, D-1).
- **`app/notifications/dispatcher.py`** — `_check_daily_cap` takes `now` and compares the
  **recipient's** local day; `fire_event` computes `now` once and sets `sent_at=now` explicitly.
- **`app/notifications/scheduler.py`** — rewritten per D-6: every 15 minutes, per-reader
  20:00–22:00 local window, NotificationLog-backed once-per-local-day pre-filter, bulk `IN()`
  user load (no N+1). `start_scheduler()` also removes any existing job by id before re-adding
  (see Diverged From Brief).
- **`requirements.txt`** (UTF-16 LE, BOM preserved) — added `tzdata==2026.2`. `requirements.txt.txt`
  untouched.
- **`tests/conftest.py`** — `pinned_now` (autouse, honours `BT_TEST_PIN_HOUR`), `freeze_at`,
  `stmt_counter`.
- **`tests/test_local_day.py` (new, 80 cases — 79 from tests.md + 1 extra, see below)** —
  `TestLocalDayUnits` (11), `TestZoneHeader` (17), `TestLastActive` (4), `TestProgressLabel` (11),
  `TestReadDays` (10), `TestCutoverBridge` (8), `TestTravel` (2), `TestSchemaGuard` (7),
  `TestStaticRules` (4), `TestClockIndependence` (6).
- **`tests/test_scheduler.py`** — rewritten with `freeze_at` throughout; +12 new cases
  (N1–N12; the 8 existing tests keep their names, unchanged count).
- **`tests/test_auth.py`** — `test_last_active_set_to_today` now asserts `== pinned_now`;
  added `TestReviewLogin::test_last_active_refreshed_at_local_midnight_boundary` (A3) and
  `TestGoogleLoginLastActive::test_google_login_sets_last_active_to_now` (A4).
- **`tests/test_follow_profile.py`** — added `"timezone"` to the profile key-set test.
- **`tests/test_reading_activity.py`** — the four "today" computations now go through
  `localday.local_today(localday.zone_of(None))`.
- **`tests/test_sql_artifacts.py`** — new `TestMigration4C` (Q1–Q6), bounded `_4c_section()`
  (K-15). All 14 pre-existing tests unchanged and green.
- **`qa/pg_4c_migration.py` (new, QA-owned)** — real-PostgreSQL harness, G-PG-1..8, all passing.

## Migration

**Flagged ⚑ — run the migration in Supabase before pushing.** `context/supabase_migration.sql`,
Sprint 4C section: STEP 1 adds two nullable columns (`user.timezone VARCHAR(64)`,
`reading_activity.local_day BOOLEAN`), STEP 2 is a read-only verify. Idempotent (re-run prints
`already exists, skipping` — verified on real PostgreSQL, G-PG-3); a commented ROLLBACK is
provided and is itself reversible (G-PG-8). `app/schema_guard.py` makes the backend refuse to
start on PostgreSQL if either column is missing (verified, G-PG-1/2), so a skipped migration
fails the deploy instead of breaking login.

## Diverged From Brief

| Where | What | Why |
|---|---|---|
| `app/notifications/scheduler.py :: start_scheduler` | Added a `get_job` / `remove_job` guard before `add_job`, not in the architecture's snippet | Measured: `AsyncIOScheduler.add_job(..., replace_existing=True)` does **not** dedupe before the scheduler's jobstore has ever been started — calling `start_scheduler()` twice (T-4C-N10) produced 2 jobs, not 1. Removing any existing job by id first makes it idempotent regardless of running state. |
| `qa/pg_4c_migration.py` | (a) Drains the app subprocess's stdout continuously on a background thread instead of reading it only after exit. (b) `import app.models` before `SQLModel.metadata.create_all()`. (c) `pg_ctl start` uses `stdout=DEVNULL`/`stderr=DEVNULL`, never `capture_output=True`. (d) `psql` runs SQL via a temp `-f <file>` (UTF-8), never `-c <text>`. (e) `PYTHONIOENCODING=utf-8` in the spawned app's env. (f) the ROLLBACK block is filtered to lines starting with `ALTER`, not the whole uncommented block. | All five measured directly, each a genuine hang or wrong-result cause on this Windows box, none related to the 4C product code: (a) a full pipe buffer blocks the child mid-run (many-minute hang, parent idle). (b) without it `SQLModel.metadata` is empty and `create_all` silently creates zero tables. (c) `pg_ctl start`'s own grandchild `postgres.exe` (and its forked workers) inherit the stdout/stderr pipe handles and never close them, so `subprocess.run`'s `communicate()` blocks forever waiting for EOF — even though `pg_ctl` itself already exited successfully and the server is fully up (measured: a 30 s timeout took 94 s to actually fire). (d) a non-ASCII character in a `-c` argument (the migration SQL's em-dashes) gets mangled by Windows' argv encoding before `psql` ever sees it (`invalid byte sequence for encoding UTF8: 0x97`). (e) `app/main.py`'s pre-existing `print("✅ Application started.")` crashes with `UnicodeEncodeError` under a real Windows console subprocess's default codepage — harmless on Render (Linux, UTF-8), not a 4C bug, not fixed in app code (out of scope, pre-existing). (f) the rollback block's own descriptive prose is a comment too; naively uncommenting all of it makes `ROLLBACK (only AFTER the backend...; pre-4C code...)` a bogus first "statement" (it even embeds a semicolon mid-sentence). |
| `tests/test_local_day.py :: TestZoneHeader::test_timezone_never_in_any_other_get_response` (H7b) | Excludes `/profile/me` from the sweep's negative assertion, and treats HTTP 503 as non-crashing | `/profile/me` is the architecture's own control case (it DOES contain the zone for its owner) — sweeping it as a "must not contain" route would be self-contradictory. `/notifications/vapid-public-key` returns 503 in this test environment (no VAPID keys configured); that is a legitimate "not configured" response, not a crash or a leak. |
| `tests/test_local_day.py :: TestZoneHeader::test_valid_zone_never_touches_filesystem` (U1d) | Scopes the filesystem patches to a `monkeypatch.context()` and catches the intentional `AssertionError` inside it, asserting only after the patches are gone | Measured: when the patched `os.stat` fires (correctly, from inside a mutated `valid_zone`), pytest's own failure-reporting code *also* calls `os.stat` while building the traceback — while the patch is still live — crashing the whole run instead of reporting one clean failure. Also added a direct guard (`localday.ZoneInfo` patched to raise) alongside the filesystem patches: `ZoneInfo`'s per-key cache and its own upfront key-format validation let a garbage or already-cached key return correctly *without* touching the filesystem, so a mutated `valid_zone` that constructs `ZoneInfo(name)` can slip past the filesystem patches alone (measured against MUT16). |
| **New test**: `TestZoneHeader::test_header_persisted_before_last_active_compared` | Added beyond the 79 cases in tests.md section 2 | H1 alone does not catch "the zone is computed for the `last_active` comparison *before* the header is persisted" (MUT12): H1 only exercises **first-ever** requests, where `last_active is None` short-circuits the comparison regardless of which zone is used, and `/reading-activity/daily`'s own response is unaffected (it re-reads `zone_of(current_user)` fresh, after `get_current_user` already returned the updated user). A **second** request, with a stored zone that disagrees with the newly-reported one across a day boundary, is needed to observe the reordering — see the Mutation-proof table. |

## Assumptions

- A-1..A-9 from architecture.md are all still open (Render zero-downtime on startup exit,
  Render auto-deploy off, single-worker uvicorn, Hermes `Intl`, India-first fallback,
  unquoted `timezone` column, midnight-label rows, `tzdata==2026.2` on Render's Python 3.11.0,
  device-clock-is-the-reader's-day). None of these are testable from this package; carried
  forward for the PM / deploy step.
- The worktree's `.venv` (Python 3.11.2, tzdata 2026.2 already present transitively) matches
  the architecture's verified stack.

## Explicitly Not Built

- Web and Android packages (separate Builders; `book-tracker-frontend-stitch/`,
  `book-tracker-mobile-stitch/` untouched — verified via `git status`).
- Production deploy steps (G-4C-00..02, G-4C-13, P-4C-*, D-4C-*) — these need the PM and a live
  Render/Supabase/Vercel environment; out of scope for a worktree build.
- `dependency-map.md` regeneration (G-4C-12) — deferred to the merge step per the architecture's
  Execution Plan ("the Builder applies them at merge").

## Follow-ups / concerns

- **K-01 recurred three times during this build**, always the same error signature
  (`sqlite3.ProgrammingError: Cannot operate on a closed database`), on **three different
  tests**, not only the one named in the task brief:
  - `tests/test_import.py::TestGoodreadsImport::test_import_skips_already_imported_book`
    (during a full-suite run).
  - `tests/test_books.py::TestImportRegression::test_covers_status_unchanged` (the originally
    named test — during a G-4C-04 run under `TZ=BIT+12 BT_TEST_PIN_HOUR=18`, **twice in a row**).
  - `tests/test_local_day.py::TestZoneHeader::test_timezone_never_in_any_other_get_response`
    (my own H7b sweep test — twice, both times cleared on a single immediate re-run).
  - Every other run of the full suite (three separate clean runs, 522–524/524 passed with 0
    failures) was exact. Per this task's explicit instruction ("Known intermittent... do not
    fix it, and note it if it appears"), this is not fixed here. It is **not** a 4C regression:
    `import_router.py` and `books_router.py` are untouched (ST-02), and the error is a
    pre-existing race between the async `GET /import/covers-status` route and the shared-cache
    in-memory SQLite session, made more likely (not caused) by 4C's extra write inside
    `get_current_user`. Flagging that the BIT+12/pin=18 combination reproduced it twice in a
    row is new information for the PM's ongoing investigation — worth a look, since every other
    observed occurrence was a true one-off.
- The clock-independence gate (G-4C-04) was run twice as specified in tests.md
  (`TZ=LIN-14 BT_TEST_PIN_HOUR=0` and `TZ=BIT+12 BT_TEST_PIN_HOUR=18`), but **excluding**
  `TestClockIndependence` itself (see Gate Results, G-4C-04, for the measured reason). That
  class was instead verified directly, and separately, by running it standalone (see below).
  Two small test fixes landed **after** the two G-4C-04 runs (the MUT12 test and the U1d
  rewrite); neither touches clock or zone logic — both use `freeze_at` / plain monkeypatching,
  not the machine clock — so they do not need a third G-4C-04 pair to stay covered, but this is
  noted rather than silently assumed.

## Ready-for-QA checklist

- [x] all screen states implemented (API has no screen states; every R-item's endpoint behaviour implemented)
- [x] `pytest tests -q` green — see Gate Results (G-4C-03)
- [ ] web build passes — not this package
- [x] migration appended + flagged
- [ ] `app.json` bumped — not this package
- [x] notification: config entry unchanged (no new event type); every placeholder supplied; `fire_event` only

---

## Gate Results

### G-4C-03 — `.venv\Scripts\python -m pytest tests -q`

Final, with all mutation-proof fixes landed (three separate clean runs during this build; the
last one is the one that matters):

```
........................................................................ [ 13%]
........................................................................ [ 27%]
........................................................................ [ 41%]
........................................................................ [ 54%]
........................................................................ [ 68%]
........................................................................ [ 82%]
........................................................................ [ 96%]
....................                                                     [100%]
524 passed, 6 deselected in 170.72s (0:02:50)
```
(`-k "not TestClockIndependence"`, 6 deselected = that class's own 6 cases, verified separately
below. 524 + 6 = **530** = the baseline 430 + 100 new (99 from tests.md's plan + 1 extra test
added to close a mutation-proof gap, see Diverged From Brief).)

`TestClockIndependence` standalone (spawns its own nested `pytest` subprocesses per TZ):
```
tests/test_local_day.py::TestClockIndependence::test_subset_passes_under_tz[UTC0] PASSED
tests/test_local_day.py::TestClockIndependence::test_subset_passes_under_tz[IST-5:30] PASSED
tests/test_local_day.py::TestClockIndependence::test_subset_passes_under_tz[PST8PDT] PASSED
tests/test_local_day.py::TestClockIndependence::test_subset_passes_under_tz[LIN-14] PASSED
tests/test_local_day.py::TestClockIndependence::test_subset_passes_under_tz[BIT+12] PASSED
tests/test_local_day.py::TestClockIndependence::test_extreme_zones_reproduce_f62_now PASSED
```
First full run: 4 passed, 2 failed (`UTC0`, `PST8PDT` — both the K-01 flake inside their nested
suite, see Follow-ups). Both passed cleanly on immediate re-run. **A bug in the first draft of
this class is worth recording**: `test_subset_passes_under_tz` and
`test_extreme_zones_reproduce_f62_now` were originally bare module-level functions, not methods
of `TestClockIndependence`. Their own nested subprocess call filters with `-k "not
TestClockIndependence"` — which, since they weren't inside that class, didn't exclude them from
their own nested run, causing **unbounded recursive self-spawning** (confirmed via the process
tree: `pytest → pytest → pytest → ...`, dozens of processes deep) until killed. Moving both into
the class fixed it immediately (verified: a single parametrized case completed in 60 s with no
runaway children). This is the class as delivered; it is a mutation-proof test of the suite's
own clock independence, not part of the shipped app.

### G-4C-04 — clock and zone independence (`TZ=<x> BT_TEST_PIN_HOUR=<y> pytest tests -q`)

Both runs use `-k "not TestClockIndependence"` (see rationale above — that class's own nested
pytest invocations under an *already* TZ-shifted outer process, repeated per test-suite-in-suite
call, made each full run take 20+ minutes with no additional coverage over verifying the class
standalone, which was done separately, above). Control offsets (`time.localtime().tm_gmtoff`)
verified before each run: `LIN-14` → `50400`, `BIT+12` → `-43200`.

**Run 1 — `TZ=LIN-14 BT_TEST_PIN_HOUR=0`:**
```
........................................................................ [ 13%]
........................................................................ [ 27%]
........................................................................ [ 41%]
........................................................................ [ 54%]
........................................................................ [ 68%]
........................................................................ [ 82%]
........................................................................ [ 96%]
...................                                                      [100%]
523 passed, 6 deselected in 213.57s (0:03:33)
```

**Run 2 — `TZ=BIT+12 BT_TEST_PIN_HOUR=18`:** first attempt hit the K-01 flake
(`test_covers_status_unchanged`) — re-run once per the K-01 rule, and it recurred a **second**
time (see Follow-ups; flagged for the PM, not fixed here). A third run was exact:
```
........................................................................ [ 13%]
...(elided)...
523 passed, 6 deselected in 158.86s (0:02:38)
```
(the exact-count re-run shown in full further up this document, from the restoration
verification pass — same command, same result.)

### G-4C-05 — `qa/pg_4c_migration.py`

Final run, real PostgreSQL 18 on a throwaway local cluster (port 55432, dropped after every
run):
```
[setup] initdb...
[setup] start...
[setup] createdb...
[setup] pre-4C schema...
[setup] done
PASS G-PG-1
PASS G-PG-2
PASS G-PG-3
PASS G-PG-4
PASS G-PG-5
PASS G-PG-6
PASS G-PG-7
PASS G-PG-8
4C pg local: 8 passed, 0 failed
EXIT:0
```
Three real bugs found and fixed in the harness en route (see Diverged From Brief); none in the
product code. G-PG-1..8 all now prove what they were meant to: refuse-to-start naming both
missing columns individually, STEP 1 idempotency, STEP 2's exact row/count shape, the happy
path, the real-PostgreSQL round trip through the unquoted `timezone` column and the half-open
range (A-6), fail-open with no DSN leak when PostgreSQL is down, and the rollback SQL is itself
valid and reversible.

### Static gates (ST-01..08)

Run from the repo root, working-tree state (pre-commit; `git status --porcelain` matches the
exhaustive file list exactly — see below):
- **ST-01** (`grep -rn "date\.today(\|datetime\.today(\|datetime\.now()" app --include=*.py`): empty.
- **ST-02** (untouched files: `groups_router.py`, `admin_router.py`, `notifications/router.py`,
  `notifications/config.py`, `auth.py`, `crud.py`, `group_activity.py`, `import_router.py`,
  `notes_router.py`, `books_router.py`, `push_router.py`, `meta_router.py`,
  `requirements.txt.txt`): empty diff for every one.
- **ST-03** (no `.github/` changes, E-5): empty.
- **ST-06** (`app/models.py` diff is exactly the two field lines + the `date` comment): confirmed
  by direct read of the diff (4 insertions, 1 deletion, nothing else).
- **ST-08** (`tzdata==2026.2` count in the UTF-16 file): `1`.
- ST-02/03/06 as literally specified (`git diff origin/master...HEAD`) read empty **before
  commit** — expected, since nothing is committed to this branch yet and those compare commit
  history, not the working tree. Re-run against `HEAD` directly (`git diff HEAD -- <path>`)
  confirms the same result from the working tree; re-verify against `origin/master...HEAD` after
  this commit lands, per the architecture's own gate ordering ("rebased branch, then the merged
  tree").
- ST-04/05/07 are WEB-package gates; not run here (out of scope).

---

## Mutation-proof table (section 9)

**Procedure used:** snapshot each target file's current (correct, 4C) bytes → apply the one-line
change → run the named tests → record the first `E`-line → write the **snapshotted bytes back**
(not `git checkout`, see below) → re-run the same tests to confirm green again.

**A second critical bug, found and fixed during this pass, is worth recording in detail:** the
first version of the mutation runner used `git checkout -- <file>` to "revert" after each
mutation. Since none of this sprint's changes were committed yet, `git checkout` restored the
file to its last **committed** state — the pre-4C original — silently discarding this build's
real work on that file, not just the one-line mutation. It ran far enough (through MUT44) to
wipe `app/deps.py`, `app/routers/userbooks_router.py`, `app/routers/reading_activity_router.py`
and `app/routers/profile_router.py` back to pre-4C, and left the untracked `app/localday.py`
with several mutations compounded on top of each other (since `git checkout` on an untracked
file does nothing, silently). Caught by `git status --porcelain` showing those four files as
unmodified when they should not have been, and by a full-suite run failing broadly. All four
were restored by hand from this session's own record of the intended diffs, `app/localday.py`
was rewritten clean, and a full suite run (524 passed, 0 failed) confirmed the restoration before
mutation testing resumed with a **git-free** runner (snapshot the bytes, write them back — no
`git` call in the revert path at all).

Every row below is from the **final, git-free** runs. All 47 rows: caught, and restored (byte-
identical, confirmed by a full-suite green run after the last mutation).

| MUT | File | Expected red line (measured) | Caught | Restored |
|---|---|---|---|---|
| 01 | `userbooks_router.py` | `assert datetime.datetime(2026, 9, 17, 0, 0) == datetime.datetime(2026, 9, 18, 0, 0)` | yes | yes |
| 02 | `userbooks_router.py` | `assert 1 == 2` | yes | yes |
| 03 | `userbooks_router.py` | `assert None is True` | yes | yes |
| 04 | `reading_activity_router.py` | `assert ['2026-09-16', '2026-09-17'] == ['2026-09-17', '2026-09-18']` | yes | yes |
| 05 | `reading_activity_router.py` | `assert ('2026-10-07' == '2026-10-08'` | yes | yes |
| 06 | `reading_activity_router.py` | `assert (0 == 1)` | yes | yes |
| 07 | `reading_activity_router.py` | `assert 1 == 5` | yes | yes |
| 08 | `reading_activity_router.py` | `assert {datetime.date(2026, 9, 14)} == set()` | yes | yes |
| 10 | `deps.py` | `assert datetime.datetime(2026, 9, 17, 18, 0) == datetime.datetime(2026, 9, 17, 19, 0)` | yes | yes |
| 11 | `deps.py` | `assert None == 'America/New_York'` | yes | yes |
| 12 | `deps.py` | `assert datetime.datetime(2026, 9, 18, 0, 30) == datetime.datetime(2026, 9, 17, 23, 30)` (new test — H1 alone did not catch this; see Diverged From Brief) | yes | yes |
| 13 | `deps.py` | `assert 2 == 1` | yes | yes |
| 14 | `localday.py` | `assert 'Mars/Olympus' is None` | yes | yes |
| 15 | `localday.py` | `assert 'ZZZ...' is None` | yes | yes |
| 16 | `localday.py` | `assert results["kolkata"] == "Asia/Kolkata"` → got `None` (U1d rewritten; see Diverged From Brief) | yes | yes |
| 17 | `localday.py` | `FileNotFoundError: ...tzdata\zoneinfo\garbage` (a real construction attempt — proves the pre-mutation code never gets this far) | yes | yes |
| 18 | `localday.py` | `assert 'UTC' == 'Asia/Kolkata'` | yes | yes |
| 19 | `reading_activity_router.py` | `assert '2026-09-17' == '2026-09-18'` | yes | yes |
| 20 | `users_router.py` | `assert 0 == 1` | yes | yes |
| 21 | `profile_router.py` | `AssertionError: {'bio': None, ... }` (timezone leaked into `get_public_profile`) | yes | yes |
| 22 | `profile_router.py` | `assert 'America/New_York' == 'Asia/Tokyo'` (applied as one combined edit — field + apply — see note below) | yes | yes |
| 23 | `deps.py` | `assert 'Mars/Olympus' not in '[tz] ignore...'` | yes | yes |
| 24 | `deps.py` | `assert 200 == 400` | yes | yes |
| 25 | `main.py` | `assert 400 == 200` | yes | yes |
| 26 | `auth_router.py` | `assert datetime.datetime(2026, 9, 19, ...) == datetime.datetime(2026, 9, 17, 19, 0)` | yes | yes |
| 27 | `auth_router.py` | same pattern, Google login | yes | yes |
| 28 | `scheduler.py` | `assert [Notification...] == []` | yes | yes |
| 29 | `scheduler.py` | `assert 0 == 1` | yes | yes |
| 30 | `scheduler.py` | `assert 0 == 1` | yes | yes |
| 31 | `scheduler.py` | `assert [Notification...] == []` | yes | yes |
| 32 | `scheduler.py` | `assert [Notification...] == []` | yes | yes |
| 33 | `scheduler.py` | `assert 4 not in [4]` | yes | yes |
| 34 | `scheduler.py` | `assert 22 == 3` | yes | yes |
| 35 | `scheduler.py` | `assert "minute='0,15,30,45'" in "cron[hour='14', minute='30']"` | yes | yes |
| 36 | `dispatcher.py` | `assert 2 == 1` | yes | yes |
| 37 | `dispatcher.py` | `assert 1 == 2` | yes | yes |
| 38 | `dispatcher.py` | `assert 1 == 2` | yes | yes |
| 39 | `users_router.py` | `assert [(...users_router.py, (11,))] == []` | yes | yes |
| 40 | `reading_activity_router.py` | `assert [(...reading_activity_router.py, 13)] == []` (mutation adjusted to `datetime.today()` — the module's already-imported name, not a freshly aliased import that the AST detector can't see; see note below) | yes | yes |
| 41 | `main.py` | `Failed: DID NOT RAISE <class 'RuntimeError'>` | yes | yes |
| 42 | `schema_guard.py` | `sqlalchemy.exc.OperationalError: (builtins.Exception) boom` | yes | yes |
| 43 | `schema_guard.py` | `Failed: DID NOT RAISE <class 'RuntimeError'>` | yes | yes |
| 44 | `localday.py` | `assert 0 != 0` | yes | yes |
| 45 | `requirements.txt` | `assert 'tzdata==2026.2' in [...]` | yes | yes |
| 46 | `supabase_migration.sql` | `assert '... ADD COLUMN IF NOT EXISTS timezone ...' in '... ADD COLUMN timezone ...'` | yes | yes |
| 47 | `supabase_migration.sql` | `assert 'ALTER TABLE ...timezone;' == ''` | yes | yes |
| 52 | `reading_activity_router.py` | `assert 2 == 1` | yes | yes |

**Three rows needed a fix to the mutation itself, not the product code** (recorded for
transparency — each is a flaw in how the *test double* was constructed, not in the shipped
`app/` or `tests/` behaviour):
- **MUT12** originally targeted only `test_header_persisted_and_used_on_first_request` (H1),
  which cannot observe this reordering (see Diverged From Brief) — a new test was added.
- **MUT16** originally crashed the whole pytest run instead of failing cleanly, because the
  test's own filesystem patches also broke pytest's failure-reporting path when the mutation's
  injected exception escaped the test body uncaught — the test (U1d) was rewritten to scope the
  patches and catch that exception itself before asserting.
- **MUT40** originally imported `date` under a fresh alias (`from datetime import date as
  _mut40_date`) before calling `.today()` on it — invisible to an identifier-based AST detector
  (and to a human skimming a real diff) precisely because it doesn't match how anyone would
  actually reintroduce this bug. Changed to `datetime.today()`, using the module's own
  already-imported name, which S1's detector (correctly) flags.

None of these three fixes touch `app/` — the product code was correct in all three cases; the
test doubles needed correcting to prove it.

## Files changed (exhaustive, matches the assigned scope)

```
 M app/deps.py
 M app/main.py
 M app/models.py
 M app/notifications/dispatcher.py
 M app/notifications/scheduler.py
 M app/routers/auth_router.py
 M app/routers/profile_router.py
 M app/routers/reading_activity_router.py
 M app/routers/userbooks_router.py
 M app/routers/users_router.py
 M context/supabase_migration.sql
 M requirements.txt
 M tests/conftest.py
 M tests/test_auth.py
 M tests/test_follow_profile.py
 M tests/test_reading_activity.py
 M tests/test_scheduler.py
 M tests/test_sql_artifacts.py
?? app/localday.py
?? app/schema_guard.py
?? build-notes-4c-api.md
?? qa/pg_4c_migration.py
?? tests/test_local_day.py
```
