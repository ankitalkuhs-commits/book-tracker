---
screen: sprint-1-hardening
feature: security
repo: api (+ repo root for git hygiene)
status: architecture-complete
spec_status: APPROVED (PM, 2026-09-12)
architect_verified: 2026-09-12
---

## Risk Summary (for PM)

- **What changes:** four `/books` catalog routes stop answering anonymous callers (delete becomes admin-only), the mobile push-token save stops clobbering a user's web-push subscription, 12 stale tests get their expectations corrected, and ~12,300 accidentally-committed virtualenv files leave the git index.
- **What could break:** nothing a real user touches. I checked both clients: no web page and no mobile screen calls any of the four routes. The one mobile wrapper that does (`booksAPI.getAll`) is dead code and already sends the token anyway.
- **The only sharp edge:** the venv removal is a ~12,300-file commit. Anyone else who pulls it loses those folders from their own working copy (this machine keeps them — `--cached` only). Solo repo, so low risk, but it is a big, noisy commit and should be its own commit.
- **Pre-existing data quirk found while verifying:** because the old code picked "any token row for this user", a few users may already have a row labelled `web` that actually holds a mobile token. Those users' web notifications are silently dead today. The fix stops it happening again, and the row repairs itself the next time that user re-enables browser notifications. No database change needed.
- **Product decisions needed:** none. The spec left nothing open.
- **Recommendation:** approve as specced. No schema migration, no mobile build, no store release.

---

## Data Flow

No user action changes. Mobile login → `NotificationService.registerExpoPushToken()` → `POST /push-tokens/` → the `pushtoken` row **matching `user_id` AND `token_type='expo'`** is created or updated, leaving any `web` row alone; logout → `DELETE /push-tokens/` deletes only the `expo` rows. Separately, the four catalog routes `GET /books/`, `POST /books/`, `GET /books/{id}`, `DELETE /books/{id}` gain an auth dependency, so an anonymous request is rejected at the dependency layer before the handler runs — no handler body changes except adding `limit` to the list query.

## depends_on

- `app/deps.py :: get_current_user` — already the contract for every authenticated route (dependency-map.md → Contracts)
- `app/deps.py :: get_admin_user` — wraps `get_current_user`, raises 403 when `is_admin` is false (`app/deps.py:124-137`)
- `app/models.py :: PushToken.token_type` — column already exists with `default="expo"` (`app/models.py:145`); **no migration needed**
- `tests/conftest.py` — the `admin` / `admin_headers` session fixtures already exist (`tests/conftest.py:107-124`)

## depended_by

Verified against `dependency-map.md` generated rows (lines 100-106, 162-163) and by grepping both `api.js` files:

| Route | Web consumers | Mobile consumers | Verdict |
|---|---|---|---|
| `GET /books/` | none | `booksAPI.getAll` (`api.js:47`) — **unused by any screen** | Safe. The axios instance attaches `Authorization` on every request (`api.js:14-22`), so even if it were revived it would pass. |
| `POST /books/` | none | none | Safe |
| `GET /books/{id}` | none | none | Safe |
| `DELETE /books/{id}` | none | none | Safe. No admin screen calls it either — `admin_router.py` has only `DELETE /admin/content/note/{id}` and `.../comment/{id}` (lines 510, 529). |
| `POST` / `DELETE /push-tokens/` | none | `NotificationService.js:64` and `:93` (own `fetch`, own base URL — bypasses `api.js`) | Safe. Request and response shapes unchanged. |

**No response shape changes anywhere in this sprint.** The `add-to-library` flat shape is already what the code returns (`books_router.py:125-145`); only the *tests* believed otherwise.

## API Endpoints Used

| Method | Path | Auth before | Auth after | Web api.js fn | Mobile api.js fn | Change |
|---|---|---|---|---|---|---|
| GET | `/books/` | ⚠️ NONE | **user** | — | `booksAPI.getAll` (dead) | + `get_current_user`, + `limit` (default 50, max 200) |
| POST | `/books/` | ⚠️ NONE | **user** | — | — | + `get_current_user` |
| GET | `/books/{book_id}` | ⚠️ NONE | **user** | — | — | + `get_current_user` |
| DELETE | `/books/{book_id}` | ⚠️ NONE | **admin** | — | — | + `get_admin_user` |
| POST | `/push-tokens/` | user | user | — | `NotificationService.js:64` | query now filters `token_type == "expo"` |
| DELETE | `/push-tokens/` | user | user | — | `NotificationService.js:93` | query now filters `token_type == "expo"` |
| POST | `/auth/delete-account` | NONE | **NONE (unchanged — R2)** | — | — | none; deliberate, see Security Review |

## DB Tables Touched

| Table | Operation | Ownership / privacy rule enforced |
|---|---|---|
| `book` | read (list, get), write (create), delete | Global catalog — `Book` has **no `user_id`** (`app/models.py:49-67`), so per-row ownership is impossible. Read/create gated to any authenticated user; delete gated to `is_admin`. |
| `pushtoken` | read, write, delete | `user_id == current_user.id` on every query (already true), **plus** `token_type == "expo"` on both the mobile register and deregister paths. |
| `userbook` | untouched | — |

**No schema change. No migration. `context/supabase_migration.sql` is not edited in this sprint.** `PushToken.token_type` already exists in `models.py` and is already populated by `notifications/router.py:75` and read by `push_mobile.py:33`, `push_web.py:69`, `scheduler.py:39`.

## Notifications Fired

| event_type | recipients | extra keys the template needs |
|---|---|---|
| none — no new event | | |

`fire_event()` is not called by any route this sprint modifies. `books_router.add_book_to_library` (line 115) fires `book_added` and is **not touched**.

## Cross-Client Impact

No cross-client impact. No file in `book-tracker-frontend-stitch/` or `book-tracker-mobile-stitch/` is modified, so **no EAS build and no `app.json` version bump**. Both clients already attach `Authorization` to every call to these paths (web `apiFetch` header injection; mobile axios request interceptor at `api.js:14-22`; `NotificationService.js` sets the header explicitly at lines 68 and 95). Behaviour on an expired token is unchanged: 401 → `clearToken` → login.

---

# Technical Brief

## R1 — `app/routers/books_router.py`

Four routes. Do not touch `add_book_to_library` (lines 35-145), `get_recommendations` (202), or `search_books` (309).

**Imports (top of file):**

- Line 2 — `from fastapi import APIRouter, Depends, HTTPException` → add `Query`:
  `from fastapi import APIRouter, Depends, HTTPException, Query`
- Line 6 — `from app.deps import get_current_user` → add `get_admin_user`:
  `from app.deps import get_current_user, get_admin_user`

**`list_books` — line 149-152.** Current signature `def list_books(db: Session = Depends(get_db)):`

```python
@router.get("/")
def list_books(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    books = db.exec(select(Book).limit(limit)).all()
    return books
```

Use the `_=Depends(...)` form — it matches the existing style in this same file (`search_books`, line 310) and the dependency-map generator detects it correctly (proof: `/books/search` is already reported as `user` in `dependency-map.md:104`). Response shape is unchanged (still raw `Book` rows); changing it is out of scope and would be a contract change.

**`add_book` — line 156-157.** Append `_=Depends(get_current_user)` after `db`. Leave the `{message, book}` response alone.

**`get_book` — line 336-341.** Append `_=Depends(get_current_user)` after `db`. `book_id` stays the first parameter.

**`delete_book` — line 345-353.** Append `_=Depends(get_admin_user)` after `db`.

**Why DELETE is admin-only and not owner-scoped:** `Book` is the shared global catalog row (`models.py:50` — "Global book record"), joined to every user through `UserBook.book_id` (`models.py:74`). It has no `user_id`, so there is no owner to check. A user-level delete would let any logged-in account remove a row that other users' libraries point at — on PostgreSQL the FK would raise a 500, on SQLite (FK enforcement off by default) it would silently orphan every `UserBook` row for that book. `get_admin_user` gives 401 for no token and 403 for a non-admin, which is exactly what the spec's Done Checklist item 1 asks for.

## R2 — `POST /auth/delete-account` stays unauthenticated

No code change. Record the reason in `learnings.md` (Builder or Doc Sync): it backs `account-deletion.html`, the public Play-Store data-deletion form, which by policy must be reachable by someone who has already uninstalled the app and has no token. It is a request-by-email flow, not a direct delete. Leave it out of R6's ⚠️ cleanup expectation — that row will still show ⚠️ and that is correct.

## R3 — `app/routers/push_router.py`

**`register_push_token` — replace the query at lines 39-41:**

```python
existing = db.exec(
    select(models.PushToken).where(
        models.PushToken.user_id == current_user.id,
        models.PushToken.token_type == "expo",
    )
).first()
```

Keep the update/create branch at lines 43-50 as it is, but make `token_type` explicit on the insert so the row's channel never depends on the model default:

```python
db.add(models.PushToken(
    user_id=current_user.id,
    token=payload.token,
    token_type="expo",
))
```

**Dedupe rule:** this single query *is* the dedupe. There is at most one `expo` row per user; registering the same token twice finds that row and only refreshes `token` + `updated_at`, so no second row is created. Do **not** add a separate "does this exact token already exist" lookup — it buys nothing and adds a branch.

**`deregister_push_token` — replace lines 62-69** with the same filter, and delete every matching row rather than just the first, so any historical duplicate is cleaned up on logout:

```python
existing = db.exec(
    select(models.PushToken).where(
        models.PushToken.user_id == current_user.id,
        models.PushToken.token_type == "expo",
    )
).all()

for row in existing:
    db.delete(row)
if existing:
    db.commit()
    print(f"[Push] Expo token(s) removed for user {current_user.id} ({current_user.email})")
```

Leave the token-prefix validation (lines 30-37) and both response bodies unchanged — `NotificationService.js` only checks `response.ok`.

**Do not touch** `app/notifications/router.py` (`web-subscribe` / `web-unsubscribe` already filter `token_type == "web"` at lines 66 and 97 — they are the correct side of this bug), `push_web.py`, `push_mobile.py`, `scheduler.py`, or `app/utils/push.py`.

## R4 — Tests

### Fix the 12 stale assertions (do not touch anything else in these files)

The helper functions themselves are fine; the **call sites** are stale. `POST /books/add-to-library` returns the flat userbook (`books_router.py:125`), so:

`add.json()["userbook"]["id"]` → `add.json()["id"]`

- `tests/test_books.py` — 9 occurrences, lines **80, 90, 98, 107, 123, 131, 139, 151, 161**
- `tests/test_reading_activity.py` — 3 occurrences, lines **50, 124, 134** (in `test_pages_logged_after_progress_update`, `test_insights_projected_finishes_when_reading`, `test_insights_avg_rating_when_rated`)

That is 12 — matching the 12 known failures in `CLAUDE.md` → Verification. `tests/test_books.py:22` (`r.json()["book"]["title"]`) is **already correct** — the flat shape nests `book`. Do not change it.

### New tests for R1 — append to `tests/test_books.py`

```python
class TestCatalogAuth:
    def test_list_requires_auth(self, client):
        assert client.get("/books/").status_code == 401

    def test_get_one_requires_auth(self, client):
        assert client.get("/books/1").status_code == 401

    def test_create_requires_auth(self, client):
        assert client.post("/books/", json={"title": "Anon Book"}).status_code == 401

    def test_delete_requires_auth(self, client):
        assert client.delete("/books/1").status_code == 401

    def test_delete_forbidden_for_non_admin(self, client, alice_headers):
        assert client.delete("/books/1", headers=alice_headers).status_code == 403

    def test_list_works_for_user_and_respects_limit(self, client, alice_headers):
        r = client.get("/books/", headers=alice_headers)
        assert r.status_code == 200
        assert len(r.json()) <= 50
```

`get_admin_user` runs before the handler, so `test_delete_forbidden_for_non_admin` returns 403 whether or not book 1 exists — no fixture needed.

**Do not add an admin happy-path delete test against an existing book id.** `conftest.py` uses one shared in-memory DB for the whole session (`conftest.py:17-25`), so deleting a catalog row other tests' `UserBook` rows point at will cascade failures into `test_reading_activity.py`. If you want that coverage, create a throwaway book first with `POST /books/` as admin and delete only that returned id.

### New test for R3 — new file `tests/test_push_tokens.py`

```python
"""Tests for /push-tokens/* — the expo channel must not disturb the web channel."""
from sqlmodel import select
from app import models
from tests.conftest import _make_user, _auth

_SUB = {"endpoint": "https://fcm.googleapis.com/fcm/send/test-abc",
        "keys": {"p256dh": "test-key", "auth": "test-auth"}}
_EXPO = "ExponentPushToken[test-abc123]"


def _rows(db, user_id):
    db.expire_all()          # the request used a different Session on the same in-memory DB
    return db.exec(
        select(models.PushToken).where(models.PushToken.user_id == user_id)
    ).all()


def test_expo_and_web_tokens_coexist_and_deregister_is_scoped(client, db):
    user = _make_user(db, email="push_dual@example.com")
    h = _auth(user)

    assert client.post("/notifications/web-subscribe",
                       json={"subscription": _SUB, "device_info": "Chrome/Windows"},
                       headers=h).status_code == 200
    assert client.post("/push-tokens/", json={"token": _EXPO}, headers=h).status_code == 200

    assert sorted(t.token_type for t in _rows(db, user.id)) == ["expo", "web"]

    # re-registering the same token must not create a second row
    client.post("/push-tokens/", json={"token": _EXPO}, headers=h)
    assert len([t for t in _rows(db, user.id) if t.token_type == "expo"]) == 1

    # mobile logout removes only the expo row
    assert client.delete("/push-tokens/", headers=h).status_code == 200
    remaining = _rows(db, user.id)
    assert [t.token_type for t in remaining] == ["web"]
    assert remaining[0].token != _EXPO
```

**Gotcha that will bite you:** the `db` fixture and the request handler are two different `Session` objects over the same shared-cache in-memory database. Without `db.expire_all()` the fixture session serves stale identity-map objects and the deletion assertion fails even though the code is correct. `/notifications/web-subscribe` needs **no** VAPID env var — only `GET /notifications/vapid-public-key` checks for one (`notifications/router.py:44-49`).

**Verify:** `pytest tests -q` from the repo root with `.venv` active → `0 failed`. `SECRET_KEY` is set by `conftest.py:6`.

## R5 — Remove the virtualenvs from the git index

Confirmed on disk: `git ls-files | grep -cE "^(\.venv|venv)/"` → **12313** tracked files (`.venv/` 5309, `venv/` 7004). `.gitignore` has `venv/` (line 3) but **not** `.venv/` — and `.gitignore` never applies to already-tracked paths, which is why both are in the index.

Order matters. `.gitignore` first, then the index removal, then commit, then verify.

1. Edit `.gitignore`, add one line inside the existing `# Virtual environment` block (after `venv/`, before `env/`):
   ```
   .venv/
   ```
2. ```
   git rm -r --cached .venv venv
   ```
   `--cached` leaves both folders on disk — this is the whole point, do not drop it. Do **not** run `git rm -r --cached .` (that unstages the entire repo).
3. ```
   git add .gitignore
   git commit -m "chore: untrack .venv/ and venv/ (12,313 files) and ignore .venv/"
   ```
   Append the attribution line this session requires as the last line of the commit message.
4. Verify only **after** the commit — between step 2 and step 3, `git status --short` still lists thousands of staged `D` lines, which is expected and not a failure:
   ```
   git status --short | grep -c venv     # → 0
   ls -d .venv venv                       # → both still present on disk
   ```

Keep this as its own commit, separate from the code and test commits. Anyone else who later pulls this commit will have those directories deleted from their working copy — the repo has a single contributor, so this is acceptable, but say so in the PR/commit body.

**Not in scope (spec §Not building — mention, do not do):** `crash.txt`, `book_tracker.db`, `book_tracker.db.bak`, and the loose `migrate_*.py` / `check_*.py` scripts are also tracked and also do not belong in git. I confirmed no real secret is tracked — the only `.pem` files in the index are `certifi` CA bundles inside the venvs, and `firebase-service-account.json`, `private_key.pem`, `public_key.pem` exist on disk but are correctly ignored and untracked.

## R6 — Regenerate the dependency map

```
python scripts/gen_dependency_map.py
```

The generator reads the auth level straight from the route signature (`scripts/gen_dependency_map.py:50-57`: `get_admin_user` → `admin`, `get_current_user_optional` → `optional`, `get_current_user` → `user`, else `NONE` + ⚠️).

Expected diff in the generated table (lines 101-106):
- `GET /books/` → `user`, ⚠️ gone
- `POST /books/` → `user`, ⚠️ gone
- `GET /books/{book_id}` → `user`, ⚠️ gone
- `DELETE /books/{book_id}` → **`admin`**, ⚠️ gone
- Line numbers on every `/books` row shift by a few lines — expected, not a regression.
- `/api/googlebooks/*` and `/auth/delete-account` keep their ⚠️ — out of scope (spec §Not building, and R2).

**Also update the curated section by hand** — `dependency-map.md:38`, the `### pushtoken table` paragraph, currently says:

> "`push_router.py` register/deregister currently select by `user_id` only — a mobile login can overwrite a web subscription."

Replace that clause with a statement that both paths now filter `token_type == "expo"` (keep the closing sentence "Any query on this table must filter `token_type`"). I have deliberately **not** edited this line myself — it is still true until the Builder's change lands.

## Files to modify

| File | What |
|---|---|
| `app/routers/books_router.py` | imports (lines 2, 6); 4 route signatures (149, 156, 336, 345); `limit` in the list query |
| `app/routers/push_router.py` | both queries (39-41, 62-69); explicit `token_type="expo"` on insert |
| `tests/test_books.py` | 9 call-site fixes + new `TestCatalogAuth` class |
| `tests/test_reading_activity.py` | 3 call-site fixes, nothing else |
| `tests/test_push_tokens.py` | new file |
| `.gitignore` | one line: `.venv/` |
| `dependency-map.md` | regenerated appendix + the one curated sentence at line 38 |
| `context/LOAD_ME_FIRST.md` | Recently Shipped / Known Issues (live-context rule) |

## Files NOT to touch

- `book-tracker-frontend-stitch/src/services/api.js` and every page — no client change, no `cacheClear()` needed (no response shape moved)
- `book-tracker-mobile-stitch/` entirely, including `src/services/api.js`, `NotificationService.js`, and `app.json` — **no version / versionCode bump, no EAS build**
- `app/models.py` and `context/supabase_migration.sql` — no schema change
- `app/notifications/router.py`, `push_web.py`, `push_mobile.py`, `scheduler.py`, `app/utils/push.py`
- `app/routers/auth_router.py` (`/auth/delete-account`, `/auth/signup`, `/auth/login`), `app/routers/googlebooks_router.py`, `app/routers/admin_router.py`, `app/routers/userbooks_router.py`
- `books_router.add_book_to_library`, `get_recommendations`, `search_books` — already authenticated and already returning the contract shape
- `crash.txt`, `book_tracker.db`, `migrate_*.py`, `check_*.py`

---

## Security Review

**Closed by this sprint**
- Anonymous enumeration of the whole book catalog (`GET /books/`) and of any single row (`GET /books/{id}`) — both were reachable with no token.
- Anonymous catalog poisoning (`POST /books/`) — anyone could insert arbitrary titles, authors, descriptions and cover URLs into the shared catalog every user searches.
- **Anonymous destructive delete** (`DELETE /books/{id}`) — the most serious of the four. No token, no rate limit, sequential integer ids. Now 401 without a token and 403 for a non-admin.
- Cross-channel token clobbering: a mobile login could overwrite a user's web-push subscription row, and a mobile logout could delete it.

**Deliberately left open**
- `POST /auth/delete-account` stays unauthenticated (R2) — Play-Store policy requires a form reachable after uninstall. It is a request-by-email flow, not a direct delete.
- `GET /api/googlebooks/*` stays unauthenticated — separate PM decision (spec §Not building).
- `/auth/signup`, `/auth/login` stay — PM decision pending.

**Residual risk after this sprint**
- `GET /books/` with `limit` capped at 200 still lets any authenticated user page the catalog. The catalog is not private data (every title is public metadata), so this is acceptable; the cap exists for free-tier memory, not for secrecy.
- `POST /books/` remains open to any authenticated user and writes to the shared catalog with no moderation. Pre-existing; unchanged by this sprint; worth a future ticket.
- No new unbounded query, no new N+1, no new push send in a request path. `GET /books/` becomes *more* bounded than before.

**Pre-existing debt confirmed while verifying (do not fix here)**
- `app/utils/push.py:30` (`send_push_notification_to_user`) selects every `PushToken` row for a user with no `token_type` filter and hands them to the Expo client. Its only importer, `likes_comments.py:7`, imports it but never calls it — that path uses `fire_event()`. Dead, but it is the same class of bug this sprint fixes.
- `admin_router.py:399` selects every `PushToken` row for the broadcast; `send_push_to_many` filters by the `ExponentPushToken` prefix at `utils/push.py:101`, so a web row is dropped rather than crashing.
- `app/deps.py` defines `get_current_user` twice (the stub at line 28 is shadowed by the real one at line 43). Harmless — Python keeps the last — but confusing. Mention, do not fix.

## Assumptions

- **Assumption:** nothing outside this repo calls the four `/books` routes — no server-side job, no Postman collection someone relies on, no admin browser bookmark. Verified for both client repos and for `app/` itself. *If wrong, that caller starts getting 401 and needs a token added.*
- **Assumption:** the production `user` row for the admin has `is_admin = True` (`deps.py:130` notes only `ankitalkuhs@gmail.com` should). *If wrong, `DELETE /books/{id}` becomes unreachable for everyone — which is a safe failure, but the PM's Done Checklist step 1 could not be completed with an admin token.*
- **Assumption:** at most one `expo` row per user exists in production today, because the old code always did `.first()` and overwrote. *If wrong (duplicates already exist), the new `register` still touches only one of them; the new `deregister` deletes them all, which is the desired cleanup.*
- **Assumption:** a production `pushtoken` row labelled `web` whose `token` is actually an `ExponentPushToken` string (possible under the old code path) does not need repairing in this sprint. `push_web.py:79` wraps `json.loads` in `try/except Exception`, so it fails silently rather than 500-ing, and `web_subscribe` deletes all `web` rows before inserting, so the row self-heals the next time that user re-enables browser notifications. *If the PM wants it repaired now, it is a one-line data fix — `DELETE FROM pushtoken WHERE token_type='web' AND token LIKE 'Expo%Push%Token%'` — not a schema migration, and it would be run in the Supabase SQL editor.*
- **Assumption:** `limit` default 50 / max 200 is for free-tier memory, not pagination — no `offset` and no total count are being added, because no consumer exists to use them.

## Open Questions for PM

None. The spec closed every decision it raised, and nothing I found in the code opens a new one. **No database migration is required for this sprint** — `PushToken.token_type` already exists in `app/models.py:145` and is already written by the web channel, so `context/supabase_migration.sql` is untouched and nothing needs to be run in Supabase before this ships.

---

## Build Notes

**What was built:** R1–R6 exactly as specced. `books_router.py`'s four catalog routes now require auth (`get_current_user` on GET/GET/POST, `get_admin_user` on DELETE) and `GET /books/` takes a bounded `limit`; `push_router.py`'s register/deregister now filter and set `token_type == "expo"` so mobile never touches a user's `web` row; the 12 stale `add-to-library` call sites were fixed to the flat shape; every test named in `tests.md` was added; `.venv`/`venv` were untracked from the git index (kept on disk, **not committed**); `.gitignore` gained a `.venv/` line; `dependency-map.md` was regenerated and its curated `pushtoken` sentence updated.

**Files changed:**
- `app/routers/books_router.py` — imports (`Query`, `get_admin_user`); `list_books`, `add_book`, `get_book`, `delete_book` signatures
- `app/routers/push_router.py` — `register_push_token`, `deregister_push_token` queries + insert
- `tests/test_books.py` — 9 call-site fixes; new `TestCatalogAuth`, `TestCatalogList`, `TestCatalogCreate`, `TestRecommendations`; extended `TestAddToLibrary`, `TestListUserbooks`, `TestBookSearch`; added `select`/`Book`/`UserBook` imports
- `tests/test_reading_activity.py` — 3 call-site fixes only
- `tests/test_push_tokens.py` — new file, 7 test functions
- `tests/test_auth.py` — new `TestPublicDeleteAccountForm` class
- `.gitignore` — added `.venv/`
- `dependency-map.md` — regenerated appendix + curated `pushtoken` sentence
- `context/LOAD_ME_FIRST.md` — new "Recently Shipped" entry, "Known Issues" HIGH items closed
- `features/security/sprint-1-hardening/code-map.md` — created

**Migration + rollback:** none. No `models.py` change, no `supabase_migration.sql` edit — `PushToken.token_type` already existed and was already populated.

**Diverged From Brief:**

| Item | Brief said | Built instead | Why |
|---|---|---|---|
| R3 test file | `architecture.md` gave one combined test function `test_expo_and_web_tokens_coexist_and_deregister_is_scoped` | Split into the 7 separately-named functions `tests.md` lists (`test_expo_and_web_tokens_coexist`, `test_reregistering_same_expo_token_does_not_duplicate`, `test_deregister_removes_only_expo_row`, `test_invalid_token_format_creates_no_row`, `test_push_token_routes_require_auth`, `test_deregister_with_only_web_row_is_noop`, `test_deregister_removes_all_expo_duplicates`) | Senior QA's `tests.md` is what the Builder is tested against and names these exact functions; same coverage as the architecture example, just split per case. |
| R5 commit | `architecture.md` R5 step 3 says to `git commit` the `.gitignore` + index removal as its own commit | `git rm -r --cached .venv venv` and the `.gitignore` edit were done and left **staged, uncommitted** | The orchestrating task instruction for this session explicitly said "Do NOT run `git commit`." This is a direct instruction conflict with the Technical Brief — flagging rather than silently picking one. |

**Assumptions:**
- `tests.md`'s exact pytest function names are authoritative over `architecture.md`'s illustrative example where the two describe the same behavior (see divergence row above).
- The orchestrating task's verification command `grep -n "books" dependency-map.md | grep "⚠️"` was intended to check the four `/books/` catalog rows specifically. Run literally, it also matches the two `googlebooks_router.py` rows (`/api/googlebooks/search`, `/api/googlebooks/book/{id}`) because `"googlebooks"` contains the substring `"books"` — those two are *correctly* still `⚠️` (out of scope, spec §Not building; confirmed by `tests.md` T38). The four actual `/books/` catalog rows carry no `⚠️` — verified separately with `grep -n "/books/" dependency-map.md`.
- Leaving the R5 git changes uncommitted means `git status --short | grep -c venv` reports `12313`, not `0` — this is the expected intermediate state per `architecture.md`'s own note ("between `git rm --cached` and the commit, `git status` legitimately shows thousands of staged `D` lines") and per `tests.md`'s note on T34 ("Run AFTER the commit"). It will read `0` once a human/PM runs the commit this session was told not to make.

**Explicitly Not Built (by instruction, not oversight):**
- The R5 `git commit` — index removal + `.gitignore` change are staged only. **Someone must run `git commit` before this sprint's git-hygiene fix is actually in effect on `master`.**
- No commit was made for the R1–R4 code/test changes either — this session created no commits at all, per the top-level instruction ("No commits" / "Do NOT run `git commit`").
- Live-server verification (spec Done Checklist items 1–3: `curl` against the Render deployment, Supabase `SELECT` on `pushtoken`) — blocked locally by design; PM runs these after deploy. Their local equivalents (T05/T06/T22/T24) are covered by the pytest suite added here.
- `/auth/signup`, `/auth/login`, `/api/googlebooks/*` — left unauthenticated, per spec §Not building (separate pending PM decisions).
- `crash.txt`, `book_tracker.db`, `book_tracker.db.bak`, loose `migrate_*.py`/`check_*.py` scripts — still tracked in git, mentioned only per spec §Not building.

**Follow-ups:**
1. PM/human to run `git commit` for the two commits this sprint needs: (a) the `books_router.py` + `push_router.py` + `tests/*` + `dependency-map.md` + `context/LOAD_ME_FIRST.md` changes, and (b) the `.gitignore` + `git rm --cached .venv venv` change, kept as its own commit per `architecture.md` R5 guidance (12,313-file diff, collaborator impact noted in the commit body).
2. PM to run the spec's Done Checklist items 1–3 against Render + Supabase after deploy.
3. Pre-existing debt noted in the Security Review section above (`app/utils/push.py:30`, `admin_router.py:399`, the shadowed `get_current_user` stub in `deps.py`) — not touched, as specced.

**Ready for QA:**
- [x] all screen states implemented — N/A (no UI this sprint); R1–R6 backend requirements implemented as specced
- [x] `pytest tests -q` green — **150 passed, 0 failed** (was 103 passed / 12 failed pre-sprint; +35 new tests, +12 fixed)
- [ ] web build passes — N/A, no web file touched this sprint
- [x] migration appended + flagged — N/A, no schema change needed (`PushToken.token_type` pre-existing)
- [ ] `app.json` bumped if mobile touched — N/A, no mobile file touched this sprint
- [ ] notification: config entry + every placeholder supplied + `fire_event` only — N/A, no new notification event fired this sprint
