"""Tests for /follow/*, /profile/*, /users/* endpoints."""
import logging

import pytest
from tests.conftest import _make_user, _auth


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
