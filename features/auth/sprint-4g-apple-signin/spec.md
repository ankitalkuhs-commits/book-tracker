---
screen: sprint-4g-apple-signin
feature: auth
repo: api + mobile (iOS — no build exists yet) + docs. **Web: no change required; see R-14 for why.**
status: draft — six escalations open, three of them blocking (E-1 the linking rule, E-2 the bundle id, E-4 the revocation key)
last_verified: 2026-10-06
source: code read on branch `sprint-4g-apple-signin` (base master @ `d26a13c`). Files opened for this
  document, and the only ones its line numbers may cite: `app/routers/auth_router.py`,
  `app/routers/follow_router.py:1-50`, `app/auth.py`, `app/models.py:24-51`, `app/crud.py:12-30`,
  `app/schema_guard.py`, `app/main.py` (grep of `include_router` / startup), `app/deps.py:55-100`,
  `requirements.txt` (decoded from UTF-16LE), `tests/conftest.py`, `tests/test_auth.py:1-95`,
  `tests/test_query_budget.py:806-858`, `.github/workflows/ci-tests.yml` (grep),
  `context/PM_SQL_QUEUE.md`, `features/auth/index.md`,
  `book-tracker-mobile-stitch/{app.json,eas.json,package.json}`,
  `book-tracker-mobile-stitch/src/screens/LoginScreen.js`,
  `book-tracker-mobile-stitch/src/screens/SettingsScreen.js:290-320,615-630`,
  `book-tracker-mobile-stitch/src/services/api.js:1-130,209`,
  `book-tracker-frontend-stitch/src/pages/LoginPage.jsx:1-80`,
  `book-tracker-frontend-stitch/src/pages/SettingsPage.jsx` (grep),
  `book-tracker-frontend-stitch/src/services/api.js` (grep)
---

## What It Does

TrackMyRead's only login is Google. `POST /auth/google` (`app/routers/auth_router.py:36-108`) is the
single auth call the Android app makes (`book-tracker-mobile-stitch/src/services/api.js:73-76`,
from `LoginScreen.js:42`), and the web client makes the same one (`book-tracker-frontend-stitch/src/services/api.js:87`).

App Store Review Guideline **4.8** requires that an app which establishes a reader's primary account
through a third-party login service also offer Sign in with Apple as an **equivalent option** — equal
prominence, not a second-class button behind a disclosure. So the iOS app cannot be submitted until
Apple sign-in exists. This sprint adds it:

- `POST /auth/apple`, mirroring `/auth/google`'s shape, with the identity token verified properly
  against Apple's published JWKS rather than decoded and trusted.
- One new column, `user.apple_sub`, because **Apple hands over the email only on the very first
  authorization**. The stable `sub` is the only identifier every later sign-in carries. If it is not
  written the first time, that reader can never be recognised again.
- A written-down **linking rule** for the three cases that are not "the same `sub` came back": Hide My
  Email, a real email that matches an existing Google reader, and no usable email at all.
- The Apple button on the iOS login screen only, at the same size and above the Google button.
- Apple's **token revocation on account deletion**, which Apple requires of any app that offers Sign
  in with Apple and supports account deletion.

**Account deletion itself is already built and is not a blocker.** This was checked end to end and the
evidence is in R-12 — the common claim that "the `user` table only has a `deletion_requested_at` flag"
is true of the *legacy* route and false of the app.

## User story

As a reader who has just installed TrackMyRead on an iPhone, I want to sign in with the Apple ID my
phone already knows, without handing a third party my email, and I want that to be as easy as the
Google button rather than an afterthought — so that I can start using the app, and so that the app can
be in the App Store for me to have installed it in the first place.

- **Evidence:** not user feedback. It is a submission requirement. Guideline 4.8, plus 5.1.1(v) for
  deletion, plus Apple's own requirement to revoke tokens on deletion. There are no iOS users today
  because there is no iOS build.
- **Success metric:**
  - The build passes App Review without a 4.8 or 5.1.1(v) rejection. This is the only metric that
    matters and it is binary.
  - A reader who signs in with Apple, force-quits, and signs in again **lands on the same account** —
    checked by hand on a device, because nothing else proves `apple_sub` was persisted.
  - A reader who signs in with Apple using a real (non-relay) email that already exists as a Google
    account lands on **that** account, with their library intact.
  - Zero `user` rows with a non-NULL `apple_sub` that is shared with another row (the unique index
    makes this unfalsifiable, which is the point).

## Appetite

Max complexity: **medium**, 3–5 days across four packages (API verification + linking, API revocation,
iOS client, docs). One PM SQL step sits in front of the API deploy.

**This estimate assumes the iOS plumbing already exists. It does not.** See "Blocked on" below. The
design work is 3–5 days; the iOS build is a separate, unestimated prerequisite that is mostly the PM's
and not Claude's.

### Blocked on (not design work, and not optional)

- **No iOS build exists.** `book-tracker-mobile-stitch/eas.json` has three build profiles
  (`:7-10` development, `:11-16` preview, `:17-21` production) and **every one declares only an
  `android` block**; `submit.production` (`:23-25`) is empty. There is no `ios` profile anywhere.
- **No bundle id registered with Apple.** `app.json:30` carries `ios.bundleIdentifier` =
  `com.bookpulse.mobile` — the **old brand**, the same string as `android.package` at `:33`.
  `aud` in the token verification *is* that bundle id. See **E-2**: if the PM changes it, seven other
  things move with it.
- **Google Sign-In is not configured for iOS either.** `app.json` has `android.googleServicesFile`
  (`:34`) and no iOS equivalent, no URL scheme beyond `"scheme": "booktrackmobile"` (`:10`), and
  `LoginScreen.js:31` configures only `webClientId`. `auth_router.py:45-46` hardcodes exactly two
  Google client ids, Web and Android. An iOS Google sign-in would present a third `aud` and be
  rejected at `:68-72`. **This is a submission blocker that is not Apple-sign-in work.** Flagged
  here because the sprint's goal is "the iOS app can be submitted", and shipping only Apple would
  leave the iOS app with one broken button and one working one. See **E-6**.

### Not building

- **Email/password login.** Not required by 4.8 and the legacy routes were deliberately removed
  (`tests/test_auth.py:23-40`, `TestLegacyPasswordRoutesRemoved`). Nothing here brings them back.
- **An account-merge flow.** The duplicate-account case that Hide My Email creates (R-05, failure mode
  **F1**) is *not* solved by merging two accounts' libraries. That is its own sprint with its own
  data-loss questions. What this sprint does is make the duplicate *visible* to the reader at the
  moment it happens (R-09) rather than silently stranding them in an empty library.
- **Apple sign-in on the web.** R-14 justifies the omission rather than asserting it. The server is
  designed so the web can be added later with **no API change** — which is the only part of it this
  sprint pays for.
- **Apple's `/auth/token` authorization-code exchange and refresh tokens.** The native iOS flow hands
  the client an identity token directly; we need no server-side code exchange to authenticate.
  Revocation (R-13) does need an Apple client secret, and that is the only place this sprint talks to
  Apple's REST API.
- **Changing `/auth/google`.** Not one line. Its pre-existing defects are named in R-01 and R-02 as
  context for why `/auth/apple` does not copy them; fixing them is not in scope and must not ride
  along. (Named, not fixed: the `except Exception` at `auth_router.py:107-108` turns a bad token into
  a 500 instead of a 401 — `tests/test_auth.py:75-83` already documents this as pre-existing; and
  `auth_router.py:77` reads Google's `sub` into `google_id` and **never stores it**, which is exactly
  the mistake R-03 exists to avoid repeating.)
- **Migrating existing Google readers to `apple_sub`.** There is nothing to migrate; the column starts
  NULL for every row and that is correct.
- **A refresh-token or session model.** Tokens stay HS256 / 30 days (`app/auth.py:16-17`). Apple sign-in
  mints the same reader token `/auth/google` does.
- **Rate limiting `/auth/apple`.** The API has none anywhere; adding it on one route would be the only
  rate limit in the service. Named as a known gap in architecture §Security review 6, consistent with
  the treatment `/auth/bot-login` already got.

## Requirements

Instants are UTC. "Apple subject" means the `sub` claim of an Apple identity token, a stable
per-app-per-Apple-ID string such as `001234.9f8e…abc.1234`.

### Verifying the token — the part that must not be got wrong

- [ ] **R-01 `POST /auth/apple` verifies the identity token cryptographically against Apple's published keys.**
  - **Defect it must not copy:** `/auth/google` delegates verification to a Google library
    (`auth_router.py:55-60`) and therefore gets JWKS fetching, caching, signature checking and `aud`
    for free. There is no equivalent Apple library in this project, so the same guarantees have to be
    assembled by hand — and a hand-rolled token check that merely *decodes* the token is a complete
    authentication bypass, because an attacker can mint any `sub` and any `email` they like.
  - **The library is `python-jose[cryptography]==3.3.0`, and it is already a dependency.**
    `requirements.txt` is **UTF-16LE with a BOM** (the file's first two bytes are `FF FE`); decoded, it
    is line 8. The `[cryptography]` extra is what supplies the RSA backend, and `cryptography` 46.0.3
    is installed in `.venv`. **No new Python dependency is added by this sprint.** `google-auth==2.43.0`
    (decoded line 15) cannot be reused — it is Google-specific. `PyJWT` is not present and is not added.
  - **Verified empirically on this branch, not assumed** (architecture §"The verification, proved"):
    `jose.jwt.decode(token, jwks, algorithms=["RS256"], audience=…, issuer=…)` accepts Apple's JWKS
    **document as a dict** and enforces the signature, `aud` and `iss` (both `JWTClaimsError`) and `exp`
    (`ExpiredSignatureError`), and rejects `alg: "none"` (`JWTError`).
  - **Accept:**
    - Apple's JWKS is fetched from `https://appleid.apple.com/auth/keys` and cached in process with a
      TTL. A cache miss on the token's `kid` triggers **at most one** refetch per request, then fails.
    - The signature is verified with `algorithms=["RS256"]` as an explicit allowlist. A token whose
      header says `alg: "none"`, `HS256`, or anything else is rejected **before** any claim is read.
    - `iss` must be exactly `https://appleid.apple.com`.
    - `aud` must be in `APPLE_AUDIENCES` (env var, comma-separated, see R-02). A token minted for
      another app's bundle id is rejected.
    - `exp` is enforced, with the same `clock_skew_in_seconds=10` tolerance `/auth/google` uses
      (`auth_router.py:59`), so the two routes behave the same way on a skewed clock.
    - `sub` must be present and non-empty, or **401**. Everything downstream keys off it.
    - The **nonce** is checked: see R-04.
    - Every failure returns **401** with one message. The route never reports *which* check failed, for
      the same reason `/auth/bot-login` does not (`auth_router.py:224-225`).
    - **A JWKS fetch that fails returns 503, never 200 and never a token.** "Apple is unreachable" must
      never degrade into "signature not checked".
  - **Mutation:** delete the `algorithms=["RS256"]` argument; delete the `audience=` argument; replace
    the JWKS with the token's own embedded key; make the JWKS-fetch failure path fall through. Each must
    turn a test red.
- [ ] **R-02 The audience is configuration, not a constant.**
  - **Why:** `aud` is the bundle id, the bundle id is `com.bookpulse.mobile` today (`app.json:30`), it is
    the old brand, and **E-2 may change it**. A hardcoded audience means a bundle-id change needs a code
    deploy to stop every sign-in 401-ing. A set rather than a single value also means the web client
    (R-14) can be added later with no server change, because the web flow's `aud` is an Apple
    **Services ID** and not the bundle id.
  - **Accept:**
    - `APPLE_AUDIENCES` is read **per request**, exactly as `_review_login_config`
      (`auth_router.py:111-121`) and `_bot_login_config` (`:176-183`) are read per request, and for the
      same two reasons: tests monkeypatch it, and an operator changes it on Render without a deploy.
    - It is comma-separated and trimmed, following the `BOT_LOGIN_EMAILS` parse at `:181-182`.
    - **When it is unset, `POST /auth/apple` returns 404** — the route does not exist in local dev, in
      CI, or in a fork, the same contract `/auth/review-login` (`:137-138`) and `/auth/bot-login`
      (`:209-210`) already have. This is what keeps the new route out of the CI surface without a
      network call (`.github/workflows/ci-tests.yml:36` states the suite runs with no secrets).
    - It is **not** defaulted to the bundle id in code. A silent default is how a staging build ends up
      accepting production tokens.
  - **Mutation:** hardcode `audience="com.bookpulse.mobile"`; drop the 404 guard; read the env var at
    import time instead of per request.
- [ ] **R-03 The Apple subject is persisted on the first authorization, and is the identity thereafter.**
  - **Defect:** this is the one mistake that cannot be repaired later. Apple returns the email **only on
    the very first authorization** for this app; every later sign-in carries `sub` and (at Apple's
    discretion) nothing else useful. `/auth/google` already demonstrates the failure: it reads Google's
    `sub` into `google_id` at `auth_router.py:77` and **never writes it anywhere**, which works only
    because Google sends the email every time. Apple does not.
  - **Accept:**
    - `user.apple_sub` exists, is nullable, and is **unique**. The uniqueness is enforced by a database
      index, not by the handler, so two concurrent first sign-ins cannot both win.
    - On a successful `/auth/apple` where no row carries this `sub`, the chosen row's `apple_sub` is set
      **in the same request**, before the token is returned.
    - A row whose `apple_sub` is already set to a **different** value is never overwritten. The request
      is refused. (See R-06 — this is an attacker-facing rule, not a tidiness rule.)
    - `apple_sub` is written only by `/auth/apple`. No other route reads or writes it, and it is never
      returned in any API response — it is an internal identifier, not reader-visible data.
  - **Mutation:** remove the `db.add`/`commit` that persists `apple_sub` on the create path — the second
    sign-in must then create a second account, and a test must catch it. Drop `unique=True` — the
    concurrent-first-signin test must then produce two rows with one `sub`.
- [ ] **R-04 The nonce is bound to the request.**
  - **Accept:**
    - The client generates a cryptographically random nonce per sign-in attempt, passes it to Apple, and
      sends the same value in the `POST /auth/apple` body.
    - The server requires `claims["nonce"]` to be present and to equal the body's nonce under a
      constant-time compare (`hmac.compare_digest`, as `auth_router.py:146-148` and `:221-223` already
      use). A token with **no** `nonce` claim is a **401** — not a warning, not a pass.
    - The body's nonce must be at least 32 characters, so an empty-string nonce cannot satisfy the
      comparison trivially on both sides.
  - **What this does and does not buy is stated honestly in E-3.** It binds a token to the request that
    carries it; it does not stop a replay by whoever already holds the token. The protections against
    that are TLS, Apple's short `exp`, and the `aud` check. A server-issued single-use nonce is the
    stronger form, costs a round trip and server-side storage, and is **E-3** for the PM to decide.
  - **Mutation:** accept a token with no `nonce` claim; compare with `==` on a nonce the server supplies
    rather than one the client sent; drop the comparison entirely.
- [ ] **R-05 `email_verified` is coerced, never truth-tested.**
  - **Defect:** Apple sends `email_verified` as the **string** `"true"` in some token shapes and as the
    boolean `true` in others. `is_private_email` behaves the same way. This was checked rather than
    assumed: a token carrying `"email_verified": "true"` round-trips through
    `python-jose` **as a `str`** — the library does no coercion (architecture §"The verification,
    proved", case 1). The consequence is the live hazard: `if claims.get("email_verified"):` is **true
    for the string `"false"`**, so a naive truthiness check links an *unverified* email to an existing
    account. That is an account-takeover path.
  - **Accept:**
    - The only accepted form is an explicit coercion to a boolean against the literal `"true"` /
      `True`, case-insensitively. Every other value — `"false"`, `False`, `None`, absent, `"1"`, `""` —
      is **not verified**.
    - The same coercion is applied to `is_private_email`.
    - Linking (R-06) happens **only** when the coerced `email_verified` is true. An unverified email
      never links; it falls through to account creation.
  - **Mutation (required, Critical):** replace the coercion with `bool(claims.get("email_verified"))`.
    A test that feeds `"email_verified": "false"` plus an email matching an existing reader must then
    go red by linking. A test suite that does not contain that case does not cover this requirement.
  - The test suite parametrises **both** shapes (boolean and string) for both claims, because we cannot
    know which one this app will actually receive until a device signs in (R-15, item 2).

### The linking rule — the decision this sprint exists to make

- [ ] **R-06 One rule, five ordered branches, and no branch decided at runtime by anything but the token.**
  - **This requirement is subject to E-1 and must not be built before the PM answers it.** It can create
    a duplicate account for a real, paying-attention reader (F1 below), which is a product decision and
    not an architect's.
  - **Accept — the rule, evaluated in this order and stopping at the first match:**

    | # | Condition | Outcome |
    |---|---|---|
    | 1 | A `user` row has this `apple_sub` | **That** reader signs in. No email is read at all. `is_new: false`. |
    | 2 | No `apple_sub` match, and the row found by email already has a **different** `apple_sub` | **401.** Never overwrite. (R-03) |
    | 3 | No `apple_sub` match, email present, `email_verified` coerces true, `is_private_email` coerces **false**, and a `user` row has that email | **Link.** Set `apple_sub` on that existing row and sign that reader in. `is_new: false`. Nothing else on the row changes. |
    | 4 | No `apple_sub` match, email present and verified (relay **or** real), no row has it | **Create** a new account with that email and this `apple_sub`. `is_new: true`. |
    | 5 | No `apple_sub` match, and no usable email (absent, or not verified after coercion) | **Create** a new account with a synthesised placeholder email and this `apple_sub`. `is_new: true`. See R-07. |

    - Branch 3 is the **only** branch that links, and it requires all four of: a real email, Apple's
      verified flag coerced true, `is_private_email` coerced false, and the target row's `apple_sub`
      being NULL.
    - A relay address (`@privaterelay.appleid.com`, or `is_private_email` true) is **never** used to
      find an existing row. It cannot match a Google address, so a lookup on it can only ever produce a
      false positive from a previous Apple sign-up — which branch 1 would already have caught.
    - Linking is **additive and one-directional**: it writes `apple_sub` and nothing else. It never
      changes the row's `email`, `name`, `username`, `is_admin`, `is_bot` or `profile_picture`. This is
      the rule that stops a link being used to redirect an existing account's contact address, which is
      the classic escalation from "I can sign in" to "I own this account".
  - **Why link by verified email at all, since it is the risky branch:** the email is not user input. It
    arrives inside a token whose RS256 signature we verified against Apple's published keys, for an
    `aud` that is our bundle id — it is an identity assertion by Apple. The existing row was itself
    created from a Google identity assertion over the same address (`auth_router.py:83-92`). Two
    independent providers asserting control of one mailbox is the strongest signal available without a
    second factor. The alternative — refusing to link — guarantees a duplicate account for every reader
    who uses the same address with both providers, which is the common case and is irreversible from
    the reader's side.
  - **What stops an attacker using it to take over an account.** The attack requires Apple to assert a
    verified email the attacker does not control. Each route to that is closed or already equivalent:
    - *Forge a token* — needs Apple's RSA signing key. Closed by R-01.
    - *Replay a token minted for a different app* — closed by the `aud` check (R-01, R-02).
    - *Replay this app's token for another reader* — needs that token, i.e. a compromised TLS channel or
      device; and the nonce check (R-04) binds it to one request.
    - *Set an arbitrary email on an Apple ID* — Apple requires verification of a non-Apple address
      before it will assert it, which is precisely what `email_verified` reports, and R-05 makes the
      coercion exact. **This is the single load-bearing external assumption of the whole rule** and it
      is stated as such: if Apple's `email_verified` were ever untrustworthy, branch 3 is the hole.
    - *Control the mailbox* — then the attacker can already take the Google account by signing in with
      Google. Linking adds no capability it did not have.
    - *A pre-created decoy row* — an attacker who signs up with Apple first and then the victim signs in
      with Google: Google's path (`auth_router.py:83`) matches on email and would log the victim into
      the attacker's row. **This hole already exists today for Google-vs-Google and is not created by
      this sprint**, but it is worth the PM knowing it is the mirror image of branch 3.
  - **Mutation:** reorder the branches so email is consulted before `apple_sub`; allow branch 3 when
    `is_private_email` is true; allow branch 3 to also write `email` or `name`; let branch 2 overwrite.
- [ ] **R-07 A reader with no email still gets a working account.**
  - **Defect:** `user.email` is `nullable=False` (`app/models.py:30`), and `crud.create_user`
    (`app/crud.py:16-30`) derives `username` from the email prefix (`:19-24`). Branch 5 of R-06 has no
    email to derive either from. Branch 4 with a relay address derives a username like
    `k3h9xq2mnp` — a random string the reader never chose and will not recognise.
  - **Accept:**
    - Branch 5 synthesises an email of a form that is unique, obviously internal, and cannot collide
      with a real address or with another reader: derived from the Apple subject, under a domain this
      project controls and does not route mail to. The exact form is in architecture §Data.
    - `is_new: true` is returned, so the client's existing onboarding gate fires
      (`features/auth/index.md:117` — mobile navigates to `OnboardingScreen` on `is_new`).
    - The reader's **display name** comes from `full_name`, which the client sends **only** on the first
      authorization (Apple returns it on the credential object, not in the token). When it is absent,
      the name falls back the same way `/auth/google` falls back (`auth_router.py:76`).
    - **`full_name` is read only on the create path.** On branch 1 and branch 3 it is ignored
      completely. Otherwise a later request body could rename an existing reader.
    - No reader is ever shown a synthesised email as if it were theirs. Settings shows
      `profile?.email` directly (`SettingsScreen.js:621`), so **this requirement has a visible
      consequence and it is deliberately deferred to E-5** rather than hidden.
  - **Mutation:** let `full_name` through on the link path (an existing reader must then be renameable
    from a request body); make the synthesised email non-unique; return `is_new: false` on create.
- [ ] **R-08 The response shape is byte-compatible with `/auth/google`.**
  - **Accept:**
    - `POST /auth/apple` returns exactly `{"access_token", "is_new", "user": {"id", "name", "email"}}` —
      the same keys, the same types, in the same place as `auth_router.py:102`.
    - The token is minted by `auth.create_access_token({"sub": user.email})` (`app/auth.py:64-69`) with
      no `expires_delta`, i.e. the ordinary 30-day reader token (`app/auth.py:17`). It carries **no**
      provider claim: `get_current_user` resolves the row on every request (`app/deps.py:76`) and the
      row is the single authority, exactly as Sprint 4F decided for bots (its E-4).
    - `last_active` is written on login the same way `/auth/google` writes it (`auth_router.py:95`),
      because a login is activity.
    - Every existing test in `tests/` passes **unedited**.
  - **Mutation:** add a `provider` claim to the token; rename any response key; drop the `last_active`
    write.

### The iOS client

- [ ] **R-09 The Apple button exists on iOS, at equivalent prominence, and Android is untouched.**
  - **Accept:**
    - `expo-apple-authentication` is added to `book-tracker-mobile-stitch/package.json`
      (not currently present) at whatever version `npx expo install` resolves for Expo SDK
      `~54.0.33` — **the builder pins what the tool resolves, not a number invented in this document.**
    - `app.json`'s `ios` block (`:28-31`) gains `"usesAppleSignIn": true`, which is what adds the
      `com.apple.developer.applesignin` entitlement to the build.
    - The branch is on **`AppleAuthentication.isAvailableAsync()`**, awaited in the existing `useEffect`
      at `LoginScreen.js:30-33`, **not** on `Platform.OS === 'ios'`. `isAvailableAsync()` is false on
      Android *and* on an iOS version or simulator where the sheet would not work, so it is the only
      check that never renders a dead button.
    - The Apple button is `AppleAuthenticationButton`, rendered directly **above** the existing Google
      `TouchableOpacity` (`LoginScreen.js:103-117`), full width, with the same `borderRadius`
      (`radius.full`) and the same rendered height as `styles.googleBtn` (`:179-186`,
      `paddingVertical: 15`), and the same `marginBottom: 20` gap.
    - **Equivalent prominence, concretely:** same width, same height, same corner radius, both above
      the fold on the smallest supported device, Apple first in the stack, neither behind a "more
      options" disclosure, and neither needing an extra tap to reach. Guideline 4.8 asks for an
      equivalent *option*; Apple's HIG additionally asks that their button not be smaller than the
      alternatives.
    - **Android renders exactly one sign-in button and the Google block at `:103-117` is not edited.**
      The entire Android-visible diff is one `useState` and one line inside the existing `useEffect`.
    - `requestedScopes` is `[FULL_NAME, EMAIL]`. A reader who declines either still signs in — branches
      4 and 5 of R-06 cover it.
    - `ERR_REQUEST_CANCELED` is silent, the way `SIGN_IN_CANCELLED` already is at `LoginScreen.js:46`.
      Every other error gets the existing `Alert.alert` treatment (`:49`).
  - **Mutation:** branch on `Platform.OS` instead of `isAvailableAsync()` (an iOS 12 device must then
    show a dead button); render the Apple button below Google or at a smaller height (the measured
    assertion must go red); force `isAvailableAsync` true in the Android test (two buttons must then
    appear and the test must catch it).
- [ ] **R-10 The nonce is generated on the client and never reused.**
  - **Accept:**
    - A fresh, cryptographically random value of at least 32 characters per sign-in attempt. Two
      attempts in one session never produce the same nonce.
    - It is passed to `signInAsync({ nonce })` and sent in the `POST /auth/apple` body, unmodified.
    - **`expo-crypto` is a second new mobile dependency** and is named here so the PM is not surprised
      by it. `Math.random()` is not acceptable for this and a test asserts the source.
  - **Mutation:** generate the nonce once at module scope; use `Math.random()`.
- [ ] **R-11 `app.json` version discipline.**
  - **Accept:** `version` and `android.versionCode` (`app.json:5`, `:35` — currently `2.2.4` / `63`) are
    bumped per the existing rule, because `scripts/check-version-bump.js --strict` gates the AAB build
    (recorded in Sprint 4F's architecture, P4 row). **An iOS-only change still bumps the Android
    versionCode** under that script's rule, which is a known friction and not something this sprint
    changes.

### Deletion, which Apple also checks

- [ ] **R-12 In-app account deletion already exists end to end, and this requirement is the verification, not the build.**
  - **Verified on this branch, not assumed.** Guideline 5.1.1(v) requires in-app deletion for any app
    that supports account creation. The claim that TrackMyRead has "only a flag" is **false for the
    app** and **true for one legacy route**, and the difference is the whole finding:
    - **The real flow:** `SettingsScreen.js:625` renders a `Row` labelled `settings.deleteAccount` with
      `onPress={handleDeleteAccount}` → `:300-310` shows a native destructive confirm → `:306` calls
      `deregisterPushToken()`, then `profileAPI.deleteAccount()`, then `onLogout({alreadyDeregistered: true})`
      → `src/services/api.js:209` posts `/auth/delete-account/me` →
      `app/routers/auth_router.py:253-351` **hard-deletes** the row and every dependent row (group
      activity `:267-268`, created groups and their members/posts `:271-281`, invites `:285-291`,
      notification logs / group posts / group members `:294-300`, push tokens `:303-304`, follows
      `:307-310`, notes with their likes and comments `:313-320`, likes and comments left elsewhere
      `:322-325`, group posts detached from deleted userbooks `:327-333`, reading activity `:336-337`,
      journal `:340-341`, userbooks `:342-343`, then the user `:346-348`), commits at `:349` and
      returns `{"message": "Account deleted"}` at `:351`. The web client has the same flow
      (`SettingsPage.jsx:301`, `src/services/api.js:322`).
    - **The flag-only path is the *legacy* route** `POST /auth/delete-account`
      (`auth_router.py:239-250`), which sets `deletion_requested_at` (`:246`) and `deletion_reason`
      (`:247`) and deletes nothing. That is what `models.py:46-47` is for. The app does not call it;
      it exists for the public `account-deletion.html` form.
    - It is reachable in **six languages** (`src/i18n/locales/{de,en,es,fr,pt,ru}.json:403-404`).
  - **So 5.1.1(v) is not a blocker.** Accept, as verification only:
    - The iOS build shows the delete row in Settings → Account, behind one confirm, with no web
      redirect. **Confirmed by a screenshot on the device** (R-15), because an Android-verified flow is
      not proof about an iOS build that does not exist yet.
    - `tests/test_auth.py` keeps its existing coverage of this route unedited.
  - **One documentation drift found and deliberately not fixed here:** `features/auth/index.md:25` and
    `:55` both call the route `DELETE /auth/delete-account/me`. It is a **`POST`**
    (`auth_router.py:253`). The same file's `:25` and `:58-59` also describe `POST /auth/login` and
    `POST /auth/signup` as still existing; `tests/test_auth.py:23-40` proves they were removed by F-01.
    Two one-line doc fixes, named so they are not lost, and **left out of this sprint's diff** so this
    document is not the thing that quietly rewrites somebody else's page.
- [ ] **R-13 Deleting an account revokes the reader's Apple tokens.**
  - **Why this is a requirement and not a nicety:** Apple requires an app that offers Sign in with Apple
    and supports account deletion to revoke the user's tokens through Apple's REST API as part of that
    deletion. It is checked in review alongside 5.1.1(v). Without it, the reader's Apple ID keeps
    listing TrackMyRead under "Apps Using Apple ID" after they deleted their account.
  - **Accept:**
    - `POST /auth/delete-account/me` calls `https://appleid.apple.com/auth/revoke` **only** when
      `current_user.apple_sub` is not NULL. A Google-only reader's deletion makes no outbound call and
      is byte-identical to today.
    - The call is authenticated with a `client_secret` JWT signed **ES256** with the team's `.p8`
      private key. **No new dependency:** `python-jose[cryptography]` signs ES256, verified on this
      branch (architecture §"The verification, proved", case 7).
    - **A failed or unconfigured revocation never blocks the deletion.** It is attempted, its outcome is
      logged as a status code only, and the deletes proceed. A reader must be able to delete their
      account when Apple is down, and 5.1.1(v) is the stronger obligation of the two.
    - The revocation runs **before** the row is deleted, because it needs `apple_sub`.
    - It logs no token, no secret, no response body — the same discipline Sprint 4F imposed on bot
      logging (its Security review §6).
    - **This needs a key the PM must generate.** See **E-4**.
  - **Mutation:** make a revocation failure raise, so the deletion fails (the "Apple is down" test must
    go red); call revoke for a reader with `apple_sub IS NULL`; log the response body.

### The web client

- [ ] **R-14 The React web client needs no change to ship iOS, and here is the argument rather than the assertion.**
  - **Accept — the reasoning, written down so it can be challenged:**
    - Guideline 4.8 is an **App Store Review** guideline. It is applied by App Review to a binary
      submitted to the App Store. The web client at `book-tracker-frontend-stitch` is served from
      `www.trackmyread.com` and is submitted to nothing; there is no review surface against which 4.8
      could be enforced. The same is true of 5.1.1(v).
    - The one thing that *would* pull the web client in is a **web view inside the iOS app** that
      performed the sign-in. There is none: the iOS login is native (`expo-apple-authentication`,
      R-09), and `expo-web-browser` (`app.json:21`) is used for external links, not for auth.
  - **Two consequences that are real, and are product gaps rather than compliance ones:**
    - A reader who creates their account with Apple on iOS **cannot sign in on the web at all.** The web
      login page offers only `GoogleLogin` (`LoginPage.jsx:6`, handler `:39-51`). Their account becomes
      iOS-only. Naming this is the point of the requirement; fixing it is **E-5**.
    - `LoginPage.jsx:15` declares `operatingSystem: 'Web, Android'` in the `SoftwareApplication`
       JSON-LD. That becomes factually wrong the day iOS ships. One line, named, **not bundled** —
       changing SEO structured data inside an auth sprint is how a diff stops being reviewable.
  - **The server is built so the web can be added with no API change** (R-02's audience set). That
    foresight costs nothing now and is the only thing this sprint spends on the web.

### Proving it

- [ ] **R-15 Each requirement is testable by breaking the product, and what cannot be is named with its substitute proof.**
  - **Accept:** every Critical and Major case in architecture §Test strategy names the one-line product
    change that must turn it red. The full table is there. The seam that makes the API fully testable
    with no network and no Apple account is a **single injectable JWKS provider** — tests monkeypatch
    it, generate an RSA key locally, and mint Apple-shaped tokens. This was proved on this branch before
    it was specified.
  - **What cannot be tested without a real device and a real Apple ID, and what stands in for it:**

    | # | Not testable in CI | Why | Substitute proof |
    |---|---|---|---|
    | 1 | That the native sheet returns an `identityToken` for **this** bundle id | Needs a registered bundle id, a provisioning profile with the Sign in with Apple capability, and a device or an Apple-ID-signed-in simulator. **No iOS build exists.** | A staged manual check on the **first TestFlight build**, before submission: sign in, record the decoded claim **names** and the shape of `email_verified` / `is_private_email` in build notes (values redacted), confirm a second sign-in lands on the same account. There is no honest CI substitute and this document does not invent one. |
    | 2 | Which shape Apple actually sends for `email_verified` and `is_private_email`, and whether `email` is present on the second sign-in | Apple's behaviour varies by Apple ID type and is not contractually fixed | The suite **parametrises both shapes** and the design is correct for both (R-05). The device check becomes a confirmation, not the proof. This is the right way round: a design that needed the device to be correct would be the defect. |
    | 3 | Hide My Email end to end | Needs a real Apple ID choosing the relay option | A unit case with a `@privaterelay.appleid.com` address and `is_private_email` in both shapes proves branch 4 is taken and branch 3 is not. The device check confirms Apple actually sends what we modelled. |
    | 4 | "Equivalent prominence" as App Review judges it | It is a human judgement | A screenshot of the iOS login screen at the smallest supported width attached to the submission notes, **plus** a client test asserting the two buttons' measured width, height and order. The test makes the regression catchable; the screenshot is the argument to the reviewer. |
    | 5 | That `auth/revoke` succeeds against Apple | Needs the real `.p8` and a real Apple ID | A unit case proves the ES256 `client_secret` decodes with the right `iss`/`sub`/`aud`/`exp` and that the request shape is right (HTTP mocked). The live call is a one-time manual check with a throwaway Apple ID on TestFlight, recorded in build notes. |
    | 6 | That App Review passes | — | Nothing. It is the success metric, not a test. |

## Done checklist

1. The PM has run SQL step **8** (`user.apple_sub` + its unique index) and sent back the verification
   output.
2. The API is deployed **with** `("user", "apple_sub")` in `schema_guard.REQUIRED_COLUMNS` — in the
   deploy **after** step 1, never the same push.
3. `APPLE_AUDIENCES` is set on the Render service. Until that moment `POST /auth/apple` is a 404 and no
   Apple sign-in can happen.
4. `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` are set, or R-13 is knowingly inert and the
   PM has recorded that choice (E-4).
5. `pytest tests -q` passes, above the CI floor of 715 (`.github/workflows/ci-tests.yml:61`), with no
   edits to any existing test.
6. On a TestFlight build: sign in with Apple, force-quit, sign in again — **the same account**, same
   library. This is the single check that proves `apple_sub` was persisted, and nothing in CI can
   replace it.
7. On the same build: sign in with Apple using a **real** email that already exists as a Google
   account — lands on that account with its library.
8. On the same build: sign in with Apple using **Hide My Email** — a new empty account, and the reader
   is told so (R-09 / E-5's answer), not silently dropped into onboarding.
9. Both buttons are visible above the fold on the smallest supported device, same size, Apple first.
   Screenshot attached to the submission notes.
10. Settings → Account → Delete account works on the iOS build, behind one confirm, no web redirect.
    Screenshot attached.
11. After a deletion by an Apple-signed-in reader, TrackMyRead no longer appears under that Apple ID's
    "Apps Using Apple ID" (manual, throwaway Apple ID).
12. `SELECT count(*) FROM "user" WHERE apple_sub IS NOT NULL GROUP BY apple_sub HAVING count(*) > 1`
    returns no rows. (The unique index makes this unfalsifiable; it is run once to prove the index is
    actually there.)
13. The build is submitted and does not come back with a 4.8 or 5.1.1(v) rejection.
