---
screen: sprint-4g-apple-signin
feature: auth
status: decided
decided: 2026-10-06
decided_by: PM
---

# PM decisions on the Sprint 4G escalations

All six are answered. Where a decision changes the design it is a binding requirement.

## E-2 — Bundle id: **keep `com.bookpulse.mobile`**

`app.json:30` stays as it is. Consequences, accepted knowingly:

- `aud` in every Apple identity token is `com.bookpulse.mobile`, and `APPLE_AUDIENCES` on Render
  must be exactly that string.
- The Apple identifier registration, the App Store Connect record and the revocation client
  secret's `sub` all carry the old brand name permanently. Nothing a reader ever sees.
- `android.package` at `:33` is untouched, as the architecture requires.

## E-4 — Revocation key: **the PM will create the `.p8`**

A Sign in with Apple key, created in the Apple Developer portal, downloadable once. R-13 is built
and wired to it. Until the key and its Key ID arrive, R-13 ships **inert** — the code path exists
and is tested with a locally minted key, and the live call is enabled by configuration alone.

Reference the file by **path only**. Its contents never enter a chat, a log, a commit or a test
fixture. The existing `AuthKey_4W4FHZ8NRR.p8` (the ASC CI key) is a *different* key for a
different purpose and must not be reused here.

Revocation is best-effort and **can never block a deletion**: Guideline 5.1.1(v) outranks it.

## E-6 — iOS login: **Apple-only**

No Google button on iOS. No iOS Google OAuth client, no iOS `googleServicesFile`, no reversed
client id scheme, and `auth_router.py:45-46` keeps its Web and Android client ids unchanged.

**This makes E-5 (what the reader is told) load-bearing rather than cosmetic**, so it is promoted
from "nice wording" to a requirement. The exposure, stated accurately rather than as the
architecture's shorthand "an existing Google reader could not sign in on iOS at all":

| Reader on iOS | What happens |
|---|---|
| Apple ID email == their existing email, not relayed | **Links.** Their library is there. The common case. |
| Uses Hide My Email | **New, empty account.** The relay address matches nothing. |
| Apple ID email differs from their account's email | **New, empty account.** |

So the loss is bounded to the second and third rows — not to every Google reader. It is still the
worst failure a reader can hit in this sprint: a person opens TrackMyRead on a new iPhone and
finds none of their books. The design must therefore:

1. Tell them, on the screen, **before** they tap — that signing in with Apple using a different
   address (or Hide My Email) creates a new account, not a view of their existing one.
2. Tell them **after**, when a new account is created on first Apple sign-in, with a route to
   support rather than a dead end.

Wording is the PM's, but the requirement that *something accurate is said at both points* is not
optional. A silent duplicate is the defect.

4.8 is satisfied trivially under this decision: the guideline constrains apps that *use* a
third-party login service, and iOS will use none.

## E-1 — Linking rule: **(a) as proposed, with (c)'s prompt**

The five ordered branches stand as the architecture gives them — `apple_sub` first, never
overwrite an existing `apple_sub`, link only on a verified **non-private** email, otherwise
create. Rationale accepted: the email is an Apple assertion inside a signature verified for our
own `aud`, not user input, and the alternative guarantees a duplicate for the common case.

The additive constraint is the part that must not be weakened: a link writes `apple_sub` **and
nothing else**. It can never change an existing row's email, name or `is_admin`.

**F7 is the mutation that matters.** `email_verified` can arrive as the string `"false"`, and
`python-jose` passes strings through uncoerced — confirmed empirically, not read from a document.
`if claims.get("email_verified"):` is therefore true for `"false"`, which links an unverified
email onto an existing reader's row. That naive check is the required mutation for the linking
test, and the suite parametrises both claim shapes.

**F8 is out of scope but must be logged**: `/auth/google` has the symmetric hole today. It is not
created by this sprint and is not fixed by it. Raise it as a triage finding.

## E-3 — Nonce: **client-generated, shipped as such**

Accepted with the architecture's own caveat written into the spec: it binds the token to the
request but does not stop a replay by whoever already holds the token. The server-issued
alternative needs a table rather than an in-memory dict, because Sprint 4C's A-3 records that
production runs one process by convention, not by guarantee. Not worth a migration here.

## E-5 — Reader messaging: **promoted to a requirement** (see E-6)

## Carried forward, not part of this sprint

- The two drifted citations the Architect found and recorded in place rather than propagating
  (`schema_guard` raises at `:39-41` via `main.py:166`; `get_current_user` at `deps.py:76`).
- `features/auth/index.md:25`/`:55` call the deletion route `DELETE` when it is a `POST`, and
  `:58-59` claims legacy password routes exist when `tests/test_auth.py:23-40` proves otherwise.
  Doc Sync, not a Builder.

---

# Addendum, 2026-10-06 — decisions on the QA plan's escalations

## Q-1 — the "after" message: **add one additive response field; copy must be accurate without it**

The QA is right that `is_new: true` alone cannot tell the three E-5 rows apart. But the server's
knowledge is asymmetric, and the design should say so rather than treat all three as equal:

| row | can the server tell? |
|---|---|
| genuinely new reader | — |
| Hide My Email duplicate | **yes** — the relay address is right there in the token |
| differing-address duplicate | **no, and nothing can.** Nobody knows the reader has another account under an address they did not give us. |

So: `POST /auth/apple` gains **`private_relay: bool`**, additive. R-08's byte-compatibility is our
own rule, not Apple's, and it is the wrong one to hold here — an added key is ignored by any
client that does not read it, and accurate words to a reader who has just lost sight of their
library are worth more than a response shape matching `/auth/google` exactly. Amend R-08 to
"additive-only: no existing key changes name, type or meaning".

The copy still has to be correct for the two rows the server **cannot** distinguish. So the
"after" message for `is_new && !private_relay` must be true both for a brand-new reader and for
someone who already has an account under another address — something of the shape *"new account
created; if you already use TrackMyRead with a different email, that account is separate"*. The
relay case gets the specific message.

## Q-2 — "both buttons above the fold" does not apply: **drop D-4G-02 as written**

iOS is **Apple-only** (E-6). There is no second button on iOS, so there is no equivalent-
prominence requirement to satisfy — Guideline 4.8 constrains apps that *use* a third-party login
service, and iOS uses none. What remains is only that the Apple button is reachable without
hunting. Android is untouched and keeps Google alone.

The QA's underlying observation stands and is worth a triage row: the login screen puts its only
button after ~580pt of hero image and feature cards inside a `ScrollView`. That is a conversion
question for the existing product, not a 4G requirement.

## K-04 — `clock_skew_in_seconds` is not a python-jose argument: **take the correction**

The spelling is `options={"leeway": 10}` and the default is **0**. Measured by the QA, not read
from a document. Fix it in the spec; without it the Apple and Google routes diverge silently on a
skewed clock.

## K-05 — relay addresses: **belt and braces, reject by domain as well as by claim**

The rule as designed links a `@privaterelay.appleid.com` address if Apple ever sent
`is_private_email: false` with it. That would be Apple misbehaving, and the QA is right that it
reads like a hole. The cost of closing it is one string comparison, so close it: an address whose
domain is `privaterelay.appleid.com` **never links**, whatever the claim says. The claim stays as
the primary rule; the domain check is the floor under it. Both get a test.

## K-10 — `eas.json` iOS profiles: **P4 grows to own them**

The sprint cannot otherwise execute its own acceptance criteria. P4 adds the `ios` build profiles
(development / preview / production, `buildNumber`, `usesNonExemptEncryption: false`) alongside
the client work. It does **not** register anything with Apple and does not run a build.

## Accepted without change

- **K-01** — `apiContract.test.mjs` couples P4 to P2. Real; P4 lands after P2 rather than beside it.
- **K-02** — E-5 copy is a six-locale edit, enforced by `i18nParity.test.mjs`. All six, or the
  existing test goes red. That is the test doing its job.
- **K-06** — branch 5's safety rests on `users.noreply.trackmyread.com` having no MX record. Not
  assertable in a suite; it is a one-off production check.
- **K-09 / F8** — `/auth/google` never reads Google's `email_verified` and matches on email. Open,
  untested, **not created and not fixed by this sprint**. Logged for triage.
- **B-02a** — the checked-in snapshot of Apple's real JWKS is a good addition and stays.
