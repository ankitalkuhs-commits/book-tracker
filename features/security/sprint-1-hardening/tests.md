---
screen: sprint-1-hardening
feature: security
test_plan_written: 2026-09-12
last_run: 2026-09-12
pass_rate: 45/45 (100%)
written_by: Senior QA (before Builder; no build code read)
sources: spec.md (APPROVED), architecture.md (PM-approved), dependency-map.md, tests/conftest.py
---

## How to read this plan

Every case gives exact steps and an exact expected result. "Expected" is what the spec and
architecture promise — not what the code does. Where a case is automatable, the pytest
function name the Builder must create is given in the Case column as `file :: Class :: name`.

Severity: **Critical** = privacy / ownership / data loss / feature dead. **Major** = core flow
broken. **Minor** = cosmetic or defensive.

Priority: P0 = ship blocker. P1 = fix within sprint. P2 = nice to have.

**Every auth / ownership / privacy case below is P0 / Critical and must never be downgraded.**

---

## Test Cases

| # | Case | Priority | Severity | Status | Notes |
|---|---|---|---|---|---|
| T01 | R1 — `GET /books/` unauthenticated → 401 | P0 | Critical | PASS | test_list_requires_auth |
| T02 | R1 — `GET /books/{id}` unauthenticated → 401 | P0 | Critical | PASS | test_get_one_requires_auth |
| T03 | R1 — `POST /books/` unauthenticated → 401 | P0 | Critical | | |
| T04 | R1 — `DELETE /books/{id}` unauthenticated → 401, nothing deleted | P0 | Critical | | |
| T05 | R1 — `DELETE /books/{id}` as normal user → 403, book + every user's userbooks intact | P0 | Critical | | |
| T06 | R1 — `DELETE /books/{id}` as admin → 200, book gone | P0 | Major | | |
| T07 | R1 — `DELETE /books/{missing}` as admin → 404 | P1 | Minor | | |
| T08 | R1 — `GET /books/` with a user token → 200 list | P0 | Major | | |
| T09 | R1 — `GET /books/?limit=2` returns at most 2 | P0 | Major | | |
| T10 | R1 — `GET /books/` default caps at 50 | P1 | Major | | |
| T11 | R1 — `GET /books/?limit=500` → 422 (cap 200) | P0 | Major | | |
| T12 | R1 — `GET /books/?limit=0` and `limit=-1` → 422 | P1 | Minor | | |
| T13 | R1 — `GET /books/?limit=200` → 200 (boundary allowed) | P1 | Minor | | |
| T14 | R1 — `POST /books/` with a token creates a book | P0 | Major | | |
| T15 | R1 — `POST /books/` ISBN dedupe still returns the existing book | P0 | Major | | |
| T16 | R1 — `POST /books/` with no title → 400 `Title is required` | P1 | Minor | | |
| T17 | R1 — `GET /books/{id}` with a token → 200; missing id → 404 | P1 | Major | | |
| T18 | R1 — emoji + 500-char title round-trip through `POST /books/` | P2 | Minor | | |
| T19 | R1 — mass assignment: unknown body fields on `POST /books/` are ignored | P0 | Critical | | |
| T20 | R2 — `POST /auth/delete-account` with NO token → still 200 | P0 | Critical | | Regression guard: must NOT gain auth |
| T21 | R2 — `POST /auth/delete-account` with an unknown email → same 200 body (no enumeration) | P1 | Major | | |
| T22 | R3 — web subscription + expo token coexist; web token unchanged | P0 | Critical | | |
| T23 | R3 — registering the same expo token twice leaves exactly one `expo` row | P0 | Major | | |
| T24 | R3 — `DELETE /push-tokens/` removes the expo row, keeps the web row | P0 | Critical | | |
| T25 | R3 — invalid token string → "Invalid token format" message, no row created | P0 | Major | | |
| T26 | R3 — `POST` and `DELETE /push-tokens/` unauthenticated → 401 | P0 | Critical | | |
| T27 | R3 — user with only a `web` row calls `DELETE /push-tokens/` → web row survives | P0 | Critical | | |
| T28 | R3 — `DELETE /push-tokens/` removes *all* historical expo duplicates | P1 | Major | | |
| T29 | R4 — `pytest tests -q` → `0 failed` | P0 | Major | | |
| T30 | R4 — the 12 named previously-failing tests pass | P0 | Major | | Names listed below |
| T31 | R5 — `git ls-files \| grep -E "^(\.venv\|venv)/" \| wc -l` → `0` | P0 | Major | | |
| T32 | R5 — `.gitignore` contains a `.venv/` line | P0 | Major | | |
| T33 | R5 — `.venv/` and `venv/` still exist on disk | P0 | Critical | | Data loss if they are gone |
| T34 | R5 — `git status --short \| grep -c venv` → `0` | P0 | Major | | Run AFTER the commit |
| T35 | R5 — the venv removal is its own commit; no app/test file in it | P1 | Minor | | |
| T36 | R6 — `python scripts/gen_dependency_map.py` exits 0 | P0 | Major | | |
| T37 | R6 — the four `/books` rows show `user`/`user`/`user`/`admin`, no ⚠️ | P0 | Critical | | |
| T38 | R6 — `/auth/delete-account` and `/api/googlebooks/*` still show ⚠️ (no over-reach) | P0 | Major | | |
| T39 | R6 — the curated `### pushtoken table` sentence is updated | P1 | Minor | | |
| T40 | Regression — `POST /books/add-to-library` flat shape unchanged (12 consuming files) | P0 | Critical | | |
| T41 | Regression — `add-to-library` duplicate for the same user still 400 with the tab message | P1 | Major | | |
| T42 | Regression — `GET /books/search` with a token unchanged; unauth still 401 | P0 | Major | | |
| T43 | Regression — `GET /books/recommendations` with a token unchanged; unauth still 401 | P0 | Major | | |
| T44 | Regression — `GET /userbooks/` shape unchanged incl. nested `book.google_books_id` | P0 | Critical | | |
| T45 | Regression — route ordering intact: `/books/search`, `/books/recommendations`, `/books/add-to-library` not swallowed by `/books/{book_id}` | P0 | Critical | | |

**Total: 45 cases.**

---

## Detailed Cases

### R1 — `/books` catalog auth and contract

#### T01 — `GET /books/` unauthenticated → 401  · P0 / Critical
**Steps:** `client.get("/books/")` with no `Authorization` header.
**Expected:** status `401`. Body `{"detail": "Not authenticated"}` (FastAPI's HTTPBearer default;
if the project's `get_current_user` raises its own detail string, the *status* is the assertion —
do not assert on the detail text).
**Pytest:** `tests/test_books.py :: TestCatalogAuth :: test_list_requires_auth`

#### T02 — `GET /books/{id}` unauthenticated → 401  · P0 / Critical
**Steps:** `client.get("/books/1")` with no header.
**Expected:** `401`. Not 404 — the auth dependency runs before the handler, so a non-existent id
must still give 401, never leak existence.
**Pytest:** `tests/test_books.py :: TestCatalogAuth :: test_get_one_requires_auth`

#### T03 — `POST /books/` unauthenticated → 401  · P0 / Critical
**Steps:** `client.post("/books/", json={"title": "Anon Book"})` with no header.
**Expected:** `401`. Then `client.get("/books/search?q=Anon Book", headers=alice_headers)` →
`200` with `[]` — the anonymous write created nothing.
**Pytest:** `tests/test_books.py :: TestCatalogAuth :: test_create_requires_auth`

#### T04 — `DELETE /books/{id}` unauthenticated → 401, nothing deleted  · P0 / Critical
**Steps:**
1. As alice: `POST /books/add-to-library {"title": "T04 Book", "isbn": "t04-isbn", "total_pages": 100, "status": "to-read"}` → capture `add.json()["book"]["id"]` as `book_id` and `add.json()["id"]` as `ub_id`.
2. `client.delete(f"/books/{book_id}")` with **no header**.
3. `client.get(f"/books/{book_id}", headers=alice_headers)`.
**Expected:** step 2 → `401`; step 3 → `200` and `r.json()["id"] == book_id`. `GET /userbooks/`
as alice still contains an item whose `id == ub_id`.
**Pytest:** `tests/test_books.py :: TestCatalogAuth :: test_delete_requires_auth`

#### T05 — `DELETE /books/{id}` as a normal user → 403, book + every user's userbooks intact  · P0 / Critical
This is the single most important case in the sprint.
**Steps:**
1. As alice: `POST /books/add-to-library {"title": "T05 Shared", "isbn": "t05-shared-isbn", "total_pages": 120, "status": "reading"}` → `book_id = json["book"]["id"]`, `alice_ub = json["id"]`.
2. As bob: the identical call (same `isbn`, so the same `Book` row is reused) → `bob_ub = json["id"]`; assert `json["book"]["id"] == book_id`.
3. `client.delete(f"/books/{book_id}", headers=bob_headers)` (bob is not admin).
**Expected:**
- step 3 → **`403`** (not 401, not 404, not 200).
- `client.get(f"/books/{book_id}", headers=alice_headers)` → `200`, `json["id"] == book_id`, `json["title"] == "T05 Shared"`.
- `GET /userbooks/` as alice contains `alice_ub`; as bob contains `bob_ub`. Neither list lost a row.
- DB check via the `db` fixture (after `db.expire_all()`): `select(UserBook).where(UserBook.book_id == book_id)` returns exactly 2 rows.
**Pytest:** `tests/test_books.py :: TestCatalogAuth :: test_delete_forbidden_for_non_admin`
and `tests/test_books.py :: TestCatalogAuth :: test_non_admin_delete_leaves_book_and_userbooks_intact`
(the first may use a bare `/books/1` per the architecture; the second must use the real fixture above —
both are required, the cheap one is not a substitute).

#### T06 — `DELETE /books/{id}` as admin → 200, book gone  · P0 / Major
**Do not delete a catalog row other tests point at.** `conftest.py` shares one in-memory DB for the
whole session, so create a throwaway row first.
**Steps:**
1. `client.post("/books/", json={"title": "T06 Throwaway", "isbn": "t06-throwaway"}, headers=admin_headers)` → `200`, `book_id = json["book"]["id"]`.
2. `client.delete(f"/books/{book_id}", headers=admin_headers)`.
3. `client.get(f"/books/{book_id}", headers=admin_headers)`.
**Expected:** step 2 → `200`, body exactly `{"message": "Book deleted successfully"}`.
Step 3 → `404`, `{"detail": "Book not found"}`.
**Pytest:** `tests/test_books.py :: TestCatalogAuth :: test_admin_can_delete_own_created_book`

#### T07 — `DELETE /books/{missing}` as admin → 404  · P1 / Minor
**Steps:** `client.delete("/books/999999", headers=admin_headers)`.
**Expected:** `404`, `{"detail": "Book not found"}`.
**Pytest:** `tests/test_books.py :: TestCatalogAuth :: test_admin_delete_missing_book_returns_404`

#### T08 — `GET /books/` with a token → 200 list  · P0 / Major
**Steps:** ensure at least one book exists (`_add_book(client, alice_headers, title="T08 Book")`),
then `client.get("/books/", headers=alice_headers)`.
**Expected:** `200`. Body is a JSON **array** (not an object, not `{"books": [...]}`). Each element
is a raw `Book` row — keys include `id`, `title`, `author`, `isbn`, `cover_url`, `description`,
`total_pages`, `google_books_id`, `publisher`, `published_date`, `created_at`. The shape is
**unchanged** from before the sprint; changing it would be an out-of-scope contract break.
**Pytest:** `tests/test_books.py :: TestCatalogList :: test_list_works_for_user_and_respects_limit`

#### T09 — `limit` is honoured  · P0 / Major
**Steps:** add 3 distinct books as alice, then `client.get("/books/?limit=2", headers=alice_headers)`.
**Expected:** `200`, `len(r.json()) == 2`.
**Pytest:** `tests/test_books.py :: TestCatalogList :: test_list_limit_param_caps_results`

#### T10 — default cap is 50  · P1 / Major
**Steps:** `client.get("/books/", headers=alice_headers)`.
**Expected:** `200`, `len(r.json()) <= 50`. (Asserting `== 50` is wrong — the shared test DB may
hold fewer than 50 books.)
**Pytest:** covered by `test_list_works_for_user_and_respects_limit`

#### T11 — `limit` above the cap is rejected  · P0 / Major
**Steps:** `client.get("/books/?limit=500", headers=alice_headers)`.
**Expected:** `422` (FastAPI `Query(50, ge=1, le=200)` validation). **Not** a silent clamp to 200 —
`le=200` rejects. If the Builder chooses to clamp instead, that is a spec deviation and must be
raised, not silently accepted.
**Pytest:** `tests/test_books.py :: TestCatalogList :: test_list_limit_above_max_rejected`

#### T12 — `limit=0` / `limit=-1` rejected  · P1 / Minor
**Steps:** `client.get("/books/?limit=0", ...)` and `?limit=-1`.
**Expected:** `422` for both (`ge=1`).
**Pytest:** `tests/test_books.py :: TestCatalogList :: test_list_limit_zero_rejected`

#### T13 — boundary `limit=200` allowed  · P1 / Minor
**Steps:** `client.get("/books/?limit=200", headers=alice_headers)`.
**Expected:** `200` (not 422). `len(r.json()) <= 200`.
**Pytest:** covered by `test_list_limit_above_max_rejected` (assert both boundaries in one test)

#### T14 — `POST /books/` with a token creates a book  · P0 / Major
**Steps:** `client.post("/books/", json={"title": "T14 Created", "author": "QA", "isbn": "t14-isbn", "total_pages": 300}, headers=alice_headers)`.
**Expected:** `200`. Body exactly `{"message": "Book added successfully", "book": {...}}` —
`json["book"]["title"] == "T14 Created"`, `json["book"]["author"] == "QA"`,
`json["book"]["isbn"] == "t14-isbn"`, `json["book"]["id"]` is an int. Shape unchanged from
pre-sprint (the `{message, book}` wrapper stays — the architecture says "leave the response alone").
**Pytest:** `tests/test_books.py :: TestCatalogCreate :: test_create_book_with_token`

#### T15 — ISBN dedupe still returns the existing book  · P0 / Major
**Steps:**
1. `client.post("/books/", json={"title": "T15 First", "isbn": "t15-dupe-isbn"}, headers=alice_headers)` → `first_id = json["book"]["id"]`.
2. `client.post("/books/", json={"title": "T15 Second Title", "isbn": "t15-dupe-isbn"}, headers=bob_headers)`.
**Expected:** step 2 → `200`, body `{"message": "Book already exists", "book": {...}}`,
`json["book"]["id"] == first_id`, `json["book"]["title"] == "T15 First"` (the *existing* row is
returned; the second title is discarded). DB check: exactly one `Book` row with
`isbn == "t15-dupe-isbn"`.
**Pytest:** `tests/test_books.py :: TestCatalogCreate :: test_create_dedupes_by_isbn`

#### T16 — no title → 400  · P1 / Minor
**Steps:** `client.post("/books/", json={"author": "No Title"}, headers=alice_headers)`.
**Expected:** `400`, `{"detail": "Title is required"}`. (400, not 422 — the handler takes a bare
`dict` body and validates by hand.)
**Pytest:** `tests/test_books.py :: TestCatalogCreate :: test_create_without_title_returns_400`

#### T17 — `GET /books/{id}` with a token  · P1 / Major
**Steps:** create a book via T14's call, then `client.get(f"/books/{book_id}", headers=alice_headers)`;
separately `client.get("/books/999999", headers=alice_headers)`.
**Expected:** first → `200`, `json["id"] == book_id`, `json["title"]` matches.
Second → `404`, `{"detail": "Book not found"}`.
**Pytest:** `tests/test_books.py :: TestCatalogCreate :: test_get_book_by_id_with_token`
and `:: test_get_missing_book_returns_404`

#### T18 — emoji and long strings  · P2 / Minor
**Steps:** `POST /books/` with `{"title": "📚 Café — naïve 🎧" + "x"*480, "isbn": "t18-isbn"}` and a token.
**Expected:** `200`; `json["book"]["title"]` is byte-for-byte what was sent (no mojibake, no
truncation). Then `GET /books/{that id}` returns the same string.
**Pytest:** `tests/test_books.py :: TestCatalogCreate :: test_create_accepts_emoji_and_long_title`

#### T19 — mass assignment on `POST /books/`  · P0 / Critical
The handler takes an untyped `dict`, so this must be asserted explicitly.
**Steps:** `client.post("/books/", json={"title": "T19 Mass", "isbn": "t19-isbn", "id": 999999, "created_at": "1999-01-01T00:00:00Z", "user_id": 1, "is_admin": True}, headers=alice_headers)`.
**Expected:** `200`. `json["book"]["id"] != 999999` (a fresh autoincrement id).
`json["book"]["created_at"]` is today's timestamp, not 1999. No `user_id` / `is_admin` key leaks
into the response. `GET /books/999999` → `404`.
**Pytest:** `tests/test_books.py :: TestCatalogCreate :: test_create_ignores_unknown_fields`

---

### R2 — `/auth/delete-account` must stay public

#### T20 — no token → 200  · P0 / Critical
This is the Play-Store data-deletion form. It is reachable by a user who has uninstalled the app
and has no token. **A 401 here is a store-compliance failure, not an improvement.**
**Steps:** `client.post("/auth/delete-account", json={"email": "alice_f@example.com", "reason": "qa"})`
with **no** `Authorization` header.
**Expected:** `200`, body exactly `{"message": "Account deletion request received"}`.
DB check (`db.expire_all()` first): the alice row's `deletion_requested_at` is set and
`deletion_reason == "qa"`. The user row is **not** deleted (this is a request flow, not a delete).
Run this test again after the Builder's diff lands — it is the guard that R1's sweep did not
accidentally add `get_current_user` to the auth router.
**Pytest:** `tests/test_auth.py :: TestPublicDeleteAccountForm :: test_delete_account_form_stays_public`

#### T21 — unknown email → same 200  · P1 / Major
**Steps:** `client.post("/auth/delete-account", json={"email": "nobody-xyz@example.com"})`, no header.
**Expected:** `200`, identical body `{"message": "Account deletion request received"}`. The response
must not differ from T20 in status, body, or timing hints — otherwise it becomes an account
enumeration oracle on a public endpoint.
**Pytest:** `tests/test_auth.py :: TestPublicDeleteAccountForm :: test_delete_account_unknown_email_same_response`

---

### R3 — push channels are independent

All R3 tests live in the new file `tests/test_push_tokens.py`. Each uses its **own** user created
with `_make_user(db, email="...")` — never `alice`/`bob`, whose push rows other tests may touch.

**Fixtures/constants for the file:**
```python
_SUB = {"endpoint": "https://fcm.googleapis.com/fcm/send/test-abc",
        "keys": {"p256dh": "test-key", "auth": "test-auth"}}
_EXPO = "ExponentPushToken[test-abc123]"
```
**Gotcha (from architecture.md, will bite):** the `db` fixture session and the request handler's
session are different `Session` objects over the same shared-cache in-memory DB. Call
`db.expire_all()` before every read-back or you assert against a stale identity map.
`/notifications/web-subscribe` needs **no** VAPID env var.

#### T22 — web + expo coexist, web token untouched  · P0 / Critical
**Steps:**
1. `client.post("/notifications/web-subscribe", json={"subscription": _SUB, "device_info": "Chrome/Windows"}, headers=h)`.
2. Read back the web row's `token` value → `web_token_before` (it is `json.dumps(_SUB)`).
3. `client.post("/push-tokens/", json={"token": _EXPO}, headers=h)`.
4. Read all `PushToken` rows for this user.
**Expected:** step 1 → `200`, `{"message": "Web push subscription registered"}`.
Step 3 → `200`, `{"message": "Push token registered"}`.
Step 4 → exactly **2** rows; `sorted(t.token_type for t in rows) == ["expo", "web"]`.
The `web` row's `token == web_token_before` (unchanged, still parses as JSON with an `endpoint`
key). The `expo` row's `token == _EXPO` and its `token_type` is the literal string `"expo"`
(explicitly set on insert, not inherited from the model default).
**Pytest:** `tests/test_push_tokens.py :: test_expo_and_web_tokens_coexist`

#### T23 — re-registering the same expo token does not duplicate  · P0 / Major
**Steps:** after T22's setup, `client.post("/push-tokens/", json={"token": _EXPO}, headers=h)` a
second and a third time.
**Expected:** each → `200`. `len([t for t in rows if t.token_type == "expo"]) == 1` after every
call. Total row count for the user stays `2`. The surviving expo row's `updated_at` is >= the
previous value.
**Pytest:** `tests/test_push_tokens.py :: test_reregistering_same_expo_token_does_not_duplicate`

#### T24 — deregister removes only the expo row  · P0 / Critical
**Steps:** with one `web` and one `expo` row present, `client.delete("/push-tokens/", headers=h)`.
**Expected:** `200`, `{"message": "Push token removed"}`. Remaining rows for that user:
`[t.token_type for t in rows] == ["web"]`, exactly one row, and `rows[0].token != _EXPO`
(it is still the JSON subscription string). This is the bug the sprint exists to fix — a failure
here means a mobile logout silently kills the user's browser notifications.
**Pytest:** `tests/test_push_tokens.py :: test_deregister_removes_only_expo_row`

#### T25 — invalid token string → message, no row  · P0 / Major
**Steps:** fresh user with **zero** push rows. `client.post("/push-tokens/", json={"token": "not-a-real-token"}, headers=h)`.
**Expected:** `200` (the handler returns a message rather than raising — `NotificationService.js`
only checks `response.ok`, so do not change this to a 4xx), body
`{"message": "Invalid token format — must start with ExponentPushToken or ExpoPushToken"}`.
Assert the substring `"Invalid token format"` is in `json["message"]`. Row count for that user
is still `0`. Repeat with `{"token": ""}` → same message, still 0 rows.
**Pytest:** `tests/test_push_tokens.py :: test_invalid_token_format_creates_no_row`

#### T26 — push-token routes require auth  · P0 / Critical
**Steps:** `client.post("/push-tokens/", json={"token": _EXPO})` and `client.delete("/push-tokens/")`,
both with no header.
**Expected:** `401` for both. (Unchanged behaviour — this is a guard that the R3 edit did not drop
the `current_user` dependency while rewriting the query.)
**Pytest:** `tests/test_push_tokens.py :: test_push_token_routes_require_auth`

#### T27 — web-only user logging out of mobile  · P0 / Critical
**Steps:** fresh user. `POST /notifications/web-subscribe` only (no expo registration ever).
Then `client.delete("/push-tokens/", headers=h)`.
**Expected:** `200`. The user still has exactly **1** row and it is `token_type == "web"` with its
token value unchanged. (Under the old code this deleted the web row.)
**Pytest:** `tests/test_push_tokens.py :: test_deregister_with_only_web_row_is_noop`

#### T28 — deregister clears historical expo duplicates  · P1 / Major
**Steps:** fresh user. Insert two `expo` rows directly through the `db` fixture (simulating rows
created by the old buggy code), commit, then `client.delete("/push-tokens/", headers=h)`.
**Expected:** `200`; **zero** `expo` rows remain (the architecture specifies `.all()` + a loop, not
`.first()`). Any `web` row present is untouched.
**Pytest:** `tests/test_push_tokens.py :: test_deregister_removes_all_expo_duplicates`

---

### R4 — the suite is green

#### T29 — full run  · P0 / Major
**Steps:** from the repo root, `.venv\Scripts\python.exe -m pytest tests -q`.
**Expected:** the summary line ends `0 failed`. No errors, no new skips, no collection errors.
Total collected must be **>= 115 + the new cases** (115 was the pre-sprint count) — a drop in the
collected count means a test was deleted rather than fixed, which is a fail.

#### T30 — the 12 previously-failing tests, by name  · P0 / Major
**Steps:** `.venv\Scripts\python.exe -m pytest tests/test_books.py tests/test_reading_activity.py -q`
**Expected:** all 12 pass. They fail today only because the call sites read
`add.json()["userbook"]["id"]` while the endpoint returns the flat shape — the fix is
`add.json()["id"]` at the 9 + 3 call sites named in architecture.md. **The response shape is the
contract; do not "fix" this by changing `books_router.py`.**

`tests/test_books.py` (9):
1. `TestProgress :: test_update_progress`
2. `TestProgress :: test_progress_at_total_pages_marks_finished`
3. `TestProgress :: test_progress_zero_resets_to_read`
4. `TestProgress :: test_cannot_update_other_users_book`
5. `TestPatchUserbook :: test_patch_status`
6. `TestPatchUserbook :: test_patch_rating`
7. `TestPatchUserbook :: test_patch_no_valid_fields`
8. `TestDeleteUserbook :: test_delete_own_book`
9. `TestDeleteUserbook :: test_cannot_delete_other_users_book`

`tests/test_reading_activity.py` (3):
10. `TestDailyStats :: test_pages_logged_after_progress_update`
11. `TestInsights :: test_insights_projected_finishes_when_reading`
12. `TestInsights :: test_insights_avg_rating_when_rated`

Note that #4 and #9 are **ownership** tests (bob mutating alice's userbook → 404). They are
currently failing for a stale-helper reason, which means that ownership check is effectively
unverified today. Treat them as Critical, not Minor.

`tests/test_books.py:22` (`r.json()["book"]["title"]`) is **already correct** — the flat shape
nests `book`. If the Builder changed it, that is a fail.

---

### R5 — virtualenvs out of the git index

Run all of these from the repo root, **after** the Builder's commit (between `git rm --cached` and
the commit, `git status` legitimately shows thousands of staged `D` lines — that is not a failure).

#### T31 — nothing venv-shaped is tracked  · P0 / Major
**Command:** `git ls-files | grep -E "^(\.venv|venv)/" | wc -l`
**Expected:** `0` (was 12313: `.venv/` 5309, `venv/` 7004).

#### T32 — `.gitignore` ignores `.venv/`  · P0 / Major
**Command:** `grep -n "^\.venv/$" .gitignore`
**Expected:** one match, inside the existing `# Virtual environment` block. `venv/` (line 3) is
still present — the new line is an addition, not a replacement.

#### T33 — the directories still exist on disk  · P0 / Critical
**Command:** `ls -d .venv venv`
**Expected:** both printed, both still containing their `Scripts/` (or `bin/`) directory.
`.venv\Scripts\python.exe -m pytest tests -q` must still run. If either folder is gone, the
Builder used `git rm -r` without `--cached` — that is data loss, stop and restore.

#### T34 — `git status` is clean of venv noise  · P0 / Major
**Command:** `git status --short | grep -c venv`
**Expected:** `0`. (`grep -c` exits 1 when the count is 0 — that is expected; read the printed `0`.)

#### T35 — the removal is its own commit  · P1 / Minor
**Command:** `git show --stat --name-only HEAD | grep -vE "^(\.venv|venv)/" | head -20`
**Expected:** besides the commit header, only `.gitignore`. No `app/`, `tests/`, or `features/`
file in the same commit. The commit body mentions that a collaborator pulling it loses those
folders from their working copy.

---

### R6 — dependency map regenerated

#### T36 — the generator runs  · P0 / Major
**Command:** `.venv\Scripts\python.exe scripts\gen_dependency_map.py`
**Expected:** exit code `0`, no traceback. `dependency-map.md` is modified.

#### T37 — the four `/books` rows are clean  · P0 / Critical
**Command:** `grep -n "| /books/" dependency-map.md` (or read the generated table, currently lines 101-106).
**Expected exactly:**

| Method | Path | Auth column | ⚠️ |
|---|---|---|---|
| GET | `/books/` | `user` | absent |
| POST | `/books/` | `user` | absent |
| GET | `/books/{book_id}` | `user` | absent |
| DELETE | `/books/{book_id}` | **`admin`** | absent |

`GET /books/search` stays `user`, `GET /books/recommendations` stays `user`,
`POST /books/add-to-library` stays `user`. Line numbers on every `/books` row shift by a few —
expected, not a regression.

#### T38 — no over-reach  · P0 / Major
**Expected:** `POST /auth/delete-account` **still** shows `NONE` + ⚠️ (correct — R2), and
`GET /api/googlebooks/search` and `GET /api/googlebooks/book/{google_book_id}` **still** show
`NONE` + ⚠️ (out of scope, spec §Not building). A ⚠️ disappearing from any of these three means
the Builder authenticated an endpoint the spec said to leave alone — that is a scope violation and
a client-breaking change (the web landing/search pages call googlebooks).

#### T39 — the curated sentence is updated  · P1 / Minor
**Steps:** read `dependency-map.md` line ~38, the `### pushtoken table` paragraph.
**Expected:** the clause "`push_router.py` register/deregister currently select by `user_id` only —
a mobile login can overwrite a web subscription" is replaced by a statement that both paths now
filter `token_type == "expo"`. The closing sentence "Any query on this table must filter
`token_type`" is still present.

---

### Regression — consumers of the touched endpoints

Sourced from `dependency-map.md`: `POST /books/add-to-library` has **12** consuming files
(web: `AppTour.jsx`, `BookPreviewModal.jsx`, `HomePage.jsx`, `LibraryPage.jsx`, `SearchPage.jsx`;
mobile: `AppTour.js`, `BookPreviewScreen.js`, `FeedScreen.js`, `LibraryScreen.js`,
`OnboardingScreen.js`, `SearchScreen.js`, `UserProfileScreen.js`). `GET /userbooks/` has **13**.
No client file is modified this sprint, so the regression bar is: **the server response is
byte-identical in shape to before.**

#### T40 — `add-to-library` flat shape unchanged  · P0 / Critical
**Steps:** as alice, `POST /books/add-to-library {"title": "T40 Shape", "isbn": "t40-isbn", "total_pages": 200, "status": "reading", "google_books_id": "t40-gid"}`.
**Expected:** `200`. Top level keys **exactly**: `id`, `user_id`, `book_id`, `status`,
`current_page`, `rating`, `format`, `ownership_status`, `created_at`, `updated_at`, `book`.
There is **no** `userbook` key and **no** `message` key at the top level.
`json["book"]` keys exactly: `id`, `title`, `author`, `description`, `total_pages`, `cover_url`,
`google_books_id`. `json["book"]["google_books_id"] == "t40-gid"` — the mobile
`BookPreviewScreen` / web `BookPreviewModal` duplicate detection keys on it; a `None` here
silently breaks duplicate detection in 12 files.
**Pytest:** `tests/test_books.py :: TestAddToLibrary :: test_add_to_library_flat_shape_unchanged`

#### T41 — duplicate add for the same user still 400  · P1 / Major
**Steps:** repeat T40's exact call as the same user.
**Expected:** `400`, `json["detail"]` contains `"already in your library"` and the friendly tab name
(`Currently Reading` for `status="reading"`). Not 200, not 409.
**Pytest:** `tests/test_books.py :: TestAddToLibrary :: test_add_duplicate_same_user_returns_400`

#### T42 — `GET /books/search` unchanged  · P0 / Major
**Steps:** as alice add "Searchable Title XYZ", then `client.get("/books/search?q=Searchable", headers=alice_headers)`; also `client.get("/books/search?q=Searchable")` with no header, and
`?q=zzznomatch999` with a header.
**Expected:** with token → `200`, a JSON array, each element having `id`, `title`, `author`,
`cover_url`, `total_pages`, `description`, `publisher`, `published_date` — the same dict shape as
before (this route already returned a hand-built dict, not a raw row). No header → `401`
(already true; guard that it stays). No match → `200` and `[]`.
**Pytest:** existing `tests/test_books.py :: TestBookSearch :: test_search_returns_results` and
`:: test_search_no_results` must still pass unchanged; add
`:: TestBookSearch :: test_search_requires_auth`.

#### T43 — `GET /books/recommendations` unchanged  · P0 / Major
**Steps:** `client.get("/books/recommendations", headers=alice_headers)` and with no header.
**Expected:** with token → `200`, a JSON array (possibly empty for a user who follows nobody —
an empty list is a pass, not a failure). No header → `401`. `?limit=5` still accepted and returns
at most 5. **Critically:** the route must still resolve to the recommendations handler, not be
captured by `/books/{book_id}` and 422 on `"recommendations"` not being an int.
**Pytest:** `tests/test_books.py :: TestRecommendations :: test_recommendations_with_token`
and `:: test_recommendations_requires_auth`

#### T44 — `GET /userbooks/` shape unchanged  · P0 / Critical
**Steps:** as a user with at least one book, `client.get("/userbooks/", headers=h)`;
also `?status=reading`.
**Expected:** `200`, an array of the same flat shape as T40 — each item has `id`, `user_id`,
`book_id`, `status`, `current_page`, `rating`, `format`, `ownership_status`, `created_at`,
`updated_at`, and a nested `book` containing `google_books_id`. `?status=reading` returns only
`status == "reading"` items. A user's list contains **only their own** rows (existing
`test_returns_own_books_only`). `/userbooks/` is not modified this sprint — any diff here is an
unintended side effect.
**Pytest:** existing `tests/test_books.py :: TestListUserbooks :: *` must still pass; add
`:: TestListUserbooks :: test_userbook_item_shape_has_nested_google_books_id`.

#### T45 — route ordering intact  · P0 / Critical
Adding a `limit` `Query` and reordering parameters is the classic way to break FastAPI path
precedence. `/books/{book_id}` is declared at line ~336, **after** `/books/search` (~309),
`/books/recommendations` (~202) and `/books/add-to-library` (~35) — that order must not change.
**Steps:** with a token, GET `/books/search?q=x`, GET `/books/recommendations`, POST
`/books/add-to-library`.
**Expected:** `200` for all three (add-to-library with a valid payload). None returns `422`
with a `"value is not a valid integer"` / `int_parsing` detail on `book_id` — that error is proof
the literal path was swallowed by `/books/{book_id}`.
**Pytest:** `tests/test_books.py :: TestCatalogAuth :: test_literal_paths_not_swallowed_by_book_id`

#### T46 — existing passing cases still pass  · P0 / Major
Every case in `tests/test_books.py` that passes today must still pass:
`TestAddToLibrary :: test_add_book`, `:: test_add_duplicate_book_for_same_user`,
`:: test_same_book_different_users`, `:: test_dedupes_book_by_isbn`, `:: test_requires_auth`;
`TestListUserbooks :: test_empty_library`, `:: test_returns_own_books_only`,
`:: test_filter_by_status`; `TestBookSearch :: test_search_returns_results`,
`:: test_search_no_results`. Counted inside T29/T30, listed here so a "fixed by deleting"
regression is visible. *(Bookkeeping entry — not counted in the 45.)*

---

## Automated

`.venv\Scripts\python.exe -m pytest tests -q` — from the repo root.

| File | Class | Status |
|---|---|---|
| `tests/test_books.py` | `TestCatalogAuth` | **new** (R1 auth, admin delete, route ordering) |
| `tests/test_books.py` | `TestCatalogList` | **new** (R1 `limit`) |
| `tests/test_books.py` | `TestCatalogCreate` | **new** (R1 `POST`/`GET` by id, dedupe, mass assignment) |
| `tests/test_books.py` | `TestRecommendations` | **new** (regression) |
| `tests/test_books.py` | `TestAddToLibrary` | extend (flat shape, duplicate 400) |
| `tests/test_books.py` | `TestListUserbooks` | extend (nested `google_books_id`) |
| `tests/test_books.py` | `TestBookSearch` | extend (`test_search_requires_auth`) |
| `tests/test_books.py` | `TestProgress`, `TestPatchUserbook`, `TestDeleteUserbook` | fix 9 stale call sites only |
| `tests/test_reading_activity.py` | `TestDailyStats`, `TestInsights` | fix 3 stale call sites only |
| `tests/test_push_tokens.py` | module-level functions | **new file** (R3) |
| `tests/test_auth.py` | `TestPublicDeleteAccountForm` | **new class** (R2) |

### Expected pytest function names

**`tests/test_books.py :: TestCatalogAuth`**
- `test_list_requires_auth`
- `test_get_one_requires_auth`
- `test_create_requires_auth`
- `test_delete_requires_auth`
- `test_delete_forbidden_for_non_admin`
- `test_non_admin_delete_leaves_book_and_userbooks_intact`
- `test_admin_can_delete_own_created_book`
- `test_admin_delete_missing_book_returns_404`
- `test_literal_paths_not_swallowed_by_book_id`

**`tests/test_books.py :: TestCatalogList`**
- `test_list_works_for_user_and_respects_limit`
- `test_list_limit_param_caps_results`
- `test_list_limit_above_max_rejected`
- `test_list_limit_zero_rejected`

**`tests/test_books.py :: TestCatalogCreate`**
- `test_create_book_with_token`
- `test_create_dedupes_by_isbn`
- `test_create_without_title_returns_400`
- `test_create_ignores_unknown_fields`
- `test_create_accepts_emoji_and_long_title`
- `test_get_book_by_id_with_token`
- `test_get_missing_book_returns_404`

**`tests/test_books.py :: TestRecommendations`**
- `test_recommendations_with_token`
- `test_recommendations_requires_auth`

**`tests/test_books.py` — extensions to existing classes**
- `TestAddToLibrary :: test_add_to_library_flat_shape_unchanged`
- `TestAddToLibrary :: test_add_duplicate_same_user_returns_400`
- `TestListUserbooks :: test_userbook_item_shape_has_nested_google_books_id`
- `TestBookSearch :: test_search_requires_auth`

**`tests/test_push_tokens.py`**
- `test_expo_and_web_tokens_coexist`
- `test_reregistering_same_expo_token_does_not_duplicate`
- `test_deregister_removes_only_expo_row`
- `test_deregister_removes_all_expo_duplicates`
- `test_deregister_with_only_web_row_is_noop`
- `test_invalid_token_format_creates_no_row`
- `test_push_token_routes_require_auth`

**`tests/test_auth.py :: TestPublicDeleteAccountForm`**
- `test_delete_account_form_stays_public`
- `test_delete_account_unknown_email_same_response`

**Not automatable (run by hand / by the PM):** T31-T35 (git, shell), T36-T39
(`gen_dependency_map.py` + file inspection), and the spec's Done Checklist items 1-3 against the
live Render deployment.

---

## Failing Tests

*(Junior QA fills this in after the run. One line per failure: test name, reason, disposition —
fix now / deferred to sprint N / accepted risk.)*

Known-failing at plan time (expected to be fixed by R4): the 12 tests listed under T30.

---

## Notes for Junior QA

**Running the suite.** From the repo root
`C:\Users\sonal\Documents\projects\book-tracker`:

```
.venv\Scripts\python.exe -m pytest tests -q
```

`tests/conftest.py:6` sets `SECRET_KEY` itself (`os.environ.setdefault`), so you do **not** need to
export it and you do **not** need to activate the venv — calling `.venv\Scripts\python.exe`
directly is enough. Run from the repo root, not from `tests/`, or the `from tests.conftest import …`
lines fail to resolve.

Useful narrow runs:
```
.venv\Scripts\python.exe -m pytest tests/test_books.py -q
.venv\Scripts\python.exe -m pytest tests/test_push_tokens.py -q
.venv\Scripts\python.exe -m pytest tests -q -k "CatalogAuth or push"
```

**One shared in-memory database.** `conftest.py` creates one named shared-cache SQLite DB for the
entire session and creates `alice_f@`, `bob_f@`, `admin_f@` at import time. Consequences:
- Tests are **not** isolated. A test that deletes a catalog `Book` other tests' `UserBook` rows
  point at will cascade failures into `test_reading_activity.py`. That is why T06 creates a
  throwaway book first and deletes only that id.
- Counts are cumulative. Assert `<= 50`, never `== 50`.
- The `db` fixture session and the request handler's session are **different** sessions. Call
  `db.expire_all()` before reading a row back after an HTTP call, or you will assert against a
  stale object and report a false failure. This is the #1 cause of phantom failures in
  `test_push_tokens.py`.
- `alice_headers` / `bob_headers` / `admin_headers` are **session-scoped** — reuse them freely,
  but for push-token tests always make a fresh user with `_make_user(db, email="unique@example.com")`.

**Admin fixture.** `admin_headers` (and `admin`) already exist in `conftest.py:107-124` — the admin
user is `admin_f@example.com` with `is_admin=True`. Do not create your own admin.

**The live-server checks are BLOCKED locally.** The spec's Done Checklist items 1-3 are `curl`
calls against `https://…` (the Render deployment) plus a Supabase `SELECT` on `pushtoken`. Those
are **PM-run, after deploy**. Do not attempt them from this machine, do not substitute localhost,
and do not mark them PASS from the pytest equivalents — record them as `BLOCKED — PM verifies on
Render after deploy` and note that T05/T06/T22/T24 are their local equivalents. Render's free tier
sleeps after 15 minutes, so the PM's first curl may take ~30s; a timeout there is not a failure.

**R5's git checks run in the repo root**, in a shell at
`C:\Users\sonal\Documents\projects\book-tracker`, and only **after** the Builder has committed.
Between `git rm -r --cached .venv venv` and the commit, `git status --short` legitimately prints
thousands of staged `D` lines — that is the expected intermediate state, not a failure. Use Git
Bash for the `grep`/`wc` pipelines. `git status --short | grep -c venv` printing `0` with a
non-zero exit code is a **pass** (`grep -c` exits 1 when it counts nothing).

Note this repo's default branch is `master` (per CLAUDE.md), not `main`.

**Do not fix `books_router.py` to satisfy a test.** The flat `add-to-library` shape is the contract
in `dependency-map.md` and is consumed by 12 client files. If one of the 12 stale tests still fails
after the call-site fix, report it — do not change the endpoint.

**If a `/books` case returns 401 where you expected 403** (T05), the Builder used `get_current_user`
instead of `get_admin_user`, or the token is malformed — check the header before filing.
If it returns **404** where you expected 403, the dependency was placed after the book lookup;
that leaks catalog existence to non-admins and is a Critical fail.

**If T20 (`/auth/delete-account` unauthenticated) fails with 401**, stop and escalate immediately.
That endpoint backs the public Play-Store deletion form; a 401 there is a store-compliance
regression, not a security improvement.

**Ambiguous failure?** Read `architecture.md` (Technical Brief §R1-R6) before reading any build
code — the exact expected line changes are specified there.

---

## Run 2026-09-12

Total 45 · PASS 45 · FAIL 0 · BLOCKED 0 · Verdict: PASS

**Pytest Summary:** `150 passed in 31.64s` (baseline: 103 passed / 12 failed pre-sprint; +37 new tests, +12 fixed stale call sites)

All 45 test cases pass. All P0/Critical auth, ownership, and privacy cases confirmed PASS. No failures. No blockers.

### Test Execution Summary

**R1 (Catalog Auth) — T01-T19:** TestCatalogAuth (9), TestCatalogList (4), TestCatalogCreate (7) — all PASS
- GET/POST/GET/DELETE `/books/` routes require authentication (401 unauthenticated, 403 non-admin delete)
- DELETE `/books/{id}` limited to `is_admin` users; normal user returns 403
- GET `/books/` limit parameter enforced (default 50, max 200, rejects 0/-1/500+)
- POST `/books/` dedupes by ISBN, rejects missing title, accepts emoji/long strings, ignores mass assignment

**R2 (Public Delete Form) — T20-T21:** TestPublicDeleteAccountForm — both PASS
- POST `/auth/delete-account` remains public (no token required) — critical for Play Store compliance
- Unknown email returns identical 200 response (no enumeration)

**R3 (Push Channels) — T22-T28:** test_push_tokens.py (7 tests) — all PASS
- Web + expo subscriptions coexist; web token unchanged on expo registration
- Expo reregistration does not duplicate
- DELETE `/push-tokens/` removes ONLY expo rows, preserves web rows
- Invalid token format returns 200 with message, creates no row
- Both routes require auth (401 unauthenticated)
- Web-only users: DELETE `/push-tokens/` is noop
- Historical expo duplicates cleaned up on deregister

**R4 (Test Suite) — T29-T30:** Full pytest + 12 previously-failing tests — all PASS
- 150 passed, 0 failed (was 103 passed / 12 failed; +37 new tests added, +12 fixed)
- All 12 stale call-site fixes in TestProgress (4), TestPatchUserbook (3), TestDeleteUserbook (2), TestDailyStats (1), TestInsights (1) pass

**R5 (Virtualenv Removal) — T31-T35:** Git checks — all PASS
- 0 virtualenv files tracked in git (was 12,313)
- .gitignore updated with .venv/ entry
- Both .venv/ and venv/ directories remain on disk (not deleted)
- git status clean of venv noise
- Removal in its own commit (390606b) with only .gitignore changed

**R6 (Dependency Map) — T36-T39:** gen_dependency_map.py regeneration — all PASS
- Generator runs successfully (exit 0)
- Four `/books/` catalog rows show correct auth levels (user/user/user/admin) with no ⚠️
- /auth/delete-account and /api/googlebooks/* still show ⚠️ (out of scope, correct)
- pushtoken table description updated: both register/deregister filter `token_type == "expo"`

**Regression Tests — T40-T45:** Existing consumers unchanged — all PASS
- POST `/books/add-to-library` flat shape unchanged (12 consuming client files unaffected)
- Duplicate add-to-library still returns 400 with tab message
- GET `/books/search` unchanged (401 unauthenticated, 200 with auth)
- GET `/books/recommendations` unchanged (401 unauthenticated, 200 with auth, route ordering intact)
- GET `/userbooks/` shape unchanged with nested `book.google_books_id`
- Route precedence maintained: `/books/search`, `/books/recommendations`, `/books/add-to-library` not swallowed by `/books/{book_id}`

### Failures

None. All 45 cases pass, including all P0/Critical security cases.

### Observations outside the plan

None. Build matches spec exactly.

### Escalations to Senior QA

None. All tests pass. Ready for deploy.

