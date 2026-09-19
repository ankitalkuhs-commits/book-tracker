---
screen: sprint-4c-local-day
feature: reading-stats
test_plan_written: 2026-09-19
last_run: —
pass_rate: —
written_by: Senior QA (before Builder; no 4C build code exists — branch HEAD e3ef56d is docs only)
sources: spec.md (planned, PM decision 2026-09-18), architecture.md (architecture-complete + "PM decisions on the escalations (2026-09-19)", E-1..E-6 all accepted), triage-2026-09-13.md rows F-62 / F-65 and the 2026-09-18 gate correction, dependency-map.md (curated sections + generated rows 376-396), tests/conftest.py, tests/test_scheduler.py, tests/test_auth.py, tests/test_reading_activity.py, tests/test_sql_artifacts.py, tests/test_follow_profile.py, qa/unit/*.test.mjs, qa/web_4a_local.mjs, book-tracker-mobile-stitch/__tests__/*.mjs, house style features/maintenance/sprint-4a-platform-audit/tests.md and features/android/sprint-4b-android-audit/tests.md
baseline_measured: 2026-09-19 17:15 UTC (22:45 IST, outside the F-62 window) on the worktree at e3ef56d (code identical to master bca729d; master has since gained bc38891, docs + .gitignore only). pytest run 1 → 1 failed, 429 passed (K-01 flake); run 2 → 430 passed. node --test "qa/unit/*.test.mjs" → 14 pass. Android node --test "__tests__/*.test.mjs" → 101 pass, 0 skip (K-10).
---

## How to read this plan

- Cases are grouped by package (API, WEB, ANDROID), then by requirement (R-01..R-17) and escalation (E-1..E-6).
- **Ids.** The architecture's ids are kept unchanged: `T-4C-U/H/L/P/R/B/G/S/N`, `W-01..06`, `M-01..07`. New ones continue each series. Other prefixes:
  - `T-4C-A`: login.
  - `T-4C-T`: travel.
  - `T-4C-C`: clock independence.
  - `T-4C-Q`: SQL artifact.
  - `L-4C`: local web harness.
  - `G-PG`: local PostgreSQL harness.
  - `ST`: static command.
  - `G-4C`: gate.
  - `P-4C`: production.
  - `D-4C`: device.
  - `RG`: regression.
  - `MUT`: mutation.
- **Severity:** Critical = privacy / auth / ownership / data integrity / feature dead. Major = core flow broken. Minor = cosmetic or defensive. **Every privacy and ownership case is Critical and is never downgraded.**
- **Priority:** P0 ship blocker · P1 fix within sprint · P2 nice to have.
- **Every Critical and Major case names a mutation.** A mutation is the one-line product change that must turn the case red, with the first failure line to expect. Section 9 is the table that Builders fill in. **A mutation that no test catches blocks the merge.**
- "Expected" is what spec.md and architecture.md promise, not what the code does.

**Pytest conventions (binding for every 4C test):**
- **Fresh user per case.** `_make_user(db, email="4c-<case-id>@example.com")`. `_make_user` returns the **existing** user for a reused email, so a stored zone would leak between tests (K-17).
  - Never send `X-Timezone` as `alice_f`, `bob_f` or `admin_f`, and never set their `timezone`.
- **Explicit instants.** Every day-boundary case calls `freeze_at("<ISO naive UTC>")` with a full instant.
  - It seeds rows with explicit `datetime(...)` values, never `datetime.utcnow()`.
  - A case that uses a zone west of UTC−6 (`America/Los_Angeles`, `Pacific/Honolulu`) **must** use `freeze_at`. The default pin's date is only shared from UTC−6 to UTC+14 (K-05).
- **Headers.** `H(u, zone=None)` = `{**_auth(u), **({"X-Timezone": zone} if zone else {})}`.
- **Reading rows back.** Call `db.expire_all()` before reading rows after a request.
- **Seeding activity.** `_seed(db, user_id, ub_id, label: date, pages, local_day)` inserts `ReadingActivity(date=datetime(label.year, label.month, label.day), pages_read=pages, local_day=local_day, created_at=<the frozen instant>)`.
- **Non-vacuity (the 2026-09-18 lessons).**
  - Every TZ or clock injection asserts a **control** that fails if the injection did not take effect.
  - Every AST or static rule first proves it **found** its target, and runs its detector on a synthetic positive snippet.
  - Every harness prints one line per case, and gates compare **exact** counts. A file whose assertions never ran shows up as a lower count.

---

## 0. Findings and escalations from writing this plan — read before building

None blocks writing the tests. **K-08, K-11 and K-12 need an answer before the Builder starts;** each has a recommended resolution, which this plan assumes until told otherwise.

| # | Finding (evidence) | Recommended resolution — and what this plan assumes | Owner |
|---|---|---|---|
| K-01 | **The pytest baseline is flaky.** On e3ef56d, run 1 gave `1 failed, 429 passed`: `test_books.py::TestImportRegression::test_covers_status_unchanged`, `sqlite3.ProgrammingError: Cannot operate on a closed database`. Run 2 gave `430 passed`. The test passes alone (`-k TestImportRegression` → 1 passed). It is pre-existing and unrelated to 4C. Likely cause: the `async def` route `GET /import/covers-status` with sync session dependencies on the shared-cache in-memory SQLite. 4C adds a write to `get_current_user`, which can only make such a race likelier. | **Log it as a new triage finding (F-66 candidate); do not fix it in 4C.** Gate G-4C-03 keeps **exact** counts. If the **only** failure is this test, re-run the whole suite once. The re-run must be exact, and both runs are recorded. Any other failure, or this test failing twice, stops the merge. | Orchestrator / next triage |
| K-02 | **An IANA `TZ` value never reaches the process on this machine, so a TZ matrix written with IANA names passes while testing nothing.** Measured 2026-09-19: Git Bash does not pass `TZ=America/Los_Angeles` to Windows processes (Python `os.environ.get('TZ')` → `None`; Node `process.env.TZ` → `undefined`). When it is passed (PowerShell), Python's MSVCRT ignores an IANA name and silently uses the OS zone (IST): `America/Los_Angeles` gave local 22:49 = IST. POSIX strings **are** honoured: `UTC0` → +0, `IST-5:30` → +5:30, `PST8PDT` → −7 (PDT), `LIN-14` → +14, `BIT+12` → −12. Node honours `process.env.TZ = 'America/Los_Angeles'` **set at runtime inside the test** (verified: GMT−0700). | The Python matrix uses **POSIX TZ strings only** (valid on Windows and on glibc). Each run first asserts `time.localtime().tm_gmtoff` equals the expected offset (T-4C-C1..C5). Node tests set `process.env.TZ` inside the test, with a control assertion (W-03, W-04, M-03). | API / WEB / ANDROID |
| K-03 | **F-62's window can be reproduced at any wall-clock time.** At UTC hour *h*, `LIN-14` has local date ≠ UTC date iff *h* ≥ 10, and `BIT+12` iff *h* < 12. So at every instant at least one of them reproduces "machine date ≠ UTC date". The architecture's proof run asks for a manual Windows **OS zone change** plus a run inside 00:00–05:30 IST. Changing OS settings is not something QA does, and it is not needed. | Replace the manual proof with T-4C-C4/C5/C6 (in pytest) and gate G-4C-04 (the full suite under `LIN-14` and `BIT+12`). "Run inside 00:00–05:30 IST" is no longer required. | API |
| K-04 | **The default pin creates a new wall-clock dependency.** `pinned_now` = today 06:00:00 UTC. Instants that go through the seam (progress `updated_at`, `reading_activity.created_at`, `NotificationLog.sent_at`, `last_active`) are then **before** real-clock instants (PATCH / `finish` `updated_at`, model `default_factory`, admin broadcast `sent_at`) after 06:00 UTC, and **after** them before 06:00. Any test that orders or compares the two kinds flips with the hour. The frozen pin also gives **ties** between seam instants. `/userbooks/` orders by `updated_at desc` (`userbooks_router.py:310,502`), `:580` orders by `updated_at` only, and `/notifications/history` by `sent_at desc` (`notifications/router.py:154`). | `tests/conftest.py` honours `BT_TEST_PIN_HOUR` (integer 0–18, default 6). Hours 0 and 18 keep the UTC date equal to the IST date. Gate G-4C-04 runs the full suite with pin hours 0 and 18, **between 05:30 and 23:30 IST** (00:00–18:00 UTC). The pin is then before the real clock in one run and after it in the other. A test whose result changes gets explicit instants or a tiebreak. It never gets a retry. | API |
| K-05 | The pin's "same calendar date" band is UTC−6 to UTC+14. At the pin, `America/Los_Angeles` is 23:00 **the previous day**. | Convention above: zones west of UTC−6 use `freeze_at` only. | API |
| K-06 | **Browsers may report legacy zone ids.** Node 22.14 (ICU) on this machine gives `resolvedOptions().timeZone` = **`Asia/Calcutta`** for `TZ=Asia/Kolkata`, and **`Asia/Katmandu`** for `Asia/Kathmandu`. Chrome uses the same ICU canonicalisation. Both ids are in tzdata 2026.2's `available_timezones()` (verified, together with `Asia/Kathmandu`, `Pacific/Chatham`, `Pacific/Kiritimati`; `Etc/Unknown` → absent). Spec Done-checklist item 1 and architecture deploy step 3 expect `"timezone": "Asia/Kolkata"` after a web visit, but Chrome will store `Asia/Calcutta`. | **No normalisation** (D-2: stored as sent). Every web or device check accepts `Asia/Kolkata` **or** `Asia/Calcutta` (P-4C-07, L-4C-02, D-4C-02). U1 adds `Asia/Katmandu` to the accepted list. Doc Sync corrects the two wordings. | Doc Sync |
| K-07 | **R-07 says "every API request" carries the header. On the web, three raw `fetch` calls bypass `apiFetchRaw`:** `/profile/me/picture` (`api.js:105`), `/notes/upload-image` (`:177`), `/import/goodreads` (`:325`). The architecture names only the first. None of them computes a "today", and all fall back to the stored zone. | **Accept.** W-09 pins the raw-fetch inventory at exactly these 3 sites, so a new bypass is noticed. Doc Sync rewords R-07 (web) as "every request made through `apiFetchRaw`". | WEB / Doc Sync |
| K-08 | **The spec and the architecture disagree on future-labelled rows and streaks.** Spec R-05: a row whose label is later than local today "is excluded from today's chart **and streak**". The architecture excludes it from `current_streak` (anchored at today). But `longest_streak` iterates every label, so a West reader's future row makes `longest_streak` 2 while `current_streak` is 1 (web `ProfilePage.jsx:650` then shows "Best: 2"). | **Follow the spec:** `streak_dates` drops labels after local today for **both** streaks. `monthly_pages` keeps them (R-05: totals identical). B6 asserts `longest_streak == 1`. **Architect to confirm before build.** If the architecture is kept instead, B6's longest assertion becomes `2` and R-05 is amended. | Architect |
| K-09 | **Three architecture cases cannot catch their own named mutation.** (a) **L2** (NY 03:00Z → 03:30Z) has the same UTC date and the same local date, so "deps compares UTC dates" leaves it green. (b) **N7** "≤ 3 SELECTs" passes with 2 when nobody is in the window (the NotificationLog query never runs). (c) **U1**'s 65-character rejection passes without any length check, because no 65-character name is in the allowlist. | (a) L2 uses NY `2026-09-17T23:30Z` → `2026-09-18T03:30Z`: the UTC date changes, the local date does not. (b) N7 asserts **exactly 3**, with ≥ 1 user in the window. (c) U1c adds a 65-character name to `_VALID_ZONES` and still expects `None`. | API |
| K-10 | **The gate commands for the node tests fail as written.** `node --test qa/unit/` fails on Node 22.14 / Windows (`Cannot find module '…\qa\unit'`, `# fail 1`); the same holds for `node --test book-tracker-mobile-stitch/__tests__/`. `node --test "qa/unit/*.test.mjs"` → 14 pass. Android: **101 pass / 0 skip**, not the brief's 100 / 1. The one skippable test, `mark_read_present_iff_backend_route_exists`, skips only when the F-23 route is missing from `app/`, and it exists on this tree. **The worktree has no `node_modules`** (web or mobile). | Gate commands use the quoted-glob form. Android expectations are relative: **baseline + 12, skip unchanged**. Builders run `npm ci` **in the worktree** (never npm in the main checkout). For a read-only node run, `NODE_PATH=<main>/book-tracker-mobile-stitch/node_modules` works (measured). | Builders |
| K-11 | **An existing Android test goes red at the 2.2.3 bump, and the test is not in the ANDROID package.** `__tests__/versionGuard.test.mjs::committed_tree_passes_strict` asserts stdout matches `/61/` **and** `/60/`. After `app.json` = 2.2.3 / 62 the script prints `versionCode=62`, plus `60` (if `last-released.json` is still 2.2.1 / 60) or `61` (after the 2.2.2 release step). Either way one literal is missing. Measured output today: `app.json: version=2.2.2 versionCode=61` / `release/last-released.json: version=2.2.1 versionCode=60`. | **Add `__tests__/versionGuard.test.mjs` to the ANDROID file list.** The test reads the expected numbers from the two JSON files instead of literals (M-12's partner). Test count unchanged. | Architect / ANDROID |
| K-12 | **E-4 (accepted) adds the Privacy sentence, but `PrivacyPage.jsx` is not in the architecture's WEB file list.** Placement is unspecified. The page is plain JSX (no i18n, no `eslint-plugin-react`, so an ASCII apostrophe is fine) and says "Last updated: May 2026". | Add `book-tracker-frontend-stitch/src/pages/PrivacyPage.jsx` to WEB. The exact E-4 sentence appears once, inside the "What we collect" section. W-10 / L-4C-05 test the rendered text only. **PM:** move "Last updated" to September 2026? Recommended yes. The tests do not assert the date. | PM / WEB |
| K-13 | **No existing test proves `main.py` calls the guard.** The conftest `client` is a bare `TestClient(app)` (not a context manager), so startup events never run in the suite. | T-4C-G3 enters `with TestClient(app):` with `app.database.engine` patched to a PostgreSQL-dialect stub and `start_scheduler` patched to a spy. | API |
| K-14 | **"SQLite can't test the migration" is only partly true here. PostgreSQL 18 is installed locally** (`scoop`: `initdb`, `pg_ctl`, `psql`). Measured: a throwaway cluster on port 55432 ran 4C STEP 1 **twice**; the second run printed `NOTICE: column "timezone" of relation "user" already exists, skipping`. STEP 2 listed exactly the 2 rows. The guard's `table_name = ANY(:t)` query with a Python list works through psycopg2 2.9.6. | QA-owned harness `qa/pg_4c_migration.py` (G-PG-1..8, gate G-4C-05) proves on real PostgreSQL: refuse-to-start, idempotency, rollback, fail-open, and an unquoted `timezone` column through SQLAlchemy (A-6). **Still not testable locally:** Supabase's `current_schema()` on the pooler connection, Render's behaviour on a startup exit (A-1), and lock time at production size. These are covered by G-4C-01/02, G-4C-13 and P-4C-01. | QA |
| K-15 | **The 4A migration test helper is open-ended.** `test_sql_artifacts.py::_f53_section()` returns `text[start:]`, so the 4A rollback checks will also scan the 4C section appended after it. The 4C text as drafted does not trip them (it has no `DROP INDEX` and no UPDATE/DELETE), but a later edit could. | The 4C helper `_4c_section()` is bounded (from the `Sprint 4C` header to EOF). All 14 existing `test_sql_artifacts.py` tests stay green **unchanged** (RG-14). | API |
| K-16 | **Local dev logs will show a valid zone.** The dev SQLite engine is created with `echo=True` (`database.py`), so the `UPDATE user SET timezone=?` parameters are logged in local dev. Production uses `echo=False`. The test engine has no echo. | Accept for local dev. T-4C-H3 asserts on app output with the test engine. P-4C-03 checks the Render log. | — |
| K-17 | **The scheduler tests share one database.** Every in-window run fires for **all** inactive push users in it, including other tests' users. | Scheduler assertions are per user, or use a `fire_event` spy with `⊇` / `∌`. Emails and push tokens are unique per case. | API |
| K-18 | **Spec Done-checklist item 5 cannot be checked as written.** "No reminder at the 14:00 or 16:30 UTC runs for an IST reader" cannot be read from the Render log: a 16:30Z line is legitimate for a reader in UTC+3:30. The review accounts probably have no push token, so they are never reminded. | Replaced by read-only aggregate SQL that the PM runs (P-4C-11, P-4C-12). | PM |
| K-19 | **The architecture's G2 is fragile.** It reloads `app.localday` in-process; a failed reload leaves a half-executed module for later tests. | T-4C-G2 runs the import check in a **subprocess**. | API |
| K-20 | Master moved to `bc38891` (`.gitignore` + `seo-audit/*.md` only) after the branch point `bca729d`. | Rebase before merge (the architecture's G-0 already says so). No effect on any count. | Orchestrator |
| K-21 | **Circle months cannot be boundary-tested.** `groups_router.py` reads the real clock (`:60, 412, 491, 926`) and stays untouched (E-3), so a circle month edge cannot be frozen. | Covered by the untouched-file check (ST-02), H8's today-labelled group rows, and the floating date of the pin. No boundary case is possible without touching `groups_router.py`, which is out of scope. | — |
| K-22 | **No keep-alive (E-5) and no travel forgiveness (E-6) are asserted as absences.** | ST-03: there is no new `.github/workflows` file and no `schedule:` trigger. T-4C-T2: an eastward gap is not bridged. | — |

---

## 1. Summary

| Package | New automated cases | Changed existing | Command | Baseline → expected |
|---|---:|---|---|---|
| API pytest | **99**: `test_local_day.py` 79 (new file) · `test_scheduler.py` +12 · `test_auth.py` +2 · `test_sql_artifacts.py` +6 | `test_auth.py` 1 · `test_scheduler.py` 8 · `test_follow_profile.py` 1 · `test_reading_activity.py` 4 sites · `conftest.py` fixtures | `.venv\Scripts\python -m pytest tests -q` | **430 → 529 passed**, 0 failed |
| API local PostgreSQL | 8 (`qa/pg_4c_migration.py`, QA-owned) | — | `python qa/pg_4c_migration.py` | — → `4C pg local: 8 passed, 0 failed` |
| WEB unit | 11 (`qa/unit/localDate.test.mjs`) | — | `node --test "qa/unit/*.test.mjs"` | **14 → 25 pass**, 0 fail |
| WEB local harness | 5 (`qa/web_4c_local.mjs`, QA-owned) | `qa/web_4a_local.mjs` unchanged | `node qa/web_4c_local.mjs`; `node qa/web_4a_local.mjs` | 4C: — → `5 passed, 0 failed`; 4A: **25 → 25** |
| ANDROID node | 12 (`__tests__/localDate.test.mjs`) | `versionGuard.test.mjs` 1 (K-11) | `node --test "__tests__/*.test.mjs"` (from `book-tracker-mobile-stitch/`) | **101 → 113 pass**, 0 fail, skip unchanged (0) |
| Static commands | ST-01..ST-08 | — | section 6 | — |
| Production / device | P-4C-00..16, D-4C-01..04 | — | section 7 | — |
| Regression | RG-01..RG-16 | — | section 8 | — |

**Test mechanics that every API case relies on** (API package, `tests/conftest.py`):
- The `pinned_now` autouse fixture is as in the architecture, plus `BT_TEST_PIN_HOUR` (K-04).
- `freeze_at(iso)` is as in the architecture.
- New fixture `stmt_counter` counts statements on `tests.conftest.engine` via `before_cursor_execute` (the F-08 pattern). It exposes `.selects`, `.updates_user` (regex `^\s*UPDATE\s+"?user"?\s`, case-insensitive) and `.reset()`.

---

## 2. Package API — `app/`, `context/supabase_migration.sql`, `requirements.txt`, `tests/`

### 2.1 `app/localday.py` units — `tests/test_local_day.py::TestLocalDayUnits`

| # | Pytest | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| T-4C-U1 | `test_valid_zone_accepts_iana_names` | `valid_zone(z)` for `Asia/Kolkata`, `America/New_York`, `UTC`, `Asia/Calcutta`, `Asia/Katmandu`, `Asia/Kathmandu`, `Pacific/Chatham`, `Europe/London` | each returns `z` itself (identity, not a normalised name) | normalise aliases (`Asia/Calcutta`→`Asia/Kolkata`) → `assert 'Asia/Kolkata' == 'Asia/Calcutta'` | Major P0 |
| T-4C-U1b | `test_valid_zone_rejects_garbage` | `Mars/Olympus`, `../../etc/passwd`, `/etc/localtime`, `asia/kolkata`, `ASIA/KOLKATA`, `""`, `None`, `123`, `b"UTC"`, `"A"*65`, `localtime`, `posixrules`, `Etc/Unknown`, `" UTC"` | each → `None`; never raises | return the raw string for any `str` (MUT-14) → `assert 'Mars/Olympus' is None` | Critical P0 |
| T-4C-U1c | `test_valid_zone_length_cap_independent_of_allowlist` | `monkeypatch.setattr(localday, "_VALID_ZONES", localday._VALID_ZONES \| {"Z"*65, "Y"*64})` | `valid_zone("Z"*65) is None`; `valid_zone("Y"*64) == "Y"*64`. **Control:** `"Z"*65 in localday._VALID_ZONES` | delete `len(name) <= MAX_ZONE_LEN` (MUT-15) → `assert 'ZZZ…' is None` | Critical P0 |
| T-4C-U1d | `test_valid_zone_never_touches_filesystem` | patch `builtins.open`, `os.stat`, `os.path.exists` and `importlib.resources.files` to raise `AssertionError("fs touched")`; call `valid_zone` on `../../etc/passwd`, `Asia/Kolkata` and `asia/kolkata` | `None`, `"Asia/Kolkata"`, `None`, and no `AssertionError`. **Control:** calling `zoneinfo.ZoneInfo.no_cache("Asia/Tokyo")` under the same patches **does** raise (proves the patches bite) | `valid_zone` implemented as `try: ZoneInfo(name)` (MUT-16) → `AssertionError: fs touched` | Critical P0 |
| T-4C-U2 | `test_zone_of_fallback_and_stored` | `zone_of(None)`, `zone_of(SimpleNamespace(timezone=None))`, `…("garbage")`, `…("../../etc/passwd")`, `…("America/New_York")` | `.key` = `Asia/Kolkata`, `Asia/Kolkata`, `Asia/Kolkata`, `Asia/Kolkata`, `America/New_York`; never raises | no re-validation (MUT-17) → `ZoneInfoNotFoundError` | Critical P0 |
| T-4C-U3 | `test_local_date_ist_ny_utc_and_aware_input` | `local_date(datetime(2026,9,17,19,0), Z)` | IST `date(2026,9,18)`, NY `2026-09-17`, UTC `2026-09-17`. An aware `datetime(2026,9,17,19,0,tzinfo=ZoneInfo("Asia/Tokyo"))` (10:00Z) in UTC gives `2026-09-17` (it is honoured, not re-labelled) | naive treated as local instead of UTC → `assert datetime.date(2026, 9, 17) == datetime.date(2026, 9, 18)` | Major P0 |
| T-4C-U4 | `test_local_date_dst_new_york` | NY: `2026-03-08T04:59Z`, `05:00Z`, `07:30Z`; `2026-11-01T04:30Z`, `05:30Z`, `06:30Z`; `local_now(NY, 2026-11-02T01:00Z)` | `03-07`, `03-08`, `03-08` with `local_now(...).hour == 3`; `11-01`, `11-01` (01:30 EDT), `11-01` (01:30 EST); hour `20` | fixed −5 offset → `.hour == 2` fails for `07:30Z`, or `assert 19 == 20` | Major P0 |
| T-4C-U4b | `test_local_date_dst_at_midnight_santiago` | `America/Santiago`: `2026-09-06T03:59Z` / `04:00Z` (00:00 does not exist); `2026-04-05T02:30Z` / `03:30Z` (23:00–23:59 repeats on 04-04) | `09-05` / `09-06` (hour 1); `04-04` / `04-04` | fixed offset → `04:00Z` gives hour 0 | Major P1 |
| T-4C-U4c | `test_local_date_extreme_offsets` | Kathmandu `2026-09-18T18:14Z` / `18:15Z`; `Pacific/Kiritimati` `2026-09-18T09:59Z` / `10:00Z` | `09-18` / `09-19`; `09-18` / `09-19` | whole-hour rounding of offsets → `18:14Z` gives `09-19` | Major P1 |
| T-4C-U5 | `test_day_label_is_naive_midnight` | `day_label(date(2026,9,18))` | `== datetime(2026,9,18,0,0)` and `.tzinfo is None` | aware label → `assert datetime.datetime(2026, 9, 18, 0, 0, tzinfo=…) == …` | Major P1 |
| T-4C-U6 | `test_constants_e1_fallback_header_and_cap` | module attributes | `FALLBACK_ZONE == "Asia/Kolkata"` (E-1), `ZONE_HEADER == "X-Timezone"`, `MAX_ZONE_LEN == 64`, `FALLBACK_ZONE in _VALID_ZONES` | `FALLBACK_ZONE = "UTC"` (MUT-18) → `assert 'UTC' == 'Asia/Kolkata'` | Major P0 |

### 2.2 The zone header, storage and privacy — `TestZoneHeader` (R-07, R-08, R-09, R-13)

The instant is `freeze_at("2026-09-17T19:00:00")` unless stated. At that instant UTC is 09-17, IST is 00:30 on 09-18, NY is 15:00 on 09-17 and London is 20:00 on 09-17.

| # | Pytest | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| T-4C-H1 | `test_header_persisted_and_used_on_first_request` | fresh user; `GET /profile/me` with `America/New_York`. Second fresh user, **first-ever** request `GET /reading-activity/daily?days=2` with `America/New_York` | (1) 200, `timezone == "America/New_York"`, and the DB row is equal. (2) the last `date == "2026-09-17"` (NY), not the fallback's `"2026-09-18"`: persist-first (D-1) | drop `user.timezone = reported` (MUT-11) → `assert None == 'America/New_York'`; compute `zone` before applying the header (MUT-12) → `assert '2026-09-18' == '2026-09-17'` | Critical P0 |
| T-4C-H2 | `test_invalid_header_values_ignored` | fresh user with stored `Asia/Tokyo` (direct DB); for each U1b value that is sendable as a header (`Mars/Olympus`, `../../etc/passwd`, `asia/kolkata`, `""`, `"A"*65`, `Etc/Unknown`, `localtime`) → `GET /profile/me` | every response 200 with `timezone == "Asia/Tokyo"`; DB unchanged after each | MUT-14 → `assert 'Mars/Olympus' == 'Asia/Tokyo'` | Critical P0 |
| T-4C-H2b | `test_header_never_changes_status_or_body` | fresh user U; pairs **with / without** `X-Timezone: Mars/Olympus`: `GET /profile/me`, `GET /reading-activity/daily?days=3`, `GET /userbooks/999999999`, `GET /reading-activity/daily?days=0`, and no-token `GET /profile/me` | status is identical in each pair (200, 200, 404, 422, 401), and the JSON is identical (the 404 / 422 / 401 bodies byte-equal) | raise `HTTPException(400)` on an invalid zone (MUT-24) → `assert 400 == 200` | Critical P0 |
| T-4C-H3 | `test_header_value_never_logged` | `caplog.set_level(DEBUG)`; fresh users U, V; send each H2 value on `/profile/me` and `/reading-activity/daily`; then `POST /follow/{V.id}` as U (fires `new_follower`) | captured stdout + stderr + `caplog.text` contain none of `Mars/Olympus`, `etc/passwd`, `asia/kolkata`, `"A"*65`, `Etc/Unknown`. **Control:** they **do** contain `[Notify] new_follower` (proves app-thread prints are captured) | add `print(f"[tz] ignored {raw!r}")` in `deps.py` (MUT-23) → `assert 'Mars/Olympus' not in '…[tz] ignored …'` | Critical P0 |
| T-4C-H4 | `test_absent_header_keeps_stored_zone_and_null_for_never_reported` | user A: one request with `Europe/Paris`, then 3 requests without a header; user B: never sends one | A `timezone == "Europe/Paris"` after each; B `/profile/me` has key `timezone` with value `None` | clear the zone on a missing header → `assert None == 'Europe/Paris'` | Major P0 |
| T-4C-H5 | `test_zone_change_follows_device_one_update_per_change` | fresh user, `freeze_at("2026-09-18T10:00:00")` (IST 15:30, London 11:00, same date); `stmt_counter.reset()` before each: (1) `Asia/Kolkata` (new zone and new day), (2) `Asia/Kolkata`, (3) `Europe/London`, (4) `Europe/London` | `updates_user` = **1, 0, 1, 0**; the final stored zone is `Europe/London` | commit zone and `last_active` separately (MUT-13) → `assert 2 == 1` | Major P0 |
| T-4C-H6 | `test_cors_preflight_allows_x_timezone` | `client.options("/profile/me", headers={"Origin": "https://www.trackmyread.com", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization,content-type,x-timezone"})` | 200; `x-timezone` in `access-control-allow-headers` (case-insensitive); `access-control-allow-origin == "https://www.trackmyread.com"` | `allow_headers=["Authorization","Content-Type"]` (MUT-25) → `assert 'x-timezone' in 'authorization, content-type'` | Critical P0 |
| T-4C-H7 | `test_timezone_absent_from_named_views` | subject S stored `Asia/Tokyo`; viewer V follows S; admin A. As V: `/profile/{S}`, `/users/search?q=<S name>`, `/users/{S}/stats`, `/reading-activity/user/{S}/daily`. As A: `/admin/users`. Then S private and a **non-follower** W: `/profile/{S}` (locked) | no JSON object anywhere in these bodies (recursive walk) has a `timezone` key, and `"Asia/Tokyo"` is not in any `r.text` | add `"timezone"` to `get_public_profile` (MUT-21) → `assert 'timezone' not in {…}` | Critical P0 |
| T-4C-H7b | `test_timezone_never_in_any_other_get_response` | S stored sentinel `Pacific/Chatham`, with a public note, a userbook, a public group (V a member) and a notification to V. Sweep **every GET route** in `app.routes`, excluding `/openapi.json`, `/docs*`, `/redoc` and `/api/googlebooks/*` (external). Fill path params from `{user_id: S, group_id, note_id, userbook_id, book_id}`; **an unknown path param fails the test** with `add <param> to the sweep map`. Callers: V (all routes), S (all except `/profile/me`), A (`/admin/*`) | every status < 500, and `"Pacific/Chatham"` in none of the bodies. **Control:** `GET /profile/me` as S contains it. **Control:** at least 45 distinct routes swept (50 GET routes remain after the exclusions on e3ef56d) | MUT-21, or `timezone` added to admin `UserSummary` → `assert 'Pacific/Chatham' not in '…'` | Critical P0 |
| T-4C-H8 | `test_deploy_invariance_sums_and_rows` | 3 fresh users (never report). Seed 40 old rows (`local_day=None`) labelled across the last 60 days of the **pinned** date. User 1 is in a fresh group, and its group rows are labelled `pinned.date()` (K-21). Snapshot `(id, date, pages_read, local_day)` of every seeded row | `/daily?days=60` sum = seeded sum per user; insights `monthly_pages` sum = seeded sum inside the 12 months; `/groups/{g}/goal` `pages_read` = today-labelled sum. After all reads the snapshot is identical: **GETs write nothing** | set `local_day` lazily on read → snapshot diff `(… None) != (… True)` | Critical P0 |
| T-4C-H9 | `test_put_profile_me_cannot_set_timezone` | stored `Asia/Tokyo`; `PUT /profile/me {"timezone":"America/New_York","bio":"4c-h9"}` with **no** header | 200; `bio == "4c-h9"`; `timezone` still `Asia/Tokyo` in the response and the DB | add `timezone` to `ProfileUpdate` (MUT-22) → `assert 'America/New_York' == 'Asia/Tokyo'` | Critical P0 |
| T-4C-H10 | `test_header_only_writes_callers_own_row` | A stored `Asia/Tokyo`; B sends `Europe/Paris` on `GET /profile/{A}` and `GET /reading-activity/user/{A}/daily` | A `timezone == "Asia/Tokyo"`; B `timezone == "Europe/Paris"` | write the zone onto the subject → `assert 'Europe/Paris' == 'Asia/Tokyo'` | Critical P0 |
| T-4C-H11 | `test_invalid_stored_zone_falls_back_without_500` | stored `Mars/Olympus` and `../../etc/passwd` (direct DB, two users); no header: `/reading-activity/daily?days=2`, `/reading-activity/insights`, `/profile/me` | all 200; `/daily` last `date == "2026-09-18"` (fallback IST) | MUT-17 → `ZoneInfoNotFoundError` / `ValueError` raised through `TestClient` | Critical P0 |
| T-4C-H12 | `test_timezone_deleted_with_account` | fresh user with stored `Asia/Tokyo`; `POST /auth/delete-account/me` | 200 `{"message":"Account deleted"}`; `db.get(User, id) is None` | — (account delete unchanged; privacy proof) | Critical P0 |
| T-4C-H13 | `test_header_ignored_without_valid_auth` | `GET /notes/feed` with no token + `Asia/Tokyo`; `GET /profile/me` with `Authorization: Bearer not-a-token` + `Asia/Tokyo` | 200 and 401 as without the header; the count of `User` rows with `timezone == "Asia/Tokyo"` is unchanged | store the zone in `get_current_user_optional` → count +1 | Critical P1 |
| T-4C-H14 | `test_old_client_without_header_uses_stored_then_fallback` (R-09) | A stored `America/New_York`; B never reported; both send **no header**; `/daily?days=2` | A last `"2026-09-17"`; B last `"2026-09-18"`; both zones unchanged | MUT-18 → B `assert '2026-09-17' == '2026-09-18'` | Critical P0 |

### 2.3 `last_active` and login — `TestLastActive` and `tests/test_auth.py` (R-10)

| # | Pytest | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| T-4C-L1 | `test_last_active_refreshed_on_new_local_day_ist` | stored `Asia/Kolkata`; `freeze_at("2026-09-17T18:00")` `GET /profile/me`; `freeze_at("2026-09-17T19:00")` `GET /profile/me` | `last_active == datetime(2026,9,17,18,0)`, then `== datetime(2026,9,17,19,0)` (the UTC date is unchanged; the IST date changed) | `deps` compares UTC dates (MUT-10) → `assert datetime.datetime(2026, 9, 17, 18, 0) == datetime.datetime(2026, 9, 17, 19, 0)` | Critical P0 |
| T-4C-L2 | `test_last_active_not_rewritten_same_local_day_across_utc_midnight` (K-09a) | stored `America/New_York`; `2026-09-17T23:30Z` (19:30 EDT) then `2026-09-18T03:30Z` (23:30 EDT, still 09-17) | stays `datetime(2026,9,17,23,30)` | MUT-10 → `assert datetime.datetime(2026, 9, 18, 3, 30) == datetime.datetime(2026, 9, 17, 23, 30)` | Major P0 |
| T-4C-L4 | `test_last_active_uses_fallback_for_never_reported` | never reported; `18:00Z` then `19:00Z` on 09-17 | updated at `19:00` (IST rule) | fallback `UTC` → stays `18:00` | Major P0 |
| T-4C-L5 | `test_no_user_update_same_zone_same_local_day` | stored `Asia/Kolkata`, request at `2026-09-18T05:00Z`, then `stmt_counter.reset()`, request at `2026-09-18T12:00Z`, same header | `updates_user == 0` | unconditional `last_active` write → `assert 1 == 0` | Major P1 |
| T-4C-A3 | `test_auth.py::TestReviewLogin::test_last_active_refreshed_at_local_midnight_boundary` | `_configure(monkeypatch, "review.4c.a3@trackmyread.com")`; login once at `2026-09-17T18:00`, then `freeze_at("2026-09-17T19:00")` and login again | `last_active == datetime(2026,9,17,19,0)`: login **always** sets it | keep the `last_active.date() != date.today()` guard (MUT-26) → `assert datetime.datetime(2026, 9, 17, 18, 0) == …19, 0)` | Critical P0 |
| T-4C-A4 | `test_auth.py::TestGoogleLoginLastActive::test_google_login_sets_last_active_to_now` | monkeypatch `app.routers.auth_router.id_token.verify_oauth2_token` → `{"email": "4c-a4@example.com", "name": "A4", "sub": "g-4c-a4"}`; login at `2026-09-17T18:00`, then again at `19:00` | 200 each; `last_active == datetime(2026,9,17,19,0)` | same guard left in `google_auth` (MUT-27) → `…18, 0) == …19, 0)` | Critical P0 |
| (changed) | `TestReviewLogin::test_last_active_set_to_today` (F-62) | unchanged steps | `user.last_active == pinned_now` (**not** `date.today()`) | `date.today()` restored in the assertion → fails under `LIN-14` / `BIT+12` (C-cases) | Critical P0 |

### 2.4 Where a day's reading lands — `TestProgressLabel` (R-01, R-02, R-05)

The userbook for each case is made with `POST /books/add-to-library {"title": "<case>", "total_pages": 500, "status": "reading"}` at the same frozen instant and header. The progress body is `PUT /userbooks/{ub}/progress {"current_page": n}`.

| # | Pytest | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| T-4C-P1 | `test_progress_labelled_local_day_ist_after_midnight` | `Asia/Kolkata`, `2026-09-17T19:00`, current_page 10 | one row: `date == datetime(2026,9,18)`, `local_day is True`, `created_at == datetime(2026,9,17,19,0)`, `pages_read == 10`. Response keys exactly `{id, status, current_page, rating, updated_at}`, and `updated_at` starts `2026-09-17T19:00:00` | UTC label (MUT-01) → `assert datetime.datetime(2026, 9, 17, 0, 0) == datetime.datetime(2026, 9, 18, 0, 0)`; no `local_day=True` (MUT-03) → `assert None is True` | Critical P0 |
| T-4C-P2 | `test_progress_same_instant_ny_and_utc_label_utc_day` | the same instant, a NY user and a `UTC` user | both `date == datetime(2026,9,17)` | label by the fallback zone for everyone → `…18 == …17` | Major P0 |
| T-4C-P3 | `test_progress_merges_across_utc_midnight` | IST: `2026-09-17T19:00` → 10, then `2026-09-18T18:00` (23:30 IST) → 15 | exactly 1 row, `09-18`, `pages_read == 15` | MUT-01 → `assert 2 == 1` | Critical P0 |
| T-4C-P4 | `test_progress_splits_at_local_midnight` | IST: `2026-09-18T18:29` → 5, `18:31` → 10 | 2 rows: `09-18` (5), `09-19` (5) | MUT-01 → `assert 1 == 2` | Critical P0 |
| T-4C-P5 | `test_progress_never_merges_into_future_row` | NY; seed an old row labelled `09-19` (`local_day=None`, 5 pages, `current_page` 5) and set the userbook's `current_page = 5`; at `2026-09-18T20:00Z` (16:00 EDT) → 12 | a **new** row `09-18` (7, `True`); the `09-19` row is unchanged at `(5, None)` | drop `< label + 1 day` (MUT-02) → `assert 1 == 2` rows | Critical P0 |
| T-4C-P6 | `test_progress_merges_into_same_label_old_row` | IST; old row `09-18` (`None`, 4 pages), `current_page` 4; at `2026-09-18T10:00Z` → 8 | the same row id, `pages_read == 8`, `local_day is None`; row count unchanged | force `local_day=True` on merge → `assert True is None` (it would break the D-5 bridge input) | Major P0 |
| T-4C-P7 | `test_progress_west_of_utc_is_not_tomorrow` | `America/Los_Angeles`, `2026-09-19T03:00Z` (20:00 PDT on 09-18) → 10 | `date == datetime(2026,9,18)`; before 4C this was labelled `09-19` | MUT-01 → `…19 == …18` | Critical P0 |
| T-4C-P8 | `test_progress_nepal_offset_splits_at_local_midnight` | `Asia/Kathmandu`: `2026-09-18T18:14Z` → 5, `18:15Z` → 10 | 2 rows `09-18`, `09-19` | whole-hour offset or UTC → 1 row | Major P1 |
| T-4C-P9 | `test_progress_dst_repeated_midnight_hour_merges` | `America/Santiago`: `2026-04-05T02:30Z` (23:30 −03) → 5, `03:30Z` (23:30 −04, the same local day) → 10 | 1 row `04-04`, 10 pages | UTC label (MUT-01) → one row labelled `04-05`: `assert datetime.datetime(2026, 4, 5, 0, 0) == datetime.datetime(2026, 4, 4, 0, 0)` | Major P1 |
| T-4C-P10 | `test_progress_dst_23_hour_day_is_one_label` | NY: `2026-03-08T05:00Z` (00:00 EST) → 5, `2026-03-09T03:59Z` (23:59 EDT) → 10 | 1 row `03-08`, 10 pages | UTC label (MUT-01) → rows `03-08` and `03-09`: `assert 2 == 1`; a fixed EST offset → the second write is labelled `03-09`: `assert 2 == 1` | Major P1 |
| T-4C-P11 | `test_progress_ownership_unchanged_with_header` | A's userbook; B sends `PUT /userbooks/{A_ub}/progress {"current_page": 50}` with `Asia/Tokyo` | 404 `{"detail":"UserBook not found"}`; A's userbook `current_page` unchanged; 0 `ReadingActivity` rows for A's userbook from this call; A's zone unchanged | the owner check removed → `assert 200 == 404` | Critical P0 |

### 2.5 Every "today" read — `TestReadDays` (R-03, R-04)

| # | Pytest | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| T-4C-R1 | `test_daily_ends_at_callers_local_today` | `2026-09-17T19:00`; IST and NY users; `/daily?days=2` | IST `["2026-09-17","2026-09-18"]`; NY `["2026-09-16","2026-09-17"]` | UTC `end_date` (MUT-04) → `assert '2026-09-17' == '2026-09-18'` | Critical P0 |
| T-4C-R2 | `test_user_daily_ends_at_subjects_today` | subject S stored IST (public); viewer V with `America/New_York` header; `GET /reading-activity/user/{S}/daily?days=2` | last `"2026-09-18"` (S's day); V's own `/daily` last `"2026-09-17"` | viewer's zone (MUT-19) → `assert '2026-09-17' == '2026-09-18'` | Critical P0 |
| T-4C-R3 | `test_insights_finished_this_year_local_year` | book finished: seed the userbook `status="finished"`, `updated_at=datetime(2026,12,31,20,0)`; `freeze_at("2027-01-01T02:00")`; IST user vs UTC user with the same seed | IST `finished_this_year == 1` and `books_this_year == 1`; UTC `0` and `0` | `ub.updated_at.date()` (MUT-06) → `assert 0 == 1` | Critical P0 |
| T-4C-R4 | `test_user_stats_this_year_uses_subjects_zone` | the R3 seed on two subjects: S1 stored IST, S2 stored UTC. Viewer V1 (header `UTC`) reads S1; viewer V2 (header `Asia/Kolkata`) reads S2; `freeze_at("2027-01-01T02:00")` | S1 `this_year == 1`, S2 `this_year == 0`; both `last_month == 1` (a rolling 30 days, D-8) | viewer's zone (MUT-20) → `assert 0 == 1` | Critical P0 |
| T-4C-R5 | `test_projected_finish_counts_from_local_today` | IST and UTC users, `freeze_at("2026-09-17T19:00")`; userbook reading, total 300, `current_page` 100 (direct DB); seed a row labelled `09-18` with 300 pages | IST `projected_finish == "2026-10-08"` and `days_left == 20` (avg 10.0); UTC `"2026-10-07"` | UTC `today` (MUT-05) → `assert '2026-10-07' == '2026-10-08'` | Major P0 |
| T-4C-R6 | `test_monthly_pages_ends_at_local_month` | `2026-09-30T19:00`; IST and UTC users | `monthly_pages[-1]["month"]`: IST `"2026-10"`, UTC `"2026-09"`; every entry's keys are exactly `{month, pages_read}` | MUT-05 → `assert '2026-09' == '2026-10'` | Major P0 |
| T-4C-R7 | `test_on_track_uses_local_day_of_year` | `yearly_goal=12`, 0 finished; `2026-12-31T20:00`; IST and UTC users | IST `yearly_goal.on_track is True` (day 1 of 2027); UTC `False` (day 365) | UTC `day_of_year` → `assert False is True` | Major P1 |
| T-4C-R8 | `test_avg_pages_30_day_window_local` | `2026-09-17T19:00`; seed labels `08-19` (30 pages) and `08-18` (300 pages) for IST and for UTC | IST `avg_pages_per_day == 1.0`; UTC `11.0` | UTC `today` → `assert 11.0 == 1.0` | Major P1 |
| T-4C-R9 | `test_user_daily_privacy_gate_unchanged` | S private; W not following; F following; both send `Asia/Tokyo` | W 403 `{"detail":"This profile is private"}`; F 200; S's own 200 | gate removed → `assert 200 == 403` | Critical P0 |
| T-4C-R10 | `test_user_stats_privacy_gate_unchanged` | the same on `/users/{S}/stats` | W 403, F 200 | gate removed → `assert 200 == 403` | Critical P0 |

### 2.6 The cut-over bridge (E-2, R-06) — `TestCutoverBridge`

The reader is IST (stored) unless stated. Seeded rows have 10 pages each.

| # | Pytest | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| T-4C-B0 | `test_cutover_bridge_unit` | `_cutover_bridge(old, new)` | `(∅, {d}) → ∅`; `({d}, ∅) → ∅`; gap 1 `→ ∅`; gap 2 `→ {last_old+1}`; gap 3 `→ ∅`; `min(new) < max(old)` `→ ∅` | `== 2` → `>= 2` (MUT-08) → `assert {datetime.date(2026, 9, 16)} == set()` | Major P0 |
| T-4C-B1 | `test_bridge_fills_the_one_cutover_day` | old `09-14`, `09-15`, `09-16` (`None`); new `09-18` (`True`); `freeze_at("2026-09-18T10:00")` | `current_streak == 5`, `longest_streak == 5` | bridge dropped from `streak_dates` (MUT-07) → `assert 1 == 5` | Major P0 |
| T-4C-B2 | `test_no_bridge_across_three_day_gap` | old `09-15`, new `09-18` | `current_streak == 1`, **`longest_streak == 1`** | MUT-08 → `assert 2 == 1` (on longest) | Major P0 |
| T-4C-B3 | `test_no_bridge_between_two_new_rows` | new `09-16`, `09-18` | `current_streak == 1`, `longest_streak == 1` | bridge computed over all labels → `assert 3 == 1` | Major P0 |
| T-4C-B4 | `test_no_bridge_without_new_rows` | old `09-16` only; today `09-18` | `current_streak == 0`, `longest_streak == 1` | the bridge also fires when `new` is empty → `assert 1 == 0` | Major P1 |
| T-4C-B5 | `test_bridge_touches_streaks_only` | B1's data | `/daily?days=7`: `09-17` has `pages_read == 0`; `monthly_pages` for `2026-09` is 40; `avg_pages_per_day == 1.3` | bridge day added to `activities` → `assert 10 == 0` | Critical P0 |
| T-4C-B6 | `test_future_row_west_excluded_from_today_and_streaks` (K-08) | NY; old `09-19` (`None`, 5), new `09-18` (`True`, 7); `freeze_at("2026-09-18T20:00")` | `current_streak == 1`; **`longest_streak == 1`** (K-08); `/daily?days=3` has no `"2026-09-19"` and last `{"date":"2026-09-18","pages_read":7}`; `monthly_pages` `2026-09` is 12 | future labels kept in `streak_dates` (MUT-52) → `assert 2 == 1` | Major P0 |
| T-4C-B7 | `test_bridge_at_most_once` | old `09-10..09-12`; new `09-14`, `09-16`, `09-17`; `freeze_at("2026-09-17T10:00")` | `current_streak == 2` (`09-15` **not** bridged), `longest_streak == 5` (`09-10..09-14` with the bridge) | a bridge for every 2-day gap → `assert 8 == 2` | Major P0 |

### 2.7 Travel (D-7, E-6) — `TestTravel`

| # | Pytest | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| T-4C-T1 | `test_flying_west_new_row_and_future_row_excluded` | at `2026-09-18T19:00Z`: PUT → 5 with `Asia/Kolkata` (label `09-19`), then PUT → 8 with `Europe/London` (20:00 on 09-18). `/daily?days=2` and `/insights` with London | 2 rows: `09-19` (5, `True`) and `09-18` (3, `True`); `/daily` = `[{"2026-09-17",0},{"2026-09-18",3}]`; `current_streak == 1`; the sum over rows is 8 (no double count) | MUT-02 → the London write merges into `09-19`: `assert 1 == 2` | Critical P0 |
| T-4C-T2 | `test_flying_east_gap_not_forgiven` (E-6) | NY at `2026-09-17T02:00Z` (22:00 EDT on 09-16) → 5 (`09-16`); then `Asia/Kolkata` at `2026-09-18T15:00Z` → 10 (`09-18`) | `/insights` (IST) `current_streak == 1`, `longest_streak == 1`; stored zone `Asia/Kolkata` | bridge ignoring `local_day` → `assert 3 == 1` | Major P1 |

### 2.8 Reminders and caps — `tests/test_scheduler.py` (R-11, R-12, E-5)

- The existing `scheduler_env` fixture is kept.
- `_inactive_user(db, email, token, zone=None, last_active=<frozen − 2 days>)` gains `zone` and takes `last_active` from the frozen instant.
- Every case calls `freeze_at`.
- The **8 existing tests** keep their names; each gets `freeze_at("<pinned date>T14:30:00")` (N9).

| # | Pytest | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| T-4C-N1 | `test_reminder_never_reported_reader_at_1430_utc` | u1 never reported, and u3 stored `Mars/Olympus`; run at `2026-09-18T14:15` → then `14:30`. Fresh u2 never reported; run at `16:30` | u1: 0 rows after 14:15 and 1 after 14:30; u3: 1 after 14:30 (invalid → IST); u2: 0 rows at 16:30 (22:00 exclusive) | window removed (MUT-28) → `assert 1 == 0` at 14:15; end `<= 22` (MUT-31) → u2 `assert 1 == 0`; MUT-18 → u1 0 rows at 14:30 | Critical P0 |
| T-4C-N2 | `test_reminder_kathmandu_offset` | NPT user a: runs at `14:00` → 0 rows, then `14:15` → 1 row. Fresh NPT user b: run at `16:00` (21:45 NPT) → 1 row. Fresh NPT user c: run at `16:15` (22:00 NPT) → 0 rows | as stated | `zone_of(None)` for everyone (MUT-29) → `assert 0 == 1` at 14:15 | Critical P0 |
| T-4C-N3 | `test_reminder_new_york_evening` | NY user: `2026-09-18T14:30` → 0; `2026-09-19T00:00` (20:00 EDT) → 1 | as stated | MUT-29 → `assert 1 == 0` at 14:30 | Critical P0 |
| T-4C-N4 | `test_reminder_f62_regression_active_after_ist_midnight` | IST, `last_active = datetime(2026,9,17,19,0)` (00:30 IST on 09-18); run at `2026-09-18T14:30` | 0 rows; `u.id not in` the `fire_event` spy's recipients | UTC date compare (MUT-32) → `assert 1 == 0` | Critical P0 |
| T-4C-N5 | `test_reminder_catch_up_and_once_per_local_day` | IST; runs at `15:45`, `16:00`, `16:15` (21:15–21:45 IST), then `2026-09-19T14:30` | 1 row after the three runs, `sent_at == datetime(2026,9,18,15,45)`; 2 rows after the next day | `wall.hour == 20` (MUT-30) → `assert 0 == 1` | Critical P0 |
| T-4C-N6 | `test_reminder_dst_fall_back_new_york` | `2026-11-02T00:00` (19:00 EST) → 0; `01:00` (20:00 EST) → 1 | as stated | fixed EDT offset → `assert 1 == 0` at 00:00 | Major P1 |
| T-4C-N12 | `test_reminder_dst_spring_forward_new_york` | `2026-03-08T23:45` (19:45 EDT) → 0; `2026-03-09T00:00` (20:00 EDT) → 1 | as stated | fixed EST offset → `assert 0 == 1` at 00:00 | Major P1 |
| T-4C-N7 | `test_reminder_query_shape_no_n_plus_one` (K-09b) | 20 fresh IST push users, inactive; `freeze_at("…T14:30")`; spy `sched.fire_event` (records `recipient_ids`, returns `{"sent": 0}`); `stmt_counter` | SELECT count during the run **== 3**; the spy's recipients ⊇ the 20 ids; with a 21st test run of 1 fresh user, still **== 3** | bulk `IN()` load replaced by per-user `db.get` (MUT-34) → `assert 22 == 3` | Major P1 |
| T-4C-N8 | `test_cap_book_completed_uses_recipient_local_day` | actor A; recipient B stored IST; `fire_event("book_completed", actor_id=A, recipient_ids=[B], extra={"book_title":"x"})` at `2026-09-18T17:30` (23:00 IST) and `19:00` (00:30 IST on 09-19). Recipient C stored IST: `04:30` and `12:30` | B: 2 NotificationLog rows; C: 1 row | cap back to `date.today()` midnight (MUT-36) → C `assert 2 == 1`; no `sent_at=now` (MUT-38) → B `assert 1 == 2` | Critical P0 |
| T-4C-N8b | `test_cap_uses_recipients_zone_not_actors` | actor A stored `America/New_York`; recipient D stored IST; the same two instants as B | D: 2 rows | actor's zone (MUT-37) → `assert 1 == 2` | Critical P0 |
| T-4C-N10 | `test_job_registered_every_15_minutes` | `monkeypatch.setattr(sched, "scheduler", AsyncIOScheduler(timezone="UTC"))`, patch its `start` to a no-op; `start_scheduler()` twice | `len(scheduler.get_jobs()) == 1`; `job.id == "inactivity_reminder"`; `"minute='0,15,30,45'"` in `str(job.trigger)`; `str(job.trigger.timezone) == "UTC"`; `job.coalesce is True`; `job.max_instances == 1`; `job.misfire_grace_time == 600`. Nothing started | cron back to `hour=14, minute=30` (MUT-35) → `assert "minute='0,15,30,45'" in "cron[hour='14', minute='30']"` | Critical P0 |
| T-4C-N11 | `test_restart_does_not_double_send` | IST user; run at `14:30` (1 row); `importlib.reload(sched)`, re-apply the `engine` patch, spy `sched.fire_event`; run at `15:00`; teardown reloads `sched` again | still 1 row; `u.id not in` the spy's recipients (the pre-filter used the NotificationLog, not memory) | pre-filter removed (MUT-33): the cap keeps 1 row, but `assert u.id not in [...]` fails | Critical P0 |
| (N9) | the 8 existing tests | under `freeze_at("<pinned date>T14:30")` | unchanged assertions; `test_inactivity_reminder_skips_user_active_today` uses `last_active = frozen − 1 h`; `…daily_cap_prevents_second_send` makes two runs at the same frozen instant → 1 row | — | Critical P0 |

**E-5 (no keep-alive)** is ST-03. The scheduler's only trigger is N10's cron.

### 2.9 Schema guard and migration (R-14) — `TestSchemaGuard`, `tests/test_sql_artifacts.py::TestMigration4C`

| # | Pytest | Arrange / act | Assert | Mutation → first red line | Sev / Pri |
|---|---|---|---|---|---|
| T-4C-G1a | `test_guard_skips_sqlite_without_query` | stub engine `dialect.name="sqlite"`, `connect` spy | returns; `connect` called 0 times | — | Major P1 |
| T-4C-G1b | `test_guard_raises_naming_missing_column` | `"postgresql"`, rows `[("user","timezone"),("reading_activity","id")]` | `RuntimeError` whose message contains `reading_activity.local_day` and `supabase_migration.sql`, and not `user.timezone`; `connect` called 1 time | `REQUIRED_COLUMNS` missing `local_day` (MUT-43) → `DID NOT RAISE` | Critical P0 |
| T-4C-G1c | `test_guard_passes_when_both_present` | both rows present | returns `None` | — | Critical P0 |
| T-4C-G1d | `test_guard_fails_open_on_db_error` | `connect` raises `OperationalError("postgresql://user:SECRET@host")`; capsys | returns; output contains `[schema_guard] check skipped: OperationalError`, and not `SECRET`, `postgresql://` or `host` | re-raise (MUT-42) → `OperationalError` | Critical P0 |
| T-4C-G2 | `test_localday_refuses_import_without_tz_database` (K-19) | `subprocess.run([sys.executable, "-c", "import zoneinfo; zoneinfo.available_timezones=lambda: set(); import app.localday"], cwd=<repo>, env={**os.environ, "SECRET_KEY": "x"})` | `returncode != 0`; stderr contains `IANA tz database unavailable`. **Control:** the same command without the patch → returncode 0 | guard removed (MUT-44) → `assert 0 != 0` | Critical P1 |
| T-4C-G3 | `test_startup_refuses_before_scheduler_when_column_missing` (K-13) | monkeypatch `app.database.engine` → the G1b stub; `app.notifications.scheduler.start_scheduler` → spy; `with pytest.raises(RuntimeError): with TestClient(app): pass`. Then the G1c stub: `with TestClient(app): pass` | (1) raises, **and the spy was called 0 times**. (2) no raise; spy called 1 time | `assert_migrated(engine)` line deleted from `main.py` (MUT-41) → `DID NOT RAISE` | Critical P0 |
| T-4C-G4 | `test_required_columns_match_models` | `schema_guard.REQUIRED_COLUMNS` vs `SQLModel.metadata.tables` | contains `("user","timezone")` and `("reading_activity","local_day")`; each pair exists in the metadata; `User.__table__.c.timezone.type.length in (None, 64)` | a typo `("reading_activity","localday")` → `assert 'localday' in {...}` | Critical P0 |
| T-4C-Q1 | `test_4c_section_present_steps_in_order` | `_4c_section()` (bounded, K-15) | contains the `Sprint 4C` header; index(`STEP 1`) < index(`STEP 2`) < index(`ROLLBACK`) | — | Major P0 |
| T-4C-Q2 | `test_4c_step1_idempotent_exact` | STEP 1 with comments stripped, whitespace normalised | exactly two statements: `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS timezone VARCHAR(64)` and `ALTER TABLE reading_activity ADD COLUMN IF NOT EXISTS local_day BOOLEAN`; no `DEFAULT` | `IF NOT EXISTS` removed (MUT-46) → assertion on the statement text | Critical P0 |
| T-4C-Q3 | `test_4c_step2_read_only_verify` | STEP 2, comments stripped | no `WRITE` keyword; contains `information_schema.columns`, `current_schema()`, both column names, `WHERE timezone IS NOT NULL` and `WHERE local_day IS TRUE` | — | Major P0 |
| T-4C-Q4 | `test_4c_rollback_fully_commented` | the ROLLBACK part | comments stripped → empty; uncommented → exactly `DROP COLUMN IF EXISTS local_day` and `DROP COLUMN IF EXISTS timezone` | rollback uncommented (MUT-47) → `assert 'ALTER TABLE…' == ''` | Critical P0 |
| T-4C-Q5 | `test_4c_section_never_rewrites_rows` (R-05) | the whole 4C section, comments stripped | no `UPDATE`, `DELETE`, `INSERT`, `TRUNCATE`, `CREATE TABLE` | a backfill `UPDATE reading_activity SET local_day…` → match | Critical P0 |
| T-4C-Q6 | `test_4c_column_types_match_code` | parse `VARCHAR(\d+)` from STEP 1 | `== localday.MAX_ZONE_LEN == 64`; the column names equal `REQUIRED_COLUMNS` | `VARCHAR(32)` → `assert 32 == 64` | Major P1 |

### 2.10 Static rules — `TestStaticRules`

| # | Pytest | Assert | Non-vacuity control | Mutation | Sev / Pri |
|---|---|---|---|---|---|
| T-4C-S1 | `test_app_never_reads_a_local_clock` | an AST walk over `app/**/*.py` (not `*.bak`) finds no `date.today()`, `datetime.today()`, `datetime.now()` with no argument, `time.localtime()` with no argument, `datetime.fromtimestamp(x)` / `date.fromtimestamp(x)` with one argument, `time.mktime(…)` | (a) walked ≥ 40 files; (b) the same detector on the snippet `from datetime import date\nx = date.today()\ny = datetime.now()` reports exactly 2 hits | `date.today()` anywhere (MUT-40) → `assert [('app/…', 12)] == []` | Critical P0 |
| T-4C-S2 | `test_localday_utcnow_never_copied` | no `ImportFrom` of `utcnow` from `app.localday` / `..localday` / `.localday` in `app/` | the detector on `from ..localday import utcnow` → 1 hit | MUT-39 → `assert [...] == []` | Critical P0 |
| T-4C-S3 | `test_seam_used_in_every_4c_path` | in the 11 functions `update_progress`, `get_daily_reading_stats`, `get_reading_insights`, `get_user_daily_reading_stats`, `get_user_stats`, `get_current_user`, `google_auth`, `review_login`, `_check_daily_cap`, `fire_event`, `_send_inactivity_reminders`: no `datetime.utcnow()` call (only `localday.utcnow()`) | **all 11 function defs found** (`assert found == EXPECTED`) before checking | `datetime.utcnow()` back in `update_progress` → `assert ['update_progress'] == []` | Critical P0 |
| T-4C-S4 | `test_tzdata_pinned_utf16_requirements` | `requirements.txt` decoded as UTF-16 contains the line `tzdata==2026.2`; the file still starts with the UTF-16 LE BOM `FF FE`; `requirements.txt.txt` does not contain `tzdata` | the decode yields ≥ 5 lines including `fastapi==0.95.2` | line removed (MUT-45) → `assert 'tzdata==2026.2' in [...]` | Major P0 |

### 2.11 Clock independence (R-16, K-02, K-03) — `TestClockIndependence`

| # | Pytest | Arrange / act | Assert | Mutation | Sev / Pri |
|---|---|---|---|---|---|
| T-4C-C1..C5 | `test_subset_passes_under_tz[UTC0 \| IST-5:30 \| PST8PDT \| LIN-14 \| BIT+12]` | **Control:** a subprocess `python -c "import time;print(time.localtime().tm_gmtoff)"` with that `TZ` must print `0`, `19800`, `-25200` or `-28800`, `50400`, `-43200`, else fail `TZ=<x> not applied — this case would test nothing (K-02)`. Then a subprocess `pytest tests/test_local_day.py tests/test_scheduler.py tests/test_auth.py::TestReviewLogin -q -p no:cacheprovider -k "not TestClockIndependence"`, first with `--co -q` to read the `N tests collected` line | `returncode == 0`; the final line is `N passed` with the **same N** as collected; N ≥ 120 (73 + 20 + 33 expected) | `date.today()` reintroduced in `_check_daily_cap` or the scheduler → red under `LIN-14` or `BIT+12` at any wall time | Critical P0 |
| T-4C-C6 | `test_extreme_zones_reproduce_f62_now` | subprocesses under `LIN-14` and `BIT+12` print `date.today() != datetime.utcnow().date()` | at least one prints `True` (holds at every UTC hour, K-03) | — (it guards the guard) | Major P0 |

### 2.12 Existing tests the API package changes (no count change)

| File | Change | Why |
|---|---|---|
| `tests/conftest.py` | `pinned_now` (autouse, honours `BT_TEST_PIN_HOUR`), `freeze_at`, `stmt_counter` | architecture test strategy; K-04 |
| `tests/test_auth.py::TestReviewLogin::test_last_active_set_to_today` | assert `== pinned_now` | F-62 |
| `tests/test_scheduler.py` (8 tests) | `freeze_at` at 14:30Z; `_inactive_user` uses frozen − 2 days | architecture |
| `tests/test_follow_profile.py::test_profile_me_response_shape_unchanged` | add `"timezone"` with the comment `# Sprint 4C R-13` | the only additive key |
| `tests/test_reading_activity.py` `:86`, `:304`, `:330`, `:347-349` | "today" = `localday.local_today(localday.zone_of(None))` | architecture |

---

## 3. Package WEB — `book-tracker-frontend-stitch/` + `qa/unit/`

### 3.1 `qa/unit/localDate.test.mjs` (new; imports `src/utils/localDate.js` via `pathToFileURL`, like `navigation.test.mjs`)

- The file starts with an **import guard**: `assert.equal(typeof parseDayLabel, 'function')` and `assert.equal(typeof deviceTimeZone, 'function')`.
- Every TZ test sets `process.env.TZ` inside `try` and restores the saved value in `finally`.

| # | `test(…)` name | Assert | Control / non-vacuity | Mutation → red | Sev / Pri |
|---|---|---|---|---|---|
| W-01 | `device_zone_is_a_string_under_node` | `typeof deviceTimeZone() === 'string'`, length 1..64 | — | — | Major P1 |
| W-02 | `device_zone_null_for_bad_intl` | stub Intl whose zone is `undefined`, `''`, a 65-character string, or which throws in `resolvedOptions` → `null` each | the stub returning `'Asia/Tokyo'` → `'Asia/Tokyo'` | no length cap (MUT-W3) → `'AAAA…' !== null`; no try/catch (MUT-W4) → throws | Major P0 |
| W-03 | `parse_day_label_is_local_west_of_utc` | TZ `America/Los_Angeles`: `parseDayLabel('2026-10-03')` → year 2026, month 9, date 3, hours 0 | `new Date('2026-10-03').getDate() === 2` **must hold**, else fail `TZ injection did not take effect` | `new Date(s)` (MUT-W1) → `2 !== 3` | Critical P0 |
| W-04 | `parse_month_label_is_first_of_month_local` | TZ LA: `parseDayLabel('2026-10')` → Oct 1 local, 00:00 | `new Date('2026-10').getMonth() === 8` | `m[3] ? +m[3] : 1` → `+m[3]` (MUT-W2) → `NaN` | Major P0 |
| W-05 | `parse_day_label_rejects_bad_input` | `null`, `undefined`, `20261003`, `''`, `'2026-1-3'`, `'2026-10-03T00:00:00Z'`, `'03/10/2026'`, `' 2026-10-03'` → `null` | — | regex without anchors → a `Date` is returned | Minor P2 |
| W-06 | `api_fetch_raw_sends_x_timezone_per_request` | the text slice of `src/services/api.js` from `async function apiFetchRaw` to the first `\n}\n` after it contains `deviceTimeZone()` and `'X-Timezone'`; `import { deviceTimeZone } from '../utils/localDate'` is present; **outside** the slice, no `deviceTimeZone(` call | the slice was found and is > 200 characters, else fail `apiFetchRaw not found` | header line deleted (MUT-W5); `const tz = deviceTimeZone()` hoisted to module scope (MUT-W6) → the "outside the slice" assertion fails | Critical P0 |
| W-07 | `device_zone_nepal_and_legacy_ids` | TZ `Asia/Kathmandu` → ∈ {`Asia/Kathmandu`, `Asia/Katmandu`}; TZ `Asia/Kolkata` → ∈ {`Asia/Kolkata`, `Asia/Calcutta`} (K-06) | the TZ switch changes `new Date(0).getTimezoneOffset()` to −345 / −330 | — | Major P1 |
| W-08 | `device_zone_read_at_call_time` | swap `globalThis.Intl` to a stub for `'Europe/London'`, call; swap to `'Asia/Tokyo'`, call → the two values differ; restore `Intl` | — | zone cached at module load → `'Europe/London' !== 'Asia/Tokyo'` | Major P1 |
| W-09 | `raw_fetch_sites_are_exactly_three` (K-07) | `api.js` has exactly 4 `fetch(` calls: `apiFetchRaw` plus `/profile/me/picture`, `/notes/upload-image`, `/import/goodreads` | — | a new raw fetch (MUT-W9) → `5 !== 4` | Minor P2 |
| W-10 | `privacy_page_states_zone_sentence` (E-4) | `src/pages/PrivacyPage.jsx`, whitespace-normalised, contains `We store your device's time zone to work out your reading days and when to send reminders.` exactly once | — | wording changed (MUT-W8) → `0 !== 1` | Major P0 |
| W-11 | `insights_page_parses_projected_finish_locally` | `InsightsPage.jsx` imports `parseDayLabel` from `'../utils/localDate'`, contains `parseDayLabel(p.projected_finish)`, and no `new Date(p.projected_finish` | the file was read and contains `projected_finish` | revert `:190` (MUT-W7) → match | Critical P0 |

### 3.2 `qa/web_4c_local.mjs` (new, QA-owned; same shape as `qa/web_4a_local.mjs`)

- **Setup:**
  - `--web http://127.0.0.1:5174 --api http://127.0.0.1:8765`.
  - Exit 5 on a `trackmyread.com` / `onrender.com` host, and exit 6 on a missing precondition, exactly as 4A (K-21 of 4A).
  - **Extra precondition:** the local `book_tracker.db` has both 4C columns. The harness checks `GET <api>/profile/me` has a `timezone` key after review-login, else exit 6 with `run the two SQLite ALTERs (architecture "app/models.py")`.
- **Browser contexts:** `browser.newContext({ timezoneId })`.
- **Output:** one line per case, then `4C web local: <n> passed, <m> failed`.
- The 60 s SWR cache can serve a stale response (lesson 3). So every case starts from a **fresh context**, and header assertions read **network requests** (`page.on('request')`), never cached data.

| # | Case | Steps | Expected | Mutation | Sev / Pri |
|---|---|---|---|---|---|
| L-4C-01 | every app request carries the device zone | context `America/Los_Angeles`, review.reader; visit `/home`, `/library`, `/insights`, `/profile`; record requests to `<api>` | ≥ 8 non-OPTIONS requests, **all** with `x-timezone: America/Los_Angeles`; every OPTIONS preflight returned 2xx; no `requestfailed` and no console CORS error | MUT-W5 → `/profile/me` without the header | Critical P0 |
| L-4C-02 | the stored zone follows the browser | after L-4C-01, Node `fetch(<api>/profile/me)` with the reader's token and **no** header; then a new context `Asia/Kolkata`, visit `/home`, fetch again | first `America/Los_Angeles`; then ∈ {`Asia/Kolkata`, `Asia/Calcutta`} (K-06). The reader ends in an India zone (restored) | persistence removed (MUT-11) → `null` | Critical P0 |
| L-4C-03 | Insights dates are calendar days west of UTC | context `America/Los_Angeles`; `page.route('**/reading-activity/insights', …)` fulfils a full-key fixture with `projected_finishes[0].projected_finish = "2026-10-03"`, `days_left = 14`, `monthly_pages` ending `{"month":"2026-10"}`; open `/insights`; save a screenshot `qa/screenshots/4c-local/insights-la.png` for a human (F-65 lesson) | the projection row shows `Oct 3` and never `Oct 2`; the last month label is `Oct`. **Controls:** `page.evaluate(() => new Date('2026-10-03').getDate()) === 2`, and `Intl…timeZone === 'America/Los_Angeles'` | MUT-W7 → `Oct 2` | Critical P0 |
| L-4C-04 | the same east of UTC | context `Asia/Kathmandu`, the same fixture | `Oct 3`; control `new Date('2026-10-03').getDate() === 3` | — | Major P1 |
| L-4C-05 | the Privacy sentence renders (E-4) | logged out, `/privacy` | the page's `innerText` contains the W-10 sentence exactly once | MUT-W8 | Major P0 |

### 3.3 WEB static

- **ST-04:** `npm --prefix book-tracker-frontend-stitch run build` exits 0.
- **ST-05:** `npx eslint src/utils/localDate.js src/services/api.js src/pages/InsightsPage.jsx src/pages/PrivacyPage.jsx` (from `book-tracker-frontend-stitch/`). Compare with the same command on the rebased base: **no new problem** in those 4 files, and **0** in `localDate.js`.

---

## 4. Package ANDROID — `book-tracker-mobile-stitch/`

### 4.1 `__tests__/localDate.test.mjs` (new; imports `../src/services/localDate.js` directly; AST via `_ast.mjs`)

The file starts with the same import guard as W-*.

| # | `test(…)` name | Assert | Control | Mutation → red | Sev / Pri |
|---|---|---|---|---|---|
| M-01 | `device_zone_is_a_string_under_node` | as W-01 | — | — | Major P1 |
| M-02 | `device_zone_null_for_bad_intl` | as W-02 | as W-02 | as W-02 | Major P0 |
| M-03 | `parse_day_label_is_local_west_of_utc` | as W-03 | as W-03 | `new Date(s)` (MUT-M1) → `2 !== 3` | Critical P0 |
| M-04 | `parse_month_label_is_first_of_month_local` | as W-04 | as W-04 | as W-04 | Major P0 |
| M-05 | `parse_day_label_rejects_bad_input` | as W-05 | — | — | Minor P2 |
| M-06 | `days_until_fall_back_25_hour_day` | TZ `America/New_York`: `daysUntil('2026-11-02', new Date(2026,10,1,23,0)) === 1` | the old formula `Math.ceil((new Date('2026-11-02') - now)/864e5)` gives ≤ 0 at that instant | `Math.round` → `Math.ceil` (MUT-M2) → `2 !== 1` | Critical P0 |
| M-07 | `days_until_spring_forward_23_hour_day` | TZ NY: `daysUntil('2026-03-09', new Date(2026,2,8,12,0)) === 1` | `(new Date(2026,2,9) - new Date(2026,2,8)) / 36e5 === 23` | `Math.round` → `Math.floor` (MUT-M3) → `0 !== 1` | Critical P0 |
| M-08 | `days_until_today_past_and_bad` | `daysUntil(<today's label>, now) === 0`; yesterday → −1; `'x'` → `null` | — | — | Minor P2 |
| M-09 | `request_interceptor_sets_x_timezone_per_request` | AST of `src/services/api.js`: find the `CallExpression` whose callee is **`api.interceptors.request.use`** (not `response`, lesson 1). Its first argument's body contains a `deviceTimeZone()` call and an assignment to `config.headers['X-Timezone']`, inside an `if` whose test is the variable bound to that call. `import { deviceTimeZone } from './localDate'` is present | exactly 1 request interceptor found; the same walker on a synthetic snippet with the assignment in the **response** interceptor reports 0 | line removed (MUT-M4); call hoisted to module scope (MUT-M5) → `0 !== 1` | Critical P0 |
| M-10 | `insights_screen_parses_labels_locally` | AST of `src/screens/InsightsScreen.js`: the function declarations `shortMonth`, `shortDate` and `daysLeft` **all found**; none contains `new Date(<argument>)`; `shortMonth` / `shortDate` call `parseDayLabel`; `daysLeft` calls `daysUntil` | found count `=== 3` | revert `shortDate` (MUT-M6) → `1 !== 0` | Critical P0 |
| M-11 | `local_date_module_is_import_free` | `src/services/localDate.js` has no `ImportDeclaration` and no `require(` | parsed OK, ≥ 3 exports | an import added (MUT-M7) → `1 !== 0` | Major P1 |
| M-12 | `app_json_is_2_2_3_62` (R-17) | `expo.version === '2.2.3'`, `expo.android.versionCode === 62` | — | `2.2.2` / `61` (MUT-M8) | Major P0 |
| (changed, K-11) | `versionGuard.test.mjs::committed_tree_passes_strict` | the expected numbers are read from `app.json` and `release/last-released.json`, not the literals `/61/` and `/60/` | — | — | Major P0 |

The existing `apiContract.test.mjs::named_imports_resolve_to_real_exports` also covers the new `./localDate` import (lesson 2: an import of a non-existent name). It must stay green.

### 4.2 Device checks (PM, on the 2.2.3 test APK and on a 2.2.2 phone) — section 7, D-4C-01..04.

---

## 5. Local PostgreSQL harness — `qa/pg_4c_migration.py` (QA-owned, K-14)

- **Preconditions (exit 6 naming the missing one):** `initdb`, `pg_ctl`, `psql` on PATH; `.venv` has psycopg2.
- **Setup:**
  - Cluster in `<scratchpad>/qa-4c-pg` on port **55432** (`initdb -U qa -A trust -E UTF8`), database `bt4c`.
  - Tables come from the **4C** `SQLModel.metadata.create_all`, then `ALTER TABLE reading_activity DROP COLUMN local_day; ALTER TABLE "user" DROP COLUMN timezone;`. That is the pre-4C production shape.
  - The app runs as `.venv\Scripts\python -m uvicorn app.main:app --port 8766` with `DATABASE_URL=postgresql://qa@127.0.0.1:55432/bt4c` and `SECRET_KEY=qa-4c-pg`.
  - The STEP 1, STEP 2 and ROLLBACK blocks are **extracted from `context/supabase_migration.sql`**, not retyped.
- **Teardown:** `pg_ctl stop` and delete the directory.
- **Output:** one line per case, then `4C pg local: <n> passed, <m> failed`.

| # | Case | Expected | Proves |
|---|---|---|---|
| G-PG-1 | start the app on the pre-4C schema | exits within 60 s with **code 3**; stderr contains `Migration not applied — missing column(s): user.timezone, reading_activity.local_day` and `Application startup failed. Exiting.`; stdout has **no** `[scheduler] Started` | R-14 refuse-to-start on real PostgreSQL (MUT-41 → the process stays up) |
| G-PG-2 | apply only the `"user"` ALTER, then start | code 3; the message names only `reading_activity.local_day` | per-column detection |
| G-PG-3 | STEP 1 via `psql -v ON_ERROR_STOP=1`, **twice** | both exit 0; the second prints `already exists, skipping` twice | idempotency (MUT-46 → the second run fails) |
| G-PG-4 | STEP 2 | the first SELECT is exactly `reading_activity\|local_day\|boolean\|YES` and `user\|timezone\|character varying\|YES`; both counts `0` | the PM's G-4C-01 output, rehearsed |
| G-PG-5 | start the app | `GET /version` 200 within 60 s; stdout has `[scheduler] Started — inactivity reminder runs every 15 min` | the happy path |
| G-PG-6 | real-PostgreSQL round trip (A-6) | insert a user by SQL; token = `app.auth.create_access_token({"sub": email})`. `GET /profile/me` with `X-Timezone: America/New_York` → `"timezone":"America/New_York"`; `psql … SELECT timezone` equals it. `POST /books/add-to-library` + `PUT progress` 10, then 15 → one `reading_activity` row with `local_day = t`, `date` = midnight of the run's NY date, `pages_read = 15` | the unquoted `timezone` column, the `BOOLEAN`, and the half-open range on a PostgreSQL `timestamp` |
| G-PG-7 | stop PostgreSQL, start the app | the app **starts** (`/version` 200 within 60 s); the log contains `[schema_guard] check skipped: OperationalError` and not `55432`, `qa@` or `postgresql://` | fail-open without leaking the DSN (MUT-42) |
| G-PG-8 | restart PostgreSQL; run the ROLLBACK block uncommented, then start the app; then STEP 1 again | rollback exit 0 → code 3 → after STEP 1 the app starts | the rollback SQL is valid and reversible |

**Not testable locally (stated plainly):**
- Supabase's pooler session `current_schema()`: covered by G-4C-02.
- Render keeping the previous deploy on a startup exit (A-1): the PM confirms, and G-4C-13 checks.
- Lock time on production-size tables: the metadata-only `ALTER` in PostgreSQL 11+; STEP 2 timing is observed.
- Supabase's PostgreSQL major version differs from the local 18: `ADD COLUMN IF NOT EXISTS` exists since 9.6.

---

## 6. Migration and deploy-order gates

Run in order; a failing gate stops the release. Commands run from the repo root of the tree named.

| # | Gate | When | Command | Exact expected output | Sev |
|---|---|---|---|---|---|
| G-4C-00 | Preconditions (architecture G-0) | before G-4C-01 | `curl -s https://book-tracker-stitch.onrender.com/version`; `git tag -l android-2.2.2`; `git show android-2.2.2:book-tracker-mobile-stitch/app.json` | `commit` = the 4A release SHA; the tag exists; that `app.json` has `"version": "2.2.2"` and `"versionCode": 61` | Critical P0 |
| G-4C-01 | 4C SQL in Supabase (PM) | before the merge | STEP 1, then STEP 2 of the 4C section | STEP 1: no error (a re-run prints NOTICEs only). STEP 2: exactly 2 rows, `reading_activity \| local_day \| boolean \| YES` and `user \| timezone \| character varying \| YES`; `users_with_zone = 0`; `local_day_rows = 0`. **The PM sends the output** | Critical P0 |
| G-4C-02 | The guard sees what the app will see | right after G-4C-01 | Supabase: `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ANY(ARRAY['user','reading_activity']) AND column_name IN ('timezone','local_day');` and `SELECT current_schema();` | 2 rows; `current_schema` = `public` | Critical P0 |
| G-4C-03 | Backend suite | rebased branch, then the merged tree | `.venv\Scripts\python -m pytest tests -q` | final line **`529 passed`**, 0 failed, 0 errors (430 + 99). K-01 rule for the one known flake | Critical P0 |
| G-4C-04 | Clock and zone independence (K-03, K-04) | same tree, **between 05:30 and 23:30 IST** | Git Bash: `TZ=LIN-14 BT_TEST_PIN_HOUR=0 .venv/Scripts/python -m pytest tests -q` then `TZ=BIT+12 BT_TEST_PIN_HOUR=18 .venv/Scripts/python -m pytest tests -q` | each **`529 passed`**. Before each run, `TZ=<x> .venv/Scripts/python -c "import time;print(time.localtime().tm_gmtoff)"` prints `50400` / `-43200` (else the run tested nothing) | Critical P0 |
| G-4C-05 | Real-PostgreSQL migration and guard | same tree | `.venv\Scripts\python qa/pg_4c_migration.py` | 8 `PASS G-PG-n` lines, then **`4C pg local: 8 passed, 0 failed`**; exit 0. Exit 6 is not a pass | Critical P0 |
| G-4C-06 | Static | same tree | ST-01..ST-03, ST-06..ST-08 below | as stated | Critical P0 |
| G-4C-07 | Web unit | same tree | `node --test "qa/unit/*.test.mjs"` | `# pass 25`, `# fail 0` | Critical P0 |
| G-4C-08 | Web build and lint | same tree | ST-04, ST-05 | exit 0; no new lint problem in the 4 files | Critical P0 |
| G-4C-09 | Web local behaviour | local API on the tree (ALTERed `book_tracker.db`) + `npm --prefix book-tracker-frontend-stitch run dev -- --mode localapi --port 5174` | `node qa/web_4c_local.mjs` then `node qa/web_4a_local.mjs` | `4C web local: 5 passed, 0 failed`, then `4A web local: 25 passed, 0 failed`; both exit 0 | Critical P0 |
| G-4C-10 | Android node | `book-tracker-mobile-stitch/` after `npm ci` | `node --test "__tests__/*.test.mjs"` | `# pass 113`, `# fail 0`, `# skipped 0` | Critical P0 |
| G-4C-11 | Mutation proof | before the merge | section 9 | every row filled: the red line recorded, `caught = yes`, restored, and the suite green again | Critical P0 |
| G-4C-12 | Dependency map | after the merge | `python scripts/gen_dependency_map.py && git diff --stat dependency-map.md` | exit 0; the generated appendix has **no row changes** (no route or client function added); the curated edits are the architecture's six **(4C — in build)** items | Major P0 |
| G-4C-13 | Backend live | after the Render deploy | `curl -s <api>/version`; Render log | `commit` = the merge SHA. The log has `Started — inactivity reminder runs every 15 min`, **no** `Migration not applied`, and (record, not fail) no `[schema_guard] check skipped` | Critical P0 |
| G-4C-14 | Android build order | after G-4C-13 + P-4C-01..06 | "Build Stitch AAB (Production)" | the strict guard passes (62 > the last released); built only after G-4C-13 | Critical P0 |

**Static commands (ST), run from the repo root:**
- **ST-01 (grep proof):** `grep -rn "date\.today(\|datetime\.today(\|datetime\.now()" app --include=*.py` → **no output**.
- **ST-02 (files not touched):** `git diff --stat origin/master...HEAD -- app/routers/groups_router.py app/routers/admin_router.py app/notifications/router.py app/notifications/config.py app/auth.py app/crud.py app/group_activity.py app/routers/import_router.py app/routers/notes_router.py app/routers/books_router.py app/routers/push_router.py app/routers/meta_router.py requirements.txt.txt book-tracker-frontend-stitch/src/pages/BookDetailPage.jsx book-tracker-frontend-stitch/src/components/BookPreviewModal.jsx book-tracker-frontend-stitch/src/pages/LibraryPage.jsx book-tracker-frontend-stitch/src/pages/ProfilePage.jsx book-tracker-frontend-stitch/src/pages/UserProfilePage.jsx book-tracker-mobile-stitch/App.js book-tracker-mobile-stitch/src/screens/BookDetailScreen.js book-tracker-mobile-stitch/src/screens/ProfileScreen.js book-tracker-mobile-stitch/src/screens/UserProfileScreen.js book-tracker-mobile-stitch/src/services/httpPolicy.js book-tracker-mobile-stitch/release/last-released.json` → **empty**. This includes E-3: circle months stay UTC.
- **ST-03 (E-5):** `git diff --name-status origin/master...HEAD -- .github/` → **empty**.
- **ST-06 (models):** `git diff origin/master...HEAD -- app/models.py | grep "^[+-][^+-]"` → only the two field lines and the `date` comment.
- **ST-07 (package disjointness):** each file in `git diff --name-only` belongs to exactly one package list (architecture), plus K-11's `versionGuard.test.mjs` and K-12's `PrivacyPage.jsx`.
- **ST-08 (requirements parse):** `.venv\Scripts\python -c "print(open('requirements.txt',encoding='utf-16').read().count('tzdata==2026.2'))"` → `1`.

---

## 7. Production checks after deploy, and device checks

Every case obeys `qa/RULES_OF_ENGAGEMENT.md`:
- Only rows of 110 (review.reader) and 111 (review.friend) are mutated.
- No token, secret or `Authorization` header is ever printed.
- `<api>` = `https://book-tracker-stitch.onrender.com`, `<web>` = `https://www.trackmyread.com`.
- SQL is **read-only** and run by the PM in the Supabase SQL Editor.

| # | Check | How | Expected | Sev / Pri |
|---|---|---|---|---|
| P-4C-00 | "Before" numbers (PM, **immediately before** the backend deploy) | `SELECT max(id) AS max_id, count(*) AS n, sum(pages_read) AS pages FROM reading_activity;`. As review.reader: `GET /reading-activity/daily?days=200` sum and `/insights` `monthly_pages` sum | recorded in the run ledger; used by P-4C-09 and P-4C-10 | Critical P0 |
| P-4C-01 | Right build, guard quiet | = G-4C-13 | as G-4C-13 | Critical P0 |
| P-4C-02 | Header stored (Done item 1, first half) | `curl -s -H "Authorization: Bearer $T" -H "X-Timezone: Asia/Kolkata" <api>/profile/me` | 200, `"timezone": "Asia/Kolkata"` | Critical P0 |
| P-4C-03 | Garbage ignored and never logged (Done item 3) | the same with `../../etc/passwd`, then `Mars/Olympus`, then 65 × `A`; then search the Render log for `etc/passwd` and `Mars/Olympus` | each 200, still `Asia/Kolkata`; **0** log hits | Critical P0 |
| P-4C-04 | Old client (no header) | the same with no `X-Timezone` | 200, `Asia/Kolkata` unchanged | Critical P0 |
| P-4C-05 | Not exposed (Done item 4) | as review.friend: `/profile/{110}`, `/users/search?q=review`, `/users/110/stats`, `/reading-activity/user/110/daily?days=7` | no `timezone` key; `Asia/Kolkata` not in any body | Critical P0 |
| P-4C-06 | Preflight | `curl -si -X OPTIONS <api>/profile/me -H "Origin: https://www.trackmyread.com" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization,x-timezone"` | 200; `access-control-allow-headers` includes `x-timezone` | Critical P0 |
| P-4C-07 | Web sends it (after the Vercel deploy; Done item 2) | Playwright on `<web>` as review.reader, context `America/Los_Angeles`: record the `/profile/me` request; open `/insights`; compare its projected dates with the API JSON. Then context `Asia/Kolkata`, open `/home` | the request carries `x-timezone: America/Los_Angeles`; every projected date shown equals `projected_finish` as a calendar day, and month labels match. The last step leaves the stored zone ∈ {`Asia/Kolkata`, `Asia/Calcutta`} (K-06) | Critical P0 |
| P-4C-08 | A write lands on the local day (Done item 1, second half — at **any** time) | after 10:00 UTC: `PUT /userbooks/{a review fixture book}/progress` +1 page with `X-Timezone: Pacific/Kiritimati` (UTC+14); `GET /reading-activity/daily?days=2` with the same header; then one request with `Asia/Kolkata` | the last element's `date` = the Kiritimati date (= UTC date + 1) and holds the +1. The zone is restored to IST. Record the row in the ledger: it is a "future" label for IST until tomorrow (D-4) | Critical P0 |
| P-4C-09 | History untouched (R-05) | `SELECT count(*) FROM reading_activity WHERE local_day IS NULL AND id > <max_id>;` · `… WHERE local_day IS TRUE AND id <= <max_id>;` · `… WHERE local_day AND date <> date_trunc('day', date);` | `0`, `0`, `0`. The first proves no pre-4C writer is still running. The second proves no old row was relabelled. The third proves labels are midnights | Critical P0 |
| P-4C-10 | Totals identical | review.reader's two sums from P-4C-00, re-read before P-4C-08 | equal | Critical P0 |
| P-4C-11 | Reminders only in the local window (first 3 evenings) | `SELECT count(*) FROM notificationlog n JOIN "user" u ON u.id = n.user_id WHERE n.event_type = 'reading_streak_reminder' AND n.sent_at > '<deploy UTC>' AND EXTRACT(hour FROM (n.sent_at AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(u.timezone, 'Asia/Kolkata')) NOT IN (20, 21);` | `0`. A non-zero row is inspected, not auto-failed: the reader may have changed zone after the send (D-7) | Critical P0 |
| P-4C-12 | Never twice on one local day (restarts, sleep) | `SELECT n.user_id, ((n.sent_at AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(u.timezone, 'Asia/Kolkata'))::date AS d, count(*) FROM notificationlog n JOIN "user" u ON u.id = n.user_id WHERE n.event_type = 'reading_streak_reminder' AND n.sent_at > '<deploy UTC>' GROUP BY 1, 2 HAVING count(*) > 1;` | **0 rows** | Critical P0 |
| P-4C-13 | Never-reported readers keep 8 PM IST (Done item 5, K-18) | the Render log for the first evening | a `[scheduler] Inactivity reminders sent: N users notified.` line at the 14:30 UTC run (when any never-reported push reader is inactive). Lines at other quarter-hours are legitimate only for readers in matching zones (P-4C-11 is the proof) | Major P0 |
| P-4C-14 | Privacy page (E-4) | `<web>/privacy` | the exact sentence is visible once | Major P0 |
| P-4C-15 | Wake re-registers the job | the Render log after the next sleep and wake | `[scheduler] Started — inactivity reminder runs every 15 min…` appears again after the wake | Major P1 |
| P-4C-16 | Every page renders | `node qa/screenshots.mjs --web <web> --api <api> --out qa/screenshots/<date>-4c-prod` | exit 0: all pages logged in, no failed API call and no console error | Critical P0 |
| D-4C-01 | Android ≤ 2.2.2 still served (R-09) | PM, 2.2.2 phone: open Home, Insights, Profile; then Claude runs the P-4C-04 curl | no error; the stored zone is unchanged by the phone (2.2.2 sends no header) | Critical P0 |
| D-4C-02 | 2.2.3 sends the zone | PM, 2.2.3 test APK, **web tabs closed**: open the app, pull to refresh; Claude runs the P-4C-04 curl | `timezone` = the phone's zone (∈ {`Asia/Kolkata`, `Asia/Calcutta`} for an Indian phone) | Critical P0 |
| D-4C-03 | 2.2.3 dates west of UTC (R-15) | PM sets **their own** phone to Los Angeles time, opens Insights; Claude reads `/insights` JSON with the header `America/Los_Angeles` | each projected date equals `projected_finish`; "N days left" = `projected_finish` − the phone's date; month axis labels correct; the PM restores the phone zone and reopens the app → D-4C-02 value again | Critical P0 |
| D-4C-04 | 2.2.3 logs on the local day | PM logs +1 page on a review book; Claude reads `/daily?days=1` without a header | the +1 is on the phone's local date | Major P0 |

**Order:** G-4C-00 → G-4C-01 → G-4C-02 → (merge) G-4C-03..12 → deploy the backend → G-4C-13, P-4C-00 (taken just before the deploy), P-4C-01..06, P-4C-09, P-4C-10, P-4C-08 → deploy the web → P-4C-07, P-4C-14, P-4C-16 → evenings 1–3: P-4C-11..13, P-4C-15 → G-4C-14 → D-4C-01..04 → the PM's Play decision.

---

## 8. Regression — every consumer of a changed endpoint (from `dependency-map.md`)

**Backend command:** `.venv\Scripts\python -m pytest tests -q` → `529 passed`.
**Web:** G-4C-07..09.
**Android:** G-4C-10.

| # | Pri / Sev | Consumer | Proof |
|---|---|---|---|
| RG-01 | P0 / Critical | `GET /profile/me` (10 files): web `AuthContext.jsx`, `ProfilePage.jsx`, `SettingsPage.jsx`; Android `App.js`, `FeedScreen.js`, `GroupDetailScreen.js`, `GroupsScreen.js`, `ProfileScreen.js`, `InsightsScreen.js`, `SettingsScreen.js` | `test_profile_me_response_shape_unchanged`: the key set is the old one **+ `timezone` only**; `stats` keys unchanged. Web: `web_4a_local.mjs` 25/25 plus P-4C-16. Android 2.2.2 ignores the unknown key: D-4C-01 |
| RG-02 | P0 / Critical | `PUT /userbooks/{id}/progress`: web `BookDetailPage.jsx`, `LibraryPage.jsx`; Android `BookDetailScreen.js` | P1's response key set; the existing `test_pages_logged_after_progress_update` and the completion / milestone firing tests stay green; rating still goes through PATCH (`dependency-map.md` May-2026 rule, `BookDetailScreen` rows unchanged) |
| RG-03 | P0 / Critical | `GET /reading-activity/daily`: web `LibraryPage.jsx` (7), `ProfilePage.jsx` (30); Android `App.js` preload, `InsightsScreen.js`, `ProfileScreen.js` | `test_daily_returns_correct_shape`, `test_recorded_caller_days_values_200` (7/30/90), `test_days_bounds_422` green; the length equals `days` and the last element is "today" (positional readers `LibraryPage.jsx:95`, `InsightsScreen.js:195`) |
| RG-04 | P0 / Critical | `GET /reading-activity/insights`: web `InsightsPage.jsx`, `ProfilePage.jsx`; Android `App.js`, `InsightsScreen.js`, `ProfileScreen.js` | `test_insights_returns_correct_shape`, `test_mobile_alias_keys_present` (4A aliases), `test_insights_monthly_pages_shape_unchanged` ×2 green unchanged; `test_insights_new_user_all_zeros` (empty state) green |
| RG-05 | P0 / Critical | `GET /reading-activity/user/{id}/daily`: web `UserProfilePage.jsx` (30/90); Android `UserProfileScreen.js` | `TestPublicUserDaily` (4 tests) green; R9 |
| RG-06 | P1 / Major | `GET /users/{id}/stats`: web `UserProfilePage.jsx`; Android `UserProfileScreen.js` | the `UserStats` response model is unchanged (the existing stats tests); R4's `last_month` is still rolling; R10 |
| RG-07 | P0 / Critical | `get_current_user` (every route) | the whole suite; the F-08 counters in `test_notes.py` (`_queries_for` warm-up) green **unchanged**, since they send no header; L5 |
| RG-08 | P0 / Critical | `fire_event` callers: `follow_router`, `likes_comments`, `books_router`, `userbooks_router` ×4, `groups_router` (invite / join / approve / reject), `notifications/router` admin test, scheduler | `test_notifications_api.py` (history and unread shapes, R-06 of 4A), the `TestLikesComments` NotificationLog assertions and the `test_groups.py` invite tests green; `sent_at` is set explicitly (K-04 pin runs) |
| RG-09 | P1 / Major | Circle goal / leaderboard / `pages_read_total` (read `reading_activity` labels against the UTC month, E-3) | the `test_groups.py` suite green unchanged; ST-02 (`groups_router.py` untouched); H8's group sum |
| RG-10 | P0 / Critical | Login: `POST /auth/review-login`, `POST /auth/google` | all `TestReviewLogin` tests green (+A3); A4 |
| RG-11 | P1 / Major | Admin user list `last_active` (`admin_router.py:218`, an instant) | `test_admin.py:114` key set unchanged; H7 |
| RG-12 | P2 / Minor | Web raw-fetch sites (avatar upload, note image upload, Goodreads import) | W-09; `web_4a_local.mjs` 25/25 |
| RG-13 | P0 / Critical | Android 2.2.2 in the wild (no header) | H14, P-4C-04, D-4C-01 |
| RG-14 | P1 / Major | 4A SQL artifact tests (K-15) | all 14 existing `test_sql_artifacts.py` tests green **with no edit** |
| RG-15 | P1 / Major | Android existing node suites (`sourceRules` interceptor rules, `apiContract` named imports, `preload_keys_unchanged`, `insights_profile_read_canonical_fields`) | G-4C-10: 113 / 0 |
| RG-16 | P1 / Major | Screen states (spec table): empty, error (cold start), loading unchanged | `test_insights_new_user_all_zeros`, `test_daily_zero_pages_for_new_user`; H2b (the header adds no failure path); P-4C-16 |

---

## 9. Mutation-proof table (Builders fill in; required by G-4C-11)

**Procedure per row:**
1. Apply the one-line change.
2. Run only the named tests, e.g. `.venv\Scripts\python -m pytest tests/test_local_day.py -q -k "<name>"` or `node --test <file>`.
3. Paste the **first failing assertion line**.
4. `git checkout -- <file>`, re-run, and record green.

A row whose tests stay green is **not caught**: the merge is blocked until a test is fixed or added. For cases of the same kind that are not listed here, the mutation is in their case row.

| MUT | File | One-line change | Must go red | Expected first red line | Observed (Builder) | Caught | Restored |
|---|---|---|---|---|---|---|---|
| 01 | `userbooks_router.py` | label from `localday.utcnow().date()` | P1, P3, P4, P7 | `assert datetime.datetime(2026, 9, 17, 0, 0) == datetime.datetime(2026, 9, 18, 0, 0)` | | | |
| 02 | `userbooks_router.py` | drop `.where(date < label + 1 day)` | P5, T1 | `assert 1 == 2` | | | |
| 03 | `userbooks_router.py` | new row without `local_day=True` | P1 | `assert None is True` | | | |
| 04 | `reading_activity_router.py` | `/daily` `end_date = localday.utcnow().date()` | R1 | `assert '2026-09-17' == '2026-09-18'` | | | |
| 05 | `reading_activity_router.py` | insights `today = localday.utcnow().date()` | R5, R6, R8 | `assert '2026-10-07' == '2026-10-08'` | | | |
| 06 | `reading_activity_router.py` | `ub.updated_at.date() >= year_start` | R3 | `assert 0 == 1` | | | |
| 07 | `reading_activity_router.py` | `streak_dates = active_dates` | B1 | `assert 1 == 5` | | | |
| 08 | `reading_activity_router.py` | bridge `== timedelta(days=2)` → `>=` | B0, B2 | `assert {datetime.date(2026, 9, 16)} == set()` | | | |
| 10 | `deps.py` | compare `last_active.date() < now.date()` | L1, L2 | `assert datetime.datetime(2026, 9, 17, 18, 0) == …(2026, 9, 17, 19, 0)` | | | |
| 11 | `deps.py` | delete `user.timezone = reported` | H1, L-4C-02 | `assert None == 'America/New_York'` | | | |
| 12 | `deps.py` | `zone = zone_of(user)` moved above the header block | H1 (2nd assertion) | `assert '2026-09-18' == '2026-09-17'` | | | |
| 13 | `deps.py` | extra `db.commit()` after the zone write | H5 | `assert 2 == 1` | | | |
| 14 | `localday.py` | `valid_zone` returns `name` for any `str` | U1b, H2 | `assert 'Mars/Olympus' is None` | | | |
| 15 | `localday.py` | delete the length condition | U1c | `assert 'ZZZ…' is None` | | | |
| 16 | `localday.py` | `valid_zone` via `ZoneInfo(name)` in try/except | U1d | `AssertionError: fs touched` | | | |
| 17 | `localday.py` | `zone_of` → `ZoneInfo(user.timezone or FALLBACK_ZONE)` | U2, H11 | `zoneinfo._common.ZoneInfoNotFoundError: 'No time zone found with key Mars/Olympus'` | | | |
| 18 | `localday.py` | `FALLBACK_ZONE = "UTC"` | U6, H14, L4, N1 | `assert 'UTC' == 'Asia/Kolkata'` | | | |
| 19 | `reading_activity_router.py` | `/user/{id}/daily` uses `zone_of(current_user)` | R2 | `assert '2026-09-17' == '2026-09-18'` | | | |
| 20 | `users_router.py` | `zone = zone_of(current_user)` | R4 | `assert 0 == 1` | | | |
| 21 | `profile_router.py` | `"timezone"` added to `get_public_profile` | H7, H7b | `assert 'timezone' not in {…}` | | | |
| 22 | `profile_router.py` | `timezone: Optional[str]` added to `ProfileUpdate` + applied | H9 | `assert 'America/New_York' == 'Asia/Tokyo'` | | | |
| 23 | `deps.py` | `print(f"[tz] ignored {raw!r}")` on reject | H3 | `assert 'Mars/Olympus' not in '…'` | | | |
| 24 | `deps.py` | `raise HTTPException(400)` on an invalid zone | H2b | `assert 400 == 200` | | | |
| 25 | `main.py` | `allow_headers=["Authorization","Content-Type"]` | H6 | `assert 'x-timezone' in '…'` | | | |
| 26 | `auth_router.py` | review login keeps the `date.today()` guard | A3 | `assert datetime.datetime(2026, 9, 17, 18, 0) == …19, 0)` | | | |
| 27 | `auth_router.py` | Google login keeps the guard | A4 | same | | | |
| 28 | `scheduler.py` | delete the window `continue` | N1 | `assert 1 == 0` | | | |
| 29 | `scheduler.py` | `zone = localday.zone_of(None)` | N2, N3 | `assert 0 == 1` | | | |
| 30 | `scheduler.py` | window `wall.hour == 20` | N5 | `assert 0 == 1` | | | |
| 31 | `scheduler.py` | `WINDOW_END_HOUR = 23` | N1 (u2) | `assert 1 == 0` | | | |
| 32 | `scheduler.py` | `user.last_active.date() >= now.date()` | N4 | `assert 1 == 0` | | | |
| 33 | `scheduler.py` | delete the NotificationLog pre-filter loop | N11 | `assert <id> not in [<id>, …]` | | | |
| 34 | `scheduler.py` | bulk `IN()` load → `[db.get(User, i) for i in user_ids]` | N7 | `assert 22 == 3` | | | |
| 35 | `scheduler.py` | `CronTrigger(hour=14, minute=30, timezone="UTC")` | N10 | `assert "minute='0,15,30,45'" in "cron[hour='14', minute='30']"` | | | |
| 36 | `dispatcher.py` | cap with `datetime.combine(date.today(), time.min)` | N8 (C), C4/C5 | `assert 2 == 1` | | | |
| 37 | `dispatcher.py` | `zone_of(db.get(User, actor_id))` | N8b | `assert 1 == 2` | | | |
| 38 | `dispatcher.py` | `NotificationLog(...)` without `sent_at=now` | N8 (B) | `assert 1 == 2` | | | |
| 39 | `users_router.py` | `from ..localday import utcnow` | S2 | `assert [('app/routers/users_router.py', …)] == []` | | | |
| 40 | any `app/` file | `x = date.today()` | S1, ST-01 | `assert [(…)] == []` | | | |
| 41 | `main.py` | delete `assert_migrated(engine)` | G3, G-PG-1 | `Failed: DID NOT RAISE <class 'RuntimeError'>` | | | |
| 42 | `schema_guard.py` | `except Exception: raise` | G1d, G-PG-7 | `sqlalchemy.exc.OperationalError` | | | |
| 43 | `schema_guard.py` | drop `("reading_activity","local_day")` | G1b, G4 | `Failed: DID NOT RAISE` | | | |
| 44 | `localday.py` | delete the import-time `RuntimeError` | G2 | `assert 0 != 0` | | | |
| 45 | `requirements.txt` | delete `tzdata==2026.2` | S4, ST-08 | `assert 'tzdata==2026.2' in [...]` | | | |
| 46 | `supabase_migration.sql` | STEP 1 `ADD COLUMN` without `IF NOT EXISTS` | Q2, G-PG-3 | `assert '… ADD COLUMN timezone …' == '… ADD COLUMN IF NOT EXISTS timezone …'` | | | |
| 47 | `supabase_migration.sql` | rollback lines uncommented | Q4 | `assert 'ALTER TABLE …' == ''` | | | |
| 52 | `reading_activity_router.py` | no future-label filter on `streak_dates` (K-08) | B6 | `assert 2 == 1` | | | |
| W1 | `localDate.js` (web) | `parseDayLabel = s => new Date(s)` | W-03 | `2 !== 3` | | | |
| W2 | `localDate.js` (web) | `m[3] ? +m[3] : 1` → `+m[3]` | W-04 | `Expected values to be strictly equal: NaN !== 1` | | | |
| W3 | `localDate.js` (web) | delete `z.length <= 64` | W-02 | `'AAAA…' !== null` | | | |
| W4 | `localDate.js` (web) | delete `try/catch` | W-02 | `Error: boom` | | | |
| W5 | `api.js` (web) | delete the `X-Timezone` spread | W-06, L-4C-01 | `The input did not match the regular expression /'X-Timezone'/` | | | |
| W6 | `api.js` (web) | `const tz = deviceTimeZone()` at module scope | W-06 | `1 !== 0` | | | |
| W7 | `InsightsPage.jsx` | back to `new Date(p.projected_finish)` | W-11, L-4C-03 | `FAIL L-4C-03 … shows Oct 2` | | | |
| W8 | `PrivacyPage.jsx` | sentence altered | W-10, L-4C-05 | `0 !== 1` | | | |
| W9 | `api.js` (web) | a new raw `fetch(` | W-09 | `5 !== 4` | | | |
| M1 | `localDate.js` (Android) | `new Date(s)` | M-03 | `2 !== 3` | | | |
| M2 | `localDate.js` (Android) | `Math.round` → `Math.ceil` | M-06 | `2 !== 1` | | | |
| M3 | `localDate.js` (Android) | `Math.round` → `Math.floor` | M-07 | `0 !== 1` | | | |
| M4 | `api.js` (Android) | delete the header assignment | M-09 | `0 !== 1` | | | |
| M5 | `api.js` (Android) | `const tz = deviceTimeZone()` at module scope | M-09 | `0 !== 1` | | | |
| M6 | `InsightsScreen.js` | `shortDate` back to `new Date(dateStr)` | M-10 | `1 !== 0` | | | |
| M7 | `localDate.js` (Android) | `import { x } from 'y'` | M-11 | `1 !== 0` | | | |
| M8 | `app.json` | `2.2.2` / `61` | M-12 | `'2.2.2' !== '2.2.3'` | | | |

(MUT-09, -48..-51 and -53 are folded into rows 05 and 07, and into the case rows R5–R10.)

---

## 10. Gate summary

| Gate | Protects | Command | Exact expected output |
|---|---|---|---|
| **G-4C-00** | the 2.2.2 AAB and 4A come first | `curl -s <api>/version`; `git tag -l android-2.2.2`; `git show android-2.2.2:book-tracker-mobile-stitch/app.json` | 4A SHA; the tag listed; `2.2.2` / `61` |
| **G-4C-01** | columns before code (R-14) | Supabase STEP 1, STEP 2 | 2 rows (`reading_activity\|local_day\|boolean\|YES`, `user\|timezone\|character varying\|YES`); `0`, `0` |
| **G-4C-02** | the guard's view of production | the section 6 query | 2 rows; `public` |
| **G-4C-03** | the backend suite | `.venv\Scripts\python -m pytest tests -q` | **`529 passed`** (K-01 rule) |
| **G-4C-04** | clock- and zone-proof (R-16) | `TZ=LIN-14 BT_TEST_PIN_HOUR=0 …pytest tests -q`; `TZ=BIT+12 BT_TEST_PIN_HOUR=18 …pytest tests -q` (Git Bash; 05:30–23:30 IST; `tm_gmtoff` controls `50400` / `-43200`) | **`529 passed`** each |
| **G-4C-05** | real PostgreSQL: refuse-to-start, idempotency, rollback | `.venv\Scripts\python qa/pg_4c_migration.py` | **`4C pg local: 8 passed, 0 failed`** |
| **G-4C-06** | local clocks, untouched files, E-3, E-5 | ST-01..03, ST-06..08 | empty / empty / empty / 2 lines + comment / 1 package per file / `1` |
| **G-4C-07** | web utils | `node --test "qa/unit/*.test.mjs"` | **`# pass 25`**, `# fail 0` |
| **G-4C-08** | web build and lint | ST-04, ST-05 | exit 0; no new problems |
| **G-4C-09** | web behaviour, locally | `node qa/web_4c_local.mjs`; `node qa/web_4a_local.mjs` | **`4C web local: 5 passed, 0 failed`**; **`4A web local: 25 passed, 0 failed`** |
| **G-4C-10** | Android | `node --test "__tests__/*.test.mjs"` (in `book-tracker-mobile-stitch/`) | **`# pass 113`**, `# fail 0`, `# skipped 0` |
| **G-4C-11** | the tests test something | section 9 | every row caught and restored |
| **G-4C-12** | the map matches | `python scripts/gen_dependency_map.py && git diff --stat dependency-map.md` | no generated row change |
| **G-4C-13** | the deployed code is the tested code | `curl -s <api>/version` + the Render log | the merge SHA; `Started — inactivity reminder runs every 15 min`; no `Migration not applied` |
| **G-4C-14** | Android after the backend | the AAB workflow | strict guard passes; run after G-4C-13 |

**Retired:** the triage's F-62 "gate correction" (`N passed, and no failures other than the three F-62 day-boundary tests`). After 4C every pytest gate is an exact count (R-16). Doc Sync records this in `triage-2026-09-13.md`.

---

## Test Cases (index)

| IDs | Area | Count | Severity |
|---|---|---|---|
| T-4C-U1..U6 (11) | `localday` units | 11 | U1b, U1c, U1d, U2 Critical; rest Major / Minor |
| T-4C-H1..H14 (16) | header, storage, privacy | 16 | all Critical except H4, H5 Major |
| T-4C-L1..L5, A3, A4 | `last_active`, login | 6 (+1 changed) | L1, A3, A4 Critical |
| T-4C-P1..P11 | local-day writes | 11 | P1, P3, P4, P5, P7, P11 Critical |
| T-4C-R1..R10 | "today" reads | 10 | R1–R4, R9, R10 Critical |
| T-4C-B0..B7 | cut-over bridge (E-2) | 8 | B5 Critical; rest Major |
| T-4C-T1..T2 | travel (E-6) | 2 | T1 Critical |
| T-4C-N1..N12 | reminders, caps | 12 new + 8 changed | N1–N5, N8, N8b, N10, N11 Critical |
| T-4C-G1a..G4, Q1..Q6 | guard, migration | 13 | mostly Critical |
| T-4C-S1..S4, C1..C6 | static, clock | 10 | S1–S3, C1–C5 Critical |
| W-01..W-11 | web unit | 11 | W-03, W-06, W-11 Critical |
| L-4C-01..05 | web local | 5 | 01–03 Critical |
| M-01..M-12 | Android node | 12 (+1 changed) | M-03, M-06, M-07, M-09, M-10 Critical |
| G-PG-1..8 | local PostgreSQL | 8 | Critical |
| P-4C-00..16, D-4C-01..04 | production, device | 21 | mostly Critical |
| RG-01..16 | regression | 16 | per row |

## Priority Guide
- **P0:** ship blocker. Must pass before merge (automated) or before the Play decision (production / device).
- **P1:** important. Fix within the sprint.
- **P2:** nice to have.

## Automated
`pytest tests -q`:
- `tests/test_local_day.py`: `TestLocalDayUnits`, `TestZoneHeader`, `TestLastActive`, `TestProgressLabel`, `TestReadDays`, `TestCutoverBridge`, `TestTravel`, `TestSchemaGuard`, `TestStaticRules`, `TestClockIndependence`.
- `tests/test_scheduler.py`.
- `tests/test_auth.py`: `TestReviewLogin`, `TestGoogleLoginLastActive`.
- `tests/test_sql_artifacts.py::TestMigration4C`.

Plus `qa/pg_4c_migration.py`, `node --test "qa/unit/*.test.mjs"`, `qa/web_4c_local.mjs`, and `node --test "__tests__/*.test.mjs"`.

## Failing Tests
None run yet. Junior QA records each failure here with its reason and disposition: fix now / deferred to sprint N / accepted risk.
