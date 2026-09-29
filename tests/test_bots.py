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

# Third exemption, found when 4F was merged onto a master that already carried Sprint 4E.
# 4E's query-budget guard holds a measured number per endpoint. R-16 adds a `bot_users` and a
# `bot_notes` count to /admin/stats, so BQ-39 legitimately moves 15 -> 17 — a test edit no
# token rule can describe, because the changed token is a digit. The guard caught it on the
# merge, which is exactly its job; recording the bump here is the honest resolution, and
# widening the token rule to admit numbers would not be.
#
# Bounded the same way as the others: one file, and a replacing line must name the row it
# changes, so this cannot become a licence to re-baseline the table.
BUDGET_EXEMPT = {"tests/test_query_budget.py"}
BUDGET_MARKERS = ("BQ-39", "Row(\"39\"", "Sprint 4F", "#")


def _budget_marker_violations(diff_text):
    """Added lines in the budget file that REPLACE something and name no row.

    Same shape as _exempt_marker_violations: only a diff that removes something is policed,
    so adding a brand-new row costs nothing, while re-baselining an existing budget has to
    say which one it is moving.
    """
    removed = [l for l in diff_text.splitlines()
               if l.startswith("-") and not l.startswith("---")]
    if not removed:
        return []
    added = [l[1:].strip() for l in diff_text.splitlines()
             if l.startswith("+") and not l.startswith("+++")]
    return [a for a in added if a and not any(m in a for m in BUDGET_MARKERS)]


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


def _exempt_marker_violations(diff_text):
    """Added lines in a SCHEMA_GUARD_EXEMPT file that REPLACE something and carry no marker.

    P2 amendment, reported in build-notes-4f-p2.md: the original form required a marker on
    EVERY added line in an exempt file. That is right for the three forced schema_guard edits
    P1 made, and wrong for a whole new test class — which tests.md K-15 itself instructs a
    Builder to add to tests/test_sql_artifacts.py (case B-25b). A hunk with no removals adds a
    new test; it weakens nothing, and _diff_violations above is what guards removals. The
    marker rule is therefore scoped to hunks that actually replace a line.
    """
    violations = []
    path = None
    added, removed = [], []

    def flush():
        if path in SCHEMA_GUARD_EXEMPT and removed:
            for raw in added:
                body = raw.strip()
                if body and not any(mk in body for mk in REWORK_MARKERS):
                    violations.append(
                        f"{path}: unbounded edit under the schema-guard exemption: {body[:70]}")
        added.clear()
        removed.clear()

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
        else:
            # a context line ends the current edit group. Without this, git's 3-line context
            # merges an unrelated replacement and a wholly new block into ONE hunk, and the
            # new block inherits the replacement's marker requirement. Measured on this
            # branch: P1's C4_PAIRS rework and P2's appended TestBotSQL share a hunk.
            flush()
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

        # the exemption is bounded: a line that REPLACES something in an exempt file must
        # carry a marker, so the exemption cannot quietly widen into rewriting assertions.
        assert len(SCHEMA_GUARD_EXEMPT) == 2
        assert _exempt_marker_violations(diff.stdout) == []

        # CONTROL (rule 3): the marker rule still fires on a synthetic replacement that
        # carries no marker at all.
        unmarked = (
            "--- a/tests/test_local_day.py\n"
            "+++ b/tests/test_local_day.py\n"
            "@@ -10,3 +10,3 @@\n"
            "-        assert guard_passes is True\n"
            "+        assert True\n"
        )
        assert len(_exempt_marker_violations(unmarked)) == 1

        # ...and does NOT fire on a wholly new block that follows a context line, which is
        # what tests.md K-15 instructs a Builder to add to tests/test_sql_artifacts.py
        # (case B-25b). Measured on this branch: git's 3-line context merges P1's
        # C4_PAIRS rework and P2's appended TestBotSQL into one hunk.
        appended = (
            "--- a/tests/test_sql_artifacts.py\n"
            "+++ b/tests/test_sql_artifacts.py\n"
            "@@ -307,5 +307,8 @@\n"
            "-        for table, column in REQUIRED_COLUMNS:\n"
            "+        for table, column in C4_PAIRS:\n"
            "             assert column in step1\n"
            "+\n"
            "+class TestBotSQL:\n"
            "+    PM_SQL_QUEUE_PATH = 1\n"
        )
        assert _exempt_marker_violations(appended) == []

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
                    or path in BUDGET_EXEMPT
                    or path == "tests/conftest.py"), \
                f"{path} has deleted lines and is not in K-01's list"
            if path in K01_ALLOWED_FILES:
                assert deletions <= K01_MAX_CHANGED_ASSERTIONS, \
                    f"{path}: {deletions} changed lines, K-01 allows at most 14 in total"

        # Each exemption is bounded by name and by count, so neither can widen silently.
        assert len(SCHEMA_GUARD_EXEMPT) == 2
        assert len(BUDGET_EXEMPT) == 1

    def test_budget_exemption_lines_name_the_row_they_change(self):
        """B-23'c: a replacing line in the budget file must name the row it re-baselines.

        Without this, BUDGET_EXEMPT would licence re-measuring the whole table in a commit
        nobody reads. With it, moving a budget costs a line that says which budget moved.

        Note for whoever mutation-tests this: `git diff origin/master...HEAD` reads COMMITTED
        state, so editing the budget file in the working tree does not exercise this rule and
        will pass regardless. That is how I first "proved" it, wrongly. The controls below run
        the real function over synthetic diffs, which is the layer a mutation can reach.
        """
        diff = subprocess.run(
            ["git", "diff", "origin/master...HEAD", "--", "tests/test_query_budget.py"],
            cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        assert diff.returncode == 0
        assert _budget_marker_violations(diff.stdout) == []

        # CONTROL (rule 3): the SAME function must fail on a re-baseline that names no row.
        # Calling the function, not a copy of its logic — a control that re-implements the
        # rule tests the copy and passes while the rule itself is broken.
        unmarked = ('--- a/tests/test_query_budget.py\n+++ b/tests/test_query_budget.py\n'
                    '-    Row("08", "GET /notes/feed", "signed in", RATCHET, 8, 8, "8",\n'
                    '+    Row("08", "GET /notes/feed", "signed in", RATCHET, 99, 99, "8",\n')
        assert _budget_marker_violations(unmarked) != [], \
            "the marker rule cannot fail, so its pass proves nothing"

        # CONTROL: and it must NOT over-fire on a properly annotated bump.
        marked = ('--- a/tests/test_query_budget.py\n+++ b/tests/test_query_budget.py\n'
                  '-    Row("39", "GET /admin/stats", "—", RATCHET, 15, 15, "15",\n'
                  '+    # BQ-39 raised for Sprint 4F R-16\n'
                  '+    Row("39", "GET /admin/stats", "—", RATCHET, 17, 17, "15",\n')
        assert _budget_marker_violations(marked) == []

        # CONTROL: a pure addition — a brand-new row, nothing replaced — is always fine and
        # needs no marker. Added because without it, deleting the `if not removed` guard in
        # _budget_marker_violations passed every other control in this test: they all happen
        # to contain a removal, so none of them could see the difference.
        pure_addition = ('--- a/tests/test_query_budget.py\n+++ b/tests/test_query_budget.py\n'
                         '+    Row("45", "GET /something/new", "—", RATCHET, 4, 4, "4",\n')
        assert _budget_marker_violations(pure_addition) == []


# ═══════════════════════════════════════════════════════════════════════════
# Package P2 — serialisation, the cap, metrics, the atomic dedup
#
# Requirements R-02, R-07, R-13, R-15, R-16. Case ids are tests.md §3's.
#
# Import guard for the P2 symbols (rule 5 / K-07) — a missing or renamed symbol is ONE loud
# collection error here, never N silent skips further down.
# ═══════════════════════════════════════════════════════════════════════════
from typing import List                                    # noqa: E402
from app.routers import bots_router, notes_router          # noqa: E402
from app.routers.notes_router import NoteCreateSchema, NoteOutSchema   # noqa: E402

assert callable(bots_router.bots_posted)
assert callable(notes_router.create_note)
assert isinstance(notes_router.BOT_MAX_NOTES_PER_DAY, int)
assert isinstance(notes_router.BOT_CONTENT_TYPES, tuple)
assert "commit" in inspect.signature(crud.create_note).parameters
assert "dedup_key" in NoteCreateSchema.__fields__


def _book(db, title="4F Book"):
    b = models.Book(title=title, author="A. Author")
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


def _userbook(db, user_id, title="4F Book"):
    ub = models.UserBook(user_id=user_id, book_id=_book(db, title).id, status="reading")
    db.add(ub)
    db.commit()
    db.refresh(ub)
    return ub


def _follow(db, follower_id, followed_id):
    db.add(models.Follow(follower_id=follower_id, followed_id=followed_id))
    db.commit()


def _aged_note(db, user_id, hours_ago, now, text="aged"):
    """A public note whose created_at is placed `hours_ago` before the frozen instant."""
    note = models.Note(user_id=user_id, text=text, is_public=True,
                       created_at=now - timedelta(hours=hours_ago))
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


# ═══════════════════════════════════════════════════════════════════════════
# 3.1 The cap — R-13
# ═══════════════════════════════════════════════════════════════════════════

class TestBotCap:

    def test_third_post_in_24h_is_429(self, client, db):
        """B-13. MUT-4F-29: raise BOT_MAX_NOTES_PER_DAY to 99."""
        bot = _make_bot(db, "4f-b13-bot@trackmyread.com", name="B13")
        h = _auth(bot)
        body = {"text": "B13 post", "is_public": True}
        assert client.post("/notes/", json=body, headers=h).status_code == 201
        assert client.post("/notes/", json=body, headers=h).status_code == 201
        third = client.post("/notes/", json=body, headers=h)
        assert third.status_code == 429, third.text
        # the 429 wrote nothing — the count is the assertion, not the status code
        assert _count(db, models.Note, models.Note.user_id == bot.id) == 2

    def test_reader_third_post_succeeds(self, client, db):
        """B-14 (rule 1 — the control for B-13). MUT-4F-30: drop `current_user.is_bot` from the
        cap block, so the cap runs for everyone."""
        reader = _make_user(db, email="4f-b14-reader@example.com", name="B14")
        h = _auth(reader)
        for i in range(3):
            r = client.post("/notes/", json={"text": f"B14 {i}", "is_public": True}, headers=h)
            assert r.status_code == 201, (i, r.text)
        assert _count(db, models.Note, models.Note.user_id == reader.id) == 3

    def test_window_slides(self, client, db, freeze_at):
        """B-15. MUT-4F-31: widen the window to all time."""
        now = freeze_at("2026-09-23T12:00:00")
        old_bot = _make_bot(db, "4f-b15-old@trackmyread.com", name="B15old")
        _aged_note(db, old_bot.id, 25, now)
        _aged_note(db, old_bot.id, 25, now)
        r = client.post("/notes/", json={"text": "B15 fresh", "is_public": True},
                        headers=_auth(old_bot))
        assert r.status_code == 201, r.text

        # CONTROL: 23 h old is inside the window, so the same shape is refused
        recent_bot = _make_bot(db, "4f-b15-recent@trackmyread.com", name="B15new")
        _aged_note(db, recent_bot.id, 23, now)
        _aged_note(db, recent_bot.id, 23, now)
        r2 = client.post("/notes/", json={"text": "B15 capped", "is_public": True},
                         headers=_auth(recent_bot))
        assert r2.status_code == 429, r2.text
        assert _count(db, models.Note, models.Note.user_id == recent_bot.id) == 2

    def test_429_is_raised_before_the_note_is_written(self, client, db, stmt_counter,
                                                      monkeypatch):
        """B-15a. MUT-4F-32: move the cap check below the crud.create_note call."""
        bot = _make_bot(db, "4f-b15a-bot@trackmyread.com", name="B15a")
        h = _auth(bot)
        for i in range(2):
            assert client.post("/notes/", json={"text": f"B15a {i}", "is_public": True},
                               headers=h).status_code == 201
        before = _count(db, models.Note, models.Note.user_id == bot.id)

        spy = _Spy()
        monkeypatch.setattr(notes_router, "fire_group_activity_for_user", spy)
        stmt_counter.reset()
        r = client.post("/notes/", json={"text": "B15a third", "is_public": True}, headers=h)
        assert r.status_code == 429
        assert stmt_counter.inserts == 0
        assert _count(db, models.Note, models.Note.user_id == bot.id) == before
        assert spy.calls == []

    def test_reader_pays_nothing_for_the_cap(self, client, db):
        """B-33 (K-09). MUT-4F-30: drop `current_user.is_bot` from the cap block.

        The cap must cost a reader NOTHING, so the reader's statement count is pinned against a
        literal and the bot's is pinned one higher. The difference is asserted as well as both
        absolute numbers, and the reader's number is cross-checked against the Server-Timing
        header, so a change in how the count is taken cannot hide a change in the count.
        """
        from sqlalchemy import event
        import tests.conftest as _tc

        reader = _make_user(db, email="4f-b33-reader@example.com", name="B33r")
        bot = _make_bot(db, "4f-b33-bot@trackmyread.com", name="B33b")
        rh, bh = _auth(reader), _auth(bot)
        # warm both: the once-a-local-day last_active write at deps.py:87 is out of the way
        assert client.post("/notes/", json={"text": "warm r", "is_public": True},
                           headers=rh).status_code == 201
        assert client.post("/notes/", json={"text": "warm b", "is_public": True},
                           headers=bh).status_code == 201

        def _count_statements(headers, is_public=True):
            seen = []
            listener = lambda *a, **k: seen.append(1)
            event.listen(_tc.engine, "before_cursor_execute", listener)
            try:
                resp = client.post("/notes/", json={"text": "B33", "is_public": is_public},
                                   headers=headers)
            finally:
                event.remove(_tc.engine, "before_cursor_execute", listener)
            assert resp.status_code == 201, resp.text
            m = re.search(r'desc="(\d+) queries"', resp.headers.get("server-timing", ""))
            assert m, f"missing Server-Timing header: {resp.headers.get('server-timing')!r}"
            return len(seen), int(m.group(1))

        reader_queries, reader_header = _count_statements(rh)
        bot_queries, _ = _count_statements(bh)

        assert reader_queries == 5, f"a reader's POST /notes/ now runs {reader_queries}"
        assert bot_queries == 6, f"a bot's POST /notes/ now runs {bot_queries}"
        assert bot_queries - reader_queries == 1

        # Cross-check against the header the service reports (F-68), so a change in HOW the
        # count is taken cannot hide a change in the count.
        #
        # Builder finding: tests.md B-33 says the header "parses to the same 5". It does not,
        # and cannot: ServerTimingMiddleware stamps the header when the response is built,
        # while the public-post path queues fire_group_activity_for_user as a BackgroundTask
        # that runs one more statement afterwards. Measured on this branch: 5 statements, a
        # header of 4. Both halves are pinned rather than one being dropped.
        assert reader_header == 4, f"header reported {reader_header}"
        assert reader_queries - reader_header == 1, "the group-activity background statement"

        # A PRIVATE post queues no background task, so there the two measures must agree
        # exactly — that is the case where the cross-check is a real tie.
        private_queries, private_header = _count_statements(rh, is_public=False)
        assert private_queries == 4, f"a reader's private POST now runs {private_queries}"
        assert private_header == private_queries


# ═══════════════════════════════════════════════════════════════════════════
# 3.2 `is_bot` everywhere — R-02
# ═══════════════════════════════════════════════════════════════════════════

# The seven note-serialising sites, BY ROUTE PATH. tests.md K-04: spec R-02's line numbers are
# right but two of its labels are not — `notes_router.py:380` is /notes/me (not friends-feed)
# and `:606` is friends-feed's ONLY shape (not a "second shape"). Verified again on this
# branch: the decorators sit at :324 /feed, :400 /me, :461 /user/{id}, :536 /userbook/{id},
# :580 /friends-feed. This inventory is discovered from app.routes, so a mislabelled document
# cannot produce a test that skips a site.
EXPECTED_NOTE_ROUTES = {
    ("POST", "/notes/"),
    ("PUT", "/notes/{note_id}"),
    ("GET", "/notes/feed"),
    ("GET", "/notes/me"),
    ("GET", "/notes/user/{user_id}"),
    ("GET", "/notes/userbook/{userbook_id}"),
    ("GET", "/notes/friends-feed"),
}

# The pre-4F `user` key set at each site, from tests/test_notes.py:1106-1110 and the handlers.
PRE_4F_USER_KEYS = {
    ("POST", "/notes/"): {"id", "name"},
    ("PUT", "/notes/{note_id}"): {"id", "name"},
    ("GET", "/notes/feed"): {"id", "name", "username", "profile_picture"},
    ("GET", "/notes/me"): {"id", "name", "username", "profile_picture"},
    ("GET", "/notes/user/{user_id}"): {"id", "name"},
    ("GET", "/notes/userbook/{userbook_id}"): {"id", "name"},
    ("GET", "/notes/friends-feed"): {"id", "name", "username", "profile_picture", "is_mutual"},
}


# The nine NON-note author objects R-02 requires. Written out as a literal so a site that is
# silently dropped from the walk fails the count before anything is checked about contents
# (rules 2 and 4) — a sub-case that quietly stops running would otherwise pass.
#
# `GET /users/following` is here on a PM ruling (2026-09-23) on this Builder's Finding 9. It is
# not in spec R-02's list, but R-03 badges the sidebar following list (HomePage.jsx:655) and
# R-05 explicitly permits a reader to follow a bot — "the prohibition is one-directional". So a
# bot genuinely appears there, and without the field the badge would read undefined forever.
# That is the opposite resolution to K-05's HomePage.jsx:704, where a bot can never appear.
#
# `GET /groups/{group_id}/members` is here on the same PM's ruling of 2026-09-23. A bot can
# never reach a circle (R-05, and spec §"Not building"), so on its own that would be a K-05
# "drop the badge" case — but R-03 commissions the badge at GroupDetailPage.jsx:965 *with its
# reason attached*: "the badge is added so that a future mistake is visible rather than
# silent". A defence-in-depth claim the code does not keep is worse than no claim, because the
# next reader believes the document. One boolean is the whole cost of honouring it.
OTHER_AUTHOR_SITES = (
    "GET /profile/{user_id}",
    "GET /users/search",
    "GET /users/following",
    "POST /notes/{note_id}/comments",
    "GET /notes/{note_id}/comments",
    "GET /groups/{group_id}/posts",
    "POST /groups/{group_id}/posts",
    "GET /groups/{group_id}/activity",
    "GET /groups/{group_id}/members",
)


def _note_route_inventory():
    """Every APIRoute under /notes whose response model is NoteOutSchema or a list of it."""
    found = set()
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith("/notes"):
            continue
        model = route.response_model
        if model is NoteOutSchema or model == List[NoteOutSchema]:
            for method in route.methods:
                found.add((method, route.path))
    return found


def _seven_site_user_dicts(client, db, author, tag):
    """The `user` dict this author produces at all seven note-serialising sites.

    One note does all seven: it is public (feed, friends-feed, /user/{id}), owned by the author
    (/me, POST, PUT) and attached to a userbook (/userbook/{id}). A bot can post only twice in
    24 h (R-13), so one note is also all the budget there is.
    """
    viewer = _make_user(db, email="4f-" + tag + "-viewer@example.com", name=tag[:8] + "V")
    _follow(db, viewer.id, author.id)          # viewer follows author -> friends-feed is fed
    ah, vh = _auth(author), _auth(viewer)
    ub = _userbook(db, author.id, title="4F " + tag)

    created = client.post("/notes/", json={"text": tag + " note", "is_public": True,
                                           "userbook_id": ub.id}, headers=ah)
    assert created.status_code == 201, created.text
    note_id = created.json()["id"]

    updated = client.put("/notes/" + str(note_id), json={"text": tag + " edited"}, headers=ah)
    assert updated.status_code == 200, updated.text

    def pick(rows, where):
        row = next((n for n in rows if n["id"] == note_id), None)
        assert row is not None, where + ": the note did not surface — the walk would be vacuous"
        return row["user"]

    out = {
        ("POST", "/notes/"): created.json()["user"],
        ("PUT", "/notes/{note_id}"): updated.json()["user"],
    }
    for key, url, headers in (
        (("GET", "/notes/feed"), "/notes/feed?limit=200", vh),
        (("GET", "/notes/me"), "/notes/me?limit=200", ah),
        (("GET", "/notes/user/{user_id}"), "/notes/user/" + str(author.id), vh),
        (("GET", "/notes/userbook/{userbook_id}"), "/notes/userbook/" + str(ub.id), ah),
        (("GET", "/notes/friends-feed"), "/notes/friends-feed?limit=200", vh),
    ):
        r = client.get(url, headers=headers)
        assert r.status_code == 200, (url, r.text)
        out[key] = pick(r.json(), url)

    assert set(out) == EXPECTED_NOTE_ROUTES, "a site was not reached"
    return out


class TestSerialisation:

    def test_note_route_inventory_is_complete(self):
        """B-16a (rules 2 and 4). MUT-4F-33: add an 8th route returning NoteOutSchema.

        The inventory is asserted against a literal BEFORE anything is checked about contents,
        so an eighth note route cannot escape B-16 by simply not being in a hand-written list.
        """
        found = _note_route_inventory()
        assert len(found) == 7, \
            "expected 7 note-serialising routes, found %d: %s" % (len(found), sorted(found))
        assert found == EXPECTED_NOTE_ROUTES, sorted(found ^ EXPECTED_NOTE_ROUTES)
        assert set(PRE_4F_USER_KEYS) == EXPECTED_NOTE_ROUTES

    def test_is_bot_present_and_boolean_at_every_note_site(self, client, db):
        """B-16. MUT-4F-34: remove `is_bot` from notes_router.py:318 (/notes/feed)."""
        assert _note_route_inventory() == EXPECTED_NOTE_ROUTES     # walk the discovered set
        bot = _make_bot(db, "4f-b16-bot@trackmyread.com", name="B16b")
        reader = _make_user(db, email="4f-b16-reader@example.com", name="B16r")

        for author, expected, tag in ((bot, True, "b16bot"), (reader, False, "b16reader")):
            dicts = _seven_site_user_dicts(client, db, author, tag)
            assert sorted(dicts) == sorted(EXPECTED_NOTE_ROUTES)
            for site, user in dicts.items():
                assert "is_bot" in user, (site, user)
                assert isinstance(user["is_bot"], bool), (site, repr(user["is_bot"]))
                assert user["is_bot"] is expected, site

    def test_is_bot_on_the_other_author_objects(self, client, db):
        """B-17. MUT-4F-35: remove `is_bot` from profile_router.py's `base` dict.
        MUT-4F-35b: remove it from users_router.py's FollowingUser.

        Every author object R-02 requires that is NOT a note. The walk collects first and
        asserts its inventory against OTHER_AUTHOR_SITES before it checks any value, so a
        sub-case that stops producing rows fails the count rather than passing on nothing.
        """
        bot = _make_bot(db, "4f-b17-bot@trackmyread.com", name="B17Bot")
        reader = _make_user(db, email="4f-b17-reader@example.com", name="B17Reader")
        rh = _auth(reader)
        found = {}

        def record(label, user_dict, expected):
            found.setdefault(label, []).append((label, user_dict, expected))

        # (1) GET /profile/{user_id}
        for target, expected in ((bot, True), (reader, False)):
            body_ = client.get("/profile/" + str(target.id), headers=rh)
            assert body_.status_code == 200, body_.text
            data = body_.json()
            assert data["id"] == target.id          # CONTROL: a real payload, not {}
            record("GET /profile/{user_id}", data, expected)

        # (2) GET /users/search
        results = client.get("/users/search?q=B17", headers=rh).json()
        assert len(results) >= 1, "the search returned nothing — the sub-case would be vacuous"
        by_id = {u["id"]: u for u in results}
        assert bot.id in by_id, "the bot is not in the search results"
        record("GET /users/search", by_id[bot.id], True)
        _make_user(db, email="4f-b17-other@example.com", name="B17Reader2")
        other_row = client.get("/users/search?q=B17Reader2", headers=rh).json()[0]
        record("GET /users/search", other_row, False)

        # (3) GET /users/following. A reader following a BOT is allowed and unchanged — R-05's
        # prohibition is one-directional — so this is a surface where a reader really does meet
        # a bot account, which is why it carries the field and the badge (PM, 2026-09-23).
        followee = _make_user(db, email="4f-b17-followee@example.com", name="B17Followee")
        assert client.post("/follow/" + str(bot.id), headers=rh).status_code == 200
        assert client.post("/follow/" + str(followee.id), headers=rh).status_code == 200
        following = client.get("/users/following", headers=rh).json()
        assert len(following) >= 2, following
        following_by_id = {u["id"]: u for u in following}
        assert bot.id in following_by_id and followee.id in following_by_id
        record("GET /users/following", following_by_id[bot.id], True)
        record("GET /users/following", following_by_id[followee.id], False)

        # (4) the comment author on CREATE (likes_comments.py:157). A bot cannot reach this
        # route at all — deny_bot_actor 403s it (R-05) — so only the reader half exists here,
        # and the bot half is covered on the list shape below.
        note = _public_note(db, reader.id, text="B17 note")
        created = client.post("/notes/" + str(note.id) + "/comments",
                              json={"text": "hi"}, headers=rh)
        assert created.status_code == 201, created.text
        record("POST /notes/{note_id}/comments", created.json()["user"], False)

        # (5) the comment author on LIST (likes_comments.py:192). The bot's comment row is
        # written directly, because R-05 makes it unreachable through the API — which is
        # exactly the accident this field is here to render visibly.
        db.add(models.Comment(note_id=note.id, user_id=bot.id, text="bot comment"))
        db.commit()
        listed = client.get("/notes/" + str(note.id) + "/comments", headers=rh).json()
        assert len(listed) == 2, listed
        for row in listed:
            record("GET /notes/{note_id}/comments", row["user"],
                   row["user"]["id"] == bot.id)

        # (6)(7) the two group post shapes, and (8) group activity
        gid = client.post("/groups/", json={"name": "B17 Circle", "is_private": False,
                                            "description": "d"}, headers=rh).json()["id"]
        posted = client.post("/groups/" + str(gid) + "/posts",
                             json={"text": "reader post"}, headers=rh)
        assert posted.status_code == 201, posted.text
        record("POST /groups/{group_id}/posts", posted.json()["user"], False)   # :883

        db.add(models.GroupMember(group_id=gid, user_id=bot.id, role="member", status="active"))
        db.add(models.GroupPost(group_id=gid, user_id=bot.id, text="bot group post"))
        db.add(models.GroupActivity(group_id=gid, user_id=bot.id, event_type="member_joined"))
        db.add(models.GroupActivity(group_id=gid, user_id=reader.id, event_type="member_joined"))
        db.commit()

        posts = client.get("/groups/" + str(gid) + "/posts", headers=rh).json()  # :844
        assert len(posts) == 2, posts
        for row in posts:
            record("GET /groups/{group_id}/posts", row["user"], row["user"]["id"] == bot.id)

        activity = client.get("/groups/" + str(gid) + "/activity", headers=rh).json()  # :1129
        assert len(activity) >= 2, activity
        for row in activity:
            if row["user"]:
                record("GET /groups/{group_id}/activity", row["user"],
                       row["user"]["id"] == bot.id)

        # (9) the circle member row (groups_router.py:585-613). The bot was inserted as a
        # member directly above, which is the only way it can be one — R-05 keeps it out of
        # every circle. That is exactly the "future mistake" R-03's badge at
        # GroupDetailPage.jsx:965 exists to render visibly. Note the row keys the caller by
        # `user_id`, not `id`.
        members = client.get("/groups/" + str(gid) + "/members", headers=rh).json()
        assert len(members) == 2, members
        member_ids = {m["user_id"] for m in members}
        assert member_ids == {bot.id, reader.id}, member_ids
        for row in members:
            record("GET /groups/{group_id}/members", row, row["user_id"] == bot.id)

        # ── the inventory, BEFORE any value is checked ──────────────────────
        assert len(OTHER_AUTHOR_SITES) == 9
        assert len(found) == 9, \
            "reached %d of the 9 author sites: missing %s" % (
                len(found), sorted(set(OTHER_AUTHOR_SITES) - set(found)))
        assert sorted(found) == sorted(OTHER_AUTHOR_SITES)

        # ── and only now, the values ────────────────────────────────────────
        saw_bot = saw_reader = False
        for label, rows in found.items():
            assert rows, label
            for _, user, expected in rows:
                assert "is_bot" in user, (label, sorted(user))
                assert isinstance(user["is_bot"], bool), (label, repr(user["is_bot"]))
                assert user["is_bot"] is expected, label
                saw_bot = saw_bot or expected
                saw_reader = saw_reader or not expected
        assert saw_bot and saw_reader, "both a bot and a reader must have been exercised"

    def test_reader_is_false_never_null_never_absent(self, client, db):
        """B-18. MUT-4F-36: emit `getattr(user, "is_bot", None)`.

        Identity, not truthiness — None and 0 must both fail, because a client branches on this
        without a fallback.
        """
        reader = _make_user(db, email="4f-b18-reader@example.com", name="B18r")
        for site, user in _seven_site_user_dicts(client, db, reader, "b18").items():
            assert user["is_bot"] is False, (site, repr(user["is_bot"]))
        profile = client.get("/profile/" + str(reader.id), headers=_auth(reader)).json()
        assert profile["is_bot"] is False

    def test_bot_is_true_at_every_site(self, client, db):
        """B-18a. MUT-4F-37: emit the literal `False`.

        The positive half of B-18: a hard-coded False passes B-18 and fails here.
        """
        bot = _make_bot(db, "4f-b18a-bot@trackmyread.com", name="B18a")
        for site, user in _seven_site_user_dicts(client, db, bot, "b18a").items():
            assert user["is_bot"] is True, (site, repr(user["is_bot"]))
        profile = client.get("/profile/" + str(bot.id), headers=_auth(bot)).json()
        assert profile["is_bot"] is True

    def test_existing_keys_are_untouched(self, client, db):
        """B-32. MUT-4F-38: rename `username` to `user_name` at one site.

        R-02's last bullet: no existing key changes name, type or value. The expected set is
        computed as OLD | {"is_bot"}, so a renamed or dropped key is caught as well as a
        missing addition.
        """
        reader = _make_user(db, email="4f-b32-reader@example.com", name="B32r")
        dicts = _seven_site_user_dicts(client, db, reader, "b32")
        assert len(dicts) == 7
        for site, user in dicts.items():
            assert set(user) == PRE_4F_USER_KEYS[site] | {"is_bot"}, site


# ═══════════════════════════════════════════════════════════════════════════
# 3.3 Atomic dedup — R-07, R-15
# ═══════════════════════════════════════════════════════════════════════════

class TestDedup:

    def test_fresh_key_creates_note_and_bot_post_together(self, client, db):
        """B-26. MUT-4F-39: drop `db.add(models.BotPost(...))` from the dedup branch."""
        bot = _make_bot(db, "4f-b26-bot@trackmyread.com", name="B26")
        key = "bestseller:9780593321447"
        r = client.post("/notes/", json={"text": "B26 teaser", "is_public": True,
                                         "dedup_key": key}, headers=_auth(bot))
        assert r.status_code == 201, r.text
        note_id = r.json()["id"]

        rows = db.exec(select(BotPost).where(BotPost.dedup_key == key)).all()
        assert len(rows) == 1, rows
        row = rows[0]
        assert row.content_type == "bestseller"
        assert row.dedup_key == key
        assert row.bot_email == bot.email
        assert row.note_id == note_id

        note = db.get(models.Note, note_id)
        assert note is not None and note.is_public is True

    def test_duplicate_key_is_409_and_creates_no_note(self, client, db):
        """B-27. MUT-4F-40: catch IntegrityError without `db.rollback()`.

        The COUNT is the assertion, not the status code: a 409 that leaves an orphan note is
        exactly the failure this whole design exists to prevent.
        """
        bot = _make_bot(db, "4f-b27-bot@trackmyread.com", name="B27")
        h = _auth(bot)
        key = "prompt:41"
        assert client.post("/notes/", json={"text": "B27 first", "is_public": True,
                                            "dedup_key": key}, headers=h).status_code == 201

        notes_before = _count(db, models.Note)
        bot_posts_before = _count(db, BotPost)

        r = client.post("/notes/", json={"text": "B27 SECOND TEXT", "is_public": True,
                                         "dedup_key": key}, headers=h)
        assert r.status_code == 409, r.text
        assert _count(db, models.Note) == notes_before
        assert _count(db, BotPost) == bot_posts_before
        assert db.exec(select(models.Note)
                       .where(models.Note.text == "B27 SECOND TEXT")).first() is None

    def test_409_raises_before_the_group_activity_task(self, client, db, monkeypatch):
        """B-27a. MUT-4F-41: move the dedup block below the group-activity hook.

        R-15's ordering claim is about REGISTRATION, not execution: `background_tasks.add_task`
        must never be reached on the 409 path. Asserting only that the task never RAN cannot
        see the difference — Starlette drops a response's background tasks when the handler
        raises, so a hook registered and then abandoned looks identical from the outside.
        (Measured: MUT-4F-41 as tests.md words it stays green against that weaker assertion.)
        So both are asserted: the registration, and the call.
        """
        from fastapi import BackgroundTasks

        bot = _make_bot(db, "4f-b27a-bot@trackmyread.com", name="B27a")
        h = _auth(bot)
        key = "quote:12"

        spy = _Spy()
        monkeypatch.setattr(notes_router, "fire_group_activity_for_user", spy)

        registered = []
        original_add = BackgroundTasks.add_task

        def recording_add(self, func, *args, **kwargs):
            registered.append(func)
            return original_add(self, func, *args, **kwargs)

        monkeypatch.setattr(BackgroundTasks, "add_task", recording_add)

        first = client.post("/notes/", json={"text": "B27a first", "is_public": True,
                                            "dedup_key": key}, headers=h)
        assert first.status_code == 201, first.text
        assert registered.count(spy) == 1, "CONTROL: the 201 path DOES register the hook"
        assert len(spy.calls) == 1, "CONTROL: and runs it"

        second = client.post("/notes/", json={"text": "B27a second", "is_public": True,
                                             "dedup_key": key}, headers=h)
        assert second.status_code == 409
        assert registered.count(spy) == 1, "the 409 must not even register the hook"
        assert len(spy.calls) == 1, "and must certainly not run it"

    def test_reader_dedup_key_is_silently_ignored(self, client, db, caplog):
        """B-28 (K-14). MUT-4F-42: honour dedup_key without the `current_user.is_bot` guard.

        The key used here is one a BOT has already used, so honouring it would 409.
        """
        bot = _make_bot(db, "4f-b28-bot@trackmyread.com", name="B28b")
        key = "circles:2026-W39"
        assert client.post("/notes/", json={"text": "B28 bot", "is_public": True,
                                            "dedup_key": key},
                           headers=_auth(bot)).status_code == 201

        reader = _make_user(db, email="4f-b28-reader@example.com", name="B28r")
        rh = _auth(reader)
        before = _count(db, BotPost)
        caplog.clear()
        with_key = client.post("/notes/", json={"text": "B28 reader", "is_public": True,
                                               "dedup_key": key}, headers=rh)
        assert with_key.status_code == 201, with_key.text
        assert _count(db, BotPost) == before
        assert "dedup" not in caplog.text.lower()

        # the body is the same shape as one posted without the key at all
        without_key = client.post("/notes/", json={"text": "B28 reader 2", "is_public": True},
                                  headers=rh)
        assert without_key.status_code == 201
        assert set(with_key.json()) == set(without_key.json())

    def test_put_note_ignores_dedup_key(self, client, db):
        """B-28a. MUT-4F-43: make NoteCreateSchema forbid extra fields.

        NoteCreateSchema is shared by POST /notes/ and PUT /notes/{id} (notes_router.py's own
        F-17 comment says so), and PUT has no dedup concept at all.
        """
        reader = _make_user(db, email="4f-b28a-reader@example.com", name="B28a")
        h = _auth(reader)
        note_id = client.post("/notes/", json={"text": "B28a original", "is_public": True},
                              headers=h).json()["id"]
        before = _count(db, BotPost)
        r = client.put("/notes/" + str(note_id),
                       json={"text": "edited", "dedup_key": "prompt:1"}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["text"] == "edited"
        assert _count(db, BotPost) == before

    def test_unknown_content_type_prefix_is_422_for_a_bot(self, client, db):
        """B-32b. MUT-4F-44: accept any dedup_key prefix.

        Bot-only field, no old-client compatibility to protect, so failing loudly is free
        (architecture §"One field, not two").
        """
        bot = _make_bot(db, "4f-b32b-bot@trackmyread.com", name="B32b")
        h = _auth(bot)
        for bad in ("whatever:1", "nocolon"):
            before = _count(db, models.Note)
            r = client.post("/notes/", json={"text": "B32b " + bad, "is_public": True,
                                             "dedup_key": bad}, headers=h)
            assert r.status_code == 422, (bad, r.status_code, r.text)
            assert _count(db, models.Note) == before, bad

        # CONTROL: all four known prefixes are accepted. One bot per prefix, because R-13 caps
        # a single bot at two posts a day.
        for prefix in notes_router.BOT_CONTENT_TYPES:
            good_bot = _make_bot(db, "4f-b32b-" + prefix + "@trackmyread.com", name="B32b" + prefix)
            r = client.post("/notes/", json={"text": "B32b ok " + prefix, "is_public": True,
                                             "dedup_key": prefix + ":ok"},
                            headers=_auth(good_bot))
            assert r.status_code == 201, (prefix, r.text)


def _visible_in_another_session(note_id):
    """Is this note readable from a SECOND, independent Session — i.e. was it committed?

    On the shared-cache in-memory SQLite the suite runs on, an UNcommitted INSERT holds a write
    lock on `note`, so a second connection cannot even read the table and raises
    OperationalError("database table is locked"). Committed or not is what is being measured,
    and both outcomes answer it: a lock means not committed, a row means committed.
    """
    from sqlalchemy.exc import OperationalError
    from sqlmodel import Session
    with Session(test_engine) as other:
        try:
            return other.get(models.Note, note_id) is not None
        except OperationalError:
            return False


class TestCrud:

    def test_create_note_default_still_commits(self, db):
        """B-30. MUT-4F-45: flip the default to `commit=False` at crud.py.

        The default must keep every existing caller byte-identical, so it is read from the
        signature as well as proved by a second, independent Session.
        """
        from sqlmodel import Session
        assert inspect.signature(crud.create_note).parameters["commit"].default is True
        user = _make_user(db, email="4f-b30-user@example.com", name="B30")
        note = crud.create_note(db, user_id=user.id, text="B30 committed", is_public=True)
        assert note.id is not None
        with Session(test_engine) as other:
            found = other.get(models.Note, note.id)
            assert found is not None, "the row was not committed"
            assert found.text == "B30 committed"

    def test_create_note_commit_false_flushes_without_committing(self, db):
        """B-30a. MUT-4F-46: implement commit=False as a commit anyway (or as skipping the add)."""
        user = _make_user(db, email="4f-b30a-user@example.com", name="B30a")
        note = crud.create_note(db, user_id=user.id, text="B30a pending", is_public=True,
                                commit=False)
        assert note.id is not None, "flush() must have assigned the SERIAL id"
        note_id = note.id
        assert _visible_in_another_session(note_id) is False, "the row was committed"
        db.rollback()
        assert db.get(models.Note, note_id) is None
        assert _visible_in_another_session(note_id) is False


def _seed_editorial_post(db, isbn, title="Legacy", posted_at=None):
    """editorial_post predates SQLModel (migrations/add_editorial_bot.py) and has no model, so
    it is created and seeded with raw SQL exactly as the migration does."""
    from sqlalchemy import text as _sql
    db.exec(_sql("""
        CREATE TABLE IF NOT EXISTS editorial_post (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            nyt_isbn   TEXT NOT NULL UNIQUE,
            book_title TEXT NOT NULL,
            note_id    INTEGER,
            posted_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )"""))
    when = (posted_at or datetime.utcnow()).strftime("%Y-%m-%d %H:%M:%S")
    db.exec(_sql("INSERT OR IGNORE INTO editorial_post (nyt_isbn, book_title, posted_at) "
                 "VALUES (:i, :t, :p)").bindparams(i=isbn, t=title, p=when))
    db.commit()


class TestBotsPosted:

    def test_bots_posted_guard_and_union(self, client, db):
        """B-29. MUT-4F-47: read only bot_post (drop the legacy union). MUT-4F-48: drop the
        is_bot check on the route."""
        bot = _make_bot(db, "4f-b29-bot@trackmyread.com", name="B29b")
        reader = _make_user(db, email="4f-b29-reader@example.com", name="B29r")
        db.add(BotPost(bot_email=bot.email, content_type="bestseller",
                       dedup_key="bestseller:B29A", posted_at=datetime.utcnow()))
        db.commit()
        _seed_editorial_post(db, "B29LEGACY")

        assert client.get("/bots/posted?content_type=bestseller").status_code == 401
        assert client.get("/bots/posted?content_type=bestseller",
                          headers=_auth(reader)).status_code == 403

        r = client.get("/bots/posted?content_type=bestseller", headers=_auth(bot))
        assert r.status_code == 200, r.text
        keys = set(r.json()["dedup_keys"])
        assert {"bestseller:B29A", "bestseller:B29LEGACY"} <= keys, sorted(keys)

    def test_since_filters_and_content_type_scopes(self, client, db, freeze_at):
        """B-29a. MUT-4F-49: ignore `since`; or ignore `content_type`."""
        now = freeze_at("2026-09-23T12:00:00")
        bot = _make_bot(db, "4f-b29a-bot@trackmyread.com", name="B29a")
        db.add(BotPost(bot_email=bot.email, content_type="bestseller",
                       dedup_key="bestseller:B29A-OLD", posted_at=now - timedelta(days=200)))
        db.add(BotPost(bot_email=bot.email, content_type="bestseller",
                       dedup_key="bestseller:B29A-NEW", posted_at=now - timedelta(days=10)))
        db.add(BotPost(bot_email=bot.email, content_type="prompt",
                       dedup_key="prompt:B29A-P", posted_at=now - timedelta(days=10)))
        db.commit()

        since = (now - timedelta(days=90)).isoformat()
        h = _auth(bot)
        body = client.get("/bots/posted?content_type=bestseller&since=" + since, headers=h)
        assert body.status_code == 200, body.text
        keys = set(body.json()["dedup_keys"])
        assert "bestseller:B29A-NEW" in keys
        assert "bestseller:B29A-OLD" not in keys, "since was ignored"
        assert "prompt:B29A-P" not in keys, "content_type was ignored"

        # content_type scopes without `since` too
        all_bestsellers = set(client.get("/bots/posted?content_type=bestseller",
                                         headers=h).json()["dedup_keys"])
        assert {"bestseller:B29A-OLD", "bestseller:B29A-NEW"} <= all_bestsellers
        assert "prompt:B29A-P" not in all_bestsellers

        unknown = client.get("/bots/posted?content_type=nonsense", headers=h)
        assert unknown.status_code == 200, unknown.text
        assert unknown.json() == {"dedup_keys": []}

    def test_route_does_not_carry_deny_bot_actor(self):
        """B-29b (K-16). MUT-4F-50: add Depends(deny_bot_actor) to bots_router.

        Two dependencies with opposite senses and similar names are a mistake waiting to
        happen: deny_bot_actor 403s a BOT, this route 403s a READER. Adding the dependency here
        would invert the route, and B-12a's `len == 4` inventory is the other half of the pair.
        """
        matches = [r for r in app.routes
                   if isinstance(r, APIRoute) and r.path == "/bots/posted"]
        assert len(matches) == 1, matches
        deps = set(_dependency_calls(matches[0].dependant))
        assert deps, "the walk found no dependencies at all — it would pass vacuously"
        assert deny_bot_actor not in deps


# ═══════════════════════════════════════════════════════════════════════════
# 3.4 Metrics — R-16
# ═══════════════════════════════════════════════════════════════════════════

class TestAdminMetrics:

    def test_reader_counts_do_not_move_when_a_bot_posts(self, client, db, admin_headers):
        """B-19. MUT-4F-51: drop the filter on total_users. MUT-4F-52: drop it on total_notes."""
        before = client.get("/admin/stats", headers=admin_headers).json()

        bot = _make_bot(db, "4f-b19-bot@trackmyread.com", name="B19b")
        assert client.post("/notes/", json={"text": "B19 bot post", "is_public": True},
                           headers=_auth(bot)).status_code == 201
        after_bot = client.get("/admin/stats", headers=admin_headers).json()

        for key in ("total_users", "new_users_this_week", "new_users_this_month", "total_notes"):
            assert after_bot[key] == before[key], key
        assert after_bot["bot_users"] == before["bot_users"] + 1
        assert after_bot["bot_notes"] == before["bot_notes"] + 1

        # CONTROL (rule 1): a READER moves the same numbers, so "identical" is not "frozen"
        reader = _make_user(db, email="4f-b19-reader@example.com", name="B19r")
        assert client.post("/notes/", json={"text": "B19 reader post", "is_public": True},
                           headers=_auth(reader)).status_code == 201
        after_reader = client.get("/admin/stats", headers=admin_headers).json()
        assert after_reader["total_users"] == after_bot["total_users"] + 1
        assert after_reader["total_notes"] == after_bot["total_notes"] + 1
        assert after_reader["bot_users"] == after_bot["bot_users"]
        assert after_reader["bot_notes"] == after_bot["bot_notes"]

        # K-11: the two independent copies of the /admin/stats key set must not drift apart
        import tests.test_admin as ta
        source = inspect.getsource(ta.TestAdminAccess.test_stats_has_push_subscribed_users_distinct_count)
        inline = set(re.findall(r'"([a-z_]+)"', source.split("set(data.keys()) ==")[1]))
        assert inline == ta.TestAdminRegression.STATS_KEYS, sorted(inline ^ ta.TestAdminRegression.STATS_KEYS)
        assert set(after_bot) == ta.TestAdminRegression.STATS_KEYS

    def test_bot_users_and_bot_notes_are_the_excluded_figures(self, client, db, admin_headers):
        """B-19b. MUT-4F-53: make bot_users count all users.

        R-16: nothing disappears. reader + bot must add back up to the whole table.
        """
        b1 = _make_bot(db, "4f-b19b-bot1@trackmyread.com", name="B19b1")
        b2 = _make_bot(db, "4f-b19b-bot2@trackmyread.com", name="B19b2")
        before = client.get("/admin/stats", headers=admin_headers).json()
        for i in range(2):
            assert client.post("/notes/", json={"text": "b1 %d" % i, "is_public": True},
                               headers=_auth(b1)).status_code == 201
        assert client.post("/notes/", json={"text": "b2 0", "is_public": True},
                           headers=_auth(b2)).status_code == 201

        after = client.get("/admin/stats", headers=admin_headers).json()
        assert after["bot_users"] == before["bot_users"], "no new bot rows were created here"
        assert after["bot_notes"] == before["bot_notes"] + 3

        assert after["total_users"] + after["bot_users"] == _count(db, models.User)
        assert after["total_notes"] + after["bot_notes"] == _count(db, models.Note)
        assert after["bot_users"] >= 2

    def test_unfiltered_counters_are_documented(self, client, db, admin_headers):
        """B-19c (Q-1). A tripwire, not a coverage case.

        total_likes / total_comments / total_userbooks / total_journals are deliberately NOT
        filtered by is_bot, because a bot creates none of them: it cannot like or comment
        (R-05), has no userbooks and writes no journal. This test records that assumption. Give
        a bot any of those rows and it goes red — which is the point.
        """
        bot = _make_bot(db, "4f-b19c-bot@trackmyread.com", name="B19c")
        before = client.get("/admin/stats", headers=admin_headers).json()
        assert client.post("/notes/", json={"text": "B19c post", "is_public": True},
                           headers=_auth(bot)).status_code == 201
        after = client.get("/admin/stats", headers=admin_headers).json()
        for key in ("total_likes", "total_comments", "total_userbooks", "total_journals"):
            assert after[key] == before[key], key

        for model, column in ((models.Like, models.Like.user_id),
                              (models.Comment, models.Comment.user_id),
                              (models.UserBook, models.UserBook.user_id)):
            assert _count(db, model, column == bot.id) == 0, model.__name__
        assert _count(db, models.Note, models.Note.user_id == bot.id) == 1   # it DID post

    def test_admin_lists_carry_is_bot(self, client, db, admin_headers):
        """B-20. MUT-4F-54: remove is_bot from UserSummary."""
        bot = _make_bot(db, "4f-b20-bot@trackmyread.com", name="B20b")
        reader = _make_user(db, email="4f-b20-reader@example.com", name="B20r")
        assert client.post("/notes/", json={"text": "B20 bot", "is_public": True},
                           headers=_auth(bot)).status_code == 201
        assert client.post("/notes/", json={"text": "B20 reader", "is_public": True},
                           headers=_auth(reader)).status_code == 201

        users = client.get("/admin/users?limit=200", headers=admin_headers).json()
        assert users, "the user list is empty — the walk would be vacuous"
        by_id = {u["id"]: u for u in users}
        assert bot.id in by_id and reader.id in by_id, "CONTROL: both accounts are listed"
        for row in users:
            assert isinstance(row["is_bot"], bool), row
        assert by_id[bot.id]["is_bot"] is True
        assert by_id[reader.id]["is_bot"] is False

        notes = client.get("/admin/content/notes?limit=200", headers=admin_headers).json()
        assert notes, "the note list is empty — the walk would be vacuous"
        authors = {row["user_id"]: row["is_bot"] for row in notes}
        for row in notes:
            assert isinstance(row["is_bot"], bool), row
        assert authors[bot.id] is True
        assert authors[reader.id] is False


# ═══════════════════════════════════════════════════════════════════════════
# 2.5 What is removed — R-16 / architecture §7 (reassigned to P2: it needs admin_router.py)
# ═══════════════════════════════════════════════════════════════════════════

class TestRemovedRoutes:

    def test_admin_bot_trigger_is_gone(self, client, admin_headers):
        """B-24. MUT-4F-27: restore POST /admin/bot/trigger.

        It shelled out to editorial_bot.py on the API host with subprocess. Its replacement is
        the workflow's workflow_dispatch button (R-14).
        """
        r = client.post("/admin/bot/trigger", headers=admin_headers)
        assert r.status_code == 404, r.text
        spec = client.get("/openapi.json").json()
        assert "/admin/bot/trigger" not in spec["paths"]
        # CONTROL: the same admin, on the same router, still works
        assert client.get("/admin/stats", headers=admin_headers).status_code == 200
