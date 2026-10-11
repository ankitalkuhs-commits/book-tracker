"""Sprint 4G — Sign in with Apple: the column, the guard, verification, linking, revocation.

tests.md packages P1 (B-32, B-32a, B-32b, B-38, B-39), P2 (B-01..B-13, B-20..B-36) and
P3 (B-40..B-44, revocation on deletion).

What section 3.1 establishes and what it does not (tests.md non-vacuity rule 10): every token
here is minted by this suite, with an RSA key this suite generated, against a key document this
suite built. That proves OUR verifier accepts exactly what it should and rejects exactly what it
should. It is NOT evidence that Apple signs RS256, that Apple's `kid`s look like ours, or that
Apple's claim set contains what we read. The only thing in CI that touches Apple's real bytes is
B-02a, which parses a checked-in snapshot of Apple's PUBLIC key document and asserts nothing
about any signature. R-15 item 1 (a TestFlight build) is the substitute proof and it does not
exist yet.
"""
import ast
import base64
import hashlib
import itertools
import json
import re
import subprocess
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests as requests_lib          # only for the exception type B-11 raises
from cryptography.fernet import Fernet          # Sprint 4H
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from sqlalchemy import event
from fastapi.testclient import TestClient
from jose import jwt
from jose.utils import base64url_encode
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, Session, select

# ── Import guard (tests.md K-07, non-vacuity rule 5) ─────────────────────────────────────────
# A missing or renamed symbol must be ONE loud collection error, never N silent skips.
from app import apple_keys, auth, crud, models, schema_guard
from app.apple_keys import fetch_jwks, revoke_token, verify_identity_token
from app.models import User
from app.routers import auth_router

assert callable(verify_identity_token) and callable(fetch_jwks)
# `revoke_token` is P3's symbol (R-13). P1+P2 deliberately left it out of this guard, because
# importing a symbol that did not exist yet would have been ONE collection error that took all
# 64 of their assertions with it. P3 has landed, so the guard tests.md asks for is complete.
assert callable(revoke_token)
assert hasattr(User, "apple_sub"), "P1 has not added the column"

from tests.conftest import _auth, _make_user, engine

REPO_ROOT = Path(__file__).resolve().parents[1]
APPLE_KEYS_PATH = REPO_ROOT / "app" / "apple_keys.py"
AUTH_ROUTER_PATH = REPO_ROOT / "app" / "routers" / "auth_router.py"
# Captured 2026-10-06 with `curl -s https://appleid.apple.com/auth/keys`. Public keys only —
# Apple's key document contains no private material by definition (G-4G-07). Apple rotates
# keys, so B-02a asserts the SHAPE and never a specific `kid`. JSON permits no comment, which
# is why the capture date lives here and in the build notes rather than in the file.
JWKS_SNAPSHOT_PATH = REPO_ROOT / "tests" / "fixtures" / "apple_jwks_snapshot.json"

APPLE_ISS = "https://appleid.apple.com"
BUNDLE_ID = "com.bookpulse.mobile"          # app.json:30, kept knowingly (pm-decisions E-2)
NONCE = "4g" + "n" * 30                     # exactly 32 characters
PLACEHOLDER_RE = re.compile(r"^apple-[0-9a-f]{16}@users\.noreply\.trackmyread\.com$")


class _Absent:
    """A claim that is not in the token at all, as distinct from one whose value is null."""

    def __repr__(self):                      # pragma: no cover - debugging aid only
        return "<absent>"


_ABSENT = _Absent()


# ── An Apple-token factory, not Apple-token literals ─────────────────────────────────────────

def _rsa():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _pem(key):
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()


def _jwk(key, kid):
    nums = key.public_key().public_numbers()

    def b64u(n):
        return base64url_encode(n.to_bytes((n.bit_length() + 7) // 8, "big")).decode()

    return {"kty": "RSA", "kid": kid, "use": "sig", "alg": "RS256",
            "n": b64u(nums.n), "e": b64u(nums.e)}


SIGNING_KID = "4g-signing-kid"
DECOY_KID = "4g-decoy-kid"

_SIGNING_KEY = _rsa()
_SIGNING_PEM = _pem(_SIGNING_KEY)
_DECOY_KEY = _rsa()                          # in the document, never signs anything
_FOREIGN_KEY = _rsa()                        # NOT in the document (B-03)
_FOREIGN_PEM = _pem(_FOREIGN_KEY)

# The decoy is listed FIRST, so a key reader that ignores `kid` and takes the first entry
# cannot pass B-02 by luck.
JWKS = {"keys": [_jwk(_DECOY_KEY, DECOY_KID), _jwk(_SIGNING_KEY, SIGNING_KID)]}

_subs = itertools.count(1)


def _sub(label="case"):
    """A fresh Apple subject per call. Reusing one would turn a branch-4 case into branch 1."""
    return f"001234.4g{label}{next(_subs):04d}.5678"


def _mint(*, kid=SIGNING_KID, pem=None, algorithm="RS256", **claims):
    """Mint an Apple-shaped identity token.

    `email_verified` and `is_private_email` are NEVER defaulted — a default there is how a
    claim-shape suite stops testing claim shapes.
    """
    payload = {
        "iss": APPLE_ISS,
        "aud": BUNDLE_ID,
        "sub": _sub(),
        "exp": int(time.time()) + 600,
        "iat": int(time.time()),
        "nonce": NONCE,
    }
    payload.update(claims)
    payload = {k: v for k, v in payload.items() if not isinstance(v, _Absent)}
    return jwt.encode(payload, pem or _SIGNING_PEM, algorithm=algorithm,
                      headers={"kid": kid})


def _b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


def _body(token, nonce=NONCE, full_name=_ABSENT):
    body = {"identity_token": token, "nonce": nonce}
    if not isinstance(full_name, _Absent):
        body["full_name"] = full_name
    return body


def _configure_apple(monkeypatch, *audiences):
    """Mirrors tests/test_auth.py's `_configure` for /auth/review-login. `_apple_config` reads
    the var per request, so monkeypatch works with no restart."""
    if audiences:
        monkeypatch.setenv("APPLE_AUDIENCES", ",".join(audiences))
    else:
        monkeypatch.delenv("APPLE_AUDIENCES", raising=False)


@pytest.fixture(autouse=True)
def apple_jwks(monkeypatch):
    """The one seam: every case serves its own key document, so CI makes no network call and
    needs no secret. Yields the call counter B-10 and B-10a assert on."""
    calls = {"n": 0}

    def _stub():
        calls["n"] += 1
        return JWKS

    monkeypatch.setattr(apple_keys, "fetch_jwks", _stub)
    monkeypatch.delenv("APPLE_AUDIENCES", raising=False)
    apple_keys.reset_cache()
    yield calls
    apple_keys.reset_cache()


@pytest.fixture(scope="module", autouse=True)
def _tidy_up_4g_rows():
    """Delete the rows this module created, after this module and before any other runs.

    MEASURED, not anticipated: the 64 cases here add about 90 `user` rows, and that alone
    turned `tests/test_bots.py::TestAdminMetrics::test_admin_lists_carry_is_bot` red —
    it reads `/admin/users?limit=200` and asserts its own two accounts are in the page, so
    it fails on VOLUME rather than on behaviour (`1 failed, 778 passed`, the id it wanted was
    271). Editing that test is not an option (R-08: every existing test passes unedited), so
    this module removes exactly what it added and nothing else. Every email this file creates
    starts with `4g-`, plus branch 5's synthesised placeholders.
    """
    yield
    with Session(engine) as session:
        for pattern in ("4g-%", "apple-%@users.noreply.trackmyread.com"):
            for row in session.exec(
                select(models.User).where(models.User.email.like(pattern))
            ).all():
                session.delete(row)
        session.commit()


def _count_users(db):
    db.expire_all()
    return len(db.exec(select(models.User)).all())


def _row(db, user_id):
    db.expire_all()
    return db.exec(select(models.User).where(models.User.id == user_id)).first()


def _holders(db, sub):
    db.expire_all()
    return db.exec(select(models.User).where(models.User.apple_sub == sub)).all()


class _StubEngine:
    """The 4C/4F shape (tests/test_local_day.py:1297-1323), local so this file stands alone."""

    def __init__(self, dialect_name, rows=None):
        self.dialect = SimpleNamespace(name=dialect_name)
        self._rows = rows or []
        self.connect_calls = 0

    def connect(self):
        self.connect_calls += 1
        rows = self._rows

        class _Conn:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *a):
                return False

            def execute(self_inner, *a, **k):
                class _Result:
                    def all(self_r):
                        return rows

                return _Result()

        return _Conn()


# ═════════════════════════════════════════════════════════════════════════════════════════════
# P1 — the column and the guard
# ═════════════════════════════════════════════════════════════════════════════════════════════

class TestAppleColumn:

    def test_schema_guard_entry(self):
        """B-32. MUT-4G-01: drop the entry from app/schema_guard.py."""
        pairs = schema_guard.REQUIRED_COLUMNS
        assert ("user", "apple_sub") in pairs
        # the four that were already there — so the message in B-38 is specific, and so a
        # replaced tuple cannot masquerade as an appended one
        for pre in (("user", "timezone"), ("reading_activity", "local_day"),
                    ("user", "is_bot"), ("bot_post", "dedup_key")):
            assert pre in pairs, pre
        # Sprint 4H appended ("user","apple_refresh_token"), so this literal moved 5 -> 6.
        # It stays a literal rather than becoming `>= 5`: the point of the count is that a
        # sprint cannot REPLACE a pair and have it read as an append.
        assert len(pairs) == 6
        # every declared pair exists on a model — catches `apple_subs` and any other typo
        tables = SQLModel.metadata.tables
        for tname, cname in pairs:
            assert tname in tables, tname
            assert cname in tables[tname].columns, f"{tname}.{cname}"

    def test_column_shape(self, db):
        """B-32a. MUT-4G-02: `apple_sub: str = Field(default="")`; MUT-4G-03: drop unique."""
        col = models.User.__table__.c.apple_sub
        assert col.nullable is True
        assert col.unique is True
        assert col.index is True
        assert col.type.length in (None, 255)
        # A fresh row is NULL, not "": "" would collide under the unique index for every
        # Google reader the moment a second one was created.
        fresh = _make_user(db, email="4g-b32a@example.com", name="B32a")
        assert fresh.apple_sub is None

    def test_uniqueness_is_the_database_not_the_handler(self):
        """B-32b. MUT-4G-03: drop `unique=True` -> DID NOT RAISE IntegrityError."""
        shared = "001234.b32b-shared.0000"
        with Session(engine) as s:
            s.add(models.User(name="B32b A", email="4g-b32b-a@example.com",
                              username="4g-b32b-a", password_hash="x", apple_sub=shared))
            s.commit()
            s.add(models.User(name="B32b B", email="4g-b32b-b@example.com",
                              username="4g-b32b-b", password_hash="x", apple_sub=shared))
            with pytest.raises(IntegrityError):
                s.flush()
            s.rollback()

        # CONTROL: NULLs are ignored by a unique index on both PostgreSQL and SQLite, which is
        # what lets thousands of Google-only readers coexist.
        with Session(engine) as s:
            for i in range(3):
                s.add(models.User(name=f"B32b N{i}", email=f"4g-b32b-n{i}@example.com",
                                  username=f"4g-b32b-n{i}", password_hash="x", apple_sub=None))
            s.commit()
            nulls = s.exec(
                select(models.User).where(models.User.email.like("4g-b32b-n%"))
            ).all()
            assert len(nulls) == 3
            assert [u.apple_sub for u in nulls] == [None, None, None]

    def test_guard_raises_naming_apple_sub(self):
        """B-38. MUT-4G-01 -> DID NOT RAISE RuntimeError."""
        served = [p for p in schema_guard.REQUIRED_COLUMNS if p != ("user", "apple_sub")]
        # built by subtraction, never a literal list, so it cannot rot
        assert len(served) == len(schema_guard.REQUIRED_COLUMNS) - 1

        eng = _StubEngine("postgresql", rows=served)
        with pytest.raises(RuntimeError) as exc:
            schema_guard.assert_migrated(eng)
        msg = str(exc.value)
        assert "user.apple_sub" in msg
        assert "user.is_bot" not in msg          # the other four were present: specific message
        assert eng.connect_calls == 1

        # CONTROL: the full set does not raise, so the failure above was the missing column.
        good = _StubEngine("postgresql", rows=list(schema_guard.REQUIRED_COLUMNS))
        assert schema_guard.assert_migrated(good) is None

    def test_startup_refuses_before_the_scheduler(self, monkeypatch):
        """B-39. MUT-4G-04: move `assert_migrated(engine)` below `start_scheduler()`.

        app/main.py:166 calls the guard; :168 starts the scheduler. Nothing may start before
        the guard has had its say.
        """
        import app.database as appdb
        import app.notifications.scheduler as sched_mod
        from app.main import app as fastapi_app

        served = [p for p in schema_guard.REQUIRED_COLUMNS if p != ("user", "apple_sub")]
        calls = []
        monkeypatch.setattr(sched_mod, "start_scheduler", lambda: calls.append(1))

        monkeypatch.setattr(appdb, "engine", _StubEngine("postgresql", rows=served))
        with pytest.raises(RuntimeError):
            with TestClient(fastapi_app):
                pass
        assert calls == []

        # CONTROL: with the column present it starts, and the scheduler runs exactly once.
        monkeypatch.setattr(appdb, "engine",
                            _StubEngine("postgresql", rows=list(schema_guard.REQUIRED_COLUMNS)))
        with TestClient(fastapi_app):
            pass
        assert calls == [1]


# ═════════════════════════════════════════════════════════════════════════════════════════════
# P2 — token verification
# ═════════════════════════════════════════════════════════════════════════════════════════════

def _decode_algorithms():
    """The `algorithms=` allowlist literal passed to jwt.decode in app/apple_keys.py.

    Structural, and it exists because the behavioural half cannot catch MUT-4G-11/12: the key
    handed to jose is the selected RSA JWK, so an `alg: none` or HS256 token raises JWKError
    with or without the allowlist and the route returns 401 either way. Measured, recorded in
    build-notes-4g-api.md, and reported rather than papered over.
    """
    tree = ast.parse(APPLE_KEYS_PATH.read_text(encoding="utf-8"))
    found = []
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "decode"):
            for kw in node.keywords:
                if kw.arg == "algorithms":
                    found.append([ast.literal_eval(e) for e in kw.value.elts])
    assert len(found) == 1, f"expected exactly one jwt.decode with an allowlist, got {found}"
    return found[0]


def _nonce_eq_violations(source, func_name):
    """(compare_digest calls, `==` comparisons mentioning the nonce) inside one function."""
    tree = ast.parse(source)
    fn = None
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == func_name:
            fn = node
            break
    assert fn is not None, f"{func_name} not found — the detector had nothing to look at"
    digests = [n for n in ast.walk(fn)
               if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
               and n.func.attr == "compare_digest"]
    violations = []
    for n in ast.walk(fn):
        if isinstance(n, ast.Compare) and any(isinstance(op, ast.Eq) for op in n.ops):
            segment = ast.get_source_segment(source, n) or ""
            if "nonce" in segment:
                violations.append(f"apple_keys.py:{func_name}")
    return digests, violations


class TestAppleTokenVerification:

    def test_404_when_audiences_unset(self, client, monkeypatch, db):
        """B-01. MUT-4G-06: delete the unconfigured -> 404 guard."""
        token = _mint(email="4g-b01@example.com", email_verified=True, is_private_email=False)
        for setting in (None, "", ",  ,"):
            if setting is None:
                monkeypatch.delenv("APPLE_AUDIENCES", raising=False)
            else:
                monkeypatch.setenv("APPLE_AUDIENCES", setting)
            r = client.post("/auth/apple", json=_body(token))
            assert r.status_code == 404, f"{setting!r} -> {r.status_code}"

        # CONTROL: the body was valid all along, so the 404 was the gate and not the payload.
        _configure_apple(monkeypatch, BUNDLE_ID)
        r = client.post("/auth/apple", json=_body(token))
        assert r.status_code == 200, r.text

    def test_route_is_in_openapi(self, client, monkeypatch):
        """B-01a. MUT-4G-07: add `include_in_schema=False`."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        paths = client.get("/openapi.json").json()["paths"]
        assert "/auth/apple" in paths
        assert set(paths["/auth/apple"]) == {"post"}
        # CONTROL: the deliberately hidden routes are still hidden.
        assert "/auth/bot-login" not in paths
        assert "/auth/review-login" not in paths

    def test_valid_token_signs_in_and_the_token_works(self, client, monkeypatch, db):
        """B-02. MUT-4G-08c: invert the verification result."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        email = "4g-b02@example.com"
        r = client.post("/auth/apple", json=_body(
            _mint(email=email, email_verified=True, is_private_email=False)))
        assert r.status_code == 200, r.text
        assert r.json()["access_token"]

        me = client.get("/profile/me",
                        headers={"Authorization": f"Bearer {r.json()['access_token']}"})
        assert me.status_code == 200, me.text
        assert me.json()["id"] == r.json()["user"]["id"]
        assert crud.get_user_by_email(db, email) is not None

    def test_apples_real_jwks_document_parses(self, monkeypatch):
        """B-02a (K-08). MUT-4G-09: read the key from the token header's `jwk`.

        The one case in CI that touches Apple's real bytes. It asserts NOTHING about a
        signature — we hold no Apple-signed token — and must not be read as proving one.
        """
        doc = json.loads(JWKS_SNAPSHOT_PATH.read_text(encoding="utf-8"))
        keys = doc["keys"]
        assert len(keys) >= 2            # rule 4: the inventory, before anything else

        private_members = {"d", "p", "q", "dp", "dq", "qi"}
        for key in keys:
            assert key["kty"] == "RSA"
            assert key["use"] == "sig"
            assert key["alg"] == "RS256"
            for member in ("kid", "n", "e"):
                assert key[member], member
            assert not (private_members & set(key)), "the fixture must be public keys only"

        kids = [k["kid"] for k in keys]
        assert apple_keys.key_ids(doc) == kids
        assert len(apple_keys.key_ids(doc)) == len(keys)

        # the real document, through the real key-selection path
        monkeypatch.setattr(apple_keys, "fetch_jwks", lambda: doc)
        apple_keys.reset_cache()
        for kid in kids:
            assert apple_keys.select_key(kid)["kid"] == kid
        with pytest.raises(apple_keys.AppleTokenInvalid):
            apple_keys.select_key("no-such-kid-in-apples-document")

    def test_token_signed_by_a_foreign_key_is_401_and_creates_nothing(self, client, monkeypatch, db):
        """B-03. MUT-4G-10: `options={"verify_signature": False}`."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        existing = _make_user(db, email="4g-b03@example.com", name="B03")
        before = _count_users(db)

        forged = _mint(pem=_FOREIGN_PEM, email=existing.email,
                       email_verified=True, is_private_email=False)
        r = client.post("/auth/apple", json=_body(forged))
        assert r.status_code == 401
        assert _count_users(db) == before
        assert _row(db, existing.id).apple_sub is None

        # CONTROL: the same claims signed with the published key are accepted, so the 401 was
        # the signature and not something else about the token.
        ok = _mint(email=existing.email, email_verified=True, is_private_email=False)
        assert client.post("/auth/apple", json=_body(ok)).status_code == 200

    def test_alg_none_is_401(self, client, monkeypatch, db):
        """B-04. MUT-4G-11: drop `algorithms=["RS256"]`."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        before = _count_users(db)
        claims = {"iss": APPLE_ISS, "aud": BUNDLE_ID, "sub": _sub(),
                  "exp": int(time.time()) + 600, "nonce": NONCE,
                  "email": "4g-b04@example.com", "email_verified": True}
        token = f"{_b64({'alg': 'none', 'typ': 'JWT', 'kid': SIGNING_KID})}.{_b64(claims)}."
        r = client.post("/auth/apple", json=_body(token))
        assert r.status_code == 401
        assert _count_users(db) == before
        # The allowlist is an explicit literal, asserted structurally: see _decode_algorithms
        # for why the behavioural half above cannot catch its removal.
        assert _decode_algorithms() == ["RS256"]

    def test_hs256_signed_with_our_secret_key_is_401(self, client, monkeypatch, db):
        """B-05. MUT-4G-12: `algorithms=["RS256","HS256"]`."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        before = _count_users(db)
        token = jwt.encode(
            {"iss": APPLE_ISS, "aud": BUNDLE_ID, "sub": _sub(),
             "exp": int(time.time()) + 600, "nonce": NONCE,
             "email": "4g-b05@example.com", "email_verified": True},
            auth.SECRET_KEY, algorithm="HS256")
        r = client.post("/auth/apple", json=_body(token))
        assert r.status_code == 401
        assert _count_users(db) == before
        assert "HS256" not in _decode_algorithms()

    def test_wrong_aud_is_401_and_the_same_token_passes_when_added(self, client, monkeypatch):
        """B-06. MUT-4G-13: drop `audience=`."""
        token = _mint(aud="com.other.app", email="4g-b06@example.com",
                      email_verified=True, is_private_email=False)
        _configure_apple(monkeypatch, BUNDLE_ID)
        assert client.post("/auth/apple", json=_body(token)).status_code == 401
        # the acceptance half is what proves the rejection was the `aud` check (rule 1)
        _configure_apple(monkeypatch, BUNDLE_ID, "com.other.app")
        assert client.post("/auth/apple", json=_body(token)).status_code == 200

    def test_audiences_is_parsed_like_bot_login_emails(self, client, monkeypatch):
        """B-06a. MUT-4G-14: compare against the raw APPLE_AUDIENCES string."""
        monkeypatch.setenv("APPLE_AUDIENCES",
                           " com.bookpulse.mobile , com.trackmyread.services ,, ")
        assert auth_router._apple_config() == ["com.bookpulse.mobile", "com.trackmyread.services"]

        # Multi-value matters: it is what lets the web be added later with no server change,
        # because the web flow's `aud` is a Services ID and not the bundle id (R-14).
        for aud in ("com.bookpulse.mobile", "com.trackmyread.services"):
            r = client.post("/auth/apple", json=_body(
                _mint(aud=aud, email=f"4g-b06a-{aud}@example.com",
                      email_verified=True, is_private_email=False)))
            assert r.status_code == 200, f"{aud} -> {r.status_code} {r.text}"
        third = _mint(aud="com.someone.else", email="4g-b06a-third@example.com",
                      email_verified=True, is_private_email=False)
        assert client.post("/auth/apple", json=_body(third)).status_code == 401

    def test_wrong_iss_is_401(self, client, monkeypatch):
        """B-07. MUT-4G-15: drop `issuer=`."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        evil = _mint(iss="https://appleid.apple.com.evil.test",
                     email="4g-b07-evil@example.com", email_verified=True, is_private_email=False)
        assert client.post("/auth/apple", json=_body(evil)).status_code == 401
        # CONTROL: the exact issuer is accepted.
        good = _mint(email="4g-b07-ok@example.com", email_verified=True, is_private_email=False)
        assert client.post("/auth/apple", json=_body(good)).status_code == 200

    def test_exp_with_the_ten_second_leeway(self, client, monkeypatch):
        """B-08 (K-04). MUT-4G-08: drop `options={"leeway": 10}`; MUT-4G-08b: verify_exp False.

        Deliberately does NOT use `freeze_at`: jose reads the real clock and the suite's seam
        (`localday.utcnow`) does not reach it, so the three tokens are minted at offsets from
        the real clock, which is timezone-independent by construction.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        now = int(time.time())
        cases = ((now + 600, 200), (now - 5, 200), (now - 60, 401))
        for exp, expected in cases:
            token = _mint(exp=exp, email=f"4g-b08-{exp}@example.com",
                          email_verified=True, is_private_email=False)
            r = client.post("/auth/apple", json=_body(token))
            assert r.status_code == expected, f"exp={exp - now:+d}s -> {r.status_code}"

    def test_nonce_is_bound_to_the_request(self, client, monkeypatch):
        """B-09 (K-16). MUT-4G-16: skip the comparison when the claim is missing;
        MUT-4G-16b: drop the 32-character floor on the body's nonce."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        short = "0123456789"
        assert len(NONCE) == 32 and len(short) == 10

        # 1. claim and body equal, long enough — the control that makes the other three mean
        #    something
        r = client.post("/auth/apple", json=_body(
            _mint(email="4g-b09-ok@example.com", email_verified=True, is_private_email=False)))
        assert r.status_code == 200, r.text

        # 2. claim and body differ
        r = client.post("/auth/apple", json=_body(
            _mint(nonce="z" * 32, email="4g-b09-diff@example.com",
                  email_verified=True, is_private_email=False)))
        assert r.status_code == 401

        # 3. no `nonce` claim at all, body present
        r = client.post("/auth/apple", json=_body(
            _mint(nonce=_ABSENT, email="4g-b09-absent@example.com",
                  email_verified=True, is_private_email=False)))
        assert r.status_code == 401

        # 4. claim and body equal, but the body is below the 32-character floor
        r = client.post("/auth/apple", json=_body(
            _mint(nonce=short, email="4g-b09-short@example.com",
                  email_verified=True, is_private_email=False), nonce=short))
        assert r.status_code == 401

    def test_nonce_compare_is_constant_time(self):
        """B-09a. MUT-4G-17: `claims["nonce"] == body_nonce` instead of hmac.compare_digest.

        A structural proof, stated plainly as such: a timing test on an in-process TestClient
        would be noise.
        """
        source = APPLE_KEYS_PATH.read_text(encoding="utf-8")
        digests, violations = _nonce_eq_violations(source, "verify_identity_token")
        assert violations == []
        assert len(digests) == 1

        # CONTROL (rule 3): the detector reports exactly one violation on a deliberately
        # offending snippet, so a clean result above is not an empty walk.
        snippet = 'def verify_identity_token(claims, body):\n    if claims["nonce"] == body.nonce: pass\n'
        bad_digests, bad_violations = _nonce_eq_violations(snippet, "verify_identity_token")
        assert len(bad_violations) == 1
        assert bad_digests == []

    def test_unknown_kid_refetches_exactly_once_then_401(self, client, monkeypatch, apple_jwks):
        """B-10. MUT-4G-18: `while kid not in doc: doc = fetch_jwks()`.

        The amplification control: a flood of unknown-`kid` tokens must not become a flood of
        outbound requests to Apple. jose does not select by `kid`, so this decision is ours.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        r = client.post("/auth/apple", json=_body(
            _mint(email="4g-b10@example.com", email_verified=True, is_private_email=False)))
        assert r.status_code == 200, r.text
        before = apple_jwks["n"]
        assert before == 1                        # the cache is primed from a known value

        r = client.post("/auth/apple", json=_body(
            _mint(kid="rotated-away", email="4g-b10-bad@example.com",
                  email_verified=True, is_private_email=False)))
        assert r.status_code == 401
        assert apple_jwks["n"] == before + 1

    def test_a_known_kid_is_served_from_the_cache(self, client, monkeypatch, apple_jwks):
        """B-10a. MUT-4G-19: remove the TTL cache and fetch per request.

        CONTROL for B-10: without this, "exactly one refetch" is satisfied by refetching on
        every single request.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        for i in range(2):
            r = client.post("/auth/apple", json=_body(
                _mint(email=f"4g-b10a-{i}@example.com",
                      email_verified=True, is_private_email=False)))
            assert r.status_code == 200, r.text
        assert apple_jwks["n"] == 1

    def test_jwks_fetch_failure_is_503_and_never_a_token(self, client, monkeypatch, db):
        """B-11. MUT-4G-20: `except Exception: pass` around the fetch.

        "Apple is unreachable" must never degrade into "the signature was not checked".
        """
        _configure_apple(monkeypatch, BUNDLE_ID)

        def _boom():
            raise requests_lib.RequestException("network down")

        monkeypatch.setattr(apple_keys, "fetch_jwks", _boom)
        apple_keys.reset_cache()
        before = _count_users(db)

        r = client.post("/auth/apple", json=_body(
            _mint(email="4g-b11@example.com", email_verified=True, is_private_email=False)))
        assert r.status_code == 503, r.text
        assert "access_token" not in r.json()
        assert _count_users(db) == before

    def test_absent_or_empty_sub_is_401(self, client, monkeypatch, db):
        """B-12. MUT-4G-21: default `sub` to the email claim.

        jose decodes both of these happily (measured), so the presence check is ours.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        before = _count_users(db)
        for label, sub in (("empty", ""), ("absent", _ABSENT)):
            r = client.post("/auth/apple", json=_body(
                _mint(sub=sub, email=f"4g-b12-{label}@example.com",
                      email_verified=True, is_private_email=False)))
            assert r.status_code == 401, f"{label} -> {r.status_code}"
            assert _count_users(db) == before, label

        # CONTROL: a non-empty `sub` with the same shape of claims is accepted.
        r = client.post("/auth/apple", json=_body(
            _mint(email="4g-b12-ok@example.com", email_verified=True, is_private_email=False)))
        assert r.status_code == 200, r.text

    def test_audiences_read_per_request(self, client, monkeypatch):
        """B-13. MUT-4G-22: hoist `os.getenv("APPLE_AUDIENCES")` to module scope."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        token = _mint(email="4g-b13@example.com", email_verified=True, is_private_email=False)
        assert client.post("/auth/apple", json=_body(token)).status_code == 200
        monkeypatch.delenv("APPLE_AUDIENCES")
        # the SAME token, no restart — mirroring auth_router.py:177-179's own reasoning
        assert client.post("/auth/apple", json=_body(token)).status_code == 404


# ═════════════════════════════════════════════════════════════════════════════════════════════
# P2 — the linking rule
# ═════════════════════════════════════════════════════════════════════════════════════════════

NOT_VERIFIED = (
    ("str-false", "false"),
    ("str-False-mixed", "False"),
    ("str-FALSE-upper", "FALSE"),
    ("bool-false", False),
    ("null", None),
    ("absent", _ABSENT),
    ("empty-string", ""),
    ("str-one", "1"),
    ("int-one", 1),
)
VERIFIED = (
    ("bool-true", True),
    ("str-true", "true"),
    ("str-True-mixed", "True"),
    ("str-TRUE-upper", "TRUE"),
)
RELAY = (
    ("bool-true", True),
    ("str-true", "true"),
    ("str-True-mixed", "True"),
    ("str-TRUE-upper", "TRUE"),
)
NON_RELAY = (
    ("bool-false", False),
    ("str-false", "false"),
    ("str-False-mixed", "False"),
    ("null", None),
    ("absent", _ABSENT),
)


def _ids(pairs):
    return [p[0] for p in pairs]


class TestAppleLinking:

    def test_branch_1_second_sign_in_is_the_same_account(self, client, monkeypatch, db):
        """B-20 (F4). MUT-4G-25: remove the `apple_sub` persistence on the create path.

        THE case of this suite. The second token carries only `sub`, `aud`, `iss`, `exp` and
        `nonce` — no email, no name — exactly as Apple behaves after the first authorization.
        Planting a row with `apple_sub` already set would test the lookup and never the write.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        sub = _sub("b20")
        first = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email="4g-b20@example.com", email_verified=True,
                  is_private_email=False), full_name="Reader One"))
        assert first.status_code == 200, first.text
        assert first.json()["is_new"] is True
        before = _count_users(db)

        second = client.post("/auth/apple", json=_body(_mint(sub=sub)))
        assert second.status_code == 200, second.text
        assert _count_users(db) == before
        assert second.json()["is_new"] is False
        assert second.json()["user"]["id"] == first.json()["user"]["id"]
        assert second.json()["user"]["email"] == first.json()["user"]["email"]

    def test_branch_1_reads_no_email(self, client, monkeypatch, db):
        """B-21. MUT-4G-26: consult the email before `apple_sub`; MUT-4G-26b: write the
        token's email onto the row on a branch-1 match."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        sub = _sub("b21")
        first = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email="4g-b21-first@example.com", email_verified=True,
                  is_private_email=False), full_name="First Name"))
        assert first.status_code == 200, first.text
        uid = first.json()["user"]["id"]
        row = _row(db, uid)
        email_before, name_before = row.email, row.name
        before = _count_users(db)

        # a different verified email and a different name, same subject
        second = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email="4g-b21-second@example.com", email_verified=True,
                  is_private_email=False), full_name="Renamed By Body"))
        assert second.status_code == 200, second.text
        assert second.json()["user"]["id"] == uid
        after = _row(db, uid)
        assert after.email == email_before
        assert after.name == name_before
        assert _count_users(db) == before

    def test_branch_3_links_additively(self, client, monkeypatch, db):
        """B-22. MUT-4G-27: create instead of linking; MUT-4G-33: write `name` from
        `full_name`.

        The additive constraint is what stops a link being an account takeover — the classic
        escalation from "I can sign in" to "I own this account".
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        alice = _make_user(db, email="4g-b22-alice@example.com", name="Alice", is_admin=True)
        alice.bio = "Alice's bio"
        alice.profile_picture = "/uploads/alice.png"
        db.add(alice)
        db.commit()
        db.refresh(alice)
        other = _make_user(db, email="4g-b22-other@example.com", name="Other")

        fields = ("email", "name", "username", "bio", "profile_picture",
                  "is_admin", "is_private_profile", "is_bot")
        alice_before = {f: getattr(alice, f) for f in fields}
        other_before = {f: getattr(other, f) for f in fields}
        assert alice_before["is_admin"] is True and alice_before["bio"] == "Alice's bio"
        alice_id, other_id = alice.id, other.id
        before = _count_users(db)

        sub = _sub("b22")
        r = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email=alice_before["email"], email_verified=True,
                  is_private_email=False), full_name="Attacker"))
        assert r.status_code == 200, r.text
        assert r.json()["is_new"] is False
        assert r.json()["user"]["id"] == alice_id
        assert _count_users(db) == before

        linked = _row(db, alice_id)
        assert linked.apple_sub == sub
        for f in fields:
            assert getattr(linked, f) == alice_before[f], f
        # CONTROL: the link was targeted — the unrelated reader did not move.
        untouched = _row(db, other_id)
        for f in fields:
            assert getattr(untouched, f) == other_before[f], f
        assert untouched.apple_sub is None

    @pytest.mark.parametrize("label,shape", NOT_VERIFIED, ids=_ids(NOT_VERIFIED))
    def test_branch_3_refuses_an_unverified_email(self, client, monkeypatch, db, label, shape):
        """B-23 (F7). MUT-4G-23: `if claims.get("email_verified"):` in place of the coercion.

        The mutation this sprint exists for. `email_verified` arrives as the STRING "false"
        and python-jose passes it through uncoerced, so the naive truth test is TRUE for
        "false" and links an unverified email onto an existing reader's row.
        """
        assert len(NOT_VERIFIED) == 9
        _configure_apple(monkeypatch, BUNDLE_ID)
        email = f"4g-b23-{label}@example.com".lower()
        existing = _make_user(db, email=email, name="B23 Existing")
        existing_id = existing.id
        before = _count_users(db)

        sub = _sub("b23")
        r = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email=email, email_verified=shape, is_private_email=False)))
        assert r.status_code == 200, r.text
        assert r.json()["is_new"] is True
        assert r.json()["user"]["id"] != existing_id
        assert _count_users(db) == before + 1
        untouched = _row(db, existing_id)
        assert untouched.apple_sub is None
        assert untouched.email == email

    @pytest.mark.parametrize("label,shape", VERIFIED, ids=_ids(VERIFIED))
    def test_branch_3_accepts_a_verified_email(self, client, monkeypatch, db, label, shape):
        """B-23a. MUT-4G-24: coerce with `== "true"` and no `.lower()`.

        CONTROL for B-23: without this, B-23 is satisfied by a coercion that never returns
        true — nothing would ever link and every negative case would still be green.
        """
        assert len(VERIFIED) == 4
        _configure_apple(monkeypatch, BUNDLE_ID)
        email = f"4g-b23a-{label}@example.com".lower()
        existing = _make_user(db, email=email, name="B23a Existing")
        existing_id = existing.id
        before = _count_users(db)

        sub = _sub("b23a")
        r = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email=email, email_verified=shape, is_private_email=False)))
        assert r.status_code == 200, r.text
        assert r.json()["is_new"] is False
        assert r.json()["user"]["id"] == existing_id
        assert _count_users(db) == before
        assert _row(db, existing_id).apple_sub == sub

    @pytest.mark.parametrize("label,shape", RELAY, ids=_ids(RELAY))
    def test_branch_3_refuses_a_relay(self, client, monkeypatch, db, label, shape):
        """B-24. MUT-4G-28: drop the `is_private_email` condition from branch 3;
        MUT-4G-28b: coerce `is_private_email` loosely.

        The address here is deliberately NOT in `privaterelay.appleid.com`: the domain floor
        (pm-decisions K-05, B-24a) would otherwise satisfy this case even with the claim rule
        broken, and the claim is the primary rule.
        """
        assert len(RELAY) == 4
        _configure_apple(monkeypatch, BUNDLE_ID)
        email = f"4g-b24-{label}@example.com".lower()
        existing = _make_user(db, email=email, name="B24 Existing")
        existing_id = existing.id
        before = _count_users(db)

        sub = _sub("b24")
        r = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email=email, email_verified=True, is_private_email=shape)))
        assert r.status_code == 200, r.text
        assert r.json()["is_new"] is True
        assert r.json()["private_relay"] is True
        assert r.json()["user"]["id"] != existing_id
        assert _count_users(db) == before + 1
        created = _row(db, r.json()["user"]["id"])
        assert created.email == email          # the asserted address is stored as given
        assert created.apple_sub == sub
        untouched = _row(db, existing_id)
        assert untouched.apple_sub is None

    def test_the_relay_domain_never_links_whatever_the_claim_says(self, client, monkeypatch, db):
        """B-24a, EXPECTATION INVERTED by pm-decisions addendum K-05.

        tests.md B-24a asserts that a `@privaterelay.appleid.com` address with
        `is_private_email: false` LINKS, because the architecture made the relay decision
        claim-only. The PM then ruled the other way: "an address whose domain is
        privaterelay.appleid.com NEVER links, whatever is_private_email claims. The claim
        stays the primary rule; the domain check is the floor under it." This case is that
        floor; B-24 is the claim. Deviation recorded in build-notes-4g-api.md.

        Mutation: delete the `APPLE_RELAY_DOMAIN` term from `is_relay` -> this links.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        email = "4g-b24a@privaterelay.appleid.com"
        existing = _make_user(db, email=email, name="B24a Existing")
        existing_id = existing.id
        before = _count_users(db)

        sub = _sub("b24a")
        r = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email=email, email_verified=True, is_private_email=False)))
        assert r.status_code == 200, r.text
        assert r.json()["is_new"] is True
        assert r.json()["private_relay"] is True
        assert r.json()["user"]["id"] != existing_id
        assert _count_users(db) == before + 1
        assert _row(db, existing_id).apple_sub is None

    @pytest.mark.parametrize("label,shape", NON_RELAY, ids=_ids(NON_RELAY))
    def test_branch_3_accepts_a_non_relay(self, client, monkeypatch, db, label, shape):
        """B-24b. MUT-4G-30: `is_relay = not _coerce(claims.get("is_private_email"))`.

        CONTROL for B-24: without it, B-24 is satisfied by a relay check that treats
        everything as a relay, and nothing would ever link.
        """
        assert len(NON_RELAY) == 5
        _configure_apple(monkeypatch, BUNDLE_ID)
        email = f"4g-b24b-{label}@example.com".lower()
        existing = _make_user(db, email=email, name="B24b Existing")
        existing_id = existing.id
        before = _count_users(db)

        sub = _sub("b24b")
        r = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email=email, email_verified=True, is_private_email=shape)))
        assert r.status_code == 200, r.text
        assert r.json()["is_new"] is False
        assert r.json()["private_relay"] is False
        assert r.json()["user"]["id"] == existing_id
        assert _count_users(db) == before
        assert _row(db, existing_id).apple_sub == sub

    def test_branch_2_never_overwrites_and_is_401(self, client, monkeypatch, db):
        """B-25. MUT-4G-31: let branch 2 overwrite `apple_sub`."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        email = "4g-b25@example.com"
        s1 = _sub("b25first")
        first = client.post("/auth/apple", json=_body(
            _mint(sub=s1, email=email, email_verified=True, is_private_email=False)))
        assert first.status_code == 200, first.text
        uid = first.json()["user"]["id"]
        assert _row(db, uid).apple_sub == s1
        before = _count_users(db)

        s2 = _sub("b25second")
        r = client.post("/auth/apple", json=_body(
            _mint(sub=s2, email=email, email_verified=True, is_private_email=False)))
        assert r.status_code == 401
        assert r.json()["detail"] == auth_router.APPLE_INVALID_DETAIL   # one opaque message
        assert _row(db, uid).apple_sub == s1
        assert _count_users(db) == before          # no new row either

    def test_branch_1_beats_branch_2(self, client, monkeypatch, db):
        """B-25a. MUT-4G-26: evaluate the email branches before the `apple_sub` lookup.

        The ordering case: a rule whose branches are right but whose order is wrong 401s a
        returning reader.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        s1, s2 = _sub("b25a-a"), _sub("b25a-b")
        a = client.post("/auth/apple", json=_body(
            _mint(sub=s1, email="4g-b25a-a@example.com", email_verified=True,
                  is_private_email=False)))
        b = client.post("/auth/apple", json=_body(
            _mint(sub=s2, email="4g-b25a-b@example.com", email_verified=True,
                  is_private_email=False)))
        assert a.status_code == 200 and b.status_code == 200, (a.text, b.text)

        # subject of row A, email claim of row B: branch 1 matches first and the email is
        # never read, so branch 2's condition is never evaluated.
        r = client.post("/auth/apple", json=_body(
            _mint(sub=s1, email="4g-b25a-b@example.com", email_verified=True,
                  is_private_email=False)))
        assert r.status_code == 200, r.text
        assert r.json()["is_new"] is False
        assert r.json()["user"]["id"] == a.json()["user"]["id"]

    def test_branch_4_relay_creates(self, client, monkeypatch, db):
        """B-26. MUT-4G-28: drop the relay condition and let it match a row.

        F1 made visible rather than silent: the reader gets a second, empty account and the
        client is told so (`is_new`, and `private_relay` under pm-decisions Q-1).
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        email = "4g-b26@privaterelay.appleid.com"
        assert crud.get_user_by_email(db, email) is None
        before = _count_users(db)

        sub = _sub("b26")
        r = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email=email, email_verified=True, is_private_email=True)))
        assert r.status_code == 200, r.text
        assert r.json()["is_new"] is True
        assert r.json()["private_relay"] is True
        assert _count_users(db) == before + 1
        created = _row(db, r.json()["user"]["id"])
        assert created.email == email
        assert created.apple_sub == sub
        assert created.username                      # derived by crud.create_user

    def test_branch_4_real_email_with_no_row_creates(self, client, monkeypatch, db):
        """B-26a. MUT-4G-27b: link to the first row in the table rather than the matching one.

        CONTROL for B-22: it proves branch 3's link was caused by the existing row and not by
        the email being real.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        email = "4g-b26a@example.com"
        assert crud.get_user_by_email(db, email) is None
        before = _count_users(db)

        sub = _sub("b26a")
        r = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email=email, email_verified=True, is_private_email=False)))
        assert r.status_code == 200, r.text
        assert r.json()["is_new"] is True
        assert r.json()["private_relay"] is False
        assert _count_users(db) == before + 1
        created = _row(db, r.json()["user"]["id"])
        assert created.email == email
        assert created.apple_sub == sub

    def test_branch_5_synthesises_a_unique_email(self, client, monkeypatch, db):
        """B-27. MUT-4G-32: one fixed placeholder email for every branch-5 reader."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        before = _count_users(db)
        s1, s2 = _sub("b27-one"), _sub("b27-two")

        r1 = client.post("/auth/apple", json=_body(_mint(sub=s1)))
        r2 = client.post("/auth/apple", json=_body(_mint(sub=s2)))
        assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
        assert r1.json()["is_new"] is True and r2.json()["is_new"] is True
        e1, e2 = r1.json()["user"]["email"], r2.json()["user"]["email"]
        assert PLACEHOLDER_RE.match(e1), e1
        assert PLACEHOLDER_RE.match(e2), e2
        assert e1 != e2
        assert _count_users(db) == before + 2

        # the third call repeats the FIRST subject: branch 1 catches it, no third row
        r3 = client.post("/auth/apple", json=_body(_mint(sub=s1)))
        assert r3.status_code == 200, r3.text
        assert r3.json()["is_new"] is False
        assert r3.json()["user"]["id"] == r1.json()["user"]["id"]
        assert _count_users(db) == before + 2

        # the self-heal property: a pure function of the subject, so the two-commit window
        # re-derives the same address rather than making a duplicate.
        assert (auth_router._apple_placeholder_email(s1)
                == auth_router._apple_placeholder_email(s1) == e1)

    def test_branch_5_email_does_not_contain_the_raw_subject(self, client, monkeypatch, db):
        """B-27a (K-06). MUT-4G-34: synthesise from the raw `sub` with the dots stripped."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        sub = "001234.deadbeefcafe.5678"
        r = client.post("/auth/apple", json=_body(_mint(sub=sub)))
        assert r.status_code == 200, r.text
        email = r.json()["user"]["email"]
        for fragment in ("001234", "deadbeefcafe", "5678", sub):
            assert fragment not in email, fragment
        assert PLACEHOLDER_RE.match(email), email
        local = email.split("@")[0][len("apple-"):]
        assert len(local) == 16 and all(c in "0123456789abcdef" for c in local)
        assert local == hashlib.sha256(sub.encode("utf-8")).hexdigest()[:16]

    def test_full_name_is_create_only(self, client, monkeypatch, db):
        """B-28. MUT-4G-33: apply `full_name` unconditionally; MUT-4G-33b: ignore it
        everywhere. Both halves are required."""
        _configure_apple(monkeypatch, BUNDLE_ID)

        # branch 1 — a second sign-in on an existing subject
        sub1 = _sub("b28-one")
        first = client.post("/auth/apple", json=_body(
            _mint(sub=sub1, email="4g-b28-first@example.com", email_verified=True,
                  is_private_email=False), full_name="Original Name"))
        assert first.status_code == 200, first.text
        uid1 = first.json()["user"]["id"]
        name_before = _row(db, uid1).name
        assert name_before == "Original Name"
        again = client.post("/auth/apple", json=_body(_mint(sub=sub1), full_name="Attacker"))
        assert again.status_code == 200, again.text
        assert _row(db, uid1).name == name_before

        # branch 3 — the link path
        linked_email = "4g-b28-link@example.com"
        existing = _make_user(db, email=linked_email, name="Link Target")
        uid2 = existing.id
        target_name_before = _row(db, uid2).name
        r = client.post("/auth/apple", json=_body(
            _mint(email=linked_email, email_verified=True, is_private_email=False),
            full_name="Attacker"))
        assert r.status_code == 200 and r.json()["user"]["id"] == uid2, r.text
        assert _row(db, uid2).name == target_name_before

        # branch 4 — create with a real email
        r = client.post("/auth/apple", json=_body(
            _mint(email="4g-b28-create@example.com", email_verified=True,
                  is_private_email=False), full_name="Attacker"))
        assert r.status_code == 200, r.text
        assert _row(db, r.json()["user"]["id"]).name == "Attacker"

        # branch 5 — create with a synthesised email
        r = client.post("/auth/apple", json=_body(_mint(), full_name="Attacker"))
        assert r.status_code == 200, r.text
        assert _row(db, r.json()["user"]["id"]).name == "Attacker"

    def test_two_first_sign_ins_with_one_sub_leave_one_row(self, client, monkeypatch, db):
        """B-29. MUT-4G-03: drop `unique=True`.

        Honest scope: an IntegrityError against SQLite's unique index, driven at the one seam
        where the race happens — the branch-1 lookup — not two simultaneous requests against
        PostgreSQL (tests.md section 10 item 7).
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        sub = _sub("b29")
        winner = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email="4g-b29-winner@example.com", email_verified=True,
                  is_private_email=False)))
        assert winner.status_code == 200, winner.text
        assert len(_holders(db, sub)) == 1

        # the loser's lookup misses, exactly as it would in a race, and its write collides
        monkeypatch.setattr(auth_router, "_user_by_apple_sub", lambda db_, s: None)
        loser = client.post("/auth/apple", json=_body(
            _mint(sub=sub, email="4g-b29-loser@example.com", email_verified=True,
                  is_private_email=False)))
        assert loser.status_code == 409, loser.text     # deterministic, and never a 500
        assert len(_holders(db, sub)) == 1
        assert _holders(db, sub)[0].id == winner.json()["user"]["id"]

    def test_response_shape_and_token_claims(self, client, monkeypatch, db):
        """B-30. MUT-4G-35: add a `provider` claim to the token.

        R-08 as AMENDED by pm-decisions Q-1: "additive-only — no existing key changes name,
        type or meaning". `private_relay` is the one added key. tests.md B-30 predates that
        decision and asserts the three-key set; the PM decision is binding and this is the
        deviation, recorded in build-notes-4g-api.md.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        r = client.post("/auth/apple", json=_body(
            _mint(email="4g-b30@example.com", email_verified=True, is_private_email=False)))
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(body.keys()) == {"access_token", "is_new", "private_relay", "user"}
        assert set(body["user"].keys()) == {"id", "name", "email"}
        assert isinstance(body["is_new"], bool) and isinstance(body["private_relay"], bool)

        claims = auth.decode_token(body["access_token"])
        assert set(claims.keys()) == {"sub", "exp"}      # no provider, no apple_sub
        assert claims["sub"] == body["user"]["email"]
        lifetime = claims["exp"] - time.time()
        assert 29 * 86400 < lifetime <= 30 * 86400 + 60   # the ordinary reader token, not 15m

    def test_last_active_is_written_on_an_apple_login(self, client, monkeypatch, db):
        """B-31. MUT-4G-36: remove the `last_active` write.

        A login is activity — /auth/google's rule at `:95`. /auth/bot-login deliberately does
        NOT write it (`:227`), so this divergence is worth pinning.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        email = "4g-b31@example.com"
        existing = _make_user(db, email=email, name="B31")
        uid = existing.id
        assert _row(db, uid).last_active is None

        r = client.post("/auth/apple", json=_body(
            _mint(email=email, email_verified=True, is_private_email=False)))
        assert r.status_code == 200, r.text
        db.expire_all()
        assert _row(db, uid).last_active is not None

    def test_no_existing_test_file_was_edited(self):
        """B-33 (static). MUT-4G-37: delete an assertion in tests/test_auth.py.

        `git diff <base>...HEAD` reads COMMITTED state, so this is red until the sprint's work
        is committed — which is the point: it polices the commit, not the working tree.
        """
        base = "5fc8ccc"
        probe = subprocess.run(["git", "cat-file", "-e", base + "^{commit}"],
                               cwd=REPO_ROOT, capture_output=True, text=True)
        assert probe.returncode == 0, (
            f"B-33's pinned base {base} is not reachable in this clone. This is a CHECKOUT "
            "problem — the pytest job sets fetch-depth: 0 — and not a reason to re-point the "
            "rule at origin/master."
        )
        diff = subprocess.run(["git", "diff", f"{base}...HEAD", "--numstat", "--", "tests/"],
                              cwd=REPO_ROOT, capture_output=True, text=True,
                              encoding="utf-8", errors="replace")
        assert diff.returncode == 0, diff.stderr[:200]
        rows = [r.split("\t") for r in diff.stdout.splitlines() if r.count("\t") == 2]
        assert rows, "the diff over tests/ is empty — this case would assert nothing"

        additions_only = {"tests/test_sql_artifacts.py"}
        wholly_new = {"tests/test_apple_auth.py", "tests/fixtures/apple_jwks_snapshot.json"}

        def existed_at_base(path):
            """Did this file exist before the sprint started?

            The rule is 'no EXISTING test file was edited'. A file created after `base` by
            some other piece of work is not this sprint's business, and listing such files in
            `wholly_new` would mean growing that set for ever as master moves. Merging 4G on
            2026-10-11 made this case red on tests/test_book_search_query.py, which belongs to
            the book-search hotfix. Pinning BOTH ends of the diff would also fix it, and is
            wrong: it freezes the rule so nothing can ever fail it again (measured — the
            MUT-4G-37 probe passed under it).
            """
            return subprocess.run(["git", "cat-file", "-e", f"{base}:{path}"],
                                  cwd=REPO_ROOT, capture_output=True, text=True).returncode == 0

        offenders = []
        for added, removed, path in rows:
            path = path.replace("\\", "/")
            if path in wholly_new or not existed_at_base(path):
                continue
            if removed not in ("0", "-"):
                offenders.append(f"{path}: {removed} line(s) removed")
            elif path not in additions_only:
                offenders.append(f"{path}: changed and is not one of this sprint's files")
        assert offenders == [], offenders
        assert "tests/conftest.py" not in {r[2].replace("\\", "/") for r in rows}

        # CONTROL (rule 3): the same rule applied to a synthetic numstat that removes a line
        # reports exactly one violation.
        synthetic = [("0", "1", "tests/test_auth.py")]
        assert [f"{p}: {rm} line(s) removed" for _a, rm, p in synthetic
                if rm not in ("0", "-")] == ["tests/test_auth.py: 1 line(s) removed"]

    def test_apple_sub_is_never_serialised(self, monkeypatch, db):
        """B-34. MUT-4G-38: add `apple_sub` to any response model or dict."""
        from app.main import app as fastapi_app

        _configure_apple(monkeypatch, BUNDLE_ID)
        # raise_server_exceptions=False: the sweep is interested in BODIES, and a route that
        # 500s on a borrowed id must not stop the sweep reading the rest.
        sweep_client = TestClient(fastapi_app, raise_server_exceptions=False)
        sub = "001234.b34distinctive.9999"
        r = sweep_client.post("/auth/apple", json=_body(
            _mint(sub=sub, email="4g-b34@example.com", email_verified=True,
                  is_private_email=False)))
        assert r.status_code == 200, r.text
        assert "apple_sub" not in r.text and sub not in r.text
        reader = _row(db, r.json()["user"]["id"])
        headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

        path_values = {"user_id": reader.id, "group_id": 1, "note_id": 1,
                       "userbook_id": 1, "book_id": 1, "id": reader.id}
        EXPECTED_GETS = 50          # measured on this branch; a new GET route moves it
        swept = 0
        bodies = []
        for route in list(fastapi_app.routes):
            methods = getattr(route, "methods", None) or set()
            path = getattr(route, "path", None)
            if "GET" not in methods or not path:
                continue
            if (any(seg in path for seg in ("/openapi.json", "/docs", "/redoc"))
                    or path.startswith("/api/googlebooks")):
                continue
            real = path
            for param, value in path_values.items():
                real = real.replace("{" + param + "}", str(value))
            assert "{" not in real, f"add {real} to the sweep map"
            swept += 1
            bodies.append((real, sweep_client.get(real, headers=headers).text))
        assert swept == EXPECTED_GETS, f"swept {swept}, expected {EXPECTED_GETS}"

        for real, text in bodies:
            assert "apple_sub" not in text, real
            assert sub not in text, real
        # CONTROL: the sweep really was reading bodies.
        own = dict(bodies)["/profile/me"]
        assert reader.email in own

    def test_apple_sub_is_written_in_exactly_one_module(self):
        """B-35. MUT-4G-39: `user.apple_sub = ""` in app/crud.py."""
        files = set()
        for path in sorted((REPO_ROOT / "app").rglob("*.py")):
            source = path.read_text(encoding="utf-8")
            if "apple_sub" not in source:
                continue
            tree = ast.parse(source)
            for node in ast.walk(tree):
                targets = []
                if isinstance(node, ast.Assign):
                    targets = node.targets
                elif isinstance(node, (ast.AugAssign, ast.AnnAssign)):
                    targets = [node.target]
                for target in targets:
                    if isinstance(target, ast.Attribute) and target.attr == "apple_sub":
                        files.add(str(path.relative_to(REPO_ROOT)).replace("\\", "/"))
                if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                        and node.func.id == "setattr" and len(node.args) >= 2
                        and isinstance(node.args[1], ast.Constant)
                        and node.args[1].value == "apple_sub"):
                    files.add(str(path.relative_to(REPO_ROOT)).replace("\\", "/"))
        assert len(files) == 1, files
        assert files == {"app/routers/auth_router.py"}

        # CONTROL (rule 3): the detector fires on a synthetic assignment.
        tree = ast.parse("def f(u, x):\n    u.apple_sub = x\n")
        hits = [n for n in ast.walk(tree)
                if isinstance(n, ast.Assign)
                and isinstance(n.targets[0], ast.Attribute)
                and n.targets[0].attr == "apple_sub"]
        assert len(hits) == 1

    def test_no_claim_value_is_logged(self, client, monkeypatch, capsys):
        """B-36. MUT-4G-40: `print(f"apple claims: {claims}")` in the route.

        Claim NAMES and status codes are permitted; values are not.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        sub = "001234.b36distinctive.4242"
        email = "4g-b36-distinctive@example.com"
        nonce = "b36" + "x" * 29
        assert len(nonce) == 32
        token = _mint(sub=sub, nonce=nonce, email=email, email_verified=True,
                      is_private_email=False)
        capsys.readouterr()

        ok = client.post("/auth/apple", json=_body(token, nonce=nonce))
        assert ok.status_code == 200, ok.text
        bad = client.post("/auth/apple", json=_body(
            _mint(sub=sub, nonce=nonce, pem=_FOREIGN_PEM, email=email,
                  email_verified=True, is_private_email=False), nonce=nonce))
        assert bad.status_code == 401
        captured = capsys.readouterr()
        logged = captured.out + captured.err
        for secret in (token, email, sub, nonce):
            assert secret not in logged, secret[:24]

        # CONTROL (rule 3): the same search finds a deliberate leak, so a clean result above
        # is not an empty capture.
        print(f"synthetic leak: {sub}")
        leaked = capsys.readouterr()
        assert sub in leaked.out + leaked.err


# -- P3: revocation on deletion (R-13) --------------------------------------------------------
#
# THE KEY NEVER ENTERS A FIXTURE (pm-decisions E-4). Every case here signs with an EC key this
# test generates at import time and injects through `APPLE_PRIVATE_KEY`. The real `.p8` exists
# only as a Render environment variable, is referenced by path, and its contents never enter a
# chat, a log, a commit or a fixture.
#
# A revocation test is trivial to write vacuously: one that asserts "the deletion returned 200"
# passes whether or not revocation was attempted at all. So every case here asserts what was
# CALLED, and separately that the row is gone.

APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"
TEAM_ID = "4GTEAMID99"
KEY_ID = "4GKEYID1234"
REVOKE_BODY_KEYS = {"token", "token_type_hint", "client_id", "client_secret"}


def _ec_keypair():
    """A PKCS8 EC PEM and its public half - the shape of an Apple `.p8` without being one."""
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private, public


_REVOKE_PEM, _REVOKE_PUB = _ec_keypair()


def _configure_revoke(monkeypatch, pem=_REVOKE_PEM, team_id=TEAM_ID, key_id=KEY_ID):
    """The three R-13 variables. `_revoke_config()` reads them per call, so this needs no
    restart - the same contract `_configure_apple` relies on for `APPLE_AUDIENCES`."""
    if pem is None:
        monkeypatch.delenv("APPLE_PRIVATE_KEY", raising=False)
    else:
        monkeypatch.setenv("APPLE_PRIVATE_KEY", pem)
    monkeypatch.setenv("APPLE_TEAM_ID", team_id)
    monkeypatch.setenv("APPLE_KEY_ID", key_id)


class _RecordingPost:
    """A stub for `apple_keys.http_post`. Records every call; optionally raises, or answers
    with a given status and body."""

    def __init__(self, status=200, body="", raises=None, side_effect=None):
        self.calls = []
        self.status = status
        self.body = body
        self.raises = raises
        self.side_effect = side_effect

    def __call__(self, url, data, timeout):
        self.calls.append({"url": url, "data": data, "timeout": timeout})
        if self.side_effect is not None:
            self.side_effect(self.calls[-1])
        if self.raises is not None:
            raise self.raises
        return SimpleNamespace(status_code=self.status, text=self.body)


class _DeleteCounter:
    """Counts DELETE statements on the engine the running app actually queries through.

    `conftest.stmt_counter` counts SELECT / INSERT / UPDATE-user and NOT deletes, and tests.md
    forbids changing `conftest.py` in this sprint - so B-43's "no DELETE had been issued yet"
    needs its own listener. Same `before_cursor_execute` pattern, same engine object (the one
    this file imports from `tests.conftest`, for the reason `stmt_counter`'s docstring gives).
    """

    def __init__(self):
        self.deletes = 0

    def reset(self):
        self.deletes = 0

    def _hook(self, conn, cursor, statement, parameters, context, executemany):
        if statement.strip()[:6].upper() == "DELETE":
            self.deletes += 1


def _apple_reader(client, label, email):
    """Create a reader THROUGH /auth/apple, so `apple_sub` is real and not planted.

    Returns (user_id, apple_sub, auth header). A planted `apple_sub` would test the gate and
    never the write that put it there.
    """
    sub = _sub(label)
    r = client.post("/auth/apple", json=_body(
        _mint(sub=sub, email=email, email_verified=True, is_private_email=False)))
    assert r.status_code == 200, r.text
    assert r.json()["is_new"] is True
    body = r.json()
    return body["user"]["id"], sub, {"Authorization": f"Bearer {body['access_token']}"}


def _dependents(db, user_id):
    """A few rows the cascade must take with it, so B-42 proves the deletion COMPLETED rather
    than merely returned 200. The row types tests/test_auth.py::TestDeleteAccountCleansDependents
    requires this route to clear."""
    book = models.Book(title=f"4g revoke {user_id}", total_pages=100)
    db.add(book)
    db.commit()
    db.refresh(book)
    db.add(models.UserBook(user_id=user_id, book_id=book.id, status="reading"))
    db.add(models.PushToken(user_id=user_id, token=f"4g-revoke-token-{user_id}"))
    db.commit()
    ub = db.exec(select(models.UserBook).where(models.UserBook.user_id == user_id)).first()
    db.add(models.Note(user_id=user_id, userbook_id=ub.id, text="4g revoke note"))
    db.commit()


def _dependent_counts(db, user_id):
    db.expire_all()
    return {
        "userbooks": len(db.exec(select(models.UserBook).where(
            models.UserBook.user_id == user_id)).all()),
        "notes": len(db.exec(select(models.Note).where(
            models.Note.user_id == user_id)).all()),
        "push_tokens": len(db.exec(select(models.PushToken).where(
            models.PushToken.user_id == user_id)).all()),
    }


# B-42's four failure modes. The deletion must complete in every one of them.
REVOKE_FAILURE_MODES = ["raises_request_exception", "raises_timeout", "http_500", "key_unset"]


def _apply_failure_mode(mode, monkeypatch, body="apple-oops-detail"):
    """Configure `mode` and return the recording stub, already installed."""
    if mode == "raises_request_exception":
        stub = _RecordingPost(raises=requests_lib.RequestException("4g revoke exploded"))
    elif mode == "raises_timeout":
        stub = _RecordingPost(raises=requests_lib.Timeout("4g revoke timed out"))
    elif mode == "http_500":
        stub = _RecordingPost(status=500, body=body)
    elif mode == "key_unset":
        stub = _RecordingPost()
    else:                                    # pragma: no cover - guarded by the length assert
        raise AssertionError(f"unknown mode {mode}")
    _configure_revoke(monkeypatch, pem=None if mode == "key_unset" else _REVOKE_PEM)
    monkeypatch.setattr(apple_keys, "http_post", stub)
    return stub


# ── Sprint 4H helpers, used by P3's cases above and P5's below ───────────────────────────────
#
# WHAT 4G GOT WRONG, and what the cases below exist to pin: `auth/revoke` takes a refresh or
# access token, and 4G had only the Apple `sub` to send. Apple answers a subject with 400, so
# the shipped revocation could never unlist us from "Apps Using Apple ID"
# (build-notes-4g-revoke.md "What I found wrong" item 1).
#
# No secret is committed. The Fernet key is generated at import time, like the EC key the
# revocation cases sign with (ST-4G-01/02).

APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
TOKEN_BODY_KEYS = {"grant_type", "code", "client_id", "client_secret"}
AUTH_CODE = "4h-authorization-code-abc123"
REFRESH_TOKEN = "4h-refresh-token-r1b2c3d4e5"
TOKEN_KEY = Fernet.generate_key().decode()      # generated, never checked in


def _configure_token_key(monkeypatch, key=TOKEN_KEY):
    """`APPLE_TOKEN_KEY`. Read per call by `apple_keys._token_key`, so no restart is needed."""
    if key is None:
        monkeypatch.delenv("APPLE_TOKEN_KEY", raising=False)
    else:
        monkeypatch.setenv("APPLE_TOKEN_KEY", key)


def _plant_refresh_token(db, user_id, plaintext=REFRESH_TOKEN):
    """Seal `plaintext` into `user.apple_refresh_token` and commit. Returns the stored value.

    Planted deliberately, and only in the cases that are about the DELETION. The write itself
    has its own case — B-50 drives it through /auth/apple end to end — and planting is what
    keeps these cases from needing an outbound exchange: B-43 installs its `http_post` stub
    AFTER creating its reader, so a sign-in that exchanged would reach the real network.

    The value still goes through `seal_token`, so the deletion's unseal is the real one. The
    assertion below is deliberate: a case that forgot `_configure_token_key` would otherwise
    plant NULL and then pass for the wrong reason.
    """
    db.expire_all()
    row = db.get(models.User, user_id)
    row.apple_refresh_token = apple_keys.seal_token(plaintext)
    assert row.apple_refresh_token, "this case did not call _configure_token_key"
    assert row.apple_refresh_token != plaintext
    db.add(row)
    db.commit()
    return row.apple_refresh_token


def _verify_client_secret(secret):
    """The ES256 assertion VERIFIED against this suite's EC public key, not merely decoded.

    Shared by the exchange and the revocation because it is literally the same assertion: one
    `.p8` serves both endpoints, which is why 4H needs no new Apple key material.
    """
    assert jwt.get_unverified_header(secret) == {"alg": "ES256", "kid": KEY_ID, "typ": "JWT"}
    claims = jwt.decode(secret, _REVOKE_PUB, algorithms=["ES256"],
                        audience=APPLE_ISS, issuer=TEAM_ID)
    assert claims["iss"] == TEAM_ID
    assert claims["sub"] == BUNDLE_ID
    assert claims["aud"] == APPLE_ISS
    assert isinstance(claims["iat"], int)
    assert claims["exp"] - claims["iat"] <= 3600       # Apple's ceiling
    return claims


class _Resp:
    """A `requests.Response` stand-in with the three attributes the product reads.

    `_RecordingPost` answers with a `SimpleNamespace`, which has no `.json()` — the exchange
    needs one, and giving it its own response type leaves every P3 case untouched.
    """

    def __init__(self, status, payload=None, text=""):
        self.status_code = status
        self.text = text
        self._payload = payload

    def json(self):
        return self._payload


class _RecordingApple:
    """One stub for `apple_keys.http_post` serving BOTH Apple endpoints, dispatching on url.

    /auth/apple exchanges at `auth/token` and the deletion revokes at `auth/revoke` through the
    same seam, so a stub that cannot tell them apart cannot prove which one was called. `calls`
    keeps every call in order; `token_calls` and `revoke_calls` are the per-url views.
    """

    def __init__(self, token_status=200, token_payload=None, token_raises=None,
                 revoke_status=204, revoke_raises=None, token_text=""):
        self.calls = []
        self.token_status = token_status
        self.token_payload = ({"refresh_token": REFRESH_TOKEN, "access_token": "4h-access",
                               "expires_in": 3600, "token_type": "Bearer"}
                              if token_payload is None else token_payload)
        self.token_raises = token_raises
        self.token_text = token_text
        self.revoke_status = revoke_status
        self.revoke_raises = revoke_raises

    def __call__(self, url, data, timeout):
        self.calls.append({"url": url, "data": data, "timeout": timeout})
        if url == APPLE_TOKEN_URL:
            if self.token_raises is not None:
                raise self.token_raises
            return _Resp(self.token_status, self.token_payload, self.token_text)
        if url == APPLE_REVOKE_URL:
            if self.revoke_raises is not None:
                raise self.revoke_raises
            return _Resp(self.revoke_status, None, "")
        raise AssertionError(f"unexpected Apple url {url}")   # pragma: no cover - a tripwire

    @property
    def token_calls(self):
        return [c for c in self.calls if c["url"] == APPLE_TOKEN_URL]

    @property
    def revoke_calls(self):
        return [c for c in self.calls if c["url"] == APPLE_REVOKE_URL]


def _apple_reader_4h(client, label, email, code=AUTH_CODE):
    """`_apple_reader`, plus Sprint 4H's `authorization_code` in the body.

    Created THROUGH /auth/apple for the reason `_apple_reader` gives: a planted column value
    tests the gate and never the write that put it there. Returns the payload too, because
    B-57 asserts over the whole sign-in response.
    """
    sub = _sub(label)
    body = _body(_mint(sub=sub, email=email, email_verified=True, is_private_email=False))
    if code is not None:
        body["authorization_code"] = code
    r = client.post("/auth/apple", json=body)
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["is_new"] is True
    return (payload["user"]["id"], sub,
            {"Authorization": f"Bearer {payload['access_token']}"}, payload)


def _stored(db, user_id):
    db.expire_all()
    row = db.get(models.User, user_id)
    return None if row is None else row.apple_refresh_token


class TestAppleRevocation:
    """R-13. Apple requires an app offering Sign in with Apple and account deletion to revoke
    the reader's tokens as part of it. Revocation is best effort and Guideline 5.1.1(v)
    outranks it: a reader who asks to be deleted gets deleted, whatever Apple's endpoint does.
    """

    def test_revoke_is_called_once_with_a_correct_client_secret(self, client, monkeypatch, db):
        """B-40. MUT-4G-41: send the raw `.p8` as the `client_secret`; omit the call; sign
        RS256; set `exp` a day out.

        SPRINT 4H EDITED THIS CASE — the only P3 case whose assertions changed rather than
        merely gaining a line. It used to assert `data["token"] == sub`, and that WAS the bug:
        Apple's `auth/revoke` takes a refresh or access token and answers a subject with 400.
        It now asserts the refresh token, plus `!= sub` so the old behaviour cannot come back
        unnoticed. The `client_secret` half is unchanged — one `.p8` serves both Apple
        endpoints — and has moved into `_verify_client_secret`, which B-50 reuses on the
        exchange's secret.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch)
        stub = _RecordingPost()
        monkeypatch.setattr(apple_keys, "http_post", stub)

        uid, sub, headers = _apple_reader(client, "b40", "4g-b40@example.com")
        sealed = _plant_refresh_token(db, uid)
        r = client.post("/auth/delete-account/me", headers=headers)
        assert r.status_code == 200, r.text

        # What was CALLED - the assertion a vacuous test leaves out.
        assert len(stub.calls) == 1
        call = stub.calls[0]
        assert call["url"] == APPLE_REVOKE_URL
        assert set(call["data"]) == REVOKE_BODY_KEYS
        assert call["data"]["client_id"] == BUNDLE_ID      # architecture E-2 item 5
        assert call["data"]["token"] == REFRESH_TOKEN      # Sprint 4H: the fix
        assert call["data"]["token"] != sub                # Sprint 4G's bug, pinned shut
        assert call["data"]["token"] != sealed             # unsealed, not the raw ciphertext

        # VERIFIED against this test's own EC public key, not merely decoded: a secret that
        # does not verify is not a secret Apple would accept.
        secret = call["data"]["client_secret"]
        claims = _verify_client_secret(secret)
        assert claims["iss"] == TEAM_ID
        assert claims["sub"] == BUNDLE_ID
        assert claims["aud"] == APPLE_ISS
        assert isinstance(claims["iat"], int)
        assert claims["exp"] - claims["iat"] <= 3600       # Apple's ceiling

        # ...and SEPARATELY, that the reader is actually gone.
        assert _row(db, uid) is None

    def test_a_google_only_deletion_makes_no_call(self, client, monkeypatch, db):
        """B-41. MUT-4G-42: call revoke without the `apple_sub IS NOT NULL` gate.

        "Byte-identical to today" is a COMPARISON, not an assertion about a string, so the
        before-value is captured from a deletion with the revocation code path monkeypatched
        out entirely.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)

        # The before-value: the revocation path replaced by something that fails the test if
        # it is reached at all, so this response provably predates R-13.
        def _must_not_run(*a, **k):          # pragma: no cover - a tripwire, not a path
            raise AssertionError("the before-value was captured WITH the revocation path")

        # Patched and restored by hand rather than with `monkeypatch.undo()`: undo() reverts
        # EVERY patch this instance holds, and the autouse `apple_jwks` fixture shares the
        # instance - so undo() would also un-stub `fetch_jwks` and let the control step below
        # reach the real network.
        original_revoke = apple_keys.revoke_token
        apple_keys.revoke_token = _must_not_run
        try:
            before_user = _make_user(db, email="4g-b41-before@example.com", name="B41 Before")
            before_uid = before_user.id
            assert before_user.apple_sub is None
            before = client.post("/auth/delete-account/me", headers=_auth(before_user))
        finally:
            apple_keys.revoke_token = original_revoke
        assert _row(db, before_uid) is None

        # The after: the real code, a live HTTP stub, a Google-only reader.
        stub = _RecordingPost()
        monkeypatch.setattr(apple_keys, "http_post", stub)
        google_only = _make_user(db, email="4g-b41-after@example.com", name="B41 After")
        google_uid = google_only.id
        assert google_only.apple_sub is None
        after = client.post("/auth/delete-account/me", headers=_auth(google_only))

        assert stub.calls == []
        assert _row(db, google_uid) is None
        assert after.status_code == before.status_code
        assert after.json() == before.json()
        assert after.content == before.content

        # CONTROL (rule 3): the same stub, an Apple reader, one call. So "zero" above is the
        # gate working and not a broken stub.
        # Sprint 4H added the two lines below: the control reader needs a stored refresh token,
        # because that is now what gets revoked. Nothing else in this case changed, and the
        # before/after byte-comparison it is built around is untouched.
        _configure_token_key(monkeypatch)
        uid, _, headers = _apple_reader(client, "b41", "4g-b41-apple@example.com")
        _plant_refresh_token(db, uid)
        assert client.post("/auth/delete-account/me", headers=headers).status_code == 200
        assert len(stub.calls) == 1
        assert _row(db, uid) is None

    @pytest.mark.parametrize("mode", REVOKE_FAILURE_MODES)
    def test_a_failed_revocation_never_blocks_the_deletion(self, mode, client, monkeypatch, db):
        """B-42. MUT-4G-43 / MUT-4H-14: let the revocation exception propagate.

        Guideline 5.1.1(v) outranks revocation. `key_unset` is the SHIPPING state - the PM has
        not created the `.p8` yet (pm-decisions E-4), so in production today this is the only
        one of the four that runs.
        """
        assert len(REVOKE_FAILURE_MODES) == 4
        _configure_apple(monkeypatch, BUNDLE_ID)
        stub = _apply_failure_mode(mode, monkeypatch)

        uid, _, headers = _apple_reader(
            client, f"b42{mode[:4]}", f"4g-b42-{mode}@example.com")
        # Sprint 4H: the reader needs a stored refresh token, because that is now what gets
        # revoked. `key_unset` keeps sending nothing, which is what its own assertion says.
        _configure_token_key(monkeypatch)
        _plant_refresh_token(db, uid)
        _dependents(db, uid)
        assert _dependent_counts(db, uid) == {"userbooks": 1, "notes": 1, "push_tokens": 1}

        r = client.post("/auth/delete-account/me", headers=headers)

        assert r.status_code == 200, r.text
        assert r.json() == {"message": "Account deleted"}
        db.expire_all()
        assert db.get(models.User, uid) is None
        assert _dependent_counts(db, uid) == {"userbooks": 0, "notes": 0, "push_tokens": 0}

        # The attempt still happened (or was deliberately not configured) - this is what keeps
        # the case from passing because revocation was quietly skipped.
        assert len(stub.calls) == (0 if mode == "key_unset" else 1)

    def test_revocation_runs_before_the_row_is_deleted(self, client, monkeypatch, db):
        """B-43. MUT-4G-44 / MUT-4H-15: move the revocation below `db.commit()`.

        After the cascade there is no `apple_sub` left to revoke, so "it works" and "it runs
        first" are not the same claim. The stub reads the database to prove the second.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch)                # Sprint 4H
        uid, sub, headers = _apple_reader(client, "b43", "4g-b43@example.com")
        _plant_refresh_token(db, uid)                    # Sprint 4H: what gets revoked now

        counter = _DeleteCounter()
        event.listen(engine, "before_cursor_execute", counter._hook)
        seen = {}

        def _peek(call):
            db.expire_all()
            row = db.get(models.User, uid)
            seen["row"] = row
            seen["apple_sub"] = getattr(row, "apple_sub", None)
            seen["deletes"] = counter.deletes

        stub = _RecordingPost(side_effect=_peek)
        monkeypatch.setattr(apple_keys, "http_post", stub)
        try:
            counter.reset()
            r = client.post("/auth/delete-account/me", headers=headers)
        finally:
            event.remove(engine, "before_cursor_execute", counter._hook)

        assert r.status_code == 200, r.text
        assert len(stub.calls) == 1
        assert seen["row"] is not None               # the row was still there
        assert seen["apple_sub"] == sub              # ...and still carried the subject
        assert seen["deletes"] == 0                  # ...and nothing had been deleted yet
        assert counter.deletes > 0                   # control: deletes DID happen afterwards
        assert _row(db, uid) is None

    def test_nothing_sensitive_is_logged(self, client, monkeypatch, db, capsys):
        """B-44. MUT-4G-45: `print(resp.text)` on a non-2xx; or log the secret.

        R-13 permits a status code and nothing else. Runs one success and all four B-42 modes,
        because a failure path is where a response body is most tempting to print.
        """
        body = "apple-oops-detail-4g-b44"
        emails = []
        secrets = []

        # 1. the success path
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch)                # Sprint 4H
        stub = _RecordingPost(body=body)
        monkeypatch.setattr(apple_keys, "http_post", stub)
        capsys.readouterr()
        email = "4g-b44-ok@example.com"
        uid, sub, headers = _apple_reader(client, "b44ok", email)
        _plant_refresh_token(db, uid)                    # Sprint 4H
        assert client.post("/auth/delete-account/me", headers=headers).status_code == 200
        subs = [sub]
        emails.append(email)
        secrets.append(stub.calls[0]["data"]["client_secret"])

        # 2. every failure mode
        for mode in REVOKE_FAILURE_MODES:
            mstub = _apply_failure_mode(mode, monkeypatch, body=body)
            _configure_apple(monkeypatch, BUNDLE_ID)
            _configure_token_key(monkeypatch)            # Sprint 4H
            email = f"4g-b44-{mode}@example.com"
            uid, sub, headers = _apple_reader(client, f"b44{mode[:4]}", email)
            _plant_refresh_token(db, uid)                # Sprint 4H
            assert client.post("/auth/delete-account/me", headers=headers).status_code == 200
            subs.append(sub)
            emails.append(email)
            if mstub.calls:
                secrets.append(mstub.calls[0]["data"]["client_secret"])

        logged = "".join(capsys.readouterr())
        assert "-----BEGIN" not in logged
        assert _REVOKE_PEM not in logged
        assert body not in logged
        # Sprint 4H: the stored ciphertext and its key are new secrets on this path.
        assert REFRESH_TOKEN not in logged
        assert TOKEN_KEY not in logged
        for secret in secrets:
            assert secret not in logged
        for value in subs + emails:
            assert value not in logged, value[:24]
        # A status code alone IS permitted, and proves the capture is not simply empty.
        assert "apple revoke: status 200" in logged

        # CONTROL (rule 3): the same detector finds a deliberate leak.
        print(f"synthetic leak: {body} {subs[0]}")
        leaked = "".join(capsys.readouterr())
        assert body in leaked and subs[0] in leaked


# ═════════════════════════════════════════════════════════════════════════════════════════════
# Sprint 4H — P5: the authorization-code exchange, the sealed column, and a revocation that can
# actually succeed. Cases B-50..B-60.
#
# THREE WAYS THESE CASES COULD BE VACUOUS, and what stops each:
#   * "sign-in returned 200" passes whether or not an exchange was attempted -> every case
#     counts the calls to each Apple URL against a literal before asserting their contents.
#   * "the column is not NULL" passes for a column holding the plaintext -> B-50 and B-57
#     assert the stored value is NOT the plaintext AND that it unseals back to it. Either half
#     alone is satisfiable by a bug.
#   * a deletion case that never reaches the loop it is about -> B-40 and B-54 read the revoke
#     call's `data["token"]` and compare it against BOTH the refresh token and the `sub`.
# ═════════════════════════════════════════════════════════════════════════════════════════════

PM_SQL_QUEUE_4H_PATH = REPO_ROOT / "context" / "PM_SQL_QUEUE.md"

# B-51's four ways the exchange can fail. Sign-in must complete in every one of them.
EXCHANGE_FAILURE_MODES = ["raises_request_exception", "raises_timeout", "http_400",
                          "no_refresh_token"]


def _exchange_failure(mode, body="apple-token-oops-4h"):
    if mode == "raises_request_exception":
        return _RecordingApple(token_raises=requests_lib.RequestException("4h token exploded"))
    if mode == "raises_timeout":
        return _RecordingApple(token_raises=requests_lib.Timeout("4h token timed out"))
    if mode == "http_400":
        return _RecordingApple(token_status=400,
                               token_payload={"error": "invalid_grant"}, token_text=body)
    if mode == "no_refresh_token":
        return _RecordingApple(token_payload={"access_token": "4h-access", "expires_in": 3600})
    raise AssertionError(f"unknown mode {mode}")       # pragma: no cover - length-asserted


class TestAppleTokenExchange:
    """B-50..B-53. The half Sprint 4G did not have: obtaining the refresh token at all.

    Sign-in outranks the exchange exactly as deletion outranks revocation. A reader signs in
    when Apple's token endpoint is down, when the `.p8` is absent and when `APPLE_TOKEN_KEY` is
    absent — in all three the column simply stays NULL and the deletion sends nothing, which is
    the deployed Sprint 4G behaviour and is already tested above.
    """

    def test_sign_in_exchanges_the_code_and_stores_it_sealed(self, client, monkeypatch, db):
        """B-50. MUT-4H-01: never call `auth/token`; send `grant_type=refresh_token`; store
        the plaintext instead of the seal; drop the `client_secret` from the exchange body."""
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch)
        stub = _RecordingApple()
        monkeypatch.setattr(apple_keys, "http_post", stub)

        uid, sub, headers, payload = _apple_reader_4h(client, "b50", "4g-b50@example.com")

        # WHAT WAS CALLED — the assertion a vacuous version leaves out.
        assert len(stub.calls) == 1, stub.calls
        assert len(stub.token_calls) == 1
        call = stub.token_calls[0]
        assert call["url"] == APPLE_TOKEN_URL
        assert set(call["data"]) == TOKEN_BODY_KEYS
        assert call["data"]["grant_type"] == "authorization_code"
        assert call["data"]["code"] == AUTH_CODE
        assert call["data"]["client_id"] == BUNDLE_ID        # architecture E-2 item 5
        _verify_client_secret(call["data"]["client_secret"])
        assert call["timeout"] == apple_keys.TOKEN_TIMEOUT_SECONDS

        # ...and SEPARATELY, what was stored. Both halves are needed: "not the plaintext"
        # alone passes for a column holding garbage, and "unseals to it" alone passes for a
        # column holding the plaintext under an identity cipher.
        stored = _stored(db, uid)
        assert stored is not None
        assert stored != REFRESH_TOKEN
        assert REFRESH_TOKEN not in stored
        assert apple_keys.unseal_token(stored) == REFRESH_TOKEN

        # The sign-in contract itself is untouched: the same four keys 4G returned.
        assert set(payload) == {"access_token", "is_new", "private_relay", "user"}
        assert _row(db, uid).apple_sub == sub

    @pytest.mark.parametrize("mode", EXCHANGE_FAILURE_MODES)
    def test_a_failed_exchange_never_blocks_sign_in(self, mode, client, monkeypatch, db):
        """B-51. MUT-4H-02: let the exchange raise out of `exchange_authorization_code`; or
        fail the sign-in when no refresh token came back.

        Sign-in is the stronger obligation: a reader whose Apple ID works must get into the app
        when Apple's token endpoint does not.
        """
        assert len(EXCHANGE_FAILURE_MODES) == 4
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch)
        stub = _exchange_failure(mode)
        monkeypatch.setattr(apple_keys, "http_post", stub)

        uid, sub, headers, _ = _apple_reader_4h(
            client, f"b51{mode[:4]}", f"4g-b51-{mode}@example.com")

        # The attempt happened — this is what keeps the case from passing because the whole
        # exchange was quietly skipped.
        assert len(stub.token_calls) == 1
        # R-03's write survived an outbound failure, which is the reason the exchange sits
        # AFTER that commit rather than inside it.
        assert _row(db, uid).apple_sub == sub
        assert _stored(db, uid) is None
        # ...and the token the route handed back actually works.
        assert client.get("/profile/me", headers=headers).status_code == 200

    def test_no_authorization_code_means_no_exchange_at_all(
            self, client, monkeypatch, db, capsys):
        """B-52. MUT-4H-03: exchange unconditionally, ignoring whether a code was sent.

        The TestFlight build in readers' hands today does not send one. A required field would
        422 them out of the app, and an unconditional exchange would walk into
        `exchange_authorization_code` on every one of their sign-ins for ever.

        MEASURED, and the reason `capsys` is here: the call-count assertion ALONE does not
        catch MUT-4H-03. `exchange_authorization_code`'s own `if not (code and ...)` guard
        returns before the outbound call, so `if True:` in the route leaves `stub.calls` empty
        and the case green (measured: `1 passed`). What the route's conditional actually buys
        is that the function is not entered at all, and the log line is the only place that is
        observable. Written up in build-notes-4h-revoke.md rather than swapped for a mutation
        that was easier to catch.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch)
        stub = _RecordingApple()
        monkeypatch.setattr(apple_keys, "http_post", stub)

        capsys.readouterr()
        uid, sub, headers, _ = _apple_reader_4h(
            client, "b52", "4g-b52@example.com", code=None)
        logged = "".join(capsys.readouterr())

        assert stub.calls == []
        assert "apple token" not in logged, logged[-300:]
        assert _row(db, uid).apple_sub == sub
        assert _stored(db, uid) is None

        # CONTROL (rule 3): the same stub, the same route and the same detector, with a code
        # -> one call and one log line. So "zero" and "nothing" above are the conditional
        # working and not a broken stub or a dead capture.
        capsys.readouterr()
        uid2, _, _, _ = _apple_reader_4h(client, "b52c", "4g-b52-control@example.com")
        control = "".join(capsys.readouterr())
        assert len(stub.token_calls) == 1
        assert "apple token: status 200" in control
        assert _stored(db, uid2) is not None

    def test_without_the_encryption_key_nothing_is_stored(self, client, monkeypatch, db):
        """B-53. MUT-4H-04: fall back to storing the plaintext when `APPLE_TOKEN_KEY` is unset.
        MUT-4H-16: let a malformed `APPLE_TOKEN_KEY` raise out of `_token_key`.

        That fallback is the one thing `seal_token` must never be talked into: a security
        property that depends on whether an environment variable happens to be set is not a
        property. Unset key -> NULL column -> revocation inert -> exactly Sprint 4G.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch, key=None)
        stub = _RecordingApple()
        monkeypatch.setattr(apple_keys, "http_post", stub)

        uid, sub, headers, _ = _apple_reader_4h(client, "b53", "4g-b53@example.com")

        # The exchange still ran — it is gated on the `.p8`, not on the encryption key — and
        # the token was dropped rather than written in the clear.
        assert len(stub.token_calls) == 1
        assert _stored(db, uid) is None
        assert _row(db, uid).apple_sub == sub

        # An UNUSABLE key behaves like an unset one, never like a 500 on sign-in.
        _configure_token_key(monkeypatch, key="not-a-fernet-key")
        uid2, _, _, _ = _apple_reader_4h(client, "b53b", "4g-b53-bad@example.com")
        assert _stored(db, uid2) is None

        # ...and with the `.p8` absent there is no exchange at all (today's shipping state).
        _configure_revoke(monkeypatch, pem=None)
        _configure_token_key(monkeypatch)
        before = len(stub.calls)
        uid3, _, _, _ = _apple_reader_4h(client, "b53c", "4g-b53-nokey@example.com")
        assert len(stub.calls) == before
        assert _stored(db, uid3) is None


class TestAppleRevocationWithRefreshToken:
    """B-54..B-60. The deletion half, repaired.

    Everything `TestAppleRevocation` asserts about deletion never being blocked still holds;
    these cases are about WHAT is sent, what is stored, and what leaves the server.
    """

    def test_deletion_revokes_the_refresh_token_not_the_subject(self, client, monkeypatch, db):
        """B-54. MUT-4H-05: revoke `current_user.apple_sub` again (Sprint 4G's bug); or send
        the ciphertext without unsealing it.

        End to end, through BOTH Apple endpoints and one stub: the sign-in exchanges, the
        deletion revokes what the sign-in stored. B-40 above proves the same property from a
        planted token; this one proves the two halves actually join up.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch)
        stub = _RecordingApple()
        monkeypatch.setattr(apple_keys, "http_post", stub)

        uid, sub, headers, _ = _apple_reader_4h(client, "b54", "4g-b54@example.com")
        sealed = _stored(db, uid)
        assert sealed is not None and sealed != REFRESH_TOKEN

        r = client.post("/auth/delete-account/me", headers=headers)
        assert r.status_code == 200, r.text

        assert len(stub.token_calls) == 1
        assert len(stub.revoke_calls) == 1
        data = stub.revoke_calls[0]["data"]
        assert set(data) == REVOKE_BODY_KEYS
        assert data["token"] == REFRESH_TOKEN            # the fix
        assert data["token"] != sub                      # Sprint 4G's bug, pinned shut
        assert data["token"] != sealed                   # ...and unsealed, not raw
        assert data["token_type_hint"] == "refresh_token"
        assert data["client_id"] == BUNDLE_ID
        # The same `client_id` both times. Apple binds a refresh token to the client that
        # obtained it, so these two disagreeing would be a 400 nobody could see in a test that
        # looked at one call only.
        assert stub.token_calls[0]["data"]["client_id"] == data["client_id"]
        _verify_client_secret(data["client_secret"])

        # ...and SEPARATELY, that the reader is actually gone.
        assert _row(db, uid) is None

    def test_a_google_only_deletion_touches_no_apple_path_at_all(
            self, client, monkeypatch, db, capsys):
        """B-55. MUT-4H-06: drop the `apple_sub IS NOT NULL` gate (`if True:`).

        MEASURED, so that the reason this case exists is not guessed at. B-41 above still
        catches MUT-4H-06 on its own, through its before-value tripwire: with the gate gone
        the route reaches `revoke_token`, the tripwire raises, the deletion 500s and the
        Google-only row survives (`tests/test_apple_auth.py:1750`). What B-41 can no longer
        catch is a gate removed WITHOUT a tripwire in place, because after Sprint 4H
        `unseal_token(None)` is None and `revoke_token(None, ...)` sends nothing — so the call
        count stays zero and the response stays byte-identical. The gate's remaining
        observable effect in the real code is that the Apple path prints nothing at all for a
        Google-only reader, and that is what this asserts.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch)
        stub = _RecordingApple()
        monkeypatch.setattr(apple_keys, "http_post", stub)

        google_only = _make_user(db, email="4g-b55@example.com", name="B55")
        google_uid = google_only.id
        assert google_only.apple_sub is None
        assert google_only.apple_refresh_token is None

        capsys.readouterr()
        r = client.post("/auth/delete-account/me", headers=_auth(google_only))
        logged = "".join(capsys.readouterr())

        assert r.status_code == 200, r.text
        assert stub.calls == []
        assert _row(db, google_uid) is None
        assert "apple revoke" not in logged, logged[-300:]
        assert "apple token" not in logged, logged[-300:]

        # CONTROL (rule 3): the same stub and the same detector on an Apple reader -> one
        # revocation and one log line. So "nothing" above is the gate and not a dead capture.
        uid, _, headers, _ = _apple_reader_4h(client, "b55c", "4g-b55-apple@example.com")
        capsys.readouterr()
        assert client.post("/auth/delete-account/me", headers=headers).status_code == 200
        control = "".join(capsys.readouterr())
        assert len(stub.revoke_calls) == 1
        assert "apple revoke: status" in control

    def test_an_unreadable_stored_token_still_deletes_and_sends_nothing(
            self, client, monkeypatch, db):
        """B-56. MUT-4H-07: let `unseal_token` raise instead of returning None; or send the
        stored value anyway when the unseal fails.

        A rotated `APPLE_TOKEN_KEY` is the realistic version of this, and it must not cost a
        reader their deletion — 5.1.1(v) outranks revocation however the token became
        unreadable. Sending the ciphertext would be worse than sending nothing: it hands a
        credential-shaped value to Apple in exchange for a guaranteed 400.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch)
        stub = _RecordingApple()
        monkeypatch.setattr(apple_keys, "http_post", stub)
        uid, sub, headers, _ = _apple_reader_4h(client, "b56", "4g-b56@example.com")
        assert _stored(db, uid) is not None

        # The key rotates underneath the stored value: the ciphertext is untouched and simply
        # no longer authenticates.
        _configure_token_key(monkeypatch, key=Fernet.generate_key().decode())
        _dependents(db, uid)
        assert _dependent_counts(db, uid) == {"userbooks": 1, "notes": 1, "push_tokens": 1}

        r = client.post("/auth/delete-account/me", headers=headers)

        assert r.status_code == 200, r.text
        assert r.json() == {"message": "Account deleted"}
        assert stub.revoke_calls == []
        assert _row(db, uid) is None
        assert _dependent_counts(db, uid) == {"userbooks": 0, "notes": 0, "push_tokens": 0}

    def test_the_stored_token_never_leaves_the_server(self, client, monkeypatch, db):
        """B-57. MUT-4H-08: add `apple_refresh_token` to the /auth/apple response, or to
        /profile/me. MUT-4H-13: `index=True` on the column.

        The column is a credential with exactly one reader — the deletion route. No client has
        any use for it, sealed or not.
        """
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch)
        stub = _RecordingApple()
        monkeypatch.setattr(apple_keys, "http_post", stub)

        uid, sub, headers, payload = _apple_reader_4h(client, "b57", "4g-b57@example.com")
        sealed = _stored(db, uid)
        assert sealed is not None

        profile = client.get("/profile/me", headers=headers)
        assert profile.status_code == 200, profile.text
        for where, text in {"/auth/apple": json.dumps(payload),
                            "/profile/me": profile.text}.items():
            assert sealed not in text, where
            assert REFRESH_TOKEN not in text, where
            assert AUTH_CODE not in text, where
            assert "refresh_token" not in text, where
            assert TOKEN_KEY not in text, where

        # CONTROL (rule 3): the detector finds the value when it IS present.
        assert sealed in json.dumps({"apple_refresh_token": sealed})

        # The model keeps it unindexed and non-unique: nothing looks a reader up by it, and an
        # index on a credential is that credential in one more place on disk and in one more
        # backup.
        col = models.User.__table__.c.apple_refresh_token
        assert col.nullable is True
        assert col.index in (None, False)
        assert col.unique in (None, False)
        assert col.type.length == 512
        # A fresh row is NULL, never "" — the deletion reads this column and "" must not look
        # like something to revoke.
        fresh = _make_user(db, email="4g-b57-fresh@example.com", name="B57 Fresh")
        assert fresh.apple_refresh_token is None

    def test_nothing_sensitive_is_logged_by_the_exchange(self, client, monkeypatch, db, capsys):
        """B-58. MUT-4H-09: log the token response body, the refresh token or the code.

        R-13's discipline extended to the new endpoint. A token response body is the single
        most tempting thing in this sprint to print, and it is the one place a token appears.
        """
        body = "apple-token-detail-4h-b58"
        _configure_apple(monkeypatch, BUNDLE_ID)
        _configure_revoke(monkeypatch)
        _configure_token_key(monkeypatch)

        secrets = []
        capsys.readouterr()

        # 1. the success path, all the way through the deletion
        stub = _RecordingApple(token_text=body)
        monkeypatch.setattr(apple_keys, "http_post", stub)
        uid, sub, headers, _ = _apple_reader_4h(client, "b58", "4g-b58-ok@example.com")
        sealed = _stored(db, uid)
        secrets.append(stub.token_calls[0]["data"]["client_secret"])
        assert client.post("/auth/delete-account/me", headers=headers).status_code == 200
        secrets.append(stub.revoke_calls[0]["data"]["client_secret"])
        subs = [sub]

        # 2. every way the exchange can fail
        for mode in EXCHANGE_FAILURE_MODES:
            fstub = _exchange_failure(mode, body=body)
            monkeypatch.setattr(apple_keys, "http_post", fstub)
            uid2, sub2, headers2, _ = _apple_reader_4h(
                client, f"b58{mode[:4]}", f"4g-b58-{mode}@example.com")
            assert client.post("/auth/delete-account/me", headers=headers2).status_code == 200
            subs.append(sub2)
            if fstub.token_calls:
                secrets.append(fstub.token_calls[0]["data"]["client_secret"])

        logged = "".join(capsys.readouterr())
        assert "-----BEGIN" not in logged
        assert _REVOKE_PEM not in logged
        assert body not in logged
        assert AUTH_CODE not in logged
        assert REFRESH_TOKEN not in logged
        assert TOKEN_KEY not in logged
        assert sealed not in logged
        for secret in secrets:
            assert secret not in logged
        for value in subs:
            assert value not in logged, value[:24]
        # Status lines alone ARE permitted, and prove the capture is not simply empty.
        assert "apple token: status 200, refresh_token stored" in logged
        assert "apple revoke: status" in logged

        # CONTROL (rule 3): the same detector finds a deliberate leak.
        print(f"synthetic leak: {body} {AUTH_CODE} {REFRESH_TOKEN}")
        leaked = "".join(capsys.readouterr())
        assert body in leaked and AUTH_CODE in leaked and REFRESH_TOKEN in leaked

    def test_schema_guard_requires_the_new_column(self):
        """B-59. MUT-4H-10: drop the 4H entry from `schema_guard.REQUIRED_COLUMNS`.

        The column needs a PM SQL step, and a model column deployed without its guard entry is
        the April 2026 outage: the service boots and then 500s on every `User` query. The entry
        and the model field travel in ONE commit, and that commit deploys only after the SQL.
        """
        required = schema_guard.REQUIRED_COLUMNS
        assert ("user", "apple_refresh_token") in required
        # every earlier sprint's pairs are still there — 4H appends, it never rewrites
        for pair in (("user", "timezone"), ("reading_activity", "local_day"),
                     ("user", "is_bot"), ("bot_post", "dedup_key"), ("user", "apple_sub")):
            assert pair in required, pair
        tables = SQLModel.metadata.tables
        for table, column in required:
            assert table in tables, f"{table} is not a table in SQLModel.metadata"
            assert column in tables[table].c, f"{table}.{column} is not a column"

        # The guard EXITS rather than booting: served everything but this column, it raises.
        served = [p for p in required if p != ("user", "apple_refresh_token")]
        assert len(served) == len(required) - 1
        with pytest.raises(RuntimeError) as exc:
            schema_guard.assert_migrated(_StubEngine("postgresql", rows=served))
        assert "apple_refresh_token" in str(exc.value)
        # CONTROL: served the full set, it returns None.
        assert schema_guard.assert_migrated(
            _StubEngine("postgresql", rows=list(required))) is None

    def test_pm_sql_step_9_is_bounded_idempotent_and_additive(self):
        """B-60. MUT-4H-11: make step 9's ALTER NOT NULL, give it a DEFAULT, or index it.

        Bounded at both ends for 4C's K-15 reason: `text[start:]` scans everything after the
        heading, so a later section can satisfy an assertion the bounded one fails.
        """
        text = PM_SQL_QUEUE_4H_PATH.read_text(encoding="utf-8")
        heading = "## 9. Sprint 4H"
        start = text.index(heading)
        rest = text[start + len(heading):]
        headings = [m.start() for m in re.finditer(r"^## ", rest, re.MULTILINE)]
        assert headings, "expected a `## ` heading after step 9"
        section = text[start:start + len(heading) + headings[0]]

        # the bound is real: shorter than the file, and it excludes both neighbours
        assert 0 < len(section) < len(text)
        assert "## 8. Sprint 4G" not in section
        assert "What Claude does with each answer" not in section

        normalized = " ".join(section.split())
        assert ('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS apple_refresh_token VARCHAR(512)'
                in normalized)
        # the model and the SQL agree on the width, recomputed rather than typed twice
        width = models.User.__table__.c.apple_refresh_token.type.length
        assert f"apple_refresh_token VARCHAR({width})" in normalized

        # additive only: a NOT NULL or a DEFAULT would rewrite every row, and nothing in this
        # step may read, write or move one.
        alter = [s.strip() for s in section.split(";") if "ADD COLUMN" in s.upper()]
        assert len(alter) == 1, alter
        assert "NOT NULL" not in alter[0].upper()
        assert "DEFAULT" not in alter[0].upper()
        for verb in ("UPDATE ", "DELETE ", "INSERT ", "CREATE INDEX", "CREATE UNIQUE INDEX"):
            assert verb not in normalized.upper(), verb

        # the three verification queries
        assert "information_schema.columns" in normalized
        assert "'apple_refresh_token'" in normalized
        assert "pg_indexes" in normalized
        assert 'SELECT count(*) FROM "user" WHERE apple_refresh_token IS NOT NULL' in normalized

        # K-14's property one sprint on: step 9 is APPENDED after step 8, which is what leaves
        # 4G's own bounded section (and every assertion in it) intact.
        assert text.index("## 8. Sprint 4G") < start
