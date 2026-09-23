"""Sprint 4F — Package P1: the flag, the token, the guards.

Covers R-01 (the `is_bot` column is the single authority), R-08 (`/auth/bot-login`) and
R-05 (`deny_bot_actor`, the dispatcher and the streak scheduler never touch a reader on a
bot's behalf).

Case ids are tests.md's: B-01..B-12 with their letter suffixes, B-21/B-21a/B-22, B-23',
B-25, B-25a, B-31. Every case names its mutation in a comment on the assertion it protects.

Import guard (tests.md non-vacuity rule 5 / K-07): every symbol this file uses is asserted at
module scope, so a missing or renamed symbol is ONE loud collection error and never N silent
skips.
"""
import ast
import calendar
import inspect
import os
import re
import subprocess
from datetime import datetime, timedelta

import pytest
from fastapi.routing import APIRoute
from sqlalchemy import Boolean
from sqlmodel import SQLModel, func, select

from app import auth, crud, models, schema_guard
from app.deps import deny_bot_actor, BOT_ACTOR_DENIED
from app.main import app
from app.models import BotPost, User
import app.notifications.dispatcher as dispatcher
import app.notifications.scheduler as sched
from app.routers import auth_router
from migrations.add_bot_accounts import BOT_ACCOUNTS, create_bot_accounts
from tests.conftest import engine as test_engine, _auth, _make_user

# ── Import guard ─────────────────────────────────────────────────────────────
assert callable(deny_bot_actor)
assert callable(create_bot_accounts)
assert callable(dispatcher.fire_event)
assert callable(sched._send_inactivity_reminders)
assert isinstance(BOT_ACTOR_DENIED, str) and BOT_ACTOR_DENIED
assert hasattr(BotPost, "__table__") and hasattr(User, "__table__")
assert isinstance(schema_guard.REQUIRED_COLUMNS, tuple)
assert hasattr(auth_router, "bot_login")


BOT_SECRET = "test-bot-secret-value"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_bot(db, email, name="Bot"):
    """A bot is a reader row with the flag set. Fresh email per case (tests.md §1): _make_user
    returns the EXISTING row for a reused email, so a stored is_bot would leak between cases."""
    user = _make_user(db, email=email, name=name)
    user.is_bot = True
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _configure_bot_login(monkeypatch, *emails, secret=BOT_SECRET):
    monkeypatch.setenv("BOT_LOGIN_SECRET", secret)
    monkeypatch.setenv("BOT_LOGIN_EMAILS", ",".join(emails))


def _public_note(db, owner_id, text="4F note"):
    note = models.Note(user_id=owner_id, text=text, is_public=True)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def _count(db, model, *where):
    db.expire_all()
    stmt = select(func.count()).select_from(model)
    for w in where:
        stmt = stmt.where(w)
    return db.exec(stmt).one()


class _Spy:
    """Records every call instead of firing it. `calls` is the assertion surface."""

    def __init__(self):
        self.calls = []

    def __call__(self, *args, **kwargs):
        self.calls.append(kwargs or args)
        return {"sent": 0, "spied": True}


# ═══════════════════════════════════════════════════════════════════════════
# 2.1 The flag — R-01
# ═══════════════════════════════════════════════════════════════════════════

class TestBotFlag:

    def test_is_bot_column_shape(self, db):
        """B-31. MUT-4F-01: `is_bot: Optional[bool] = None` on models.py."""
        col = User.__table__.c.is_bot
        assert isinstance(col.type, Boolean)
        assert col.nullable is False
        assert col.default is not None and col.default.arg is False
        assert col.index is True, "R-16 filters on is_bot on every /admin/stats call"

        fresh = _make_user(db, email="4f-b31-reader@example.com", name="B31")
        db.refresh(fresh)
        assert fresh.is_bot is False      # not None — a client must never need a fallback

    def test_schema_guard_entries(self):
        """B-25. MUT-4F-02: drop either 4F entry from schema_guard.REQUIRED_COLUMNS."""
        required = schema_guard.REQUIRED_COLUMNS
        assert ("user", "is_bot") in required
        assert ("bot_post", "dedup_key") in required
        # the 4C pairs are still there — this file appends, it never rewrites
        assert ("user", "timezone") in required
        assert ("reading_activity", "local_day") in required
        # every pair must name a real table and a real column, so a typo like "bot_posts"
        # cannot sit in the tuple and fail only at deploy time
        tables = SQLModel.metadata.tables
        for table, column in required:
            assert table in tables, f"{table} is not a table in SQLModel.metadata"
            assert column in tables[table].c, f"{table}.{column} is not a column"

    def test_migration_script_creates_non_admin_bots(self, db):
        """B-25a. MUT-4F-03: drop is_bot=True, or set is_admin=True, in add_bot_accounts."""
        before = _count(db, User)
        rows = create_bot_accounts(db)
        assert len(rows) == 3, "the script creates exactly the three NEW accounts"

        for row in rows:
            assert row.is_bot is True
            assert row.is_admin is False
            assert (row.bio or "").startswith("Automated account."), "E-9"
            # the password is unusable: neither the empty string nor the email opens it
            assert auth.verify_password("", row.password_hash) is False
            assert auth.verify_password(row.email, row.password_hash) is False

        after_first = _count(db, User)
        assert after_first == before + 3

        # idempotent — a second run creates no duplicate row
        again = create_bot_accounts(db)
        assert _count(db, User) == after_first
        assert sorted(r.id for r in again) == sorted(r.id for r in rows)

        # control: @TMRBot is NOT created here (the PM's SQL flips the existing row)
        assert "tmrbot@trackmyread.com" not in {s["email"] for s in BOT_ACCOUNTS}


# ═══════════════════════════════════════════════════════════════════════════
# 2.2 /auth/bot-login — R-08
# ═══════════════════════════════════════════════════════════════════════════

class TestBotLogin:

    @pytest.fixture(autouse=True)
    def _clean_bot_env(self, monkeypatch):
        monkeypatch.delenv("BOT_LOGIN_SECRET", raising=False)
        monkeypatch.delenv("BOT_LOGIN_EMAILS", raising=False)

    def test_404_when_unconfigured(self, client, db, monkeypatch):
        """B-01. MUT-4F-05: delete the `if not configured_secret or not allowlist` guard."""
        email = "4f-b01@trackmyread.com"
        _make_bot(db, email)
        body = {"email": email, "secret": BOT_SECRET}

        assert client.post("/auth/bot-login", json=body).status_code == 404
        assert client.post("/auth/bot-login", json=body).json() == {"detail": "Not Found"}

        monkeypatch.setenv("BOT_LOGIN_SECRET", BOT_SECRET)
        assert client.post("/auth/bot-login", json=body).status_code == 404

        monkeypatch.delenv("BOT_LOGIN_SECRET")
        monkeypatch.setenv("BOT_LOGIN_EMAILS", email)
        assert client.post("/auth/bot-login", json=body).status_code == 404

        # CONTROL: with both set the SAME body returns 200, so the 404 was the env gate and
        # not a bad payload.
        _configure_bot_login(monkeypatch, email)
        assert client.post("/auth/bot-login", json=body).status_code == 200

    def test_not_in_openapi(self, client):
        """B-01a. MUT-4F-06: drop include_in_schema=False."""
        paths = client.get("/openapi.json").json()["paths"]
        assert "/auth/bot-login" not in paths
        assert "/auth/review-login" not in paths   # the precedent, still true
        assert "/auth/google" in paths             # control: the walk found real paths

    def test_valid_bot_gets_a_working_token(self, client, db, monkeypatch):
        """B-02. MUT-4F-07: invert `email_ok and row_ok and secret_ok`."""
        email = "4f-b02@trackmyread.com"
        bot = _make_bot(db, email)
        _configure_bot_login(monkeypatch, email)

        r = client.post("/auth/bot-login", json={"email": email, "secret": BOT_SECRET})
        assert r.status_code == 200
        token = r.json()["access_token"]
        assert token

        # CONTROL (E-4): the token is an ORDINARY user token. get_current_user cannot tell it
        # from a reader's, because no scope claim exists — the row is the only authority.
        me = client.get("/profile/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["id"] == bot.id
        assert auth.decode_token(token)["sub"] == email
        assert "scope" not in auth.decode_token(token)

    def test_401_when_row_is_not_a_bot(self, client, db, monkeypatch):
        """B-03. MUT-4F-08: drop the `user.is_bot` check from the login."""
        email = "4f-b03-reader@trackmyread.com"
        reader = _make_user(db, email=email, name="B03")
        assert reader.is_bot is False
        _configure_bot_login(monkeypatch, email)

        r = client.post("/auth/bot-login", json={"email": email, "secret": BOT_SECRET})
        assert r.status_code == 401

        # no side effect: a token minted the ordinary way still works for that reader
        assert client.get("/profile/me", headers=_auth(reader)).status_code == 200

    def test_401_for_allowlisted_foreign_domain(self, client, db, monkeypatch):
        """B-04. MUT-4F-09: delete the `endswith(TRACKMYREAD_DOMAIN)` guard."""
        foreign = "4f-b04@example.com"
        good = "4f-b04@trackmyread.com"
        _make_bot(db, foreign)
        _make_bot(db, good)
        _configure_bot_login(monkeypatch, foreign, good)

        r = client.post("/auth/bot-login", json={"email": foreign, "secret": BOT_SECRET})
        assert r.status_code == 401

        # CONTROL: the same request for the @trackmyread.com bot succeeds
        ok = client.post("/auth/bot-login", json={"email": good, "secret": BOT_SECRET})
        assert ok.status_code == 200

    def test_all_five_rejections_are_byte_identical(self, client, db, monkeypatch):
        """B-05. MUT-4F-10: give any two branches different `detail` strings."""
        allowed_bot = "4f-b05-bot@trackmyread.com"
        foreign = "4f-b05@example.com"
        missing = "4f-b05-missing@trackmyread.com"
        not_a_bot = "4f-b05-reader@trackmyread.com"
        _make_bot(db, allowed_bot)
        _make_bot(db, foreign)
        _make_user(db, email=not_a_bot, name="B05")
        _configure_bot_login(monkeypatch, allowed_bot, foreign, missing, not_a_bot)

        rejections = [
            # (a) not in the allowlist
            client.post("/auth/bot-login",
                        json={"email": "4f-b05-stranger@trackmyread.com", "secret": BOT_SECRET}),
            # (b) allowlisted, wrong domain
            client.post("/auth/bot-login", json={"email": foreign, "secret": BOT_SECRET}),
            # (c) allowlisted, right domain, no row
            client.post("/auth/bot-login", json={"email": missing, "secret": BOT_SECRET}),
            # (d) row exists but is_bot = false
            client.post("/auth/bot-login", json={"email": not_a_bot, "secret": BOT_SECRET}),
            # (e) everything right, wrong secret
            client.post("/auth/bot-login", json={"email": allowed_bot, "secret": "nope"}),
        ]
        assert len(rejections) == 5
        for r in rejections:
            assert r.status_code == 401
        first = rejections[0]
        for r in rejections[1:]:
            assert r.content == first.content
            assert r.json() == first.json()
            assert r.headers.get("content-type") == first.headers.get("content-type")
            assert r.headers.get("content-length") == first.headers.get("content-length")

        # CONTROL: a sixth, valid request returns 200 — "all identical" is not "all broken"
        ok = client.post("/auth/bot-login", json={"email": allowed_bot, "secret": BOT_SECRET})
        assert ok.status_code == 200

    def test_never_creates_a_user(self, client, db, monkeypatch):
        """B-06. MUT-4F-11: paste review_login's find-or-create block into bot_login."""
        email = "4f-b06-nobody@trackmyread.com"
        _configure_bot_login(monkeypatch, email)
        before = _count(db, User)

        r = client.post("/auth/bot-login", json={"email": email, "secret": BOT_SECRET})
        assert r.status_code == 401

        db.expire_all()
        assert _count(db, User) == before
        assert crud.get_user_by_email(db, email) is None

        # CONTROL: /auth/review-login on the same shape DOES create — the divergence is the point
        monkeypatch.setenv("REVIEW_LOGIN_SECRET", BOT_SECRET)
        monkeypatch.setenv("REVIEW_LOGIN_EMAILS", "4f-b06-review@trackmyread.com")
        rv = client.post("/auth/review-login",
                         json={"email": "4f-b06-review@trackmyread.com", "secret": BOT_SECRET})
        assert rv.status_code == 200
        db.expire_all()
        assert crud.get_user_by_email(db, "4f-b06-review@trackmyread.com") is not None

    def test_token_lives_fifteen_minutes(self, client, db, monkeypatch):
        """B-07. MUT-4F-12: remove expires_delta from create_access_token in bot_login.

        NOTE (reported in build notes): tests.md says `exp - iat == 900`, but
        app.auth.create_access_token writes no `iat` claim at all — there is nothing to
        subtract. The issue instant is taken from the same clock the token was minted on
        instead, which measures the same thing.
        """
        email = "4f-b07@trackmyread.com"
        _make_bot(db, email)
        _configure_bot_login(monkeypatch, email)

        issued_at = datetime.utcnow()
        r = client.post("/auth/bot-login", json={"email": email, "secret": BOT_SECRET})
        assert r.status_code == 200
        token = r.json()["access_token"]
        exp = auth.decode_token(token)["exp"]

        # `exp` is encoded from a naive UTC datetime, so it must be compared on the UTC
        # timeline — datetime.timestamp() would read the naive value as local time.
        lifetime = exp - calendar.timegm(issued_at.utctimetuple())
        assert 895 <= lifetime <= 905, f"expected a 900 s token, got {lifetime} s"
        # and emphatically not auth.ACCESS_TOKEN_EXPIRE_MINUTES (30 days)
        assert lifetime < auth.ACCESS_TOKEN_EXPIRE_MINUTES * 60

        # A token issued 16 minutes ago is dead; one issued 14 minutes ago still works.
        # app.auth reads datetime.utcnow() directly (not the localday seam), so the clock is
        # shifted for the mint and left real for the request — which is exactly "an old token".
        class _Shifted(datetime):
            _delta = timedelta()

            @classmethod
            def utcnow(cls):
                return datetime.utcnow() + cls._delta

        for minutes, expected in ((-16, 401), (-14, 200)):
            _Shifted._delta = timedelta(minutes=minutes)
            with monkeypatch.context() as m:        # scoped: never undoes the localday pin
                m.setattr(auth, "datetime", _Shifted)
                old = client.post(
                    "/auth/bot-login", json={"email": email, "secret": BOT_SECRET}
                ).json()["access_token"]
            got = client.get("/profile/me", headers={"Authorization": f"Bearer {old}"})
            assert got.status_code == expected, f"token issued {minutes} min ago"

    def test_secret_compare_is_constant_time(self):
        """B-07a (structural, K-06). MUT-4F-13: replace compare_digest with `==`."""
        source = inspect.getsource(auth_router)

        def violations(src, func_name="bot_login"):
            tree = ast.parse(src)
            fn = next((n for n in ast.walk(tree)
                       if isinstance(n, ast.FunctionDef) and n.name == func_name), None)
            assert fn is not None, f"{func_name} not found — the walk must not pass vacuously"
            uses_compare_digest = any(
                isinstance(n, ast.Call)
                and isinstance(n.func, ast.Attribute)
                and n.func.attr == "compare_digest"
                for n in ast.walk(fn)
            )
            bad = [
                ast.get_source_segment(src, n)
                for n in ast.walk(fn)
                if isinstance(n, ast.Compare)
                and any(isinstance(op, ast.Eq) for op in n.ops)
                and "secret" in (ast.get_source_segment(src, n) or "")
            ]
            if not uses_compare_digest:
                bad.append(f"{func_name}: no hmac.compare_digest call")
            return bad

        assert violations(source) == []

        # CONTROL (rule 3): the same detector on a deliberately-unsafe snippet reports a hit
        synthetic = (
            "def bot_login():\n"
            "    if payload.secret == configured_secret:\n"
            "        pass\n"
        )
        assert len(violations(synthetic)) == 2   # the `==` compare AND the missing digest call

    def test_login_does_not_write_last_active(self, client, db, monkeypatch):
        """B-07b (R-12). MUT-4F-14: copy review_login's last_active write into bot_login."""
        email = "4f-b07b@trackmyread.com"
        bot = _make_bot(db, email)
        bot.last_active = None
        db.add(bot)
        db.commit()
        _configure_bot_login(monkeypatch, email)

        r = client.post("/auth/bot-login", json={"email": email, "secret": BOT_SECRET})
        assert r.status_code == 200
        db.expire_all()
        assert db.get(User, bot.id).last_active is None

        # CONTROL: an authenticated request DOES stamp it, via deps.py's once-a-local-day write
        token = r.json()["access_token"]
        assert client.get("/profile/me",
                          headers={"Authorization": f"Bearer {token}"}).status_code == 200
        db.expire_all()
        assert db.get(User, bot.id).last_active is not None

    def test_config_read_per_request(self, client, db, monkeypatch):
        """B-07c. MUT-4F-15: read the env vars once at import time into a module constant."""
        email = "4f-b07c@trackmyread.com"
        _make_bot(db, email)
        _configure_bot_login(monkeypatch, email)
        body = {"email": email, "secret": BOT_SECRET}
        assert client.post("/auth/bot-login", json=body).status_code == 200

        monkeypatch.delenv("BOT_LOGIN_SECRET")
        assert client.post("/auth/bot-login", json=body).status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# 2.3 deny_bot_actor — R-05, and the proof of "before"
# ═══════════════════════════════════════════════════════════════════════════

GUARDED_ROUTES = {
    ("POST", "/follow/{followed_id}"),
    ("POST", "/notes/{note_id}/like"),
    ("DELETE", "/notes/{note_id}/like"),
    ("POST", "/notes/{note_id}/comments"),
}


def _dependency_calls(dependant):
    for dep in dependant.dependencies:
        yield dep.call
        yield from _dependency_calls(dep)


class TestDenyBotActor:

    def test_follow_403_and_no_row(self, client, db):
        """B-08. MUT-4F-16: remove Depends(deny_bot_actor) from follow_router."""
        bot = _make_bot(db, "4f-b08-bot@trackmyread.com")
        reader = _make_user(db, email="4f-b08-reader@example.com", name="B08")
        before_follows = _count(db, models.Follow)
        before_logs = _count(db, models.NotificationLog,
                             models.NotificationLog.event_type == "new_follower")

        r = client.post(f"/follow/{reader.id}", headers=_auth(bot))
        assert r.status_code == 403
        assert r.json()["detail"] == BOT_ACTOR_DENIED
        assert _count(db, models.Follow) == before_follows
        assert _count(db, models.NotificationLog,
                      models.NotificationLog.event_type == "new_follower") == before_logs

    def test_like_403_no_row_no_notification(self, client, db, monkeypatch):
        """B-09. MUT-4F-17: remove the dependency from likes_comments like_note."""
        owner = _make_user(db, email="4f-b09-owner@example.com", name="B09o")
        bot = _make_bot(db, "4f-b09-bot@trackmyread.com")
        control = _make_user(db, email="4f-b09-control@example.com", name="B09c")
        note = _public_note(db, owner.id)

        spy = _Spy()
        monkeypatch.setattr("app.routers.likes_comments.fire_event", spy)

        before_likes = _count(db, models.Like)
        before_logs = _count(db, models.NotificationLog)

        r = client.post(f"/notes/{note.id}/like", headers=_auth(bot))
        assert r.status_code == 403
        assert _count(db, models.Like) == before_likes
        assert spy.calls == []
        assert _count(db, models.NotificationLog) == before_logs

        # CONTROL: a reader liking the SAME note in the SAME test succeeds and fires
        ok = client.post(f"/notes/{note.id}/like", headers=_auth(control))
        assert ok.status_code == 201
        assert _count(db, models.Like) == before_likes + 1
        assert len(spy.calls) == 1
        assert spy.calls[0]["event_type"] == "post_liked"

    def test_unlike_403(self, client, db):
        """B-10. MUT-4F-18: remove the dependency from unlike_note."""
        owner = _make_user(db, email="4f-b10-owner@example.com", name="B10o")
        bot = _make_bot(db, "4f-b10-bot@trackmyread.com")
        note = _public_note(db, owner.id)
        planted = models.Like(note_id=note.id, user_id=bot.id)
        db.add(planted)
        db.commit()
        db.refresh(planted)

        r = client.delete(f"/notes/{note.id}/like", headers=_auth(bot))
        assert r.status_code == 403
        db.expire_all()
        assert db.get(models.Like, planted.id) is not None, "the planted row survives the 403"

        # CONTROL: the owner can still unlike their own like of the same note
        owner_like = models.Like(note_id=note.id, user_id=owner.id)
        db.add(owner_like)
        db.commit()
        assert client.delete(f"/notes/{note.id}/like", headers=_auth(owner)).status_code == 200

    def test_comment_403_no_row(self, client, db):
        """B-11. MUT-4F-19: remove the dependency from create_comment."""
        owner = _make_user(db, email="4f-b11-owner@example.com", name="B11o")
        bot = _make_bot(db, "4f-b11-bot@trackmyread.com")
        control = _make_user(db, email="4f-b11-control@example.com", name="B11c")
        note = _public_note(db, owner.id)
        before = _count(db, models.Comment)

        r = client.post(f"/notes/{note.id}/comments", json={"text": "hello"}, headers=_auth(bot))
        assert r.status_code == 403
        assert _count(db, models.Comment) == before

        # CONTROL
        ok = client.post(f"/notes/{note.id}/comments", json={"text": "hi"},
                         headers=_auth(control))
        assert ok.status_code == 201
        assert _count(db, models.Comment) == before + 1

    def test_no_notification_is_queued_for_any_of_the_four(self, client, db, monkeypatch):
        """B-11a (K-10). Any of MUT-4F-16..19 turns this red."""
        owner = _make_user(db, email="4f-b11a-owner@example.com", name="B11Ao")
        bot = _make_bot(db, "4f-b11a-bot@trackmyread.com")
        control = _make_user(db, email="4f-b11a-control@example.com", name="B11Ac")
        note = _public_note(db, owner.id)

        like_spy, follow_spy = _Spy(), _Spy()
        monkeypatch.setattr("app.routers.likes_comments.fire_event", like_spy)
        monkeypatch.setattr("app.routers.follow_router.fire_event", follow_spy)
        before_logs = _count(db, models.NotificationLog)

        bot_headers = _auth(bot)
        assert client.post(f"/follow/{owner.id}", headers=bot_headers).status_code == 403
        assert client.post(f"/notes/{note.id}/like", headers=bot_headers).status_code == 403
        assert client.delete(f"/notes/{note.id}/like", headers=bot_headers).status_code == 403
        assert client.post(f"/notes/{note.id}/comments", json={"text": "x"},
                           headers=bot_headers).status_code == 403

        assert like_spy.calls == []
        assert follow_spy.calls == []
        assert _count(db, models.NotificationLog) == before_logs

        # CONTROL: the same four calls by a reader produce at least 3 fired events
        reader_headers = _auth(control)
        assert client.post(f"/follow/{owner.id}", headers=reader_headers).status_code == 200
        assert client.post(f"/notes/{note.id}/like", headers=reader_headers).status_code == 201
        assert client.delete(f"/notes/{note.id}/like", headers=reader_headers).status_code == 200
        assert client.post(f"/notes/{note.id}/comments", json={"text": "x"},
                           headers=reader_headers).status_code == 201
        assert len(like_spy.calls) + len(follow_spy.calls) >= 3

    def test_reader_still_succeeds_on_all_four(self, client, db):
        """B-12. MUT-4F-20: make deny_bot_actor reject everyone (`if True:`)."""
        owner = _make_user(db, email="4f-b12-owner@example.com", name="B12o")
        reader = _make_user(db, email="4f-b12-reader@example.com", name="B12r")
        note = _public_note(db, owner.id)
        h = _auth(reader)

        assert client.post(f"/follow/{owner.id}", headers=h).status_code == 200
        assert client.post(f"/notes/{note.id}/like", headers=h).status_code == 201
        assert _count(db, models.Like,
                      models.Like.note_id == note.id, models.Like.user_id == reader.id) == 1
        assert client.delete(f"/notes/{note.id}/like", headers=h).status_code == 200
        assert client.post(f"/notes/{note.id}/comments", json={"text": "hi"},
                           headers=h).status_code == 201
        assert _count(db, models.Follow,
                      models.Follow.follower_id == reader.id,
                      models.Follow.followed_id == owner.id) == 1

    def test_dependency_inventory_is_exactly_four_routes(self):
        """B-12a (K-10, rules 2 and 4). MUT-4F-21: add deny_bot_actor to POST /notes/, or
        remove it from one of the four.

        FastAPI resolves route dependencies BEFORE the handler body, so the presence of
        deny_bot_actor in route.dependant IS the "before any row, before any notification"
        guarantee that R-05 asks for. A status-code test alone cannot prove it.
        """
        api_routes = [r for r in app.routes if isinstance(r, APIRoute)]
        assert len(api_routes) > 50, "the walk found almost no routes — it would pass vacuously"

        found = set()
        for route in api_routes:
            if deny_bot_actor in set(_dependency_calls(route.dependant)):
                for method in route.methods:
                    found.add((method, route.path))

        assert len(found) == 4, f"expected 4 guarded routes, found {len(found)}: {sorted(found)}"
        assert found == GUARDED_ROUTES
        assert ("POST", "/notes/") not in found, "a bot must be able to post (R-07)"
        assert not any(m == "GET" for m, _ in found), "a bot reads the public feed (arch §4)"

    def test_decided_from_the_row_not_the_token(self, client, db):
        """B-12b. MUT-4F-22: read is_bot from a JWT claim instead of the row."""
        target = _make_user(db, email="4f-b12b-target@example.com", name="B12Bt")
        flips_to_bot = _make_user(db, email="4f-b12b-up@example.com", name="B12Bu")
        token_before = _auth(flips_to_bot)          # minted while is_bot is False

        flips_to_bot.is_bot = True
        db.add(flips_to_bot)
        db.commit()
        r = client.post(f"/follow/{target.id}", headers=token_before)
        assert r.status_code == 403, "the row now says bot; the token predates it"

        # and the reverse — revocation is an UPDATE, not a token-expiry problem (E-4)
        flips_to_reader = _make_bot(db, "4f-b12b-down@trackmyread.com")
        token_bot = _auth(flips_to_reader)          # minted while is_bot is True
        flips_to_reader.is_bot = False
        db.add(flips_to_reader)
        db.commit()
        assert client.post(f"/follow/{target.id}", headers=token_bot).status_code == 200

    def test_403_path_writes_nothing(self, client, db, stmt_counter):
        """B-12c (K-10). MUT-4F-23: move the check from the dependency into the handler body,
        after db.add(like)."""
        owner = _make_user(db, email="4f-b12c-owner@example.com", name="B12Co")
        bot = _make_bot(db, "4f-b12c-bot@trackmyread.com")
        control = _make_user(db, email="4f-b12c-control@example.com", name="B12Cc")
        note = _public_note(db, owner.id)
        bot_headers = _auth(bot)
        reader_headers = _auth(control)
        # warm both users' once-a-local-day last_active write out of the way (deps.py:87)
        client.get("/profile/me", headers=bot_headers)
        client.get("/profile/me", headers=reader_headers)

        stmt_counter.reset()
        client.post(f"/follow/{owner.id}", headers=bot_headers)
        client.post(f"/notes/{note.id}/like", headers=bot_headers)
        client.delete(f"/notes/{note.id}/like", headers=bot_headers)
        client.post(f"/notes/{note.id}/comments", json={"text": "x"}, headers=bot_headers)
        assert stmt_counter.inserts == 0

        # CONTROL: the same four by a reader do write
        stmt_counter.reset()
        client.post(f"/follow/{owner.id}", headers=reader_headers)
        client.post(f"/notes/{note.id}/like", headers=reader_headers)
        client.delete(f"/notes/{note.id}/like", headers=reader_headers)
        client.post(f"/notes/{note.id}/comments", json={"text": "x"}, headers=reader_headers)
        assert stmt_counter.inserts >= 3


# ═══════════════════════════════════════════════════════════════════════════
# 2.4 Notifications and the scheduler — R-05
# ═══════════════════════════════════════════════════════════════════════════

class TestBotNotifications:

    @pytest.fixture(autouse=True)
    def _no_real_push(self, monkeypatch):
        monkeypatch.setattr("app.notifications.dispatcher.send_expo_push",
                            lambda db, user_id, title, body, data: None)
        monkeypatch.setattr("app.notifications.dispatcher.send_web_push",
                            lambda db, user_id, title, body, data: None)

    def test_fire_event_never_delivers_to_a_bot(self, db):
        """B-21. MUT-4F-24: remove the is_bot filter from dispatcher._user_wants_event."""
        bot = _make_bot(db, "4f-b21-bot@trackmyread.com")
        reader = _make_user(db, email="4f-b21-reader@example.com", name="B21r")
        actor = _make_user(db, email="4f-b21-actor@example.com", name="B21a")

        summary = dispatcher.fire_event(
            db=db, event_type="new_follower", actor_id=actor.id, actor_name="B21a",
            recipient_ids=[bot.id, reader.id],
        )
        assert summary["sent"] == 1
        # CONTROL: the reader's row proves the call fired at all
        assert _count(db, models.NotificationLog,
                      models.NotificationLog.user_id == reader.id,
                      models.NotificationLog.event_type == "new_follower") == 1
        assert _count(db, models.NotificationLog,
                      models.NotificationLog.user_id == bot.id) == 0

    def test_bot_is_never_named_as_actor(self, db):
        """B-21a. MUT-4F-25: remove the actor filter from fire_event.

        Defence in depth: deny_bot_actor means no product path reaches fire_event with a bot
        actor. The control is that the same call with a reader actor DOES write a row.
        """
        bot = _make_bot(db, "4f-b21a-bot@trackmyread.com")
        reader = _make_user(db, email="4f-b21a-reader@example.com", name="B21Ar")
        reader_actor = _make_user(db, email="4f-b21a-actor@example.com", name="B21Aa")

        dispatcher.fire_event(db=db, event_type="new_follower", actor_id=bot.id,
                              actor_name="Bot", recipient_ids=[reader.id])
        assert _count(db, models.NotificationLog,
                      models.NotificationLog.actor_id == bot.id) == 0

        # CONTROL
        dispatcher.fire_event(db=db, event_type="new_follower", actor_id=reader_actor.id,
                              actor_name="B21Aa", recipient_ids=[reader.id])
        assert _count(db, models.NotificationLog,
                      models.NotificationLog.actor_id == reader_actor.id) == 1

    def test_streak_reminder_never_selects_a_bot(self, db, monkeypatch, freeze_at):
        """B-22. MUT-4F-26: remove `.where(User.is_bot == False)` from the scheduler."""
        frozen = freeze_at("2026-09-18T14:30:00")     # 20:00 IST
        monkeypatch.setattr(sched, "engine", test_engine)

        bot = _make_bot(db, "4f-b22-bot@trackmyread.com")
        reader = _make_user(db, email="4f-b22-reader@example.com", name="B22r")
        for u, token in ((bot, "ExponentPushToken[4f-b22-bot]"),
                         (reader, "ExponentPushToken[4f-b22-reader]")):
            u.timezone = "Asia/Kolkata"
            u.last_active = frozen - timedelta(days=2)
            db.add(u)
            db.add(models.PushToken(user_id=u.id, token=token, token_type="expo"))
        db.commit()

        spy = _Spy()
        monkeypatch.setattr(sched, "fire_event", spy)
        sched._send_inactivity_reminders()

        assert len(spy.calls) == 1, "the run must actually have fired — else this is vacuous"
        recipients = spy.calls[0]["recipient_ids"]
        assert reader.id in recipients               # CONTROL
        assert bot.id not in recipients


# ═══════════════════════════════════════════════════════════════════════════
# 2.6 The existing suite — R-02's last bullet, as amended by K-01
# ═══════════════════════════════════════════════════════════════════════════

ALLOWED_NEW_TOKENS = {"is_bot", "bot_users", "bot_notes"}
K01_ALLOWED_FILES = {"tests/test_notes.py", "tests/test_admin.py", "tests/test_groups.py"}
K01_MAX_CHANGED_ASSERTIONS = 14

# P1 finding, reported in build notes: K-01's list of 14 is incomplete. Three assertions in
# two OTHER files read app.schema_guard.REQUIRED_COLUMNS and break the moment any sprint
# appends to it — they are not about `is_bot` at all, so the token rule above cannot describe
# them. They are exempted by name, and the exemption is itself bounded: every added line in an
# exempt file must carry one of REWORK_MARKERS, so the exemption cannot quietly widen.
SCHEMA_GUARD_EXEMPT = {"tests/test_local_day.py", "tests/test_sql_artifacts.py"}
REWORK_MARKERS = ("REQUIRED_COLUMNS", "C4_PAIRS", "Sprint 4F", "#")


def _diff_violations(diff_text, exempt=frozenset()):
    """Return a list of complaints about a unified diff over tests/.

    A removed line must be matched by an added line in the same hunk that differs ONLY by
    tokens drawn from ALLOWED_NEW_TOKENS. A purely new file (all additions) is fine.
    """
    violations = []
    path = None
    removed, added = [], []

    def flush():
        if path in exempt:
            removed.clear()
            added.clear()
            return
        for line in removed:
            tokens = set(re.findall(r"[A-Za-z_][A-Za-z_0-9]*", line))
            match = None
            for cand in added:
                cand_tokens = set(re.findall(r"[A-Za-z_][A-Za-z_0-9]*", cand))
                if cand_tokens - tokens <= ALLOWED_NEW_TOKENS and tokens - cand_tokens == set():
                    match = cand
                    break
            if match is None:
                violations.append(f"{path}: deleted without an equivalent replacement: {line.strip()[:60]}")
            else:
                added.remove(match)
        removed.clear()
        added.clear()

    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            flush()
            path = line[6:]
        elif line.startswith("@@"):
            flush()
        elif line.startswith("-") and not line.startswith("---"):
            removed.append(line[1:])
        elif line.startswith("+") and not line.startswith("+++"):
            added.append(line[1:])
    flush()
    return violations


class TestExistingSuite:

    def test_only_the_new_key_was_added_to_tests(self):
        """B-23' (K-01). MUT-4F-28: delete tests/test_notes.py:1106 instead of amending it."""
        diff = subprocess.run(
            ["git", "diff", "origin/master...HEAD", "--", "tests/"],
            cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        assert diff.returncode == 0, f"git diff failed: {diff.stderr[:200]}"
        assert _diff_violations(diff.stdout, exempt=SCHEMA_GUARD_EXEMPT) == []

        # the exemption is bounded: every line added to an exempt file must carry a marker
        assert len(SCHEMA_GUARD_EXEMPT) == 2
        path = None
        for line in diff.stdout.splitlines():
            if line.startswith("+++ b/"):
                path = line[6:]
            elif line.startswith("+") and not line.startswith("+++") and path in SCHEMA_GUARD_EXEMPT:
                body = line[1:].strip()
                assert (not body) or any(mk in body for mk in REWORK_MARKERS), \
                    f"{path}: unbounded edit under the schema-guard exemption: {body[:70]}"

        # CONTROL (rule 3): the detector reports a hit on a synthetic diff that DELETES an
        # assertion instead of amending it.
        synthetic = (
            "--- a/tests/test_notes.py\n"
            "+++ b/tests/test_notes.py\n"
            "@@ -1104,7 +1104,6 @@\n"
            '-        assert set(row["user"].keys()) == {"id", "name"}\n'
        )
        assert len(_diff_violations(synthetic)) == 1

        # and the detector PASSES the amend-in-place shape K-01 permits
        permitted = (
            "--- a/tests/test_notes.py\n"
            "+++ b/tests/test_notes.py\n"
            "@@ -1104,7 +1104,7 @@\n"
            '-        assert set(row["user"].keys()) == {"id", "name"}\n'
            '+        assert set(row["user"].keys()) == {"id", "name", "is_bot"}\n'
        )
        assert _diff_violations(permitted) == []

    def test_changed_assertion_files_are_in_k01s_list(self):
        """B-23' second half: only K-01's three files may have EDITED lines under tests/."""
        diff = subprocess.run(
            ["git", "diff", "origin/master...HEAD", "--numstat", "--", "tests/"],
            cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        assert diff.returncode == 0
        edited = []
        for row in diff.stdout.splitlines():
            parts = row.split("\t")
            if len(parts) != 3:
                continue
            deletions, path = parts[1], parts[2].replace("\\", "/")
            if deletions not in ("0", "-"):
                edited.append((path, int(deletions)))
        for path, deletions in edited:
            assert (path in K01_ALLOWED_FILES or path in SCHEMA_GUARD_EXEMPT
                    or path == "tests/conftest.py"), \
                f"{path} has deleted lines and is not in K-01's list"
            if path in K01_ALLOWED_FILES:
                assert deletions <= K01_MAX_CHANGED_ASSERTIONS, \
                    f"{path}: {deletions} changed lines, K-01 allows at most 14 in total"
