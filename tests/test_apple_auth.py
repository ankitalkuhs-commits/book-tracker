"""Sprint 4G — Sign in with Apple: the column, the guard, token verification, the linking rule.

tests.md packages P1 (B-32, B-32a, B-32b, B-38, B-39) and P2 (B-01..B-13, B-20..B-36).

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
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jose import jwt
from jose.utils import base64url_encode
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, Session, select

# ── Import guard (tests.md K-07, non-vacuity rule 5) ─────────────────────────────────────────
# A missing or renamed symbol must be ONE loud collection error, never N silent skips.
from app import apple_keys, auth, crud, models, schema_guard
from app.apple_keys import fetch_jwks, verify_identity_token
from app.models import User
from app.routers import auth_router

assert callable(verify_identity_token) and callable(fetch_jwks)
assert hasattr(User, "apple_sub"), "P1 has not added the column"
# tests.md's header also imports `revoke_token`. It is P3's symbol and P3 is a separate
# package that lands after this one, so importing it here would stop this whole file loading
# and take 64 assertions with it. P3 adds it to this guard with its own cases. Deviation
# recorded in build-notes-4g-api.md.

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
        assert len(pairs) == 5
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
        offenders = []
        for added, removed, path in rows:
            path = path.replace("\\", "/")
            if removed not in ("0", "-"):
                offenders.append(f"{path}: {removed} line(s) removed")
            elif path not in additions_only | wholly_new:
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
