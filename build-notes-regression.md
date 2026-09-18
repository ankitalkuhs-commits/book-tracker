# Build Notes — Cross-package regression suite (tests.md §9)

Scope: implement every `tests.md` §9 row whose "New pytest?" column says `yes` — 17 rows
across the Package A1 and Package A2 consumer tables — proving F-07/F-08 (and the rest of
A1+A2) did not change the response shapes the web app and Android app consume.

## 0. Precondition fix — this worktree was missing Package A2

Before writing anything, `git log` on this worktree's branch showed the Package A1 merge
(`3f22931`) but **not** the Package A2 merge (`d5eb467` on `master`). `git diff --stat HEAD
master -- app/` confirmed `app/main.py`, `app/models.py` and five routers genuinely differed —
this worktree's `app/` really did lack A2's fixes (catalogue, groups, insights, admin,
platform, uniqueness). Collected test count was 317, not the ~411 the brief expected.

Checking `d5eb467`'s parents: `d5eb467^1 == 082953d` (this worktree's exact HEAD at the time)
and `d5eb467^2 == 9c890f4` (the Package A2 fix commit). So master's own A2 merge is nothing
more than `9c890f4` merged onto exactly this branch's HEAD. I ran `git merge --no-commit
--no-ff 9c890f4`, then `git write-tree` and compared the result to `d5eb467^{tree}` — **identical,
byte for byte** (`d04ec1d0…`), with zero conflicts. This is not app-code authorship; it is
bringing in already-reviewed, already-committed work so the branch matches the state the task
description asserts ("Sprint 4A's API work is already merged: A1 … and A2 …"). Committed as
`3f3963a merge(api-4a): bring Package A2 into this worktree (precondition fix)`.

After the merge: `411 passed, 3 failed` — exactly the baseline the brief names (the 3 are F-62,
already triaged and out of scope).

## 1. The 17 rows, and what each test asserts

### Package A1 consumers

| # | Test | Result |
|---|------|--------|
| R-01 | `test_notes.py::TestNoteShapeRegression::test_feed_top_level_keys_unchanged` | pass |
| R-02 | `test_notes.py::TestNoteShapeRegression::test_me_keeps_updated_at_and_like_keys` | pass |
| R-03 | `test_notes.py::TestNoteShapeRegression::test_user_notes_keeps_its_asymmetries` | **FAILS — real finding, see §2** |
| R-04 | `test_notes.py::TestNoteShapeRegression::test_userbook_notes_book_shape_unchanged` | pass |
| R-05 | `test_notifications_api.py::TestPrefsRegression::test_get_prefs_shape_unchanged` | pass |
| R-06 | `test_notifications_api.py::TestPrefsRegression::test_history_and_unread_shapes_unchanged` | pass |
| R-07 | `test_follow_profile.py::TestProfileRegression::test_put_profile_other_fields_unchanged` | **FAILS — real finding, see §2** |
| R-08 | (no new pytest — existing `test_push_tokens.py` suite; not implemented, per plan) | n/a |
| R-09 | (no new pytest — `git diff --stat` static check; not implemented, per plan) | n/a |

### Package A2 consumers

| # | Test | Result |
|---|------|--------|
| R-10 | `test_books.py::TestUserbookRegression::test_userbooks_list_shape_unchanged` | pass |
| R-11 | `test_books.py::TestPatchUserbookValidation::test_recorded_caller_payloads_200` | pass |
| R-12 | `test_groups.py::TestGroupsRegression::test_list_serializers_unchanged` | **FAILS — real finding, see §2** |
| R-13 | `test_groups.py::TestGroupsCRUD::test_goal_endpoint_shape_unchanged` | **not written — already exists**, see §3 |
| R-14 | `test_groups.py::TestGroupsRegression::test_members_pending_leaderboard_activity_unchanged` | pass |
| R-15 | `test_reading_activity.py::TestInsights::test_insights_monthly_pages_shape_unchanged` | pass |
| R-16 | `test_reading_activity.py::TestDailyStats::test_recorded_caller_days_values_200` | pass |
| R-17 | `test_admin.py::TestAdminRegression::test_stats_and_lists_unchanged` | pass |
| R-18 | `test_googlebooks.py::TestSearchRegression::test_normal_search_unchanged` | pass |
| R-19 | `test_books.py::TestImportRegression::test_covers_status_unchanged` | pass |
| R-20 | (no new pytest — `.venv` pin assertion; not implemented, per plan) | n/a |

**16 new test methods written** (R-01, R-02, R-03, R-04, R-05, R-06, R-07, R-10, R-11, R-12,
R-14, R-15, R-16, R-17, R-18, R-19). R-13 is not a 17th new method — see §3.

## 2. Real shape regressions found (tests written verbatim per the plan; they fail on purpose)

Per the task instructions, each of these asserts exactly what `tests.md` §9 says must be true,
and each one **fails against the actual merged tree**. None of the three is something F-07/F-08
changed this sprint — in every case the behaviour predates the sprint (confirmed via
`git show <pre-sprint-commit>:<file>`) — so these are stale/inaccurate descriptions in the test
plan, not regressions introduced by the A1/A2 merge. They are still real mismatches between
what §9 documents as the contract and what the code does, which is the entire point of this
exercise, so they are reported rather than silently adapted.

### R-03 — `/notes/user/{id}` DOES have `user_id` and like keys (contradicts its own plan's T-A1-67)

`tests.md` §9 R-03 says: *"`/notes/user/{id}` still has no `user_id` and no like keys"*.

Actual: every note endpoint's route is declared `response_model=List[NoteOutSchema]`, and
`NoteOutSchema` is a real Pydantic model with 17 fields. FastAPI/Pydantic v1 back-fills every
field the handler's dict omits with the schema default — so `/notes/user/{id}` returns
`user_id: null`, `liked_by_me: false`, `user_has_liked: false` even though its handler
(`get_public_notes_for_user` in `app/routers/notes_router.py`) never sets any of the three.

This is not new: `response_model=List[NoteOutSchema]` was already on this route in the commit
*before* the A1 fix (`git show de3ff42^:app/routers/notes_router.py` shows it unchanged). And
the A1 Builder's own test — `test_notes.py::TestNoteQueryCount::
test_note_list_outputs_unchanged_apart_from_book_keys` (T-A1-67) — already documents this in
its own docstring: *"response_model=List[NoteOutSchema] normalizes every response to the
model's full field set … so the top-level key set is the same across all five endpoints
regardless of what each handler builds."* Section 9's R-03 prose was not updated to match that
finding.

### R-07 — `/profile/{id}` gates a private profile with 200 + `locked`, not 403

`tests.md` §9 R-07 says: *"setting `is_private_profile` still gates `/profile/{id}`,
`/notes/user/{id}`, `/users/{id}/stats` at 403 for a non-follower"*.

Actual: `/notes/user/{id}` and `/users/{id}/stats` do 403 (`"This profile is private"`), but
`/profile/{id}` (`get_public_profile` in `app/routers/profile_router.py`) returns **200** with
`{"locked": true, "stats": null}` — this is also the behaviour the file's own pre-existing
test (`test_private_profile_locked_for_non_followers`) already asserts, and it is untouched by
this sprint (F-18 only changes the `yearly_goal` branch, per the row's own note).

### R-12 — `/groups/invites/pending` has a 17th key, `invited_by_name`, not in the 16-key set

`tests.md` §9 R-12 says: *"`/groups/my`, `/groups/discover` and `/groups/invites/pending`
still return the same 16 keys as `_serialize_group` (K-14)"*.

Actual: `/groups/my` and `/groups/discover` match the 16-key set exactly. `/groups/invites/
pending` (`get_my_pending_invites` in `app/routers/groups_router.py`) returns those same 16
keys **plus** `invited_by_name` — a 17th key, sensible for an invites list (you need to know
who invited you) but not what R-12 claims. Confirmed pre-existing: `git show 9c890f4^:
app/routers/groups_router.py` already has the `invited_by_name` line.

None of the three findings above required touching `app/` — they are read-only assertions
that fail against the current, correct-per-git-history behaviour of the merged tree.

## 3. R-13 — not a new test; the exact target already exists

`tests.md` §9 R-13 names `test_groups.py::TestGroupsCRUD::test_goal_endpoint_shape_unchanged`
verbatim. That exact method, in that exact class, in that exact file, **already exists** —
written by the Package A2 Builder as T-A2-35 (`tests/test_groups.py:95`), asserting exactly
what R-13 requires: with a goal, `{goal_pages, goal_period, pages_read, pct}`; without,
exactly `{"goal_pages": null, "pages_read": 0, "pct": 0}` with no `goal_period` key.

Defining a second `def test_goal_endpoint_shape_unchanged` inside the same `TestGroupsCRUD`
class would not add pytest coverage — Python would silently let the second definition replace
the first in the class namespace, so pytest would still collect only one test id, and the
*existing*, already-reviewed T-A2-35 implementation would be the one lost. I left it
untouched. R-13's own proof text already reads as "re-run … as a contract regression" rather
than "write new" — the row's contribution is that this pre-existing test also now satisfies
the cross-package gate, not that it needs new code.

**This is why the total is 16 new tests, not 17**, and why the after-count differs from the
brief's "428 passed" by exactly one.

## 4. Verification

- **Baseline** (this worktree, immediately after the Package A2 precondition-fix merge, before
  any test file was touched): `411 passed, 3 failed` (414 collected) — the 3 are F-62
  (`test_auth.py::TestReviewLogin::test_last_active_set_to_today` and the two
  `test_scheduler.py` tests), already triaged in `qa/reports/triage-2026-09-13.md` as failing
  whenever the machine is in IST between 00:00 and 05:30, independent of any sprint work.
- **After** (16 new tests added): **430 collected**. Running the full suite three times over
  the course of this session (the F-62 failures are time-of-day dependent, so the exact
  composition moved):
  - Run 1 (early, still inside the IST F-62 window): `5 failed, 425 passed` — F-62's 3, plus
    R-03 and R-01 (R-01 not yet understood as a bug at that point — see below), plus a
    flaky, unrelated `test_import.py::TestGoodreadsImport::
    test_import_skips_already_imported_book` (did not recur in 2 later full runs; not caused
    by anything in this change — I never touched `test_import.py` or `import_router.py` —
    logged here as an observed pre-existing flake, not fixed, per "don't fix out-of-scope
    issues").
  - Run 2 (past the F-62 window): `4 failed, 426 passed` — F-62 now green; R-01, R-03, R-07
    failing.
  - **Diagnosed R-01 as a bug in my own test**, not a product regression:
    `test_feed_top_level_keys_unchanged` called `/notes/feed` with the default `limit=50`, and
    the shared in-memory test DB already holds 100+ notes other tests seeded with `created_at`
    pushed years into the future (the F-08 query-count tests' own fixture). Ordered
    `created_at desc`, my note (today's real timestamp) fell past position 50 and simply never
    appeared. Fixed using this file's own established pattern for exactly this situation —
    `_forward_date(db, note_id)` plus `?limit=200` (the same fix `test_note_list_outputs_
    unchanged_apart_from_book_keys` already uses, immediately above in the same file).
  - Run 3 (after the R-01 fix, past the F-62 window): **`3 failed, 427 passed`** — exactly
    R-03, R-07, R-12 (the three documented findings from §2), no F-62, no `test_import.py`
    flake.
  - Standalone re-run of all 16 new tests together (not the whole suite): **`3 failed, 13
    passed`** — the identical three failures, confirming they are deterministic content
    mismatches, not order-dependent (unlike the R-01 bug I had already fixed by this point).

- **Numbers versus the brief's expectation, explained:**
  - Expected: `428 passed` + the same 3 F-62 failures (431 collected).
  - Actual: `427 passed, 3 failed` (430 collected).
  - Difference #1 (`430` vs `431` collected): R-13 added no new test id — see §3. 16 new
    tests, not 17.
  - Difference #2 (the 3 failures are not F-62): F-62 is a time-of-day bug (UTC-write vs
    local-date-read) that only manifests in IST between 00:00 and 05:30; every full-suite run
    in this session after the first happened to land outside that window, so F-62 is currently
    green. In its place, 3 of my own new tests fail *by design* — they assert §9's literal
    wording and the merged tree does not match it (see §2). If this suite is run again inside
    the IST F-62 window, expect **6** failures (F-62's 3 plus these 3), not 3 — that is not a
    new regression, it is two independent, already-explained effects landing in the same run.

## 5. Files touched

- `tests/test_notes.py` — `TestNoteShapeRegression` (R-01..R-04)
- `tests/test_notifications_api.py` — `TestPrefsRegression` (R-05, R-06)
- `tests/test_follow_profile.py` — `TestProfileRegression` (R-07)
- `tests/test_books.py` — `TestUserbookRegression` (R-10); one method added to
  `TestPatchUserbookValidation` (R-11); `TestImportRegression` (R-19)
- `tests/test_groups.py` — `TestGroupsRegression` (R-12, R-14)
- `tests/test_reading_activity.py` — one method added to `TestDailyStats` (R-16); one method
  added to `TestInsights` (R-15)
- `tests/test_admin.py` — `TestAdminRegression` (R-17)
- `tests/test_googlebooks.py` — `TestSearchRegression` (R-18) — this file already existed
  (added by the Package A2 merge) with a ready-made `_fake_google` fixture; reused it rather
  than building a new one
- Nothing under `app/`, `tests/conftest.py`, or either client app was touched (other than the
  Package A2 precondition merge in §0, which is git history, not authored app code).

---

## PM resolution — 2026-09-18

**Verification of "pre-existing":** the three failing tests (R-03, R-07, R-12) were run against a throwaway worktree at `beb7058` (the pre-4A backend) with only these test files overlaid. All three fail there with **byte-identical assertion errors**: the same `user_id`, the same `200 == 403`, and the same extra `invited_by_name`. So 4A introduced **no shape regression**; section 9 described contracts the code never had.

**How each was resolved:**

| Row | Was it a bug? | Resolution |
|---|---|---|
| R-12 | No. `invited_by_name` is an additive key sent by `groups_router.py:211`. | Expected set is now `G16 \| {"invited_by_name"}`. |
| R-07 | No. `/profile/{id}` gates a private profile with the public card, `locked: true` and `stats: null`, which is standard private-account behaviour; the content endpoints are the ones that 403. | Test asserts `200`, `locked is True` and `stats is None`. |
| R-03 | **Yes, a real user-facing bug (F-63).** | **Fixed in code**; see below. |

**F-63:** `/notes/user/{id}` never computed the viewer's like state, so `liked_by_me` and `user_has_liked` were the schema default `False` for every viewer. Both clients read those keys on another user's profile: web `UserProfilePage` uses `liked_by_me`, and Android `UserProfileScreen` uses `user_has_liked`. Every heart showed empty, even on notes the viewer had liked. Tapping one sent a second **like** instead of an unlike, so a like could never be removed from a profile page.

- Before 4A, that second like wrote a duplicate `like` row. This is a plausible source of the duplicates F-53's dedupe removes.
- After 4A, the new unique constraint rejects it, but the UI still adds 1 optimistically, so the count drifts until reload.

The fix is one batched query per request (the pattern already used at `notes_router.py:353`), setting both keys so **both clients are fixed with no client change and no Android rebuild**. Test-first: the corrected R-03 failed with `assert False is True` before the fix and passed after.

**Final:** `pytest tests -q` → **430 passed, 0 failed**. The F-62 tests also pass, because this run was outside the 00:00–05:30 IST window.
