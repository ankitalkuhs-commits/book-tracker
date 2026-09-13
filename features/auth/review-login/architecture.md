---
screen: review-login
feature: auth
repo: api (+ scripts/, tests/, .gitignore, context/deployment/)
status: architecture-complete
spec_status: APPROVED (PM, 2026-09-13)
architect_verified: 2026-09-13
---

## Risk Summary (for PM)

- **What changes:** two new backend endpoints and one developer script. `POST /auth/review-login` lets a fixed list of `@trackmyread.com` QA accounts get a normal login token by sending a shared secret. `GET /version` returns the commit Render is actually running, so a deploy can be confirmed in one curl — sprint 2 could not be confirmed at all. The script then fills those two accounts with books, notes, a mutual follow and a Circle, entirely through the public API.
- **What could break:** nothing existing. No response shape changes, no database migration, no client change, no app-store build. Both endpoints are new; every other route is untouched.
- **The safety design in one line:** with the two Render env vars unset — local dev, tests, anyone's fork — the endpoint returns 404 and cannot be used at all. It only exists where you switch it on.
- **The one real risk:** the secret is a password that logs in as a review account. If it leaks, the attacker gets a review account, never a real user's — the allowlist is enforced *and* every entry must end in `@trackmyread.com`, so a typo in the env var can never open login for someone's Gmail. There is no rate limiting anywhere in this app; the defence is that the secret is 43 random characters, which is not guessable.
- **Worth knowing:** review accounts are ordinary users. Their notes appear in the public community feed and they count in admin stats, exactly as the spec says. If that becomes untidy in screenshots we hide them later; not this sprint.
- **Product decisions needed:** none. The spec closed every question it raised.
- **Recommendation:** approve as specced. You will need to set `REVIEW_LOGIN_SECRET` and `REVIEW_LOGIN_EMAILS` on Render after the deploy — the deployment README gets a copy-paste section for it.

---

## Data Flow

No user-facing UI and no client code. A developer or agent POSTs `{email, secret}` to `/auth/review-login`; the handler reads the two `REVIEW_LOGIN_*` env vars **at request time**, 404s if they are unset, checks the email against the allowlist and the secret with a constant-time compare, finds-or-creates an ordinary `user` row exactly the way `/auth/google` does, bumps `last_active` once a day, and returns the same `{access_token, is_new, user}` object `/auth/google` returns. The JWT is then used as a normal `Authorization: Bearer` token — by `curl`, by `scripts/seed_review_accounts.py`, or pasted into a browser as `localStorage.bt_token`. Separately, `GET /version` reads three Render-injected env vars and returns them; it touches no database and needs no token.

## depends_on

- `app/crud.py :: create_user` (`crud.py:16-30`) — derives `username` from the email prefix with a numeric-collision loop. Reused unchanged, so a review user gets `username="review.reader"` like any other account.
- `app/crud.py :: get_user_by_email` (`crud.py:12-13`) — exact `User.email == email` match, **no case folding**. This is why the handler must normalise the email to lowercase *before* the lookup (see R1) — otherwise a mixed-case request would create a second row.
- `app/auth.py :: hash_password` (`auth.py:37-47`) and `create_access_token` (`auth.py:64-69`) — token subject is `{"sub": user.email}`, 30-day HS256, identical to `/auth/google`.
- `app/deps.py :: get_current_user` (`deps.py:43-87`) — resolves `sub` by id then by email, and touches `last_active` once a day. A review token is indistinguishable from a Google token here; nothing in `deps.py` changes.
- `app/routers/auth_router.py :: google_auth` (`auth_router.py:70-145`) — the creation path being mirrored: `secrets.token_urlsafe(32)` → `auth.hash_password` → `crud.create_user`, then the `last_active` daily bump at lines 129-135 and the response at line 139.
- `app/database.py :: get_session` — the DB dependency `google_auth` uses. `tests/conftest.py:38-39` overrides **both** `get_db` and `get_session`, so either works in tests; mirroring `google_auth` means using `get_session`.
- `scripts/gen_dependency_map.py:45-59` — route discovery matches `@router.<verb>("<path>")` only, and takes the file's **first** `APIRouter(prefix="…")` as the prefix. Verified consequence: `@app.get(...)` in `main.py` is invisible to it — `GET /` is absent from the generated table today. This decides where `/version` lives (see R2 and `decisions/ADR-001`).
- `app/routers/googlebooks_router.py :: search_google_books` (line 194) — **unauthenticated**, returns `{results:[{google_id, title, authors[], description, cover_url, total_pages, publisher, published_date, average_rating, ratings_count, isbn_10, isbn_13, categories[]}], total_items, query_used, has_more, next_start_index}`. The seed script parses `results[0]`.
- `requirements.txt` — `requests==2.31.0` is already a direct dependency (the file is UTF-16-encoded; do not rewrite it). `httpx==0.24.1` is also present. The script uses `requests`; **no new dependency**.
- `tests/conftest.py` — one shared named in-memory SQLite DB created at import time, `app.dependency_overrides` set for both session deps, session-scoped `alice/bob/admin` fixtures.

## depended_by

**Nothing.** Both routes are new, so there is no consumer to break. Checked against `dependency-map.md`:

| Surface | Consumers today | Verdict |
|---|---|---|
| `POST /auth/review-login` | none — new route, no `api.js` function in either client | No consumer. Not added to either client (spec §Not building). |
| `GET /version` | none — new route | No consumer. Intended caller is `curl` / the orchestrator agent. |
| `POST /auth/google` | `googleLogin` → web `pages/LoginPage.jsx`, mobile `screens/LoginScreen.js` | **Not modified.** The new endpoint copies its behaviour; it does not refactor it into a shared helper. Zero risk of regressing the only login path real users have. |
| `GET /profile/me` (⚠️ 10 consuming files) | 3 web + 7 mobile call sites | **Not modified.** R5 only *calls* it in a test to prove the review token is accepted like any other. |
| `user` table | everything | One or two extra ordinary rows in production. No column added, no column changed. |

## API Endpoints Used

| Method | Path | Auth | Web api.js fn | Mobile api.js fn | Change |
|---|---|---|---|---|---|
| POST | `/auth/review-login` | **NONE** (gated by env allowlist + secret; 404 when unconfigured) | — (none, by design) | — (none, by design) | **NEW** (R1) |
| GET | `/version` | **NONE** (by design — see Security Review) | — | — | **NEW** (R2) |
| GET | `/profile/me` | user | `getMyProfile` | `userAPI.getProfile` | unchanged — called by one new test |

Both new routes are auth-level `NONE` and will appear with `⚠️` in the regenerated map. That is expected and is documented in the curated section (R6).

## DB Tables Touched

| Table | Operation | Ownership / privacy rule enforced |
|---|---|---|
| `user` | read (find by normalised email), write (create on first review login; `last_active` daily bump) | The caller can only ever reach a row whose email is in the server-side allowlist **and** ends in `@trackmyread.com`. There is no path from this endpoint to any other user's row. `password_hash` is a bcrypt hash of a fresh `secrets.token_urlsafe(32)` that is never stored, logged, or returned — the account has no usable password. |

**No schema change. No migration. `context/supabase_migration.sql` is NOT edited** — every column used (`User.name`, `email`, `password_hash`, `username`, `last_active`) already exists and is already written by `/auth/google`.

Everything the seed script writes (`book`, `userbook`, `reading_activity`, `note`, `follow`, `reading_group`, `group_member`, `group_post`) is written **by the existing routers under the review user's own token** — the script never opens a database connection and imports nothing from `app/`. Every ownership check in those routers applies to it unchanged.

## Notifications Fired

The endpoint itself fires **none**. The seed script, acting as an ordinary user, trips the existing events:

| event_type | fired by | recipients | extra keys | Note |
|---|---|---|---|---|
| `book_added` | `POST /books/add-to-library` (`books_router.py:113`) | the actor's followers | `book_title` | On a re-run nothing is added, so nothing fires. |
| `book_completed` | `PATCH /userbooks/{id}` (`userbooks_router.py`) | the actor's followers | `book_title` | First run only — guarded by `old_status != "finished"`. |
| `new_follower` | `POST /follow/{id}` (`follow_router.py:40`) | the followed user | none beyond `actor_name` | First run only — a repeat returns 400 "Already following". |
| group activity `member_joined` | `POST /groups/{id}/join` | group members | — | Group-activity row, not a push. |

Recipients are only ever the other review account. Neither review account registers a push token, so `fire_event` writes a `NotificationLog` row and sends nothing. **No event is added to `config.py`; no `{placeholder}` risk.**

## Cross-Client Impact

**None.** No file under `book-tracker-frontend-stitch/` or `book-tracker-mobile-stitch/` is modified. No `app.json` version / versionCode bump, no EAS build, no store release. The web `api.js` 60s cache needs no `cacheClear()` — no client mutation path changes. A browser logged in with `localStorage.bt_token = <review token>` behaves exactly like a Google-signed-in user because `get_current_user` cannot tell the two tokens apart.

---

# Technical Brief

## R1 — `POST /auth/review-login` · `app/routers/auth_router.py`

**Where it lives:** `app/routers/auth_router.py`, appended after `google_auth` (after line 145, before `request_account_deletion`). The router already has `prefix="/auth"`, so the path is `/auth/review-login` with `@router.post("/review-login", …)`. `main.py` already mounts this router — **no change to `main.py` for R1**.

### Module-level imports to add (top of `auth_router.py`)

```python
import hmac
import os
import secrets
from typing import Optional
```

`google_auth` imports `os`/`secrets` *inside* the function; the new handler uses module-level imports (cleaner, and `hmac` must be imported somewhere). Do not remove `google_auth`'s local imports — they are not yours to tidy.

### Pydantic body

Add beside the other schemas (after `GoogleAuthIn`, around line 34):

```python
class ReviewLoginIn(BaseModel):
    email: str
    secret: str
```

Both required. A missing field yields FastAPI's 422 *before* the handler runs — see the note on discoverability in the Security Review.

### Env reading — at request time, never at import time

```python
def _review_login_config() -> tuple[Optional[str], list[str]]:
    """
    Read the review-login env vars on every request so tests can monkeypatch them
    and so an operator can set them on Render without a redeploy of this module.
    Returns (secret_or_None, allowlist) where allowlist is lowercased + trimmed
    and NOT yet domain-filtered.
    """
    secret = (os.getenv("REVIEW_LOGIN_SECRET") or "").strip()
    raw = os.getenv("REVIEW_LOGIN_EMAILS") or ""
    allowlist = [e.strip().lower() for e in raw.split(",") if e.strip()]
    return (secret or None), allowlist
```

**Non-negotiable: `os.getenv` must be called inside the request, not at module import.** `app.main` (and therefore every router module) is imported once by `tests/conftest.py:11`, long before any test runs. A module-level `REVIEW_LOGIN_SECRET = os.getenv(...)` would freeze whatever the developer's shell had at collection time and `monkeypatch.setenv` would have no effect — R5 would be untestable and would silently pass against the wrong value. Precedent: `google_auth` also reads config inside the function.

Allowlist parsing is exactly: **split on `,` → `strip()` each → `lower()` each → drop empties.** So `" Review.Reader@TrackMyRead.com , review.friend@trackmyread.com "` parses to the two lowercase addresses.

### The handler

```python
TRACKMYREAD_DOMAIN = "@trackmyread.com"


@router.post("/review-login", include_in_schema=False)
def review_login(payload: ReviewLoginIn, db: Session = Depends(get_session)):
    """
    Password-style login for allowlisted @trackmyread.com QA / review accounts.
    Returns 404 unless BOTH REVIEW_LOGIN_SECRET and REVIEW_LOGIN_EMAILS are set,
    so the route is unusable in local dev, in tests, and in any fork.
    """
    from datetime import datetime, date

    configured_secret, allowlist = _review_login_config()

    # 1. Not opted in -> the route behaves as if it does not exist.
    if not configured_secret or not allowlist:
        raise HTTPException(status_code=404, detail="Not Found")

    # 2 + 3. Domain guard, allowlist membership and secret are all evaluated
    #        before a single 401 is raised, so the response cannot be used to
    #        tell "unknown email" from "wrong secret".
    email = payload.email.strip().lower()
    permitted = {e for e in allowlist if e.endswith(TRACKMYREAD_DOMAIN)}
    email_ok = email in permitted
    secret_ok = hmac.compare_digest(
        payload.secret.encode("utf-8"), configured_secret.encode("utf-8")
    )
    if not (email_ok and secret_ok):
        raise HTTPException(status_code=401, detail="Invalid review credentials")

    # 4. Find or create, exactly as /auth/google does.
    user = crud.get_user_by_email(db, email)
    is_new_user = False
    if not user:
        random_password = secrets.token_urlsafe(32)
        hashed = auth.hash_password(random_password)
        name = email.split("@")[0].title()          # review.reader -> Review.Reader
        user = crud.create_user(db, name=name, email=email, password_hash=hashed)
        is_new_user = True

    # last_active once per day — copied from google_auth (auth_router.py:129-135)
    today = date.today()
    if user.last_active is None or user.last_active.date() != today:
        user.last_active = datetime.utcnow()
        db.add(user)
        db.commit()
        db.refresh(user)

    token = auth.create_access_token({"sub": user.email})
    return {
        "access_token": token,
        "is_new": is_new_user,
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }
```

### Why each of those lines is the way it is

- **Ordering.** The 404 branch is first and is the only branch that can be reached without a configured server. The spec's ordering (404 → wrong email 401 → wrong secret 401) is preserved *observably*: same status, same body. Both checks are computed before the raise so that allowlist membership is not leaked as an early return — a single-line cost for a real (if small) anti-enumeration property. If a later reader prefers two sequential `if`s, the bodies must stay byte-identical.
- **Identical 401 body.** `detail="Invalid review credentials"` for both cases. Never say "unknown email" or "bad secret".
- **`hmac.compare_digest` on bytes.** `compare_digest` raises `TypeError` on a non-ASCII `str` argument, and a `TypeError` inside a FastAPI handler becomes a 500 — which would itself be an oracle ("this input reached the compare"). Encoding both sides to UTF-8 bytes first makes it total. Note `compare_digest` still leaks *length*, which is unavoidable and harmless here.
- **The `@trackmyread.com` guard as a filter, not a branch.** Entries that fail the domain check are dropped from `permitted`, so a mistyped `someone@gmail.com` in the env var simply never matches and yields the ordinary 401. This satisfies R1.5's "refuse at request time, never a 500 at startup" without a separate code path, and it means the request email needs no domain check of its own — anything in `permitted` ends in the domain by construction.
- **404 is keyed on the *raw* parsed allowlist**, before the domain filter. An operator who sets `REVIEW_LOGIN_EMAILS=someone@gmail.com` has opted in (they get 401, the honest answer), whereas an operator who set nothing gets 404. `not allowlist` also covers `REVIEW_LOGIN_EMAILS=" , ,"`.
- **Lowercase normalisation happens once**, before the allowlist check *and* before `crud.get_user_by_email`. `get_user_by_email` is an exact `==` match with no case folding (`crud.py:13`), so skipping this would let `Review.Reader@TrackMyRead.com` create a **second** user row with a duplicate-ish email and a `username` collision handled by the `review.reader1` fallback. This is the single most likely implementation bug in R1; the R5 case-insensitivity test exists to catch it.
- **`name` derivation** is `email.split("@")[0].title()` → `"review.reader"` → `"Review.Reader"`, exactly the example in the spec. Do not use `.capitalize()` (gives `"Review.reader"`).
- **`crud.create_user` is reused unchanged**, so `username` is derived by the same collision-safe loop every other account uses.
- **The random password is never kept.** `secrets.token_urlsafe(32)` → `auth.hash_password` → discarded. The account cannot be logged into via `/auth/login`.
- **`include_in_schema=False`** keeps the route out of `/openapi.json` and `/docs`. It does not make the route secret (see Security Review) but it costs nothing and removes the free advertisement. It does **not** affect `gen_dependency_map.py`, whose regex anchors only on the first quoted string in the decorator (`gen_dependency_map.py:46`) — verified.
- **`Depends(get_session)`**, matching `google_auth` (`auth_router.py:71`). `tests/conftest.py:38-39` overrides `get_db` *and* `get_session`, so tests work either way; mirroring the sibling endpoint keeps the file consistent.
- **Response is byte-for-byte `/auth/google`'s**: the same three top-level keys in the same order, the same three user keys. Anything that works against `/auth/google` works against this.

## R2 — `GET /version` · new file `app/routers/meta_router.py`

**Decision: a new one-route router module, not `main.py` and not `auth_router.py`.** Both of the obvious homes are wrong, for reasons verified in the code:

- **`main.py` beside `GET /`** would define it as `@app.get("/version")`. `scripts/gen_dependency_map.py:46` matches `@router.<verb>(` only — `@app.` decorators are invisible to it. Proof: `GET /` is **absent** from the generated table in `dependency-map.md` today. Putting `/version` there fails R6 unless the script's regex is also changed, which is a bigger, riskier edit than a 12-line file.
- **`auth_router.py`** has `prefix="/auth"`, so the path would become `/auth/version` — R2 says `GET /version`. A second `APIRouter` inside the same file does not help either: `gen_dependency_map.py:43` takes the file's **first** `APIRouter(prefix=…)` match, so the route would be mis-recorded as `/auth/version` in the map even if FastAPI served it at `/version`.

A router with no `prefix=` gives `re.search` no match, the script falls back to `prefix = ""`, and the row lands as `` | GET | `/version` ⚠️ | NONE | app/routers/meta_router.py:N | `` — which is exactly R6. Recorded as `decisions/ADR-001.md`.

### New file — `app/routers/meta_router.py` (complete)

```python
# app/routers/meta_router.py
"""Deployment metadata. No auth, no database — see architecture.md Security Review."""
import os

from fastapi import APIRouter

router = APIRouter(tags=["meta"])


@router.get("/version")
def get_version():
    """
    Which build is actually running. Render injects these three on every
    git-backed deploy; they are absent locally and in tests, where all three
    come back null.
    """
    return {
        "commit": os.getenv("RENDER_GIT_COMMIT"),
        "service": os.getenv("RENDER_SERVICE_NAME"),
        "branch": os.getenv("RENDER_GIT_BRANCH"),
    }
```

Note `APIRouter(tags=["meta"])` with **no `prefix` argument at all** — this is what makes the generator record the path as `/version`.

### One line in `app/main.py`

- Line 8: add `meta_router` to the existing `from .routers import …` list.
- After line 84 (`app.include_router(import_router.router)`): `app.include_router(meta_router.router)`.

Nothing else in `main.py` changes. `GET /` at line 108 stays exactly where it is.

### Env var names — confirmed

`RENDER_GIT_COMMIT`, `RENDER_GIT_BRANCH`, `RENDER_SERVICE_NAME` are the names Render documents and injects into every service instance (alongside `RENDER`, `RENDER_SERVICE_ID`, `RENDER_SERVICE_TYPE`, `RENDER_INSTANCE_ID`, `RENDER_EXTERNAL_URL`, `RENDER_GIT_REPO_SLUG`). Two caveats the Builder should know rather than debug:
- the `RENDER_GIT_*` pair is populated only for **git-backed** services; an image-based deploy leaves them unset, and the endpoint would correctly return `null`. TrackMyRead's backend deploys from `master`, so they will be set.
- they are read fresh on each request, so a `null` in production means "Render did not inject it", never "the process cached a stale value".

`os.getenv` with no default returns `None`, which FastAPI serialises to JSON `null` — exactly the R2 shape. **Exactly three keys. No env dump, no `os.environ` iteration, no `SECRET_KEY`, no `DATABASE_URL`, ever.**

**Unauthenticated by design, and harmless:** the response is a commit SHA, a branch name and a Render service name. The repository is the PM's own; a SHA is an opaque 40-hex identifier that grants nothing. Requiring a token would defeat the entire purpose — the point is to confirm a deploy in one unauthenticated `curl` from a cold Render instance, before and independently of any login working. Adding auth here would make deploy verification depend on the very thing it is meant to verify.

## R3 — Seed script · new file `scripts/seed_review_accounts.py`

**Contract: the script is a normal API client.** It imports nothing from `app/`, opens no database connection, and knows no table names. Every write goes through a router that enforces its own ownership checks. It hard-codes **no secret** — if `REVIEW_LOGIN_SECRET` cannot be resolved it exits non-zero without making a request.

### CLI and configuration

```
python scripts/seed_review_accounts.py [--base-url URL]
```

- `argparse`, one option: `--base-url`, `default="http://127.0.0.1:8000"`, trailing slash stripped.
- HTTP client: **`requests`** — `requests==2.31.0` is already in `requirements.txt`, it is synchronous (no async ceremony for ~40 sequential calls) and it is the only dependency needed. `httpx==0.24.1` is present too and would work; `requests` is the simpler fit. **Do not add a dependency, and do not rewrite `requirements.txt` — that file is UTF-16-encoded and a careless rewrite will corrupt it.**
- Timeouts: `timeout=90` for the first request (Render free tier sleeps after 15 min; cold start is ~30s), `timeout=60` thereafter.
- Secret resolution, in order:
  1. `os.environ.get("REVIEW_LOGIN_SECRET")`
  2. `<repo root>/.env.review`, found as `pathlib.Path(__file__).resolve().parent.parent / ".env.review"`. Parse by hand: skip blank lines and lines starting with `#`; split on the **first** `=`; strip whitespace from key and value; strip one layer of matching `'` or `"` from the value. Six lines, no dependency. (`python-dotenv` is in requirements but nothing in `app/` calls `load_dotenv`, so env vars in this project always come from the shell or Render — do not introduce a new convention.)
  3. Neither → print `REVIEW_LOGIN_SECRET not set (env or .env.review)` to stderr and **exit 2**.

### Accounts and fixed content

```python
READER = "review.reader@trackmyread.com"
FRIEND = "review.friend@trackmyread.com"
```

Three fixed, well-known novels per account — distinct between accounts so the two libraries and the feed look real in a screenshot. Each search query includes the author, which is what makes Google Books return the right volume as `results[0]`:

| Account | `reading` | `finished` (rating 5) | `to-read` |
|---|---|---|---|
| reader | `The Hobbit J R R Tolkien` | `Pride and Prejudice Jane Austen` | `The Great Gatsby F Scott Fitzgerald` |
| friend | `Jane Eyre Charlotte Bronte` | `The Old Man and the Sea Ernest Hemingway` | `Dracula Bram Stoker` |

### The call sequence, with the idempotency rule for every step

Each step prints one line: `[created] …`, `[skipped] …` or `[FAILED] …`.

1. **Login ×2** — `POST {base}/auth/review-login` `{"email": READER|FRIEND, "secret": secret}`.
   → `{access_token, is_new, user:{id,name,email}}`. Keep the token and `user.id` for each.
   *Idempotency:* inherent — the endpoint is find-or-create.
   *Failure is fatal:* non-200 → print the status and body, **exit 1 immediately**. Nothing downstream can run. A `404` here means the Render env vars are not set; say so in the error text.

2. **Snapshot each library once** — `GET {base}/userbooks/` with the account's Bearer token.
   Build `{item["book"]["google_books_id"]: item}`. This one call is what makes steps 3-5 idempotent without a single extra request.

3. **Search + add, 3× per account.**
   - `GET {base}/api/googlebooks/search?query=<urlencoded title+author>&max_results=5`. The route is unauthenticated; send the Bearer header anyway (harmless, and it keeps one request helper).
   - Take `results[0]`. Empty `results` → `[FAILED]`, record, continue to the next book.
   - *Idempotency:* if `results[0]["google_id"]` is already a key in the step-2 snapshot, `[skipped]` — reuse the existing `userbook["id"]` for steps 4-6.
   - Otherwise `POST {base}/books/add-to-library`:
     ```json
     {"title": r["title"],
      "author": ", ".join(r["authors"]) or null,
      "isbn": r["isbn_13"] or r["isbn_10"],
      "google_books_id": r["google_id"],
      "cover_url": r["cover_url"],
      "description": r["description"],
      "total_pages": r["total_pages"],
      "status": "reading" | "finished" | "to-read"}
     ```
     Note the field renames the clients also do: **`google_id` → `google_books_id`, `authors[]` → `author` (joined), `isbn_13`/`isbn_10` → `isbn`** (`dependency-map.md` → `normalize_google_cover_url` contract).
     The response is the flat userbook shape; keep `response["id"]`.
     A `400` whose detail contains "already in your library" is the router's own duplicate guard (`books_router.py:88-94`) — treat as `[skipped]`, **not** a failure. Any other non-200 is `[FAILED]`.

4. **Progress on the `reading` book** — `PUT {base}/userbooks/{id}/progress` body `{"current_page": N}`.
   - `N = max(1, int(total_pages * 0.4))` when `total_pages` is known, else a flat `120`.
   - **`N` must be strictly less than `total_pages`.** `update_progress` flips status to `finished` when `current_page >= total_pages` (`userbooks_router.py:48-54`) — a book meant to be "currently reading" would silently finish itself and the screenshot would be wrong. Clamp: `N = min(N, total_pages - 1)`.
   - *Idempotency:* skip if the snapshot's `current_page == N`. A repeat PUT would be almost harmless anyway (`reading_activity` only logs when `new_page > old_page`, `userbooks_router.py:69`) but it bumps `updated_at` and re-orders the library, so skip properly.

5. **Rating on the `finished` book** — `PATCH {base}/userbooks/{id}` body `{"status": "finished", "rating": 5}`.
   - Rating goes through **PATCH**, never through `PUT …/progress` — mixing them corrupted book status in May 2026 (`CLAUDE.md`, `dependency-map.md` → Userbook shape).
   - *Idempotency:* skip if the snapshot already has `status == "finished"` and `rating == 5`.
   - First run fires `book_completed` to followers; on a re-run the `old_status != "finished"` guard means nothing fires.

6. **Two public notes per account** — `GET {base}/notes/me` once, then up to 2× `POST {base}/notes/`.
   - Note A (emotion): `{"userbook_id": <reading ub id>, "text": "<fixed sentence>", "emotion": "inspired", "is_public": true}`
   - Note B (quote): `{"userbook_id": <finished ub id>, "text": "<fixed sentence>", "quote": "<fixed quote>", "is_public": true}`
   - *Idempotency:* skip a note whose **exact `text`** already appears in `GET /notes/me`. Exact-text matching beats counting — it survives a partially-completed earlier run.
   - `is_public: true` is required for the notes to appear in the friend's feed, which is the point of the screenshot. `userbook_id` must belong to the caller or the router 400s (`notes_router.py:130-133`) — it does, it came from that account's own library.

7. **Mutual follow** — `GET {base}/follow/following` for each account first (returns `[{"followed_id": n}]`).
   - *Idempotency:* skip if the target id is already there.
   - Else `POST {base}/follow/{other_id}` as each account, both directions.
   - A `400` with detail `"Already following"` is tolerated as `[skipped]` (`follow_router.py:25`).

8. **The Circle** — as **reader**: `GET {base}/groups/my`, look for `name == "Review Circle"`.
   - *Idempotency:* found → `[skipped]`, keep its `id`.
   - Else `POST {base}/groups/` `{"name": "Review Circle", "description": "Where the review accounts talk about books.", "is_private": false, "cover_preset": "teal"}` → the serialized group; keep `response["id"]`. Reader becomes curator automatically (`groups_router.py:403`).
   - **Deliberately public** (`is_private: false`), because the spec says "a public circle".
   - Do **not** pass `invite_user_ids` — a separately idempotent membership step (9) is easier to reason about across partial re-runs.

9. **Friend joins** — as **friend**: `GET {base}/groups/my`; if the Circle's id is absent, `POST {base}/groups/{id}/join`.
   - **Chosen over invite + accept, and here is why.** Both paths are supported by the router for a public group, and both end with an `active` membership and the same `member_joined` group-activity row. But for `is_private: false`, `join_group` sets the member `active` immediately with no curator approval (`groups_router.py:498`), so it is **one call instead of two**, and it is idempotent by construction — a repeat returns `{"status": "active", "message": "Already a member or pending"}` with a 201, never an error. The invite path is two calls *and* has a re-run trap: `POST /groups/{id}/accept` raises **404 "No pending invite"** once the membership is already `active` (`groups_router.py:741-742`), so the script would need an extra guard to stay idempotent. Fewer calls, no trap, identical result.
   - *If the PM ever makes the Circle private*, `join` yields `status: "pending"` and the script must switch to reader-`POST /groups/{id}/invite/{friend_id}` then friend-`POST /groups/{id}/accept`, **guarded by a `GET /groups/my` membership check** so the accept is skipped when already active. Recorded here so nobody rediscovers the 404.

10. **One group post** — as **reader**: `GET {base}/groups/{id}/posts`.
    - *Idempotency:* skip if a post with the exact fixed `text` exists.
    - Else `POST {base}/groups/{id}/posts` `{"text": "<fixed sentence>", "userbook_id": <reader's reading ub id>}`.
    - The `userbook_id` must belong to the caller or the router 403s (`groups_router.py:826-829`) — it is the reader's own book, posted by the reader.

### Summary output and exit codes

Final block on stdout, always printed, even on failure:

```
─── Review accounts ───────────────────────────────
  review.reader@trackmyread.com   id=42   new=False
  review.friend@trackmyread.com   id=43   new=False
─── Summary ───────────────────────────────────────
  created 0   skipped 21   failed 0
  base-url http://127.0.0.1:8000
```

Followed by every `[FAILED]` line repeated, if any.

| Exit code | Meaning |
|---|---|
| `0` | every step created or skipped; `failed == 0` |
| `1` | at least one step failed (including a login failure) |
| `2` | configuration / usage error — no secret resolvable, unreachable base URL |

The Done Checklist's "second run reports 0 created" maps directly onto `created 0` in that summary.

## R4 — Git hygiene and the deployment README

### `.gitignore`

The existing "Environment variables" block (lines 22-24) has `.env` and `.env.local`. Add one line so any `.env.<anything>` is covered:

```
.env
.env.local
.env.*
```

`.env.*` catches `.env.review`, `.env.production`, `.env.staging`. It does **not** match the bare `.env`, which is why the existing line stays. Nothing is removed.

### `context/deployment/README.md`

Two edits, both additive:

1. **In `### Backend (.env)` (line 40-54)** — append to the code block:
   ```
   REVIEW_LOGIN_SECRET=                          # see "Review accounts" below
   REVIEW_LOGIN_EMAILS=review.reader@trackmyread.com,review.friend@trackmyread.com
   ```

2. **A new `## Review accounts` section**, inserted after `## Environment Variables` and before `## Database Migrations` (i.e. before line 70). Content:

   - What they are: two allowlisted `@trackmyread.com` accounts that log in with a shared secret instead of Google, for QA, screenshots and post-deploy checks. They are ordinary users in every other respect.
   - **The two env vars**, and the rule that `POST /auth/review-login` returns **404** unless both are set — so local dev and CI have it switched off by default, and switching it on is a deliberate act on Render.
   - **Every allowlisted address must end in `@trackmyread.com`**; anything else is ignored and gets a 401. A typo can never open login for a real user's Gmail.
   - Generate the secret:
     ```bash
     python -c "import secrets; print(secrets.token_urlsafe(32))"
     ```
     Set it in **Render → Environment**, and locally in `.env.review` at the repo root (gitignored via `.env.*`).
   - Get a token:
     ```bash
     curl -s -X POST https://book-tracker-stitch.onrender.com/auth/review-login \
       -H "Content-Type: application/json" \
       -d '{"email":"review.reader@trackmyread.com","secret":"<SECRET>"}'
     ```
   - Seed the two accounts:
     ```bash
     python scripts/seed_review_accounts.py --base-url https://book-tracker-stitch.onrender.com
     ```
     Idempotent — a second run reports `created 0`.
   - Log a browser in: open `https://www.trackmyread.com`, then in the console
     ```js
     localStorage.setItem('bt_token', '<access_token>'); location.href = '/home';
     ```
   - **Confirm which build is live** (the sprint-2 gap this closes):
     ```bash
     curl -s https://book-tracker-stitch.onrender.com/version
     # {"commit":"b8b6124…","service":"book-tracker-stitch","branch":"master"}
     ```
     Compare `commit` against `git rev-parse HEAD`.

   Do not touch the `## Known Issues` section — its `broadcast_push_notification` entry is sprint-2 Doc Sync's to update, not this sprint's.

## R5 — Tests

Two files. `TestReviewLogin` goes in `tests/test_auth.py` beside the other auth classes; `/version` gets its **own new file** `tests/test_version.py`, following the one-file-per-area convention the repo already uses (sprint 2 created `tests/test_scheduler.py` for a single test) — `/version` is not an auth route and does not belong in the auth file.

### Shared mechanics — the part that must not be got wrong

- Every test uses `monkeypatch.setenv` / `monkeypatch.delenv(..., raising=False)`. `monkeypatch` is function-scoped and reverts automatically at teardown, so **nothing leaks between tests** — that is the whole reason to use it rather than `os.environ[...] = ...`.
- **Each class gets an `autouse` fixture that deletes the relevant vars first**, so the suite behaves identically whether or not the developer's shell happens to have them set:
  ```python
  @pytest.fixture(autouse=True)
  def _clean_review_env(self, monkeypatch):
      monkeypatch.delenv("REVIEW_LOGIN_SECRET", raising=False)
      monkeypatch.delenv("REVIEW_LOGIN_EMAILS", raising=False)
  ```
  (and the same for `RENDER_GIT_COMMIT`, `RENDER_GIT_BRANCH`, `RENDER_SERVICE_NAME` in `test_version.py`).
- `conftest.py`'s in-memory DB is **shared for the whole run**, so **every test uses its own review email** (`review.new@`, `review.twice@`, …). No test depends on another test's row, and the file can be run in any order or alone.
- `SECRET = "test-review-secret-value"` as a module constant in the test file — a literal test value, not a real secret.

### `tests/test_auth.py` — new `class TestReviewLogin`

| Test | What it pins |
|---|---|
| `test_404_when_secret_unset` | only `REVIEW_LOGIN_EMAILS` set → 404, even with a correct-looking email |
| `test_404_when_emails_unset` | only `REVIEW_LOGIN_SECRET` set → 404 |
| `test_404_when_both_unset` | neither set → 404. The default state of local dev and CI. |
| `test_401_when_email_not_allowlisted` | both set, `stranger@trackmyread.com` + correct secret → 401 |
| `test_401_when_secret_wrong` | both set, allowlisted email + wrong secret → 401 |
| `test_401_bodies_are_identical` | the two responses above have the **same `detail`** — no enumeration |
| `test_401_when_allowlisted_email_is_gmail` | `REVIEW_LOGIN_EMAILS="review.reader@gmail.com"`, request that address with the **correct** secret → **401**, and `crud.get_user_by_email` finds no such user. The mistyped-env-var guard. |
| `test_200_creates_user_and_is_new_true` | first login → 200, `is_new is True`, and a `user` row now exists |
| `test_second_login_is_new_false` | same test calls the endpoint **twice** with its own unique email → `is_new` True then False, and the same `user["id"]` both times |
| `test_response_shape_matches_google_auth` | `set(body) == {"access_token","is_new","user"}` and `set(body["user"]) == {"id","name","email"}` — nothing extra, nothing missing |
| `test_name_derived_from_email_prefix` | `review.shape@trackmyread.com` → `user["name"] == "Review.Shape"` |
| `test_email_matched_case_insensitively` | allowlist holds the lowercase address; POST with `Review.Case@TrackMyRead.com` → 200, and a **second** POST with the lowercase form returns the **same `user["id"]`** and `is_new False`. Proves one row, not two. |
| `test_allowlist_entries_are_trimmed` | `REVIEW_LOGIN_EMAILS=" review.trim@trackmyread.com , other@trackmyread.com "` → 200 |
| `test_last_active_set_today` | after a 200, the `user` row's `last_active` is not None and `.date() == date.today()` (use the `db` fixture + `db.expire_all()` first, as `TestPublicDeleteAccountForm` does) |
| `test_token_works_on_profile_me` | `GET /profile/me` with `Authorization: Bearer <token from review-login>` → 200 and `body["email"]` is the review email. **The R5 headline test.** |
| `test_missing_body_field_is_422` | `{"email": …}` with no `secret` → 422. Documents the known behaviour rather than pretending it 404s. |

### `tests/test_version.py` — new file, `class TestVersion`

| Test | What it pins |
|---|---|
| `test_version_all_null_when_env_unset` | `{"commit": None, "service": None, "branch": None}` |
| `test_version_reflects_render_env` | `setenv` all three → the exact values come back under the right keys (catches a commit/branch swap) |
| `test_version_returns_exactly_three_keys` | `set(body) == {"commit","service","branch"}` — the no-env-dump guarantee |
| `test_version_requires_no_auth` | plain `client.get("/version")`, no header → 200 (not 401) |

`pytest tests -q` must be green. Baseline is **213** passing; this sprint adds ~20, so expect ~233.

## R6 — `dependency-map.md`

1. **Curated section — done now, by me.** A new `### Auth / review — POST /auth/review-login + GET /version` subsection has been added under "Contracts that must not drift". Its text:

   > Both routes are auth-level `NONE` in the generated table and carry ⚠️. That is correct and deliberate, not a gap.
   >
   > `POST /auth/review-login` is **gated by an env allowlist + a shared secret, and returns 404 when unconfigured** — with `REVIEW_LOGIN_SECRET` or `REVIEW_LOGIN_EMAILS` unset it behaves as if the route does not exist, which is the state of local dev, the test suite, and any fork. When configured, it accepts only addresses that are in `REVIEW_LOGIN_EMAILS` (comma-separated, trimmed, matched case-insensitively) **and** end in `@trackmyread.com`; everything else gets an identical 401, so the response cannot be used to enumerate the allowlist. The secret is compared with `hmac.compare_digest`. It returns the **same body as `POST /auth/google`** — `{access_token, is_new, user:{id,name,email}}` — and creates the account the same way (`secrets.token_urlsafe(32)` → `auth.hash_password` → `crud.create_user`), so review accounts are ordinary users and every downstream contract (`get_current_user`, `/profile/me`, the note-card shape) applies to them unchanged. No client calls it; the token is used by `curl`, by `scripts/seed_review_accounts.py`, and by pasting it into `localStorage.bt_token` for web screenshots.
   >
   > `GET /version` returns exactly `{commit, service, branch}` from `RENDER_GIT_COMMIT` / `RENDER_SERVICE_NAME` / `RENDER_GIT_BRANCH`, all `null` off Render. Unauthenticated on purpose: it is how a deploy is confirmed in one curl, which must not depend on login working. **Never add anything else to this response** — it is the one endpoint with no auth and no rate limit, so it must never read a secret, a database row, or `os.environ` wholesale.
   >
   > `/version` lives in `app/routers/meta_router.py` with **no `prefix=` argument**, not in `main.py`. `scripts/gen_dependency_map.py` only matches `@router.<verb>(`, so an `@app.get()` route in `main.py` is invisible to the map — which is why `GET /` has never appeared in it. Keep `/version` in a router.

2. **Generated appendix — the Builder runs `python scripts/gen_dependency_map.py` after the code lands.** Expected diff: the route count rises from 107 to 109; two new rows appear (`POST /auth/review-login` and `GET /version`, both `NONE` + ⚠️, both with `—` in each client column); every other row shifts only by line number. No existing route changes auth level, no consumer column changes, and the "Client calls with NO backend route" list is unaffected.

## Files to modify

| File | What |
|---|---|
| `app/routers/auth_router.py` | R1 — `hmac`/`os`/`secrets`/`Optional` imports, `ReviewLoginIn`, `_review_login_config()`, `review_login()` appended after line 145 |
| `app/routers/meta_router.py` | R2 — **new file**, ~20 lines, one route |
| `app/main.py` | R2 — `meta_router` added to the line-8 import list and one `include_router` call after line 84. Nothing else. |
| `scripts/seed_review_accounts.py` | R3 — **new file** |
| `.gitignore` | R4 — one line, `.env.*`, in the existing env block |
| `context/deployment/README.md` | R4 — two `REVIEW_LOGIN_*` lines in the backend `.env` block; new `## Review accounts` section before `## Database Migrations` |
| `tests/test_auth.py` | R5 — new `class TestReviewLogin` (~16 tests) |
| `tests/test_version.py` | R5 — **new file**, `class TestVersion` (4 tests) |
| `dependency-map.md` | R6 — curated `### Auth / review` subsection (done); generated appendix regenerated by the Builder |
| `features/auth/review-login/architecture.md` | this file |
| `features/auth/review-login/decisions/ADR-001-version-route-placement.md` | why `/version` is a router, not `main.py` |
| `context/LOAD_ME_FIRST.md` | Recently Shipped + the "deploys are now verifiable with `GET /version`" note (live-context rule) |

## Files NOT to touch

- **Both clients, entirely** — `book-tracker-frontend-stitch/` and `book-tracker-mobile-stitch/`, including both `src/services/api.js`, `LoginPage.jsx`, `LoginScreen.js`, and `app.json`. **No version / versionCode bump, no EAS build, no store release.** The review token is injected into `localStorage` by hand; no login UI is added anywhere (spec §Not building).
- `app/models.py` — no column, no table, no model change.
- `context/supabase_migration.sql` — **no migration; nothing to run in Supabase before this deploy.**
- `app/routers/auth_router.py :: google_auth`, `signup`, `login`, `request_account_deletion`, `delete_own_account` — R1 **adds** a handler beside them. Do not refactor `google_auth`'s find-or-create into a shared helper: it is the only login path real users have, and a shared helper would put this sprint's changes on that path. Duplicating twelve lines is the cheaper risk. `/auth/signup` and `/auth/login` stay exactly as they are — removing them is still the PM's call (spec §Not building).
- `app/deps.py`, `app/auth.py`, `app/crud.py` — all three are consumed as-is. `crud.create_user` is called, not modified.
- `app/main.py` beyond the two lines above — `GET /` at line 108, the CORS block, the startup/shutdown hooks and `custom_openapi` are untouched.
- `scripts/gen_dependency_map.py` — no regex change is needed once `/version` lives in a router. Do not "improve" it to also find `@app.get` routes; that would add a `GET /` row and is out of scope.
- `requirements.txt` — no new dependency. **The file is UTF-16-encoded; do not rewrite it.**
- `app/routers/googlebooks_router.py` — adding auth to `/api/googlebooks/*` is still the PM's decision (spec §Not building), and the seed script depends on the current behaviour.
- `app/notifications/config.py` and `dispatcher.py` — no new event type.
- Everything from sprints 1 and 2 — `books_router.py`, `push_router.py`, `notes_router.py`, `reading_activity_router.py`, `profile_router.py`, `admin_router.py`, `notifications/scheduler.py`. This sprint reads their behaviour; it changes none of it.
- `tests/conftest.py` — the new tests use the existing `client` and `db` fixtures. No new shared fixture is needed.
- `context/deployment/README.md :: ## Known Issues` — sprint-2 Doc Sync's to update.

---

## Security Review

**Why 404 when unconfigured.** The endpoint is a password login bolted onto an app that deliberately has none. The single most valuable property is that it is **off by default everywhere except the one environment the PM switched it on in**. Reading both env vars at request time and 404-ing when either is missing means: a fork gets nothing, a developer's laptop gets nothing, CI gets nothing, and a future contributor cannot accidentally ship a working backdoor by copying a `.env`. It also means the blast radius of the whole feature is bounded by one Render environment group.

**Why the domain guard.** `REVIEW_LOGIN_EMAILS` is a comma-separated string typed into a Render web form. A typo, a paste error, or a well-meaning "let me add my own address for testing" could put a **real user's Gmail** into the allowlist — and then anyone with the secret logs in as that real person, with full access to their library, private notes and account deletion. Requiring every entry to end in `@trackmyread.com` makes that failure mode structurally impossible: the worst a bad env var can do is create an allowlist that matches nothing. It is enforced at request time as a filter (not as a startup assertion) precisely because a startup crash on a typo would take the whole production API down — refusing one login is the correct failure, taking the site offline is not.

**Why constant-time comparison.** `payload.secret == configured_secret` short-circuits on the first differing byte, and the difference is measurable across many requests — especially against a single-worker free-tier instance. `hmac.compare_digest` compares in time independent of content. Both sides are encoded to UTF-8 bytes first so a non-ASCII `secret` in the request body cannot raise `TypeError` and turn into a 500, which would itself be an oracle. Length still leaks; that is inherent and irrelevant against 43 random characters.

**Why one 401 body for both failure modes.** Distinguishing "no such review account" from "wrong secret" would let anyone with the URL enumerate which addresses are allowlisted. Both branches are evaluated before a single `raise`, and the `detail` string is identical.

**Review users are ordinary users — say it out loud.** They can post publicly, and they will. A note posted by `review.reader` with `is_public: true` appears in `GET /notes/feed` for every user of the app, they show up in `GET /users/search`, and they are counted in `/admin/stats`. This is what the spec asked for — the point is to make the feed screenshots realistic — but it means the review accounts are visible to real users, and anyone with the secret can post to the public feed **as** those accounts. That is a defacement risk, not a data-breach risk: they hold no real person's data, and the seed content is fixed, dull and easily deleted. Hiding them from the community feed is explicitly deferred (spec §Not building); if it becomes a problem, the fix is a filter in `crud.get_notes_feed`, not a change to this endpoint.

**No rate limiting exists — the residual risk, stated plainly.** There is no rate limiting anywhere in this application, on any route, and this sprint does not add any. So `/auth/review-login` can be hit as fast as Render will serve it. The defence is entropy: `secrets.token_urlsafe(32)` is 256 bits rendered as 43 URL-safe characters, and online brute force against it is not merely impractical, it is arithmetically out of reach — a free-tier instance serving even 100 guesses per second would need on the order of 10^70 years. Each guess also costs a bcrypt verify only on success, so there is no cheap oracle. **What a leaked secret actually buys an attacker:** a login as an allowlisted review account, and nothing else — never a real user's account, because the allowlist is server-side and every entry is forced to the `@trackmyread.com` domain. The recovery from a leak is to rotate one Render env var; no user is affected and nothing needs migrating. The one thing that would change this calculus is a short or human-chosen secret, which is why the README documents `secrets.token_urlsafe(32)` as the only way to generate it.

**What `/version` leaks.** A commit SHA, a branch name, and a Render service name. The SHA is an opaque 40-hex identifier for a commit in the PM's own repository — it is not a credential, it does not grant read access to anything, and knowing it tells an attacker only which build is running. That last point is a genuine, if minor, disclosure: it lets someone correlate the live build with a known vulnerability if the repo ever becomes public. Against that sits the entire purpose of the endpoint — confirming a deploy in one unauthenticated request, which cannot be made to depend on authentication without defeating itself. The mitigation that matters is the shape being frozen at exactly three keys: **no `os.environ` iteration, no `SECRET_KEY`, no `DATABASE_URL`, no request echo, no database read.** That rule is now in the curated `dependency-map.md` so it survives the next person who wants to "just add the Python version".

**Reviewed and found safe**

- No existing endpoint gains, loses, or changes auth. No unauthenticated caller can reach anything that was previously authenticated.
- A review JWT is an ordinary 30-day HS256 token signed with the same `SECRET_KEY`; it grants exactly the review user's own rows. Every ownership check in every router applies to it unchanged, which is the reason the seed script is required to go through the API — using it exercises the real authorisation path instead of bypassing it.
- The endpoint performs at most one `SELECT` by indexed email plus, on first login only, one `INSERT`. No unbounded query, no N+1, no push send in the request path.
- The generated password is never persisted in plaintext, never logged and never returned. The handler logs nothing at all — no email, no secret, no `print`. (Note the contrast with `google_auth`, which `print`s verification results; do not copy that part.)
- `include_in_schema=False` removes the route from `/openapi.json` and `/docs`. Treat that as tidiness, not security — the path is in a public git repo.

**Known, accepted disclosure.** A request with a malformed body returns FastAPI's **422 before the handler runs**, even on a server where the feature is switched off — so a probe can distinguish `/auth/review-login` (422) from a genuinely absent path (404). The route name is in the public repository anyway, so this reveals nothing an attacker could not read, and closing it would mean making both body fields optional and hand-rolling validation, which is a worse trade. Documented rather than fixed.

## Assumptions

- **Assumption:** `REVIEW_LOGIN_EMAILS` will contain only the two `@trackmyread.com` review addresses, and no real user has ever registered with a `@trackmyread.com` address. *If a real person's account did use that domain and their address were added to the allowlist, the secret would log in as them — the domain guard bounds the risk to addresses the project controls, so the PM must keep the domain's mailboxes under the project's control.*
- **Assumption:** Render injects `RENDER_GIT_COMMIT`, `RENDER_GIT_BRANCH` and `RENDER_SERVICE_NAME` into this service. These are the names Render documents, and the backend deploys from a git repo rather than an image. *If wrong, `/version` returns `null`s instead of the commit — the endpoint still works, and the fix is a name change in one dict, no schema or client impact.*
- **Assumption:** `email.split("@")[0].title()` is the intended `name` derivation — the spec's own example (`"Review.Reader"`) confirms it. *If the PM wants "Review Reader" with a space, replace the dot before `.title()`; one line, no contract change.*
- **Assumption:** reading the env vars per request is acceptable overhead. `os.getenv` is a dict lookup; at TrackMyRead's volume this is free, and it is what makes the feature monkeypatchable in tests and togglable on Render without a code deploy.
- **Assumption:** the Google Books search for a title-plus-author query returns the intended novel as `results[0]`. The router's re-ranking already biases towards fiction with covers and sensible page counts (`googlebooks_router.py:_novel_score`). *If a search returns the wrong edition or nothing, the script reports `[FAILED]` for that book and exits 1 — it never guesses. Swapping the query string is a one-line fix, and the idempotency check keys on `google_id`, so a corrected query simply adds the right book next to the wrong one; delete the wrong one through the UI.*
- **Assumption:** the "Review Circle" stays public (`is_private: false`). The single-call `join` path in step 9 depends on it. *If it is made private, switch to invite + accept with the membership guard described in R3 step 9.*
- **Assumption:** `conftest.py`'s shared in-memory database persists for the whole run. The new tests are written to be order-independent anyway (each uses its own review email), so this assumption costs nothing if it changes.
- **Assumption:** the PM will set the two env vars on Render **after** the code deploys. Until then `/auth/review-login` returns 404 in production and the Done Checklist's production steps cannot run — this is the intended sequence, not a bug. `GET /version` works the moment the deploy lands, with no configuration at all.

## Open Questions for PM

**None.** The spec closed every decision it raised, and nothing in the code opened a new one. **No database migration is required** — `context/supabase_migration.sql` is not edited and nothing needs to be run in Supabase before this deploy.

Three items are flagged for visibility rather than decision, all already covered by the spec's §Not building:
1. Review accounts are visible in the public community feed and in admin stats. Deferred by the spec; the fix, if ever wanted, is a filter in `crud.get_notes_feed`.
2. `/auth/signup` and `/auth/login` are now fully redundant — this endpoint is the only reason anyone needed them. Recommend removing them next sprint.
3. One action is required from the PM after deploy: set `REVIEW_LOGIN_SECRET` (generated with `python -c "import secrets; print(secrets.token_urlsafe(32))"`) and `REVIEW_LOGIN_EMAILS` in Render → Environment. The README section written in R4 is the copy-paste source.

---

## Build Notes

**What was built:** R1–R6 exactly as specced above. `POST /auth/review-login` and `GET /version`
land byte-for-byte as the Technical Brief writes them. `scripts/seed_review_accounts.py` seeds
both review accounts through the public API only. `tests/test_auth.py::TestReviewLogin` (32
tests) and the new `tests/test_version.py::TestVersion` (7 tests) implement every case T01–T39
from `tests.md`, in the order the plan requires (T29 immediately after T28). `context/deployment/README.md`
gained the `## Review accounts` section. `dependency-map.md` was regenerated.

**Files changed:**
- `app/routers/auth_router.py` — additive: `hmac`/`os`/`secrets`/`Optional` module imports,
  `ReviewLoginIn`, `_review_login_config()`, `TRACKMYREAD_DOMAIN`, `review_login()`. Zero lines
  changed inside `google_auth`, `signup`, `login`, `request_account_deletion`, `delete_own_account`.
- `app/routers/meta_router.py` — new file (20 lines), `GET /version`, no `prefix=`.
- `app/main.py` — two lines: `meta_router` added to the routers import list; one
  `app.include_router(meta_router.router)` call. Nothing else changed.
- `scripts/seed_review_accounts.py` — new file. Plain `requests` client; imports nothing from
  `app/`; no `sqlmodel`/`sqlite3`/`create_engine`/`DATABASE_URL`.
- `tests/test_auth.py` — additive: new `class TestReviewLogin` (32 tests) + its imports
  (`os`, `date`, `select`, `func`, `auth`, `crud`, `models`). `TestSignup`, `TestLogin`,
  `TestPublicDeleteAccountForm` unchanged.
- `tests/test_version.py` — new file, `class TestVersion` (7 tests).
- `context/deployment/README.md` — two `REVIEW_LOGIN_*` lines in the backend `.env` block (empty
  secret value) + new `## Review accounts` section between `## Environment Variables` and
  `## Database Migrations`. `## Known Issues` untouched.
- `dependency-map.md` — curated `### Auth / review` subsection (pre-existing, Architect-authored)
  survived regeneration; generated appendix now shows 109 routes (was 107); both new routes appear
  as `NONE` + ⚠️ with `—`/`—` in the client columns.
- `features/auth/review-login/code-map.md` — new, from the template.
- `.gitignore` — **not touched by the Builder**; it already contained `.env.*` before this sprint
  (done by the orchestrator ahead of the build).

**Migration:** none. No column, no table, no `context/supabase_migration.sql` change. Nothing to
run in Supabase before this deploy — confirmed by `git diff -- app/models.py context/supabase_migration.sql`
being empty.

**Rollback:** revert the commit(s) touching the files listed above. No data migration to reverse;
any review-account rows created in production are ordinary `user` rows and can be deleted like
any other account, or simply left — they cannot be reached once the two Render env vars are unset
(the route reverts to 404).

### Diverged From Brief

| What | Brief said | Built | Why |
|---|---|---|---|
| `scripts/seed_review_accounts.py` CLI | `--base-url` only | `--base-url` **and** `--env-file` (default: repo-root `.env.review`) | Orchestrator instruction, given ahead of the build, so the missing-secret path (tests.md T41) is testable without touching the real `.env.review`. Secret resolution order is otherwise unchanged: `REVIEW_LOGIN_SECRET` env var first, then the file at `--env-file`. |

### Assumptions

Same as the architecture's own Assumptions section above — none added by the Builder. The
"Google Books search returns the intended novel as `results[0]`" assumption was exercised at the
edge the architecture already anticipated: see the smoke-test note below.

### Explicitly Not Built

- No client change of any kind (spec §Not building; verified: `git diff --name-only` shows nothing
  under either client directory).
- No password/OTP login UI in either client.
- `/auth/signup` / `/auth/login` removal — still the PM's call.
- Auth on `/api/googlebooks/*` — still the PM's call.
- Hiding review accounts from the community feed / admin stats — deferred per spec.
- Rate limiting — none exists anywhere in the app; not added here (documented risk acceptance in
  the Security Review above).

### Local smoke test (2026-09-13)

Backend started on port 8765 with `REVIEW_LOGIN_SECRET=local-throwaway-not-a-real-secret`,
`REVIEW_LOGIN_EMAILS=review.reader@trackmyread.com,review.friend@trackmyread.com`,
`SECRET_KEY=local-dev`.

- `GET /version` → `200 {"commit":null,"service":null,"branch":null}` (correct off-Render).
- `POST /auth/review-login` with the right secret → `200` + token, `is_new` then `False` on a
  second call. With the wrong secret → `401 {"detail":"Invalid review credentials"}`. The
  both-vars-unset → `404` leg is covered by the automated `test_404_when_both_env_vars_unset`
  (part of the 252 green tests) rather than re-run manually against this server, to avoid
  restarting the server the orchestrator asked to be left running.
- `scripts/seed_review_accounts.py --base-url http://127.0.0.1:8765`, run twice: the mutual
  follow, the Review Circle, the friend's membership and the group post are all created on the
  first run and correctly reported `[skipped]` on the second (`created 0` for every step that
  does not depend on a book). Both review accounts log in with `is_new: False` and identical ids
  across runs.
- **Google Books search failed for all 6 lookups on both runs** — `GOOGLE_BOOKS_API_KEY` is not
  set in this local environment (`WARNING: GOOGLE_BOOKS_API_KEY not set` at backend startup). The
  script reported `[FAILED] <email> search for '<query>' returned no results` for each of the six
  fixed queries and correctly exited `1` both times rather than half-seeding silently. Every
  step that does not depend on a book (login, mutual follow, Circle, membership, group post) still
  ran and is idempotent; every step that does depend on a book (progress, rating, the two notes)
  did not run because no userbook existed to attach them to. This is an environment limitation,
  not a script defect — re-run with `GOOGLE_BOOKS_API_KEY` set (or against Render, which has the
  key) to seed the books.
- **Bug found and fixed in this sprint's own new file:** the seed script's final summary line used
  Unicode box-drawing characters and two note strings used an em-dash; on this Windows console
  (`cp1252`, no `PYTHONIOENCODING`) that raised `UnicodeEncodeError` *after* all API calls had
  already completed, so the run crashed with a Python traceback instead of printing its summary.
  Fixed by replacing them with plain ASCII in `scripts/seed_review_accounts.py`. No other file was
  touched.
- **Two pre-existing, unrelated issues hit and worked around for the smoke test only (no source
  file changed for either):**
  1. `app/main.py`'s startup hook and `create_tables.py` both `print()` a checkmark emoji, which
     raises the same `UnicodeEncodeError` on this console when `PYTHONIOENCODING` is not set —
     this crashed the FastAPI app at startup before `PYTHONIOENCODING=utf-8` was added to the
     smoke-test invocation. Pre-existing code; out of scope (not in "Files to modify").
  2. The local `book_tracker.db` (untracked dev data) predated a schema change and was missing
     `user.profile_picture`, so the first `POST /auth/review-login` 500'd inside
     `crud.get_user_by_email`. Deleted the stale local file and reran `create_tables.py` to get a
     fresh schema matching current `models.py`. This is throwaway local dev data per the
     orchestrator's own note ("untracked local dev data; acceptable"), not a tracked or production
     file.

### Ready-for-QA checklist

- [x] all screen states implemented — not applicable, no UI (spec confirms)
- [x] `pytest tests -q` green — 252 passed, 0 failed
- [ ] web build passes — not applicable, no web file touched
- [x] migration appended + flagged — not applicable, no migration needed this sprint (confirmed empty diff)
- [ ] `app.json` bumped if mobile touched — not applicable, mobile untouched
- [ ] notification: config entry + every placeholder supplied + `fire_event` only — not applicable, no new event type
