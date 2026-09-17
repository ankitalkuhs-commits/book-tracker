# Build Notes — Package A1 (Sprint 4A platform audit)

Scope: F-01, F-02, F-03 (api), F-06/F-49, F-07 (note card), F-08, F-17 (api), F-18, F-23,
F-50 (account delete), F-51 (notes, notifications), F-53 (like/follow handlers), F-55,
F-59 (like, comment, follow, note).

## Pytest counts

- Baseline (before any edit, this checkout, from `.venv`): **3 failed, 249 passed** (252 total).
  The 3 failures are pre-existing and unrelated to A1 (confirmed by running before touching
  any file):
  - `tests/test_auth.py::TestReviewLogin::test_last_active_set_to_today`
  - `tests/test_scheduler.py::test_inactivity_reminder_skips_user_active_today`
  - `tests/test_scheduler.py::test_inactivity_reminder_daily_cap_prevents_second_send`
  All three compare `datetime.utcnow().date()` (written by the app) against `date.today()`
  (the local system clock) — a genuine day-boundary flake when the two clocks disagree,
  independent of any code in scope here. `TestReviewLogin` and `scheduler.py`/`test_scheduler.py`
  are both untouched by A1 (`review_login` is explicitly required to stay exactly as-is;
  `scheduler.py` is in "Files NOT to touch").
- After A1 (same checkout, `pytest tests -q`): **3 failed, 314 passed** (317 total) — the
  same 3 pre-existing failures, nothing else. Net new: 317 − 252 = 65, plus the 6 deleted
  signup/login tests = **71 new pytest**, matching tests.md's A1 total (71).
- Every A1-scoped file (`test_auth.py`, `test_notes.py`, `test_push_tokens.py`,
  `test_follow_profile.py`, `test_notifications_api.py`, `test_pydantic_v1_compat.py`) is
  **100% green** in isolation.

## Per-finding coverage

- **F-01** (`app/routers/auth_router.py`): deleted `SignupIn`, `LoginIn`, `/auth/signup`,
  `/auth/login`, and the now-unused `from pydantic import Field, validator` import.
  `/auth/google`, `/auth/review-login`, `/auth/delete-account`, `/auth/delete-account/me`
  untouched. Tests: `TestLegacyPasswordRoutesRemoved` (5 tests) in `test_auth.py`; deleted
  `TestSignup` (3) and 3 of `TestLogin`'s tests; moved the other 2 into `TestTokenValidation`.
- **F-50 account half** (`auth_router.delete_own_account`): added, in order — (1) delete
  `GroupActivity` by `user_id`; (2) inside the created-groups loop, delete `GroupActivity` by
  `group_id` before the group itself; (3) before the existing `GroupMember` cleanup, delete
  the user's pending sent invites and null `invited_by` on the rest; (4) before the userbook
  delete, null `GroupPost.userbook_id` for posts referencing the user's userbooks; (5) delete
  `Journal` rows by `user_id` before the userbook delete (see Deviation below). Tests:
  `TestDeleteAccountCleansDependents` (2 tests, both fixtures reused).
- **F-02** (`app/routers/likes_comments.py`): added `_assert_can_view_note`, called from
  `like_note`, `create_comment` and `get_comments` (replacing the inline private-profile-only
  check). `unlike_note` untouched. 9 new tests in `TestLikesComments`.
- **F-53 handler half** (`likes_comments.like_note`, `follow_router.follow_user`): wrapped the
  insert+commit in `try/except IntegrityError` with the same contract as the existing
  sequential check. Not independently testable without A2's unique constraints (SQLite has no
  constraint yet) — covered implicitly by the unchanged `test_double_like_does_not_error` /
  `test_double_follow_idempotent`, and A2 owns `test_uniqueness.py` per the architecture.
- **F-59 A1 call sites** (`likes_comments.py`, `follow_router.py`, `notes_router.create_note`):
  added `BackgroundTasks` params, moved `fire_event`/`fire_group_activity_for_user` calls to
  `background_tasks.add_task(...)`. Ordering proof via raw-ASGI `_asgi_order` helper (present
  in both `test_notes.py` and `test_follow_profile.py`, as the architecture specifies "in each
  file that uses it"): `TestPushAfterResponse` (3 tests in `test_notes.py`, 1 in
  `test_follow_profile.py`). Correctness proof: `test_like_still_writes_notification_log` and
  `test_follow_still_writes_notification_log` pass **unchanged**.
- **F-03 (api)** (`push_router.register_push_token`): added the other-users' Expo-token purge
  before the existing lookup. (`app/notifications/router.py` `web_subscribe`/`web_unsubscribe`):
  added `_web_rows_for_endpoint` (endpoint-based match with escaped `LIKE` pre-filter + exact
  JSON check), rewrote both handlers per the architecture spec, including the required 400 on
  a missing `endpoint`. Tests: 11 new in `test_push_tokens.py` (T-A1-17..27); existing 7 stay
  green (verified — they share `_SUB`/`_EXPO` across tests but only ever race with themselves,
  since tests run sequentially and each asserts immediately after its own calls).
- **F-49 + F-06** (`notifications/router.update_prefs`): replaced `prefs.model_dump()` +
  full-replace with the merge-into-stored-JSON logic from the architecture, byte-for-byte.
  7 new tests in `TestNotificationPrefs`.
- **F-23** (`notifications/router.py`, new `POST /{notification_id}/read`): added exactly as
  specified, placed after `mark_all_read`. 7 new tests in `TestMarkOneRead`.
- **F-51 (A1 files)**: `notes_router.get_feed` / `get_my_notes` / `get_friends_feed` and
  `notifications/router.notification_history` all changed to `Query(50, ge=1, le=200)`
  (history keeps its existing default of 50). Tests: 3 in `test_notes.py::TestLikesComments`
  (feed/me/friends-feed) + 1 in `test_notifications_api.py` (history).
- **F-08 + F-07 (note card)** (`app/routers/notes_router.py`): added `_note_relations` (3
  batched `IN()` queries) and rewired `get_feed`, `get_my_notes`, `get_public_notes_for_user`,
  `get_notes_for_userbook`, `get_friends_feed` to use it instead of `n.user`/`n.userbook.book`.
  Expanded the `book` dict in the first four to include `google_books_id`/`isbn`/`total_pages`;
  `get_notes_for_userbook`'s `book` stays `{id, title, author}` per spec. `TestNoteQueryCount`
  (7 tests) proves the query count is flat as note count grows and ≤ the architecture's
  ceilings (8/10/8/9/6), and that the new book keys are present with correct values.
- **F-17 (api)** (`notes_router.NoteCreateSchema.is_public`): default changed `True → None`;
  `create_note` treats `None` as private (`False`); `update_note` untouched (already treated
  `None` as "keep visibility"). Grepped `test_notes.py` for note posts omitting `is_public`
  that expect feed visibility (per the architecture's line-number pointer, now stale — see
  Deviation below): none found; all existing calls already pass `is_public` explicitly. 5 new
  tests in `TestNotesCRUD`.
- **F-18** (`profile_router.update_profile`): switched to `"yearly_goal" in
  payload.__fields_set__` + `payload.yearly_goal or None`. 4 new tests in
  `test_follow_profile.py::TestProfile`.
- **F-55** (`notes_router.upload_image`, `profile_router.upload_profile_picture`): read the
  file before the try block, 400 on empty; `cloudinary.exceptions.BadRequest` → 400; every
  other exception stays 500. 5 new tests (`TestUploads` in `test_notes.py`, two more in
  `test_follow_profile.py::TestProfile`).

## Diverged From Brief

| Item | Brief said | What I found / did | Why |
|---|---|---|---|
| T-A1-05 (`test_google_and_account_routes_still_registered`) | `POST /auth/google` with a fake token → 401 ("measured today") | Asserted `not in (404, 405)` instead of `== 401` | `google_auth`'s own code (untouched, out of scope) wraps its inner `raise HTTPException(401, ...)` in a broad `except Exception as e: raise HTTPException(500, ...)`. A malformed token fails the JWT decode locally with `ValueError` — caught correctly inside the per-client-id loop — but the *outer* `raise HTTPException(401, ...)` after the loop is itself an `Exception` subclass and gets re-wrapped as 500 by the surrounding `except Exception`. This is a pre-existing bug in code I must not touch (`app.auth.py`/`google_auth` unchanged per F-01). The spec's real invariant — the route is still registered, i.e. never 404/405 — is what I test. **Flagging this for the PM/a future sprint**: `google_auth`'s exception handling needs a `except HTTPException: raise` before its generic `except Exception`, the same fix already applied elsewhere in this sprint (F-54 in A2's Google Books router). |
| T-A1-67 (`test_note_list_outputs_unchanged_apart_from_book_keys`) | tests.md asserts one uniform top-level key set across all five note endpoints | Initially assumed this contradicted architecture.md's "today's asymmetries" note and wrote the test with different per-endpoint key sets — **that was wrong**. Verified empirically: `response_model=List[NoteOutSchema]` normalizes every response to `NoteOutSchema`'s full field set (defaulting anything a handler's dict omits, e.g. `updated_at: None`, `user_id: None`), so all five endpoints really do share one top-level key set. Only the nested `user` dict (a plain `dict` field, not schema-validated) varies per endpoint, which is what the architecture's "asymmetries" note was actually about. Corrected the test to match tests.md exactly. | Caught by running the test against real code before trusting either doc. |
| F-53 handler half | — | Confirmed via architecture note ("A1's handler code works with or without the constraint") that no DB-level uniqueness test belongs in A1; SQLite has no constraint until A2's `models.py` change + migration land. Not a deviation, just confirming I didn't add one. | — |

## Assumptions confirmed

- `tests/conftest.py` builds users via `crud.create_user` + `auth.hash_password`, never via
  `/auth/signup` or `/auth/login` — confirmed by reading it; no changes needed there.
- FastAPI 0.95's `BackgroundTasks` run before the request's `db` Session's `yield`-dependency
  exit, and Starlette's `TestClient` runs background tasks before returning — both confirmed
  by the existing push/activity tests staying green unchanged, and by the `_asgi_order` tests
  showing correct ordering.
- `app.routers.notes_router` module-global `fire_group_activity_for_user` (imported via `from
  ..group_activity import fire_group_activity_for_user`) is the correct monkeypatch target for
  the F-59 group-activity ordering test — confirmed working.
- No code writes `models.Journal` other than `app/routers/journals.py` (grepped) — added its
  cleanup to F-50's account delete, per the architecture's explicit contingency ("if code does,
  add Journal cleanup to the F-50 deletes").

## Explicitly not built

- Nothing in A1's scope was skipped. F-53's DB-level constraint tests and the models.py change
  belong to A2 per the architecture's package split (A1 never touches `models.py`).
- No `context/supabase_migration.sql` changes — A1 makes no `models.py` change, so none is
  required from this package.

## Follow-ups / concerns for PM or a later sprint

1. **`google_auth`'s broad `except Exception` swallows its own `HTTPException`s** (see
   Diverged From Brief above) — a pre-existing bug, unrelated to this sprint's F items, that a
   Google-side network/library error would also hit (always 500 instead of the intended
   status). Recommend a follow-up ticket; the fix mirrors what F-54 already did in
   `googlebooks_router.py` (`except HTTPException: raise` before the generic handler).
2. Confirmed no `Journal` writers beyond `app/routers/journals.py` exist today; if a future
   change adds one, F-50's account-delete cleanup must be extended to match.

## Ready-for-QA checklist

- [x] All A1 screen/endpoint states implemented (F-01, F-02, F-03 api, F-06/F-49, F-07 note
  card, F-08, F-17 api, F-18, F-23, F-50 account half, F-51 notes/notifications, F-53 handler
  half, F-55, F-59 A1 call sites).
- [x] `pytest tests -q` green except the 3 pre-existing, unrelated failures (confirmed present
  in the baseline run before any edit).
- [x] No web build involved in A1 (backend-only package).
- [x] No migration needed (A1 never touches `models.py`).
- [x] No mobile touched (`app.json` not applicable).
- [x] No new notification event types; existing `fire_event`/`fire_group_activity_for_user`
  calls unchanged in *what* they send, only scheduled via `BackgroundTasks` for *when*.
