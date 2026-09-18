"""Tests for /follow/*, /profile/*, /users/* endpoints."""
import asyncio
import json as _json
import logging

import pytest
from sqlmodel import select

from app import models
from app.main import app as _app
from tests.conftest import _make_user, _auth


# ── F-59 ordering helper — see tests/test_notes.py for why a raw ASGI call is needed
#    instead of the TestClient fixture (it waits for background tasks before returning). ──

def _asgi_order(method, path, headers, body, events):
    raw = _json.dumps(body).encode() if body is not None else b""
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
             "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"", "root_path": "",
             "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]
                        + [(b"content-type", b"application/json"), (b"host", b"testserver")],
             "client": ("testclient", 50000), "server": ("testserver", 80)}
    state = {"sent": False, "status": None}

    async def receive():
        if not state["sent"]:
            state["sent"] = True
            return {"type": "http.request", "body": raw, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(msg):
        if msg["type"] == "http.response.start":
            events.append("response.start")
            state["status"] = msg["status"]

    asyncio.run(_app(scope, receive, send))
    return state["status"]


class TestFollow:
    def test_follow_user(self, client, db):
        alice = _make_user(db, email="fol_alice@example.com")
        bob = _make_user(db, email="fol_bob@example.com")
        r = client.post(f"/follow/{bob.id}", headers=_auth(alice))
        assert r.status_code == 200

    def test_unfollow_user(self, client, db):
        alice = _make_user(db, email="unfol_alice@example.com")
        bob = _make_user(db, email="unfol_bob@example.com")
        client.post(f"/follow/{bob.id}", headers=_auth(alice))
        r = client.delete(f"/follow/{bob.id}", headers=_auth(alice))
        assert r.status_code == 200

    def test_cannot_follow_self(self, client, db):
        user = _make_user(db, email="self_follow@example.com")
        r = client.post(f"/follow/{user.id}", headers=_auth(user))
        assert r.status_code in (400, 422)

    def test_double_follow_idempotent(self, client, db):
        alice = _make_user(db, email="dfol_alice@example.com")
        bob = _make_user(db, email="dfol_bob@example.com")
        client.post(f"/follow/{bob.id}", headers=_auth(alice))
        r = client.post(f"/follow/{bob.id}", headers=_auth(alice))
        assert r.status_code in (200, 400)  # not a 500

    def test_follow_nonexistent_user(self, client, alice_headers):
        r = client.post("/follow/999999", headers=alice_headers)
        assert r.status_code == 404

    def test_follow_updates_is_following_in_profile(self, client, db):
        alice = _make_user(db, email="fol_check_alice@example.com")
        bob = _make_user(db, email="fol_check_bob@example.com")
        client.post(f"/follow/{bob.id}", headers=_auth(alice))
        r = client.get(f"/profile/{bob.id}", headers=_auth(alice))
        assert r.json()["is_following"] is True

    def test_follows_you_field(self, client, db):
        alice = _make_user(db, email="fy_alice@example.com")
        bob = _make_user(db, email="fy_bob@example.com")
        # Bob follows Alice
        client.post(f"/follow/{alice.id}", headers=_auth(bob))
        # Alice views Bob's profile
        r = client.get(f"/profile/{bob.id}", headers=_auth(alice))
        assert r.json()["follows_you"] is True

    def test_requires_auth(self, client, db):
        bob = _make_user(db, email="fol_noauth_bob@example.com")
        r = client.post(f"/follow/{bob.id}")
        assert r.status_code == 401


class TestProfile:
    def test_get_own_profile(self, client, db):
        user = _make_user(db, email="own_profile@example.com", name="MyName")
        r = client.get("/profile/me", headers=_auth(user))
        assert r.status_code == 200
        assert r.json()["name"] == "MyName"
        assert "stats" in r.json()

    def test_update_own_profile(self, client, db):
        user = _make_user(db, email="update_profile@example.com")
        r = client.put("/profile/me", json={"bio": "I love books", "yearly_goal": 24}, headers=_auth(user))
        assert r.status_code == 200
        assert r.json()["bio"] == "I love books"
        assert r.json()["yearly_goal"] == 24

    def test_get_public_profile(self, client, db):
        alice = _make_user(db, email="pub_profile_alice@example.com")
        bob = _make_user(db, email="pub_profile_bob@example.com")
        r = client.get(f"/profile/{bob.id}", headers=_auth(alice))
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == bob.id
        assert "followers_count" in data
        assert "is_following" in data
        assert "follows_you" in data
        assert "yearly_goal" in data

    def test_private_profile_locked_for_non_followers(self, client, db):
        alice = _make_user(db, email="priv_alice@example.com")
        bob = _make_user(db, email="priv_bob@example.com")
        # Make Bob's profile private
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(bob))
        r = client.get(f"/profile/{bob.id}", headers=_auth(alice))
        assert r.status_code == 200
        assert r.json()["locked"] is True
        assert r.json()["stats"] is None

    def test_private_profile_visible_to_follower(self, client, db):
        alice = _make_user(db, email="priv_fol_alice@example.com")
        bob = _make_user(db, email="priv_fol_bob@example.com")
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(bob))
        client.post(f"/follow/{bob.id}", headers=_auth(alice))
        r = client.get(f"/profile/{bob.id}", headers=_auth(alice))
        assert r.json()["locked"] is False
        assert r.json()["stats"] is not None

    def test_get_nonexistent_profile(self, client, alice_headers):
        r = client.get("/profile/999999", headers=alice_headers)
        assert r.status_code == 404

    def test_profile_stats_counts_correct(self, client, db):
        user = _make_user(db, email="stats_count@example.com")
        h = _auth(user)
        client.post("/books/add-to-library", json={"title": "B1", "total_pages": 100, "status": "finished"}, headers=h)
        client.post("/books/add-to-library", json={"title": "B2", "total_pages": 100, "status": "reading"}, headers=h)
        r = client.get("/profile/me", headers=h)
        stats = r.json()["stats"]
        assert stats["finished"] >= 1
        assert stats["reading"] >= 1

    # ── F-18 — a yearly goal can be cleared ──────────────────────────────────

    def test_put_yearly_goal_null_clears(self, client, db):
        user = _make_user(db, email="f18_null_clears@example.com")
        h = _auth(user)
        r1 = client.put("/profile/me", json={"yearly_goal": 24}, headers=h)
        assert r1.status_code == 200
        assert r1.json()["yearly_goal"] == 24
        r2 = client.put("/profile/me", json={"yearly_goal": None}, headers=h)
        assert r2.status_code == 200
        assert r2.json()["yearly_goal"] is None
        assert client.get("/profile/me", headers=h).json()["yearly_goal"] is None

    def test_put_yearly_goal_zero_clears(self, client, db):
        user = _make_user(db, email="f18_zero_clears@example.com")
        h = _auth(user)
        client.put("/profile/me", json={"yearly_goal": 24}, headers=h)
        r = client.put("/profile/me", json={"yearly_goal": 0}, headers=h)
        assert r.status_code == 200
        assert r.json()["yearly_goal"] is None

    def test_put_without_yearly_goal_keeps_it(self, client, db):
        user = _make_user(db, email="f18_keeps_it@example.com")
        h = _auth(user)
        client.put("/profile/me", json={"yearly_goal": 24}, headers=h)
        for body in ({"bio": "F18 bio"}, {"name": "F18", "bio": "b"}, {"is_private_profile": False}):
            r = client.put("/profile/me", json=body, headers=h)
            assert r.status_code == 200
            assert r.json()["yearly_goal"] == 24

    def test_insights_goal_null_after_clear(self, client, db):
        user = _make_user(db, email="f18_insights_null@example.com")
        h = _auth(user)
        client.put("/profile/me", json={"yearly_goal": 12}, headers=h)
        insights = client.get("/reading-activity/insights", headers=h).json()
        assert isinstance(insights["yearly_goal"], dict)
        client.put("/profile/me", json={"yearly_goal": None}, headers=h)
        insights2 = client.get("/reading-activity/insights", headers=h).json()
        assert insights2["yearly_goal"] is None

    # ── F-55 — bad avatar uploads return 400 ─────────────────────────────────

    def _configure_cloudinary(self, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "test-cloud")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "test-key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "test-secret")

    def test_avatar_rejected_image_400(self, client, db, monkeypatch):
        import cloudinary.exceptions
        self._configure_cloudinary(monkeypatch)
        user = _make_user(db, email="f55_avatar_rejected@example.com")

        def _raise(*a, **k):
            raise cloudinary.exceptions.BadRequest("Invalid image file")

        monkeypatch.setattr("cloudinary.uploader.upload", _raise)
        r = client.post(
            "/profile/me/picture",
            files={"file": ("evil.png", b"plain text", "image/png")},
            headers=_auth(user),
        )
        assert r.status_code == 400
        assert r.json() == {"detail": "Invalid image file"}

        db.expire_all()
        from app import crud
        row = crud.get_user_by_email(db, "f55_avatar_rejected@example.com")
        assert not row.profile_picture

    def test_avatar_empty_file_400(self, client, db, monkeypatch):
        calls = []
        self._configure_cloudinary(monkeypatch)
        user = _make_user(db, email="f55_avatar_empty@example.com")
        monkeypatch.setattr("cloudinary.uploader.upload", lambda *a, **k: calls.append(1))
        r = client.post(
            "/profile/me/picture",
            files={"file": ("empty.png", b"", "image/png")},
            headers=_auth(user),
        )
        assert r.status_code == 400
        assert r.json() == {"detail": "File is empty"}
        assert calls == []


# ── §9 R-07 — cross-package regression: follow + profile ───────────────────────────────

class TestProfileRegression:
    def test_put_profile_other_fields_unchanged(self, client, db):
        """R-07: name, bio, is_private_profile and profile_picture round-trip through
        PUT /profile/me; setting is_private_profile still gates /profile/{id},
        /notes/user/{id} and /users/{id}/stats for a non-follower (F-18 changes only the
        yearly_goal branch). NOTE: /profile/{id} itself gates by returning 200 with
        {"locked": true, "stats": None} (see test_private_profile_locked_for_non_followers
        above), not a 403 — tests.md §9 R-07 says all three "gate ... at 403", which does not
        match /profile/{id}'s actual (pre-existing, untouched-by-this-sprint) behaviour.
        Asserted verbatim per task instructions; see build-notes-regression.md."""
        a = _make_user(db, email="r07_a@example.com")
        b = _make_user(db, email="r07_b@example.com")
        ha, hb = _auth(a), _auth(b)

        r = client.put("/profile/me", json={
            "name": "R07 Name", "bio": "R07 bio",
            "is_private_profile": True, "profile_picture": "https://example.com/r07.png",
        }, headers=hb)
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "R07 Name"
        assert body["bio"] == "R07 bio"
        assert body["is_private_profile"] is True
        assert body["profile_picture"] == "https://example.com/r07.png"

        get_body = client.get("/profile/me", headers=hb).json()
        assert get_body["name"] == "R07 Name"
        assert get_body["bio"] == "R07 bio"
        assert get_body["is_private_profile"] is True
        assert get_body["profile_picture"] == "https://example.com/r07.png"

        # is_private_profile still gates all three for a non-follower. Corrected 2026-09-18
        # (tests.md §9 R-07 said 403 for all three): /profile/{id} has always gated by
        # returning the public card with locked=true and stats=None, identically at beb7058
        # before 4A; the content endpoints are the ones that 403.
        prof = client.get(f"/profile/{b.id}", headers=ha)
        assert prof.status_code == 200
        assert prof.json()["locked"] is True
        assert prof.json()["stats"] is None
        assert client.get(f"/notes/user/{b.id}", headers=ha).status_code == 403
        assert client.get(f"/users/{b.id}/stats", headers=ha).status_code == 403


class TestUserSearch:
    def test_search_finds_user(self, client, db):
        searcher = _make_user(db, email="search_searcher@example.com")
        target = _make_user(db, email="search_target@example.com", name="Findme User")
        r = client.get("/users/search?q=Findme", headers=_auth(searcher))
        assert r.status_code == 200
        assert any(u["id"] == target.id for u in r.json())

    def test_search_excludes_self(self, client, db):
        user = _make_user(db, email="search_self@example.com", name="SelfSearch")
        r = client.get("/users/search?q=SelfSearch", headers=_auth(user))
        assert not any(u["id"] == user.id for u in r.json())

    def test_search_empty_query_returns_empty(self, client, alice_headers):
        r = client.get("/users/search?q=", headers=alice_headers)
        assert r.status_code == 200
        assert r.json() == []


class TestProfileMeNoPII:
    """R5 — /profile/me no longer logs PII; response shape unchanged."""

    def test_profile_me_logs_no_email(self, client, db, caplog):
        user = _make_user(db, email="pii_probe_unique@example.com", name="PII Probe")
        with caplog.at_level(logging.WARNING):
            r = client.get("/profile/me", headers=_auth(user))
        assert r.status_code == 200
        assert not any("pii_probe_unique@example.com" in rec.getMessage() for rec in caplog.records)
        assert "pii_probe_unique@example.com" not in caplog.text
        assert "/profile/me response" not in caplog.text

    def test_profile_me_response_shape_unchanged(self, client, db):
        user = _make_user(db, email="shape_probe@example.com")
        r = client.get("/profile/me", headers=_auth(user))
        assert r.status_code == 200
        data = r.json()
        assert set(data.keys()) == {
            "id", "name", "username", "email", "bio", "profile_picture", "yearly_goal",
            "created_at", "followers_count", "following_count", "stats", "is_admin",
            "is_private_profile",
        }
        assert set(data["stats"].keys()) == {
            "total_books", "totalBooks", "finished", "reading", "to_read", "toRead",
            "total_pages_read", "totalPagesRead",
        }
        assert isinstance(data["followers_count"], int)
        assert isinstance(data["following_count"], int)

    def test_profile_me_logs_no_pii_at_debug_level(self, client, db, caplog):
        user = _make_user(db, email="pii_probe_debug@example.com")
        client.put("/profile/me", json={"bio": "pii-probe-bio-marker"}, headers=_auth(user))
        with caplog.at_level(logging.DEBUG):
            r = client.get("/profile/me", headers=_auth(user))
        assert r.status_code == 200
        assert "pii_probe_debug@example.com" not in caplog.text
        assert "pii-probe-bio-marker" not in caplog.text

    def test_public_profile_shape_unchanged(self, client, db):
        a = _make_user(db, email="pubshape_a@example.com")
        b = _make_user(db, email="pubshape_b@example.com")
        r = client.get(f"/profile/{b.id}", headers=_auth(a))
        assert r.status_code == 200
        data = r.json()
        assert data["stats"] is not None
        assert "follows_you" in data
        assert "yearly_goal" in data

        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(b))
        r2 = client.get(f"/profile/{b.id}", headers=_auth(a))
        assert r2.status_code == 200
        data2 = r2.json()
        assert data2["stats"] is None
        assert data2["locked"] is True

    def test_follow_still_writes_notification_log(self, client, db):
        from sqlmodel import select
        from app import models
        a = _make_user(db, email="followlog_a@example.com")
        b = _make_user(db, email="followlog_b@example.com")
        client.post(f"/follow/{b.id}", headers=_auth(a))
        db.expire_all()
        rows = db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == b.id)
            .where(models.NotificationLog.event_type == "new_follower")
        ).all()
        assert any(r.actor_id == a.id for r in rows)


class TestPushAfterResponse:
    """F-59 — a follow returns before push delivery, via BackgroundTasks."""

    def test_follow_returns_before_push_delivery(self, client, db, monkeypatch):
        import app.notifications.dispatcher as dispatcher
        events = []
        monkeypatch.setattr(dispatcher, "send_expo_push", lambda *a, **k: events.append("push.expo"))
        monkeypatch.setattr(dispatcher, "send_web_push", lambda *a, **k: events.append("push.web"))

        a = _make_user(db, email="f59_follow_a@example.com")
        b = _make_user(db, email="f59_follow_b@example.com")

        status = _asgi_order("POST", f"/follow/{b.id}", _auth(a), None, events)
        assert status == 200
        assert events.index("response.start") < events.index("push.expo")
        assert events.index("response.start") < events.index("push.web")

        db.expire_all()
        rows = db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == b.id)
            .where(models.NotificationLog.event_type == "new_follower")
            .where(models.NotificationLog.actor_id == a.id)
        ).all()
        assert len(rows) == 1
