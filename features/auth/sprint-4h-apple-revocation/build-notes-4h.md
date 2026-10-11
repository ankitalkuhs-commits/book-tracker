---
screen: sprint-4h-apple-revocation
feature: auth
package: the whole sprint — one package, API + client + SQL
built_by: Architect/Builder (branch `sprint-4h-apple-revocation`, worktree `.claude/worktrees/4h-revoke`)
built: 2026-10-11
base: `2c2a48b` (master, deployed)
read_first: `design-4h.md` in this directory, then `../sprint-4g-apple-signin/build-notes-4g-revoke.md`
---

# Build notes — Sprint 4H

## The one-line summary

**Apple revocation now sends a refresh token instead of the Apple subject, which is the
difference between a 400 and a 204.** The client sends Apple's one-time `authorizationCode`, the
server exchanges it at `auth/token`, the refresh token is stored Fernet-sealed in a new nullable
column, and the deletion revokes with that. Deletion still cannot be blocked by any of it;
sign-in still cannot be blocked by the exchange. With `APPLE_TOKEN_KEY` unset the whole thing is
inert and behaves exactly as the deployed Sprint 4G does.

## What was built

| File | Change |
|---|---|
| `app/apple_keys.py` | `+157 / -7`. A new §"Sprint 4H" below the 4G section: `APPLE_TOKEN_URL`, `TOKEN_TIMEOUT_SECONDS`, `exchange_authorization_code()`, `_token_key()`, `seal_token()`, `unseal_token()`. Plus a `from cryptography.fernet import Fernet, InvalidToken` at the top, and `revoke_token`'s first parameter renamed `apple_sub` -> `refresh_token` (the only edit to 4G code in this file). |
| `app/models.py` | `+8`. `User.apple_refresh_token: Optional[str] = Field(default=None, max_length=512)`. No index, no unique. |
| `app/schema_guard.py` | `+7`. `("user", "apple_refresh_token")` appended to `REQUIRED_COLUMNS`, with the deploy-order note. |
| `app/routers/auth_router.py` | `+48 / -1`, three hunks: `AppleAuthIn.authorization_code`; the exchange-and-seal block after R-03's commit in `/auth/apple`; and in `POST /auth/delete-account/me`, `apple_keys.unseal_token(current_user.apple_refresh_token)` in place of `current_user.apple_sub`. |
| `book-tracker-mobile-stitch/src/services/api.js` | `+7 / -1`. `appleLogin` takes a fourth argument and sets `body.authorization_code` under a conditional. |
| `book-tracker-mobile-stitch/src/screens/LoginScreen.js` | `+5 / -1`. `credential.authorizationCode` passed as that fourth argument. |
| `tests/test_apple_auth.py` | `+561 / -7`. `TestAppleTokenExchange` (B-50..B-53) and `TestAppleRevocationWithRefreshToken` (B-54..B-60), **14 new collected**, plus a 4H helper block before `TestAppleRevocation`. Six existing cases edited — see "What was edited in 4G's tests, and why". |
| `book-tracker-mobile-stitch/__tests__/appleSignIn.test.mjs` | `+68`. A-14, **1 new**. |
| `context/PM_SQL_QUEUE.md` | `+49`. Step 9 plus its row in the answer table. |
| `context/deployment/README.md` | `+40 / -5`. The five-variable table, `APPLE_TOKEN_KEY`'s own section (generation, rotation, and what a database read exposes), and the `.env` block. |
| `.github/workflows/ci-tests.yml` | pytest floor **800 -> 814**; Android floor **136 -> 139**. `qa/unit` left at 38 — this sprint adds no web code. |

**No new dependency.** `cryptography` 46.0.3 is already installed through
`python-jose[cryptography]`; Fernet, the key length and the ciphertext length were measured on
this branch before any of this was written. `requirements.txt` has no diff and is still UTF-16LE.

## Gates — all measured on this branch

| Gate | Result |
|---|---|
| pytest **before** | **800 passed** in 559.21s (`pytest tests -q` at `2c2a48b`, detached HEAD, `git status --porcelain` empty) — the briefed figure, confirmed on a tree nobody was editing |
| pytest **after** | `814` collected, **814 passed** — 800 + 14 |
| New collected | **14** from 11 case ids: B-50, B-52..B-60 one each, B-51 x4 |
| qa/unit | **38 / 38** before and after, untouched (`node --test "qa/unit/*.test.mjs"`) |
| Android | **138** before, **139** after (`NODE_PATH` = the main checkout's `book-tracker-mobile-stitch/node_modules`; the repo root has no `node_modules` at all in this worktree) |
| CI floors | `ci-tests.yml` pytest 800 -> 814, Android 136 -> 139 |
| No secret in the diff | `APPLE_TOKEN_KEY` appears only as a NAME. The Fernet key in the suite is `Fernet.generate_key()` at import time; the EC key is still generated per run. `grep` for `gAAAAA` (Fernet's version prefix) over the diff: 0 hits outside a test assertion comparing against a value it generated |
| `requirements.txt` | no diff |
| Removals, counted per file | `auth_router.py` **1** (the old `current_user.apple_sub,` argument line); `apple_keys.py` **7** (all inside `revoke_token`'s own docstring and its two renamed lines); `models.py` **0**; `schema_guard.py` **0**; `api.js` **1**; `LoginScreen.js` **1**; `tests/test_apple_auth.py` **7** |
| No bare `except` added | every new handler is `except Exception as e` or `except InvalidToken`, and logs a type name |

## Merging this branch — read before you do

This branch is based on **`2c2a48b`, the commit the brief named as deployed**. Local `master` has
since moved to **`0bda7b0`**, three commits ahead (`f4202ac`, `c0f640a` — iPad layout fixes —
and `0bda7b0`, "ci: raise the Android floor to 139"). Measured with
`git merge-tree --write-tree master sprint-4h-apple-revocation`:

| | Value |
|---|---|
| Files that conflict | exactly one: **`.github/workflows/ci-tests.yml`**. `appleSignIn.test.mjs` auto-merges — master inserted its new case before `eas_json_has_ios_profiles…` and A-14 is appended at the end of the file |
| Android count in the merged tree | **140** (master 139 + A-14), counted over the merged tree object, and the same static count agrees with the runtime count at `2c2a48b` (138 both ways) |
| Android floor to resolve to | **140**, not the 139 this branch sets and not the 139 master sets |
| pytest in the merged tree | **814** — master's three commits touch no file under `app/`, `tests/` or `qa/` (`git diff --name-only 2c2a48b master` is nine mobile files plus the workflow), so this branch's 814 survives the merge unchanged |
| qa/unit in the merged tree | **38**, same reason |

The conflict is the Android `EXPECTED_MIN_TESTS` line and the comment above it: master bumped the
number to 139 and **left Sprint 4G P4's comment in place describing 136**, while this branch
rewrote that comment to explain the drift. Resolve by keeping this branch's comment, adding one
line for the merge, and setting the number to **140**.

Why this branch sets 139 and not 140: 139 is what this branch measures. Setting 140 here would
fail this branch's own CI, and the workflow header already states the rule — "the merged tree is
measured below rather than computed".

## Mutation-proof table

Procedure per row: confirm green, apply **one** edit to the named product file, run **only** the
named node ids, record the actual first red line, restore from a byte snapshot taken before any
mutation, confirm green again. Restoration is a byte copy and **not** `git checkout --`, which
would have discarded the uncommitted product code this package is made of; the driver asserts
each restored file byte-identical to its snapshot.

| MUT-4H | File | Change | Nodes | Observed first red line | Caught |
|---|---|---|---|---|---|
| 01a | apple_keys.py | `return None` before the `auth/token` post | B-50 | `test_apple_auth.py:1964: AssertionError: []` — `len(stub.calls) == 1` | yes |
| 01b | apple_keys.py | `grant_type=refresh_token` | B-50 | `assert 'refresh_token' == 'authorization_code'` | yes |
| 01c | apple_keys.py | drop `client_secret` from the exchange body | B-50 | `assert {'client_id',... 'grant_type'} == {'client_id',... 'grant_type'}` (the `TOKEN_BODY_KEYS` set) | yes |
| 02 | apple_keys.py | `raise` instead of swallowing in `exchange_authorization_code` | B-51 | `test_apple_auth.py:1657: AssertionError: {"detail":"Internal Server Error"}` on **2 of 4** parameters (`raises_request_exception`, `raises_timeout`) — the other two never raise | yes |
| 02b | auth_router.py | the **caller** 400s when the exchange yields nothing | B-51 | `AssertionError: {"detail":"Apple token exchange failed"}` on **all 4** parameters | yes |
| **03** | auth_router.py | exchange unconditionally (`if True:`) | B-52 | **stayed green: `1 passed`** at first. See "The mutation that did not bite" below | **only after B-52 was given the log assertion** |
| 04 | apple_keys.py | `seal_token` returns the plaintext when there is no key | B-53, B-50 | `test_apple_auth.py:2060: AssertionError: assert '4h-refresh-token-r1b2c3d4e5' is None` | yes |
| 05 | auth_router.py | revoke `current_user.apple_sub` again — **Sprint 4G's actual bug** | B-40, B-54 | `assert '001234.4gb400001.5678' == '4h-refresh-token-r1b2c3d4e5'`, both cases | yes |
| 05b | auth_router.py | send the sealed value without unsealing | B-40, B-54, B-56 | `assert 'gAAAAABqyyZ8...9vK9JFs-3zuM=' == '4h-refresh-token-r1b2c3d4e5'`; B-56 adds `assert [{'data': {'c...auth/revoke'}] == []` | yes |
| 06 | auth_router.py | drop the `apple_sub IS NOT NULL` gate (`if True:`) | B-41, B-55 | B-41: `test_apple_auth.py:1750: AssertionError: assert User(bio=None, apple_refresh_token=None, …)` — the before-value tripwire fires and the deletion 500s. B-55: `test_apple_auth.py:2168: AssertionError: apple revoke: not configured, skipped` | yes, by both |
| 07 | apple_keys.py | `unseal_token` re-raises `InvalidToken` | B-56 | `test_apple_auth.py:2206: AssertionError: {"detail":"Internal Server Error"}`, followed by the teardown `ERROR` 4G's notes predicted | yes |
| 08 | auth_router.py | add `"refresh_token": user.apple_refresh_token` to the `/auth/apple` response | B-57 | `test_apple_auth.py:2233: AssertionError: /auth/apple` (the message names which body leaked) | yes |
| 09 | apple_keys.py | print `resp.text` on a non-200 from `auth/token` | B-58 | `assert 'apple-token-detail-4h-b58' not in 'apple token...d, skipped\n'` | yes |
| 10 | schema_guard.py | drop the 4H entry from `REQUIRED_COLUMNS` | B-59, B-32 | B-59: `assert ('user', 'apple_refresh_token') in (('user', 'timezone'), …)`. B-32: `test_apple_auth.py:265: AssertionError: assert 5 == 6` | yes, by both |
| 11 | PM_SQL_QUEUE.md | step 9's ALTER becomes `NOT NULL DEFAULT ''` | B-60 | `test_apple_auth.py:2369: assert 'NOT NULL' not in "## 9. SPRIN...L DEFAULT ''"` | yes |
| 13 | models.py | `index=True` on the credential column | B-57 | `test_apple_auth.py:2247: AssertionError: assert True in (None, False)` | yes |
| 14 | apple_keys.py | `raise` instead of swallowing in `revoke_token` — **4G's MUT-43, re-measured after 4H** | B-42 | `test_apple_auth.py:1801: AssertionError: {"detail":"Internal Server Error"}` on **2 of 4** parameters, plus one teardown `ERROR`. Still caught; 4G's protection survives this sprint intact | yes |
| 15 | auth_router.py | move the revocation **below `db.commit()`** — **4G's MUT-44, re-measured** | B-43 | `test_apple_auth.py:1844: assert None is not None` — exactly the line 4G recorded | yes |
| 16 | apple_keys.py | `_token_key` lets a malformed `APPLE_TOKEN_KEY` raise | B-53 | `test_apple_auth.py:1657: AssertionError: {"detail":"Internal Server Error"}` — a bad key must never 500 a sign-in | yes |
| 12 | api.js | `authorization_code` as an unconditional body literal | A-14 | `not ok 18` — `authorization_code is an unconditional key of the request body — an older build sends none` / `1 !== 0` at `appleSignIn.test.mjs:1123` | yes |
| 12b | LoginScreen.js | drop the 4th argument from the `appleLogin` call | A-14 | `not ok 18` — `error: 'the handler does not read authorizationCode off the credential'` | yes |
| 12c | LoginScreen.js | `credential.authorization_code` (the snake_case spelling expo-apple-authentication does not have) | A-14 | `not ok 18` — same message; the snake_case `doesNotMatch` is the second line of defence behind it | yes |

**21 of 22 rows caught as applied; the 22nd (03) is written up rather than swapped out.**

### The mutation that did not bite

**MUT-4H-03 — "exchange unconditionally" — stayed green on B-52 as the case was first
written** (measured: `1 passed`). The reason is not a weak test, it is a redundant guard:
`exchange_authorization_code` starts with `if not (code and client_id and team_id and key_id and
private_key)`, so with `payload.authorization_code` absent the function returns before the
outbound post. `stub.calls` is `[]` either way, the column stays NULL either way, and the
response is unchanged.

What the route's `if payload.authorization_code:` actually buys is that the function is **not
entered at all**, and the only place that is observable is the log line
`apple token: not configured, skipped`. B-52 was given a `capsys` assertion for exactly that, and
MUT-4H-03 then fails on `test_apple_auth.py:2044: AssertionError: apple token: not configured,
skipped`. The mutation is reported here, with its green measurement, rather than replaced by one
that was easier to catch — and the case's own docstring carries the same note, so the next person
to read it does not have to rediscover why `capsys` is in a call-count test.

### One correction to my own first draft

I initially wrote in B-55's docstring that Sprint 4H had *weakened* B-41's proof of the
`apple_sub` gate. **Measured, that is wrong**, and the table above records it: with the gate
dropped, B-41's before-value tripwire (`_must_not_run`) is reached, raises, the deletion 500s and
the Google-only row survives — `test_apple_auth.py:1750` goes red. The accurate statement, which
is what the docstring says now, is narrower: B-41 can no longer catch a dropped gate **without a
tripwire in place**, because after 4H `unseal_token(None)` is `None` and `revoke_token(None, …)`
sends nothing. B-55 is the case that covers the real code.

## What was edited in 4G's tests, and why

Six existing cases were edited. **None of their properties changed**; the mechanism they drive
did. All five are still green and MUT-4H-14 / 15 above re-measure that 4G's own protections still
bite.

| Case | Edit | Why it was unavoidable |
|---|---|---|
| B-32 `test_schema_guard_entry` | `assert len(pairs) == 5` -> `== 6` | A hard-coded count that every sprint appending a column must move. Left a literal on purpose: the point of the count is that a sprint cannot REPLACE a pair and have it read as an append |
| B-40 `test_revoke_is_called_once_with_a_correct_client_secret` | `assert data["token"] == sub` -> `== REFRESH_TOKEN`, plus `!= sub` and `!= sealed`; `_configure_token_key` + `_plant_refresh_token` added; the `client_secret` block factored into `_verify_client_secret` | **This assertion WAS the bug.** It pinned 4G's broken request shape. The `client_secret` half is untouched in substance |
| B-41 `test_a_google_only_deletion_makes_no_call` | 2 lines added to the CONTROL step only | The control reader needs a stored refresh token, since that is now what gets revoked. The before/after byte-comparison the case is built around is untouched |
| B-42 `test_a_failed_revocation_never_blocks_the_deletion` | 2 lines added | Same reason. Its four parameters, its assertions and its `(0 if key_unset else 1)` call count are unchanged |
| B-43 `test_revocation_runs_before_the_row_is_deleted` | 2 lines added | Same reason |
| B-44 `test_nothing_sensitive_is_logged` | 4 lines added, plus `REFRESH_TOKEN`/`TOKEN_KEY` added to the forbidden-strings list | Same reason, plus two new secrets now travel this path |

**Why `_plant_refresh_token` plants instead of driving the exchange.** B-43 installs its
`http_post` stub *after* creating its reader, so a sign-in that exchanged would reach the real
`appleid.apple.com` from CI. Planting through `seal_token` keeps the deletion's unseal real, and
the write itself has its own end-to-end case: B-50 drives `/auth/apple` -> `auth/token` -> the
column, and B-54 drives both Apple endpoints through one stub in a single request pair. The
helper asserts the sealed value is non-empty and differs from the plaintext, so a case that
forgot `_configure_token_key` fails loudly instead of planting NULL and passing for the wrong
reason.

## What I found wrong, or wrong-shaped

In order of how much it matters.

1. **The brief's Android baseline was right and the CI floor was not.** `ci-tests.yml:159` said
   `EXPECTED_MIN_TESTS: 136` while master already passed **138** — a two-test hole that drifted
   in after Sprint 4G's P4, in the exact gate that exists to catch a test file silently failing
   to load. Raised to 139 with the measurement in the comment. The pytest floor (800) and the
   `qa/unit` floor (38) were both correct.

2. **The repo-root `node_modules` does not exist in a worktree, so the Android suite cannot be
   run the obvious way.** `book-tracker-mobile-stitch/node_modules` is absent here too; both the
   suite and the mutation driver point `NODE_PATH` at the **main checkout's**
   `book-tracker-mobile-stitch/node_modules`. 4G's notes say the repo root "gives
   `# tests 30, # fail 9`" — in a worktree it gives a module-resolution failure instead, which is
   a louder and more honest symptom.

3. **A long pytest run and an editing session cannot overlap on this suite, and the failure is
   silent-ish.** My first baseline run was started before the product edits and still came back
   `1 failed, 799 passed`, because `tests/test_local_day.py::TestClockIndependence` spawns
   *subprocesses* that re-import `app.models` and `app.schema_guard` from disk mid-run. The
   failure it reported (`'apple_refresh_token' in <ImmutableColumnCollection>`) was an artefact of
   my edit landing between two reads of the tree, not a defect. Worth a line in tests.md: the
   before-baseline must be measured on a tree nobody is touching, and the `800` in this document
   was re-measured at `2c2a48b` with a clean tree for that reason.

4. **4G's `revoke_token` docstring was accurate about its own design and wrong about the
   world.** It says "the status is the outcome, not a reason to fail", which is correct, and it
   is precisely why 4G's 400 would have been invisible in production except as one log line.
   B-40 was the only thing in CI that could have caught the wrong `token` value, and it asserted
   the wrong value on purpose because no document said what the right one was. The lesson is not
   about the swallow: it is that `revoke_token`'s unit test was pinned to a request shape nobody
   had ever seen Apple accept. Nothing in this sprint changes that — see "What is still not
   proved".

5. **`tests.md` for 4G has no 4H section, and three of its conventions needed re-pointing.** The
   `_RecordingPost` stub answers with a `SimpleNamespace`, which has no `.json()`; the exchange
   needs one, so 4H adds its own `_Resp` and a `_RecordingApple` that dispatches on URL rather
   than widening the 4G stub and perturbing eight passing cases. A stub that cannot tell
   `auth/token` from `auth/revoke` cannot prove which endpoint was called, which is the shape of
   the "a test that never exercises the loop it is about" trap.

6. **Fernet raises `InvalidToken` for everything, which made my first `unseal_token` docstring
   wrong.** I had written that the bare `except Exception` behind `except InvalidToken` was
   there because "a non-ASCII or non-base64 column value raises before Fernet gets to
   authenticate". Measured against `cryptography` 46.0.3, it does not: an empty string, a
   100-character run of `a`, `café` and `gAAAAA!!!` all come back as `InvalidToken`. The
   handler stays, because this runs on the deletion route where 5.1.1(v) means nothing may
   raise and "no exception has ever been seen here" is not a guarantee — but the docstring now
   says that instead of inventing a decode error that does not exist.

7. **`exchange_authorization_code`'s `resp.json()` is a real failure mode and it is swallowed by
   design.** Apple returning a 200 with a non-JSON body raises inside `.json()`, which the bare
   `except Exception` catches and logs as `apple token: failed (JSONDecodeError)`. That is the
   intended behaviour (sign-in must not fail), and it means a malformed-but-200 response is
   indistinguishable in the column from a timeout. The log line is the only difference, and
   B-51's `http_400` / `no_refresh_token` parameters cover the two shapes that matter.

8. **The brief said "a new nullable column stores the refresh token", singular, and that is
   enough — but it hides a choice.** Storing the `client_id` the token was obtained for would
   make the exchange/revoke pairing explicit instead of relying on both sites spelling
   `audiences[0]`. I did not add it: one column for a value that is the same single bundle id in
   every row is speculative, and the design note records the configuration in which the current
   choice would be wrong (a genuinely multi-valued `APPLE_AUDIENCES`) so that the next person
   adding a web client reads it first.

9. **Nothing here is platform-sensitive, with the usual line-ending caveat.** Every file in this
   repository is CRLF in the working tree; every appended block was written LF and converted
   before landing, and the whole tree was checked (`0` LF-only lines in every touched file). CI
   runs Linux and I ran Windows. No assertion reads a clock boundary, a path or a locale.

## What is still not proved

Everything `build-notes-4g-revoke.md` §"What is still not proved" says, unchanged, plus:

- **Nothing proves Apple accepts the exchange.** B-50 proves the request shape and that the
  ES256 `client_secret` **verifies against the right public key** with the right `iss`, `sub`,
  `aud` and an `exp` inside Apple's ceiling. Every case mocks the HTTP call. The real proof is
  the one-time TestFlight check in `context/deployment/README.md` §"Verifying R-13", and it now
  has a chance of passing, which is the entire point of this sprint.
- **Nothing proves Apple's refresh-grant `id_token` carries no `nonce`.** The design note leans
  on that to argue a stolen refresh token is not a path back into TrackMyRead. It is Apple's
  documented behaviour and our verifier rejects an absent `nonce` either way, but the claim is
  unverified against Apple's real bytes.
- **No PostgreSQL.** `VARCHAR(512)` and the `information_schema` verification are asserted
  against the text of step 9 and against SQLModel's metadata, never against a real PostgreSQL.
- **No Render log was read**, and no `.p8` exists yet. `APPLE_TOKEN_KEY` has never been set in
  production.
- **No reader has ever had a non-NULL `apple_refresh_token`.** The column is empty everywhere.
