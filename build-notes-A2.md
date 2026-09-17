# Build Notes — Package A2 (Sprint 4A platform audit)

Scope: catalogue, groups, insights, Google Books, admin, platform, data/migrations.
Files touched match the brief's exhaustive list, with one documented addition (see
"Deviation" below).

## Verification

- **Baseline** (before any A2 edit, this worktree): `249 passed, 3 failed` (252 collected).
  The 3 pre-existing failures are unrelated to A2 and were failing before I touched anything:
  `tests/test_auth.py::TestReviewLogin::test_last_active_set_to_today`,
  `tests/test_scheduler.py::test_inactivity_reminder_skips_user_active_today`,
  `tests/test_scheduler.py::test_inactivity_reminder_daily_cap_prevents_second_send`.
  Both files are outside every package's scope (`test_auth.py` is A1, `test_scheduler.py` is
  nobody's) — not fixed here. They look date-sensitive (today is 2026-09-18, five days past the
  triage date embedded in the plan), not something A1/A2 changed.
- **After** (A2 changes + all new A2 tests, this worktree only — A1 not merged): `346 passed,
  3 failed` (349 collected), same 3 pre-existing failures, **no new failures caused by A2**.
  Delta: **+97 passing tests** = the 101 A2 ids in tests.md minus the 4 droppable race tests
  (T-A2-75..78, see below). This worktree cannot reach the merged gate (435, K-19) because A1's
  changes aren't present here — `pytest tests -q` on the merged A1+A2 tree is the PM/backend
  Builder's job at merge time (architecture "Merge and deploy order" step 2).
- Ran the full suite three times to characterize flakiness: `tests/test_import.py::TestGoodreadsImport::test_import_skips_already_imported_book`
  failed **once** out of three full-suite runs, always passed alone or combined with any A2 file.
  `test_import.py` and `import_router.py` are in no package's scope; this looks like a pre-existing
  flake in the shared-cache SQLite test DB under load, not something A2 introduced (I did not touch
  either file). Flagged for whichever package/QA owns cross-cutting test infra.
- `python -c "import app.main"` imports cleanly (with `SECRET_KEY` set, as the existing
  `app/auth.py` already requires and as `tests/conftest.py` already does for pytest — this
  repo has no `.env`/dotenv loading, so the same is true on a clean checkout today).

## Per-finding changes and coverage

- **F-01 orphan** — removed `oauth2_scheme`/`OAuth2PasswordBearer` and its import from
  `app/main.py`; changed the `auth` tag description to "Google sign-in and account deletion".
  Verified: `ST-A2-01` (grep, no output).
- **F-07 (recommendations, friends-reading, groups, add-to-library)** — `books_router.py`:
  `AddBookFromGooglePayload.book_id`, step-1 matching order (book_id → google_books_id → isbn),
  `_already_in_library()` helper, `get_recommendations` adds `google_books_id`/`isbn`.
  `userbooks_router.py`: `get_friends_currently_reading` adds `book.google_books_id`/`isbn` and
  `user.profile_picture`. `groups_router.py`: `_serialize_group.current_book` and
  `set_group_book` response add the same three keys. Covered by
  `tests/test_books.py::TestAddToLibrary` (T-A2-16a, 16, 17, 18, 19, 20, 21, 22),
  `TestRecommendations::test_recommendations_items_have_dedup_keys` (T-A2-23),
  `TestFriendsReading` (T-A2-26), `tests/test_groups.py::TestGroupsCRUD` (T-A2-36, 37).
- **F-13 + F-14 (Insights aliases)** — `reading_activity_router.py`: `yearly_goal.finished`,
  `average_rating`, `books_this_year`, `projected_finishes[].projected_finish_date`. Covered by
  `tests/test_reading_activity.py::TestInsights::test_yearly_goal_has_completed_and_finished_alias`
  and `test_mobile_alias_keys_present` (T-A2-40, 41).
- **F-15 (circle goal aliases)** — `groups_router.py`: `CreateGroupBody.reading_goal` alias,
  `_goal_pages_read()` extracted and reused by `get_goal_progress` (unchanged output) and
  `get_group` (new `reading_goal`/`pages_read_total`). Covered by `TestGroupsCRUD`
  (T-A2-31..35, 38).
- **F-16 SQL** — new `context/repairs/2026-09-rating-reset-repair.sql`, Postgres-only, reviewed
  by eye (not run against SQLite — uses `~`, `::jsonb`). Static shape covered by
  `tests/test_sql_artifacts.py::TestRepairSQL` (T-A2-87..91).
- **F-19 (no placeholder covers)** — `googlebooks_router.py`: `_cover_from_volume()` helper,
  used at search and detail. Covered by `tests/test_googlebooks.py::TestNullCover` (T-A2-50..54).
- **F-26 stats + Make Admin** — `admin_router.py`: `PlatformStats.push_subscribed_users` +
  its query in `get_platform_stats`. `set_admin_status` itself is untouched (explicitly listed
  under "Files NOT to touch" in the architecture) — its existing behaviour already matched the
  spec, so only tests were added: `tests/test_admin.py::TestSetAdmin` (T-A2-45..49) and
  `TestAdminAccess::test_stats_has_push_subscribed_users_distinct_count` (T-A2-43).
- **F-29 (anonymous Google Books quota)** — `googlebooks_router.py`: `_caller_key`,
  `_consume_anonymous_call`, `_anon_calls`, salted per-process IP hash, right-most
  `X-Forwarded-For` entry with `request.client.host` fallback. Wired into both routes ahead of
  the existing logic. Covered by `tests/test_googlebooks.py::TestAnonymousQuota` (T-A2-55..65).
- **F-33** — same commit as F-07 above (dedup keys on note-card-sourced adds); no separate code.
- **F-50 (userbook and group delete)** — `userbooks_router.delete_userbook`: deletes
  `ReadingActivity` rows and nulls `GroupPost.userbook_id` before the delete.
  `groups_router.delete_group`: deletes `GroupActivity` rows before members/posts/group. Covered
  by `tests/test_books.py::TestDeleteUserbook` (T-A2-12, 13, 14) and
  `tests/test_groups.py::TestGroupDelete` (T-A2-15). Per **K-08**, SQLite runs with foreign keys
  off, so the original 500 cannot be reproduced here — these tests assert "no orphan rows after
  delete", not the FK violation itself; the production proof is P-06 probe #155 (post-deploy).
- **F-51 (bounded list parameters, A2's endpoints)** — `Query(default, ge=1, le=200)` on:
  `books_router.get_recommendations`/`search_books`; `userbooks_router.get_friends_currently_reading`;
  `groups_router.get_group_activity`; `reading_activity_router.get_daily_reading_stats`/
  `get_user_daily_reading_stats`; the 5 `admin_router.py` list routes. Covered by the
  `*_limit_bounds_422`/`*_days_bounds_422` tests in each of `test_books.py`, `test_groups.py`,
  `test_reading_activity.py`, `test_admin.py` (T-A2-24, 25, 27, 39, 42, 44).
  **Caller check** (dependency-map.md + direct grep of both clients' `src/`): every caller of
  these six endpoint families passes a fixed default well inside 1..200 (`7`, `10`, `30`, `50`,
  `100`) or no `limit`/`days` at all. **No web or Android caller needs a matching change.**
- **F-52 (validated userbook PATCH)** — `userbooks_router.py`: `UserBookPatch` pydantic model
  with `Literal`/`conint`/`root_validator`, replacing the raw `dict` payload. Response shape and
  the "nothing sent → 400" behaviour are unchanged. Covered by
  `tests/test_books.py::TestPatchUserbookValidation` (T-A2-01..11).
- **F-53 (models, migration, add handlers)** — `app/models.py`: `UniqueConstraint`s on
  `UserBook(user_id, book_id)`, `Like(note_id, user_id)`, `Follow(follower_id, followed_id)`.
  `context/supabase_migration.sql`: appended the full STEP 1/1b/2/3 + rollback block (see "PM SQL
  run order" below) — **append-only**, verified byte-identical prefix against `c36a21b` modulo
  line-ending representation (this checkout's CRLF vs. git's stored LF; content is identical).
  `books_router.add_book_to_library` and `userbooks_router.add_userbook` now catch
  `IntegrityError` and return the existing 400 contract. Covered by `tests/test_uniqueness.py`
  (T-A2-70..74) and `tests/test_sql_artifacts.py::TestMigrationSQL` (T-A2-92..100).
  **Grep for existing duplicate inserts** (`UserBook(user_id=`, `Like(note_id=`,
  `Follow(follower_id=`) across `tests/`: only single, non-duplicate inserts found (one each in
  `test_auth.py`, and two in this session's own new `test_books.py` helpers, each with a distinct
  actor/follower pair). Nothing pre-existing would break under the new constraints.
- **F-54 (deep Google pagination)** — `googlebooks_router.py`: `MAX_START_INDEX = 1000`
  short-circuit in `search_google_books`; `has_more` now also requires `next_start <
  MAX_START_INDEX`; `except HTTPException: raise` / `except httpx.HTTPError: 502` /
  `except Exception: 502` in both routes (no more echoed `str(e)`). Covered by
  `tests/test_googlebooks.py::TestDeepPagination` (T-A2-66..69).
- **F-56 + F-58 (security headers, JSON 500s)** — `app/main.py`:
  `CatchUnhandledErrorsMiddleware` (innermost) and `SecurityHeadersMiddleware` (outermost),
  registered around the existing `CORSMiddleware` call (which is byte-identical to `c36a21b`).
  Covered by `tests/test_security_headers.py` (T-A2-79..86). Verified `ST-A2-02` (middleware
  registration line order) and `ST-A2-03` (migration append-only) by hand — see above.
- **F-59 (A2 call sites)** — `BackgroundTasks` added to every listed handler in
  `books_router.py`, `userbooks_router.py`, `groups_router.py`; each `fire_event`/
  `fire_group_activity`/`fire_group_activity_for_user` call is now `background_tasks.add_task(...)`
  with the recipient list/title captured beforehand (unchanged authorization timing). Covered by
  `tests/test_books.py::TestPushAfterResponse` (T-A2-28..30), using a hand-rolled `_asgi_order()`
  helper (drives the ASGI app directly via `anyio.run`, bypassing `TestClient`, so the order of
  the `http.response.start` send vs. the push calls is actually observable — confirmed empirically:
  `events == ['response.start', 'push.mobile', 'push.web']`).

## F-53 — exact SQL the PM must run, in order

All three steps are in `context/supabase_migration.sql`, in the section starting
`-- Sprint 4A · F-53 · unique (user_id, book_id), (note_id, user_id), (follower_id, followed_id)`
(appended after the existing "Migration complete" line — nothing above it changed):

1. **STEP 1** (read-only) — counts duplicate groups/surplus rows per table. Read the numbers.
2. **STEP 1b** (read-only) — side-by-side preview of duplicate `userbook` rows.
3. **STEP 2** (one transaction, `BEGIN; … COMMIT;`) — dedupes `userbook`/`like`/`follow`,
   absorbing progress/status/rating into the kept row and repointing `note`, `reading_activity`,
   `group_post`, and `journal` (if present) before deleting surplus rows.
4. **STEP 3** (immediately after STEP 2, same session — **K-07**: do not re-run STEP 2 if STEP 3
   fails) — creates the three unique indexes and verifies with a `pg_indexes` `SELECT`.

A rollback block (indexes → data, in that order) follows STEP 3, using the backup tables STEP 2
creates (`dedupe_20260913_*`). Do not drop those backup tables before 2026-10-13 (per the
migration's own comment).

**F-16** (`context/repairs/2026-09-rating-reset-repair.sql`) is separate and unrelated to F-53:
run **PART (a) only** first and send the count/preview to the Architect; (b) and (c) stay
commented out until approved.

## Deviation from the brief's file list

- **`tests/test_sql_artifacts.py` (new)** is not in this package's "exhaustive" file list in
  either the task brief or the architecture's Execution Plan table, but `tests.md` section 3
  explicitly requires it for F-16/F-53's static checks (T-A2-87..100) and names no other home for
  those ids — none of A2's other test files are a semantically reasonable place for SQL-shape
  assertions. Added it rather than silently dropping 14 required test ids. It touches no app
  code and imports nothing outside the standard library plus `app.models` (already my scope).

## Explicitly not built / dropped

- **T-A2-75..78** (`test_add_to_library_race_returns_400`, `test_add_userbook_race_returns_400`,
  `test_like_race_returns_already_liked`, `test_follow_race_returns_400_already_following`) —
  **dropped, per K-12's explicit permission** ("droppable with a Build Notes reason"). I
  prototyped the `before_flush`-listener technique tests.md suggests; it requires a global
  SQLAlchemy event listener on the `Session` class plus a second, out-of-band `Session(engine)`
  committing the competing row mid-flush. On this shared-cache SQLite test DB that listener would
  fire for *every* session in the process (not just the one under test), and distinguishing "the
  request's own upcoming insert" from unrelated flushes reliably needs either fragile
  string-matching on pending object state or a mid-flush second connection — exactly the
  brittleness tests.md itself anticipates. Rather than ship a flaky, easy-to-misread test, I
  relied on the sanctioned backstop: the three **non-droppable** DB-constraint tests
  (T-A2-70..72, `IntegrityError` on a direct duplicate insert) plus the production adversarial
  probe re-run (P-06 #144-146) as the real race proof, per K-12.
- Everything else in section 3 of tests.md is implemented.

## Assumptions / notes for the PM and other packages

- This worktree does not contain A1's changes, so `test_headers_on_401_and_422` uses
  `/books/recommendations?limit=-1` instead of tests.md's `/notes/feed?limit=-1` — that route's
  F-51 bound is A1's, not available standalone here. Same middleware, same assertion; swap back
  or leave either way at merge time, both prove the same thing.
- `test_add_from_note_card_book_reuses_book` and friends read `card.book.id`/`.title` only (not
  `.google_books_id`/`.isbn`, which A1 adds to note cards) — book_id matching alone is sufficient
  and doesn't depend on A1 having merged.
- Confirmed via `dependency-map.md` and a direct grep of both clients' `src/`: no web or Android
  caller sends an out-of-range `limit`/`days` to any endpoint A2 bounded (see F-51 above in
  detail) — no other package needs a matching change.

## Ready-for-QA checklist

- [x] All A2 findings implemented (except the 4 explicitly-droppable race tests, K-12).
- [x] `pytest tests -q` green on this worktree modulo the 3 pre-existing, out-of-scope failures
      (346 passed / 3 failed here; full A1+A2 merge gate is the backend Builder's job at merge).
- [x] Migration appended to `context/supabase_migration.sql`, flagged: **the PM must run STEP 1,
      then STEP 2, then STEP 3 in Supabase before this backend deploys** (see SQL run order above).
- [ ] `app.json` bump — not applicable, A2 touches no mobile code.
- [x] No new endpoint added; F-59 uses `BackgroundTasks.add_task` with existing functions only,
      no new notification config entries needed.
