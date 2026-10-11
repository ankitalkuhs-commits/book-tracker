# app/apple_keys.py
"""Sprint 4G (R-01, R-02, R-04): Apple identity-token verification for POST /auth/apple.

`/auth/google` hands verification to a Google library and gets JWKS fetching, caching,
signature checking and `aud` for free. There is no equivalent Apple library here, so the same
guarantees are assembled by hand — and a hand-rolled check that merely *decodes* a token is a
complete authentication bypass, because anyone can mint any `sub` and any `email` they like.

What `python-jose` does for us (measured against the pinned 3.3.0, not read from a document):
the RS256 signature, `aud`, `iss` and `exp`.

What it does NOT do, and is therefore done here:
  1. `nonce` is not a registered claim — `jwt.decode` ignores it. The comparison is ours.
  2. `kid` selection — jose tries EVERY key in a JWKS document and never looks at `kid`, so
     the one-shot refetch on an unknown `kid` is ours. Also the amplification control: an
     unknown-`kid` flood must not become a flood of outbound requests to Apple.
  3. Claim coercion — `email_verified` arrives as the STRING "false" in some token shapes and
     jose passes it through untouched. `_coerce_apple_bool` in auth_router.py is that gate.
  4. JWKS fetching and caching.

Two corrections to the sprint documents, both measured here (see build-notes-4g-api.md):
  * `clock_skew_in_seconds` is NOT a python-jose argument (it belongs to google-auth). The
    spelling is `options={"leeway": N}` and the default is 0.
  * `audience=` must be a string or None — jose raises `JWTError: audience must be a string
    or None` for a list — so a multi-valued APPLE_AUDIENCES is tried one entry at a time.

No new dependency: `jose` is already `app/auth.py:5`'s library and `requests` is already what
`google.auth.transport.requests` uses underneath.
"""
import hmac
import os
import time
from typing import Optional

import requests
from cryptography.fernet import Fernet, InvalidToken   # Sprint 4H: already pinned transitively
from jose import jwt
from jose.exceptions import JOSEError, JWTClaimsError

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"

# How long a fetched key document is reused. Apple rotates these rarely; an unknown `kid`
# forces exactly one refetch regardless, so a long TTL costs nothing.
JWKS_TTL_SECONDS = 3600

# K-04. python-jose's own default is 0; /auth/google allows 10s (auth_router.py:59), so the
# two routes behave the same way on a skewed clock.
LEEWAY_SECONDS = 10

# R-04: the floor is on the BODY's nonce, so an empty string cannot satisfy the comparison
# trivially on both sides.
MIN_NONCE_LENGTH = 32


class AppleKeysUnavailable(Exception):
    """Apple's key document could not be fetched -> 503.

    "Apple is unreachable" must never degrade into "the signature was not checked", which is
    what the tempting `except: pass` would do.
    """


class AppleTokenInvalid(Exception):
    """Any verification failure at all -> one opaque 401.

    The route never reports WHICH check failed, for the same reason /auth/bot-login does not
    (auth_router.py:224-225).
    """


def fetch_jwks() -> dict:
    """Fetch Apple's published keys.

    This is the single seam the whole test suite hangs on: it is a module-level name, so a
    test monkeypatches `app.apple_keys.fetch_jwks` and CI makes no network call and needs no
    secret. The keys come from appleid.apple.com over TLS and from nowhere else — there is no
    "key from the token header" path, ever.
    """
    resp = requests.get(APPLE_JWKS_URL, timeout=5)
    resp.raise_for_status()
    return resp.json()


_cache: dict = {"doc": None, "fetched_at": 0.0}


def reset_cache() -> None:
    """Drop the cached document. Tests use it to start cold; nothing in the app calls it."""
    _cache["doc"] = None
    _cache["fetched_at"] = 0.0


def _refresh() -> dict:
    try:
        doc = fetch_jwks()
    except Exception as e:
        # No status code, no body, no URL contents in the message — a type name only.
        raise AppleKeysUnavailable(type(e).__name__)
    if not isinstance(doc, dict) or not doc.get("keys"):
        raise AppleKeysUnavailable("empty key document")
    _cache["doc"] = doc
    _cache["fetched_at"] = time.time()
    return doc


def _cached_jwks() -> dict:
    doc = _cache["doc"]
    if doc is None or (time.time() - _cache["fetched_at"]) > JWKS_TTL_SECONDS:
        return _refresh()
    return doc


def key_ids(doc: dict) -> list:
    """Every `kid` in a key document, in order. Reads the DOCUMENT, never the token."""
    return [k.get("kid") for k in (doc.get("keys") or []) if k.get("kid")]


def _find_key(doc: dict, kid: Optional[str]) -> Optional[dict]:
    if not kid:
        return None
    for key in doc.get("keys") or []:
        if key.get("kid") == kid:
            return key
    return None


def select_key(kid: Optional[str]) -> dict:
    """The key whose `kid` matches, with AT MOST ONE refetch per request.

    jose does not select by `kid`, so this is the only place a rotated key set is noticed —
    and the `while` loop a reader might reach for instead is the amplification bug: it turns
    a flood of unknown-`kid` tokens into a flood of requests to Apple.
    """
    doc = _cached_jwks()
    key = _find_key(doc, kid)
    if key is None:
        doc = _refresh()                      # exactly one, then fail
        key = _find_key(doc, kid)
    if key is None:
        raise AppleTokenInvalid("unknown kid")
    return key


def verify_identity_token(token: str, nonce: str, audiences: list) -> dict:
    """Return the verified claims, or raise.

    Raises AppleTokenInvalid for every token-side failure and AppleKeysUnavailable only when
    Apple's key document could not be fetched.
    """
    # R-04's floor, on the body's value, before anything else is read.
    if not isinstance(nonce, str) or len(nonce) < MIN_NONCE_LENGTH:
        raise AppleTokenInvalid("nonce too short")
    if not audiences:
        raise AppleTokenInvalid("no audience configured")

    try:
        header = jwt.get_unverified_header(token)
    except JOSEError:
        raise AppleTokenInvalid("unreadable header")

    key = select_key(header.get("kid"))

    claims = None
    for audience in audiences:
        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=["RS256"],          # explicit allowlist: alg:none and HS256 die here
                audience=audience,             # one string per attempt — jose refuses a list
                issuer=APPLE_ISSUER,
                options={"leeway": LEEWAY_SECONDS},
            )
            break
        except JWTClaimsError:
            continue                           # wrong aud (or iss) for this entry; try the next
        except JOSEError:
            raise AppleTokenInvalid("signature or claims")
    if claims is None:
        raise AppleTokenInvalid("audience")

    # R-04. The claim must be PRESENT — an absent nonce is a 401, not a warning and not a pass.
    claim_nonce = claims.get("nonce")
    if not isinstance(claim_nonce, str):
        raise AppleTokenInvalid("nonce missing")
    if not hmac.compare_digest(claim_nonce.encode("utf-8"), nonce.encode("utf-8")):
        raise AppleTokenInvalid("nonce mismatch")

    return claims


# ─────────────────────────────────────────────────────────────────────────────────────────────
# R-13: token revocation on account deletion (Sprint 4G, package P3)
#
# Apple requires an app that offers Sign in with Apple AND account deletion to revoke the
# reader's tokens through its REST API as part of that deletion; it is checked in review
# alongside Guideline 5.1.1(v). Without it the reader's Apple ID keeps listing TrackMyRead
# under "Apps Using Apple ID" after they deleted their account.
#
# The one rule that outranks everything else here: **5.1.1(v) beats revocation.** A reader who
# asks to be deleted gets deleted, whatever Apple's endpoint does. So `revoke_token` NEVER
# raises — the swallow lives here rather than in the route, because this module owns the
# protocol and therefore owns its failure modes, and one guard is easier to reason about than
# two. Its return value is the outcome, never an exception.
#
# R-13 ships INERT: with `APPLE_PRIVATE_KEY` unset (the shipping state until the PM creates the
# `.p8` — pm-decisions E-4) nothing is attempted and nothing is sent. Enabling it is three
# environment variables and no deploy.
# ─────────────────────────────────────────────────────────────────────────────────────────────

APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"

# R-13 says "an exp within an hour" and tests.md B-40 asserts `exp - iat <= 3600`, so that is
# the ceiling this has to stay under. Ten minutes is plenty for one synchronous call, and it
# makes a leaked secret useless almost immediately.
CLIENT_SECRET_TTL_SECONDS = 600

REVOKE_TIMEOUT_SECONDS = 5


def _revoke_config() -> tuple:
    """`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, read on every call.

    Per call for the same reason `_apple_config` reads `APPLE_AUDIENCES` per request: a test
    monkeypatches them, and an operator rotates the key on Render without a code deploy.
    Read at import time instead and R-13 could only ever be enabled by a restart.

    The PEM is NOT stripped — a PKCS8 PEM's trailing newline is part of the file and
    `cryptography` is content to have it either way, but trimming the interior would corrupt
    it, so this does not touch it at all.
    """
    return (
        (os.getenv("APPLE_TEAM_ID") or "").strip(),
        (os.getenv("APPLE_KEY_ID") or "").strip(),
        os.getenv("APPLE_PRIVATE_KEY") or "",
    )


def build_client_secret(team_id: str, key_id: str, private_key: str, client_id: str) -> str:
    """The ES256 `client_secret` Apple's `auth/revoke` authenticates with.

    `iss` is the Team ID, `sub` is the client id (for a native app that is the bundle id, which
    pm-decisions E-2 keeps as `com.bookpulse.mobile`), `aud` is Apple itself. The `kid` header
    names which of the team's Sign in with Apple keys signed it, which is why `APPLE_KEY_ID`
    is a separate variable from the key material.

    ES256, not RS256: Apple only accepts an elliptic-curve signature here, and a `.p8` is an
    EC key — `jose.jwt.encode(..., algorithm="RS256")` with one raises `JWSError` outright.
    No new dependency; `python-jose[cryptography]` was already pinned.
    """
    now = int(time.time())
    return jwt.encode(
        {
            "iss": team_id,
            "sub": client_id,
            "aud": APPLE_ISSUER,
            "iat": now,
            "exp": now + CLIENT_SECRET_TTL_SECONDS,
        },
        private_key,
        algorithm="ES256",
        headers={"kid": key_id},          # jose supplies {"alg","typ"}; measured, not assumed
    )


def http_post(url: str, data: dict, timeout: int):
    """The single injectable seam for the outbound revocation, the shape `fetch_jwks` already
    gives verification: a module-level name a test monkeypatches, so CI makes no network call
    and needs no secret (architecture §Security review 4 — the key must never reach Actions).
    """
    return requests.post(url, data=data, timeout=timeout)


def revoke_token(refresh_token: Optional[str], client_id: str) -> Optional[int]:
    """Best-effort revocation of a reader's Apple tokens. **Returns, never raises.**

    Returns the HTTP status code when a call completed (including a 4xx/5xx — the status is the
    outcome, not a reason to fail), and None when nothing was sent: not configured, not gated
    in, no stored refresh token, or the attempt itself failed or timed out.

    **Sprint 4H changed what the first argument is.** Through Sprint 4G this was the Apple
    `sub`, and that could never work: Apple's `auth/revoke` takes a refresh or access token in
    `token=` and rejects a subject with a 400 (build-notes-4g-revoke.md item 1). The caller now
    passes the refresh token obtained by `exchange_authorization_code` at sign-in. `None` is an
    accepted argument and means "nothing to revoke" — the inert path, not an error.

    Signature note (a deliberate deviation from architecture §P3's `revoke_token(user)`): this
    takes the two strings it needs rather than a `models.User`, which keeps `apple_keys.py`
    free of the ORM in both directions and makes it impossible for this function to read a
    column it has no business reading. The route owns the `apple_sub IS NOT NULL` gate.

    Logging discipline (R-13, architecture §Security review 4): a status code and nothing else.
    No `client_secret`, no PEM, no refresh token, no `apple_sub`, no email, no response body. A
    failure logs the exception's TYPE NAME only, because `requests` puts the URL — and
    therefore sometimes the query it was given — into the exception's own string.
    """
    try:
        team_id, key_id, private_key = _revoke_config()
        if not (refresh_token and client_id and team_id and key_id and private_key):
            # The shipping state until the PM creates the `.p8` (pm-decisions E-4). Not an
            # error and not a warning: R-13 is knowingly inert and this is the line that says
            # so in the Render log.
            print("apple revoke: not configured, skipped", flush=True)
            return None

        client_secret = build_client_secret(team_id, key_id, private_key, client_id)
        resp = http_post(
            APPLE_REVOKE_URL,
            {
                "token": refresh_token,
                "token_type_hint": "refresh_token",
                "client_id": client_id,
                "client_secret": client_secret,
            },
            REVOKE_TIMEOUT_SECONDS,
        )
        status = getattr(resp, "status_code", None)
        print(f"apple revoke: status {status}", flush=True)
        return status
    except Exception as e:
        # 5.1.1(v) outranks revocation. There is no failure here that may reach the caller:
        # the deletion must complete when Apple is down, slow, or misconfigured.
        print(f"apple revoke: failed ({type(e).__name__})", flush=True)
        return None


# ─────────────────────────────────────────────────────────────────────────────────────────────
# Sprint 4H: the authorization-code exchange, and the refresh token at rest.
#
# WHY THIS EXISTS. Sprint 4G's revocation could not work. Apple's `auth/revoke` wants a refresh
# or access token in `token=`; 4G had only the Apple `sub` to put there, and Apple answers a
# subject with 400 (build-notes-4g-revoke.md "What I found wrong" item 1). The reader's Apple ID
# therefore kept listing TrackMyRead under "Apps Using Apple ID" — the one thing R-13 exists to
# prevent, and the thing App Review checks.
#
# A refresh token exists only if someone exchanges the client's ONE-TIME `authorizationCode` at
# `auth/token`. So the client now sends that code, this module exchanges it, and the result is
# stored on the reader's row for the deletion to revoke with.
#
# TWO RULES, both inherited and both absolute:
#   * Neither function raises. 5.1.1(v) outranks revocation, and sign-in outranks both: a
#     reader must be able to sign in when Apple's token endpoint is down, and must be able to
#     delete their account when its revoke endpoint is. Every failure here is a return value.
#   * The log carries a status code and nothing else — never the code, the refresh token, the
#     `client_secret`, the PEM, the encryption key or the response body.
#
# STILL INERT WITHOUT CONFIGURATION. `APPLE_PRIVATE_KEY` unset -> no exchange is attempted.
# `APPLE_TOKEN_KEY` unset -> nothing is written to the column. Either way the behaviour is
# exactly Sprint 4G's, which is the state tested and deployed today.
# ─────────────────────────────────────────────────────────────────────────────────────────────

APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"

TOKEN_TIMEOUT_SECONDS = 5


def exchange_authorization_code(code: str, client_id: str) -> Optional[str]:
    """Exchange Apple's one-time `authorizationCode` for a refresh token. **Never raises.**

    Returns the refresh token, or None for every other outcome: not configured, no code, a
    non-200 from Apple, a response without a `refresh_token`, a timeout, a transport error.

    The `client_secret` is the SAME ES256 assertion the revocation builds — same `.p8`, same
    `iss`/`sub`/`aud`, same ten-minute `exp`. One key serves both endpoints, which is why there
    is no second set of environment variables here.

    `client_id` must be the same value the deletion will later present to `auth/revoke`: Apple
    binds the code, the refresh token and the client together, and a refresh token obtained for
    one `client_id` cannot be revoked as another. The route passes the first configured
    audience for both, so the two can never disagree (see the route's comment).

    No retry. A retry would be wrong twice over: the code is single-use, so a retry after a
    response Apple did process is guaranteed to fail with `invalid_grant`, and sign-in is a
    reader waiting on a screen. The reader's next sign-in brings a fresh code.
    """
    try:
        team_id, key_id, private_key = _revoke_config()
        if not (code and client_id and team_id and key_id and private_key):
            # The shipping state until the PM creates the `.p8`. Not an error: the column stays
            # NULL, the deletion sends nothing, and that is exactly Sprint 4G's behaviour.
            print("apple token: not configured, skipped", flush=True)
            return None

        client_secret = build_client_secret(team_id, key_id, private_key, client_id)
        resp = http_post(
            APPLE_TOKEN_URL,
            {
                "grant_type": "authorization_code",
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
            },
            TOKEN_TIMEOUT_SECONDS,
        )
        status = getattr(resp, "status_code", None)
        if status != 200:
            # Apple puts `error` and `error_description` in the body. Neither is logged: the
            # body of a token response is the one place a token can appear.
            print(f"apple token: status {status}", flush=True)
            return None

        refresh = (resp.json() or {}).get("refresh_token")
        if not isinstance(refresh, str) or not refresh:
            # A 200 with no `refresh_token`. Distinguished from the 200 above in the log,
            # because "Apple answered fine and we still have nothing" is the confusing case to
            # debug from a Render log six months from now.
            print("apple token: status 200, no refresh_token", flush=True)
            return None
        print("apple token: status 200, refresh_token stored", flush=True)
        return refresh
    except Exception as e:
        print(f"apple token: failed ({type(e).__name__})", flush=True)
        return None


# ── The refresh token at rest ────────────────────────────────────────────────────────────────
#
# THE DECISION: encrypted, with a key that lives only in the Render environment, and NO
# PLAINTEXT FALLBACK. `APPLE_TOKEN_KEY` unset means nothing is stored at all.
#
# WHY ENCRYPT. The attacker this project actually has is read-only on the database: one Supabase
# instance is shared by dev and production, the repository is public, and backups exist. A key
# held in the process environment is precisely the control for that attacker and for no other.
#
# WHY NO FALLBACK. A security property that depends on whether an environment variable happens
# to be set is not a property. With the key unset the column stays NULL, the deletion sends
# nothing, and the system behaves exactly as the deployed Sprint 4G does.
#
# WHAT IT IS NOT. This is not protection against someone who has the Render environment: they
# hold `APPLE_TOKEN_KEY` and `APPLE_PRIVATE_KEY` both, and encryption buys nothing against them.
# What the token grants even then is bounded — a refresh or a revocation of THIS app's Sign in
# with Apple relationship, and nothing else of the reader's Apple ID. It is also not a way back
# into TrackMyRead: an `id_token` minted from a refresh grant carries no `nonce` claim, and
# `verify_identity_token` above rejects a token whose `nonce` is absent.
#
# Fernet, not a hand-rolled AES: authenticated (AES-128-CBC + HMAC-SHA256), versioned, and
# `cryptography` is already installed through `python-jose[cryptography]`. No new dependency.


def _token_key() -> Optional[Fernet]:
    """`APPLE_TOKEN_KEY` as a Fernet, or None. Read per call, like every other Apple variable.

    A malformed key is None rather than an exception: it must degrade to "nothing stored", the
    same as an unset one, and never to a 500 on sign-in.
    """
    raw = (os.getenv("APPLE_TOKEN_KEY") or "").strip()
    if not raw:
        return None
    try:
        return Fernet(raw.encode("utf-8"))
    except Exception as e:
        print(f"apple token key: unusable ({type(e).__name__})", flush=True)
        return None


def seal_token(plaintext: Optional[str]) -> Optional[str]:
    """The value to put in `user.apple_refresh_token`, or None to leave the column alone.

    None for every reason the token cannot be protected: no key, an unusable key, no plaintext,
    or a failure in the primitive. A caller that gets None writes nothing — it must never fall
    back to storing the plaintext.
    """
    fernet = _token_key()
    if fernet is None or not plaintext:
        return None
    try:
        return fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")
    except Exception as e:                       # pragma: no cover - Fernet.encrypt is total
        print(f"apple token seal: failed ({type(e).__name__})", flush=True)
        return None


def unseal_token(sealed: Optional[str]) -> Optional[str]:
    """The stored value back as a refresh token, or None. **Never raises.**

    None covers the cases a deletion has to survive: the column is NULL, the key was rotated
    without re-sealing, the ciphertext is corrupt.

    `InvalidToken` is caught by name only to give the rotated-key case its own log line.
    MEASURED, because the obvious guess is wrong: Fernet raises `InvalidToken` for EVERY
    malformed input, including an empty string, a non-base64 string and a non-ASCII one — there
    is no separate decode error to catch. The bare `except Exception` after it is therefore a
    backstop, not a second code path: this runs on the deletion route, where Guideline 5.1.1(v)
    means nothing may raise, and "no exception has ever been seen here" is not a guarantee.
    """
    fernet = _token_key()
    if fernet is None or not sealed:
        return None
    try:
        return fernet.decrypt(sealed.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        print("apple token unseal: wrong key or corrupt value", flush=True)
        return None
    except Exception as e:
        print(f"apple token unseal: failed ({type(e).__name__})", flush=True)
        return None
