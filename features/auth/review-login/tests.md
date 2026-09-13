---
screen: review-login
feature: auth
test_plan_written: 2026-09-13
last_run: 2026-09-13
pass_rate: 72/77
written_by: Senior QA (before Builder; no build code exists yet — only shipped pre-sprint code was read, to state current behaviour where the plan requires it)
sources: spec.md (APPROVED, R1–R6), architecture.md (PM-approved Technical Brief), decisions/ADR-001-version-route-placement.md, dependency-map.md (curated "Auth / review"), tests/conftest.py, tests/test_auth.py, features/maintenance/sprint-2-audit-bugs/tests.md, features/_templates/screen-tests.md
baseline: 213 tests collected, 107 routes in the generated map (both verified 2026-09-13, pre-build)
---

## How to read this plan

Every case gives exact steps and an exact expected result. "Expected" is what the spec and the
architecture promise — not what the code does today (today there is no code at all; this plan was
written before the Builder started). Where a case is automatable, the pytest function the Builder
must create is named as `file :: Class :: name`.

Severity: **Critical** = privacy / ownership / auth bypass / data loss / feature dead.
**Major** = core flow broken. **Minor** = cosmetic or defensive.
Priority: P0 = ship blocker. P1 = fix within sprint. P2 = nice to have.

**This feature is a password login bolted onto an app that deliberately has none.** Every case
that guards the door is Critical and must never be downgraded. Specifically:

- **the unconfigured-404 cases** (T01–T05) — if any of these returns anything but 404, the
  endpoint is live in local dev, in CI and in every fork
- **the domain-guard cases** (T09, T10) — if these return 200, a typo in a Render env var opens
  login for a real person's Gmail
- **the wrong-secret case** (T07) and **the prefix / superstring secret cases** (T11, T12) — if
  any of these returns 200 the secret comparison is not a comparison
- **ownership** (T30) and **mass assignment** (T28) — the standard invariants of this codebase

### The one thing that is not a test but must be true

`os.getenv` must be called **inside** the request handler, never at module import. `app.main` is
imported by `tests/conftest.py:11` at collection time, long before any test runs; a module-level
`REVIEW_LOGIN_SECRET = os.getenv(...)` freezes whatever the developer's shell had and makes
`monkeypatch` a no-op — every 404 case below would pass for the wrong reason and every 200 case
would fail mysteriously. T29 and T39 are the two cases that catch it.

---

## Test Cases

| # | Case | Priority | Severity | Status | Notes |
|---|---|---|---|---|---|
| **R1 — `POST /auth/review-login`** | | | | | |
| T01 | Both env vars unset → `404` | P0 | **Critical** | PASS | 1 passed |
| T02 | Only `REVIEW_LOGIN_SECRET` set → `404` | P0 | **Critical** | PASS | 1 passed |
| T03 | Only `REVIEW_LOGIN_EMAILS` set → `404` | P0 | **Critical** | PASS | 1 passed |
| T04 | `REVIEW_LOGIN_SECRET="   "` (blank after strip) → `404` | P0 | **Critical** | PASS | 1 passed |
| T05 | `REVIEW_LOGIN_EMAILS=" , , "` (no entries after parse) → `404` | P0 | **Critical** | PASS | 1 passed |
| T06 | Both set, email not on the allowlist, correct secret → `401` | P0 | **Critical** | PASS | 1 passed |
| T07 | Both set, allowlisted email, wrong secret → `401` | P0 | **Critical** | PASS | 1 passed |
| T08 | T06 and T07 return a byte-identical body | P0 | **Critical** | PASS | 1 passed |
| T09 | Allowlist holds `someone@gmail.com`, that address + **correct** secret → `401`, no user row | P0 | **Critical** | PASS | 1 passed |
| T10 | Allowlist holds a lookalike domain (`x@trackmyread.com.evil.io`) + correct secret → `401` | P0 | **Critical** | PASS | 1 passed |
| T11 | Secret that is a **prefix** of the real one → `401` | P0 | **Critical** | PASS | 1 passed |
| T12 | Secret that has the real one as a prefix (real + `"x"`) → `401` | P0 | **Critical** | PASS | 1 passed |
| T13 | `{"secret": ""}` with a configured server → `401` (**not** 422) | P0 | Major | PASS | 1 passed |
| T14 | `secret` key absent from the body → `422` | P1 | Minor | PASS | 1 passed |
| T15 | Non-ASCII / emoji secret → `401`, never `500` | P0 | Major | PASS | 1 passed |
| T16 | 10 000-character email and secret → `401`, never `500` | P1 | Minor | PASS | 1 passed |
| T17 | Happy path → `200`, `is_new is True`, `name == "Review.Reader"` | P0 | **Critical** | PASS | 1 passed |
| T18 | Body is exactly `{access_token, is_new, user:{id,name,email}}` | P0 | **Critical** | PASS | 1 passed |
| T19 | Second call, same email → `is_new is False`, same `user.id` | P0 | Major | PASS | 1 passed |
| T20 | `" Review.Reader@TrackMyRead.com "` → `200`, **same id** as the lowercase call, one row | P0 | **Critical** | PASS | 1 passed |
| T21 | Allowlist entries are trimmed and case-folded (` A@… , B@… `) → `200` | P0 | Major | PASS | 1 passed |
| T22 | `name` uses `.title()` not `.capitalize()` | P1 | Minor | PASS | 1 passed |
| T23 | Returned token → `GET /profile/me` `200`, `email` matches | P0 | **Critical** | PASS | 1 passed |
| T24 | Returned token → `GET /userbooks/` `200` and `[]` | P0 | Major | PASS | 1 passed |
| T25 | `user.last_active` is not None and `.date() == date.today()` | P1 | Major | PASS | 1 passed |
| T26 | `auth.verify_password(secret, user.password_hash)` is **False** | P0 | **Critical** | PASS | 1 passed |
| T27 | Created review user has `is_admin is False` | P0 | **Critical** | PASS | 1 passed |
| T28 | Extra body fields (`is_admin`, `id`, `name`) are ignored | P0 | **Critical** | PASS | 1 passed |
| T29 | `404` again **after** a successful 200 test, with the vars removed | P0 | **Critical** | PASS | 1 passed |
| T30 | Review token cannot `PATCH` Alice's userbook → `404`, row unchanged | P0 | **Critical** | PASS | 1 passed |
| T31 | `/auth/review-login` absent from `GET /openapi.json` | P2 | Minor | PASS | 1 passed |
| T32 | `GET /auth/review-login` → `405` even when unconfigured | P2 | Minor | PASS | 1 passed |
| **R2 — `GET /version`** | | | | | |
| T33 | No env → exactly `{"commit": null, "service": null, "branch": null}` | P0 | Major | PASS | 1 passed |
| T34 | All three Render vars set → echoed under the right keys | P0 | Major | PASS | 1 passed |
| T35 | Exactly three keys — no extras | P0 | **Critical** | PASS | 1 passed |
| T36 | No `Authorization` header → `200` (not 401) | P0 | Major | PASS | 1 passed |
| T37 | No other env var (`SECRET_KEY`, `DATABASE_URL`, a decoy) appears in the body | P0 | **Critical** | PASS | 1 passed |
| T38 | Only `RENDER_GIT_COMMIT` set → commit echoed, other two `null` | P1 | Minor | PASS | 1 passed |
| T39 | Two calls either side of a `setenv` give different answers | P1 | Major | PASS | 1 passed |
| **R3 — seed script** | | | | | |
| T40 | `seed_review_accounts.py --help` exits `0` and documents `--base-url` | P1 | Major | PASS | help output shows --base-url |
| T41 | No secret in env and no `.env.review` → exit `2`, clear stderr, **no HTTP request** | P0 | Major | PASS | exit=2, no connection error |
| T42 | grep: no secret-shaped literal anywhere in the script | P0 | **Critical** | PASS | no literal found (exit=1) |
| T43 | grep: no `from app`, `import app`, `sqlmodel`, `sqlite3`, `create_engine`, `DATABASE_URL` | P0 | **Critical** | PASS | no imports found (exit=1) |
| T44 | grep: `.env.review` is resolved from the **repo root**, not the cwd | P1 | Major | PASS | Path(__file__).resolve().parent.parent pattern confirmed |
| T45 | grep: both account constants end in `@trackmyread.com` | P1 | Major | PASS | READER, FRIEND both @trackmyread.com |
| T46 | grep: the script never opens `.env.review` for writing | P1 | Minor | PASS | no write patterns found (exit=1) |
| T47 | Two consecutive runs against a live server → second reports `created 0`, exit `0` | P0 | Major | **BLOCKED** | Live environment; orchestrator verifies after deploy |
| **R4 — git hygiene + deployment README** | | | | | |
| T48 | `.gitignore` contains `.env.*` **and** still contains the bare `.env` | P0 | **Critical** | PASS | .env, .env.local, .env.* all present (lines 19-21) |
| T49 | `git check-ignore .env.review` prints `.env.review`, exit `0` | P0 | **Critical** | PASS | properly ignored, exit=0 |
| T50 | `git ls-files` lists no `.env*` file | P0 | **Critical** | PASS | no .env files tracked (exit=1) |
| T51 | README has a `## Review accounts` section | P1 | Major | PASS | section found at line 72 |
| T52 | That section names **both** env vars | P1 | Major | PASS | REVIEW_LOGIN_SECRET (2x), REVIEW_LOGIN_EMAILS (3x) |
| T53 | It gives the secret-generation command (`secrets.token_urlsafe(32)`) | P1 | Major | PASS | command documented at line 87 |
| T54 | It gives the seed command and the token curl | P1 | Major | PASS | both commands present (lines 101, 79) |
| T55 | It gives the `localStorage.setItem('bt_token'` line | P1 | Major | PASS | line present at 107 |
| T56 | It gives the `/version` deploy-verification curl | P1 | Minor | PASS | curl at line 112 |
| T57 | The backend `.env` block gained both `REVIEW_LOGIN_*` keys with an **empty** secret value | P0 | **Critical** | PASS | REVIEW_LOGIN_SECRET= (empty), documented |
| T58 | `## Known Issues` in the README is untouched | P2 | Minor | PASS | broadcast_push_notification not in diff (exit=1) |
| **R6 — dependency map** | | | | | |
| T59 | `gen_dependency_map.py` exits `0` and prints `109 routes` (was 107) | P0 | Major | PASS | 109 routes reported |
| T60 | Generated table has `POST /auth/review-login ⚠️ | NONE` from `auth_router.py` | P0 | Major | PASS | row found with ⚠️ NONE |
| T61 | Generated table has `GET /version ⚠️ | NONE` from `meta_router.py` — not `/auth/version` | P0 | Major | PASS | /version from meta_router.py:10 |
| T62 | The curated `### Auth / review` section survives regeneration and explains both ⚠️s | P0 | Major | PASS | curated section present and complete |
| T63 | No pre-existing row changed auth level, path or consumers | P0 | **Critical** | PASS | 0 deletions in dependency-map.md |
| **Regression** | | | | | |
| T64 | `POST /auth/google` handler byte-unchanged | P0 | **Critical** | PASS | 0 deletions in key functions |
| T65 | `TestSignup` + `TestLogin` pass unmodified | P0 | Major | PASS | 8 passed |
| T66 | `TestPublicDeleteAccountForm` passes unmodified | P0 | **Critical** | PASS | 2 passed |
| T67 | Full suite: `0 failed`, collected ≥ 213 + new | P0 | Major | PASS | 252 collected, 252 passed |
| T68 | No sprint-1 / sprint-2 test was deleted or rewritten | P0 | Major | PASS | only test_auth.py and test_version.py changed |
| T69 | `app/main.py` diff is exactly two lines | P1 | Minor | PASS | exactly 2 lines added |
| T70 | `requirements.txt` unchanged | P0 | **Critical** | PASS | no diff |
| T71 | `app/models.py` and `context/supabase_migration.sql` unchanged | P0 | **Critical** | PASS | no diff |
| T72 | No file under either client directory changed | P0 | **Critical** | PASS | grep exit=1 (no files) |
| T73 | `scripts/gen_dependency_map.py` unchanged | P1 | Minor | PASS | no diff |
| **Live — BLOCKED** | | | | | |
| T74 | Done Checklist 1 — curl 200 / 401 / 404 against the deployment | P0 | **Critical** | **BLOCKED** | Live environment; orchestrator verifies after deploy |
| T75 | Done Checklist 2 — seed twice, second run `created 0` | P0 | Major | **BLOCKED** | Live environment; orchestrator verifies after deploy |
| T76 | Done Checklist 3 — local web screenshots into `qa/screenshots/2026-09-13-local/` | P1 | Major | **BLOCKED** | Live environment; orchestrator verifies after deploy |
| T77 | Done Checklist 4 — prod `/version` == `git rev-parse HEAD`, seed, screenshots, sprint-2 live checks 1–4 | P0 | **Critical** | **BLOCKED** | Live environment; orchestrator verifies after deploy |

**Total: 77 cases.** 39 automated pytest (T01–T39), 33 shell / grep / git (T40–T46, T48–T73),
5 blocked live checks (T47, T74–T77).

---

## Detailed Cases

### Shared mechanics for R1 and R2 — get this wrong and the whole plan is theatre

**Module constant in `tests/test_auth.py`** (a literal test value, never a real secret):

```python
REVIEW_SECRET = "test-review-secret-value"
```

**Every class gets an autouse fixture that deletes the vars first**, so the suite behaves the same
whether or not the developer's shell happens to have them set:

```python
@pytest.fixture(autouse=True)
def _clean_review_env(self, monkeypatch):
    monkeypatch.delenv("REVIEW_LOGIN_SECRET", raising=False)
    monkeypatch.delenv("REVIEW_LOGIN_EMAILS", raising=False)
```

and the same for `RENDER_GIT_COMMIT`, `RENDER_GIT_BRANCH`, `RENDER_SERVICE_NAME` in
`tests/test_version.py`. `monkeypatch` is function-scoped and reverts at teardown — that is the
entire reason to use it rather than `os.environ[...] = ...`.

**Every test uses its own review email.** `conftest.py`'s in-memory DB is shared for the whole
run, so `review.new@`, `review.twice@`, `review.case@`, … — no test may depend on a row another
test created, and every test must pass when run alone with `-k`.

**A helper for the configured state**, used by every 401/200 case:

```python
def _configure(monkeypatch, emails, secret=REVIEW_SECRET):
    monkeypatch.setenv("REVIEW_LOGIN_SECRET", secret)
    monkeypatch.setenv("REVIEW_LOGIN_EMAILS", emails)
```

---

### R1 — `POST /auth/review-login` · `tests/test_auth.py :: TestReviewLogin`

#### T01 — both env vars unset → 404 · P0 / **Critical**
**Steps:** with the autouse fixture having deleted both vars, `POST /auth/review-login`
`{"email": "review.reader@trackmyread.com", "secret": "anything"}`.
**Expected:** `404`. Body `{"detail": "Not Found"}`. This is the state of local dev, of the test
suite and of any fork — if it is anything else, an unconfigured server has a live password login.
`test_404_when_both_env_vars_unset`

#### T02 — only the secret set → 404 · P0 / **Critical**
**Steps:** `monkeypatch.setenv("REVIEW_LOGIN_SECRET", REVIEW_SECRET)` only. POST a
correct-looking email with the correct secret.
**Expected:** `404`. Not 401 — a half-configured server is an unconfigured server.
`test_404_when_only_secret_set`

#### T03 — only the allowlist set → 404 · P0 / **Critical**
**Steps:** `setenv("REVIEW_LOGIN_EMAILS", "review.reader@trackmyread.com")` only. POST that email
with any secret.
**Expected:** `404`. `test_404_when_only_emails_set`

#### T04 — a blank secret env var → 404 · P0 / **Critical**
**Steps:** `setenv("REVIEW_LOGIN_SECRET", "   ")` and a valid `REVIEW_LOGIN_EMAILS`. POST that
email with `{"secret": "   "}` — i.e. a caller who has guessed the blank value.
**Expected:** `404`, **never 200**. The config read strips the value, so a whitespace-only secret
is an unset secret. `test_404_when_secret_is_blank`

#### T05 — an allowlist of separators only → 404 · P0 / **Critical**
**Steps:** `setenv("REVIEW_LOGIN_EMAILS", " , , ")`, valid secret. POST anything.
**Expected:** `404`. The parse drops empties, so the list is empty, so the route is unconfigured.
`test_404_when_allowlist_is_only_separators`

#### T06 — email not on the allowlist → 401 · P0 / **Critical**
**Steps:** `_configure(monkeypatch, "review.reader@trackmyread.com")`. POST
`{"email": "stranger@trackmyread.com", "secret": REVIEW_SECRET}` — right domain, right secret,
wrong address.
**Expected:** `401`, `detail == "Invalid review credentials"`. Then `db.expire_all()` and
`crud.get_user_by_email(db, "stranger@trackmyread.com")` is `None` — a rejected login must never
create a row. `test_401_when_email_not_allowlisted`

#### T07 — wrong secret → 401 · P0 / **Critical**
**Steps:** `_configure(monkeypatch, "review.wrongsecret@trackmyread.com")`. POST that email with
`{"secret": "not-the-secret"}`.
**Expected:** `401`, `detail == "Invalid review credentials"`, and no `review.wrongsecret@…` row
exists afterwards. `test_401_when_secret_wrong`

#### T08 — the two 401 bodies are identical · P0 / **Critical**
**Steps:** in one test, issue the T06 request and the T07 request against the same configured
allowlist. Capture both responses.
**Expected:** `r1.status_code == r2.status_code == 401` **and** `r1.json() == r2.json()`. If the
bodies ever differ — "unknown email" vs "bad secret", a different `detail`, a different key set —
anyone with the URL can enumerate which addresses are allowlisted. Assert on the whole JSON, not
just on `detail`. `test_401_bodies_are_identical_for_bad_email_and_bad_secret`

#### T09 — an allowlisted non-`@trackmyread.com` address is refused · P0 / **Critical**
This is the case that decides whether a typo in a Render web form can hand a stranger a real
person's account.
**Steps:**
1. `monkeypatch.setenv("REVIEW_LOGIN_EMAILS", "someone@gmail.com")`
2. `monkeypatch.setenv("REVIEW_LOGIN_SECRET", REVIEW_SECRET)`
3. `POST /auth/review-login` `{"email": "someone@gmail.com", "secret": REVIEW_SECRET}` — the
   **correct** secret, for the address that is literally in the allowlist.
**Expected:** `401` with the standard `detail`. **Never 200, never a token, under any
circumstance.** Then `db.expire_all()`; `crud.get_user_by_email(db, "someone@gmail.com")` is
`None`. Also assert `"access_token" not in r.json()`.
`test_401_when_allowlisted_email_is_not_trackmyread_domain`

#### T10 — a lookalike domain is refused · P0 / **Critical**
**Steps:** `setenv("REVIEW_LOGIN_EMAILS", "x@trackmyread.com.evil.io")`, correct secret, POST that
address.
**Expected:** `401`, no row. The guard must be `endswith("@trackmyread.com")`, never
`"trackmyread.com" in email`. Run the mirror assertion too: an address
`review.sub@mail.trackmyread.com` is also refused (it does not end in `@trackmyread.com`).
`test_401_when_allowlisted_domain_is_a_lookalike`

#### T11 — a secret that is a prefix of the real one → 401 · P0 / **Critical**
**Steps:** `_configure(monkeypatch, "review.prefix@trackmyread.com")`. POST that email with
`{"secret": REVIEW_SECRET[:-1]}`.
**Expected:** `401`. A `startswith`, a truncating comparison, or a comparison of the first N bytes
would return 200 here. `test_401_when_secret_is_a_prefix_of_the_real_one`

#### T12 — a secret with the real one as a prefix → 401 · P0 / **Critical**
**Steps:** same setup; POST `{"secret": REVIEW_SECRET + "x"}`.
**Expected:** `401`. Together with T11 this pins an exact, whole-value comparison in both
directions. `test_401_when_secret_has_the_real_one_as_a_prefix`

#### T13 — an empty secret in the body → 401 · P0 / Major
**The brief asks which the spec specifies: it is 401, not 422.** The architecture pins the body
model as `secret: str` with no `min_length` and no validator, so `""` is a *valid* string; it
reaches the handler and fails `hmac.compare_digest` against a non-empty configured secret.
**Steps:** `_configure(monkeypatch, "review.empty@trackmyread.com")`. POST
`{"email": "review.empty@trackmyread.com", "secret": ""}`.
**Expected:** `401`, standard `detail`, no row created. If the Builder returns 422 here they have
added a `min_length` the architecture does not have — that is a contract change and must be
escalated, not absorbed into the test. (Contrast T04: an empty *env* secret gives 404, because an
unset secret means the feature is off.) `test_401_when_secret_is_empty_string`

#### T14 — `secret` key missing → 422 · P1 / Minor
**Steps:** `_configure(...)`; POST `{"email": "review.nosecret@trackmyread.com"}` with no
`secret` key.
**Expected:** `422` from FastAPI validation, **before** the handler runs. Repeat with both env
vars **unset**: still `422`, not `404`. This is documented in the architecture's Security Review
as a known, accepted disclosure (a probe can tell the route exists), not a bug — the test exists
so nobody later "fixes" it into a 404 by hand-rolling validation.
`test_422_when_secret_field_missing`

#### T15 — a non-ASCII secret must not 500 · P0 / Major
**Steps:** `_configure(monkeypatch, "review.unicode@trackmyread.com")`. POST that email with
`{"secret": "🔑пароль"}`.
**Expected:** `401`. **Never 500.** `hmac.compare_digest` raises `TypeError` when handed a `str`
containing non-ASCII, and a `TypeError` in a FastAPI handler becomes a 500 — which is itself an
oracle telling an attacker their input reached the comparison. The handler must encode both sides
to UTF-8 bytes first. `conftest.py` builds its client with `raise_server_exceptions=True`, so a
`TypeError` surfaces as a raised exception rather than a 500 response — assert the status code is
401 and let any exception fail the test naturally.
`test_401_when_secret_is_non_ascii_never_500`

#### T16 — absurdly long inputs → 401, never 500 · P1 / Minor
**Steps:** `_configure(...)`. POST `{"email": "a" * 10000 + "@trackmyread.com", "secret": "b" * 10000}`.
**Expected:** `401`, no row, no exception, response inside a second.
`test_401_for_absurdly_long_email_and_secret`

#### T17 — the happy path · P0 / **Critical**
**Steps:**
1. `_configure(monkeypatch, "review.reader@trackmyread.com")`
2. `POST /auth/review-login` `{"email": "review.reader@trackmyread.com", "secret": REVIEW_SECRET}`
**Expected:** `200`. `body["is_new"] is True` (identity, not truthiness — `1` is not `True`).
`body["access_token"]` is a non-empty string. `body["user"]["email"] == "review.reader@trackmyread.com"`.
`body["user"]["name"] == "Review.Reader"` — exactly that, with the dot and both capitals.
`body["user"]["id"]` is an int. `test_200_happy_path_is_new_true_and_name_title_cased`

#### T18 — the response shape is `/auth/google`'s, exactly · P0 / **Critical**
**Steps:** as T17 with `review.shape@trackmyread.com`.
**Expected:** `set(body) == {"access_token", "is_new", "user"}` and
`set(body["user"]) == {"id", "name", "email"}`. Nothing extra — no `password_hash`, no `username`,
no `is_admin`, no `last_active`, no raw SQLModel dump. Nothing missing. Assert with `==` on the
key sets, never with `in`. `test_response_shape_matches_google_auth_exactly`

#### T19 — second call is not new · P0 / Major
**Steps:** `_configure(monkeypatch, "review.twice@trackmyread.com")`. POST twice in the same test.
**Expected:** first `200` with `is_new is True`; second `200` with `is_new is False`;
`r1["user"]["id"] == r2["user"]["id"]`. Both tokens are valid.
`test_second_login_returns_is_new_false_and_same_user_id`

#### T20 — email matched case- and whitespace-insensitively, and only one row results · P0 / **Critical**
The architecture names this the single most likely implementation bug: `crud.get_user_by_email` is
an exact `==` with no case folding (`crud.py:13`), so a handler that skips normalisation creates a
**second** user row for the same person with a `review.case1` username collision fallback.
**Steps:**
1. `_configure(monkeypatch, "review.case@trackmyread.com")` — the allowlist holds the **lowercase**
   address.
2. `POST` `{"email": "  Review.Case@TrackMyRead.com  ", "secret": REVIEW_SECRET}` (leading and
   trailing spaces, mixed case).
3. `POST` again with the plain lowercase `review.case@trackmyread.com`.
**Expected:** step 2 → `200`, `is_new is True`, `user["email"] == "review.case@trackmyread.com"`
(stored lowercase, not as sent). Step 3 → `200`, `is_new is False`, **the same `user["id"]`**.
Then `db.expire_all()` and count rows: `len(db.exec(select(models.User).where(func.lower(models.User.email) == "review.case@trackmyread.com")).all()) == 1`.
`test_email_matched_case_and_whitespace_insensitively`

#### T21 — allowlist entries are trimmed and case-folded · P0 / Major
**Steps:** `setenv("REVIEW_LOGIN_EMAILS", " Review.Trim@TrackMyRead.com , other@trackmyread.com ")`,
valid secret. POST `review.trim@trackmyread.com`.
**Expected:** `200`. The parse is: split on `,` → `strip()` → `lower()` → drop empties.
`test_allowlist_entries_are_trimmed_and_lowercased`

#### T22 — `.title()`, not `.capitalize()` · P1 / Minor
**Steps:** `_configure(monkeypatch, "review.namecheck@trackmyread.com")`, POST it.
**Expected:** `user["name"] == "Review.Namecheck"`. `.capitalize()` would give
`"Review.namecheck"` and is wrong. `test_name_uses_title_not_capitalize`

#### T23 — the token works on `GET /profile/me` · P0 / **Critical**
The headline case: it proves the review token is indistinguishable from a Google token to
`get_current_user`, which is what makes every downstream contract apply unchanged.
**Steps:**
1. `_configure(monkeypatch, "review.profile@trackmyread.com")`, POST → `token`.
2. `GET /profile/me` with `{"Authorization": f"Bearer {token}"}`.
**Expected:** `200`. `body["email"] == "review.profile@trackmyread.com"`. `body["id"]` equals the
`user["id"]` from step 1. `test_token_works_on_profile_me`

#### T24 — the token works on `GET /userbooks/` and the library is empty · P0 / Major
**Steps:** `_configure(monkeypatch, "review.empty.library@trackmyread.com")`, POST → `token`;
`GET /userbooks/` with that bearer token.
**Expected:** `200` and the body is exactly `[]` — a brand-new review account owns nothing, and
(with T30) sees nothing of anyone else's. Compare with `== []`, not `len(...) == 0`, so a
list-of-someone-else's-books fails loudly.
`test_token_works_on_userbooks_and_returns_empty_list`

#### T25 — `last_active` is stamped · P1 / Major
**Steps:** `_configure(monkeypatch, "review.active@trackmyread.com")`, POST → `200`. Then
`db.expire_all()` (as `TestPublicDeleteAccountForm` does — the handler's session is a different
`Session` on the same shared in-memory DB) and
`user = crud.get_user_by_email(db, "review.active@trackmyread.com")`.
**Expected:** `user.last_active is not None` and `user.last_active.date() == date.today()`.
`test_last_active_set_to_today`

#### T26 — the review secret is not the account password · P0 / **Critical**
**Steps:** `_configure(monkeypatch, "review.pwd@trackmyread.com")`, POST → `200`. `db.expire_all()`;
fetch the row.
**Expected:**
- `auth.verify_password(REVIEW_SECRET, user.password_hash)` is **False**
- `auth.verify_password("review.pwd@trackmyread.com", user.password_hash)` is **False**
- `user.password_hash` is a non-empty string that does **not** contain `REVIEW_SECRET` as a
  substring

If any of these fails, the shared secret has become a per-account password: `POST /auth/login`
with the review email and the shared secret would then work, and the secret would be usable
against a route this feature never touched. The account is created with a fresh
`secrets.token_urlsafe(32)` that is hashed and discarded — it has no usable password at all.
`test_password_hash_is_not_the_review_secret`

#### T27 — a review account is an ordinary, non-admin user · P0 / **Critical**
**Steps:** as T26 with `review.notadmin@trackmyread.com`; fetch the row.
**Expected:** `user.is_admin is False`. Then `GET /admin/stats` with the review token → `403`.
`test_review_user_is_not_admin`

#### T28 — extra body fields are ignored · P0 / **Critical**
**Steps:** `_configure(monkeypatch, "review.extra@trackmyread.com")`. POST
```json
{"email": "review.extra@trackmyread.com", "secret": "<REVIEW_SECRET>",
 "is_admin": true, "id": 1, "name": "Injected", "username": "root"}
```
**Expected:** `200`. `body["user"]["name"] == "Review.Extra"` — derived from the email, **not**
`"Injected"`. `body["user"]["id"]` is the newly created id, not `1`. After `db.expire_all()`, the
row's `is_admin is False`. Mass assignment is a standing invariant of this codebase and is always
Critical. `test_extra_body_fields_are_ignored`

#### T29 — the env does not leak between tests · P0 / **Critical**
This case must be **defined after** at least one 200-returning test in the class; pytest runs
tests in definition order, so it executes with the previous test's `monkeypatch` already torn
down. Place it immediately after T28's function.
**Steps:** do not configure anything — rely solely on the autouse `_clean_review_env` fixture.
Assert first that `os.getenv("REVIEW_LOGIN_SECRET") is None` and
`os.getenv("REVIEW_LOGIN_EMAILS") is None`. Then `POST /auth/review-login` with the email and
secret that succeeded in the previous test.
**Expected:** `404`. A `401` here means the allowlist survived and only the secret was cleared; a
`200` means neither was cleared and every 404 case in this file is passing for the wrong reason.
Either way the plan's guarantees are void until it is fixed.
`test_404_again_after_a_successful_login_when_env_removed`

#### T30 — ownership: a review token gets the review user's rows and nothing else · P0 / **Critical**
**Steps:**
1. Create a book and a userbook owned by Alice via the `db` fixture:
   ```python
   from app import models
   alice = _make_user(db, email="rl_owner@example.com", name="Alice")
   book = models.Book(title="Ownership Probe", author="QA"); db.add(book); db.commit(); db.refresh(book)
   ub = models.UserBook(user_id=alice.id, book_id=book.id, status="reading", rating=None)
   db.add(ub); db.commit(); db.refresh(ub)
   ```
2. `_configure(monkeypatch, "review.owner@trackmyread.com")`, POST → review `token`.
3. `PATCH /userbooks/{ub.id}` `{"rating": 5}` with the review bearer token.
4. `DELETE /userbooks/{ub.id}` with the review bearer token.
**Expected:** step 3 → `404` (never 200, never 403-with-a-write). Step 4 → `404`. Then
`db.expire_all()`; re-fetch the row: it still exists, `rating is None`, `status == "reading"`.
A review token is an ordinary user token and every ownership check in every router applies to it
unchanged — this is exactly why the seed script is required to go through the public API.
`test_review_token_cannot_mutate_another_users_userbook`

#### T31 — the route is not advertised in the OpenAPI schema · P2 / Minor
**Steps:** `GET /openapi.json`.
**Expected:** `200`, and `"/auth/review-login" not in r.json()["paths"]`. This is tidiness, not
security (the path is in a public repo) — `include_in_schema=False`. Note that `/version` **is**
expected to be present: `meta_router` carries no such flag.
`test_route_absent_from_openapi_schema`

#### T32 — wrong method → 405, even unconfigured · P2 / Minor
**Steps:** with both env vars unset, `GET /auth/review-login`.
**Expected:** `405 Method Not Allowed`. This documents the same accepted disclosure as T14 — the
route is registered even when switched off, and a probe can tell. Recorded so it is a known
property, not a surprise in a later security review.
`test_get_on_review_login_is_405_not_404`

---

### R2 — `GET /version` · `tests/test_version.py :: TestVersion` (new file)

`/version` is not an auth route and does not belong in `tests/test_auth.py`; the repo already uses
one file per area (`tests/test_scheduler.py` holds a single feature's tests). The autouse fixture
here deletes `RENDER_GIT_COMMIT`, `RENDER_GIT_BRANCH` and `RENDER_SERVICE_NAME`.

#### T33 — all null off Render · P0 / Major
**Steps:** with all three vars deleted, `GET /version` (no headers).
**Expected:** `200` and `r.json() == {"commit": None, "service": None, "branch": None}` — compare
the **whole dict**, not key by key. This is what a developer's machine and CI must see.
`test_version_all_null_when_env_unset`

#### T34 — the Render vars are echoed under the right keys · P0 / Major
**Steps:** `setenv("RENDER_GIT_COMMIT", "b8b6124abcdef")`,
`setenv("RENDER_SERVICE_NAME", "book-tracker-stitch")`, `setenv("RENDER_GIT_BRANCH", "master")`.
`GET /version`.
**Expected:** `r.json() == {"commit": "b8b6124abcdef", "service": "book-tracker-stitch", "branch": "master"}`.
Three deliberately distinct values — a commit/branch swap in the dict literal is the exact bug
this catches, and identical placeholder values would hide it.
`test_version_reflects_render_env_vars`

#### T35 — exactly three keys · P0 / **Critical**
**Steps:** set all three vars as in T34, `GET /version`.
**Expected:** `set(r.json()) == {"commit", "service", "branch"}`. This is the no-env-dump
guarantee: `/version` is the one endpoint with no auth and no rate limit, so the shape is frozen.
Anything added later — a Python version, an uptime, a DB status — is a contract break, and the
curated `dependency-map.md` section says so.
`test_version_returns_exactly_three_keys`

#### T36 — no auth required · P0 / Major
**Steps:** `client.get("/version")` with **no** `Authorization` header. Then repeat with
`{"Authorization": "Bearer garbage"}`.
**Expected:** `200` both times, same body. Not `401`, not `403`. Confirming a deploy must not
depend on login working — that is the whole point of the endpoint.
`test_version_requires_no_auth`

#### T37 — no other environment variable leaks · P0 / **Critical**
**Steps:**
1. `monkeypatch.setenv("REVIEW_LOGIN_SECRET", "leak-canary-review-secret")`
2. `monkeypatch.setenv("DATABASE_URL", "postgresql://leak-canary-db")`
3. `monkeypatch.setenv("BT_DECOY_ENV", "leak-canary-decoy")`
4. Set the three Render vars as in T34.
5. `GET /version`; take `blob = r.text`.
**Expected:** `200`; none of `"leak-canary-review-secret"`, `"leak-canary-db"`,
`"leak-canary-decoy"` appears in `blob`; `os.environ["SECRET_KEY"]` (set by `conftest.py:6`) does
not appear in `blob`; and neither do the key names `SECRET_KEY`, `DATABASE_URL`,
`REVIEW_LOGIN_SECRET`. A handler that iterates `os.environ` or returns a filtered-by-prefix dump
fails here even if T35 somehow passed. `test_version_leaks_no_other_env_var`

#### T38 — partial Render env · P1 / Minor
**Steps:** set only `RENDER_GIT_COMMIT`. `GET /version`.
**Expected:** `{"commit": "<value>", "service": None, "branch": None}`. An image-based deploy
leaves the git pair unset, and `null` is the correct answer, not an error and not `""`.
`test_version_partial_env_returns_null_for_the_rest`

#### T39 — the env is read per request, not at import · P1 / Major
**Steps:** in one test: `GET /version` with nothing set → capture body A;
`monkeypatch.setenv("RENDER_GIT_COMMIT", "second-read")`; `GET /version` again → body B.
**Expected:** `A["commit"] is None` and `B["commit"] == "second-read"`. If both are `None`, the
module read `os.getenv` at import time, the value is frozen at collection time, and T33/T34 are
passing by coincidence. `test_version_read_per_request_not_at_import`

---

### R3 — the seed script · shell + grep (not pytest)

Run from the repo root with `.venv\Scripts\python.exe`. The script must be a plain API client: it
imports nothing from `app/`, opens no database connection, and hard-codes no secret.

#### T40 — `--help` works · P1 / Major
**Command:** `.venv\Scripts\python.exe scripts\seed_review_accounts.py --help`
**Expected:** exit `0`; the output names `--base-url` and shows its default
(`http://127.0.0.1:8000`). No traceback, no network call, no secret required to print help — if
`--help` demands a secret, the secret check runs before `argparse`, which is wrong.

#### T41 — no secret anywhere → exit non-zero, before any request · P0 / Major
**Steps (Git Bash, repo root):**
```
mv .env.review .env.review.bak 2>/dev/null; true
REVIEW_LOGIN_SECRET= .venv/Scripts/python.exe scripts/seed_review_accounts.py --base-url http://127.0.0.1:9 ; echo "exit=$?"
mv .env.review.bak .env.review 2>/dev/null; true
```
Port 9 is chosen because nothing listens there — a connection error proves a request was made.
**Expected:** `exit=2` (the architecture's configuration/usage code; any non-zero passes the
spec's "exit non-zero", but 2 is what the brief specifies). stderr contains a message naming the
missing variable, e.g. `REVIEW_LOGIN_SECRET not set (env or .env.review)`. The output must **not**
contain a connection error, a traceback, `ConnectionRefused`, or `Max retries exceeded` — the
script must fail before it makes a single HTTP request. Nothing is printed that looks like a
secret.

#### T42 — no secret-shaped literal in the script · P0 / **Critical**
**Commands:**
```
grep -nE "(secret|token|password|passwd|pwd)[^=\n]*=\s*['\"][A-Za-z0-9_\-]{16,}['\"]" scripts/seed_review_accounts.py
grep -nE "['\"][A-Za-z0-9_\-]{25,}['\"]" scripts/seed_review_accounts.py
```
**Expected:** the first prints **nothing**. The second may print only obviously non-secret
strings — a URL, a fixed note sentence, a book title — and must print no 25+ character opaque
token. `REVIEW_LOGIN_SECRET` may appear **only** as an env-var key name inside `os.environ.get(...)`
/ the `.env.review` parser / an error message, never as an assigned value. Any hard-coded secret
is a Critical fail: the file is committed to a public repo.

#### T43 — the script never touches the database · P0 / **Critical**
**Command:**
```
grep -nE "^\s*(from|import)\s+(app|sqlmodel|sqlalchemy|sqlite3)|create_engine|DATABASE_URL|Session\(|book_tracker\.db" scripts/seed_review_accounts.py
```
**Expected:** **no output at all.** The whole contract of R3 is that every write goes through a
router that enforces its own ownership checks. A direct DB write bypasses exactly the code the
seeded data is meant to exercise, and it would also mean the script cannot run against Render at
all. Cross-check: `grep -c "requests\." scripts/seed_review_accounts.py` is greater than zero and
`grep -n "import requests" scripts/seed_review_accounts.py` prints one line.

#### T44 — `.env.review` is read from the repo root · P1 / Major
**Command:** `grep -n "env.review" scripts/seed_review_accounts.py`
**Expected:** the path is built from the script's own location —
`Path(__file__).resolve().parent.parent / ".env.review"` — not from `os.getcwd()`, not a bare
`open(".env.review")`, and not `~/.env.review`. A cwd-relative read silently finds nothing when
the script is run from `scripts/`, and the operator gets the T41 error instead of a seeded
account. Also assert `grep -n "load_dotenv\|python-dotenv" scripts/seed_review_accounts.py` prints
nothing — nothing in `app/` calls `load_dotenv` and this sprint does not introduce that
convention.

#### T45 — both accounts are on the project's own domain · P1 / Major
**Command:** `grep -nE "^(READER|FRIEND)\s*=" scripts/seed_review_accounts.py`
**Expected:** exactly two lines, `review.reader@trackmyread.com` and
`review.friend@trackmyread.com`. Any other domain would be refused by R1's domain guard at
runtime anyway (T09), so a mismatch here is a script that can never work.

#### T46 — the script never writes `.env.review` · P1 / Minor
**Command:** `grep -nE "open\([^)]*['\"]w|\.write_text\(|\.write\(" scripts/seed_review_accounts.py`
**Expected:** nothing that writes to `.env.review` or to any dotfile. The script reads
configuration; it never creates it, and it must never persist a secret it was handed.

#### T47 — two consecutive runs, second creates nothing · P0 / Major · **BLOCKED**
**Command:** `.venv\Scripts\python.exe scripts\seed_review_accounts.py --base-url http://127.0.0.1:8000`, twice.
**Expected (when run by the PM / orchestrator):** both runs exit `0`; the first prints a mix of
`[created]` lines; the second's summary line reads `created 0` with `failed 0`, and the printed
user ids are identical across the two runs. **BLOCKED locally** — it needs a running backend with
`REVIEW_LOGIN_*` configured, which by design does not exist on a QA machine. Do not substitute a
mock, do not mark it PASS from T40/T41.

---

### R4 — git hygiene and the deployment README · shell

Run from the repo root `C:\Users\sonal\Documents\projects\book-tracker`, in Git Bash, **after** the
Builder has committed. This repo's default branch is `master`, not `main`.

#### T48 — `.gitignore` covers every dotenv variant · P0 / **Critical**
**Command:** `grep -nE "^\.env" .gitignore`
**Expected:** the existing `.env` (line 19) and `.env.local` (line 20) are **still there** and a
new `.env.*` line has been added. `.env.*` does not match the bare `.env`, which is exactly why
the original line must not be removed or replaced. Nothing else in `.gitignore` changed:
`git diff HEAD~1 -- .gitignore` shows one added line and zero deletions.

#### T49 — `.env.review` is actually ignored · P0 / **Critical**
**Command:** `git check-ignore -v .env.review ; echo "exit=$?"`
**Expected:** prints `.gitignore:<n>:.env.*	.env.review` and `exit=0`. `git check-ignore` exits 1
when a path is **not** ignored — a `exit=1` with no output is a fail, and it means a real secret
can be committed by the next `git add -A`. Repeat for `.env.production` and `.env.staging`; both
must also be ignored.

#### T50 — no env file is tracked · P0 / **Critical**
**Command:** `git ls-files | grep -E "^\.env" ; echo "exit=$?"`
**Expected:** no output (`exit=1` from grep, which is the pass here — read the absence of output,
not the exit code). If `.env.review` is listed, it is **already in history**: the secret must be
rotated on Render and the file removed with `git rm --cached`, and that is an incident, not a
test fix.

#### T51 — the README has a Review accounts section · P1 / Major
**Command:** `grep -n "^## Review accounts" context/deployment/README.md`
**Expected:** exactly one match, positioned after `## Environment Variables` and before
`## Database Migrations` (confirm with `grep -n "^## " context/deployment/README.md` — the order
must read `… ## Environment Variables … ## Review accounts … ## Database Migrations …`).

#### T52 — both env var names are documented · P1 / Major
**Command:** `grep -c "REVIEW_LOGIN_SECRET" context/deployment/README.md` and the same for
`REVIEW_LOGIN_EMAILS`.
**Expected:** each ≥ 1 (each will be 2 — once in the `.env` block, once in the new section). The
section must also state in words that the route returns **404 unless both are set**, and that
every allowlisted address must end in `@trackmyread.com`.

#### T53 — the secret-generation command is given · P1 / Major
**Command:** `grep -n "token_urlsafe(32)" context/deployment/README.md`
**Expected:** at least one match, inside a copy-pasteable
`python -c "import secrets; print(secrets.token_urlsafe(32))"`. This is the only sanctioned way to
generate the secret — the entire no-rate-limiting risk assessment rests on 43 random characters,
and a human-chosen secret invalidates it.

#### T54 — the seed command and the token curl are given · P1 / Major
**Commands:** `grep -n "seed_review_accounts.py" context/deployment/README.md` and
`grep -n "auth/review-login" context/deployment/README.md`
**Expected:** both match. The curl shows `-X POST`, a `Content-Type: application/json` header and
a `{"email":…,"secret":…}` body with a **placeholder** (`<SECRET>`), never a real value.

#### T55 — the browser login line is given · P1 / Major
**Command:** `grep -n "localStorage.setItem('bt_token'" context/deployment/README.md`
**Expected:** one match, followed by the navigation to `/home`. This is the only way anyone logs a
browser in as a review account — no login UI is being built (spec §Not building), so if this line
is missing or the key name is wrong (`bt_token`, not `token`) the screenshots in Done Checklist 3
and 4 cannot be taken.

#### T56 — the deploy-verification curl is given · P1 / Minor
**Command:** `grep -n "/version" context/deployment/README.md`
**Expected:** a `curl` against `/version` with an example response, and the instruction to compare
`commit` with `git rev-parse HEAD`. This is the sprint-2 gap the feature exists to close.

#### T57 — the committed `.env` block carries no secret · P0 / **Critical**
**Command:** `grep -n "REVIEW_LOGIN_SECRET" context/deployment/README.md`
**Expected:** the line inside the backend `.env` code block is `REVIEW_LOGIN_SECRET=` with an
**empty** value (a trailing comment is fine). If a 40+ character value appears anywhere in the
README, a live secret has been committed to a public repo: rotate it on Render before anything
else. `REVIEW_LOGIN_EMAILS` may show the two real review addresses — those are not secrets.

#### T58 — `## Known Issues` untouched · P2 / Minor
**Command:** `git diff HEAD~1 -- context/deployment/README.md | grep -n "broadcast_push_notification"`
**Expected:** nothing. That entry belongs to sprint-2 Doc Sync; editing it here mixes two sprints'
work in one commit.

---

### R6 — the dependency map · shell

#### T59 — the generator runs clean · P0 / Major
**Command (repo root):** `.venv\Scripts\python.exe scripts\gen_dependency_map.py`
**Expected:** exit `0`, no traceback, and the printed summary reads `wrote dependency-map.md: 109
routes, …` — **109, up from the verified pre-build baseline of 107**. A count of 108 means one of
the two routes is invisible to the generator; a count of 107 means both are.

#### T60 — the review-login row exists and is marked ⚠️ NONE · P0 / Major
**Command:** `grep -n "auth/review-login" dependency-map.md`
**Expected:** a generated-table row of the form
``| POST | `/auth/review-login` ⚠️ | NONE | app/routers/auth_router.py:<n> | — | — |``.
**The ⚠️ and the `NONE` are the expected, correct result, not a finding** — the route is gated by
an env allowlist plus a secret and 404s when unconfigured. Both client columns must be `—`: no
`api.js` function calls it in either client, by design (spec §Not building). If a client function
appears here, the Builder added a login UI that was explicitly not in scope.

#### T61 — the `/version` row exists at `/version`, from `meta_router.py` · P0 / Major
**Command:** `grep -n "| GET | \`/version\`" dependency-map.md`
**Expected:** ``| GET | `/version` ⚠️ | NONE | app/routers/meta_router.py:<n> | — | — |``.
Three specific failure modes to check for, all from ADR-001:
- the path reads `/auth/version` → the route was put in `auth_router.py`, which has `prefix="/auth"`
- the path reads `/meta/version` → `meta_router` was declared with a `prefix=` argument, which also
  breaks the README's deploy-verification curl
- **no row at all** → the route was put in `main.py` as `@app.get(...)`, which the generator cannot
  see (this is why `GET /` has never appeared in the map). Confirm with
  `grep -n "app.get(\"/version\")" app/main.py` — expected: nothing.

Also `grep -rn "prefix" app/routers/meta_router.py` must print nothing.

#### T62 — the curated section survived regeneration · P0 / Major
**Command:** `grep -n "### Auth / review" -A 8 dependency-map.md`
**Expected:** the curated subsection is still present above the generated appendix and still
explains: the 404-when-unconfigured gate, the allowlist plus `@trackmyread.com` domain rule, the
identical 401, `hmac.compare_digest`, the shared shape with `/auth/google`, the frozen three-key
`/version` response, and the "keep `/version` in a router" rule. The generator rewrites only the
text after its marker — if the curated block is gone, the Builder pasted the generated output over
the file instead of running the script.

#### T63 — no pre-existing row changed · P0 / **Critical**
**Command:** `git diff -- dependency-map.md`
**Expected:** the diff adds exactly two route rows and shifts line numbers. **No existing row
changes its `Auth` column**, gains or loses a ⚠️, or changes a consumer cell. The
"Client calls with NO backend route" list, the "api.js functions nobody calls" list and the
"Fan-out" list are unchanged. Any other movement means an unrelated route was touched.

---

### Regression — nothing else may move

`dependency-map.md :: depended_by` lists **no consumer** for either new route, so the regression
surface is not "does a screen still render" but "is everything else still byte-identical".

#### T64 — `POST /auth/google` is untouched · P0 / **Critical**
**Command:** `git diff HEAD~1 -- app/routers/auth_router.py`
**Expected:** the diff is **purely additive**: new imports at the top, the `ReviewLoginIn` model,
`_review_login_config()`, `TRACKMYREAD_DOMAIN` and `review_login()`. **Zero deleted or modified
lines inside `google_auth`, `signup`, `login`, `request_account_deletion` or
`delete_own_account`.** In particular `google_auth`'s find-or-create must **not** have been
refactored into a shared helper with the new handler — duplicating twelve lines is the cheaper
risk, because `/auth/google` is the only login path real users have.

> **Coverage gap, flagged to the PM — not a finding against this sprint.** `grep -rn "auth/google" tests/`
> returns **nothing**: there is no automated test for `POST /auth/google` anywhere in the suite,
> and there never has been. "Existing tests still pass" is therefore an empty guarantee for that
> endpoint, and this git-diff check is the *only* regression evidence available. Writing a
> `/auth/google` test needs a mocked `google.oauth2.id_token.verify_oauth2_token`, which is out of
> this sprint's appetite (spec: simple, 1 day). **Recommend a `TestGoogleAuth` class next sprint**
> — it is the login path every real user depends on and it is completely untested.

#### T65 — the legacy auth tests still pass, unmodified · P0 / Major
**Command:** `.venv\Scripts\python.exe -m pytest tests/test_auth.py -q -k "TestSignup or TestLogin"`
then `git diff HEAD~1 -- tests/test_auth.py`.
**Expected:** all 8 pass. The diff to `tests/test_auth.py` adds `TestReviewLogin` and its imports
and **changes not one line** of `TestSignup`, `TestLogin` or `TestPublicDeleteAccountForm`. If an
existing test had to change, that is a contract change and must be escalated, not edited away.

#### T66 — `TestPublicDeleteAccountForm` still passes · P0 / **Critical**
**Command:** `.venv\Scripts\python.exe -m pytest tests/test_auth.py -q -k "TestPublicDeleteAccountForm"`
**Expected:** 2 passed. This class shares the file the new tests land in and uses the same
`db.expire_all()` pattern T25/T26 copy; a broken fixture or a leaked env var in the new class
shows up here first.

#### T67 — the full suite · P0 / Major
**Command:** `.venv\Scripts\python.exe -m pytest tests -q`
**Expected:** the summary ends `0 failed`, no errors, no new skips, no collection errors.
Collected count is **213 + 39 = 252** (213 verified pre-build on 2026-09-13; 32 new in
`TestReviewLogin`, 7 new in `TestVersion`). A count **below 213** means a test was deleted rather
than fixed — that is a fail regardless of the pass rate. A count below 252 means the Builder
skipped cases from this plan; list which.

#### T68 — sprint-1 and sprint-2 counts are unchanged · P0 / Major
**Commands:**
```
git diff --stat HEAD~1 -- tests/
.venv\Scripts\python.exe -m pytest tests -q --collect-only | tail -1
```
**Expected:** the only test files that change are `tests/test_auth.py` (additive) and the brand-new
`tests/test_version.py`. `tests/test_notes.py`, `test_reading_activity.py`, `test_admin.py`,
`test_scheduler.py`, `test_groups.py`, `test_books.py`, `test_follow_profile.py`,
`test_push_tokens.py`, `test_import.py` and `tests/conftest.py` show **zero** changed lines.
Sprint-1's and sprint-2's per-file counts are identical to their last recorded run. No new shared
fixture is needed in `conftest.py` — if one appears, ask why.

#### T69 — `app/main.py` gained exactly two lines · P1 / Minor
**Command:** `git diff HEAD~1 -- app/main.py`
**Expected:** one added name in the line-8 `from .routers import …` list, one added
`app.include_router(meta_router.router)`. `GET /` at line 108, the CORS block, the startup and
shutdown hooks and `custom_openapi` are untouched.

#### T70 — `requirements.txt` is unchanged · P0 / **Critical**
**Command:** `git diff HEAD~1 -- requirements.txt ; git diff --numstat HEAD~1 -- requirements.txt`
**Expected:** empty. No dependency is added — `requests==2.31.0` is already there. **The file is
UTF-16-encoded**; a careless rewrite corrupts it and breaks the Render build, which is a
production outage, not a lint issue. If the diff is non-empty, check the encoding with
`file requirements.txt` before anything else.

#### T71 — no schema change · P0 / **Critical**
**Command:** `git diff HEAD~1 -- app/models.py context/supabase_migration.sql`
**Expected:** empty. Review users are ordinary `user` rows; every column used already exists and is
already written by `/auth/google`. **Nothing needs to be run in Supabase before this deploy** — if
this diff is non-empty, the deploy order changes and the PM must be told before the push.

#### T72 — neither client changed · P0 / **Critical**
**Command:** `git diff --name-only HEAD~1 | grep -E "book-tracker-frontend-stitch|book-tracker-mobile-stitch"`
**Expected:** no output. No `api.js` function, no `LoginPage.jsx`, no `LoginScreen.js`, no
`app.json` version or versionCode bump, no EAS build, no store release. The review token is
injected into `localStorage` by hand.

#### T73 — the generator itself is unchanged · P1 / Minor
**Command:** `git diff HEAD~1 -- scripts/gen_dependency_map.py`
**Expected:** empty. Once `/version` lives in a router, no regex change is needed (ADR-001).
"Improving" it to also find `@app.get` routes would add a `GET /` row and is out of scope.

---

### Live checks — **BLOCKED locally.** PM / orchestrator runs these after deploy.

These are `spec.md` → Done Checklist 1–4. They cannot be run from a QA machine: items 1, 2 and 4
need `REVIEW_LOGIN_SECRET` and `REVIEW_LOGIN_EMAILS` set, which by design do not exist locally or
in CI, and item 4 needs the Render deployment plus the PM's env vars. Do **not** substitute
localhost for production, do **not** mark them PASS from their pytest equivalents, and do **not**
set the env vars in a QA shell to "unblock" them — that would also silently flip T01–T05.

Record each as `BLOCKED — PM verifies after deploy`, naming the local equivalent.

#### T74 — Done Checklist 1: the three curls · P0 / **Critical** · BLOCKED
Backend running with both vars set. `curl -X POST <base>/auth/review-login` with the right secret →
`200` + a token; with a wrong secret → `401`; with both vars unset → `404`.
*Local equivalents: T17, T07, T01.*

#### T75 — Done Checklist 2: the seed script is idempotent · P0 / Major · BLOCKED
`python scripts/seed_review_accounts.py --base-url http://127.0.0.1:8000`, twice. Second run's
summary reads `created 0`, `failed 0`, exit `0`, same two user ids.
*Local equivalent: T47 (also blocked); T40–T46 are the static substitutes.*

#### T76 — Done Checklist 3: local web screenshots · P1 / Major · BLOCKED
Web dev server; `localStorage.setItem('bt_token', <review token>)`; `/home` shows the feed with the
friend's notes, `/library` shows 3 books, `/groups` shows Review Circle. Screenshots into
`qa/screenshots/2026-09-13-local/`.
*No local equivalent — needs a seeded, configured backend and a browser.*

#### T77 — Done Checklist 4: production · P0 / **Critical** · BLOCKED
After the PM sets the env vars on Render: `GET /version` returns the pushed commit (compare with
`git rev-parse HEAD` — they must be equal); seed against Render; the same three screenshots against
`https://www.trackmyread.com` into `qa/screenshots/<date>-prod/`; then run sprint 2's live checks
1–4 (friends-feed order, own-note likes, private note absent from Circle activity, 12 consecutive
months) signed in as `review.reader`. Render's free tier sleeps after 15 minutes, so the first
request may take ~30s — a timeout there is not a failure, retry once.
*Local equivalents for the `/version` half: T33, T34.*

---

## Automated

`.venv\Scripts\python.exe -m pytest tests -q` — from the repo root.

| File | Class | Status | Covers |
|---|---|---|---|
| `tests/test_auth.py` | `TestReviewLogin` | **new** (32 tests) | R1 — T01–T32 |
| `tests/test_version.py` | `TestVersion` | **new file** (7 tests) | R2 — T33–T39 |
| `tests/test_auth.py` | `TestSignup`, `TestLogin`, `TestPublicDeleteAccountForm` | **unchanged** | T65, T66 |

### Expected pytest function names

**`tests/test_auth.py :: TestReviewLogin`** (define in this order — T29 depends on it)
- `test_404_when_both_env_vars_unset`
- `test_404_when_only_secret_set`
- `test_404_when_only_emails_set`
- `test_404_when_secret_is_blank`
- `test_404_when_allowlist_is_only_separators`
- `test_401_when_email_not_allowlisted`
- `test_401_when_secret_wrong`
- `test_401_bodies_are_identical_for_bad_email_and_bad_secret`
- `test_401_when_allowlisted_email_is_not_trackmyread_domain`
- `test_401_when_allowlisted_domain_is_a_lookalike`
- `test_401_when_secret_is_a_prefix_of_the_real_one`
- `test_401_when_secret_has_the_real_one_as_a_prefix`
- `test_401_when_secret_is_empty_string`
- `test_422_when_secret_field_missing`
- `test_401_when_secret_is_non_ascii_never_500`
- `test_401_for_absurdly_long_email_and_secret`
- `test_200_happy_path_is_new_true_and_name_title_cased`
- `test_response_shape_matches_google_auth_exactly`
- `test_second_login_returns_is_new_false_and_same_user_id`
- `test_email_matched_case_and_whitespace_insensitively`
- `test_allowlist_entries_are_trimmed_and_lowercased`
- `test_name_uses_title_not_capitalize`
- `test_token_works_on_profile_me`
- `test_token_works_on_userbooks_and_returns_empty_list`
- `test_last_active_set_to_today`
- `test_password_hash_is_not_the_review_secret`
- `test_review_user_is_not_admin`
- `test_extra_body_fields_are_ignored`
- `test_404_again_after_a_successful_login_when_env_removed`
- `test_review_token_cannot_mutate_another_users_userbook`
- `test_route_absent_from_openapi_schema`
- `test_get_on_review_login_is_405_not_404`

**`tests/test_version.py :: TestVersion`** (new file)
- `test_version_all_null_when_env_unset`
- `test_version_reflects_render_env_vars`
- `test_version_returns_exactly_three_keys`
- `test_version_requires_no_auth`
- `test_version_leaks_no_other_env_var`
- `test_version_partial_env_returns_null_for_the_rest`
- `test_version_read_per_request_not_at_import`

**Not automatable (run by hand):** T40–T46 (shell + grep on the seed script), T48–T58 (git and
README), T59–T63 (generator + git diff), T64, T68–T73 (git diff), and the blocked live checks T47,
T74–T77.

---

## Failing Tests

*(Junior QA fills this in after the run. One line per failure: test name, reason, disposition —
fix now / deferred to sprint N / accepted risk.)*

Expected at plan time: **all 39 pytest cases fail or error at collection until the Builder lands
the code** — the endpoints do not exist yet and `tests/test_version.py` is not written. That is the
correct state for a plan written before the build, not a finding.

---

## Notes for Junior QA

**Running the suite.** From the repo root `C:\Users\sonal\Documents\projects\book-tracker`:

```
.venv\Scripts\python.exe -m pytest tests -q
```

`tests/conftest.py:6` sets `SECRET_KEY` itself, so you do not need to export it or activate the
venv. Run from the repo root, not from `tests/`, or the `from tests.conftest import …` lines fail
to resolve. Narrow runs:

```
.venv\Scripts\python.exe -m pytest tests/test_version.py -q
.venv\Scripts\python.exe -m pytest tests/test_auth.py -q -k "TestReviewLogin"
.venv\Scripts\python.exe -m pytest tests -q -k "review_login or version"
```

**`REVIEW_LOGIN_SECRET` and `REVIEW_LOGIN_EMAILS` must NOT be set in the shell you run the suite
in.** This is the single most important thing on this page. Those variables switch the endpoint
on; if they are present in your environment, the autouse `_clean_review_env` fixture should delete
them for the duration of each test, but a suite that passes only because of that fixture is one
missing `@pytest.fixture(autouse=True)` away from silently flipping T01–T05 from 404 to 401 and
reporting green. Before you run anything, check and clear:

```
echo "[$REVIEW_LOGIN_SECRET] [$REVIEW_LOGIN_EMAILS]"      # Git Bash — expect "[] []"
unset REVIEW_LOGIN_SECRET REVIEW_LOGIN_EMAILS
```
```
echo "[$env:REVIEW_LOGIN_SECRET] [$env:REVIEW_LOGIN_EMAILS]"   # PowerShell — expect "[] []"
Remove-Item Env:REVIEW_LOGIN_SECRET, Env:REVIEW_LOGIN_EMAILS -ErrorAction SilentlyContinue
```

The same applies to `RENDER_GIT_COMMIT`, `RENDER_GIT_BRANCH` and `RENDER_SERVICE_NAME` for
`tests/test_version.py` — if your shell has them, T33 and T38 go red for the wrong reason. Never
"fix" a failing 404 case by setting or unsetting something in your shell: the fixture is supposed
to make the shell irrelevant, and if it does not, that is the bug.

**Never put a real secret anywhere in the test files.** `REVIEW_SECRET = "test-review-secret-value"`
is a module constant and a literal test value. If you ever see a 40+ character opaque string in a
test file, a README or the seed script, stop — that is a live credential in a public repo (T42,
T57), and it must be rotated on Render before anything else happens.

**Every test needs its own review email.** `conftest.py` uses one shared in-memory SQLite DB for
the whole run. Two tests that both log in as `review.reader@trackmyread.com` will disagree about
`is_new`, and the second one to run will fail intermittently depending on the order. Use
`review.<case>@trackmyread.com`. Every case in this plan must also pass when run **alone** with
`-k` — if one only passes in a full-suite run, it is depending on another test's row.

**`db.expire_all()` before reading a row the API just wrote.** The handler's session and the `db`
fixture's session are different `Session` objects over the same shared in-memory database;
without the expire you read a stale identity-map copy and T25/T26/T27/T28/T30 pass or fail at
random. `TestPublicDeleteAccountForm` is the pattern to copy.

**Git checks (T48–T50, T57–T58, T63–T64, T68–T73) run at the repo root, in Git Bash, after the
Builder has committed.** `grep` exiting 1 with no output is a **pass** for T50 and T43 — read the
absence of output, not the exit code. `git check-ignore` is the opposite: it exits **0** when the
path *is* ignored, and exit 1 with no output there is a **fail** (T49). This repo's default branch
is `master`, not `main`. `HEAD~1` in these commands assumes the Builder made one commit; if they
made several, use the commit before the first of the sprint.

**The seed-script checks are grep, not execution.** T42–T46 read the file; only T40 and T41 run it,
and T41 is specifically designed to run with nothing configured and no server. Do not start a
backend, do not create a `.env.review`, and do not put a secret in your shell to "make the script
work" — a successful seeding run is T47/T75 and it is BLOCKED for you.

**The live checks are BLOCKED — say so, do not approximate.** T47 and T74–T77 need a configured,
deployed backend. Record them as `BLOCKED — PM verifies on Render after deploy` and name the local
equivalent (T74 → T17/T07/T01; T77's `/version` half → T33/T34). Do not substitute localhost for
production, do not mark them PASS from the pytest equivalents, and do not attempt to configure the
env vars yourself.

**Two results that look like bugs and are not.** (1) `POST /auth/review-login` and `GET /version`
appear in the regenerated `dependency-map.md` with `⚠️` and auth `NONE` — that is the expected,
documented outcome (T60, T61), explained in the curated `### Auth / review` section. Do not file it
as an auth gap. (2) A malformed body returns `422` rather than `404` even on an unconfigured server
(T14), and `GET` on the path returns `405` (T32) — both are known, accepted disclosures recorded in
the architecture's Security Review.

**One coverage gap to carry forward, not to fix here.** There is no test anywhere in the suite for
`POST /auth/google` — the only login path real users have. T64 checks it by `git diff` alone. Note
it in `learnings.md` and escalate the recommendation (a `TestGoogleAuth` class with a mocked
`verify_oauth2_token`) to the PM for next sprint.

**If a Critical case fails, stop and escalate before running the rest.** A 200 from T09 (the domain
guard) or from T01–T05 (the unconfigured 404) means the feature must not be deployed at all —
report it immediately rather than finishing the sweep.

---

## Run 2026-09-13

Total 77 · PASS 72 · FAIL 0 · BLOCKED 5 · Verdict: PASS

**Full pytest suite summary:** 252 passed in 55.73s

All 39 automated pytest cases (T01–T39) passed. All 33 shell/grep/git cases (T40–T46, T48–T73) passed. 5 live cases (T47, T74–T77) marked BLOCKED for orchestrator verification after deploy.

## Live run 2026-09-13 17:14-17:25 IST (orchestrator, production)

Render keys set by PM; `POST /auth/review-login` -> 200 for review.reader (secret matches `.env.review`). `GET /version` -> `a224f4d`.

| Check | Result |
|---|---|
| Seed `scripts/seed_review_accounts.py --base-url <prod>` | PASS - created 19, skipped 0, failed 0 (6 books, progress, 2 ratings, 4 notes, mutual follow, Review Circle, group post). reader id 110, friend id 111 |
| Screenshots `qa/screenshots.mjs` (8 pages, desktop + mobile) | PASS - every page rendered logged-in (no redirect to `/`), 0 failed API calls. 1 console error per page: "Chrome does not support the Push API in incognito mode" - headless-browser artifact, not an app bug |
| Live checks `qa/live_checks.py` | PASS 15/15 - friends-feed mutual flag + newest-first, `/notes/me` real `liked_by_me`, private note absent from circle activity, 12 consecutive months (2025-10..2026-09), streak fields, anonymous `DELETE /books/1` -> 401. Self-cleaned (unlike + private note deleted, both 200) |

Blocked-live cases T47 and T74-T77 are covered by the run above. Not provable with two review accounts: mutual-before-non-mutual ordering (needs a third, non-mutual user; covered by pytest).

Observations outside the plan (not bugs in this feature):
- Some Google Books covers are Google's own "image not available" placeholder image (The Hobbit, Old Man and the Sea). It loads successfully, so the app's fallback cover never shows.
- Review-account notes are visible to real users in the Community feed (accepted in the spec; PM may want them hidden).
