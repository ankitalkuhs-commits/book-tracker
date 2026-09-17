---
screen: sprint-4a-platform-audit
feature: maintenance
test_plan_written: 2026-09-13
last_run: —
pass_rate: —
written_by: Senior QA (before Builder; no build code exists or was read)
sources: spec.md (approved + orchestrator resolutions Q1–Q4 2026-09-13), architecture.md (amended: right-most XFF, 2c absorb rule), triage-2026-09-13.md (F-01..F-60 + PM rounds 1–2), adversarial/scenarios/interactions/api-perf/a11y reports 2026-09-13, dependency-map.md, tests/conftest.py, qa/inventory/mobile-*.json, book-tracker-mobile-stitch/src (2.2.1 payloads)
baseline_measured: 2026-09-13 on c36a21b working tree — pytest 252 passed; web eslint 44 problems (37 errors, 7 warnings); i18n en 500 keys, de/es/fr/pt 468, ru 478 (+10 extra)
---

## How to read this plan

- Cases are grouped by work package (A1, A2, B1, B2, C), then by requirement id (R-F..).
- Case ids: `T-<pkg>-NN` pytest · `ST-<pkg>-NN` static check · `L-<pkg>-NN` local Playwright (local dev web + local API; never production) · `P-NN` production check after deploy · `G-NN` migration / deploy gate · `R-NN` regression.
- **Severity:** Critical = privacy / auth / ownership / data integrity / feature dead. Major = core flow broken or measurable perf target. Minor = cosmetic / defensive. **Every privacy, auth and data-integrity case is Critical and must never be downgraded.**
- **Priority:** P0 ship blocker · P1 fix within sprint · P2 nice to have.
- "Fresh user" = `_make_user(db, email="<case-unique>@example.com")` from `tests/conftest.py`; never reuse alice/bob for rows other tests count. After any request, call `db.expire_all()` before reading rows (the request used another Session on the shared in-memory DB).
- Exact response key sets quoted below were **measured on the pre-sprint code** (2026-09-13, scratch script) so "additive only" can be asserted as set equality.

---

## 0. Findings from writing this plan — read before building

| # | Finding | Impact on this plan | Owner |
|---|---|---|---|
| K-01 | `npm run lint` **fails today** (37 errors, 7 warnings, none from 4A). "lint must pass" cannot be met without out-of-scope edits. | W-02 criterion: total errors ≤ 37 and 0 problems in the files 4A creates. | B1/B2/C |
| K-02 | i18n locales are **not at parity today**: de/es/fr/pt each miss 32 en keys, ru misses 32 and has 10 extra. | B2-S07 criterion: all 12 new keys in all 6 locales, and no locale's missing-key count grows. | B2 |
| K-03 | Brief says "an extra key → 200", but existing `test_patch_no_valid_fields` sends `{"unknown_field": "x"}` alone and expects 400. Both hold only if "extra key" means *alongside a valid key*. | T-A2-05 uses `{"status":"reading","hacker":1}` → 200; `{"unknown_field":"x"}` alone stays 400. | A2 |
| K-04 | `qa/adversarial_probe.py` calls `/api/googlebooks/search` **anonymously** in `add_book` and in `run_state (a)`. After F-29 the 3rd anonymous call gets 401, so probe #153/#154 are skipped and #167 becomes INFO. Probe #155 (`DELETE /userbooks/864`) is coded `FAIL if 500 else INFO` and **can never PASS**. Probes #135–#137 (`days=0/-1/100000`) flip PASS→INFO by design (422 now). | P-06 requires a 2-line harness edit (send the reader token on those two searches) and gives exact post-sprint totals. | QA harness (not a Builder) |
| K-05 | `qa/scenarios_web.mjs` S1 posts from the Home composer with no visibility choice. After F-17 web it posts **Only me**, gets the "Saved privately" toast and no card, so S1 "post appears" fails by design. | P-12 requires S1 to click the **Public** radio before Post. | QA harness |
| K-06 | **Cloudflare sits in front of Render** (adversarial #165 returned a Cloudflare 400 page). The right-most `X-Forwarded-For` entry may be a Cloudflare edge IP, not the client. If so, every anonymous visitor behind one POP shares one 2-call quota. | P-08 step 4 detects this from a second egress IP. Architect should confirm Render/Cloudflare header semantics (`CF-Connecting-IP` / `True-Client-IP`) **before** deploy. Critical. | Architect |
| K-07 | F-53 STEP 2 is **not re-runnable after new duplicates appear**: `CREATE TABLE IF NOT EXISTS dedupe_20260913_*` keeps the first snapshot, so 2c/2e/2f act on stale ids and STEP 3 keeps failing. | G-03: run STEP 3 immediately after STEP 2; if STEP 3 errors, stop and get a follow-up script from the Architect. Do not re-run STEP 2. | Architect / PM |
| K-08 | SQLite tests run with foreign keys off, so the F-50 500 (FK violation) cannot be reproduced in pytest. | pytest asserts "no orphan rows"; P-06 #155 and Done-checklist item 4 are the production proof. | A1/A2 |
| K-09 | The pytest baseline is **252 passed**, not CLAUDE.md's stale "103/115". | Merge gate G-04: **433 passed, 0 failed** (252 − 6 deleted + 187 new), less any race test removed with a Build Notes reason (max 4). | A1/A2 |
| K-10 | F-29 production quota is per real IP, and P-06 probe #167 consumes 1 anonymous call. | P-08 must run from a different egress IP than P-06, or after a verified Render cold start. | Junior QA |
| K-11 | `interaction_audit.mjs` classifies `urlAfter === '/'` (from a non-`/` page) as `LOGGED_OUT`. Back from a direct-opened `/privacy` goes to `/`, which redirects a logged-in visitor to `/home`, so OK is expected. If the redirect has not happened when the URL is read, the harness reports LOGGED_OUT. | P-16: LOGGED_OUT with a non-blank screenshot and a still-valid session is a harness misclassification, not a FAIL. | Junior QA |
| K-12 | Race handlers (IntegrityError paths) are hard to trigger deterministically on shared-cache SQLite. | T-A2 race tests may be dropped with a Build Notes reason; P-06 #144–#146 is the backstop. The three DB-constraint tests may **not** be dropped. | A2 |
| K-13 | Spec says the legacy routes return 404; the orchestrator allows 404/405. | T-A1-01/02 and P-03 accept 404 or 405; any other status fails. | A1 |
| K-14 | Friends-reading `user` today is `{id, is_mutual, name, username}`, and its `book` lacks `isbn`/`google_books_id`. `PUT /groups/{id}/book` returns 4 keys. `/groups/my` and `/groups/discover` return the same 16 keys as `_serialize_group`. | Exact expected key sets are written into T-A2-18..21 and R-12. | A2 |

---

## 1. Summary

| Package | pytest (new) | static | local Playwright | production checks | regression cases |
|---|---:|---:|---:|---:|---:|
| A1 API social/notes/push/auth/profile/notifications | 71 | 3 | — | 3 | 9 (7 of them new pytest) |
| A2 API catalogue/groups/insights/googlebooks/admin/platform/SQL | 99 | 5 | — | 4 | 11 (10 new pytest) |
| API shared (A1+A2) | — | — | — | 4 | — |
| B1 Web platform | — | 10 | 10 | 4 | 2 |
| B2 Web content pages | — | 10 | 13 | 3 | 1 |
| C Web styling | — | 6 | 2 | 1 | 1 |
| Web shared (B1+B2+C) | — | 3 | — | 1 | — |
| Android 2.2.1 acceptance | — | — | — | — | 2 |
| **Total** | **170 (+17 regression pytest = 187)** | **37** | **25** | **20** | **26** |

Migration and deploy-order gates: G-01..G-10 (section 7). Deleted tests: 6 (`TestSignup` ×3 and the 3 signup/login tests in `TestLogin`).

## 2. Package A1 — API: social, notes, push, auth, profile, notifications

### R-F01 · Legacy password routes removed — `tests/test_auth.py`
Delete `TestSignup` (3 tests) and `TestLogin::test_login_success`, `::test_login_wrong_password`, `::test_login_unknown_email`. Move `test_no_token_on_protected_endpoint` and `test_invalid_token_rejected` unchanged into `class TestTokenValidation` (they must stay green). `tests/conftest.py` is not edited: it builds users with `crud.create_user` + `auth.hash_password` and never calls a route (verified 2026-09-13).

| # | Case | Pytest `TestLegacyPasswordRoutesRemoved::` | Steps | Expected | Sev / Pri |
|---|---|---|---|---|---|
| T-A1-01 | signup gone | `test_signup_404` | `client.post("/auth/signup", json={"email":"f01_signup@example.com","password":"password123","name":"X"})` | status ∈ {404, 405}; `db` has no user with that email | Critical / P0 |
| T-A1-02 | login gone | `test_login_404` | `client.post("/auth/login", json={"email":"alice_f@example.com","password":"password123"})` | status ∈ {404, 405}; `"access_token" not in r.text` | Critical / P0 |
| T-A1-03 | not in schema | `test_legacy_routes_absent_from_openapi` | `client.get("/openapi.json").json()["paths"]` | no key `/auth/signup` or `/auth/login`; keys `/auth/google`, `/auth/delete-account`, `/auth/delete-account/me` present | Critical / P0 |
| T-A1-04 | nothing calls them | `test_no_test_or_fixture_calls_legacy_routes` | read every file under `tests/`, `qa/` (`*.py`, `*.mjs`), `scripts/`, `book-tracker-frontend-stitch/src/`, `book-tracker-mobile-stitch/src/` | the strings `/auth/signup` and `/auth/login` occur only in `tests/test_auth.py` | Critical / P0 |
| T-A1-05 | surviving auth routes still registered | `test_google_and_account_routes_still_registered` | (a) `POST /auth/google {"token":"not-a-real-token"}`; (b) `POST /auth/delete-account/me` with no token; (c) `POST /auth/delete-account {"email":"nobody-f01@example.com"}` | (a) 401 (measured today), never 404/405; (b) 401; (c) 200 `{"message": "Account deletion request received"}`. `TestReviewLogin` (all 30) stays green unchanged | Critical / P0 |

### R-F50 (account half) · `tests/test_auth.py::TestDeleteAccountCleansDependents`

#### T-A1-06 — account delete leaves no FK orphans · Critical / P0
**Pytest:** `test_delete_account_leaves_no_fk_orphans`
**Steps:**
1. Fresh users U (victim), W, V, X.
2. As U: `POST /groups/ {"name":"F50 U circle","is_private":false}` → `g1`. As V: `POST /groups/{g1}/join` (writes a `member_joined` GroupActivity in g1).
3. As W: `POST /groups/ {"name":"F50 W circle","is_private":false}` → `g2`. As U: `POST /groups/{g2}/join` (GroupActivity with `user_id=U` in g2).
4. Direct DB inserts in g2: `GroupMember(group_id=g2, user_id=V, status="pending", invited_by=U.id)` and `GroupMember(group_id=g2, user_id=X, status="active", invited_by=U.id)`.
5. As U: `POST /books/add-to-library {"title":"F50 acct","total_pages":100,"status":"reading"}` → `ub`; `PUT /userbooks/{ub}/progress {"current_page":10}` → 200.
6. Direct DB insert: `GroupPost(group_id=g2, user_id=W.id, text="F50 W post", userbook_id=ub)` → `gp`.
7. As U: `POST /auth/delete-account/me`.

**Expected:** step 7 → 200 `{"message": "Account deleted"}`. Then, after `db.expire_all()`:
- no `User` with id U;
- `GroupActivity` where `user_id == U.id` → 0 rows; where `group_id == g1` → 0 rows; `ReadingGroup` g1 → gone;
- `GroupMember` where `invited_by == U.id` → 0 rows. The pending V row in g2 is deleted. The active X row in g2 still exists, with `invited_by is None`;
- `GroupPost` gp still exists, with `userbook_id is None`;
- `ReadingActivity` where `user_id == U.id` → 0; `UserBook` where `user_id == U.id` → 0.

#### T-A1-07 — account delete keeps other users' rows · Critical / P0
**Pytest:** `test_delete_account_keeps_other_users_rows`
**Steps:** the same fixture as T-A1-06, then read W's and X's data.
**Expected:** g2 exists; W's GroupMember (curator) row and X's active row exist; `GET /groups/{g2}/posts` as W → 200 and still contains gp; W's `GET /profile/me` → 200.

### R-F02 · Visibility on likes and comments — `tests/test_notes.py::TestLikesComments`
Fixture per test: fresh `owner`, `stranger`. `priv = POST /notes/ {"text":"F02 private","is_public":false}` as owner → 201.

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A1-08 | `test_like_private_note_404` | stranger `POST /notes/{priv}/like` | 404 `{"detail":"Note not found"}`; 0 `Like` rows with `note_id=priv`; 0 `NotificationLog` (user_id=owner, event_type=`post_liked`, actor_id=stranger) | Critical P0 |
| T-A1-09 | `test_comment_private_note_404` | stranger `POST /notes/{priv}/comments {"text":"F02 sneaky"}` | 404 `{"detail":"Note not found"}`; 0 `Comment` rows on priv | Critical P0 |
| T-A1-10 | `test_get_comments_private_note_404` | owner comments `{"text":"owner only"}` (201); stranger `GET /notes/{priv}/comments` | 404; body does not contain `owner only` | Critical P0 |
| T-A1-11 | `test_follower_cannot_like_or_comment_private_note_404` | stranger `POST /follow/{owner}` (200); then like, comment and GET comments on priv | all three 404. Following never exposes an `is_public=false` note | Critical P0 |
| T-A1-12 | `test_comment_private_profile_non_follower_403` | owner `PUT /profile/me {"is_private_profile":true}`; `pub = POST /notes/ {"text":"F02 pub","is_public":true}`; stranger (not following) like, comment and GET comments on pub | like 403, comment 403, GET 403, each `{"detail":"This profile is private"}`; 0 Like and 0 Comment rows on pub | Critical P0 |
| T-A1-13 | `test_refused_comment_writes_no_notificationlog` | count `NotificationLog` where `user_id=owner` → n0; run the refused comment of T-A1-09 and T-A1-12 | count still n0 | Critical P0 |
| T-A1-14 | `test_refused_like_writes_no_notificationlog` | as T-A1-13 with the refused likes | count still n0 | Critical P0 |
| T-A1-15 | `test_follower_can_like_and_comment_private_profile_public_note` | follower `POST /follow/{owner}` **before** owner goes private; owner private; pub note; follower like, comment `{"text":"F02 follower"}`, GET comments | like 201 `{"message":"Liked","liked":true}`; comment 201 with keys `{created_at,id,text,user}`; GET 200 containing `F02 follower`; `NotificationLog` rows for owner: 1 `post_liked` and 1 `post_commented` with `actor_id=follower` | Critical P0 |
| T-A1-16 | `test_owner_can_like_and_comment_own_private_note` | owner like priv, comment `{"text":"note to self"}`, GET comments | 201, 201, 200 with 1 comment; 0 NotificationLog rows with `actor_id == user_id == owner` | Critical P0 |

`unlike_note` is unchanged: existing `test_unlike_note` stays green.

### R-F03-api · One owner per push token — `tests/test_push_tokens.py`
Every test uses its own users and `E = f"https://fcm.googleapis.com/fcm/send/{uuid4().hex}"` / `TOK = f"ExponentPushToken[f03-{uuid4().hex[:12]}]"`, because the DB is shared and `_SUB` is reused. `SUB(E) = {"endpoint": E, "keys": {"p256dh": "k", "auth": "a"}}`. The existing 7 tests stay green unchanged.

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A1-17 | `test_register_token_owned_by_other_user_moves_row` | A `POST /push-tokens/ {"token":TOK}`; B the same | both 200 `{"message":"Push token registered"}`; `PushToken` where `token==TOK, token_type=="expo"` → exactly 1 row, `user_id==B.id`; A's expo rows → 0 | Critical P0 |
| T-A1-18 | `test_user_a_gets_no_push_after_token_moves` | after T-A1-17's steps, monkeypatch `app.notifications.dispatcher.send_expo_push` with a spy `(db, user_id, title, body, data)` that records `[t.token for t in expo rows of user_id]`; call `fire_event(db=db, event_type="new_follower", actor_id=B.id, actor_name="B", recipient_ids=[A.id], extra={})`, then the same with `recipient_ids=[B.id]` | spy recorded `[]` for A and `[TOK]` for B | Critical P0 |
| T-A1-19 | `test_register_expo_does_not_touch_other_users_web_rows` | A `POST /notifications/web-subscribe {"subscription":SUB(E),"device_info":"qa"}`; B registers a new TOK | A's web rows = 1 (E); A's row id unchanged | Critical P0 |
| T-A1-20 | `test_web_subscribe_same_endpoint_moves_between_users` | A subscribes E; B subscribes E | both 200 `{"message":"Web push subscription registered"}`; web rows whose JSON `endpoint == E` → 1, `user_id == B.id` | Critical P0 |
| T-A1-21 | `test_web_subscribe_keeps_same_users_other_browser` | A subscribes E1, then E2 | A has exactly 2 web rows, endpoints {E1, E2} | Major P0 |
| T-A1-22 | `test_web_subscribe_same_endpoint_twice_single_row` | A subscribes E twice | A has 1 web row for E | Major P0 |
| T-A1-23 | `test_web_subscribe_key_order_does_not_duplicate` | A subscribes `{"endpoint":E,"keys":{"p256dh":"k","auth":"a"}}`, then `{"keys":{"auth":"a","p256dh":"k"},"expirationTime":null,"endpoint":E}` | A has 1 web row for E | Major P0 |
| T-A1-24 | `test_web_unsubscribe_matches_by_endpoint` | A subscribes E1, E2; `client.request("DELETE","/notifications/web-unsubscribe", json={"subscription":{"endpoint":E1,"keys":{"p256dh":"different","auth":"different"}}}, headers=A)` | 200; A's web rows = [E2] | Critical P0 |
| T-A1-25 | `test_web_unsubscribe_cannot_remove_other_users_row` | A subscribes E; B sends that DELETE with E | 200 (response unchanged); A still has the E row | Critical P0 |
| T-A1-26 | `test_web_subscribe_without_endpoint_400` | A `POST /notifications/web-subscribe {"subscription":{"keys":{"p256dh":"k","auth":"a"}}}` | 400 `{"detail":"subscription.endpoint is required"}`; A's web row count unchanged | Major P1 |
| T-A1-27 | `test_endpoint_with_like_wildcards_matched_exactly` | `Ea = base+"/abc_%"`, `Eb = base+"/abcX1"` (same base); A subscribes Eb; B subscribes Ea; then B unsubscribes Ea | A still has its Eb row after both calls (the LIKE is escaped and the JSON endpoint is compared exactly); B has 0 rows | Critical P0 |

### R-F49 + F-06 · Notification preferences — `tests/test_notifications_api.py` (new)
`K7 = {"new_follower","post_liked","post_commented","book_completed","reading_streak_reminder","group_invite","group_join_request"}` (measured response key set of `GET /notifications/prefs`). Fresh user per test.

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A1-28 | `test_patch_prefs_full_body_200` | `PATCH /notifications/prefs` with all 7 keys `false` | 200; `set(body) == K7`; every value `False`; `GET /notifications/prefs` equal | Critical P0 (feature dead today) |
| T-A1-29 | `test_patch_prefs_partial_preserves_other_keys` | PATCH `{"new_follower": false}` → then PATCH `{"post_liked": false}` → GET | 2nd response and GET: `new_follower False`, `post_liked False`, other 5 `True` | Critical P0 |
| T-A1-30 | `test_patch_prefs_extra_keys_ignored` | PATCH `{"post_commented": false, "totally_unknown_key": true, "book_added": false}` | 200; `set(body) == K7`; `post_commented False`; stored `json.loads(user.notification_prefs)` has no `totally_unknown_key` and has `book_added == book_completed == True` | Major P0 |
| T-A1-31 | `test_patch_prefs_non_bool_422` | GET → before; PATCH `{"post_liked": {"x": 1}}` | 422; GET afterwards == before | Major P1 |
| T-A1-32 | `test_book_added_follows_book_completed` | PATCH `{"book_completed": false}` | 200; stored JSON `book_added is False`; then PATCH `{"book_completed": true}` → stored `book_added is True` | Major P1 |
| T-A1-33 | `test_patch_prefs_requires_auth_401` | PATCH with no token | 401 | Critical P0 |
| T-A1-34 | `test_history_limit_bounds_422` | `GET /notifications/history?limit=` 0, -1, 201, 200, 1 | 422, 422, 422, 200, 200 (`len ≤ 1`) | Major P1 |

**Pydantic v1 compatibility — `tests/test_pydantic_v1_compat.py` (new)**

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A1-35 | `test_no_pydantic_v2_api_in_app` | read every `app/**/*.py`; search for `model_dump(`, `model_validate(`, `model_fields_set`, `model_config`, `field_validator` | 0 hits; the failure message lists `file:line` | Critical P0 (the F-49 class) |
| T-A1-36 | `test_installed_pydantic_is_v1` | `import pydantic; pydantic.VERSION` | starts with `"1."` (run from `.venv`; system Python has 2.11) | Major P0 |

### R-F23 · Mark one notification read — `tests/test_notifications_api.py`
Fixture: fresh U and V; insert 3 rows `models.NotificationLog(user_id=U.id, actor_id=V.id, event_type="new_follower", title="t", body="b", is_read=False)` (the Builder adds any other NOT NULL column) → n1, n2, n3.

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A1-37 | `test_mark_one_read_only_that_row` | U `POST /notifications/{n2}/read` (no body) | 200, body exactly `{"id": n2, "is_read": true}`; DB: n2 `is_read True`, n1 and n3 `False` | Critical P0 |
| T-A1-38 | `test_mark_one_read_idempotent` | repeat the call twice | both 200 with the same body; n2 still True; n1, n3 still False | Major P0 |
| T-A1-39 | `test_mark_other_users_notification_404` | V `POST /notifications/{n1}/read` | 404 `{"detail":"Notification not found"}`; n1 still False | Critical P0 |
| T-A1-40 | `test_mark_unknown_notification_404` | U `POST /notifications/999999999/read` | 404, body byte-identical to T-A1-39's (no existence oracle) | Critical P0 |
| T-A1-41 | `test_unread_count_drops_after_mark_one` | U `GET /notifications/unread-count` → `{"unread": k}`; mark n1; GET; mark n1 again; GET | k, then k-1, then k-1 | Major P0 |
| T-A1-42 | `test_mark_one_read_requires_auth_401` | no token `POST /notifications/{n1}/read` | 401; n1 still False | Critical P0 |
| T-A1-43 | `test_mark_all_read_route_unchanged` | U `POST /notifications/mark-read` | 200 with body keys `{"message"}` (as today); n1, n2, n3 all True; the route is not shadowed by `/{id}/read` | Major P0 |

### R-F17 (api) · Notes private by default — `tests/test_notes.py::TestNotesCRUD`

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A1-44 | `test_create_without_is_public_is_private` | fresh author `POST /notes/ {"text":"F17 default"}` | 201, `is_public` false; `GET /notes/me` row `is_public False` | Critical P0 |
| T-A1-45 | `test_explicit_public_still_in_feed` | `POST /notes/ {"text":"F17 public","is_public":true}`; viewer `GET /notes/feed?limit=200` | 201 `is_public true`; feed contains the id | Critical P0 |
| T-A1-46 | `test_update_without_is_public_keeps_private` | create `is_public:false`; `PUT /notes/{id} {"text":"edited"}` | 200; row `is_public False`, text `edited`; absent from feed | Critical P0 |
| T-A1-47 | `test_update_without_is_public_keeps_public` | create `is_public:true`; `PUT {"text":"edited","quote":"q"}` | 200; row `is_public True`; still in feed | Critical P0 |
| T-A1-48 | `test_default_private_note_absent_from_all_feeds_and_group_activity` | author in a public group (`_create_group`); viewer follows author; author `POST /notes/ {"text":"F17 never public"}` (no key) | the id is absent from viewer's `/notes/feed?limit=200`, `/notes/friends-feed?limit=200`, `/notes/user/{author}`; `_note_posted_events(client, h, gid) == []` | Critical P0 |

Builder: grep `tests/` for note posts without `is_public` that expect feed visibility (check `test_notes.py:37,501,518`, whose bodies span lines). Fix those as stale expectations and list them in Build Notes.

### R-F18 · Clear yearly goal — `tests/test_follow_profile.py::TestProfile`

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A1-49 | `test_put_yearly_goal_null_clears` | `PUT /profile/me {"yearly_goal": 24}` → then `{"yearly_goal": null}` | 200 with `yearly_goal 24`, then 200 with `yearly_goal None`; `GET /profile/me` → None | Major P0 |
| T-A1-50 | `test_put_yearly_goal_zero_clears` | goal 24, then `{"yearly_goal": 0}` | 200; `yearly_goal None` (not 0) | Major P1 |
| T-A1-51 | `test_put_without_yearly_goal_keeps_it` | goal 24; `PUT {"bio":"F18 bio"}`; `PUT {"name":"F18","bio":"b"}`; `PUT {"is_private_profile": false}` | `yearly_goal` stays 24 after each | Critical P0 (silent data loss) |
| T-A1-52 | `test_insights_goal_null_after_clear` | goal 12; `GET /reading-activity/insights` → `yearly_goal` is a dict; clear with null; GET again | `yearly_goal` is None | Major P1 |

### R-F55 · Bad uploads return 400
Each test monkeypatches `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` and `cloudinary.uploader.upload`.

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A1-53 | `test_notes.py::TestUploads::test_rejected_image_400` | upload raises `cloudinary.exceptions.BadRequest("Invalid image file")`; `POST /notes/upload-image files={"file":("evil.png", b"plain text", "image/png")}` | 400 `{"detail":"Invalid image file"}` | Minor P1 |
| T-A1-54 | `test_notes.py::TestUploads::test_empty_file_400` | spy upload; `files={"file":("empty.png", b"", "image/png")}` | 400 `{"detail":"File is empty"}`; spy call count 0 | Minor P1 |
| T-A1-55 | `test_notes.py::TestUploads::test_upload_other_error_still_500` | upload raises `RuntimeError("network down")` | 500 (configuration or network failures stay 500) | Minor P2 |
| T-A1-56 | `test_follow_profile.py::TestProfile::test_avatar_rejected_image_400` | as T-A1-53 on `POST /profile/me/picture` | 400 `{"detail":"Invalid image file"}`; `profile_picture` unchanged | Minor P1 |
| T-A1-57 | `test_follow_profile.py::TestProfile::test_avatar_empty_file_400` | as T-A1-54 on `/profile/me/picture` | 400 `{"detail":"File is empty"}` | Minor P1 |

### R-F51 (A1 endpoints) · Bounded list parameters
One test per endpoint; each asserts `limit=0 → 422`, `-1 → 422`, `201 → 422`, `200 → 200`, `1 → 200` (≤ 1 item), and on a 422 `detail[0]["loc"] == ["query","limit"]`.

| # | Pytest | Endpoint | Sev |
|---|---|---|---|
| T-A1-58 | `test_notes.py::TestLikesComments::test_feed_limit_bounds_422` | `GET /notes/feed` (authed) | Major P0 (500 today on -1) |
| T-A1-59 | `test_notes.py::TestLikesComments::test_my_notes_limit_bounds_422` | `GET /notes/me` | Major P0 |
| T-A1-60 | `test_notes.py::TestLikesComments::test_friends_feed_limit_bounds_422` | `GET /notes/friends-feed` | Major P1 |

(`/notifications/history` is T-A1-34.)

### R-F08 + F-07 note card · No N+1 — `tests/test_notes.py::TestNoteQueryCount`
Use the brief's `query_counter` fixture (a `before_cursor_execute` listener on `tests.conftest.engine`) and `_queries_for` helper. `_queries_for` makes a warm-up GET first, which absorbs the daily `last_active` write, then resets the counter and measures one GET. The fixture lives in `test_notes.py`, not in conftest. `_seed_public_notes(db, n, tag, *, owner=None, userbook=None)` creates n notes, each by a **distinct** author with its own Book + UserBook, with `created_at` in the future so they lead the shared feed. It commits, then calls `db.expire_all()`.

**Ceilings recorded from the brief** (SQLite, warm, +1 for `get_current_user`): `/notes/feed` ≤ 8 · `/notes/friends-feed` ≤ 10 · `/notes/me` ≤ 8 · `/notes/user/{id}` ≤ 9 · `/notes/userbook/{id}` ≤ 6. Today, 50 notes cost 114 queries.

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A1-61 | `test_feed_query_count_constant` | seed 50 (tag `f08feed`); viewer measures `/notes/feed?limit=5` → n_a (5 items), then `?limit=50` → n_b (50 items). *The limit method is used here because the shared DB already holds other tests' public notes, so growth by seeding is unreliable on this endpoint.* | `n_a == n_b`, `n_b ≤ 8` | Major P0 |
| T-A1-62 | `test_friends_feed_query_count_constant` | fresh viewer follows 5 seeded authors → `/notes/friends-feed?limit=50` → n_a (5 items); seed and follow 45 more → n_b (50 items) | `n_a == n_b ≤ 10` | Major P0 |
| T-A1-63 | `test_my_notes_query_count_constant` | fresh owner, 5 notes on 5 own userbooks → `/notes/me?limit=50` n_a (5 items); +45 → n_b (50 items) | `n_a == n_b ≤ 8` | Major P0 |
| T-A1-64 | `test_user_notes_query_count_constant` | fresh public author, 5 public notes on 5 userbooks; viewer `/notes/user/{id}` → n_a (5 items); +45 → n_b (20 items, route cap) | `n_a == n_b ≤ 9` | Major P0 |
| T-A1-65 | `test_userbook_notes_query_count_constant` | owner, 1 userbook, 5 notes → `/notes/userbook/{ub}` n_a (5); +45 → n_b (50) | `n_a == n_b ≤ 6` | Major P0 |
| T-A1-66 | `test_note_card_book_has_dedup_keys` | author adds `{"title":"F07 Card","google_books_id":"f07-card-gid","isbn":"f07-card-isbn","total_pages":321,"status":"reading"}` → ub; public note with `userbook_id=ub`; viewer follows author | `book` is exactly `{"id","title","author","cover_url","google_books_id","isbn","total_pages"}` with values `"f07-card-gid"`, `"f07-card-isbn"`, `321` on `/notes/feed?limit=200` and `/notes/friends-feed` (viewer), `/notes/me` (author), `/notes/user/{author}` (viewer). `/notes/userbook/{ub}` (author) `book` keys are exactly `{"author","id","title"}` | Critical P0 (4B contract) |
| T-A1-67 | `test_note_list_outputs_unchanged_apart_from_book_keys` | the T-A1-66 fixture plus a like and a comment | top-level keys on all five endpoints == `{book, chapter, comments_count, created_at, emotion, id, image_url, is_public, liked_by_me, likes_count, page_number, quote, text, updated_at, user, user_has_liked, user_id}` (measured pre-sprint). `user` keys: feed/me `{id,name,profile_picture,username}`; friends-feed `{id,is_mutual,name,profile_picture,username}`; user/{id} and userbook `{id,name}`. `created_at` ends in `Z`; `liked_by_me == user_has_liked`; `likes_count`/`comments_count` correct (1/1) | Critical P0 (shape contract, 7 consumers) |

### R-F59 · Actions don't wait for push delivery
Correctness proof: `test_like_still_writes_notification_log` and `test_follow_still_writes_notification_log` stay green **unchanged** (TestClient runs background tasks before returning). Ordering proof uses a direct ASGI call. TestClient cannot show ordering, because it waits for background tasks. Put this helper in each file that uses it:
```python
import asyncio, json as _json
def _asgi_order(method, path, headers, body, events):
    raw = _json.dumps(body).encode() if body is not None else b""
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
             "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"", "root_path": "",
             "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]
                        + [(b"content-type", b"application/json"), (b"host", b"testserver")],
             "client": ("testclient", 50000), "server": ("testserver", 80)}
    state = {"sent": False, "status": None}
    async def receive():
        if not state["sent"]:
            state["sent"] = True
            return {"type": "http.request", "body": raw, "more_body": False}
        return {"type": "http.disconnect"}
    async def send(msg):
        if msg["type"] == "http.response.start":
            events.append("response.start"); state["status"] = msg["status"]
    asyncio.run(app(scope, receive, send))
    return state["status"]
```
Spies: `monkeypatch.setattr(app.notifications.dispatcher, "send_expo_push", lambda *a, **k: events.append("push.expo"))`, and the same for `send_web_push` → `"push.web"`. Dispatcher calls both per recipient (`dispatcher.py:170-171`).

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A1-68 | `test_notes.py::TestPushAfterResponse::test_like_returns_before_push_delivery` | fresh owner + liker; owner public note; `_asgi_order("POST", f"/notes/{id}/like", _auth(liker), None, events)` | status 201; `events.index("response.start") < events.index("push.expo")` and `< events.index("push.web")`; after the call, `NotificationLog(user_id=owner, event_type="post_liked", actor_id=liker)` exists | Major P0 |
| T-A1-69 | `test_notes.py::TestPushAfterResponse::test_comment_returns_before_push_delivery` | as above with `POST /notes/{id}/comments` body `{"text":"F59"}` | 201; same ordering; a `post_commented` row exists | Major P0 |
| T-A1-70 | `test_notes.py::TestPushAfterResponse::test_public_note_group_activity_written_after_response` | author in a public group; spy on `app.group_activity.fire_group_activity_for_user` (wrap the real function, append `"activity"`, then call through) at the name `notes_router` uses; `_asgi_order("POST","/notes/",h,{"text":"F59 pub","is_public":true},events)` | 201; `"response.start"` before `"activity"`; `_note_posted_events(client,h,gid)` has 1 event whose payload `note_id` equals the new id. With `is_public:false`, `"activity"` never appears | Major P0 |
| T-A1-71 | `test_follow_profile.py::TestPushAfterResponse::test_follow_returns_before_push_delivery` | fresh a, b; `_asgi_order("POST", f"/follow/{b.id}", _auth(a), None, events)` | 200; ordering as T-A1-68; a `new_follower` row for b with `actor_id=a` exists | Major P0 |

### A1 static checks

| # | Check | Command / method | Expected | Sev |
|---|---|---|---|---|
| ST-A1-01 | generated map reflects F-01 and F-23 | `python scripts/gen_dependency_map.py` (after A1+A2 merge) then `git diff dependency-map.md` | exit 0. Generated rows `POST /auth/signup` and `POST /auth/login` are gone. A row `POST /notifications/{notification_id}/read` appears with auth `user`. `/api/googlebooks/*` rows still show `⚠️`. The curated section's **(4A — in build)** notes are untouched by the generator | Major P0 |
| ST-A1-02 | no PII in new log lines | `git diff <base>..HEAD -- app/` added lines matching `print(\|logger\.\|logging\.\|_log\.` | none contains `email`, `token`, `endpoint`, `subscription`, `x-forwarded-for`, `query_string` or `request.url` | Critical P0 |
| ST-A1-03 | `app/crud.py`, `app/deps.py`, `app/auth.py`, `app/notifications/dispatcher.py`, `config.py`, `push_web.py`, `push_mobile.py`, `scheduler.py`, `tests/conftest.py` untouched | `git diff --stat <base>..HEAD -- <those paths>` | empty output | Major P0 |

---

## 3. Package A2 — API: catalogue, groups, insights, Google Books, admin, platform, SQL

### R-F52 · Validated userbook PATCH — `tests/test_books.py::TestPatchUserbookValidation`
Fixture: fresh user; `ub = POST /books/add-to-library {"title":"F52","total_pages":300,"status":"reading"}`. After every 422, `GET /userbooks/{ub}` shows the row unchanged. Measured response key set: `RK = {"book_total_pages","current_page","id","rating","status","updated_at"}`.

| # | Pytest | Body → expected | Sev |
|---|---|---|---|
| T-A2-01 | `test_rating_invalid_values_422` | `{"rating":"abc"}`, `-1`, `6`, `99`, `4.5`, `"4"`, `true` → each 422; stored rating unchanged | Critical P0 (500 today on "abc"; 6/99 stored today) |
| T-A2-02 | `test_rating_zero_and_null_clear` | `{"rating":4}` → 200 rating 4; `{"rating":0}` → 200, response and DB `rating is None`; `{"rating":3}` then `{"rating":null}` → 200 rating None | Critical P0 (web "Rating removed" sends 0) |
| T-A2-03 | `test_status_invalid_or_null_422` | `{"status":"banana"}` → 422; `{"status":null}` → 422; `{"status":"completed"}` → 422; stored status stays `reading` | Critical P0 |
| T-A2-04 | `test_current_page_negative_422_and_null_ok` | `{"current_page":-5}` → 422; `{"current_page":null}` → 200; `{"current_page":0}` → 200 | Critical P0 |
| T-A2-05 | `test_total_pages_zero_or_null_422` | `{"total_pages":0}`, `{"total_pages":-1}`, `{"total_pages":null}` → 422; the shared Book's `total_pages` stays 300 | Critical P0 (writes the shared Book row) |
| T-A2-06 | `test_format_invalid_422` | `{"format":"scroll"}` and `{"format":null}` → 422 | Major P1 |
| T-A2-07 | `test_ownership_status_invalid_422` | `{"ownership_status":"junk"}` and `null` → 422 | Major P1 |
| T-A2-08 | `test_every_valid_enum_value_200` | each status `to-read`/`reading`/`finished`; each rating 1..5; each format `hardcover`/`paperback`/`ebook`/`kindle`/`pdf`/`audiobook`; each ownership `owned`/`borrowed`/`loaned` (with `borrowed_from`/`loaned_to` strings); `{"total_pages":1}`; `{"private_notes":"📚 note"}` → all 200, stored as sent | Major P0 |
| T-A2-09 | `test_extra_key_with_valid_key_ignored_200` | `{"status":"reading","hacker":1,"user_id":999999,"id":1}` → 200; `user_id`/`id` unchanged in DB; no `hacker` in response (mass assignment). The existing `test_patch_no_valid_fields` (`{"unknown_field":"x"}` alone → 400) stays green (K-03) | Critical P0 |
| T-A2-10 | `test_empty_body_400` | `{}` → 400 (the existing "nothing sent" message) | Minor P1 |
| T-A2-11 | `test_response_key_set_unchanged` | `{"rating":5}` → 200 and `set(body) == RK`; `{"status":"finished"}` → 200 and `set(body) == RK`. Another user's `PATCH /userbooks/{ub}` → 404, row unchanged | Critical P0 |

### R-F50 · Deleting with history — `tests/test_books.py::TestDeleteUserbook`, `tests/test_groups.py::TestGroupDelete`

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A2-12 | `test_delete_after_progress_200_no_orphans` | fresh user; add `{"title":"F50 prog","total_pages":100,"status":"reading"}` → ub; `PUT /userbooks/{ub}/progress {"current_page":10}` → 200; DB `ReadingActivity(userbook_id=ub)` ≥ 1; `DELETE /userbooks/{ub}` | 200 `{"status":"ok","message":"Book removed from library successfully"}`; `ReadingActivity(userbook_id=ub)` → 0; `db.get(UserBook, ub)` None; `GET /userbooks/` has no ub | Critical P0 |
| T-A2-13 | `test_delete_keeps_notes_detached` | as above, plus `POST /notes/ {"text":"F50 note","userbook_id":ub,"is_public":false}` → n; delete ub | 200; Note n still exists with `userbook_id is None`; `GET /notes/me` contains n with `book` null | Critical P0 (user content) |
| T-A2-14 | `test_delete_nulls_group_post_userbook_id` | as T-A2-12, plus a group and a direct insert `GroupPost(group_id=g, user_id=user.id, text="F50 gp", userbook_id=ub)`; delete ub | 200; GroupPost exists with `userbook_id is None`; `GET /groups/{g}/posts` → 200 and contains it | Critical P0 |
| T-A2-15 | `test_groups.py::TestGroupDelete::test_delete_group_with_activity_leaves_no_rows` | creator makes group g; a second user joins (member_joined); creator `PUT /groups/{g}/book` with a book; `GroupActivity(group_id=g)` ≥ 2; creator `DELETE /groups/{g}` | 204; `GroupActivity(group_id=g)` → 0; `GET /groups/{g}` → 404; a non-creator's DELETE on another group → still 403/404 (unchanged) | Critical P0 |

### R-F07 + F-33 · Dedup keys and add-to-library matching — `tests/test_books.py`
`OWNED(u, tag)` = user u adds `{"title":f"F07 {tag}","author":"QA","google_books_id":f"f07-{tag}-gid","isbn":f"f07-{tag}-isbn","total_pages":321,"status":"reading"}` → `book_id = body["book"]["id"]`. "Book count" means the number of `Book` rows with that `google_books_id`.

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A2-16a | `TestAddToLibrary::test_add_by_book_id_reuses_catalogue_row` **(E1, 4B gate)** | OWNED(u1,"K") → K; Book count total `n0 = count(Book)`; u2 posts `{"book_id": K, "title":"F07 K","status":"to-read"}` (no gid, no isbn) | 200; `book.id == K`; `count(Book) == n0` (no new Book row); u2's `GET /userbooks/` has exactly 1 row with `book_id == K` | Critical P0 |
| T-A2-16 | `TestAddToLibrary::test_book_id_wins_over_google_books_id` **(E1, 4B gate)** | OWNED(u1,"A") → A; OWNED(u1,"B2") → B2 (a different existing row); u2 posts `{"book_id": A, "google_books_id":"f07-B2-gid","isbn":"f07-B2-isbn","title":"Different","status":"to-read"}` | 200, `book.id == A` (not B2); `count(Book)` unchanged; Book rows with gid `f07-B2-gid` still exactly 1 (B2) | Critical P0 |
| T-A2-17 | `TestAddToLibrary::test_unknown_book_id_falls_through_to_google_books_id` **(E1, 4B gate)** | u3 posts `{"book_id": 99999999, "google_books_id":"f07-A-gid","title":"x","status":"to-read"}` | 200 (no 404), `book.id == A`; `count(Book)` unchanged | Critical P0 |
| T-A2-18 | `TestAddToLibrary::test_google_books_id_matched_before_isbn` | Book B (gid `f07-B-gid`, isbn `f07-B-isbn`); Book C (isbn `f07-C-isbn`, no gid); u4 posts `{"google_books_id":"f07-B-gid","isbn":"f07-C-isbn","title":"y","status":"to-read"}` | `book.id == B` | Critical P0 |
| T-A2-19 | `TestAddToLibrary::test_add_from_recommendation_item_reuses_book` | friend F does OWNED(F,"R") and rates/finishes it so recommendations surface it; viewer V follows F; `GET /books/recommendations` → item with `id == R`; V posts the web BookPreviewModal payload built from the item: `{"book_id":item.id,"google_books_id":item.google_books_id,"isbn":item.isbn,"title":item.title,"author":item.author,"cover_url":item.cover_url,"total_pages":item.total_pages,"status":"to-read"}`; V posts it again | 1st 200 with `book.id == R`; 2nd 400 `{"detail":"This book is already in your library in the 'Want to Read' tab."}`; Book count for `f07-R-gid` == 1 throughout. If the item never appears, the test fails and the Builder records why (no silent skip) | Critical P0 |
| T-A2-20 | `TestAddToLibrary::test_add_from_friends_reading_item_reuses_book` | OWNED(F,"FR") status reading; V follows F; `GET /userbooks/friends/currently-reading` → item for F; V adds from `item.book` as above | 200 with `book.id` == FR's id; re-add → 400; Book count 1 | Critical P0 |
| T-A2-21 | `TestAddToLibrary::test_add_from_note_card_book_reuses_book` | OWNED(F,"NC"); F public note on that userbook; V reads `/notes/feed?limit=200` → card.book; V adds from it | same id; re-add 400; Book count 1 | Critical P0 |
| T-A2-22 | `TestAddToLibrary::test_add_from_circle_current_book_reuses_book` | curator OWNED(cur,"CB"); group g; `PUT /groups/{g}/book {"book_id": CB}`; member M joins; `GET /groups/{g}` → `current_book`; M adds from it | same id; re-add 400; Book count 1 | Critical P0 |
| T-A2-23 | `TestRecommendations::test_recommendations_items_have_dedup_keys` **(E1, 4B gate)** | the T-A2-19 fixture (at least 1 item required) | **every** item carries `google_books_id`, `isbn` and `total_pages`; for R: `"f07-R-gid"`, `"f07-R-isbn"`, `321`. Each item's keys == `{author, cover_url, description, friend_name, id, reason, title, total_pages}` ∪ `{google_books_id, isbn}` exactly (measured 8 + 2 added) | Critical P0 |
| T-A2-24 | `TestRecommendations::test_recommendations_limit_bounds_422` | `?limit=` 0, -1, 201, 200, 1 | 422, 422, 422, 200, 200 | Major P1 |
| T-A2-25 | `TestBookSearch::test_search_limit_bounds_422` | `/books/search?q=Dune&limit=` 0, -1, 201, 200 | 422, 422, 422, 200 | Major P1 |
| T-A2-26 | `TestFriendsReading::test_friends_reading_book_has_dedup_keys_and_user_profile_picture` **(E1, 4B gate)** | the T-A2-20 fixture; F sets `profile_picture` via DB to `https://example.com/f.png` | item keys == `{book, current_page, id, updated_at, user}`; `book` == `{author, cover_url, id, title, total_pages, google_books_id, isbn}`; `user` == `{id, is_mutual, name, username, profile_picture}` with `profile_picture == "https://example.com/f.png"` | Critical P0 |
| T-A2-27 | `TestFriendsReading::test_friends_reading_limit_bounds_422` | `?limit=` 0, -1, 201, 200, 10 | 422, 422, 422, 200, 200 | Major P1 |

### R-F59 (A2 call sites) · `tests/test_books.py::TestPushAfterResponse`
Uses the `_asgi_order` helper and the spies from A1.

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A2-28 | `test_add_to_library_returns_before_push_delivery` | fresh actor with 1 follower; `_asgi_order("POST","/books/add-to-library",h,{"title":"F59 add","total_pages":10,"status":"to-read"},events)` | 200; `"response.start"` precedes the first `"push.*"`; afterwards `NotificationLog(user_id=follower, event_type="book_added")` exists | Major P0 |
| T-A2-29 | `test_patch_status_finished_returns_before_push_delivery` | actor with 1 follower and a `reading` userbook; `_asgi_order("PATCH", f"/userbooks/{ub}", h, {"status":"finished"}, events)` | 200; ordering holds; a `book_completed` row for the follower exists | Major P0 |
| T-A2-30 | `test_progress_to_end_still_writes_notificationlog` | TestClient: actor (1 follower, in 1 group) `PUT /userbooks/{ub}/progress {"current_page": total}` | 200 `status == "finished"`; follower has a `book_completed` row; `GET /groups/{g}/activity` has a `book_finished` event with payload `book_id` == ub's book id | Major P0 |

### R-F15 + F-07 groups · Circle goal aliases and `current_book` keys — `tests/test_groups.py`
Measured pre-sprint `_serialize_group` keys `G16 = {cover_preset, created_at, created_by, creator_name, current_book, description, goal_pages, goal_period, goal_start_date, id, invite_code, is_private, member_count, membership_role, membership_status, name}`. `CB7 = {id, title, author, cover_url, google_books_id, isbn, total_pages}`.

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A2-31 | `TestGroupsCRUD::test_create_accepts_reading_goal_alias` | `POST /groups/ {"name":"F15 alias","is_private":false,"reading_goal":1000,"goal_period":"monthly"}` (Android 2.2.1 body) | 201; `goal_pages == 1000`; `goal_period == "monthly"`; `goal_start_date` not null | Major P0 |
| T-A2-32 | `TestGroupsCRUD::test_goal_pages_wins_over_alias` | `{"name":"F15 both","goal_pages":500,"reading_goal":1000,"goal_period":"yearly"}` | 201; `goal_pages == 500` | Major P1 |
| T-A2-33 | `TestGroupsCRUD::test_get_group_returns_reading_goal_and_pages_read_total` | group with `goal_pages 1000, goal_period monthly`; the curator adds a reading book and progresses 120 pages this month; `GET /groups/{g}`; `GET /groups/{g}/goal` | GET keys == G16 ∪ {`reading_goal`, `pages_read_total`}; `reading_goal == 1000`; `pages_read_total == goal["pages_read"]` (== 120) | Major P0 |
| T-A2-34 | `TestGroupsCRUD::test_get_group_no_goal_pages_read_total_zero` | group without a goal | `reading_goal is None`; `pages_read_total == 0` | Major P1 |
| T-A2-35 | `TestGroupsCRUD::test_goal_endpoint_shape_unchanged` | as T-A2-33 and T-A2-34 | with a goal: keys exactly `{goal_pages, goal_period, pages_read, pct}`; without: body exactly `{"goal_pages": null, "pages_read": 0, "pct": 0}` (no `goal_period`) | Critical P0 (4B contract) |
| T-A2-36 | `TestGroupsCRUD::test_current_book_has_dedup_keys` | curator OWNED(cur,"G") then `PUT /groups/{g}/book {"book_id": G}`; `GET /groups/{g}`; `PUT /groups/{g}` `{"description":"F07"}` | `current_book` keys == CB7 with `google_books_id "f07-G-gid"`, `isbn "f07-G-isbn"`, `total_pages 321` in the GET and the PUT response; `POST /groups/` of a new group returns `current_book: null` | Critical P0 (4B contract) |
| T-A2-37 | `TestGroupsCRUD::test_set_group_book_response_has_dedup_keys` | the `PUT /groups/{g}/book` from T-A2-36 | response keys == CB7 (today `{author, cover_url, id, title}`) | Critical P0 |
| T-A2-38 | `TestGroupsCRUD::test_private_group_goal_fields_still_403_for_non_member` | a private group with a goal; a non-member `GET /groups/{g}` and `GET /groups/{g}/goal` | both 403 (unchanged); the body contains no `pages_read_total` | Critical P0 |
| T-A2-39 | `test_activity_limit_bounds_422` | member `GET /groups/{g}/activity?limit=` 0, -1, 201, 200, 1 | 422, 422, 422, 200, 200 | Major P1 |

(T-A2-15 is `TestGroupDelete`.)

### R-F13 + F-14 · Insights aliases — `tests/test_reading_activity.py`

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A2-40 | `TestInsights::test_yearly_goal_has_completed_and_finished_alias` | fresh user `PUT /profile/me {"yearly_goal":12}`; add one book `status finished` (this year) | `yearly_goal` keys == `{goal, completed, pct, on_track, finished}`; `finished == completed == 1` | Major P0 |
| T-A2-41 | `TestInsights::test_mobile_alias_keys_present` | the same user: rate the finished book 4 (`PATCH {"rating":4}`); add a `reading` book of 300 pages; progress 30 today | `average_rating == avg_rating` (4 / 4.0); `books_this_year == finished_this_year`; every `projected_finishes[i].projected_finish_date == projected_finish`. All measured pre-sprint keys stay: `{avg_pages_per_day, avg_rating, current_streak, finished_this_year, longest_streak, monthly_pages, projected_finishes, total_books, total_finished, total_pages_read, total_reading, yearly_goal}`. Existing `test_insights_monthly_pages_shape_unchanged` stays green | Major P0 |
| T-A2-42 | `TestDailyStats::test_days_bounds_422` | `GET /reading-activity/daily?days=` 0, -1, 201, 200, 1; `GET /reading-activity/user/{public_user}/daily?days=` 0, 201, 200 | 422, 422, 422, 200, 200; 422, 422, 200. Existing `days=1`/`days=7` tests stay green | Major P1 |

### R-F26 support + F-51 admin + Make Admin — `tests/test_admin.py`

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A2-43 | `test_stats_has_push_subscribed_users_distinct_count` | fresh A gets expo + web tokens (`_give_token`), fresh B gets web only; admin `GET /admin/stats` | 200; keys == the measured 13 `{books_being_read, books_completed, books_wishlist, new_users_this_month, new_users_this_week, total_books, total_comments, total_follows, total_journals, total_likes, total_notes, total_userbooks, total_users}` ∪ {`push_subscribed_users`}; value `== len(_distinct_token_user_ids(db))`, so A counts once | Major P0 |
| T-A2-44 | `test_admin_list_limit_bounds_422` | admin, for each of `/admin/users`, `/admin/books`, `/admin/follows`, `/admin/content/notes`, `/admin/content/comments`: `?limit=` 0, -1, 201, 200 | 422, 422, 422, 200 on all five; a non-admin still gets 403 | Major P1 |
| T-A2-45 | `TestSetAdmin::test_set_admin_allowlisted_email_200` | `_make_user(db, email="ankitalkuhs@gmail.com")` → t; admin `POST /admin/set-admin/{t.id}?is_admin=true` (exactly what web now sends) | 200 `{"message":"Admin status granted for user ankitalkuhs@gmail.com","user_id":t.id,"is_admin":true}`; DB `is_admin True`. Teardown: `?is_admin=false` → 200 | Critical P0 |
| T-A2-46 | `TestSetAdmin::test_set_admin_non_allowlisted_email_403` | fresh `f26_not_allowed@example.com`; admin `?is_admin=true` | 403 `{"detail":"This account is not permitted to hold admin access"}`; DB `is_admin False` | Critical P0 |
| T-A2-47 | `TestSetAdmin::test_set_admin_missing_is_admin_query_422` | admin `POST /admin/set-admin/{t.id}` with no query (the old web call) | 422; `is_admin` unchanged | Major P1 |
| T-A2-48 | `TestSetAdmin::test_set_admin_non_admin_caller_403` | a non-admin calls `?is_admin=true` for the allowlisted user | 403 `{"detail":"Admin access required"}`; unchanged | Critical P0 |
| T-A2-49 | `TestSetAdmin::test_revoke_admin_allowed_200` | admin `?is_admin=false` on a fresh admin-flagged user | 200 `is_admin false` (revoke needs no allowlist) | Major P2 |

### R-F19 + F-29 + F-54 · Google Books — `tests/test_googlebooks.py` (new)
An autouse fixture clears `googlebooks_router._anon_calls` and monkeypatches `googlebooks_router.httpx.AsyncClient` with a fake async context manager. The fake records calls, and for `/volumes` returns 2 items: `IMG` (`id "gb-img"`, `volumeInfo.imageLinks {"thumbnail": "http://books.google.com/x"}`) and `NOIMG` (`id "gb-noimg"`, no `imageLinks`). For `/volumes/{id}` it returns the matching single volume. `ANON` = no Authorization header. Expected 401 body `LR = {"detail": {"code": "login_required", "message": "Log in to keep searching"}}`.

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A2-50 | `test_item_without_imagelinks_has_null_cover` | authed `GET /api/googlebooks/search?query=hobbit` | result `gb-noimg` has `cover_url is None` | Major P0 |
| T-A2-51 | `test_item_with_imagelinks_has_frontcover_url` | same | `gb-img` `cover_url == normalize_google_cover_url("https://books.google.com/books/content?id=gb-img")` | Major P0 |
| T-A2-52 | `test_book_detail_without_imagelinks_has_null_cover` | authed `GET /api/googlebooks/book/gb-noimg` | 200, `cover_url is None` | Major P1 |
| T-A2-53 | `test_book_detail_with_imagelinks_has_frontcover_url` | `/book/gb-img` | 200, the non-null normalized URL | Major P1 |
| T-A2-54 | `test_add_imageless_result_stores_null_cover` | authed: search → take `gb-noimg` → `POST /books/add-to-library` with its fields (`google_books_id "gb-noimg"`, `cover_url null`) | 200; `book.cover_url is None`; the DB Book `cover_url is None` | Major P1 |
| T-A2-55 | `test_anonymous_first_two_calls_200` | ANON search ×2 | 200, 200 | Critical P0 |
| T-A2-56 | `test_anonymous_third_call_401_login_required` | ANON search ×3 | 3rd: 401 and `r.json() == LR` exactly; the fake's call count is 2 (the 3rd never reaches Google) | Critical P0 |
| T-A2-57 | `test_quota_shared_between_search_and_book` | ANON search, ANON `/book/gb-img`, ANON search | 200, 200, 401 LR | Critical P0 |
| T-A2-58 | `test_authenticated_unlimited` | authed search ×5 and `/book/gb-img` ×1 | all 200; `_anon_calls == {}` | Critical P0 |
| T-A2-59 | `test_different_ip_has_own_quota` | ANON ×2 with `X-Forwarded-For: 203.0.113.1`, then ANON with `X-Forwarded-For: 203.0.113.2` | 200, 200, then 200; a 3rd `.1` call → 401 LR | Critical P0 |
| T-A2-60 | `test_forged_leftmost_xff_counts_against_real_ip` | three ANON calls with `X-Forwarded-For: 198.51.100.{1,2,3}, 203.0.113.9` (a different forged left-most value each time, the same right-most); then ANON with `X-Forwarded-For: 203.0.113.10` | 200, 200, **401 LR**; the last call 200 | Critical P0 |
| T-A2-61 | `test_no_xff_falls_back_to_client_host` | ANON ×3 with no XFF (TestClient host `testclient`) | 200, 200, 401 LR; exactly 1 key in `_anon_calls` | Critical P0 |
| T-A2-62 | `test_quota_resets_after_window` | monkeypatch `_clock` → `t`; ANON ×2 (200, 200); ANON → 401; set `_clock` → `t + 86401`; ANON | 200 | Major P0 |
| T-A2-63 | `test_invalid_token_counts_as_anonymous` | ×3 with `Authorization: Bearer garbage` | 200, 200, then 401 **LR** (not "Invalid authentication credentials") | Critical P0 |
| T-A2-64 | `test_raw_ip_not_stored` | `caplog` at DEBUG; ANON with `X-Forwarded-For: 203.0.113.77` | every key in `_anon_calls` matches `^[0-9a-f]{64}$`; `"203.0.113.77" not in repr(_anon_calls)`; not in `caplog.text` | Critical P0 (privacy) |
| T-A2-65 | `test_short_query_400_does_not_consume` | ANON `?query=a` ×3 → then valid ANON ×3 | 400 `{"detail":"Query must be at least 2 characters"}` ×3; then 200, 200, 401 LR | Major P1 |
| T-A2-66 | `test_start_index_999999_returns_empty_200_without_calling_google` | authed `?query=harry%20potter&max_results=40&start_index=999999` | 200 body `results == []`, `total_items == 0`, `has_more is False`, `next_start_index == 999999`; fake call count 0 | Minor P1 (500 today) |
| T-A2-67 | `test_start_index_boundary_1000_empty_999_calls_google` | authed `start_index=1000` → then `start_index=999` | 1000: empty, 0 fake calls; 999: 1 fake call, and `has_more is False` (next start ≥ 1000) | Minor P2 |
| T-A2-68 | `test_google_non_200_returns_502` | the fake returns status 500 for `/volumes` and `/volumes/{id}` | search 502, detail 502; neither body contains the fake's error text | Minor P1 |
| T-A2-69 | `test_google_transport_error_returns_502` | the fake raises `httpx.ConnectError("boom-transport")` | 502 `{"detail":"Google Books is unavailable right now"}`; `"boom-transport" not in r.text` | Minor P1 |

### R-F53 · No duplicates from races — `tests/test_uniqueness.py` (new)

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A2-70 | `test_db_rejects_duplicate_userbook` | fresh user u, book b; `db.add(UserBook(user_id=u, book_id=b, status="to-read"))` twice, committing each | the 2nd commit raises `sqlalchemy.exc.IntegrityError`; then `db.rollback()`; exactly 1 row | Critical P0 (may not be dropped) |
| T-A2-71 | `test_db_rejects_duplicate_like` | the same with `Like(note_id=n, user_id=u)` | IntegrityError; 1 row | Critical P0 (may not be dropped) |
| T-A2-72 | `test_db_rejects_duplicate_follow` | the same with `Follow(follower_id=a, followed_id=b)` | IntegrityError; 1 row | Critical P0 (may not be dropped) |
| T-A2-73 | `test_sqlite_unique_constraints_present` | `sqlalchemy.inspect(engine).get_unique_constraints(t)` for `userbook`, `like`, `follow` (or, if SQLite reports them as unique indexes, `get_indexes` with `unique=True`) | column sets `{user_id, book_id}`, `{note_id, user_id}`, `{follower_id, followed_id}` present. `UserBook.__table__.constraints` / `Like` / `Follow` include a `UniqueConstraint` named `uq_userbook_user_book` / `uq_like_note_user` / `uq_follow_pair` | Critical P0 |
| T-A2-74 | `test_sequential_duplicate_contracts_unchanged` | (a) add-to-library the same `google_books_id` twice; (b) `POST /userbooks/` the same book twice; (c) like the same note twice; (d) follow twice | (a) 400 `{"detail":"This book is already in your library in the 'Want to Read' tab."}`; (b) 400 (the existing duplicate message); (c) 2nd 201 `{"message":"Already liked","liked":true}`; (d) 2nd 400 `{"detail":"Already following"}`. Never 500; exactly 1 row each | Critical P0 |
| T-A2-75 | `test_add_to_library_race_returns_400` | pre-insert the winning `UserBook` for (u, b) directly; make the handler's pre-check miss it. Technique: a SQLAlchemy `before_flush` listener that inserts the competitor on a separate connection, **or** monkeypatch the pre-check lookup to return `None` once. Then POST add-to-library for b | 400 with the same tab message; exactly 1 UserBook for (u, b); no NotificationLog `book_added` from this request | Critical P1 (droppable per K-12, with a Build Notes reason) |
| T-A2-76 | `test_add_userbook_race_returns_400` | the same technique on `POST /userbooks/` | 400 (the existing duplicate message); 1 row | Critical P1 (droppable) |
| T-A2-77 | `test_like_race_returns_already_liked` | the same technique on `POST /notes/{id}/like` | 201 `{"message":"Already liked","liked":true}`; 1 Like row; no second `post_liked` NotificationLog | Critical P1 (droppable) |
| T-A2-78 | `test_follow_race_returns_400_already_following` | the same technique on `POST /follow/{id}` | 400 `{"detail":"Already following"}`; 1 Follow row; no second `new_follower` NotificationLog | Critical P1 (droppable) |

The Builder greps `tests/` for any direct duplicate insert of `Like`, `Follow` or `UserBook` that the new constraints would break, and lists what it finds in Build Notes.

### R-F56 + F-58 · Security headers and JSON 500 — `tests/test_security_headers.py` (new)
`SEC = {"x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY", "strict-transport-security": "max-age=31536000; includeSubDomains"}`. `ORIGIN = "https://www.trackmyread.com"`. The F-58 tests use the brief's `boom_route` fixture: a temporary `GET /__test_boom` that raises `RuntimeError("boom-secret-detail")`, removed on teardown.

| # | Pytest | Steps | Expected | Sev |
|---|---|---|---|---|
| T-A2-79 | `test_headers_on_200` | `GET /version` | 200; every SEC header present with exactly that value | Major P0 |
| T-A2-80 | `test_headers_on_404` | `GET /does-not-exist-4a` | 404; SEC exact | Major P0 |
| T-A2-81 | `test_headers_on_401_and_422` | `GET /profile/me` with no token; `GET /notes/feed?limit=-1` with `alice_headers` | 401 and 422; SEC exact on both | Major P1 |
| T-A2-82 | `test_preflight_keeps_cors_and_gets_headers` | `client.options("/notes/feed", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET"})` | 200; `access-control-allow-origin == ORIGIN`; SEC exact | Critical P0 (web dead if broken) |
| T-A2-83 | `test_foreign_origin_no_allow_header` | the same with `Origin: https://evil.example` | no `access-control-allow-origin` equal to `https://evil.example` or `*`; SEC headers present | Critical P0 |
| T-A2-84 | `test_unhandled_exception_500_has_cors_and_json` | `GET /__test_boom` with `Origin: ORIGIN` (conftest client, `raise_server_exceptions=True`: must not raise) | 500; `r.json() == {"detail": "Internal Server Error"}`; `access-control-allow-origin == ORIGIN`; SEC exact; `"boom-secret-detail" not in r.text`; `"Traceback" not in r.text` | Major P0 |
| T-A2-85 | `test_unhandled_exception_logged` | `caplog` on logger `app.errors`; `GET /__test_boom` | exactly 1 ERROR record whose message contains `GET` and `/__test_boom` and has `exc_info` | Major P1 |
| T-A2-86 | `test_error_log_has_no_query_string` | `GET /__test_boom?secret=qa-f58-query` | the record message and `caplog.text` do not contain `qa-f58-query` or `secret=` | Critical P0 (no PII/secrets in logs) |

### R-F16 + R-F53 SQL artifacts, checked statically — `tests/test_sql_artifacts.py` (new)
Helpers: `strip_comments(sql)` removes `--…` to end of line; `uncomment(sql)` removes one leading `-- ` from each line; `statements(sql)` splits on `;`. `WRITE = r"\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|MERGE|GRANT|REVOKE|BEGIN|COMMIT|COPY)\b"` (case-insensitive; `\b` keeps `updated_at` from matching). Neither file is ever executed against SQLite.

**F-16** — `context/repairs/2026-09-rating-reset-repair.sql`

| # | Pytest | Check | Expected | Sev |
|---|---|---|---|---|
| T-A2-87 | `test_repair_sql_exists_with_parts_a_b_c_and_rollback` | the file exists; markers `PART (a)`, `PART (b)`, `PART (c)`, `ROLLBACK` occur in that order | all true | Critical P0 |
| T-A2-88 | `test_repair_part_a_is_select_only` | `strip_comments(text[PART (a) : PART (b)])` | no `WRITE` match; contains `SELECT`, `restorable_rows`, `affected_users`, `candidates_before_reread_exclusions`, `'to-read'`, `book_completed`, `book_finished`, `2026-05-05` | Critical P0 |
| T-A2-89 | `test_repair_parts_b_c_commented_out` | every non-blank line from `PART (b)` to EOF | starts with `--`, so running the whole file executes only (a) | Critical P0 |
| T-A2-90 | `test_repair_backup_table_name` | `uncomment(text[PART (b):])` | contains `CREATE TABLE userbook_repair_backup_20260913`; (c) contains `BEGIN` and `COMMIT`; (c)'s UPDATE contains `u.status = 'to-read'` and `COALESCE(u.current_page, 0) = 0` | Critical P0 |
| T-A2-91 | `test_repair_no_update_or_delete_without_where` | for every statement in `statements(strip_comments(text))` + `statements(uncomment(text[PART (b):]))` whose first keyword is `UPDATE` or `DELETE` | each contains `WHERE` | Critical P0 |

**F-53** — `context/supabase_migration.sql`, the section starting at the line containing `Sprint 4A · F-53`

| # | Pytest | Check | Expected | Sev |
|---|---|---|---|---|
| T-A2-92 | `test_migration_4a_section_present_with_steps_1_2_3_and_rollback` | markers `STEP 1`, `STEP 1b`, `STEP 2`, `STEP 3`, `ROLLBACK`, in order | all present, in order | Critical P0 |
| T-A2-93 | `test_migration_step1_is_read_only` | `strip_comments(section[STEP 1 : STEP 2])` | no `WRITE` match; `HAVING COUNT(*) > 1` occurs 3 times, for `userbook`, `"like"`, `follow`; output columns `dup_groups`, `surplus_rows` | Critical P0 |
| T-A2-94 | `test_migration_dedupe_keeps_lowest_id_and_absorbs_progress` | STEP 2 text | `BEGIN;` … `COMMIT;`; keeper `MIN(id)`; the 2c UPDATE contains `GREATEST(k.current_page`, `WHEN 'finished' THEN 3`, `WHEN 'reading' THEN 2`, `NULLIF(k.rating, 0)`, and an `EXISTS (` guard | Critical P0 |
| T-A2-95 | `test_migration_repoints_dependents_before_delete` | character offsets in STEP 2 | `UPDATE userbook k` (2c) < `UPDATE note n` < `UPDATE reading_activity r` < `UPDATE group_post g` < `DELETE FROM userbook`; `dedupe_20260913_repoint` is created before `UPDATE note n` | Critical P0 |
| T-A2-96 | `test_migration_creates_three_unique_indexes_if_not_exists` | whitespace-normalised STEP 3 | contains `CREATE UNIQUE INDEX IF NOT EXISTS uq_userbook_user_book ON userbook (user_id, book_id)`, `… uq_like_note_user ON "like" (note_id, user_id)`, `… uq_follow_pair ON follow (follower_id, followed_id)`, and `FROM pg_indexes` | Critical P0 |
| T-A2-97 | `test_migration_is_idempotent` | the whole section, comments stripped | every `CREATE TABLE` has `IF NOT EXISTS`; every `CREATE UNIQUE INDEX` has `IF NOT EXISTS`; `uncomment(ROLLBACK)`: every `DROP INDEX` has `IF EXISTS` | Critical P0 |
| T-A2-98 | `test_migration_rollback_present` | `uncomment(section[ROLLBACK:])` | `DROP INDEX IF EXISTS` ×3; `INSERT INTO userbook`; repoints back for `note`, `reading_activity`, `group_post`, `journal` from `dedupe_20260913_repoint`; undo-2c `UPDATE userbook k … FROM dedupe_20260913_userbook_keeper`; `INSERT INTO "like"`; `INSERT INTO follow` | Critical P0 |
| T-A2-99 | `test_migration_no_update_or_delete_without_where` | as T-A2-91 over the section plus its uncommented rollback | every UPDATE/DELETE has `WHERE` | Critical P0 |
| T-A2-100 | `test_migration_index_names_match_models` | the index names in STEP 3 vs `UniqueConstraint` names and columns in `app.models` | identical names and column tuples for all 3 | Critical P0 |

### A2 static checks

| # | Check | Command / method | Expected | Sev |
|---|---|---|---|---|
| ST-A2-01 | the F-01 orphan is removed | `grep -n "oauth2_scheme\|OAuth2PasswordBearer" app/main.py` | no output | Minor P1 |
| ST-A2-02 | middleware order is load-bearing | line numbers in `app/main.py` of `add_middleware(CatchUnhandledErrorsMiddleware`, `add_middleware(CORSMiddleware`, `add_middleware(SecurityHeadersMiddleware` | strictly increasing, in that order; CORS arguments byte-identical to `c36a21b` | Critical P0 |
| ST-A2-03 | the migration is append-only | `git show c36a21b:context/supabase_migration.sql` is a byte prefix of the new file (ignoring one trailing newline) | true | Critical P0 |
| ST-A2-04 | the stack the F-59 design relies on is unchanged | `python -c "import fastapi, pydantic, starlette; print(fastapi.__version__, pydantic.VERSION, starlette.__version__)"` in `.venv`; `requirements.txt` (UTF-16) diff | `0.95.2 1.10.x 0.27.0`; no change to the fastapi/pydantic/starlette pins | Critical P0 |
| ST-A2-05 | out-of-scope files untouched | `git diff --stat c36a21b..HEAD -- app/routers/import_router.py app/routers/users_router.py app/routers/meta_router.py app/group_activity.py book-tracker-mobile-stitch/` | empty | Major P0 |

### E1 · 4B build gate on add-to-library dedup (Sprint 4B Architect escalation, 2026-09-13) · Critical
The Android 2.2.2 build waits on these 5 A2 tests passing **on the deployed commit** (the commit reported by `GET /version` in P-01):
1. `TestAddToLibrary::test_add_by_book_id_reuses_catalogue_row` (T-A2-16a)
2. `TestAddToLibrary::test_unknown_book_id_falls_through_to_google_books_id` (T-A2-17)
3. `TestAddToLibrary::test_book_id_wins_over_google_books_id` (T-A2-16)
4. `TestRecommendations::test_recommendations_items_have_dedup_keys` (T-A2-23)
5. `TestFriendsReading::test_friends_reading_book_has_dedup_keys_and_user_profile_picture` (T-A2-26)

**Gate G-E1:** `git checkout <deployed sha> && pytest tests/test_books.py -q -k "(book_id or dedup_keys) and not literal_paths"` → **`5 passed, 0 failed`**, collecting exactly the 5 names above (check with `--collect-only -q`).

**Command correction:** the escalation's `-k "book_id or dedup_keys"` also selects the existing `TestCatalogAuth::test_literal_paths_not_swallowed_by_book_id` (verified with `--collect-only` on 2026-09-13: 1 match today). It would report **6 passed**. Use the command above, or accept `6 passed` with that extra name. Builders must not add any other `test_books.py` test whose name contains `book_id` or `dedup_keys`.

---

## 4. Package B1 — Web platform: api.js, auth/push, notifications, admin, onboarding, public pages

All web paths below are relative to `book-tracker-frontend-stitch/`.

### Web test mechanism — read once, before any `L-` or `ST-` case

There is **no test runner in the web app**. `book-tracker-frontend-stitch/package.json` has only `dev`, `build`, `build:ssg`, `lint`, `preview`, and no vitest / jest / playwright dependency (verified 2026-09-13). Playwright **1.60.0** and `@axe-core/playwright` **4.10.2** exist only in `qa/node_modules` (`qa/package.json`). So this plan introduces **no new runner**. Three mechanisms, all of which already exist in the repo:

1. **`node qa/web_4a_local.mjs` — the `L-` harness (new file, QA-owned; see K-20).**
   Written in the same shape as `qa/screenshots.mjs` / `qa/scenarios_web.mjs`: plain Node ESM, `import { chromium } from 'playwright'` resolved from `qa/node_modules`, `--web` / `--api` arguments, a `case(id, title)` / `step(name, pass, detail)` reporter, secret read from `REVIEW_LOGIN_SECRET` or `<repo>/.env.review`, never printed.
   - Defaults, matching `screenshots.mjs`: `--web http://localhost:5174`, `--api http://127.0.0.1:8765`. **Never production** — the harness exits 5 if `--web` or `--api` resolves to a `trackmyread.com` or `onrender.com` host.
   - It prints exactly one line per case, `PASS <id> <title>` or `FAIL <id> <title> — <first failing step>`, then a final line `4A web local: <n> passed, <m> failed`. `--only L-B1-09,L-B2-07` runs a subset.
   - **Preconditions (the harness asserts each and exits 6 with the missing one named):**
     - API: `.venv\Scripts\python -m uvicorn app.main:app --port 8765` on the 4A backend tree, with `REVIEW_LOGIN_SECRET` / `REVIEW_LOGIN_EMAILS` set and `python scripts/seed_review_accounts.py` already run against that DB.
     - Web: `npm --prefix book-tracker-frontend-stitch run dev -- --mode localapi --port 5174`. **`--mode localapi` is required** (it is what points `VITE_API_BASE_URL` at `http://127.0.0.1:8765`; the committed `.env` points at production). **`--port 5174` is required** (`vite.config.js` sets no port, so the default is 5173, while the qa scripts default to 5174).
     - **`run dev`, never `preview`**: mechanism 2 below imports app source over the Vite dev server, which a production build does not serve.
2. **The module harness** — inside a Playwright page on the dev server, `await page.evaluate(async () => { const m = await import('/src/services/api.js'); … return <plain JSON> })`. Vite dev serves `/src/**` as real ES modules, so `api.js` can be exercised directly with `page.route()` stubbing the API. Everything crosses the boundary as JSON; module objects are never returned. This is how every `api.js` case below runs, and it is the only way to test `api.js` without a full UI flow.
3. **`node --test qa/unit/`** — Node's built-in runner (the same mechanism Sprint 4B uses for `__tests__/*.test.mjs`) for the two new **pure-ESM, zero-dependency** util modules, `src/utils/navigation.js` (B1) and `src/utils/noteVisibility.js` (B2). Both are importable straight into Node: `noteVisibility` touches `localStorage` only inside `try/catch`, so the `ReferenceError` in Node is caught and the module returns its fallback; `navigation` reads `window.history.state?.idx`, which the test stubs with `globalThis.window = { history: { state: { idx } } }`. Fallback if the directory form is unsupported: `node --test qa/unit/*.test.mjs`.

**Static checks (`ST-`)** are greps, `git diff` assertions, `npm run build` and `npx eslint`. They are run from the repo root and their expected output is stated literally.

**Anything that needs a real web push, a real service worker `notificationclick`, a real Notification permission prompt, or a human eye on colour** is **not** automated here. It is written into section 8 as a `P-` case and said so out loud (K-17).

### R-F29 web + R-F58 · `api.js` surfaces error codes and readable errors — `src/services/api.js`

Today `apiFetchRaw` (`:54-63`) turns **every** 401 into `clearToken()` + `window.location.href = '/'`, and throws `new Error(err.detail || 'Request failed')` with no `status` and no `code`, so a 422's array `detail` stringifies to `[object Object]`.

#### L-B1-01 — anonymous `login_required` does not bounce the visitor · Critical / P0
**Harness:** module harness, fresh context, **no** `bt_token` in `localStorage`.
**Arrange:** `page.route('**/api/googlebooks/search*')` fulfils `401` with body `{"detail": {"code": "login_required", "message": "Log in to keep searching"}}` and `content-type: application/json`. Navigate to `http://localhost:5174/` and record `location.pathname` as `before`.
**Act:** in one `page.evaluate`, `import('/src/services/api.js')`, call `searchGoogleBooks('dune')`, catch the rejection and return `{ name: e.name, message: e.message, status: e.status, code: e.code, token: localStorage.getItem('bt_token'), path: location.pathname }`.
**Assert:** the call **rejects**; `status === 401`; `code === 'login_required'`; `message === 'Log in to keep searching'`; `token === null` **and was null before** (nothing was cleared that was not already absent); `path === before` — no navigation happened. Additionally, `page.on('framenavigated')` recorded no navigation during the evaluate.

#### L-B1-02 — readable errors keep their status, and an expired session still redirects · Major / P0
**Harness:** module harness. Three sub-steps in one case, each with its own route stub:
1. **500 (F-58).** Stub `**/notifications/prefs` → `500 {"detail": "Internal Server Error"}`. `updateNotificationPrefs({post_liked: false})` rejects with `message === 'Internal Server Error'` and `status === 500`. `'[object Object]'` is not in the message.
2. **422 array detail (F-51/F-52 fallout).** Stub `**/notes/feed*` → `422 {"detail": [{"loc": ["query","limit"], "msg": "ensure this value is greater than or equal to 1", "type": "value_error.number.not_ge"}]}`. `getCommunityFeed()` rejects with `status === 422` and a message that is a non-empty string **not** containing `[object Object]`.
3. **401 with a token present (the guard on L-B1-01).** Seed `localStorage.bt_token = 'expired.jwt.value'`; stub `**/api/googlebooks/search*` → the same `login_required` 401. The call clears `bt_token` (`localStorage.getItem('bt_token') === null`) and the page navigates to `/`. *A logged-in visitor with an expired session must still be signed out; only the tokenless case is exempt.*

### R-F20 · Cache invalidation after every mutation — `src/services/api.js`

The 60 s `_cache` (`api.js:9-23`) is keyed by path prefix. **Invalidation is proven behaviourally, not by grep**: prime a GET, run the mutation, and assert the next GET goes to the network. Each case below uses the module harness with `page.route` counting requests per path pattern, and stubs every mutation with a 200 so nothing depends on the backend. The TTL is 60 s, so a second GET inside the same case is cached unless the mutation cleared it.

**Helper used by L-B1-03..06** (described once, implemented in the harness): `probe(getFn, mutationFn, getPattern)` → prime `getFn()` (request count for `getPattern` goes 0 → 1), call `getFn()` again (count stays 1, proving the cache is live), call `mutationFn()`, call `getFn()` a third time, return the final count. **Expected 2** after a correct invalidation, **1** if the mutation did not clear the prefix.

| # | Case | Mutations probed (all must give count 2) | Sev / Pri |
|---|---|---|---|
| L-B1-03 | feed and social invalidation | `likeNote(1)`, `unlikeNote(1)`, `addComment(1,'x')`, `triggerBot()` against `getCommunityFeed()` / `**/notes/feed*`; `followUser(2)`, `unfollowUser(2)` against `getFollowers()` / `**/follow/followers*` **and** against `getRecommendations()` / `**/books/recommendations*` and `getFriendReading()` / `**/userbooks/friends*` (F-20 requires `invalidateSocial()` to clear all six prefixes) | Major / P0 |
| L-B1-04 | the 16 circle mutations | `createGroup`, `updateGroup`, `deleteGroup`, `joinGroup`, `leaveGroup`, `approveGroupMember`, `rejectGroupMember`, `removeGroupMember`, `inviteToGroup`, `joinByInviteCode`, `acceptGroupInvite`, `declineGroupInvite`, `createGroupPost`, `deleteGroupPost`, `setGroupBook`, `clearGroupBook` — each probed against `getMyGroups()` / `**/groups/my*`. **All 16 names are asserted present in the probe list**, so a missed function fails the case by name, not silently | Major / P0 |
| L-B1-05 | notifications invalidation | `markAllNotificationsRead()` and the new `markNotificationRead(7)` against `getNotifications()` / `**/notifications/history*` **and** against `getUnreadCount()` / `**/notifications/unread-count*`; `updateNotificationPrefs({post_liked:false})` against `getNotificationPrefs()` / `**/notifications/prefs*` | Major / P0 |
| L-B1-06 | profile, import and admin invalidation | `uploadProfilePicture(new File([1],'a.png'))` against `getMyProfile()` / `**/profile/me*` (this one is a raw `fetch`, not `apiFetch`, and is the easiest to miss); `fixCoversBatch([1])` against `getMyBooks()` / `**/userbooks*`, `getCoversStatus()` / `**/import*` and `getCommunityFeed()` / `**/notes/feed*`; `adminDeleteNote(1)` and `adminDeleteComment(1)` against `getAdminNotes()` / `**/admin/content/notes*` and `getCommunityFeed()`; `setAdminRole(3)` against `getAdminStats()` / `**/admin/stats*` | Major / P1 |

**Also asserted in L-B1-03** (one extra step, no extra case): the 10 functions listed "already correct" in the brief — `updateMyProfile`, `addToLibrary`, `updateUserBook`, `updateProgress`, `markFinished`, `removeFromLibrary`, `createNote`, `updateNote`, `deleteNote`, `importGoodreads` — still give count 2 on their existing prefixes. A refactor that moves the `.then(r => { …; return r })` wrappers must not drop one.

### R-F26 · Make Admin sends the query the server requires

#### L-B1-07 — `setAdminRole` sends `?is_admin=true` · Critical / P0
**Arrange:** module harness; `page.route('**/admin/set-admin/**')` records `request.url()` and `request.method()`, fulfils `200 {"message":"ok","user_id":42,"is_admin":true}`.
**Act:** `setAdminRole(42)`.
**Assert:** exactly 1 request; method `POST`; the URL path is `/admin/set-admin/42` and the query string is exactly `is_admin=true`. *Today the call sends no query, so the server returns 422 into an empty catch and the button has never worked (`admin_router.py:321`). The allowlist (`admin_router.py:334`) still decides; see T-A2-45/46.*

### R-F03 web + R-F27 · Web subscribe, unsubscribe, and logout — `src/context/AuthContext.jsx`, `src/services/api.js`

#### L-B1-08 — `webUnsubscribe(subscription, token)` authenticates with the passed token · Critical / P0
**Arrange:** module harness; seed `localStorage.bt_token = 'CURRENT'`; `page.route('**/notifications/web-unsubscribe')` records method, headers and post body, fulfils `200 {"message":"ok"}`.
**Act:** `webUnsubscribe({endpoint:'https://fcm.googleapis.com/fcm/send/E1', keys:{p256dh:'k', auth:'a'}}, 'PRELOGOUT')`.
**Assert:** method `DELETE`; `authorization === 'Bearer PRELOGOUT'` — **the explicitly passed token wins over the stored one**, because `options.headers` is spread last in `apiFetchRaw`; the JSON body is exactly `{"subscription": {"endpoint": "https://fcm.googleapis.com/fcm/send/E1", "keys": {"p256dh": "k", "auth": "a"}}}`.
**Then, with the token cleared:** repeat with `webUnsubscribe(sub, null)` → the request still fires and carries **no** `authorization` header (it is the server's job to 401; the client must not throw before sending). *This is what makes logout's fire-and-forget call safe after `clearToken()` has already run.*

#### L-B1-09 — logout clears the session and the remembered visibility, and unsubscribes · Critical / P0 · **gate G-E2**
Full arrange/act/assert in **E2** below. This is the case G-E2 selects.

### R-F57 · Safe Back on About, Privacy and Terms — `src/utils/navigation.js` (new), 3 pages

#### L-B1-10 — Back never leaves the site or blanks the page · Major / P0
**Harness:** UI level (no module import), fresh browser context per sub-step so `history.state.idx` starts at 0.
1. **Direct open.** For each of `/about`, `/privacy`, `/terms`: `context.newPage()`, `page.goto(WEB + route)`, click the Back control (`getByRole('button', { name: /back/i })`, tolerating a Material Symbols ligature prefix per the `scenarios_web.mjs` convention). **Assert:** `new URL(page.url()).pathname` is `/` (or, for a logged-in context, `/` then the app's own redirect to `/home` — both accepted, see K-11); `document.body.innerText.trim().length > 0`; the page fired no `pageerror`.
2. **In-app history.** In one page: `goto(WEB + '/')`, click through to `/privacy` via the footer link, then click Back. **Assert:** the pathname is the route the page was on before `/privacy` (`/` or `/home`), and `window.history.state.idx` decreased by 1 — proving `navigate(-1)` was taken, not the `navigate('/', {replace:true})` branch.
3. **Never-`-1` guarantee.** After sub-step 1 on `/privacy` in a fresh context, `page.goBack()` at the browser level lands outside the app (`about:blank`). This is the state the old code produced; the case asserts the **in-app** Back control never reaches it.

`goBackOrHome` itself is unit-tested without a browser in **ST-B1-08**.

### B1 static checks

| # | Check | Command / method | Expected | Sev / Pri |
|---|---|---|---|---|
| ST-B1-01 | F-24: AppTour surfaces every failed save | `grep -n "catch" src/components/AppTour.jsx` | The 4 catch blocks at `AvatarStep.handleUpload` (`:67` today), `AvatarStep.handleSave` (`:79`), `GoalStep.handleSave` (`:155`) and `AddBookStep.handleAdd` (`:264`) each call `toast(<message>, 'error')`. The literals `/* ignore */` and `/* non-fatal */` occur **0** times in the file. `AvatarStep.handleSave` and `GoalStep.handleSave` `return` **before** `onSave(...)` in the catch (the step must stay open); `AddBookStep.handleAdd` does not reach `setAdded`. `import { useToast } from './Toast'` present | Major / P0 |
| ST-B1-02 | F-24: OnboardingPage step 2 does not advance on failure | `grep -n "non-fatal\|catch\|setSavingGoal" src/pages/OnboardingPage.jsx` | `/* non-fatal */` occurs **0** times; the `handleNext` step-2 catch (`:51` today) calls `toast(…, 'error')`, then `setSavingGoal(false)`, then `return` — before the step advance. Skip is unchanged | Major / P0 |
| ST-B1-03 | F-22: the service worker routes by `data.type` | `cat public/sw-push.js` | `urlForNotification(d)` exists and maps: `new_follower`/`post_liked`/`post_commented` → `/profile/${d.actor_id}` else `/notifications`; `book_completed`/`book_added` → `/home`; `reading_streak_reminder` → `/insights`; `group_invite`/`group_join_request`/`group_join_approved` → `/groups/${d.group_id}` else `/groups`; `group_join_rejected` → `/groups`; `default` → `/notifications`. The `notificationclick` handler calls `w.focus()` then `w.navigate(url)` inside a `try`, and `self.clients.openWindow(url)` when no window matched. The literal `const urlToOpen = '/'` (today `:20`) is **gone**. A comment names `src/pages/NotificationsPage.jsx` as the duplicated mapping. The `push` listener (`:1-16`) is byte-identical to `3157eee` | Major / P0 |
| ST-B1-04 | F-22: the inbox mapping matches | `grep -n "getDestination" -A 30 src/pages/NotificationsPage.jsx` | `group_join_approved` shares the `group_invite`/`group_join_request` case; a `group_join_rejected` case returns `'/groups'`; an **explicit** `admin_broadcast` case returns `null`; all three appear **before** `default` (without the explicit case, `default` would route through `actor_id`) | Major / P0 |
| ST-B1-05 | F-23 web: an unread row is marked read on the server | `grep -n "markNotificationRead" src/pages/NotificationsPage.jsx src/services/api.js` | `api.js` exports `markNotificationRead = (id) => apiFetch(\`/notifications/${id}/read\`, { method: 'POST' })` with a `.then` that calls the notifications invalidator; `NotificationsPage` imports it and calls `markNotificationRead(n.id).catch(() => {})` **inside** the existing `if (!n.is_read) { … }` block (`:190-192` today), **after** the optimistic `setNotifications` update, and the `if (dest) navigate(dest)` line is unchanged | Major / P0 |
| ST-B1-06 | F-27: no permission prompt on login or load | `grep -n "Notification.permission\|pushManager.subscribe\|webSubscribe" src/context/AuthContext.jsx` | `registerWebPush` returns early unless `getToken()` **and** `Notification.permission === 'granted'`; `pushManager.subscribe` is reachable only after that guard; **`webSubscribe(...)` is called on every run, not only inside `if (!sub)`** (today `:27` sits inside that branch, which is the F-03 web defect); the call passes `sub.toJSON()` and `navigator.userAgent.slice(0, 120)`. `Notification.requestPermission` occurs **0** times in `src/context/` | Critical / P0 |
| ST-B1-07 | F-03 web + E2: logout order | `grep -n "const logout" -A 8 src/context/AuthContext.jsx` | In `logout()`: `const token = getToken()` comes **first**, then `clearToken()`, then `localStorage.removeItem(NOTE_VISIBILITY_KEY)` (or the literal `'bt_note_visibility'`, see K-15), then `setUser(null)`, then `unregisterWebPush(token)`. `logout` is still **synchronous** and returns nothing — its four callers (`Nav.jsx:34`, `ProfilePage.jsx:500`, `SettingsPage.jsx:289`, `SettingsPage.jsx:297`) are unchanged (`git diff` shows no change to those lines) | Critical / P0 |
| ST-B1-08 | F-57: one shared helper, unit-tested | `node --test qa/unit/navigation.test.mjs`, plus `grep -n "navigate(-1)\|goBackOrHome" src/pages/AboutPage.jsx src/pages/PrivacyPage.jsx src/pages/TermsPage.jsx` | The unit test stubs `globalThis.window = { history: { state: { idx } } }` and asserts: `idx: 2` → `navigate` called once with `-1`; `idx: 0` → called once with `'/'` and `{ replace: true }`; `state: null` → the `'/'` branch; `state: {}` (no `idx`) → the `'/'` branch. The grep finds `navigate(-1)` **0** times in the three pages (today `AboutPage.jsx:16`, `PrivacyPage.jsx:9`, `TermsPage.jsx:9`) and `goBackOrHome(navigate)` once in each, with the import | Major / P0 |
| ST-B1-09 | F-10 inside B1's files | `grep -nE "text-on-surface-variant/(20\|30\|40\|50\|60\|70)\|text-on-surface/(40\|50\|60)\|text-outline(/[0-9]+)?\"\|text-error/(50\|60\|70)\|text-secondary/80\|text-primary/(60\|70)\|text-\[(7\|8\|9\|10\|11)px\]" src/components/AppTour.jsx src/pages/AdminPage.jsx src/pages/NotificationsPage.jsx src/pages/OnboardingPage.jsx` | Every remaining hit is on an icon-only `material-symbols-outlined` span or a `hover:`/`focus:`/`group-hover:`/`placeholder:` variant, and the Builder lists each skipped line in Build Notes. The brief's resting-state counts for these files are AppTour 2, AdminPage 10, NotificationsPage 4, OnboardingPage 1 colour and 0 size, so the edited count is ≤ 17 and the unedited remainder is explained line by line | Major / P1 |
| ST-B1-10 | no new client logging of anything sensitive | `git diff <base>..HEAD -- book-tracker-frontend-stitch/src book-tracker-frontend-stitch/public` added lines matching `console\.` | Every added `console.*` is inside `if (import.meta.env.DEV)`; none of the added lines contains `token`, `Authorization`, `endpoint`, `subscription`, `secret` or `p256dh`. `public/sw-push.js` adds no `console.*` at all | Critical / P0 |

### E2 · Logout must clear the remembered note visibility (Sprint 4B Architect escalation, 2026-09-13) · Critical

**The escalation.** Android 2.2.2 and web share the remembered note-visibility choice under the same key name, `bt_note_visibility` (4A architecture, Sprint 4B handoff row F-17: "4B should mirror it with AsyncStorage key `bt_note_visibility`"). On web, `localStorage` is per **origin**, not per account. On a shared browser — a library machine, a family laptop, the same phone browser used by two people — user A choosing **Public** leaves `bt_note_visibility=public` behind after A signs out. User B then signs in, opens the Home composer, and the switch reads **Public** before B has ever chosen. B's first reflection publishes to the Community feed. That is exactly the F-17 defect this sprint exists to close, re-opened through storage instead of through the API default.

**The fix.** `logout()` must remove the key. The real implementation is:

- **File:** `book-tracker-frontend-stitch/src/context/AuthContext.jsx`, function `logout` — today lines **59-62**:
  ```js
  const logout = () => {
    clearToken();
    setUser(null);
  };
  ```
  `clearToken()` (`src/services/api.js:6`) removes only `TOKEN_KEY` = `'bt_token'`. Nothing else in the app removes `bt_note_visibility` (grep: the key does not exist anywhere in `src/` at `3157eee`).
- **After 4A** it reads, in this order (the order is asserted by ST-B1-07, because `unregisterWebPush` needs the pre-`clearToken` token):
  ```js
  const logout = () => {
    const token = getToken()                          // F-03 web: capture before clearing
    clearToken()
    localStorage.removeItem(NOTE_VISIBILITY_KEY)      // E2: the next account must start at "Only me"
    setUser(null)
    unregisterWebPush(token)                          // fire-and-forget
  }
  ```
  `NOTE_VISIBILITY_KEY` is B2's exported constant from `src/utils/noteVisibility.js` (see **K-15** for the cross-package import and its fallback).

**The assertion — L-B1-09, run by `qa/web_4a_local.mjs`:**

**Arrange.** One fresh Playwright context on the local dev server.
1. `context.addInitScript` seeds `localStorage.bt_token = <review.reader token from POST /auth/review-login>` and `localStorage.bt_onboarding_v1 = 'done'` (the same pattern `qa/a11y_audit.mjs:97` uses).
2. `page.addInitScript` also seeds `localStorage.bt_note_visibility = 'public'` — the state a previous account would leave behind.
3. `page.route('**/notifications/web-unsubscribe')` records `{ method, headers.authorization, postData }` and fulfils `200 {"message":"ok"}`. `page.route('**/notifications/vapid-public-key')` fulfils a fixed key so registration never reaches the network.
4. `page.goto(WEB + '/home')` and wait for `GET /profile/me` to resolve. Read `localStorage.bt_note_visibility` → it must be `'public'` at this point (the arrange is real).

**Act.** Click the sign-out control in `Nav.jsx` — `getByRole('button', { name: /sign out/i })`, tolerating the `logout ` ligature prefix — and wait for `location.pathname` to become `/`.

**Assert — all five, any one failing fails the case:**
1. `localStorage.getItem('bt_note_visibility') === null`. **Not `'private'`** — the key is *removed*, so a user who has never chosen still falls to the `readNoteVisibility()` default rather than to a written value.
2. `localStorage.getItem('bt_token') === null`.
3. Exactly **1** `DELETE /notifications/web-unsubscribe` was recorded, and its `authorization` header is `Bearer <the seeded token>` — i.e. the pre-logout token, not an empty header (this is the F-03 web half riding the same flow).
4. Re-entering the app in the **same** context — `page.goto(WEB + '/')`, sign in again by seeding the second review account's token, open `/home` — shows the Home composer's visibility control with **Only me** selected (`[role="radio"][aria-checked="true"]` has the accessible name `t('feed.visibilityPrivate')` = "Only me").
5. No other `localStorage` key was removed: `bt_onboarding_v1` still reads `'done'`. *Logout must not wipe unrelated per-browser state.*

**Gate G-E2:**
```
node qa/web_4a_local.mjs --only L-B1-09
```
**Expected output, exactly these two lines on stdout (exit code 0):**
```
PASS L-B1-09 logout clears bt_token and bt_note_visibility and unsubscribes with the pre-logout token
4A web local: 1 passed, 0 failed
```
Any `FAIL` line, any additional case in the output, or exit code 5 (a production host was passed) or 6 (a precondition is missing) fails the gate. G-E2 is a **ship blocker for the web deploy** and a precondition for Sprint 4B mirroring the key in AsyncStorage: 4B must not ship the shared key name until web provably clears it.

**Static half:** ST-B1-07 (order and literal) and ST-B2-03 (the key name and its single source).

---

## 5. Package B2 — Web content pages: circles, book preview, library, composers, search, locales

### R-F17 web · The remembered Public / Only me switch

New files: `src/utils/noteVisibility.js`, `src/components/VisibilityToggle.jsx`. Composers: `HomePage.jsx` (`PostComposer`, send at `:386`), `BookDetailPage.jsx` (`:218`), `ProfilePage.jsx` (`:147`, which omits the key today).

All six cases below run in `qa/web_4a_local.mjs` against the local dev server, signed in as review.reader, with `page.route('**/notes/')` recording the POST body so the **request**, not just the UI, is asserted. `PRIV` = `t('feed.visibilityPrivate')` = "Only me"; `PUB` = `t('feed.visibilityPublic')` = "Public"; the selected option is `[role="radio"][aria-checked="true"]` inside the `role="radiogroup"` labelled `t('feed.visibilityLabel')`.

| # | Case | Arrange → act → assert | Sev / Pri |
|---|---|---|---|
| L-B2-01 | fresh context defaults to Only me | Fresh context, **no** `bt_note_visibility` seeded. Open `/home`, then a book detail page for one seeded userbook, then `/profile`. **Assert:** on all three, the selected radio's accessible name is `PRIV`, and `localStorage.getItem('bt_note_visibility')` is still `null` — *rendering must not write the key; only a change writes it* | Critical / P0 |
| L-B2-02 | the choice is written on change and survives reload, across all three composers | Fresh context, `/home`. Click the `PUB` radio. **Assert immediately, without posting:** `localStorage.getItem('bt_note_visibility') === 'public'`. Reload `/home`, then open book detail, then `/profile`. **Assert:** all three show `PUB` selected | Critical / P0 |
| L-B2-03 | a Public post sends `is_public: true` and lands in the feed | From L-B2-02's state, type `QA F17 public <ts>` in the Home composer and Post. **Assert:** the recorded `POST /notes/` body has `is_public === true`; the response is 201 with `is_public: true`; a card containing the text is the **first** `article` in the Community list within 20 s; the toast reads "Reflection posted!" **Cleanup:** the harness deletes the note by the id from the 201 | Critical / P0 |
| L-B2-04 | clearing storage returns to Only me | In the same context, `page.evaluate(() => localStorage.clear())`, re-seed only `bt_token`, reload `/home`. **Assert:** `PRIV` selected; the key is absent | Critical / P0 |
| L-B2-05 | an Only me post is private, toasted, and never inserted | Fresh context. On `/home`, ensure `PRIV` is selected, type `QA F17 private <ts>`, Post. **Assert, all of them:** the recorded body has `is_public === false`; the 201 response has `is_public: false`; the toast text equals the `en.json` value of `feed.savedPrivately` — "Saved privately — find it on your Profile"; **no `article` containing the text exists in the Community list**, and none appears after switching to Friends and back (wait 20 s, matching the S1 hook's window); `GET /notes/me` **does** contain the id; the switch still shows `PRIV` after the post (*the brief says do not reset it*). Then open the same feed in a **logged-out** context and assert the text is absent. **Cleanup:** delete by id | Critical / P0 |
| L-B2-06 | Book detail and Profile composers always send the field | With `bt_note_visibility='private'`: post from the book-detail composer and from the Profile composer. **Assert:** both recorded bodies contain the key `is_public` with value `false` — *`ProfilePage.jsx:147` omits it today, which is the exact Android-2.2.1-equivalent defect on web*. Then set the switch to Public on book detail and post again: body `is_public === true`, and the note appears in the owner's own book-detail and Profile lists (those lists show only the owner's notes, so they keep inserting either way). **Cleanup:** delete all three by id | Critical / P0 |

### R-F60 · A post made while the feed loads stays visible — `src/pages/HomePage.jsx`

Today `fetchFeed` (`:712-717`) ends with `setPosts(data || [])` and `handleNewPost` (`:741`) prepends; the stale response wipes the post. All four cases use `page.route` to **delay** the feed responses (`await new Promise(r => setTimeout(r, ms)); route.continue()`), which is the only way to make the 9 s production race deterministic locally now that F-08 has made the real feed fast.

| # | Case | Arrange → act → assert | Sev / Pri |
|---|---|---|---|
| L-B2-07 | **the S1 hook** — a post during the first load survives | Delay `GET /notes/feed` by **5 s**. Open `/home` and, without waiting for the feed, post a **Public** note `QA F60 s1 <ts>` from the composer. Let the feed resolve. **Assert:** a card with that text is the **first** `article`, is present within **20 s** of the 201, and is **still** present 3 s after the feed response landed (the stale-response wipe happens on resolve, so the check must come after it). This is the same assertion `qa/scenarios_web.mjs` S1 makes on production (P-12) | Major / P0 |
| L-B2-08 | a tab switch never shows the other tab's posts | Delay `GET /notes/feed` by **5 s** and `GET /notes/friends-feed` by **0.5 s**. Load `/home` on Community and click Friends immediately. Let both resolve. **Assert:** after both responses, the rendered article ids equal exactly the ids in the **friends-feed** response body, in order; the Friends tab is still the active tab; no id from the community response is rendered | Major / P0 |
| L-B2-09 | a deleted local post is not resurrected | Delay `GET /notes/feed` by **6 s**. Post a Public note, then delete it through the card's own menu **before** the feed resolves. **Assert:** `DELETE /notes/{id}` returned 200; after the feed resolves and for 3 s afterwards, no article contains the text; `GET /notes/me` does not contain the id | Major / P0 |
| L-B2-10 | a private post is never carried into the list | Delay `GET /notes/feed` by **5 s**. With `PRIV` selected, post `QA F60 priv <ts>`. **Assert:** the `feed.savedPrivately` toast shows; **no** article contains the text before the feed resolves, and none after; `handleNewPost` was never reached (the harness proves this by asserting the Community article count before and after the feed lands equals the response length). **Cleanup:** delete by id | Critical / P0 |

### R-F07 web · The Add Book payloads carry the dedup keys

#### L-B2-11 — `BookPreviewModal` sends `book_id` and `isbn` · Critical / P0
**Arrange:** signed in; `page.route('**/books/add-to-library')` records the POST body and fulfils a 200 userbook. Open `/home` and click a "For You" recommendation card to open `BookPreviewModal` (every opener passes a Book: recommendations, friends-reading `.book`, circle `current_book`).
**Act:** choose a status and press Add.
**Assert:** the body contains `book_id` equal to the recommendation item's `id` **and** `isbn` equal to the item's `isbn` (null is acceptable only when the item's own value is null — the harness compares against the item it read from `GET /books/recommendations`), alongside today's `google_books_id`, `title`, `author`, `cover_url`, `total_pages`, `status`. No key that the modal sends today is removed.
**Then, unstubbed against the local API:** repeat against a book the user already owns → the modal shows the error toast carrying the server's 400 detail `This book is already in your library in the 'Want to Read' tab.`, and `GET /books/search?q=<title>` shows **no** new catalogue row.

`LibraryPage.handleAdd` (`:192-202`, the live Add Book modal) is covered statically by **ST-B2-09** rather than by a case here: opening it needs a Google Books search, which after F-29 spends the shared anonymous/authenticated Google quota on every run, and the grep proves the one-line change exactly.

### R-F21 · The dead format filter is gone — `src/pages/SearchPage.jsx`

#### L-B2-12 — the Google tab shows every result and no chips · Major / P1
**Arrange:** signed in; `page.route('**/api/googlebooks/search*')` fulfils a fixed payload of **6** results, of which none carries any binding or format field (the API never returns one — that is the whole defect).
**Act:** open `/search`, select the Google tab, search `dune`.
**Assert:** `getByRole('button', { name: /all|hardcover|paperback|ebook|kindle|pdf|audiobook/i })` inside the results header matches **0** elements; the rendered result count text equals `t('search.resultsCount', { count: 6 })`; exactly 6 result rows render. *Today `filterByFormat` (`:255-265`) drops every Google result whose binding is unknown, so the tab shows an empty state.*

### R-F25 · Destructive circle actions ask first — `src/pages/GroupDetailPage.jsx`

#### L-B2-13 — Leave, Remove member and Delete post all confirm, and Cancel sends nothing · Critical / P0
**Arrange:** signed in as review.reader on the seeded **Review Circle** (`scripts/seed_review_accounts.py`), which has review.friend as a second member. A network guard in the harness **aborts** `DELETE /groups/*/leave`, `DELETE /groups/*/remove/*` and `DELETE /groups/*/posts/*` and records them, so a mis-fired mutation cannot touch the seeded fixture (same safety pattern as `qa/interaction_audit.mjs`). One group post is created through the UI at the start of the case and is the only post the delete step targets.
**Act and assert, three flows, each twice:**
1. **Leave.** Click Leave. **Assert:** an in-app modal (not `window.confirm`) appears with title `t('groups.leaveCircle') + '?'` and body `t('groups.leaveConfirm', { name: 'Review Circle' })`; **0** requests were recorded. Click Cancel → the modal closes and **0** requests were recorded. Re-open and click the confirm button labelled `t('groups.leave')` → exactly **1** `DELETE /groups/{id}/leave` was attempted (and aborted by the guard). A backdrop click while the modal is open closes nothing and sends nothing.
2. **Remove member.** Same, with title `t('groups.removeMemberTitle')`, body `t('groups.removeMemberConfirm', { name: <the member's display name> })` — the name must be **interpolated**, not a literal `{{name}}` — and confirm label `t('groups.remove')`.
3. **Delete post.** Same, with `t('groups.deletePostTitle')` / `t('groups.deletePostConfirm')` / `t('groups.delete')`. Then, with the guard set to fulfil `500 {"detail":"Internal Server Error"}` instead of aborting, confirm once more: **an error toast appears** carrying the server detail, and the post is **still** in the list (today `handleDeletePost` at `:643-644` has no catch at all).
**Also asserted:** the existing Disband modal (`showDeleteConfirm`, rendered at `:1182`) still works and is a **separate** state from the new generic `confirm` state — opening one does not open the other.

### B2 static checks

| # | Check | Command / method | Expected | Sev / Pri |
|---|---|---|---|---|
| ST-B2-01 | F-17: no composer hard-codes visibility | `grep -n "is_public" src/pages/HomePage.jsx src/pages/BookDetailPage.jsx src/pages/ProfilePage.jsx` | `is_public: true` (today `HomePage.jsx:386`, `BookDetailPage.jsx:218`) occurs **0** times; each of the three `createNote` calls sends `is_public: visibility === 'public'`; `ProfilePage.jsx:147` now has the key. The dead `LibraryPage.jsx:401` `BookDetailPanel` composer is **not** edited (`git diff` shows no change in `:306-604`) | Critical / P0 |
| ST-B2-02 | F-17: the toggle is a real radiogroup and writes on change | `cat src/components/VisibilityToggle.jsx` | Props are exactly `{ value, onChange }`; the wrapper has `role="radiogroup"` and an accessible name from `t('feed.visibilityLabel')`; each option has `role="radio"` and `aria-checked`; **Only me** (icon `lock`) is rendered **first**; the click handler calls `writeNoteVisibility(next)` **before** `onChange(next)`; there is no `useEffect` that writes the key on mount | Critical / P0 |
| ST-B2-03 | F-17 + E2: one key, one source of truth | `grep -rn "bt_note_visibility\|NOTE_VISIBILITY_KEY" src/ public/` | `src/utils/noteVisibility.js` exports `NOTE_VISIBILITY_KEY = 'bt_note_visibility'`, `readNoteVisibility` and `writeNoteVisibility`. The **string literal** `'bt_note_visibility'` appears in that file only — every other reference (the three composers, `AuthContext.jsx` for E2) imports the constant. If K-15 is resolved the other way, exactly **one** extra literal is allowed, in `AuthContext.jsx`, carrying a comment naming `noteVisibility.js` | Critical / P0 |
| ST-B2-04 | F-60: the stale-response guards exist | `grep -n "requestSeq\|activeTabRef\|localPosts\|setPosts(data" src/pages/HomePage.jsx` | `setPosts(data || [])` (today `:717`) occurs **0** times; `useRef` declarations for `requestSeq`, `activeTabRef` and `localPosts` are present; `fetchFeed` increments `requestSeq.current` at entry and returns early when `seq !== requestSeq.current || tab !== activeTabRef.current`; `handleDeletePost` and `handleEditPost` both touch `localPosts.current`; `handleNewPost` pushes `{ post, tab: activeTabRef.current }` | Major / P0 |
| ST-B2-05 | F-21: the chips and the filter are gone, the i18n keys are not | `grep -n "FORMAT_OPTIONS\|activeFormat\|filterByFormat" src/pages/SearchPage.jsx` → no output; `grep -c "\"format\"" src/i18n/locales/en.json` | 0 hits in `SearchPage.jsx` (today `:169`, `:180`, `:255-265`, `:314`); `:267` reads `const activeResults = tab === 'google' ? googleResults : localResults`; the `format.*` block still exists in **all 6** locale files (the brief forbids deleting it — other screens use it); `book-tracker-mobile-stitch/` is untouched | Major / P1 |
| ST-B2-06 | F-25: ask and do are separate functions | `grep -n "handleLeave\|doLeave\|handleRemoveMember\|doRemoveMember\|handleDeletePost\|doDeletePost\|setConfirm" src/pages/GroupDetailPage.jsx` | `handleLeave`, `handleRemoveMember` and `handleDeletePost` contain **no** `await leaveGroup` / `removeGroupMember` / `deleteGroupPost` call — each only calls `setConfirm({ title, body, confirmLabel, onConfirm })`; the three `do*` functions hold the calls; `doDeletePost` has a `try/catch` whose catch calls `toast(..., 'error')`; the generic modal's confirm handler clears `confirm` **before** awaiting (`const fn = confirm.onConfirm; setConfirm(null); await fn()`), so a double-click cannot fire twice; `showDeleteConfirm` (Disband) is still a separate `useState` | Critical / P0 |
| ST-B2-07 | i18n parity does not regress (K-02) | `node -e` over the 6 locale files: for each, the set of dotted key paths | All **12** new keys — `groups.leaveConfirm`, `groups.leave`, `groups.removeMemberTitle`, `groups.removeMemberConfirm`, `groups.remove`, `groups.deletePostTitle`, `groups.deletePostConfirm`, `groups.delete`, `feed.visibilityLabel`, `feed.visibilityPublic`, `feed.visibilityPrivate`, `feed.savedPrivately` — exist in **all 6** of `en, de, es, fr, pt, ru`. Baseline (2026-09-13): en 500 keys, de/es/fr/pt 468, ru 478 with 10 extra. **After:** en 512; each of de/es/fr/pt ≥ 480; ru ≥ 490; **no locale's `en`-missing count exceeds its baseline of 32**, and ru's extra-key count is still 10. `en.json` values are exactly the strings in the architecture tables (byte-compared) | Major / P1 |
| ST-B2-08 | `noteVisibility.js` behaves under every storage state | `node --test qa/unit/noteVisibility.test.mjs` | 5 assertions: (a) with `globalThis.localStorage` **undefined**, `readNoteVisibility() === 'private'` and `writeNoteVisibility('public')` does **not** throw (the Node `ReferenceError` is swallowed by the module's `catch`) — this is the "storage blocked / private mode" case the brief calls out; (b) stub storage returning `null` → `'private'`; (c) `'public'` → `'public'`; (d) `'PUBLIC'`, `'yes'`, `''` → `'private'` (only the exact string counts); (e) `writeNoteVisibility('anything-else')` stores `'private'`, `writeNoteVisibility('public')` stores `'public'`, both under the key `'bt_note_visibility'` | Major / P0 |
| ST-B2-09 | F-07 web: the two Add payloads | `grep -n "addToLibrary" -A 14 src/components/BookPreviewModal.jsx src/pages/LibraryPage.jsx` | `BookPreviewModal.handleAdd` (today `:56-63`) adds `book_id: book.id \|\| null` **and** `isbn: book.isbn \|\| null`; `LibraryPage.handleAdd` (the live modal, today `:189-207`) adds `google_books_id: book.google_books_id \|\| null` and **does not** send `book_id` (Google results have no local id); `isbn` is still sent there. The dead `BookDetailPanel` block (`:306-604`) has no logic change in `git diff` — only F-10 class renames | Critical / P0 |
| ST-B2-10 | F-10 inside B2's files, including the synthetic cover | The ST-B1-09 grep, run over `BookPreviewModal.jsx`, `GroupDetailPage.jsx`, `HomePage.jsx`, `BookDetailPage.jsx`, `ProfilePage.jsx`, `SearchPage.jsx`, `LibraryPage.jsx` | Remaining hits are icon-only spans or non-resting variants, each listed in Build Notes. `HomePage.jsx:135` `COVER_COLORS` contains `'#256b29'`, `'#a84300'` and `'#a52f0a'` and **not** `'#2e7d32'`, `'#e65100'`, `'#bf360c'`; the other five entries are byte-identical. `HomePage.jsx:151` is now `className="hidden md:line-clamp-4 text-xs font-bold text-center leading-tight"`; `text-[7px]` occurs **0** times in `src/` | Major / P1 |

---

## 6. Package C — Web styling: F-10 tokens and the pages no other package touches

Package C owns `tailwind.config.js` plus `Nav.jsx`, `CreateGroupPage.jsx`, `GroupsPage.jsx`, `InsightsPage.jsx`, `LoginPage.jsx`, `SettingsPage.jsx`, `UserProfilePage.jsx`. B1 and B2 apply the **same** mapping to their own files, so the repo-wide greps below (ST-C-02, ST-C-03) are the only checks that can prove the mapping is complete; they are listed under C because C owns the tokens those greps depend on, and they fail if **any** package missed a line.

### C static checks

| # | Check | Command / method | Expected | Sev / Pri |
|---|---|---|---|---|
| ST-C-01 | the two tokens exist with exactly the approved hexes | `grep -n "on-surface-muted\|on-surface-faint" book-tracker-frontend-stitch/tailwind.config.js` | `"on-surface-muted": "#586060"` and `"on-surface-faint": "#636a6a"` (orchestrator default 2026-09-13). No existing colour is changed or removed: `git diff 3157eee..HEAD -- tailwind.config.js` adds exactly 2 lines and removes 0 | Critical / P0 |
| ST-C-02 | no resting-state low-contrast text class survives anywhere | `grep -rnE "text-on-surface-variant/(20\|30\|40\|50\|60\|70)\|text-on-surface/(40\|50\|60)\|text-error/(50\|60\|70)\|text-secondary/80\|text-primary/(60\|70)" book-tracker-frontend-stitch/src` | Every remaining hit is (a) preceded by `hover:`, `focus:`, `group-hover:` or `placeholder:`, or (b) on an element whose only child is a `material-symbols-outlined` ligature. The Builders' Build Notes list every hit in class (b), file and line. **`text-on-surface/70` is not in the pattern** — it already passes at 6.32 / 5.88 and must not be changed | Critical / P0 |
| ST-C-03 | nothing renders below 12 px | `grep -rnE "text-\[(7\|8\|9\|10\|11)px\]" book-tracker-frontend-stitch/src` | **No output.** The one sub-12 px string that could not grow in place — the synthetic cover title, `HomePage.jsx:151` — is hidden below `md` instead (ST-B2-10), so this grep is absolute | Critical / P0 |
| ST-C-04 | badges grew without breaking their circles | `grep -rn "rounded-full" book-tracker-frontend-stitch/src \| grep -E "w-4 h-4\|min-w-\[18px\]"` | The 12 fixed-size number circles (e.g. `Nav.jsx:66`) now read `min-w-[18px] h-[18px] px-1 text-xs leading-none rounded-full`; **0** remaining `w-4 h-4 … text-[10px] rounded-full` badges | Major / P1 |
| ST-C-05 | `text-outline` on text became a token, on icons did not | `grep -rnE "text-outline(/[0-9]+)?[\"' ]" book-tracker-frontend-stitch/src` | Every remaining hit is on a `material-symbols-outlined` element (the `menu_book` placeholders, the empty stars at `LibraryPage.jsx:77` and `BookDetailPage.jsx:45`) or a non-resting variant. Every hit on a text node became `text-on-surface-faint`. Borders and backgrounds using `outline` are untouched | Major / P1 |
| ST-C-06 | the token pairings are arithmetically safe | `node qa/unit/contrast.test.mjs` (`node --test qa/unit/`) | A pure-Node WCAG 2.1 relative-luminance computation over the two new tokens against `#ffffff`, `#fbf9f4`, `#f5f3ee`, `#f0eee9` and `#eae8e3` reproduces the architecture's table to 2 decimals (muted 6.45 / 6.13 / 5.81 / 5.56 / 5.27; faint 5.53 / 5.25 / 4.98 / 4.77 / 4.51) and asserts every value **≥ 4.5**. It also asserts the guard the brief states: `on-surface-faint` on `#e4e2dd` computes **< 4.5** (≈ 4.3), and `grep -rn "text-on-surface-faint" src` finds no line that also carries `bg-surface-container-highest` or `bg-surface-variant` | Critical / P0 |

### C local checks

| # | Case | Method | Expected | Sev / Pri |
|---|---|---|---|---|
| L-C-01 | axe finds no contrast failure on the 16 pages, locally | `node qa/a11y_audit.mjs --web http://localhost:5174 --api http://127.0.0.1:8765` against the dev server with the merged C + B1 + B2 tree | The written `qa/reports/a11y-<date>.json` has **0** `color-contrast` nodes across all 16 routes the script visits (11 authed: `/home`, `/library`, `/library/book/{id}`, `/groups`, `/groups/{id}`, `/groups/new`, `/insights`, `/notifications`, `/profile`, `/profile/111`, `/settings`; 5 public: `/`, `/about`, `/privacy`, `/terms`, `/blog`). Baseline at `3157eee` is **203 nodes on 12 of 16 pages**. **Precondition:** the local API must have `REVIEW_LOGIN_SECRET` / `REVIEW_LOGIN_EMAILS` set and `scripts/seed_review_accounts.py` run against it. If it does not, L-C-01 is **skipped** and P-19 becomes the only proof — the Builder records the skip and the reason in Build Notes rather than claiming a pass | Critical / P0 |
| L-C-02 | every visible text node is ≥ 12 px in the browser | A `page.evaluate` pass in `qa/web_4a_local.mjs` over the same 16 routes: walk every element with a non-empty `innerText` and no element children, read `getComputedStyle(el).fontSize`, and collect anything `< 12` | **0** elements below 12 px on any route, excluding elements whose `font-family` contains `Material Symbols` (icon ligatures, governed by WCAG 1.4.11, not 1.4.4). The failure message lists `route · selector · size`. *This catches a `text-xs` that a parent overrode and any px value the ST-C-03 grep cannot see, e.g. an inline `style`* | Major / P1 |

### Web shared checks (B1 + B2 + C) — run on the merged web tree, before the Vercel deploy

K-01's "W-02" is **ST-W-02** below.

| # | Check | Command | Expected | Sev / Pri |
|---|---|---|---|---|
| ST-W-01 | the app builds | `npm --prefix book-tracker-frontend-stitch run build` | Exit 0. `dist/` is produced. No warning naming a module that cannot be resolved — in particular **`src/utils/noteVisibility.js` and `src/utils/navigation.js` both resolve**, which is the K-15 cross-package import risk made visible. Spec cross-cutting item "`npm run build` passes" | Critical / P0 |
| ST-W-02 | lint does not get worse (K-01) | `npx --prefix book-tracker-frontend-stitch eslint . -f json` from the frontend directory | Baseline at `3157eee` is **44 problems: 37 errors, 7 warnings**, none of them from 4A. **After:** total errors **≤ 37** and total warnings **≤ 7**; and **0 problems** in the files 4A creates — `src/utils/navigation.js`, `src/utils/noteVisibility.js`, `src/components/VisibilityToggle.jsx`. "`npm run lint` passes" is **not** achievable without out-of-scope edits and is not required | Major / P1 |
| ST-W-03 | the packages stayed disjoint and stayed inside the web tree | `git diff --stat <4A web merge base>..HEAD -- book-tracker-frontend-stitch app tests context book-tracker-mobile-stitch dependency-map.md` | No file appears in more than one package's commit range; `tailwind.config.js` appears in **C only**; `LibraryPage.jsx` in **B2 only**; `app/`, `tests/`, `context/`, `book-tracker-mobile-stitch/` and `dependency-map.md` are **empty** in the web range (the backend ships separately, steps 2 vs 4 of the merge order). **`qa/` is exempt** — the `L-` harness and `qa/unit/` are QA-owned, not Builder-owned (K-20) | Major / P0 |

---

## 0b. Findings from finishing this plan (B1, B2, C, E2) — read before building the web packages

These continue section 0's numbering. **Section 0 itself is unchanged**: K-01..K-14 were handed to the A1/A2 Builders before these were found, and renumbering them would break the cross-references already written into sections 2 and 3.

| # | Finding | Impact on this plan | Owner |
|---|---|---|---|
| K-15 | **E2 makes B1 depend on a B2 file.** Clearing `bt_note_visibility` in `AuthContext.jsx` (B1) needs `NOTE_VISIBILITY_KEY` from `src/utils/noteVisibility.js` (B2). The architecture's disjointness note explicitly claims "`src/utils/` is a new directory holding two files owned by different packages… No file is shared". An import makes B1 **unbuildable alone**. | **Recommended resolution:** B1 imports the constant, and the execution plan records `src/utils/noteVisibility.js` as a **read-only dependency of B1**. This is safe because the merge order deploys the web as one unit (C + B1 + B2 → one Vercel deploy, architecture step 4). **If B1 must build before B2 lands**, B1 uses the literal `'bt_note_visibility'` with a comment naming `noteVisibility.js`, and ST-B2-03 allows that one extra literal. Either way ST-W-01 is the check that catches a wrong choice. | Architect |
| K-16 | **E2 extends approved scope.** Spec R-F17's accept criteria say only "clearing storage returns to Only me"; they do not say logout clears the key. E2 adds a behaviour the PM has not seen. | **Recommended resolution: accept.** The reset is privacy-protective and lands on the safe default, and it is the web half of a key Sprint 4B is about to mirror in AsyncStorage. PM Helper adds one line to R-F17: "Logout removes the key, so the next account on a shared browser starts at Only me." Without it, F-17 is re-opened through storage on any shared browser. | PM Helper |
| K-17 | **Three web fixes cannot be automated at all.** A real web push (F-22 push-click routing, F-03 web delivery to the right account), the Notification **permission prompt not firing** (F-27), and "the tiers stay visibly distinct" (F-10) need a real push service, a real permission state and a human eye. Playwright cannot deliver a web push to a dev-server origin, and a granted/denied permission cannot be faked into the real `Notification.permission` the code reads. | Not pretended to be automated. F-22 and F-27 are covered statically by ST-B1-03, ST-B1-04 and ST-B1-06, and by hand in **P-17** and **P-18**. F-10's visual tiering is **P-19 step 3**, a screenshot comparison a human signs off. | QA |
| K-18 | **The web app has no test runner and gets none.** `book-tracker-frontend-stitch/package.json` has no vitest/jest/playwright; Playwright 1.60.0 lives only in `qa/node_modules`. | Every `L-` case runs from `node qa/web_4a_local.mjs` (Playwright from `qa/`); the two pure-ESM utils and the contrast arithmetic run under `node --test qa/unit/`. **No dependency is added to the frontend package**, so ST-W-01 and ST-W-02 keep measuring the shipping app. | QA |
| K-19 | **The pytest total in section 1 undercounts by 2.** Section 3 defines **101** A2 ids (`T-A2-01`..`T-A2-100` plus `T-A2-16a`); the Summary table says 99. So new pytest is **172**, not 170, and with the 17 regression pytests **189**, not 187 — making the merge gate **435**, not K-09's 433. | **G-04 expects `435 passed, 0 failed`.** 431–435 passes **only** when each missing case is one of the four droppable race tests (T-A2-75..78, K-12) with a reason in Build Notes. Any other number stops the merge. Section 1's table is left as written rather than edited, because A1/A2 are already in build; QA corrects it in the post-run pass. | QA / Junior QA |
| K-20 | **The test harness files belong to no package.** `qa/web_4a_local.mjs` and `qa/unit/*.test.mjs` are not in any of the five "exhaustive" file lists in the architecture's execution plan. | They are **QA-harness files**, like `qa/adversarial_probe.py` in K-04 — written by QA, not by a Builder, and not counted against any package's diff. ST-W-03 exempts `qa/`. A Builder that writes them anyway must say so in Build Notes so the disjointness check is not read as a violation. | QA harness (not a Builder) |
| K-21 | **The local harness needs two non-default flags.** `vite.config.js` sets no `server.port`, so `npm run dev` serves **5173**, while every `qa/*.mjs` defaults to **5174**; and the committed `.env` points `VITE_API_BASE_URL` at **production**, so a plain `npm run dev` would drive the local browser against live data — a direct breach of `qa/RULES_OF_ENGAGEMENT.md`. | The harness refuses to run against a `trackmyread.com` / `onrender.com` host (exit 5) and asserts its preconditions (exit 6). The documented command is `npm --prefix book-tracker-frontend-stitch run dev -- --mode localapi --port 5174`. Recorded here because getting it wrong points local tests at production. Critical. | QA / Builders |

---

## 7. Migration and deploy-order gates

Ordered. A gate fails → stop; do not run the next one. Commands are run from `/c/Users/sonal/Documents/projects/book-tracker`; pytest runs from `.venv` (ST-A2-04).

| # | Gate | When | Command | Exact expected output | Sev |
|---|---|---|---|---|---|
| G-01 | F-53 duplicate census | Before anything else | Supabase SQL Editor: **STEP 1** and **STEP 1b** of the 4A section of `context/supabase_migration.sql`, each on its own | STEP 1 returns exactly 3 rows, `tbl` ∈ {`userbook`, `like`, `follow`}, each with `dup_groups` and `surplus_rows`. STEP 1b returns one row per duplicate library entry with its `keeper_id`. **The PM records all six numbers and the 1b row count before proceeding** — they are the only "before" evidence, and G-02 destroys the state they describe | Critical P0 |
| G-02 | F-53 dedupe | Immediately after G-01 | **STEP 2** as one statement block | `COMMIT` succeeds with no error. Backup tables `dedupe_20260913_userbook`, `dedupe_20260913_userbook_keeper`, `dedupe_20260913_repoint`, `dedupe_20260913_like`, `dedupe_20260913_follow` exist. The `DELETE FROM userbook` row count equals G-01's `userbook.surplus_rows`; the like and follow deletes equal theirs | Critical P0 |
| G-03 | F-53 unique indexes | **Immediately** after G-02, in the same session (K-07) | **STEP 3** | The final `SELECT indexname FROM pg_indexes …` returns exactly 3 rows: `uq_userbook_user_book`, `uq_like_note_user`, `uq_follow_pair`. **If STEP 3 errors with a uniqueness violation, stop.** New duplicates arrived between G-02 and G-03, and `CREATE TABLE IF NOT EXISTS` means STEP 2 **cannot be re-run** — its snapshot is stale and 2c/2e/2f would act on deleted ids. Get a follow-up script from the Architect (K-07) | Critical P0 |
| G-04 | Backend suite on the merged A1 + A2 tree | After A1 + A2 merge, before push | `.venv\Scripts\python -m pytest tests -q` | Final line matches `435 passed` with **0 failed** and 0 errors. Arithmetic: **252 baseline − 6 deleted + 189 new (172 case pytests + 17 regression pytests) = 435** (K-09, corrected by K-19). 431–434 is accepted **only** for droppable race tests T-A2-75..78 named in Build Notes (K-12); the three DB-constraint tests T-A2-70..72 may never be dropped | Critical P0 |
| G-05 | Dependency map regenerated | After G-04 | `python scripts/gen_dependency_map.py && git diff --stat dependency-map.md` | Exit 0. The generated appendix loses the `POST /auth/signup` and `POST /auth/login` rows, gains `POST /notifications/{notification_id}/read` with auth `user`, and keeps `⚠️ NONE` on the `/api/googlebooks/*` rows. The curated section's **(4A — in build)** notes are unchanged by the generator (ST-A1-01) | Major P0 |
| G-06 | Backend live | After the Render deploy | `curl -s <api>/version` | The `commit` field equals the A1 + A2 merge SHA. This SHA is what G-E1 checks out and what P-01 records | Critical P0 |
| G-E1 | 4B add-to-library dedup contract | On the deployed SHA, before any 4B build | `git checkout <deployed sha> && .venv\Scripts\python -m pytest tests/test_books.py -q -k "(book_id or dedup_keys) and not literal_paths"` | **`5 passed, 0 failed`**, collecting exactly T-A2-16a, T-A2-17, T-A2-16, T-A2-23, T-A2-26 (verify with `--collect-only -q`). `6 passed` is accepted only when the sixth name is the pre-existing `TestCatalogAuth::test_literal_paths_not_swallowed_by_book_id` (section 3, "Command correction") | Critical P0 |
| G-07 | Web builds and lint has not regressed | On the merged C + B1 + B2 tree, before the Vercel deploy | ST-W-01 and ST-W-02 | `npm run build` exit 0; eslint totals ≤ 37 errors / ≤ 7 warnings and 0 problems in the 3 new 4A files | Critical P0 |
| G-08 | Web behaviour, locally | Same tree, local dev server + local API | `node qa/web_4a_local.mjs` | Final line **`4A web local: 25 passed, 0 failed`**, preceded by 25 `PASS` lines (L-B1-01..10, L-B2-01..13, L-C-02). Exit 0. A skip is **not** a pass: a precondition failure exits 6 and names what is missing | Critical P0 |
| G-E2 | Logout clears the shared visibility key | Same tree, before the web deploy and before 4B mirrors the key | `node qa/web_4a_local.mjs --only L-B1-09` | Exactly: `PASS L-B1-09 logout clears bt_token and bt_note_visibility and unsubscribes with the pre-logout token` then `4A web local: 1 passed, 0 failed`. Exit 0 | Critical P0 |
| G-09 | Contrast on the deployed web | After the Vercel deploy | `node qa/a11y_audit.mjs` (production defaults) | `qa/reports/a11y-<date>.json` has **0** `color-contrast` nodes across all 16 pages (baseline 203 on 12 of 16). This is the condition the orchestrator attached to shipping `#586060` / `#636a6a` (spec R-F10, resolution 5) | Critical P0 |
| G-10 | F-16 repair stays read-only until approved | After both deploys | PM runs **PART (a)** of `context/repairs/2026-09-rating-reset-repair.sql` and **nothing else** | One row: `restorable_rows`, `affected_users`, `candidates_before_reread_exclusions`. The PM sends all three numbers plus the (a2) preview of up to 50 rows to the Architect **before** (b) or (c) is uncommented. Parts (b) and (c) are fully commented out (T-A2-89), so running the whole file by accident executes only (a) | Critical P0 |

---

## 8. Production checks after deploy, and the manual / screenshot checklist

Every case here obeys `qa/RULES_OF_ENGAGEMENT.md`: only rows owned by user 110 / 111 are mutated, every created id is deleted, and no secret, token or `Authorization` header is ever printed, logged or screenshotted. `<api>` = `https://book-tracker-stitch.onrender.com`, `<web>` = `https://www.trackmyread.com`.

### API, shared (run first, immediately after the backend deploy)

| # | Check | How | Expected | Sev / Pri |
|---|---|---|---|---|
| P-01 | the right build is live | `curl -s <api>/version` | `commit` == the A1 + A2 merge SHA (G-06). **Record it** — G-E1 and every check below refer to this SHA | Critical / P0 |
| P-02 | security headers (F-56) | `curl -I <api>/version` and `curl -I <api>/does-not-exist` | Both show `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `x-frame-options: DENY`, `strict-transport-security: max-age=31536000; includeSubDomains`. Done-checklist item 2 | Major / P0 |
| P-03 | legacy password routes gone (F-01) | `curl -s -o /dev/null -w "%{http_code}" -X POST <api>/auth/login -H "Content-Type: application/json" -d '{"email":"x@example.com","password":"x"}'`, and the same for `/auth/signup` | Both **404 or 405** (K-13). Any other status fails. Neither response body contains `access_token`. Done-checklist item 2 | Critical / P0 |
| P-04 | errors reach the browser (F-58) | `curl -i -H "Origin: https://www.trackmyread.com" "<api>/notes/feed?limit=-1"` | **422** (not 500 — that is F-51 landing too) **with** `access-control-allow-origin: https://www.trackmyread.com` and the four security headers. A forced 500 is not available in production; this is the substitute the architecture's smoke step 3 names | Critical / P0 |

### Package A1

| # | Check | How | Expected | Sev / Pri |
|---|---|---|---|---|
| P-05 | notification prefs save and merge (F-49, F-06) | Web `<web>/settings` as review.reader: toggle **one** notification off, save, reload. Then `GET <api>/notifications/prefs` | The toggled key is `false`, the other six unchanged; the reload shows the same. No `net::ERR_FAILED` in the console (that was the F-58 symptom of the 500). **Restore the original value afterwards.** Done-checklist item 3 | Critical / P0 |
| P-06 | adversarial probe re-run | `python qa/adversarial_probe.py` **after** a 2-line harness edit: send the reader's Bearer token on the two `/api/googlebooks/search` calls in `add_book` and in `run_state (a)` (K-04) | Post-sprint expectations, stated so a diff is readable: probes **#153 / #154 skipped** (they were the anonymous searches now under quota); **#167 INFO** not FAIL; **#135–#137 flip PASS→INFO** by design (`days=0/-1/100000` are 422 now); **#155 `DELETE /userbooks/864` now returns 200**, which is the production proof of F-50 that SQLite cannot give (K-08); **#144–#146** are the race backstop if T-A2-75..78 were dropped (K-12). No probe that passed at `3157eee` regresses to FAIL | Critical / P0 |
| P-07 | one notification marks read (F-23) | As review.reader: `GET <api>/notifications/unread-count` → `k`; open `<web>/notifications` and click one **unread** row; `GET /notifications/unread-count` again | `POST /notifications/{id}/read` appears in the network panel and returns `200 {"id": <id>, "is_read": true}`; the count is `k-1`; the row stays read after a reload. Clicking a row that is **already** read fires nothing | Major / P0 |

### Package A2

| # | Check | How | Expected | Sev / Pri |
|---|---|---|---|---|
| P-08 | anonymous Google quota (F-29) | **From an egress IP not used by P-06, or after a verified Render cold start** (K-10). 1: `curl -s -o /dev/null -w "%{http_code}\n" "<api>/api/googlebooks/search?query=dune"` ×3. 2: a 4th call with `X-Forwarded-For: 198.51.100.1` prepended. 3: the same query with a valid Bearer token ×5. 4: **repeat step 1 from a second, different egress IP** | 1: `200 200 401`, and the 401 body is exactly `{"detail":{"code":"login_required","message":"Log in to keep searching"}}`. 2: still 401 — a forged left-most hop does not mint a fresh quota. 3: all 200. 4: **if the second egress IP is also immediately 401, Cloudflare is collapsing every visitor onto one edge IP (K-06) — record it as a finding and escalate to the Architect; it does not fail the deploy, but it means one POP shares 2 searches** | Critical / P0 |
| P-09 | a book with history can be removed (F-50) | `<web>/library`: open a review-owned book that has logged pages, remove it, reload | The remove returns 200 (not 500) and the book is gone after reload. **Re-add it to restore the fixture** and record the add in the run ledger. Done-checklist item 4 | Critical / P0 |
| P-10 | goal clearing and the shipped-Android aliases (F-18, F-13, F-14, F-15) | `<web>/settings`: empty the yearly goal, save; open `<web>/insights`. Then `GET <api>/reading-activity/insights` and `GET <api>/groups/{Review Circle id}` with the reader token | Insights shows no goal card and `yearly_goal` is `null`. The insights body **also** carries `average_rating`, `books_this_year` and `projected_finishes[].projected_finish_date`, and `yearly_goal.finished` once a goal is set again. The group body carries `reading_goal` and `pages_read_total`, and `pages_read_total` equals `GET /groups/{id}/goal`'s `pages_read`. **Restore the original goal.** Done-checklist item 5 | Major / P0 |
| P-11 | actions are faster (F-08, F-59) | `node qa/scenarios_web.mjs --only S1,S4` and `python qa/api_perf.py`, on a **warm** backend | `/notes/feed` p50 **under 2 s** (baseline 9.2 s). Like, comment, follow, add-to-library and status→finished are each faster than the triage timings (note 3.3–4.9 s, PATCH status 4.3 s, add 3.3 s) by at least the round trips the architecture's F-59 table lists. **PATCH rating stays ≈ 3.1 s — that is expected**, it fires no event and is pure DB latency until F-28. Done-checklist item 6 | Major / P0 |

### Package B2 (web content)

| # | Check | How | Expected | Sev / Pri |
|---|---|---|---|---|
| P-12 | the S1 scenario passes again (F-60, F-17) | `node qa/scenarios_web.mjs --only S1` **after** the harness edit K-05 requires: S1 must click the **Public** radio before Post, because the composer now defaults to Only me and would otherwise get the "Saved privately" toast and no card — an F-17-by-design failure, not a regression | S1's step "post appears in feed without reload" is **PASS** (it was FAIL on run 3 at the baseline, the F-60 evidence). Cleanup reports `created N / cleaned N` equal and `fixture identical to baseline: true` | Major / P0 |
| P-13 | a private post really is private (F-17) | `<web>/home` as review.reader: choose **Only me**, post a note, then open the Community tab in a **logged-out** window and search for the text. Reload `<web>/home` | The "Saved privately — find it on your Profile" toast shows; no card is added to Community or Friends; the note is on `<web>/profile`; the logged-out window never shows it; after reload the switch still reads **Only me**. **Delete the note.** Done-checklist item 7 | Critical / P0 |
| P-14 | destructive circle actions ask first (F-25) | On Review Circle: click **Leave**, then **Cancel** | The modal matches the Disband modal's shape, with Cancel and a red confirm; after Cancel you are **still a member** (`GET /groups/{id}` `membership_status: "active"`). **Do not confirm.** Done-checklist item 8 | Critical / P0 |

### Package B1 (web platform)

| # | Check | How | Expected | Sev / Pri |
|---|---|---|---|---|
| P-15 | lists refresh immediately after an action (F-20) | As review.reader, within one minute (inside the 60 s cache TTL): accept a circle invite → open Circles; mark all notifications read → look at the bell; edit Review Circle's description → reopen the circle | The circle appears in Circles **without a reload**; the badge reads 0; the new description shows immediately. Each of the three was a 60 s stale window at the baseline | Major / P0 |
| P-16 | Back on a directly-opened public page (F-57) | Open `<web>/privacy` in a **new tab** (no in-app history) and click Back. Repeat for `/about` and `/terms` | You land on `<web>/` with a rendered page, never a blank screen and never off-site. Done-checklist item 9. **Harness note (K-11):** `qa/interaction_audit.mjs` classifies `urlAfter === '/'` from a non-`/` page as `LOGGED_OUT`. For a logged-in visitor `/` redirects to `/home`; if the URL is read before that redirect, the harness reports LOGGED_OUT. **LOGGED_OUT + a non-blank screenshot + a still-valid session is a harness misclassification, not a FAIL** | Major / P0 |
| P-17 | notification taps land on the right page (F-22) — **manual, K-17** | Inbox: click one `group_join_approved` row, one `group_join_rejected` row and one `admin_broadcast` row (use rows that already exist for the review accounts; do **not** trigger a broadcast). Push: with notifications granted, have the second review account cause one notification and click the **system** notification with (a) a tab already open and (b) no tab open | Inbox: approved → `/groups/{group_id}`; rejected → `/groups`; admin broadcast → **nothing happens** (the row is not clickable). Push: approved → `/groups/{group_id}`, rejected → `/groups`, broadcast and anything unknown → `/notifications`; case (a) **focuses and navigates the existing tab** rather than opening a second one; case (b) opens one. *Not automatable: a real push and a real `notificationclick` cannot be produced from Playwright against a dev origin* | Major / P0 |
| P-18 | push follows the account on a shared browser (F-03 web, F-27) — **manual, K-17** | One browser profile. (a) With permission **not yet granted**, sign in: **no** permission prompt appears anywhere except the Notifications banner. (b) Grant via the banner, sign out, sign in as review.friend, and have review.reader cause a notification to friend. (c) Sign out and check the server | (a) Zero prompts on login and on reload — the F-27 defect was a prompt on every load. (b) The push arrives for **review.friend**, and **not** for review.reader; `POST /notifications/web-subscribe` fired on the second login even though the browser already had a subscription (that is the whole F-03 web fix). (c) `DELETE /notifications/web-unsubscribe` fired on logout with the pre-logout token, and the row for that endpoint is gone for the signed-out user only | Critical / P0 |

### Package C, and the whole web

| # | Check | How | Expected | Sev / Pri |
|---|---|---|---|---|
| P-19 | contrast and text size on production (F-10) | 1: `node qa/a11y_audit.mjs` (= G-09). 2: on `/home`, `/insights`, `/groups/{Review Circle}` and `/library`, zoom a screenshot and read the smallest label. 3: **a human compares before/after screenshots of those four pages** | 1: **0** `color-contrast` nodes on 16 pages. 2: no text smaller than 12 px. 3: the three tiers are still visually distinct (9.3 → 6.5 → 5.5 on white) and nothing reads as flat grey-on-grey; the `qa/screenshots/` baselines **will** change and that is expected. *Step 3 is a human sign-off — no tool can judge it (K-17)* | Critical / P0 |
| P-20 | every page still renders logged in | `node qa/screenshots.mjs --web https://www.trackmyread.com --api <api> --out qa/screenshots/<date>-4a-prod` | Exit **0**: all 6 desktop pages (`/home`, `/library`, `/groups`, `/insights`, `/profile`, `/notifications`) and both mobile pages render logged-in with **no failed API call and no console error**. Exit 1 names the page that failed. This is the catch-all for anything B1/B2/C broke that no targeted case covers | Critical / P0 |

### Manual checklist the PM signs off, in order

1. **Before the backend deploy:** G-01, then G-02, then G-03 (F-53). Record the six STEP 1 numbers and confirm the three `uq_` indexes. **Do not deploy the backend first** — the models declare the constraints, and the race stays open until the indexes exist.
2. Deploy the backend. Run P-01..P-04, then the A1 and A2 checks P-05..P-11.
3. **G-E1** on the deployed SHA — this is what releases Sprint 4B to start building 2.2.2.
4. Deploy the web (C + B1 + B2 as one unit, after G-07, G-08 and **G-E2**). Run P-12..P-20.
5. **F-16, last and separately.** Run **PART (a) only** of `context/repairs/2026-09-rating-reset-repair.sql`. Send the Architect **all three counts** — `restorable_rows`, `affected_users`, `candidates_before_reread_exclusions` — **plus the (a2) preview of up to 50 rows**, and the (a3) recall count if asked. The gap between `restorable_rows` and `candidates_before_reread_exclusions` is how many candidates the re-read exclusions removed; a large gap means the date window needs a PM decision. **Do not uncomment (b) or (c) until the Architect replies.** Then (b), check its count equals `restorable_rows`, then (c), check the UPDATE row count equals the backup count — otherwise `ROLLBACK`.
6. **Accepted Android 2.2.1 regressions, confirmed by eye on a 2.2.1 device** (R-25, R-26): book-detail notes are now private with no toggle, and search tiles with no cover show blank. Both are fixed in 2.2.2.

---

## 9. Cross-package regression — what must still be green

Existing coverage that the 4A changes could break. "New pytest" rows are counted in G-04's 435 (17 of them). Every consumer below comes from `dependency-map.md`; the rule is one check per consumer of a touched endpoint.

**Backend command, run on the merged A1 + A2 tree:**
```
.venv\Scripts\python -m pytest tests -q
```
**Expected: `435 passed`, 0 failed** — 252 baseline (measured at `3157eee`) − 6 deleted (`TestSignup` ×3 and the three signup/login tests in `TestLogin`) + 189 new = 435. See K-19 for why this is 435 and not K-09's 433.

**Web command:** `npm --prefix book-tracker-frontend-stitch run build` (exit 0) and `node qa/web_4a_local.mjs` (`4A web local: 25 passed, 0 failed`).

### Package A1 consumers

| # | Pri / Sev | Consumer / area | Proof | New pytest? |
|---|---|---|---|---|
| R-01 | P0 / Critical | Home feed cards — `HomePage.jsx`, Android `FeedScreen.js`, `App.js` preload `feed` | `test_notes.py::TestNoteShapeRegression::test_feed_top_level_keys_unchanged` — the 17 measured top-level keys and the `user` sub-shape survive F-07 and F-08 byte for byte (T-A1-67 asserts it once; this row re-asserts it against an **unauthenticated** `/notes/feed`, the path `App.js` preload uses before login state settles) | yes |
| R-02 | P0 / Critical | Profile notes — `ProfilePage.jsx`, Android `ProfileScreen.js` | `test_notes.py::TestNoteShapeRegression::test_me_keeps_updated_at_and_like_keys` — `/notes/me` keeps `updated_at` (an asymmetry only this endpoint has) and both like keys | yes |
| R-03 | P0 / Critical | Other users' notes — `UserProfilePage.jsx`, Android `UserProfileScreen.js` | `test_notes.py::TestNoteShapeRegression::test_user_notes_keeps_its_asymmetries` — `/notes/user/{id}` still has **no** `user_id` and **no** like keys, `user` is `{id, name}`, and a non-follower on a private profile still gets 403 | yes |
| R-04 | P0 / Critical | Book detail notes — `BookDetailPage.jsx`, Android `BookDetailScreen.js` | `test_notes.py::TestNoteShapeRegression::test_userbook_notes_book_shape_unchanged` — `/notes/userbook/{id}` `book` is still exactly `{author, id, title}`; F-07 must **not** leak the dedup keys here | yes |
| R-05 | P0 / Critical | Settings notification prefs — `SettingsPage.jsx`, Android `SettingsScreen.js:218` | `test_notifications_api.py::TestPrefsRegression::test_get_prefs_shape_unchanged` — `GET /notifications/prefs` returns exactly K7 for a user who has never PATCHed, and for one who has | yes |
| R-06 | P1 / Major | Notification inbox — `NotificationsPage.jsx`, Android `NotificationsScreen.js` | `test_notifications_api.py::TestPrefsRegression::test_history_and_unread_shapes_unchanged` — `/notifications/history` item keys and `/notifications/unread-count` `{"unread": n}` are unchanged, and `POST /notifications/mark-read` is not shadowed by the new `/{id}/read` route (T-A1-43) | yes |
| R-07 | P0 / Critical | Follow and profile — `ProfilePage.jsx`, `UserProfilePage.jsx`, Android `ProfileScreen.js` | `test_follow_profile.py::TestProfileRegression::test_put_profile_other_fields_unchanged` — `name`, `bio`, `is_private_profile` and `profile_picture` round-trip; setting `is_private_profile` still gates `/profile/{id}`, `/notes/user/{id}`, `/users/{id}/stats` at 403 for a non-follower. *F-18 changes only the `yearly_goal` branch* | yes |
| R-08 | P0 / Critical | Push registration — Android `NotificationService.js`, web `AuthContext.jsx` | The **7 existing** `tests/test_push_tokens.py` tests stay green **unchanged**, and `DELETE /push-tokens/` still removes only the caller's expo rows. No new pytest — this is the existing suite holding | no |
| R-09 | P0 / Critical | Shared fixtures and untouched modules | ST-A1-03: `git diff --stat` over `tests/conftest.py`, `app/crud.py`, `app/deps.py`, `app/auth.py`, `app/notifications/dispatcher.py`, `config.py`, `push_web.py`, `push_mobile.py`, `scheduler.py` is **empty**. A change here would silently move every test's ground truth | no |

### Package A2 consumers

| # | Pri / Sev | Consumer / area | Proof | New pytest? |
|---|---|---|---|---|
| R-10 | P0 / Critical | Library list — `LibraryPage.jsx`, Android `LibraryScreen.js` | `test_books.py::TestUserbookRegression::test_userbooks_list_shape_unchanged` — `GET /userbooks/` and `/userbooks/{id}` key sets, with nested `book.google_books_id`, survive F-52 and F-50 | yes |
| R-11 | P0 / Critical | Every recorded `PATCH /userbooks/{id}` caller | `test_books.py::TestPatchUserbookValidation::test_recorded_caller_payloads_200` — the exact 4 payloads from the architecture: `{status}`, `{rating: 0..5}`, `{status, current_page, total_pages}`, `{status, current_page}` (no `total_pages`) → all 200. A 422 here means a real user's Save button breaks | yes |
| R-12 | P1 / Major | Circle lists — `GroupsPage.jsx`, Android `GroupsScreen.js` | `test_groups.py::TestGroupsRegression::test_list_serializers_unchanged` — `/groups/my`, `/groups/discover` and `/groups/invites/pending` still return the **same 16 keys** as `_serialize_group` (K-14), and **do not** gain `reading_goal` or `pages_read_total`: F-15 adds those to `GET /groups/{id}` **only**, and the extra 2 queries must not land in a list endpoint | yes |
| R-13 | P0 / Critical | Circle goal, the 4B contract | `test_groups.py::TestGroupsCRUD::test_goal_endpoint_shape_unchanged` (T-A2-35) re-run as a contract regression: with a goal `{goal_pages, goal_period, pages_read, pct}`; without, exactly `{"goal_pages": null, "pages_read": 0, "pct": 0}` and **no `goal_period` key**. 4B reads this endpoint | yes |
| R-14 | P1 / Major | Circle detail sections — `GroupDetailPage.jsx`, Android `GroupDetailScreen.js` | `test_groups.py::TestGroupsRegression::test_members_pending_leaderboard_activity_unchanged` — `/members`, `/pending`, `/leaderboard`, `/posts` and `/activity` key sets unchanged; the private-group 403 gate still applies to all of them; F-42's `avatar_url` is still returned as-is (not in scope) | yes |
| R-15 | P1 / Major | Insights — `InsightsPage.jsx`, `ProfilePage.jsx`, Android `InsightsScreen.js`, `App.js` preload | `test_reading_activity.py::TestInsights::test_insights_monthly_pages_shape_unchanged` stays green **unchanged** (the strict key-set test at `:279`), and the 12 measured top-level keys are still all present after the 4 aliases are added | yes |
| R-16 | P1 / Major | Activity charts — `getMyActivity(7\|30)`, `getUserActivity(30\|90)`, Android `UserProfileScreen.js:47` | `test_reading_activity.py::TestDailyStats::test_recorded_caller_days_values_200` — `days=7, 30, 90` on both daily routes → 200 with the existing shape. Every in-the-wild value must sit inside F-51's new 1..200 bound | yes |
| R-17 | P1 / Major | Admin dashboard — `AdminPage.jsx` | `test_admin.py::TestAdminRegression::test_stats_and_lists_unchanged` — the 13 measured `/admin/stats` keys are all still present alongside `push_subscribed_users`; the five list routes return their existing shapes at their default limits; a non-admin still gets 403 on all six | yes |
| R-18 | P1 / Major | Book search — `SearchPage.jsx`, `LibraryPage.jsx`, `AppTour.jsx`, Android `LibraryScreen.js` | `test_googlebooks.py::TestSearchRegression::test_normal_search_unchanged` — an authenticated search with the fake client returns the existing response shape including `has_more` and `next_start_index`; `normalize_google_cover_url` is **unchanged** (`userbooks_router` imports it) | yes |
| R-19 | P2 / Minor | Goodreads import and cover fix — `OnboardingPage.jsx`, `SettingsPage.jsx` | `test_books.py::TestImportRegression::test_covers_status_unchanged` — `/import/covers-status` still 200 with its existing shape. `import_router.py` is explicitly not touched (ST-A2-05); F-53 leaves a known residual there (a concurrent duplicate can fail a whole import) | yes |
| R-20 | P0 / Critical | The stack F-59 depends on | ST-A2-04: `.venv` reports `0.95.2 1.10.x 0.27.0` and `requirements.txt` pins are unchanged. **FastAPI ≥ 0.106 would run background tasks after the `yield`-dependency exit and close the `db` Session under them** — every F-59 task would break. No new pytest; this is a pin assertion | no |

### Web and Android

| # | Pri / Sev | Area | Proof |
|---|---|---|---|
| R-21 | P0 / Critical | B1: sign-out, settings and the notification inbox still work end to end | L-B1-09 (logout clears both keys and unsubscribes, and `logout`'s four call sites are unchanged — ST-B1-07), plus P-05, P-07, P-15 and P-20's `/settings` and `/notifications` pages rendering with no console error |
| R-22 | P1 / Major | B1: the notification routes that already worked still route | ST-B1-04 asserts the **existing** `getDestination` cases (`new_follower`, `post_liked`, `post_commented`, `book_completed`, `book_added`, `reading_streak_reminder`, `group_invite`, `group_join_request`) are byte-identical in the diff; P-17 clicks one `post_liked` and one `new_follower` row |
| R-23 | P0 / Critical | B2: Home, Library, Search, Book detail, Profile and Circle flows | `node qa/scenarios_web.mjs` (all of S1–S9, not just S1) after the K-05 harness edit: every step that passed at the baseline still passes, and the final line reports `fixture identical to baseline: true`. S1's composer, S4's library lifecycle and S7's circle posts are the three flows B2 edits most |
| R-24 | P1 / Major | C: all 16 pages under the new tokens | G-09 / P-19 (0 `color-contrast` nodes) plus P-20 (every page renders, no console error). The badge change (`w-4 h-4` → `min-w-[18px] h-[18px]`) is the one that can shift layout — the before/after screenshots of `/home` and `/notifications` are the evidence |
| R-25 | P1 / Major | **Android 2.2.1, accepted regression:** book-detail notes become private | On a 2.2.1 device against the deployed backend: a note written on the book-detail screen is created with `is_public: false` and is absent from the Community feed. **This is intended** (`BookDetailScreen.js:172` omits the field; PM-accepted). Feed and Profile posts still publish, because they send `is_public: true` explicitly. Fixed by 4B's toggle |
| R-26 | P2 / Minor | **Android 2.2.1, accepted regression:** blank no-cover search tiles | On a 2.2.1 device, a Google Books search result with no `imageLinks` now shows a blank tile instead of Google's "image not available" placeholder (`LibraryScreen.js:341` has no fallback). **This is intended** and is fixed by 4B's F-19 cover fallback — which K1/F9 in the 4B plan flags as missing from the 4B brief; confirm it is in scope there before 2.2.2 ships |

---

## 10. Gate summary

Every named gate, its command, and the exact output that passes it. Run top to bottom; a failure stops the release.

| Gate | What it protects | Command | Exact expected output |
|---|---|---|---|
| **G-01** | The duplicate census exists before it is destroyed | Supabase: STEP 1, then STEP 1b of the 4A section of `context/supabase_migration.sql` | STEP 1: exactly 3 rows — `userbook`, `like`, `follow` — each with `dup_groups` and `surplus_rows`, all six numbers recorded by the PM. STEP 1b: one row per duplicate library entry, each carrying `keeper_id` |
| **G-02** | The dedupe is transactional and backed up | Supabase: STEP 2 | `COMMIT` with no error; the five `dedupe_20260913_*` tables exist; the `DELETE FROM userbook` count equals G-01's `userbook.surplus_rows` |
| **G-03** | The constraints actually land, and STEP 2 is never re-run (K-07) | Supabase: STEP 3, immediately after G-02 | `SELECT indexname FROM pg_indexes …` returns exactly 3 rows: `uq_userbook_user_book`, `uq_like_note_user`, `uq_follow_pair`. A uniqueness error here → **stop**, escalate to the Architect |
| **G-04** | The whole backend suite on the merged tree (K-09, K-19) | `.venv\Scripts\python -m pytest tests -q` | Final line: **`435 passed`**, 0 failed, 0 errors. 431–434 only for droppable race tests T-A2-75..78 named in Build Notes |
| **G-05** | The dependency map matches the shipped routes | `python scripts/gen_dependency_map.py && git diff --stat dependency-map.md` | Exit 0; `POST /auth/signup` and `POST /auth/login` rows gone; `POST /notifications/{notification_id}/read` row present with auth `user`; `/api/googlebooks/*` rows still `⚠️ NONE`; the curated section untouched |
| **G-06** | The deployed backend is the tested tree | `curl -s <api>/version` | `commit` == the A1 + A2 merge SHA |
| **G-E1** | Sprint 4B's add-to-library dedup contract, on the deployed SHA | `git checkout <deployed sha> && .venv\Scripts\python -m pytest tests/test_books.py -q -k "(book_id or dedup_keys) and not literal_paths"` | **`5 passed, 0 failed`**, collecting exactly T-A2-16a, T-A2-17, T-A2-16, T-A2-23, T-A2-26 (`--collect-only -q` to verify). `6 passed` accepted only when the sixth is the pre-existing `test_literal_paths_not_swallowed_by_book_id` |
| **G-07** | The web builds and lint did not regress (K-01) | `npm --prefix book-tracker-frontend-stitch run build`, then `npx eslint . -f json` from that directory | Build exit 0 with `dist/` produced and no unresolved-module warning. Lint: **≤ 37 errors and ≤ 7 warnings** in total, and **0 problems** in `src/utils/navigation.js`, `src/utils/noteVisibility.js`, `src/components/VisibilityToggle.jsx` |
| **G-08** | Every automatable web behaviour, locally (K-18, K-21) | `node qa/web_4a_local.mjs` (dev server on `--mode localapi --port 5174`, API on `127.0.0.1:8765`) | Final line: **`4A web local: 25 passed, 0 failed`**, preceded by 25 `PASS` lines (L-B1-01..10, L-B2-01..13, L-C-02). Exit 0. Exit 5 = a production host was passed; exit 6 = a precondition is missing — neither is a pass |
| **G-E2** | A shared browser cannot leak one account's "Public" default to the next (4B Architect escalation) | `node qa/web_4a_local.mjs --only L-B1-09` | Exactly two lines, exit 0: `PASS L-B1-09 logout clears bt_token and bt_note_visibility and unsubscribes with the pre-logout token` then `4A web local: 1 passed, 0 failed` |
| **G-09** | Contrast on the deployed web (spec R-F10 resolution 5) | `node qa/a11y_audit.mjs` | `qa/reports/a11y-<date>.json`: **0** `color-contrast` nodes across all 16 pages (baseline 203 nodes on 12 of 16) |
| **G-10** | The F-16 repair cannot run itself | PM runs **PART (a) only** of `context/repairs/2026-09-rating-reset-repair.sql` | One row: `restorable_rows`, `affected_users`, `candidates_before_reread_exclusions`, sent to the Architect with the (a2) preview **before** (b) or (c) is uncommented. Parts (b) and (c) stay fully commented (T-A2-89) |

**Release order:** G-01 → G-02 → G-03 → G-04 → G-05 → deploy backend → G-06 → P-01..P-11 → **G-E1** (releases Sprint 4B) → G-07 → G-08 → **G-E2** → deploy web → G-09 → P-12..P-20 → **G-10**.






