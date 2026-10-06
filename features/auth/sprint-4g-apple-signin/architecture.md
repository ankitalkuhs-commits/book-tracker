---
screen: sprint-4g-apple-signin
feature: auth
status: draft — six escalations open; E-1, E-2 and E-4 block the build
last_verified: 2026-10-06
architect_verified: 2026-10-06 — every file:line in this document was opened on branch
  `sprint-4g-apple-signin` (base master @ `d26a13c`, deployed). Line numbers are from that commit.
  Nothing here was copied from another document: where Sprint 4F's architecture cites a line that has
  since moved, this document says so in place (see §"Two citations in 4F's documents have drifted").
depends_on: nothing in this repo. **Blocked on iOS plumbing that does not exist** — no iOS build, no
  bundle id registered with Apple, no `ios` profile in `eas.json`, and Google Sign-In unconfigured for
  iOS. See spec §"Blocked on" and E-2 / E-6.
---

## Risk summary (for the PM)

| Risk | Where it bites | What this design does |
|---|---|---|
| **A hand-rolled token check that only decodes.** The failure mode is total: anyone can mint a `sub` and an `email` and become any reader. Google's library hides all of this from `/auth/google`; there is no Apple equivalent in this project. | `POST /auth/apple` | RS256 verified against Apple's JWKS with an explicit algorithm allowlist, `iss`/`aud`/`exp`/`nonce` all checked, one 401 for every failure, **503 rather than 200 when Apple is unreachable**. The library is already a dependency and its behaviour was proved on this branch, not assumed (§"The verification, proved"). |
| **The email arrives once and never again.** If `sub` is not written on the first authorization, that reader is unrecognisable for ever and every later sign-in makes a new account. | `user.apple_sub` | A unique, indexed column, written in the same request as the first sign-in, with the schema-guard entry and deploy order that make a pre-migration deploy fail loudly instead of 500-ing. |
| **Hide My Email creates a duplicate account for a real reader.** The relay address cannot match their Google address, and no amount of cleverness recovers the link. | A returning reader's library looks empty | Honestly unsolved at the data layer. Branch 4 creates the account; the mitigation is to make it **visible** at the moment it happens rather than silent. **E-1 and E-5 are the PM's.** |
| **Linking by verified email is an account-takeover surface if `email_verified` is mishandled.** Apple sends it as the **string** `"true"` in some shapes, and `if claims.get("email_verified")` is **true for `"false"`**. | Branch 3 of the linking rule | Explicit coercion against the literal, `is_private_email` coerced the same way, and a required mutation test that feeds `"false"` and must go red. The naive check is the mutation. |
| **The bundle id is the audience, and the bundle id is wrong.** `app.json:30` says `com.bookpulse.mobile` — the old brand. | Every sign-in 401s if the two disagree | `aud` is an env var read per request, not a constant, so a bundle-id change is a Render edit and not a deploy. **E-2** lists the seven other things that move with it. |
| **Apple requires token revocation on deletion, and that needs a private key nobody has generated.** | `POST /auth/delete-account/me` | Designed as a best-effort step gated on `apple_sub IS NOT NULL` that can never block a deletion. **E-4** is the key. |
| **Shipping Apple alone does not unblock the iOS submission.** Google Sign-In has no iOS configuration at all. | The iOS build has one working button and one broken one | Named as **E-6**. Out of this sprint's scope, in this sprint's critical path. |
| **Nothing about the iOS flow can be proved in CI.** | The first TestFlight build | spec R-15 names each gap and its substitute proof. The design is built to be correct for **both** claim shapes so the device check is a confirmation and not the proof. |

---

## The verification, proved

This is the part of the design that could have been wrong, so it was executed against
`C:\Users\sonal\Documents\projects\book-tracker\.venv\Scripts\python.exe` on this branch rather than
recalled. A locally generated RSA key, a hand-built JWKS document, and an Apple-shaped token
(`iss: https://appleid.apple.com`, `aud: com.bookpulse.mobile`, `sub`, `exp`, `nonce`,
`email: …@privaterelay.appleid.com`, `email_verified: "true"`, `is_private_email: "true"`). Results:

| # | What was checked | Result |
|---|---|---|
| 1 | `jose.jwt.decode(token, jwks_dict, algorithms=["RS256"], audience=…, issuer=…)` with Apple's JWKS passed **as a dict** | **Verified.** No manual key construction, no `jwk.construct`, no PEM conversion. `email_verified` came back as `<class 'str'>` `'true'` — **the library does no coercion** |
| 2 | Wrong `aud` | Rejected, `JWTClaimsError` |
| 3 | Wrong `iss` | Rejected, `JWTClaimsError` |
| 4 | `alg: "none"` with the claims unchanged | Rejected, `JWTError` |
| 5 | `exp` in the past | Rejected, `ExpiredSignatureError` |
| 6 | A JWKS whose `kid` does not match the token header | **Still verified.** `python-jose` tries **every** key in the document and does not select by `kid`. Security-neutral — the signature must still match a published Apple key — but it means **we** must read the `kid` to decide when to refetch a rotated key set |
| 7 | Signing an **ES256** `client_secret` for `auth/revoke` with a PKCS8 EC private key, and `jwt.get_unverified_header` | Both work. R-13 adds **no** dependency either |

**Library decision, settled:** `python-jose[cryptography]==3.3.0`, already pinned —
`requirements.txt` is **UTF-16LE with a BOM** (first two bytes `FF FE`); decoded, the pin is on
line 8, `httpx==0.24.1` on 12, `google-auth==2.43.0` on 15, `requests==2.31.0` on 16. The installed
`cryptography` is 46.0.3. `app/auth.py:5` already imports `from jose import JWTError, jwt`, so this is
the project's existing JWT library and not a new one.

- `google-auth` cannot be reused: `google.oauth2.id_token` (`auth_router.py:10`) is Google-specific.
- `PyJWT[crypto]` is the other common choice and is **not** added — it would be a new pin for no gain.
- **Anyone editing `requirements.txt` must preserve UTF-16LE.** An editor that helpfully saves it as
  UTF-8 rewrites every byte of the file and produces a diff that looks like a total rewrite. This
  sprint adds no line to it, which is the safest possible outcome.

### What the library does *not* do, and must be done by hand

1. **`nonce`** is not a registered claim. `jwt.decode` ignores it. R-04's comparison is ours.
2. **`kid` selection** (case 6). Ours, and it is what triggers the one-shot JWKS refetch.
3. **`email_verified` coercion** (case 1). Ours, and it is the account-takeover gate (R-05).
4. **JWKS fetching and caching.** Ours. `requests==2.31.0` is already present and is what
   `google.auth.transport.requests` (`auth_router.py:11`) uses underneath, so it is the house choice.

---

## The linking design

spec R-06 is the rule. This section is why it is shaped that way and where it breaks.

### `sub` first, always — and why the order is the whole design

Every branch after the first exists only because branch 1 missed. The implication people get wrong is
that this makes the email branches rare: they are not rare, they are **once per reader**, and they are
the only moment at which the account they will use for ever is chosen. So:

- Branch 1 (`apple_sub` match) is the steady state and reads **no email at all**. That is deliberate:
  once a reader is known, a token whose `email` claim has changed — because they turned Hide My Email
  on, or changed their Apple ID address — must not be able to move them to a different row.
- The email is consulted **only** on a first sign-in, and only to answer one question: is this already
  a reader we know under another provider?

### Why relay addresses are never matched

A `@privaterelay.appleid.com` address is generated per app per Apple ID. It cannot equal a Google
address, so a lookup on it can succeed only against a row *this route* created on a previous Apple
sign-in — which branch 1 would already have matched by `sub`. A match that can only ever be a false
positive is not a lookup; it is a bug waiting for a collision. So branch 3 requires
`is_private_email` to coerce **false**, and `is_private_email` is coerced with the same strictness as
`email_verified` because Apple sends it in the same two shapes.

**Belt and braces:** the relay check is on `is_private_email`, **not** on the address suffix. A suffix
check is the kind of thing that looks equivalent and is not — Apple could change the domain, and a
reader whose own address happens to end that way would be mis-sorted. The suffix is a useful thing to
log, not to branch on.

### Failure modes, in full

| # | Mode | Who it hits | What happens | Mitigation in this sprint |
|---|---|---|---|---|
| **F1** | A reader signed up with Google as `alice@gmail.com`, then taps Apple and chooses **Hide My Email**. Apple asserts `…@privaterelay.appleid.com`. | A real, existing reader | Branch 4: a **second, empty account**. Alice sees an empty library and concludes the app lost her books. | **Unavoidable at the data layer** — the relay address carries nothing that links to her. What is in scope: both buttons stay visible on the login screen so she can still choose Google, and the client is told `is_new: true` so it can say so. **Whether it says so, and how, is E-5.** |
| **F2** | Same reader, same real email on both providers. | A real, existing reader | Branch 3 links. No duplicate. | This is the good case and the entire reason branch 3 exists. |
| **F3** | The reader turns Hide My Email off, or de-links the app in Apple ID settings. | An Apple reader | The stored relay address stops forwarding and becomes undeliverable. | Costs nothing today — this API sends no email. It becomes a real defect the day it does, and it is written here so that day is not a surprise. |
| **F4** | `apple_sub` is not persisted on the first authorization. | Every Apple reader | Catastrophic: every sign-in creates a new account, for ever, and the reader can never get back to their library. | The column, the unique index, the schema-guard entry, the deploy order, and a mutation test whose whole job is to catch exactly this (B-11). |
| **F5** | The app is transferred to a different Apple developer team. | Every Apple reader at once | Apple's `sub` is team-scoped, so it changes for everybody. Apple has a transfer-identifier flow for this. | Out of scope. Written down so that "`sub` is the identity" is not read as "`sub` is eternal". |
| **F6** | One person, two Apple IDs. | A reader | Two accounts, by design. `apple_sub` is never overwritten (branch 2 → 401). | Intended, not a defect. |
| **F7** | `email_verified` arrives as the string `"false"` and the code truth-tests it. | Anyone whose email an attacker can get Apple to assert unverified | **Account takeover**: branch 3 links to the victim's row. | R-05's explicit coercion, and the mutation test that *is* the naive check. Proved on this branch that the string reaches the handler as a `str` (§"The verification, proved", case 1). |
| **F8** | An attacker signs up with Apple using the victim's real address **before** the victim ever signs in; the victim then signs in with **Google**. | A reader who has not signed up yet | `/auth/google` matches on email (`auth_router.py:83`) and logs the victim into the attacker's row. | **This hole exists today, for Google alone, and is not created by this sprint.** It is the mirror image of branch 3 and the PM should know the shape is symmetric. Fixing it is a separate sprint (it needs email verification on the Google path, which Google's `email_verified` would support). |

### The one load-bearing external assumption

Branch 3 rests entirely on Apple refusing to assert `email_verified` for an address the Apple ID holder
has not proven control of. Everything else in the rule is enforced by our own code or by a signature.
If that assumption ever failed, branch 3 is the hole and the response is to delete branch 3 — accepting
F2 as the cost. Stated here so the answer is already decided if the question ever arrives.

---

## Call sites

Line numbers are branch `sprint-4g-apple-signin` @ `d26a13c`. Every one was opened.

### P1 — the column and the guard (API, deploy-order-bearing)

| File:line | Today | After |
|---|---|---|
| `app/models.py:41` (`User.is_bot`, Sprint 4F) | the insertion point | `+ apple_sub: Optional[str] = Field(default=None, index=True, unique=True)` on the following line, with a comment saying the row is the identity and the email is not |
| `app/schema_guard.py:10-20` `REQUIRED_COLUMNS` | 4 entries (two 4C at `:11-12`, two 4F at `:18-19`) | `+ ("user", "apple_sub")`, **added in the deploy that follows the SQL, never the same push**. `assert_migrated` raises at `:39-41`; `app/main.py:166` calls it from the startup event, so Render fails the deploy and the previous version keeps serving |

### P2 — the route and the linking rule (API, security-bearing)

| File:line | Today | After |
|---|---|---|
| `app/routers/auth_router.py:20-21` `GoogleAuthIn` | `{token}` | `+ class AppleAuthIn(BaseModel)` — `identity_token: str`, `nonce: str`, `full_name: Optional[str] = None` |
| `app/routers/auth_router.py:111-121` `_review_login_config`, `:176-183` `_bot_login_config` | the pattern to copy | `+ _apple_config()` → `(audiences: list[str],)`, read **per request** for the same two reasons those two are (`:112-117` says them), parse copied from `:181-182` |
| `app/routers/auth_router.py` (new, after `bot_login` ends at `:236`, before `request_account_deletion` at `:239`) | — | `POST /auth/apple`. Env-gated 404 (the `:209-210` shape), JWKS verify, the five-branch rule, one 401. `include_in_schema` stays **default (true)** — unlike `/auth/review-login` (`:127`) and `/auth/bot-login` (`:189`), this is a public reader-facing route like `/auth/google` (`:36`) |
| `app/apple_keys.py` (new module) | — | the JWKS provider: `fetch_jwks()` and a TTL cache, plus `verify_identity_token(token, nonce, audiences)` returning the claims or raising. **One module-level seam so tests monkeypatch the fetch and CI makes no network call** (`.github/workflows/ci-tests.yml:36` — the suite runs with no secrets) |
| `app/crud.py:12-13` `get_user_by_email` | the email lookup | unchanged, reused by branch 3 |
| `app/crud.py:16-30` `create_user` | derives `username` from the email prefix (`:19-24`) and commits (`:28`) | unchanged. Branches 4 and 5 call it, then set `apple_sub` and commit again. **Two commits, deliberately** — see §"Why not one transaction" |

### P3 — revocation on deletion (API)

| File:line | Today | After |
|---|---|---|
| `app/apple_keys.py` (new, same module) | — | `+ revoke_token(apple_sub_bearing_user)` and the ES256 `client_secret` builder. Grouped with verification because both are "the Apple protocol", and it keeps `auth_router.py` free of crypto |
| `app/routers/auth_router.py:263` (`uid = current_user.id`, the first line of `delete_own_account`) | the deletes begin | a best-effort revocation **above** it, gated on `current_user.apple_sub`. Must run before `:346-348` deletes the row, and must not raise |
| `context/deployment/README.md` | — | `APPLE_AUDIENCES`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, and the statement that `/auth/apple` 404s until the first is set |

### P4 — iOS client

| File:line | Change |
|---|---|
| `book-tracker-mobile-stitch/package.json` | `+ expo-apple-authentication`, `+ expo-crypto` — **whatever `npx expo install` resolves for Expo `~54.0.33`**, not a version invented here |
| `app.json:28-31` (`ios` block, `bundleIdentifier` at `:30`) | `+ "usesAppleSignIn": true` |
| `app.json:5`, `:35` | `version` / `android.versionCode` bump (currently `2.2.4` / `63`) — `scripts/check-version-bump.js --strict` gates the AAB build |
| `src/screens/LoginScreen.js:30-33` (the existing `useEffect`) | `+ await AppleAuthentication.isAvailableAsync()` into a new `appleAvailable` state. The `GoogleSignin.configure` at `:31` and the `warmUp()` at `:32` are not touched |
| `src/screens/LoginScreen.js` (new, immediately above the Google `TouchableOpacity` at `:103`) | `{appleAvailable && <AppleAuthenticationButton … onPress={handleAppleSignIn} />}`. **Above**, full width, matching `styles.googleBtn`'s radius and rendered height (`:179-186`) and its `marginBottom: 20` (`:183`) |
| `src/screens/LoginScreen.js:35-53` (`handleSignIn`) | **not edited.** A sibling `handleAppleSignIn` is added beside it, with the same `setLoading` discipline and the same silent-cancel treatment the `SIGN_IN_CANCELLED` branch gets at `:46` |
| `src/screens/LoginScreen.js:179-187` (styles) | `+ appleBtn` with an explicit `height` matching the Google button's rendered height, so the "same size" claim is a number a test can assert rather than a visual impression |
| `src/services/api.js:72-81` (`authAPI`) | `+ appleLogin(identityToken, nonce, fullName)` beside `googleLogin` (`:73-76`). `saveToken` (`:77`) is reused unchanged |

Nothing in P4 touches `FeedScreen.js`, `SettingsScreen.js` or any other screen. The Android-visible
diff is one `useState` and one line inside an existing `useEffect`.

### Not in any package, and named so they are not lost

- `features/auth/index.md:25` and `:55` call the deletion route `DELETE /auth/delete-account/me`; it is
  a **`POST`** (`auth_router.py:253`). `:25` and `:58-59` also say `/auth/login` and `/auth/signup`
  still exist; `tests/test_auth.py:23-40` proves they do not. Two one-line doc fixes, **deliberately
  outside this sprint's diff**.
- `book-tracker-frontend-stitch/src/pages/LoginPage.jsx:15` — `operatingSystem: 'Web, Android'` becomes
  wrong when iOS ships. One line, not bundled (spec R-14).
- `tests/test_query_budget.py` needs **nothing**. `BUDGETS` (`:570`) is an explicit list of 44
  endpoints asserted by literal count (`:716` `EXPECTED_ENDPOINTS = 44`, `:812-830`), and the
  cross-check against 4E's architecture (`:844-858`) parses only rows beginning `GET ` — so a new
  `POST` route is neither required nor permitted to appear. Verified by reading the regex at `:850`,
  not by assumption.

### Two citations in 4F's documents have drifted

Recorded because the house rule exists for a reason and because a future reader will otherwise trust
them:

- 4F's `architecture.md` P1 table says the schema guard "exits the process at startup
  (`schema_guard.py:31-34`)". On this branch `:31-34` is inside the `information_schema` query and the
  `except`. The guard **raises `RuntimeError`** at `:39-41`, from the startup event at
  `app/main.py:162-166`. The effect is the same — uvicorn does not serve — but the mechanism and the
  line are both different. **This sprint cites `:39-41` and `app/main.py:166`.**
- 4F's `architecture.md` cites `app/deps.py:87` for the `last_active` stamp and `:129` for
  `get_admin_user`. On this branch `get_current_user` begins at `app/deps.py:76`; the `last_active`
  write has moved into the background task above it (Sprint 4E's P1 shipped). **This sprint cites
  `app/deps.py:76` and nothing else in that file.**

---

## Data

### `user.apple_sub` — new column, **a separate PM step (step 8)**

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS apple_sub VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_apple_sub ON "user" (apple_sub);
```

- **Nullable**, so it is metadata-only on PostgreSQL and no existing row is rewritten. Every current
  reader is `NULL` and that is correct — they have no Apple identity.
- **`VARCHAR(255)`** matches the `bot_email` / `dedup_key` width already used in `bot_post`
  (`context/PM_SQL_QUEUE.md:135`, `:137`). Apple's `sub` is well under 60 characters.
- **Unique, and it is the unique index that is the control.** PostgreSQL's unique index ignores `NULL`s,
  so thousands of Google-only readers coexist while at most one row can ever hold a given Apple subject.
  This is what makes "two concurrent first sign-ins" safe without a lock: the loser raises
  `IntegrityError` and is turned into an error response using the shape this codebase already uses for
  exactly this — `app/routers/follow_router.py:37-44`, where a concurrent duplicate follow is caught at
  `:41`, rolled back at `:43` and re-raised as an HTTP error at `:44`. (Verified on this branch; the
  precedent is real and it is the F-53 fix.)
- The index is a separate statement because, by house rule, creating an index is never bundled into a
  sprint — the PM decides it (`context/PM_SQL_QUEUE.md:110-112` states this for step 6).
- **It is step 8.** Steps 6 (`:89`) and 7 (`:127`) are Sprint 4F's and are still outstanding; the
  answers table at `:161-170` has rows for both. Appending at 8 keeps the numbering the PM works from
  stable, and P1 owns the edit to that file and to the answers table.

Verification to send back:

```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_schema = current_schema() AND table_name = 'user' AND column_name = 'apple_sub';
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user' AND indexname = 'uq_user_apple_sub';
-- must return 0: nothing has been written yet
SELECT count(*) FROM "user" WHERE apple_sub IS NOT NULL;
```

### The synthesised email (branch 5)

`user.email` is `nullable=False` (`app/models.py:30`) and `crud.create_user` derives `username` from the
email prefix (`app/crud.py:19-24`), so branch 5 must supply something. The form:

```
apple-<first 16 chars of a hex digest of the Apple subject>@users.noreply.trackmyread.com
```

- **Unique** by construction, so the `email` lookup in branch 3 can never match it by accident and two
  branch-5 readers can never collide.
- **Obviously internal** to anyone who sees it in the admin user list, and under a subdomain of a domain
  this project owns and does not route mail to — the `users.noreply.<domain>` convention.
- **A digest, not the raw subject**, so the Apple subject is not sitting in a column that is returned to
  clients. `apple_sub` itself is never serialised in any response (spec R-03).
- `crud.create_user` then derives the username `apple<hex>` — ugly and reader-visible. **This is the
  known cost of branch 5 and it is E-5's second half**, not something to paper over here.

### Why not one transaction

Branches 4 and 5 call `crud.create_user`, which commits at `app/crud.py:28`, and then set `apple_sub`
and commit again. Sprint 4F proved a single-transaction pattern is available — it added `commit=False`
to `crud.create_note` for exactly this reason — and the same could be done to `create_user`. It is
**not** done, on purpose:

- `crud.create_user` is called by `/auth/google` (`auth_router.py:91`) and `/auth/review-login` (`:159`).
  Adding a kwarg to it to serve one new route puts a shared function's transaction boundary in play for
  two routes that get no benefit.
- The failure window is "the user row committed and `apple_sub` did not". Its consequence is one reader
  whose next sign-in takes branch 3 or 4 instead of branch 1. Branch 3 **re-links the same row**, because
  the email was just written to it. So the window self-heals for branch 4 and costs a duplicate only for
  branch 5, where the synthesised email will not be re-derived identically only if the digest changes —
  and it will not, because it is a pure function of the subject. **So branch 5 self-heals too.**
- A second commit on a route that runs once per reader per lifetime is not a cost worth a shared-function
  change.

This is a deliberate divergence from 4F's atomic-dedup decision and the reason is written here so nobody
"fixes" it into a `commit=` kwarg later without reading this paragraph.

### Deploy order (not negotiable)

1. PM runs SQL step 8 and returns the verification output.
2. Deploy the API **with** `("user", "apple_sub")` in `schema_guard.REQUIRED_COLUMNS`. If step 1 was
   skipped, `assert_migrated` raises at `app/schema_guard.py:39-41` from the startup event
   (`app/main.py:166`), Render fails the deploy, and the previous version keeps serving. That is the
   guard working, not a problem.
3. Set `APPLE_AUDIENCES` on the API service. **Until this moment `POST /auth/apple` is a 404** and no
   Apple sign-in is possible — which is the correct state while there is no iOS build.
4. Set `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, or record that R-13 is knowingly inert
   (E-4).
5. Only then does the iOS build matter. Steps 1–4 are safe to land with no iOS app in existence, and
   should: they are the part that can be tested.
6. iOS build, TestFlight, the manual checks in spec R-15, submission.

Steps 1–4 change nothing for an existing Android or web reader. There is no client that calls
`/auth/apple` until P4 ships.

---

## Data flow — one Apple sign-in

```
iOS app, LoginScreen
  └─ isAvailableAsync() -> true          (false on Android and on iOS < 13: no button rendered)
  └─ nonce = 32+ random chars            (expo-crypto; NOT Math.random)
  └─ AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL], nonce })
       ├─ cancelled -> silent, exactly as SIGN_IN_CANCELLED is at LoginScreen.js:46
       └─ credential { identityToken, fullName?, email? }
            fullName and email are populated on the FIRST authorization only.
            fullName is NOT in the token, so it must travel in the request body.
  └─ POST /auth/apple { identity_token, nonce, full_name? }

API, /auth/apple
  ├─ APPLE_AUDIENCES unset -> 404. The route does not exist in dev, CI or a fork
  ├─ read header kid (jwt.get_unverified_header)
  ├─ JWKS: cached? -> use it. kid absent from the cache -> ONE refetch, then fail
  │     fetch fails -> 503. Never 200, never a token
  ├─ jwt.decode(token, jwks, algorithms=["RS256"], audience=APPLE_AUDIENCES,
  │             issuer="https://appleid.apple.com")      # signature + aud + iss + exp
  ├─ hmac.compare_digest(claims["nonce"], body.nonce)    # absent claim -> 401
  ├─ sub present and non-empty                           # else 401
  ├─ verified   = coerce(claims.get("email_verified"))   # "true"/True ONLY
  ├─ is_relay   = coerce(claims.get("is_private_email"))
  └─ the rule, first match wins:
       1. row with this apple_sub            -> sign in.            is_new: false
       2. row by email has a DIFFERENT
          apple_sub                          -> 401. never overwrite
       3. email and verified and not is_relay
          and a row has that email           -> set apple_sub on it. is_new: false
                                                (full_name IGNORED here)
       4. email and verified, no row          -> create.             is_new: true
       5. no usable email                     -> create, synthesised email. is_new: true
     then: last_active = utcnow()  (auth_router.py:95's rule — a login is activity)
           token = create_access_token({"sub": user.email})   # 30 days, no provider claim
     -> { access_token, is_new, user: { id, name, email } }   # /auth/google's shape exactly

iOS app
  └─ authAPI.saveToken(access_token)      (src/services/api.js:77, reused unchanged)
  └─ is_new -> OnboardingScreen           (the existing gate, features/auth/index.md:117)
```

### Deletion, for an Apple reader

```
Settings -> Account -> Delete account        (SettingsScreen.js:625)
  └─ native destructive confirm              (:300-310)
  └─ deregisterPushToken(); profileAPI.deleteAccount()   (:306 -> api.js:209)
       POST /auth/delete-account/me          (auth_router.py:253)
         ├─ current_user.apple_sub is not NULL?
         │    └─ client_secret = ES256 JWT  { iss: TEAM_ID, sub: <client_id>,
         │       |                            aud: "https://appleid.apple.com", iat, exp }
         │       POST https://appleid.apple.com/auth/revoke
         │         any failure, any timeout, unconfigured -> log the status code, CONTINUE
         └─ the existing cascade, unchanged  (:267-348), commit at :349
       -> { "message": "Account deleted" }   (:351)
  └─ onLogout({ alreadyDeregistered: true }) (:306)
```

A Google-only reader's deletion makes **no** outbound call and is byte-identical to today.

---

## Security review

### 1. What a forged or stolen Apple token reaches

| Attempt | Blocked by |
|---|---|
| Mint a token with an arbitrary `sub` / `email` | RS256 against Apple's JWKS. Needs Apple's private key |
| `alg: "none"`, or HS256 signed with something we hold | The explicit `algorithms=["RS256"]` allowlist. Proved rejected (§"The verification, proved", cases 4) |
| Replay a token minted for another app | `aud` ∈ `APPLE_AUDIENCES`. Proved enforced (case 2) |
| Replay an expired token | `exp`, with the same 10s skew `/auth/google` allows (`auth_router.py:59`). Proved enforced (case 5) |
| Replay this app's token in a different request | The nonce comparison (R-04). **Partial** — see E-3, stated honestly |
| Impersonate an issuer | `iss` must be exactly `https://appleid.apple.com`. Proved enforced (case 3) |
| Serve a rotated/attacker key set | The JWKS comes from `appleid.apple.com` over TLS and from nowhere else. There is no "key from the token header" path, ever |
| **Degrade verification by taking Apple offline** | A fetch failure is **503**. This is the one that is easy to get wrong, because the tempting code is `except: pass` |
| Link to a victim's account with an unverified email | R-05's coercion. **This is F7 and it is the sharpest edge in the sprint** |
| Take over a row that already has an Apple identity | Branch 2 → 401. `apple_sub` is written only when NULL |
| Rename or re-address an existing reader through the link path | `full_name` is read only on create; the link path writes `apple_sub` and nothing else |

### 2. The token we mint

An ordinary 30-day reader token (`app/auth.py:17`, `:64-69`), carrying **no** provider claim. Same
reasoning Sprint 4F recorded for bots (its E-4): `get_current_user` resolves the row on every request
(`app/deps.py:76`), so the row is the single authority and a second authority in the token would
eventually disagree with it. A provider claim would also be the thing an attacker holding `SECRET_KEY`
could forge; the column cannot be forged.

### 3. The private key for revocation

`APPLE_PRIVATE_KEY` is a PKCS8 PEM in an environment variable on Render. It signs a `client_secret`
valid for at most an hour and reaches exactly one endpoint. Compromise lets an attacker revoke our
users' Apple sessions — a nuisance, not a data breach: it reads nothing and writes nothing in our
database. Rotation is a new key in the Apple portal plus two env edits.

**It must never reach GitHub Actions.** The repository is **public** (Sprint 4F verified this with
`gh repo view --json visibility` → `{"visibility":"PUBLIC"}` and it is the fact that reshaped that
sprint). Nothing in this sprint needs a secret in CI, and the test suite is designed so nothing ever
will — the JWKS provider is injectable and the revocation HTTP call is mocked.

### 4. Logging

No token, no `client_secret`, no response body, no `apple_sub`, no email. Status codes and claim
*names* only. GitHub's secret masking is best-effort and does not survive JSON-escaping or
concatenation, which is why Sprint 4F made this a rule rather than a habit; the same rule applies here
even though these logs are Render's and not CI's.

Note that `/auth/google` violates this today: `auth_router.py:61` and `:65` print the client id and the
verification error, and `:71` and `:106` put the library's error string in the **response**. Named, not
fixed (spec §"Not building"). `/auth/apple` returns one opaque 401 and prints no claim values.

### 5. `apple_sub` is never serialised

It appears in no response, in no admin listing, in no log. It is an internal join key. A reader-visible
Apple subject would let one app's users be correlated with another's if the subject ever leaked from
both — the reason Apple scopes it per app in the first place.

### 6. Rate limiting

There is none, anywhere in this service. `/auth/apple`'s failure path does one JWKS cache read, one
signature verification and at most one indexed lookup. Adding the service's only rate limit to one
route would be a false sense of coverage; it is a known gap, recorded exactly as `/auth/bot-login`'s
was. The JWKS one-shot-refetch rule is what stops an attacker turning a flood of unknown-`kid` tokens
into a flood of outbound requests to Apple — **that** is the amplification risk on this route, and it
is closed by design rather than by a limiter.

---

## Test strategy

Severity: **Critical** = authentication, the linking rule, deletion. **Major** = a branch or a client
affordance is dead. **Minor** = cosmetic.

House rule: every Critical and Major case names the **one-line product change that must turn it red**. A
case with no such mutation does not count as coverage.

**The seam that makes all of this possible with no network and no Apple account:** one injectable JWKS
provider in `app/apple_keys.py`. Tests generate an RSA key with `cryptography`, build a JWKS document,
mint Apple-shaped tokens with `jose.jwt.encode`, and monkeypatch the fetch. This was executed on this
branch before it was specified (§"The verification, proved"), so the fixture is known to work rather
than hoped to.

### API — verification (pytest, `tests/test_apple_auth.py`, new file)

| # | Case | Sev | Mutation that must turn it red |
|---|---|---|---|
| B-01 | `POST /auth/apple` returns **404** when `APPLE_AUDIENCES` is unset | Crit | Delete the env guard |
| B-02 | A well-formed, correctly signed token → 200, and the token it returns authenticates on a protected route | Crit | Invert the verification result |
| B-03 | A token signed by a key **not** in the JWKS → 401, and **no `user` row is created** | Crit | Pass `options={"verify_signature": False}` |
| B-04 | `alg: "none"` with valid-looking claims → 401 | Crit | Drop `algorithms=["RS256"]` |
| B-05 | A token signed HS256 with `SECRET_KEY` → 401 | Crit | Add `"HS256"` to the allowlist |
| B-06 | Wrong `aud` → 401; the **same** token with that aud added to `APPLE_AUDIENCES` → 200 | Crit | Drop the `audience=` argument (the control half is what proves the test is not vacuous) |
| B-07 | Wrong `iss` → 401 | Crit | Drop `issuer=` |
| B-08 | Expired `exp` → 401; 5s-expired still passes on the 10s skew | Crit | Remove the skew, or remove `exp` verification |
| B-09 | `nonce` mismatch → 401; **absent `nonce` claim → 401** | Crit | Skip the comparison when the claim is missing |
| B-10 | A token whose `kid` is not in the cache triggffers exactly **one** refetch, then 401 | Major | Loop the refetch (this is the amplification risk in §6) |
| B-11 | **JWKS fetch raising → 503, and no token in the body** | Crit | `except Exception: pass` around the fetch |
| B-12 | Empty or absent `sub` → 401 | Crit | Default `sub` to the email |
| B-13 | `APPLE_AUDIENCES` is read **per request**: changing it mid-test changes the outcome | Major | Read it at import time |

### API — the linking rule (same file)

| # | Case | Sev | Mutation |
|---|---|---|---|
| B-20 | **Branch 1.** Second sign-in with the same `sub` → the **same** `user.id`, `is_new: false`, and `count(User)` unchanged | Crit | Remove the `apple_sub` persistence from the create path. *(This is F4 and it is the single most important case in the suite.)* |
| B-21 | **Branch 1 ignores the email.** Same `sub`, a **different** `email` claim → same row, and the row's `email` is **unchanged** | Crit | Consult the email before `apple_sub`; or write the email on match |
| B-22 | **Branch 3.** A Google reader exists with `alice@example.com`; an Apple token with that email, `email_verified` true, `is_private_email` false → **that** row, `is_new: false`, `apple_sub` now set, and `name`/`username`/`is_admin` unchanged | Crit | Create instead of linking |
| B-23 | **Branch 3 refuses an unverified email** — parametrised over `"false"`, `False`, `None`, absent, `""`, `"1"` → a **new** account, not a link | Crit | **`bool(claims.get("email_verified"))`.** The `"false"` parameter is the one that goes red, and a suite without it does not cover R-05 |
| B-24 | **Branch 3 refuses a relay**, parametrised over `is_private_email` as `True` and `"true"` → new account | Crit | Branch on the address suffix instead of the claim; or drop the relay condition |
| B-25 | **Branch 2.** A row already holds a different `apple_sub` and the email matches → **401**, and that row's `apple_sub` is unchanged | Crit | Overwrite `apple_sub` when it is already set |
| B-26 | **Branch 4.** Verified relay email, no existing row → new account, `is_new: true`, the relay address stored | Crit | Link it to something |
| B-27 | **Branch 5.** No `email` claim at all → new account with a synthesised, unique email; two different `sub`s produce two different emails | Crit | Reuse one placeholder for everybody |
| B-28 | **`full_name` is create-only.** A link (branch 3) and a match (branch 1) with `full_name: "Attacker"` leave `user.name` **untouched** | Crit | Apply `full_name` unconditionally |
| B-29 | Two concurrent first sign-ins with one `sub` → one row. The loser gets a deterministic error, never a second row | Crit | Drop `unique=True` from the column |
| B-30 | Response shape is key-for-key `/auth/google`'s, and the token carries no provider claim | Major | Add a key, or add a claim |
| B-31 | `last_active` is written on an Apple login | Minor | Remove the write |
| B-32 | `schema_guard.REQUIRED_COLUMNS` contains `("user", "apple_sub")` | Major | Remove it — this is what makes a pre-migration deploy fail loudly |
| B-33 | **Every existing test in `tests/` passes unedited**, and the suite stays above the CI floor of 715 (`.github/workflows/ci-tests.yml:61`) | Crit | Change any existing response key |
| B-34 | `apple_sub` appears in **no** response body across `/auth/apple`, `/profile/{id}`, `/users/search` and `/admin/users` | Major | Serialise it anywhere |

### API — revocation (same file)

| # | Case | Sev | Mutation |
|---|---|---|---|
| B-40 | Deleting an account with `apple_sub` set calls `auth/revoke` once, with a `client_secret` that decodes to the right `iss`/`sub`/`aud` and an `exp` within an hour | Crit | Send the raw `.p8`, or omit the call |
| B-41 | Deleting a **Google-only** account (`apple_sub IS NULL`) makes **no** outbound call, and the response is byte-identical to today's | Crit | Call revoke unconditionally |
| B-42 | `auth/revoke` raising, timing out, or being unconfigured → **the deletion still completes** and the user row is gone | Crit | Let the exception propagate. *(5.1.1(v) outranks revocation: a reader must be able to delete when Apple is down.)* |
| B-43 | Revocation runs **before** the row is deleted | Major | Move it after `:346-348`, where `apple_sub` no longer exists |
| B-44 | No log line contains the private key, the `client_secret`, a token or a response body — the detector is run against a deliberately leaking call to prove the detector works | Crit | `print(resp.text)` on failure |

### iOS client (`node --test`, the existing pattern)

| # | Case | Sev | Mutation |
|---|---|---|---|
| A-01 | `isAvailableAsync()` false → **exactly one** sign-in button, and it is Google's | Crit | Branch on `Platform.OS === 'ios'` (the test forces availability false on an iOS platform and must catch the dead button) |
| A-02 | `isAvailableAsync()` true → two buttons, Apple **first**, with equal measured width, height and corner radius | Crit | Reorder them, or shrink the Apple button |
| A-03 | Neither button is inside a collapsed/disclosure container, and both are above the fold at the smallest supported width | Major | Wrap Apple in a "more options" toggle |
| A-04 | A fresh nonce per attempt: two sign-in attempts in one session produce two different nonces, each ≥32 chars, sourced from `expo-crypto` | Crit | Hoist the nonce to module scope; use `Math.random()` |
| A-05 | `ERR_REQUEST_CANCELED` shows no alert; any other error shows one | Major | Alert on cancel (an iOS reader who dismisses the sheet must not be told sign-in failed) |
| A-06 | `full_name` is sent **only** when the credential carries it | Major | Send `null` as a string, or synthesise a name on the client |
| A-07 | The Android bundle contains exactly one sign-in button and the Google block is byte-identical to `d26a13c` | Crit | Any edit inside `LoginScreen.js:103-117` |

### Non-vacuity rules (inherited from 4C K-08 and 4F)

- Every linking case asserts a **control** that fails if the setup did not take effect: B-22 asserts the
  pre-existing row's id *and* that a second, unrelated reader was not touched; B-06 asserts both the
  rejection and the acceptance of the same token.
- B-23 and B-24 are **parametrised over an explicit list of claim shapes**, and the test first asserts
  the list's length, so a shape cannot be quietly dropped to make the suite green.
- B-44 runs its detector against a synthetic positive.
- No test may construct a `user` row with `apple_sub` directly and then assert branch 1. Branch 1 must
  be reached by **two real `/auth/apple` calls**, or F4 is not actually covered.

### Production checks (QA/PM, after deploy — see spec R-15 for what cannot be tested at all)

| # | Check |
|---|---|
| P-01 | `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='user' AND column_name='apple_sub'` → one row, nullable |
| P-02 | `SELECT indexdef FROM pg_indexes WHERE indexname='uq_user_apple_sub'` → a UNIQUE index |
| P-03 | `POST /auth/apple` with a junk token on production → 401 (not 500, not 200) |
| P-04 | `APPLE_AUDIENCES` unset on a staging service → `/auth/apple` 404s there |
| P-05 | TestFlight: sign in, force-quit, sign in → same account, same library |
| P-06 | TestFlight: sign in with a real email matching an existing Google account → that account |
| P-07 | TestFlight: sign in with Hide My Email → a new empty account, and the reader is told |
| P-08 | TestFlight: delete the account; TrackMyRead leaves that Apple ID's "Apps Using Apple ID" |
| P-09 | `SELECT apple_sub, count(*) FROM "user" WHERE apple_sub IS NOT NULL GROUP BY 1 HAVING count(*)>1` → no rows |
| P-10 | Render logs for one Apple sign-in contain no token, no email, no `sub` |

---

## Work packages

Four. File sets are disjoint. **P1 must land and deploy before P2** (P2 reads the column P1 declares,
and P1's schema-guard entry must only ship after the PM's SQL). P3 depends on P2's module. P4 depends
on nothing in this repo and everything outside it (E-2, E-6).

| # | Package | Files (exclusive) | Requirements |
|---|---|---|---|
| **P1** | The column, the guard, the PM step | `app/models.py`, `app/schema_guard.py`, `context/PM_SQL_QUEUE.md`, `features/auth/index.md` | R-03 (the column half), R-11's SQL |
| **P2** | Verification and the linking rule | `app/apple_keys.py` (new), `app/routers/auth_router.py` (the new route and `_apple_config` **only**), `tests/test_apple_auth.py` (new; B-01..B-34) | R-01, R-02, R-03, R-04, R-05, R-06, R-07, R-08 |
| **P3** | Revocation on deletion | `app/apple_keys.py` (the revoke half), `app/routers/auth_router.py` (`delete_own_account`'s first lines **only**), `tests/test_apple_auth.py` (B-40..B-44), `context/deployment/README.md` | R-12 (verification), R-13 |
| **P4** | iOS client | `book-tracker-mobile-stitch/{package.json,app.json}`, `src/screens/LoginScreen.js`, `src/services/api.js`, `__tests__/appleSignIn.test.mjs` (new; A-01..A-07) | R-09, R-10, R-11 |

**`app/routers/auth_router.py` and `app/apple_keys.py` each appear in two packages.** Sprint 4F hit the
same problem with `likes_comments.py` and resolved it by giving one package the whole file. That does
not work here — P2 and P3 are different requirements with different escalations, and P3 can be held
back if E-4 is unanswered while P2 ships. So instead the split is by **function**, and it is enforced:

- P2 adds `AppleAuthIn`, `_apple_config` and the `/auth/apple` route, between `bot_login`'s end
  (`auth_router.py:236`) and `request_account_deletion` (`:239`). It does not go near
  `delete_own_account`.
- P3 adds only the revocation block above `auth_router.py:263`, and the revoke half of
  `app/apple_keys.py`. It does not touch the route P2 added.
- **P3 merges after P2**, so git resolves the two additions as separate hunks hundreds of lines apart.
  The merger confirms that in the diff rather than trusting this paragraph.

### Merge and deploy order

1. **P1 merges.** It is inert on its own: a nullable column in `models.py` that PostgreSQL does not have
   yet. **Do not deploy it with the schema-guard entry until the PM has run step 8** — the entry and the
   SQL are the whole point of the ordering, and `app/schema_guard.py:39-41` will fail the deploy if the
   order is broken. (That is the guard succeeding. It is still a failed deploy somebody has to explain.)
2. **PM runs SQL step 8.** Returns the verification output.
3. **Deploy P1.** `/version` check.
4. **P2 merges and deploys.** `APPLE_AUDIENCES` stays unset, so the route 404s and nothing can use it.
   Every one of B-01..B-34 runs in CI with no network and no secret.
5. **Set `APPLE_AUDIENCES`.** The route goes live. There is still no client calling it.
6. **P3 merges and deploys**, once E-4 has produced a key — or merges with R-13 knowingly inert, if the
   PM records that choice. P3 is **not** a prerequisite for P4 in code, but it **is** a prerequisite for
   submission.
7. **P4** is gated on E-2 (the bundle id) and, for the submission to be worth making, on E-6 (Google on
   iOS). It is the last thing to land and the only thing that cannot be verified before it lands.

**Nothing in steps 1–5 is visible to an existing Android or web reader.** That is intentional: it lets
the testable 80% of this sprint ship and deploy while the untestable 20% waits on hardware and on
Apple.

---

## Escalations

Six. **E-1, E-2 and E-4 block the build.** E-3, E-5 and E-6 do not block P1–P3 but each changes
something before submission.

### E-1 — The linking rule. **BLOCKING.** This is the PM's call, not the architect's.

spec R-06 proposes: `apple_sub` first; then link on a **real, Apple-verified, non-relay** email that
matches an existing reader; create in every other case; never overwrite an existing `apple_sub`.

The reason this is escalated rather than decided: **branch 4 creates a second account for a real reader
who chooses Hide My Email** (failure mode F1). She has a library under her Google account and she will
see an empty one. No amount of engineering recovers the link, because the relay address contains nothing
that points at her. The options the PM is actually choosing between:

- **(a) The proposed rule.** Links the common case (same real email on both providers, F2), duplicates
  the Hide-My-Email case (F1). Smallest, and the only option whose failure is visible to the reader at
  the moment it happens.
- **(b) Never link; always create on a first Apple sign-in.** Simplest and safest against F7 and F8
  entirely — there is no email branch to attack. Cost: **every** reader who uses the same address with
  both providers gets a duplicate, which is the common case, not the edge case. Recommended **against**,
  but it is a defensible choice for a PM who weights takeover risk above duplication.
- **(c) Link, and additionally prompt.** After an Apple sign-in that would create a new account, ask
  "do you already have an account?" and offer Google. Reduces F1 from "silent" to "recoverable" without
  a merge flow. Costs a screen. **This is really E-5 and it composes with (a).**
- **(d) Build an account-merge flow.** Solves F1 properly. A separate sprint with real data-loss
  questions (whose library wins, what happens to notes and follows). Explicitly out of scope here.

**Recommendation: (a), with (c).** (a) is the only option that gets F2 right, and F2 is more common than
F1. (c) is what makes F1 survivable. What would change the recommendation: if the PM believes a
meaningful share of iOS readers will pick Hide My Email **and** already have Google accounts, the
duplicate rate stops being an edge case and (d) becomes the honest answer.

**Nothing in P2 should be built until this is answered.** The rule is the package.

### E-2 — The bundle id. **BLOCKING.**

`app.json:30` carries `ios.bundleIdentifier` = **`com.bookpulse.mobile`** — the old brand, the same
string as `android.package` at `:33`. No bundle id is registered with Apple; `eas.json` has no `ios`
profile in any of its three build configs (`:7-10`, `:11-16`, `:17-21`) and an empty
`submit.production` (`:23-25`).

**`aud` in the token verification is that bundle id.** If the PM changes it, these move together, and
any one of them left behind is a 401 on every sign-in:

1. `app.json:30` `ios.bundleIdentifier`.
2. The Apple Developer identifier registration, **with the Sign in with Apple capability enabled on
   it** (the capability is per-identifier, and this is the step most often forgotten).
3. The App Store Connect app record.
4. `APPLE_AUDIENCES` on Render. **This is why it is an env var and not a constant** (R-02) — the change
   must not need a code deploy.
5. The `sub` of the `client_secret` for `auth/revoke` (it is the client id, i.e. the bundle id).
6. `eas.json` — new `ios` build profiles and a `submit.production.ios` block.
7. The iOS Google OAuth client, which is keyed to the bundle id (see E-6).

**And one thing that must NOT move: `android.package` at `app.json:33`.** Changing it orphans every
installed Android app and the Play listing. The two ids diverge permanently, which is normal and should
be written into the file as a comment so nobody later "tidies" them back together.

**Recommendation:** decide the final id **now**, before any Apple-side registration exists, because
changing a registered bundle id later means a new App Store record. If the brand is TrackMyRead, the
id should say so.

### E-3 — The nonce: client-generated, or server-issued? *Non-blocking; R-04 ships the client form.*

R-04 has the client generate a nonce, pass it to Apple, and send it alongside the token; the server
requires them to match.

**What that buys:** a token minted for a *different* sign-in attempt cannot be submitted, and a token
captured from one session cannot be replayed into another session's request.

**What it does not buy, stated plainly:** an attacker who holds both the token and the nonce — because
they hold the request — can submit both. A client-generated nonce is self-certifying. The real
protections against that are TLS, Apple's short `exp`, and the `aud` check.

The stronger form is a **server-issued, single-use nonce**: `GET /auth/apple/nonce` returns a random
value the server remembers, the client passes it to Apple, and the server consumes it on use. Costs a
round trip (on a cold Render instance, that is why `warmUp()` exists at `LoginScreen.js:32`) and
server-side storage. In-memory storage is viable **only** while the service is one process — Sprint 4C
recorded that assumption as its A-3 (`features/reading-stats/sprint-4c-local-day/architecture.md:1171`:
production runs one `uvicorn` process; `gunicorn` is in `requirements.txt` but is not the documented
start command). If that ever changes, an in-memory nonce store silently breaks for N−1 of N workers,
which is a worse failure than the one it was added to prevent — so the server-issued form would need a
table, not a dict.

**Recommendation: ship the client form.** It is what `expo-apple-authentication` is built for, it adds
no state, and the residual risk requires an attacker who is already in the request path. Revisit if the
app ever handles anything where an account takeover is worth a TLS attack.

### E-4 — The Apple private key for revocation. **BLOCKING for submission, not for P1–P2.**

R-13 needs a `.p8` signing key (Keys → new key with Sign in with Apple enabled), its Key ID, and the
Team ID. **Only the PM can create these**, and the `.p8` is downloadable exactly once.

Three env vars on the API service: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the PEM
contents, newlines included). **Never a GitHub Actions secret** — the repository is public (Sprint 4F
verified this), and nothing in this sprint's tests needs it.

**If the PM chooses not to do this**, R-13 is inert: the code path is gated on the vars being present,
so deletion behaves exactly as today. That is a **deliberate, recorded** submission risk — Apple checks
revocation alongside 5.1.1(v) — and not an oversight. Say so in `pm-decisions.md` if that is the choice.

### E-5 — What the reader is told when an Apple sign-in creates a second account. *Non-blocking; it is the mitigation for F1.*

Two sub-questions, both product:

- **(a) The duplicate.** When `/auth/apple` returns `is_new: true`, the mobile client today navigates
  straight to `OnboardingScreen` (`features/auth/index.md:117`). For an Apple sign-in that is the exact
  moment F1 becomes invisible. Proposal: on `is_new: true` **from the Apple path only**, show one line —
  "New account created. Already have one? Sign in with Google instead." — above onboarding. Cheap,
  recoverable, and the only thing standing between a reader and a lost library.
- **(b) The synthesised email.** A branch-5 reader has
  `apple-<hex>@users.noreply.trackmyread.com` as their email and `apple<hex>` as their username.
  Settings prints `profile?.email` verbatim (`SettingsScreen.js:621`), so they will see it. Options:
  show it as-is (honest, ugly); hide the email row when the address is on the noreply subdomain; or
  prompt for a real address during onboarding. **Recommendation: hide the row for noreply addresses in
  this sprint, and treat "let a reader set their own email" as its own work** — it touches uniqueness,
  the username derivation at `app/crud.py:19-24`, and the Google path's email matching, none of which
  belong in an auth-provider sprint.

### E-6 — Google Sign-In is not configured for iOS, and that also blocks the submission. *Non-blocking for this sprint; blocking for the goal.*

Not Apple-sign-in work, but it sits in the critical path of "the iOS app can be submitted", so it is
raised rather than left for the builder to discover:

- `app.json` has `android.googleServicesFile` (`:34`) and **no iOS equivalent**; the only URL scheme is
  `"booktrackmobile"` (`:10`), not a reversed client id.
- `LoginScreen.js:31` configures `GoogleSignin` with `webClientId` only.
- `auth_router.py:45-46` hardcodes exactly **two** Google client ids, Web and Android. An iOS Google
  sign-in presents a third `aud` and is rejected at `:68-72`.

So an iOS build today would ship with a Google button that cannot work. Three ways forward: add the iOS
Google client and a third id to `auth_router.py` (and ideally move all three to an env var, the way R-02
does for Apple); or ship iOS with **Apple only**, which 4.8 permits — 4.8 constrains apps that *use* a
third-party login, and an Apple-only app uses none — and which would make the login screen simpler;
or hold the iOS submission until both work.

**Recommendation: decide between "Apple only on iOS" and "both".** "Apple only" is genuinely smaller
and genuinely compliant, and it removes E-2's item 7. "Both" is better for a reader with an existing
Google account — notably **it is the only thing that lets an existing Google reader sign in on iOS at
all**, which makes F1 much worse if Google is absent. **That interaction is the real argument for
"both"**, and it is why this escalation is not purely out of scope.
