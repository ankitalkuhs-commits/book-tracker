---
screen: sprint-4g-apple-signin
feature: auth
package: P1 + P2 — the column, the guard, token verification, the linking rule
built_by: Builder (branch `builder-4g-api`, worktree `.claude/worktrees/4g-api`)
built: 2026-10-06
base: `3f53bda` (docs only). Product commit: see "Commits and deploy order".
---

# Build notes — Sprint 4G, P1 + P2

## What was built

### P1 — the column, the guard, the PM step

| File | Change |
|---|---|
| `app/models.py:42` | `apple_sub: Optional[str] = Field(default=None, index=True, unique=True, max_length=255)`. Measured: `AutoString(length=255)`, nullable, unique, indexed — i.e. `VARCHAR(255)`, matching the SQL exactly. |
| `app/schema_guard.py` | `("user", "apple_sub")` appended; `REQUIRED_COLUMNS` is now 5 pairs. The comment states the deploy order in the same words the 4F block uses. |
| `context/PM_SQL_QUEUE.md` | **step 8** appended *after* step 7 and *before* "What Claude does with each answer" (K-14), plus its row in the answers table. |

`features/auth/index.md` is in P1's file list but **nothing was written to it**: no requirement names a
change, and its two known drifts (`DELETE` vs `POST` on the deletion route, the removed legacy
password routes) are explicitly Doc Sync's and must not ride along in this diff. Flagged rather
than silently skipped.

### P2 — verification and the linking rule

| File | Change |
|---|---|
| `app/apple_keys.py` (new, 188 lines) | `fetch_jwks()` (the single injectable seam), a TTL cache, `key_ids()`, `select_key()` with the **one-shot** refetch, and `verify_identity_token(token, nonce, audiences)`. Two exception types: `AppleKeysUnavailable` → 503, `AppleTokenInvalid` → one opaque 401. |
| `app/routers/auth_router.py` | `AppleAuthIn`, `_apple_config()`, `_coerce_apple_bool()`, `_apple_placeholder_email()`, `_user_by_apple_sub()` and `POST /auth/apple`, inserted between `bot_login`'s end and `request_account_deletion`. **Nothing was removed from this file** — the new `apple_keys` import is on its own line so the diff is additions only (ST-4G-05). `/auth/google` is untouched. |
| `tests/test_apple_auth.py` (new) | 63 collected tests: `TestAppleColumn` (B-32, B-32a, B-32b, B-38, B-39), `TestAppleTokenVerification` (B-01..B-13, 18), `TestAppleLinking` (B-20..B-36, 22 cases → 40 collected). |
| `tests/test_sql_artifacts.py` | `TestAppleSQL` appended (B-37), additions only. |
| `tests/fixtures/apple_jwks_snapshot.json` (new) | Apple's real **public** key document, captured 2026-10-06 with `curl -s https://appleid.apple.com/auth/keys`. Three RSA/sig/RS256 keys, no private members. |
| `.github/workflows/ci-tests.yml:61` | pytest floor raised, re-measured not typed (see "Gates"). |

**No new dependency.** `python-jose[cryptography]==3.3.0` and `requests` were already pinned;
`requirements.txt` is untouched and still UTF-16LE (`b'\xff\xfe'`).

## The PM SQL — step 8, and the deploy-order constraint

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS apple_sub VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_apple_sub ON "user" (apple_sub);
```

Verification the PM sends back:

```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_schema = current_schema() AND table_name = 'user' AND column_name = 'apple_sub';
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user' AND indexname = 'uq_user_apple_sub';
SELECT count(*) FROM "user" WHERE apple_sub IS NOT NULL;   -- must be 0
```

### Deploy order, in my own words

The guard entry and the SQL cannot travel together, and the reason is mechanical.
`app/schema_guard.py:39` tests the missing list and `:40-41` raises; `app/main.py:166` calls
`assert_migrated` inside the startup event, **before** `start_scheduler()` at `:168`. So the moment a
deploy carries `("user","apple_sub")` while PostgreSQL has no such column, the process raises on
startup, Render fails the deploy and the previous version keeps serving. That is the guard doing
exactly its job — and it is still a failed deploy somebody has to explain, in a sprint whose whole
point is that the column must exist before anything reads it.

Therefore:

1. **The PM runs step 8 first** and returns the three verification outputs. Nothing is deployed
   before that output exists.
2. **Then, and only then, `0ed0c4f` (or whatever the merge SHA is) may be deployed.** That one
   commit carries both halves of P1 — the model column and the guard entry — because
   `tests/test_local_day.py:1403-1413` iterates `REQUIRED_COLUMNS` and asserts each column exists
   on the model, so splitting them turns an existing test red (K-13, confirmed by measurement:
   156 passed with both halves added).
3. `APPLE_AUDIENCES` stays **unset** through that deploy. `POST /auth/apple` is a 404 until an
   operator sets it, so the route cannot be used by anybody — which is correct while no iOS build
   exists. Setting it is a separate, reversible step with no deploy.
4. P3's `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` are not this package's.

**Which commit is safe when:** the single product commit on this branch is safe to *merge* at any
time (it is inert: a nullable column on a model, and a route that 404s) and safe to *deploy* only
after step 8's output is in hand. There is no ordering requirement between it and `APPLE_AUDIENCES`
other than "the env var last".

## Decisions, and the three documents they came from

- **Branch 3 is the only branch that links**, and the link writes `apple_sub` and nothing else —
  not `email`, `name`, `username`, `bio`, `profile_picture`, `is_admin`, `is_private_profile` or
  `is_bot`. B-22 captures all eight before and compares after.
- **`_coerce_apple_bool`** accepts only `True` and `"true"` case-insensitively. Everything else —
  `"false"`, `"False"`, `"FALSE"`, `False`, `None`, absent, `""`, `"1"`, `1` — is not verified.
  Measured on this branch: `jwt.decode` returns `email_verified` as `<class 'str'>` `'false'`, and
  `bool("false")` is `True`.
- **The relay rule is the claim, with the domain as the floor** (pm-decisions addendum K-05).
  `is_relay = coerce(is_private_email) or email's domain == privaterelay.appleid.com`. The domain
  half is case-folded because a domain is case-insensitive; the email itself is **not** folded.
- **`private_relay: bool`** is in the response (pm-decisions addendum Q-1), additive.
- **The email claim is trimmed, never case-folded.** Branch 3 matches rows `/auth/google` created
  from the address Google asserted, and `auth_router.py:83` does no folding, so folding here would
  put a normalisation on one side of the comparison only. Not stated either way in the spec — this
  is a Builder decision and it is the conservative one.
- **The loser of a concurrent first sign-in gets 409** (`Apple account already linked`), via the
  `IntegrityError` → rollback → HTTP shape `follow_router.py:39-44` already uses. tests.md left the
  choice to the Builder; B-29 now asserts 409 as a literal.
- **Two commits on the create path, deliberately** (architecture §"Why not one transaction").
  Consequence I will name rather than hide: in the 409 race the loser's `user` row has already been
  committed by `crud.create_user`, so a duplicate row with `apple_sub IS NULL` survives. The reader
  is unaffected (their next sign-in matches the winner's row by `sub`), and cleaning it up would
  mean giving `crud.create_user` a `commit=` kwarg, which the architecture explicitly refuses.

## Gates

| Gate | Result |
|---|---|
| Baseline, this branch at `3f53bda` | `pytest tests -q --collect-only` → **715 collected** (matches tests.md) |
| G-4G-02 after | **779 collected, 779 passed** — see "Suite counts" |
| New collected | **64**, exactly tests.md's P1 (6) + P2 (58). By file: 63 in `tests/test_apple_auth.py` (5 column + 18 verification + 40 linking) + 1 in `tests/test_sql_artifacts.py::TestAppleSQL`. 715 + 64 = **779**; P3's 8 take it to the plan's 787 |
| G-4G-13 | `.github/workflows/ci-tests.yml:61` raised **715 → 779**, re-measured. `:111` (qa/unit 38) and `:150` (Android 121) are **not** mine and are left alone — P3 adds 8 and P4 adds 13, so the final sprint commit raises 61 again to 787 and 150 to 134 |
| ST-4G-01 (no Apple secret) | empty |
| ST-4G-02 (no `.p8`) | empty, both the tracked list and this diff |
| ST-4G-03 (`requirements.txt`) | no diff; first two bytes `b'\xff\xfe'` |
| ST-4G-04 (package disjointness) | the diff touches only P1's and P2's files plus the two the test plan assigns (`tests/test_sql_artifacts.py`, `tests/fixtures/apple_jwks_snapshot.json`) |
| ST-4G-05 (`/auth/google` untouched) | `git diff 5fc8ccc...HEAD -- app/routers/auth_router.py` has **0 removed lines** |
| ST-4G-06 | **three** hunks in `auth_router.py`, not two: the import, `AppleAuthIn` beside the other request models, and the route block. P3 adds a fourth near `delete_own_account`. The paragraph expects two because it did not count the import |
| ST-4G-07 (no bare except) | empty |
| G-4G-07 (the fixture is public) | three key objects, each `kty`/`kid`/`use`/`alg`/`n`/`e` only; no `d`/`p`/`q`/`dp`/`dq`/`qi` |
| qa/unit, Android | re-measured as baselines (38 and 121) and both unchanged by this package. Floors left alone deliberately |

## Suite counts

| Suite | Before | After | Command |
|---|---|---|---|
| pytest | **715 collected, 715 passed** (`3f53bda`, measured here) | **779 collected, `779 passed`, 0 failed, 0 errors** | `.venv\Scripts\python -m pytest tests -q` |
| qa/unit | 38 / 38 | 38 / 38, untouched | `node --test "qa/unit/*.test.mjs"` |
| Android | 121 / 121 | 121 / 121, untouched — and green **with** `@router.post("/apple")` present, which is RG-4G-02 from the P2 side | `node --test "__tests__/*.test.mjs"` |

Wall clock is not a useful number on this machine and nobody should read one into a regression:
the first full run reported 21:12 and the final one 5:25:22, while CPU time for both was about
550 s. Two reasons, neither of them code: this laptop idles/sleeps between agent turns, and
`tests/test_local_day.py::TestClockIndependence` spawns **nested** `pytest` subprocesses (five
parametrised cases, each with a `timeout=300` child run), so most of the suite's work is in child
processes and the parent's own CPU figure understates it. If you are checking whether the suite is
hung, look for a child `python -m pytest` and for CPU accumulating in it, not in the parent.

The Android suite needs `NODE_PATH` pointed at **`book-tracker-mobile-stitch/node_modules`** of the
main checkout, not at the repo-root `node_modules`: `@babel/parser` exists only under the mobile
package, and the root path gives `# tests 30, # fail 9` with `Cannot find module '@babel/parser'`
on eight files. tests.md's `baseline_measured` note says only "the main checkout's node_modules",
which is how a Builder loses an hour.

**One existing test had to be rescued, and it is worth reading:** the first full run came back
`1 failed, 778 passed` — `tests/test_bots.py::TestAdminMetrics::test_admin_lists_carry_is_bot`.
Nothing about Apple broke it. It reads `/admin/users?limit=200` and asserts its own two accounts
are in the page; the 64 new cases add about 90 `user` rows, which pushed its bot (id 271) off the
end of that page. **An existing test broken by volume, not by behaviour.** Editing it is not an
option (R-08), so `tests/test_apple_auth.py` now carries a module-scoped autouse teardown that
deletes exactly the rows it created (`4g-%` and the branch-5 placeholders) and nothing else.
Verified: `pytest tests/test_apple_auth.py tests/test_bots.py::TestAdminMetrics -q` -> 67 passed.
**P3 and P4 should expect the same trap** — any package that adds tens of users to this suite
breaks that test unless it cleans up after itself.

## Mutation-proof table (G-4G-08)

Procedure per row: apply the one-line change to the named product file, run **only** the named
node ids, record the first red line, `git checkout -- <file>`, confirm green. Driven by a script
so that each row is exactly one edit and no row can be forgotten; every row was applied and
reverted and the working tree is clean afterwards.

| MUT-4G | File | Change | Nodes | Observed first red line | Caught | Restored |
|---|---|---|---|---|---|---|
| 01 | schema_guard.py | drop `("user","apple_sub")` | B-32, B-38 | `assert ('user','apple_sub') in (('user','timezone'), ('reading_activity','local_day'), ('user','is_bot'), ('bot_post','dedup_key'))` | yes | yes |
| 02 | models.py | `apple_sub: str = Field(default="")` | B-32a | `sqlalchemy.exc.IntegrityError: UNIQUE constraint failed: user.apple_sub` — louder than the planned `assert '' is None`: every row collides, so conftest's own boot fails | yes | yes |
| 03 | models.py | drop `unique=True` | B-32b, B-29 | `Failed: DID NOT RAISE <class 'sqlalchemy.exc.IntegrityError'>` | yes | yes |
| 04 | main.py | `assert_migrated` below `start_scheduler()` | B-39 | `assert [1] == []` | yes | yes |
| 05 | PM_SQL_QUEUE.md | drop `IF NOT EXISTS` from the ALTER | B-37 | `assert 'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS apple_sub VARCHAR(255)' in '## 8. Sprint 4G ...'` | yes | yes |
| 06 | auth_router.py | delete the unconfigured -> 404 guard | B-01 | `AssertionError: None -> 401` (unset env then reaches an empty audience list and 401s; the plan guessed 500) | yes | yes |
| 07 | auth_router.py | `include_in_schema=False` | B-01a | `assert '/auth/apple' in {...}` | yes | yes |
| 08 | apple_keys.py | drop `options={"leeway": 10}` | B-08 | `AssertionError: exp=-5s -> 401` | yes | yes |
| 08b | apple_keys.py | `options={"verify_exp": False}` | B-08 | `AssertionError: exp=-60s -> 200` | yes | yes |
| 08c | apple_keys.py | invert the verification result | B-02 | `AssertionError: {"detail":"Invalid Apple token"}` — 401 for a valid token | yes | yes |
| 09 | apple_keys.py | the `kid` reader reads `jwk`, not `keys` | B-02a | `assert [] == ['8nTlO3M2Bk', 'GNCf4J83Oh', 'nP41CGTvOz']` | yes | yes |
| 10 | apple_keys.py | `options={"verify_signature": False}` | B-03 | `assert 200 == 401` | yes | yes |
| **11** | apple_keys.py | drop `algorithms=["RS256"]` | B-04, B-05 | `assert 0 == 1` — the **structural** assertion. The 401 assertions **stayed green**: finding 2 | yes, structurally | yes |
| **12** | apple_keys.py | `algorithms=["RS256","HS256"]` | B-05 | `assert 'HS256' not in ['RS256','HS256']` — structural, same reason | yes, structurally | yes |
| 13 | apple_keys.py | drop `audience=` | B-06 | `assert 401 == 200` — it fails **closed**, not open: jose rejects any token carrying `aud` when no audience is given (finding 1) | yes | yes |
| 14 | auth_router.py | compare the raw env string | B-06a | `assert [' com.bookpulse.mobile , com.trackmyread.services ,, '] == ['com.bookpulse.mobile','com.trackmyread.services']` | yes | yes |
| 15 | apple_keys.py | drop `issuer=` | B-07 | `assert 200 == 401` | yes | yes |
| 16 | apple_keys.py | skip the compare when the claim is missing | B-09 | `assert 200 == 401` | yes | yes |
| 16b | apple_keys.py | drop the 32-character floor | B-09 | `assert 200 == 401` | yes | yes |
| 17 | apple_keys.py | `==` instead of `hmac.compare_digest` | B-09a | `assert ['apple_keys.py:verify_identity_token'] == []` | yes | yes |
| 18 | apple_keys.py | loop the refetch (bounded at 5 — finding 4) | B-10 | `assert 6 == (1 + 1)` | yes | yes |
| 19 | apple_keys.py | remove the TTL cache | B-10a | `assert 2 == 1` | yes | yes |
| 20 | apple_keys.py | `except Exception: pass` around the fetch | B-11 | `AssertionError: {"detail":"Internal Server Error"}` — a 500, not a 503 | yes | yes |
| 21 | auth_router.py | default `sub` to the email claim | B-12 | `AssertionError: empty -> 200` | yes | yes |
| 22 | auth_router.py | hoist `os.getenv` to module scope | B-13 | `assert 404 == 200` (the first call, not the second) | yes | yes |
| **23** | auth_router.py | **`bool(claims.get("email_verified"))`** | B-23 | `assert False is True` on **5 of 9** parameters: `str-false`, `str-False-mixed`, `str-FALSE-upper`, `str-one`, **`int-one`**. tests.md named four and missed the int `1` | yes | yes |
| 24 | auth_router.py | coerce with `== "true"`, no `.lower()` | B-23a | `assert True is False` on `str-True-mixed` and `str-TRUE-upper` (2 of 4) | yes | yes |
| 25 | auth_router.py | remove the `apple_sub` persistence | B-20 | `assert 5 == 4` on the row count | yes | yes |
| 26 | auth_router.py | consult the email before `apple_sub` | B-21, B-25a | `AssertionError: {"detail":"Apple account already linked"}` — 409: the create path then collides with the first row's subject | yes | yes |
| 26b | auth_router.py | write the token's email on a branch-1 match | B-21 | `assert '4g-b21-second@example.com' == '4g-b21-first@example.com'` | yes | yes |
| 27 | auth_router.py | create instead of linking in branch 3 | B-22 | `assert True is False` on `is_new` | yes | yes |
| 27b | auth_router.py | link to the first row, not the matching one | B-26a | `assert False is True` | yes | yes |
| 28 | auth_router.py | drop the relay condition from branch 3 | B-24, B-26 | `assert False is True` on `is_new` | yes | yes |
| 28b | auth_router.py | `bool(is_private_email)` | B-24 **green**, B-24b red | B-24: `4 passed`. B-24b: `assert True is False` on `str-false`, `str-False-mixed`. **Exactly what tests.md predicted** — the paired case is what catches it | yes, by B-24b | yes |
| 29 | auth_router.py | delete the relay-**domain** term (K-05's floor) | B-24a | `assert False is True` on `is_new` | yes | yes |
| 30 | auth_router.py | `is_relay = not _coerce(...)` | B-24b | `assert True is False` on **all 5** parameters | yes | yes |
| 31 | auth_router.py | let branch 2 fall through | B-25 | `assert 200 == 401` | yes | yes |
| 32 | auth_router.py | one fixed placeholder for everybody | B-27 | `assert 'apple-0000000000000000@users.noreply.trackmyread.com' != 'apple-0000000000000000@users.noreply.trackmyread.com'` | yes | yes |
| 33 | auth_router.py | apply `full_name` on the link path too | B-22, B-28 | `AssertionError: name` — the per-field loop names the field it found changed | yes | yes |
| 33b | auth_router.py | ignore `full_name` everywhere | B-28 | `assert '4g-b28-first' == 'Original Name'` | yes | yes |
| 34 | auth_router.py | synthesise from the raw `sub` | B-27a | `AssertionError: 001234` — the fragment the address must not contain | yes | yes |
| 35 | auth_router.py | add a `provider` claim | B-30 | `assert {'exp','provider','sub'} == {'exp','sub'}` | yes | yes |
| 36 | auth_router.py | remove the `last_active` write | B-31 | `assert None is not None` | yes | yes |
| 37 | tests/test_auth.py | delete `:641`'s assertion, **in a commit** | B-33 | `AssertionError: ['tests/test_auth.py: 1 line(s) removed']` | yes | yes — `git reset --hard`, then `diff -q` against a pre-mutation copy: byte-identical, and B-33 green again |
| 38 | profile_router.py | add `apple_sub` to `/profile/me` | B-34 | `AssertionError: /profile/me` — the sweep names the route | yes | yes |
| 39 | crud.py | `user.apple_sub = ""` in `create_user` | B-35 | `sqlalchemy.exc.IntegrityError: UNIQUE constraint failed: user.apple_sub` — louder than the planned `assert 2 == 1`: the conftest boot fails before the AST walk runs | yes | yes |
| 40 | auth_router.py | `print(f"apple claims: {claims}")` | B-36 | `AssertionError: 4g-b36-distinctive@examp` — the leaked email | yes | yes |

**47 of 47 rows caught; none stayed green.** Two of them (11, 12) are caught only by a structural
assertion, and that is a finding rather than a workaround — written up below instead of hidden
behind a green tick.

## What I found wrong, or wrong-shaped, in the documents

Reported plainly, in the order of how much they matter.

1. **`python-jose`'s `audience=` cannot take a list, and both the spec and the architecture say to
   pass one.** spec R-01 ("`aud` must be in `APPLE_AUDIENCES`") with architecture §"Data flow"'s
   `jwt.decode(..., audience=APPLE_AUDIENCES, ...)` is not executable: measured,
   `audience=[a, b]` raises `JWTError: audience must be a string or None`. The implementation
   therefore tries one configured audience per attempt, and the library still owns the comparison.
   Two further measurements worth having: with **no** `audience=` argument at all, jose rejects
   every token that carries an `aud` claim (`JWTClaimsError: Invalid audience`), so MUT-4G-13
   fails closed and B-06 goes red on its 200 control rather than on its 401 assertion; and
   `options={"verify_aud": False}` plus our own membership check was the alternative I did not
   take, because it moves the check out of the library for no gain.
2. **MUT-4G-11 and MUT-4G-12 cannot be caught behaviourally, and the reason is a good one.** The
   key handed to `jwt.decode` is the **selected RSA JWK**, so an `alg: "none"` token raises
   `JWKError: Unable to find an algorithm for key` and an HS256 token raises
   `JWKError: Incorrect key type. Expected: 'oct', Received: RSA` — **with or without**
   `algorithms=["RS256"]`. Both become the same opaque 401, so B-04 and B-05 stay green on their
   status assertions under the mutation (measured: `4 passed` on the status halves). Note also
   that `JWKError` is a `JOSEError` but **not** a `JWTError`, so a narrow `except JWTError` would
   have turned those into 500s — the exact defect R-01 names in `/auth/google`. I kept the broad
   catch and added a structural assertion (`_decode_algorithms()`, the one `algorithms=` literal
   passed to `jwt.decode`) to B-04 and B-05. The allowlist stays in the code because it is correct
   defence in depth, not because a test needs it.
3. **K-04 is confirmed and is worse than "a spelling"**: `clock_skew_in_seconds=10` raises
   `TypeError: decode() got an unexpected keyword argument 'clock_skew_in_seconds'`, i.e. a
   Builder who copied R-01 literally would have shipped a route that 500s on every sign-in.
   `options={"leeway": 10}` is right, `jwt._validate_exp` is `(claims, leeway=0)`.
4. **MUT-4G-18 as written hangs the suite.** `while kid not in doc: doc = fetch_jwks()` never
   terminates against a stub that returns one document, so the row cannot be run as specified. I
   bounded the mutated loop at five attempts, which reproduces the amplification bug the row
   exists for (`assert 6 == 2`). The row's wording should become "refetch more than once".
5. **B-24a's expectation is inverted by the PM addendum and tests.md still carries the old one.**
   tests.md B-24a asserts that a `@privaterelay.appleid.com` address with `is_private_email:
   false` **links** (claim-only). pm-decisions K-05 then ruled that such an address **never**
   links. I implemented the PM decision and renamed the case
   `test_the_relay_domain_never_links_whatever_the_claim_says`. The claim is still the primary
   rule and B-24 proves it with a non-relay-domain address — deliberately, because a relay-domain
   address there would let the domain floor satisfy the case while the claim coercion was broken.
6. **B-30's key set is one key short of the PM decision.** tests.md asserts
   `{"access_token","is_new","user"}`; the addendum adds `private_relay`. R-08 is amended to
   "additive-only", so the case asserts the four-key set.
7. **tests.md's mandatory file header imports `revoke_token`, which belongs to P3.** Importing it
   in a P1+P2-only tree is a collection error that takes all 64 assertions with it — the exact
   failure mode rule 5 exists to prevent. Dropped, with a comment telling P3 to add it.
8. **MUT-4G-23 bites five parameters, not four.** tests.md predicts `"false"`, `"False"`,
   `"FALSE"` and `"1"`; the integer `1` is also truthy, so `int-one` goes red too. The plan is
   right about the hazard and one short about its reach.
9. **The spec's branch table does not say what happens to an unverified email, and the answer is
   that it is discarded.** Branch 5's condition is "absent, **or not verified after coercion**",
   so a reader whose email Apple will not vouch for is given a synthesised
   `apple-<digest>@users.noreply.trackmyread.com` address and their real address is not stored at
   all. That is what I built and it follows the spec, but it is a product consequence nobody has
   written down: the reader never sees their own address in Settings, and E-5's copy says nothing
   about it. Worth a PM line.
10. **Branch 2 is unconditional on verification, and the table hides that.** "No `apple_sub`
    match, and the row found by email already has a different `apple_sub`" does not mention
    `email_verified`, so an **unverified** email claim that collides with an existing Apple
    identity 401s rather than creating an account. I implemented it as written. It is the safe
    direction, and it does mean an attacker can turn a victim's Apple sign-in into a 401 by
    registering first with an unverified copy of their address — the mirror of F8 and worth a
    triage row of its own.
11. **ST-4G-06 expects two hunks in `auth_router.py`; there are three** (the `apple_keys` import,
    `AppleAuthIn` beside the other request models, the route block). P3 makes four. The paragraph
    forgot the import. Related: I put the import on **its own line** so that this sprint's diff
    over that file removes nothing at all, which is what ST-4G-05 actually asks for.
12. **The 409 race leaves an orphan row.** `crud.create_user` commits, so the loser of a
    concurrent first sign-in has a `user` row with `apple_sub IS NULL` by the time its second
    commit fails. Nobody is locked out (their next sign-in matches the winner by `sub`), and the
    architecture's §"Why not one transaction" explicitly refuses the `commit=` kwarg that would
    prevent it — so this is the documented cost, now measured rather than predicted.
13. **MUT-4G-37 is unprovable in the working tree** (B-33 reads committed state, as tests.md
    notes for the 4F analogue). I proved it with a throwaway commit and then
    `git reset --hard`, and verified `tests/test_auth.py` byte-identical afterwards. A Builder who
    skips that dance will record "caught" without having tested anything.
14. **Nothing here is platform-sensitive as far as I can tell, with one caveat I cannot settle.**
    Every new case is pure Python, SQLite, AST or `git`; paths are normalised with
    `.replace("\\","/")`; the three `exp` cases use offsets from the real clock rather than a
    frozen one, so they are timezone-independent by construction. **CI runs Linux and I ran
    Windows**, so the two things I would watch on the first CI run are (a) `tests/fixtures/
    apple_jwks_snapshot.json` and the new test file being checked out LF instead of CRLF — no
    assertion depends on line endings, but the mutation driver did, which is how I noticed — and
    (b) B-34's `EXPECTED_GETS = 50`, which is a route count and should be identical, but is a
    literal and will bite the next person who adds a GET route. That is rule 4 working.

## What is still not proved

Everything tests.md section 10 says, unchanged, plus:

- No PostgreSQL anywhere in this package. B-29 is SQLite's unique index, driven at the branch-1
  lookup seam; `VARCHAR(255)` and the `NULL`s-ignored behaviour of the unique index are asserted
  against SQLModel metadata and SQLite, not against the production engine. **P-4G-01, P-4G-02 and
  G-4G-09 are the only proof that step 8 ran and that the index exists.**
- Nothing proves Apple signs what we verify. B-02a parses Apple's real public key document and
  proves our `kid` reader finds all three keys; it asserts nothing about any signature, because
  this repo holds no Apple-signed token. R-15 item 1 needs a TestFlight build that does not exist.
- `users.noreply.trackmyread.com` having no MX record is P-4G-11 and no test touches it.
