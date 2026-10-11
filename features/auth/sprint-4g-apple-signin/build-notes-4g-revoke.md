---
screen: sprint-4g-apple-signin
feature: auth
package: P3 — Apple token revocation on account deletion (R-13)
built_by: Builder (branch `builder-4g-revoke`, worktree `.claude/worktrees/4g-revoke`)
built: 2026-10-07
base: `c0522c6` (the P1+P2 merge). Read `build-notes-4g-api.md` first; it is the package this one sits on.
---

# Build notes — Sprint 4G, P3 (R-13)

## The one-line summary

**R-13 ships inert and the deletion can never fail because of it.** The code path exists, is
tested with a locally generated EC key, and turns on with three Render environment variables
and no deploy. Until the PM creates the `.p8`, every deletion logs
`apple revoke: not configured, skipped` and completes exactly as it does today.

## What was built

| File | Change |
|---|---|
| `app/apple_keys.py` | `+130` lines, additions only, below the verification half: `APPLE_REVOKE_URL`, `CLIENT_SECRET_TTL_SECONDS`, `REVOKE_TIMEOUT_SECONDS`, `_revoke_config()`, `build_client_secret()`, `http_post()` (the injectable seam) and `revoke_token()`. Plus `import os`, which the verification half did not need. |
| `app/routers/auth_router.py` | **one** hunk, `+21` lines, `0` removed: a best-effort revocation immediately above `uid = current_user.id` in the live `POST /auth/delete-account/me`. The legacy `POST /auth/delete-account` above it (which only sets `deletion_requested_at`) is untouched. |
| `tests/test_apple_auth.py` | `TestAppleRevocation` (B-40..B-44, **8 collected** — B-42 is parametrised over four failure modes), its EC-key and recording-stub helpers, and `revoke_token` added to the module import guard. |
| `context/deployment/README.md` | the four `APPLE_*` variables in the backend `.env` block, and a new **"Sign in with Apple (Sprint 4G)"** section with the PM's step-by-step for the `.p8`, the kill switch, rotation, and the one-time TestFlight verification. |
| `.github/workflows/ci-tests.yml:61` | pytest floor **779 -> 787**, re-measured on this branch, not copied from tests.md. |

**No new dependency.** `python-jose[cryptography]` signs ES256 from a PKCS8 EC PEM; measured on
this branch before any of this was written. `requirements.txt` is untouched and still UTF-16LE.

## What the PM must do when the `.p8` arrives

The long form, with the portal clicks, is now in `context/deployment/README.md` §"Sign in with
Apple (Sprint 4G)". The short form:

1. **Apple Developer portal -> Certificates, Identifiers & Profiles -> Keys -> `+`**, tick
   **Sign in with Apple**, configure it against the `com.bookpulse.mobile` primary App ID,
   register.
2. **Download the `.p8`** — downloadable **exactly once**. Password manager only: never a
   repository, a commit, a chat or a test fixture (pm-decisions E-4). The existing
   `AuthKey_4W4FHZ8NRR.p8` is the App Store Connect CI key, a **different** key, and must not
   be reused.
3. Note the **Key ID** (the `AuthKey_<KEYID>.p8` fragment, 10 characters) and the **Team ID**
   (top-right of the portal, 10 characters).
4. **Render -> the API service -> Environment**, three variables:

   | Name | Value |
   |---|---|
   | `APPLE_TEAM_ID` | the 10-character Team ID |
   | `APPLE_KEY_ID` | the 10-character Key ID from step 1 |
   | `APPLE_PRIVATE_KEY` | the **entire** `.p8` contents, `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines included, newlines included |

5. Save. Render restarts; nothing to merge, nothing to deploy. All three are read **per call**,
   so there is no import-time capture to work around.

**Not GitHub Actions.** The repository is public. Nothing in CI needs this key and nothing ever
will: the outbound call is `app.apple_keys.http_post`, injected in every test, and every case
signs with an EC key the test generates at import time.

**Kill switch:** blank `APPLE_PRIVATE_KEY`. Revocation is inert again on the next request and
deletion is unaffected — because deletion is never affected.

**Independent of sign-in.** `APPLE_AUDIENCES` gates `POST /auth/apple` (404 when unset). The
three revocation variables gate only R-13. Either group can be set without the other.

## The design decisions, and why

- **The swallow lives in `revoke_token`, not in the route.** One guard, in the module that owns
  the protocol and therefore owns its failure modes. `revoke_token` returns the HTTP status
  code when a call completed (a 4xx and a 5xx are outcomes, not reasons to fail) and `None`
  when nothing was sent. The route ignores the value, deliberately: there is no decision for it
  to make. The cost of that choice is named under "What I found wrong" item 3.
- **`revoke_token(apple_sub, client_id)`, not `revoke_token(user)`** (architecture §P3 says the
  latter). Two strings instead of an ORM row keeps `apple_keys.py` free of `models` in both
  directions and makes it impossible for this function to read a column it has no business
  reading. The `apple_sub IS NOT NULL` gate stays in the route, which is where B-41's mutation
  points.
- **`client_id` is the first configured audience**, i.e. the bundle id (architecture E-2 item
  5). With `APPLE_AUDIENCES` unset there is no client id to present, so nothing is sent — the
  same inert state an unset key produces.
- **`exp` is `iat + 600`**, not Apple's 3600 ceiling. One synchronous call needs ten minutes at
  most, and a leaked secret is useless almost immediately. B-40 asserts `<= 3600`, so the
  margin is the implementation's to choose.
- **`token_type_hint` is `refresh_token`.** See "What I found wrong" item 1, which is the most
  important thing in this document.
- **Logging is a status code and a type name.** `apple revoke: status 204`,
  `apple revoke: failed (Timeout)`, `apple revoke: not configured, skipped`. Never the
  `client_secret`, the PEM, the `apple_sub`, the email or the response body — and never
  `str(exception)`, because `requests` puts the URL it was given into its own exception text.

## Gates — all measured on this branch, none copied

| Gate | Result |
|---|---|
| pytest **before** | `779 collected`, **779 passed** in 668.48s (`pytest tests -q`, clean tree at `c0522c6`) |
| pytest **after** | `787 collected`, **787 passed** — 779 + 8 |
| New collected | **8** from 5 case ids: B-40, B-41, B-43, B-44 one each, B-42 x4. Matches tests.md's "P3 — 5 ids / 8 collected" exactly |
| qa/unit | **38 / 38** before and after, untouched (`node --test "qa/unit/*.test.mjs"`). Floor at `:111` deliberately not raised — this package adds no web code |
| Android | **121 / 121** before and after, untouched. `NODE_PATH` = the main checkout's `book-tracker-mobile-stitch/node_modules`, as the P1+P2 notes insist; the repo root gives `# tests 30, # fail 9` |
| G-4G-13 | `.github/workflows/ci-tests.yml:61` raised **779 -> 787**. `:111` (38) and `:150` (121) left alone; P4 raises the Android one |
| ST-4G-01 / 02 | no Apple secret and no `.p8` anywhere in the diff. The string `.p8` appears only in prose, and `-----BEGIN PRIVATE KEY-----` only inside the README's instruction about what to paste into Render |
| ST-4G-03 | `requirements.txt`: no diff |
| ST-4G-05 | `git diff 5fc8ccc -- app/routers/auth_router.py | grep -c "^-[^-]"` -> **0**. Nothing removed from that file across the whole sprint, `/auth/google` included |
| ST-4G-06 | **five** hunks over the sprint, of which **one** is mine. The paragraph predicted two for P2 and a fourth for P3; P2 measured three, and context merging makes mine land as the fifth. The property that matters — zero removals — holds |
| ST-4G-07 | no bare `except` in anything this package touched (the two in `app/routers/admin_router.py:162-174` are pre-existing and not mine to fix) |
| RG-4G-04 | `tests/test_auth.py::TestDeleteAccountCleansDependents` green **unedited**, in the same run as this file |
| The volume trap | `pytest tests/test_apple_auth.py tests/test_auth.py tests/test_bots.py -q` -> **176 passed**, so `TestAdminMetrics::test_admin_lists_carry_is_bot` survives. Every reader P3 creates is deleted by the route inside its own case, so this package adds about 14 `user` rows and removes all of them; the P2 module teardown (`4g-%`) catches anything a failure leaves behind |

## Mutation-proof table (G-4G-08)

Procedure per row: confirm green, apply **one** edit to the named product file, run **only** the
named node ids, record the actual first red line, restore from a byte snapshot taken before any
mutation, confirm green again. Restoration is a byte copy and **not** `git checkout --`, which
would have discarded the uncommitted product code this package is made of; `cmp` against the
snapshot confirms both files byte-identical afterwards.

| MUT-4G | File | Change | Nodes | Observed first red line | Caught | Restored |
|---|---|---|---|---|---|---|
| 41 | apple_keys.py | send the raw `.p8` PEM as the `client_secret` | B-40 | `jose.exceptions.JWTError: Error decoding token headers.` (chain: `ValueError: not enough values to unpack (expected 2, got 1)` -> `JWSError: Not enough segments`), raised by `jwt.get_unverified_header(secret)` | yes | yes |
| 41b | apple_keys.py | omit the outbound call entirely | B-40 | `assert 0 == 1` — `len(stub.calls) == 1` | yes | yes |
| 41c | apple_keys.py | sign the `client_secret` RS256 | B-40 | `assert 0 == 1`, **not** tests.md's `assert 'RS256' == 'ES256'`: an EC key cannot sign RS256 at all (`JWSError: ECPrivateKey.sign() takes 2 positional arguments but 3 were given`), the swallow catches it, and no call is made | yes | yes |
| 41d | apple_keys.py | `exp` a day out, past Apple's ceiling | B-40 | `assert (1791407786 - 1791321386) <= 3600` | yes | yes |
| 42 | auth_router.py | drop the `apple_sub IS NOT NULL` gate (`if True:`) | B-41 | `AssertionError: assert User(...) is None` — the before-value tripwire fires, the deletion 500s and the Google-only row survives. tests.md predicted `assert 1 == 0` on the call count; the tripwire gets there first, which is a stronger signal | yes | yes |
| 43 | apple_keys.py | `raise` instead of swallowing in `revoke_token` | B-42 | `AssertionError: {"detail":"Internal Server Error"}` at `tests/test_apple_auth.py:1615`, on **2 of 4** parameters (`raises_request_exception`, `raises_timeout`) | yes | yes |
| 43b | auth_router.py | the **caller** raises on a non-2xx or unsent revocation | B-42 | `AssertionError: {"detail":"Apple revocation failed"}` on **all 4** parameters | yes | yes |
| 43c | auth_router.py | require `APPLE_PRIVATE_KEY` and 400 without it | B-42 | `AssertionError: {"detail":"Apple revocation not configured"}` on the **`key_unset`** parameter only, 1 of 4 — the shipping-state parameter doing its one job | yes | yes |
| 44 | auth_router.py | move the revocation **below `db.commit()`** | B-43 | `assert None is not None` — exactly tests.md's prediction; `current_user.apple_sub` is gone by then | yes | yes |
| **44b** | auth_router.py | move it below the delete statements but **above** `db.commit()` | B-43 | **stayed green: `1 passed`** | **no — and it is not a defect.** Reported, not replaced; see item 2 | yes |
| 45 | apple_keys.py | `print(resp.text)` on a non-2xx | B-44 | `AssertionError: assert 'apple-oops-detail-4g-b44' not in 'apple revok...d, skipped\n'` | yes | yes |
| 45b | apple_keys.py | log the `client_secret` and the PEM | B-44 | `AssertionError: assert '-----BEGIN' not in 'apple revok...d, skipped\n'` | yes | yes |

**11 of 12 rows caught.** The one that did not is 44b, and it did not because the mutation is
not a bug — written up below rather than swapped for something greener. Two further rows
(43b, 43c) could not bite **as tests.md words them** and had to be moved to the caller; that is
item 3 and it is a property of the design, not of the tests.

## What I found wrong, or wrong-shaped, in the documents

In order of how much they matter.

1. **R-13 as specified cannot actually revoke anything, because we never store an Apple refresh
   token.** This is the finding that matters and it is a product gap, not a code defect.

   Apple's `POST /auth/revoke` takes a **refresh token or an access token** in its `token`
   parameter — tokens that only exist if the server exchanged the client's one-time
   `authorizationCode` at `POST https://appleid.apple.com/auth/token` and stored the result.
   Sprint 4G does none of that: `AppleAuthIn` carries `identity_token`, `nonce` and
   `full_name`, the iOS client never sends `authorizationCode`, and `/auth/apple` persists
   `apple_sub` and nothing else. So the only value this package has to put in `token=` is the
   Apple **subject**, which Apple will reject — a `400 invalid_request` or `invalid_grant`.

   What that means concretely: once the `.p8` is set, every Apple reader's deletion will log
   `apple revoke: status 400`, the deletion will complete correctly, and **the reader's Apple
   ID will still list TrackMyRead under "Apps Using Apple ID"** — the exact outcome R-13 exists
   to prevent. Done-checklist item 11 will fail, and it is the item App Review checks.

   Neither spec R-13, architecture §"Deletion, for an Apple reader" nor tests.md B-40 says what
   `token` should contain; B-40 asserts only that the key is present. I built the documented
   request shape (`token = apple_sub`, `token_type_hint = "refresh_token"`) and put the
   measurement here rather than inventing a column.

   **The fix is a follow-up package, and it is not small:** the iOS client sends
   `authorizationCode` alongside the identity token; the server exchanges it at `auth/token`;
   the refresh token is stored on the `user` row (a new nullable column, another PM SQL step,
   and a secret at rest that the current design deliberately does not hold); and the deletion
   revokes **that**. Worth a PM decision before submission, because the alternative is shipping
   a revocation that returns 400 and discovering it in review.

2. **MUT-4G-44 has two readings and only one of them is a bug.** "Move the call below the
   cascade" below `db.commit()` is caught, loudly, with the predicted `assert None is not None`.
   Below the delete *statements* but above the commit is **not** caught, and should not be: at
   that point no `DELETE` has been issued (SQLAlchemy holds the unit of work until the flush at
   commit) and `current_user.apple_sub` is still readable, so the revocation sends exactly the
   same request. B-43's two assertions — a live row, and zero deletes — are therefore correct
   and complete; there is nothing there to strengthen. The row's wording should become "below
   `db.commit()`".

3. **tests.md's 43b and 43c cannot bite where it puts them, because `revoke_token` swallows
   unconditionally.** "`raise` on a non-2xx status" and "require the key and 400 without it"
   applied *inside* `revoke_token` are no-ops: its own `except Exception` catches them and the
   four B-42 parameters stay green (measured: `4 passed` for both). The decision those rows are
   really about belongs to the **caller** — whether the route cares what `revoke_token`
   returned — so I applied them there, where both bite immediately and on exactly the
   parameters you would want (all four for the non-2xx rule, only `key_unset` for the required
   key). The honest statement of the design is: *the route cannot fail on revocation because it
   never looks at the result*, and that is a deliberate property, with a cost — a genuine bug
   inside `revoke_token` is invisible in production except as a log line. B-40 is the thing
   that would catch it in CI.
4. **`conftest.stmt_counter` cannot do what B-43 asks of it.** The case says "plus
   `stmt_counter.reset()` and an assertion that no `DELETE` statement had been issued", but
   `_StatementCounter` counts `SELECT`, `INSERT` and `UPDATE "user"` and **not** `DELETE`
   (`tests/conftest.py:167-190`), and tests.md forbids changing `conftest.py` in this sprint.
   B-43 therefore carries its own `_DeleteCounter` — the same `before_cursor_execute` pattern,
   on the same engine object, resolved through `tests.conftest` for the reason the
   `stmt_counter` docstring gives. Either the case or the fixture is wrong in the plan; I did
   not touch the fixture.
5. **`monkeypatch.undo()` is a trap in this file and B-41 would have hit it.** The autouse
   `apple_jwks` fixture and the test share one `MonkeyPatch` instance, so `undo()` inside a
   test also un-stubs `fetch_jwks` and the next request reaches the real
   `appleid.apple.com`. B-41 needs a *scoped* patch to capture its before-value, so it saves
   and restores `apple_keys.revoke_token` by hand in a `try/finally`. Worth a line in tests.md
   §"Test mechanics" for P4 and anyone after.
6. **tests.md names `auth_router.py` for MUT-4G-43 and `apple_keys.py` for 45, and the files are
   the other way round for 43.** The "never raise" guard is in `apple_keys.revoke_token` (see
   the decision above), so 43 is an `apple_keys.py` mutation. 45 is correctly placed. A Builder
   who looked for a `try/except` in the route would have found nothing to mutate and recorded a
   row that could not be applied.
7. **A failed revocation leaves my own B-42 rows for the module teardown to trip over.** Under
   MUT-4G-43 the deletion 500s, the planted `UserBook`/`Note`/`PushToken` rows survive, and the
   P2 module teardown's `session.delete(user)` then nullifies `userbook.user_id` and raises
   `sqlite3.IntegrityError: NOT NULL constraint failed`. The mutation is still unambiguously
   caught, but the *first* `E ` line in the output is the teardown's, not the assertion's —
   which is why this table's 43/43b/43c rows were re-measured with `--tb=line`. Anyone running
   a mutation that makes a deletion fail should expect the same noise and look for the `FAILED`
   summary lines rather than the first traceback.
8. **`jose.jwt.get_unverified_header` lets a raw `ValueError` through.** Handed something that
   is not a JWT it raises `ValueError: not enough values to unpack (expected 2, got 1)` from
   inside the base64 split, which jose then wraps as `JWSError` and `JWTError`. Verification
   already catches `JOSEError` so the route is unaffected; it is recorded because the chain is
   what MUT-4G-41 actually produces, and because a narrower `except JWTError` somewhere would
   let the `ValueError` out as a 500.
9. **`done-checklist` item 4 is now decidable and the answer is "inert".** It reads "set the
   three variables, **or** R-13 is knowingly inert and the PM has recorded that choice". The
   choice is recorded in pm-decisions E-4, the shipping state is inert, and B-42's `key_unset`
   parameter is the only one of the four that runs in production today. Item 11 cannot pass
   until both the `.p8` exists **and** finding 1 is resolved.
10. **Nothing here is platform-sensitive, with one measured caveat.** Every case is pure Python,
    SQLite and an in-process stub; no case reads a clock boundary, a path or a line ending.
    CI runs Linux and I ran Windows. The one thing I had to fix by hand was line endings:
    `tests/test_apple_auth.py` is CRLF in the working tree and an appended block arrived LF, so
    the file is normalised to CRLF throughout. No assertion depends on it; B-33 compares a
    `--numstat` and would have reported the whole file as rewritten.

## What is still not proved

Everything `build-notes-4g-api.md` §"What is still not proved" says, unchanged, plus:

- **Nothing proves Apple accepts our revocation.** B-40 proves the request shape and that the
  ES256 `client_secret` **verifies against the right public key** with the right `iss`, `sub`,
  `aud` and an `exp` inside Apple's ceiling — not merely that it decodes. Every case mocks the
  HTTP call. R-15 item 5 / P-4G-08 / done-checklist 11 is a one-time manual check with a
  throwaway Apple ID on TestFlight, and finding 1 above says what it will report today.
- **No PostgreSQL.** Nothing in this package touches the database schema, so this is inherited
  rather than new.
- **No Render log was read.** B-44 proves the discipline in-process, against five runs
  (one success and all four failure modes) with a control that the detector is not reading an
  empty capture. P-4G-12 is the deployment-side proof and it needs a deployment.
