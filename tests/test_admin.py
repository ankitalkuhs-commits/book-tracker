"""Tests for /admin/* endpoints — access control + content moderation."""
import pytest
from sqlmodel import select
from app import models
from tests.conftest import _make_user, _auth


def _create_note(client, headers, text="Admin test note"):
    return client.post("/notes/", json={"text": text, "is_public": True}, headers=headers)


_BODY = {"title": "T46 Announcement", "body": "We shipped something."}


def _give_token(db, user, token_type="expo", token=None):
    db.add(models.PushToken(user_id=user.id, token=token or f"ExponentPushToken[adm-{user.id}]",
                            token_type=token_type))
    db.commit()
    db.expire_all()


def _distinct_token_user_ids(db):
    db.expire_all()
    return set(db.exec(select(models.PushToken.user_id)).all())


def _broadcast_rows(db, user_id):
    db.expire_all()
    return db.exec(select(models.NotificationLog)
                   .where(models.NotificationLog.user_id == user_id)
                   .where(models.NotificationLog.event_type == "admin_broadcast")).all()


class TestAdminAccess:
    def test_non_admin_cannot_access_admin_endpoints(self, client, alice_headers):
        r = client.get("/admin/stats", headers=alice_headers)
        assert r.status_code == 403

    def test_unauthenticated_cannot_access_admin(self, client):
        r = client.get("/admin/stats")
        assert r.status_code == 401

    def test_admin_can_access_stats(self, client, admin_headers):
        r = client.get("/admin/stats", headers=admin_headers)
        assert r.status_code == 200

    def test_admin_can_delete_any_note(self, client, db, admin_headers):
        user = _make_user(db, email="adm_del_note@example.com")
        note_id = _create_note(client, _auth(user)).json()["id"]
        r = client.delete(f"/admin/content/note/{note_id}", headers=admin_headers)
        assert r.status_code == 200

    def test_admin_can_delete_any_comment(self, client, db, admin_headers):
        owner = _make_user(db, email="adm_del_com_owner@example.com")
        commenter = _make_user(db, email="adm_del_com_commenter@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        comment = client.post(f"/notes/{note_id}/comments", json={"text": "Spammy"}, headers=_auth(commenter))
        comment_id = comment.json()["id"]
        r = client.delete(f"/admin/content/comment/{comment_id}", headers=admin_headers)
        assert r.status_code == 200

    def test_non_admin_cannot_delete_comment(self, client, db, alice_headers):
        owner = _make_user(db, email="adm_nonadm_owner@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        comment = client.post(f"/notes/{note_id}/comments", json={"text": "Comment"}, headers=_auth(owner))
        comment_id = comment.json()["id"]
        r = client.delete(f"/admin/content/comment/{comment_id}", headers=alice_headers)
        assert r.status_code == 403

    def test_delete_nonexistent_note(self, client, admin_headers):
        r = client.delete("/admin/content/note/999999", headers=admin_headers)
        assert r.status_code == 404

    # ── F-26 support: push_subscribed_users (T-A2-43) ───────────────────────

    def test_stats_has_push_subscribed_users_distinct_count(self, client, db, admin_headers):
        a = _make_user(db, email="f26_stats_a@example.com")
        b = _make_user(db, email="f26_stats_b@example.com")
        _give_token(db, a, token_type="expo")
        _give_token(db, a, token_type="web", token='{"endpoint": "https://fcm.googleapis.com/fcm/send/f26a", "keys": {}}')
        _give_token(db, b, token_type="web", token='{"endpoint": "https://fcm.googleapis.com/fcm/send/f26b", "keys": {}}')
        expected = len(_distinct_token_user_ids(db))
        r = client.get("/admin/stats", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert set(data.keys()) == {
            "books_being_read", "books_completed", "books_wishlist", "new_users_this_month",
            "new_users_this_week", "total_books", "total_comments", "total_follows",
            "total_journals", "total_likes", "total_notes", "total_userbooks", "total_users",
            "push_subscribed_users",
        }
        assert data["push_subscribed_users"] == expected

    # ── F-51: bounded admin list limits (T-A2-44) ────────────────────────────

    def test_admin_list_limit_bounds_422(self, client, alice_headers, admin_headers):
        for path in ["/admin/users", "/admin/books", "/admin/follows", "/admin/content/notes", "/admin/content/comments"]:
            for limit, expected in [(0, 422), (-1, 422), (201, 422), (200, 200)]:
                r = client.get(f"{path}?limit={limit}", headers=admin_headers)
                assert r.status_code == expected, f"{path}?limit={limit}"
            assert client.get(path, headers=alice_headers).status_code == 403


# ── §9 R-17 — cross-package regression: admin dashboard ─────────────────────

class TestAdminRegression:
    STATS_KEYS = {
        "books_being_read", "books_completed", "books_wishlist", "new_users_this_month",
        "new_users_this_week", "total_books", "total_comments", "total_follows",
        "total_journals", "total_likes", "total_notes", "total_userbooks", "total_users",
        "push_subscribed_users",
    }
    USER_KEYS = {"id", "name", "username", "email", "is_admin", "books_count",
                 "followers_count", "following_count", "created_at", "last_active",
                 "deletion_requested_at", "deletion_reason"}
    BOOK_KEYS = {"id", "title", "author", "users_reading", "users_completed",
                 "total_users", "added_by_users"}
    FOLLOW_KEYS = {"follower_id", "follower_name", "followed_id", "followed_name", "created_at"}
    NOTE_KEYS = {"id", "user_id", "user_name", "text", "quote", "emotion",
                 "is_public", "created_at", "likes_count", "comments_count"}
    COMMENT_KEYS = {"id", "note_id", "user_id", "user_name", "text", "created_at"}

    def test_stats_and_lists_unchanged(self, client, db, admin_headers, alice_headers):
        """R-17: the 13 measured /admin/stats keys are all still present alongside
        push_subscribed_users; the five list routes return their existing shapes at
        their default limits; a non-admin still gets 403 on all six."""
        stats = client.get("/admin/stats", headers=admin_headers)
        assert stats.status_code == 200
        assert set(stats.json().keys()) == self.STATS_KEYS

        users = client.get("/admin/users", headers=admin_headers)
        assert users.status_code == 200
        assert all(set(u.keys()) == self.USER_KEYS for u in users.json())

        books = client.get("/admin/books", headers=admin_headers)
        assert books.status_code == 200
        assert all(set(b.keys()) == self.BOOK_KEYS for b in books.json())

        follows = client.get("/admin/follows", headers=admin_headers)
        assert follows.status_code == 200
        assert all(set(f.keys()) == self.FOLLOW_KEYS for f in follows.json())

        notes = client.get("/admin/content/notes", headers=admin_headers)
        assert notes.status_code == 200
        assert all(set(n.keys()) == self.NOTE_KEYS for n in notes.json())

        comments = client.get("/admin/content/comments", headers=admin_headers)
        assert comments.status_code == 200
        assert all(set(c.keys()) == self.COMMENT_KEYS for c in comments.json())

        for path in ("/admin/stats", "/admin/users", "/admin/books", "/admin/follows",
                     "/admin/content/notes", "/admin/content/comments"):
            assert client.get(path, headers=alice_headers).status_code == 403, path


# ── F-26: Make Admin (T-A2-45..49) ───────────────────────────────────────────

class TestSetAdmin:
    def test_set_admin_allowlisted_email_200(self, client, db, admin_headers):
        target = _make_user(db, email="ankitalkuhs@gmail.com", name="Allowlisted")
        r = client.post(f"/admin/set-admin/{target.id}?is_admin=true", headers=admin_headers)
        assert r.status_code == 200
        assert r.json() == {
            "message": "Admin status granted for user ankitalkuhs@gmail.com",
            "user_id": target.id, "is_admin": True,
        }
        db.expire_all()
        assert db.get(models.User, target.id).is_admin is True
        # teardown: revoke so this fixture user doesn't leak admin access to other tests
        r2 = client.post(f"/admin/set-admin/{target.id}?is_admin=false", headers=admin_headers)
        assert r2.status_code == 200

    def test_set_admin_non_allowlisted_email_403(self, client, db, admin_headers):
        target = _make_user(db, email="f26_not_allowed@example.com")
        r = client.post(f"/admin/set-admin/{target.id}?is_admin=true", headers=admin_headers)
        assert r.status_code == 403
        assert r.json() == {"detail": "This account is not permitted to hold admin access"}
        db.expire_all()
        assert db.get(models.User, target.id).is_admin is False

    def test_set_admin_missing_is_admin_query_422(self, client, db, admin_headers):
        target = _make_user(db, email="f26_missing_query@example.com")
        r = client.post(f"/admin/set-admin/{target.id}", headers=admin_headers)
        assert r.status_code == 422
        db.expire_all()
        assert db.get(models.User, target.id).is_admin is False

    def test_set_admin_non_admin_caller_403(self, client, db, alice_headers):
        target = _make_user(db, email="ankitalkuhs2@gmail.com")
        r = client.post(f"/admin/set-admin/{target.id}?is_admin=true", headers=alice_headers)
        assert r.status_code == 403
        assert r.json() == {"detail": "Admin access required"}

    def test_revoke_admin_allowed_200(self, client, db, admin_headers):
        target = _make_user(db, email="f26_revoke@example.com", is_admin=True)
        r = client.post(f"/admin/set-admin/{target.id}?is_admin=false", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["is_admin"] is False


class TestAdminBroadcast:
    """R7 — POST /admin/push/broadcast reaches every channel, per-user NotificationLog."""

    @pytest.fixture(autouse=True)
    def _patch_push(self, monkeypatch):
        monkeypatch.setattr("app.routers.admin_router.send_expo_push", lambda db, user_id, title, body, data: None)
        monkeypatch.setattr("app.routers.admin_router.send_web_push", lambda db, user_id, title, body, data: None)

    def test_broadcast_sent_to_counts_distinct_users(self, client, db, admin_headers):
        a = _make_user(db, email="bcast_a@example.com")
        b = _make_user(db, email="bcast_b@example.com")
        _give_token(db, a)
        _give_token(db, b)
        expected = len(_distinct_token_user_ids(db))
        r = client.post("/admin/push/broadcast", json=_BODY, headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["sent_to"] == expected
        assert f"{expected} user(s)" in data["message"]

    def test_broadcast_forbidden_for_non_admin(self, client, db, alice_headers, alice):
        before = _broadcast_rows(db, alice.id)
        r = client.post("/admin/push/broadcast", json=_BODY, headers=alice_headers)
        assert r.status_code == 403
        assert _broadcast_rows(db, alice.id) == before

    def test_broadcast_requires_auth(self, client, db):
        r = client.post("/admin/push/broadcast", json=_BODY)
        assert r.status_code == 401

    def test_broadcast_writes_notification_log_per_user(self, client, db, admin_headers):
        u1 = _make_user(db, email="bcast_log1@example.com")
        u2 = _make_user(db, email="bcast_log2@example.com")
        _give_token(db, u1, token_type="expo")
        _give_token(db, u2, token_type="web", token='{"endpoint": "https://fcm.googleapis.com/fcm/send/x", "keys": {}}')
        body = {"title": "T49 Title", "body": "T49 Body"}
        r = client.post("/admin/push/broadcast", json=body, headers=admin_headers)
        assert r.status_code == 200
        for u in (u1, u2):
            rows = _broadcast_rows(db, u.id)
            assert len(rows) >= 1
            row = rows[-1]
            assert row.actor_id is not None
            assert row.title == "T49 Title"
            assert row.body == "T49 Body"
            assert row.data["type"] == "admin_broadcast"

    def test_broadcast_counts_dual_channel_user_once(self, client, db, admin_headers):
        u = _make_user(db, email="bcast_dual@example.com")
        _give_token(db, u, token_type="expo")
        _give_token(db, u, token_type="web", token='{"endpoint": "https://fcm.googleapis.com/fcm/send/y", "keys": {}}')
        expected = len(_distinct_token_user_ids(db))
        rows_before = len(_broadcast_rows(db, u.id))
        r = client.post("/admin/push/broadcast", json=_BODY, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["sent_to"] == expected
        assert len(_broadcast_rows(db, u.id)) == rows_before + 1

    def test_broadcast_with_no_tokens_returns_zero(self, client, db, admin_headers):
        for t in db.exec(select(models.PushToken)).all():
            db.delete(t)
        db.commit()
        db.expire_all()
        r = client.post("/admin/push/broadcast", json=_BODY, headers=admin_headers)
        assert r.status_code == 200
        assert r.json() == {"message": "No registered push tokens found", "sent_to": 0}

    def test_broadcast_includes_admins_own_account(self, client, db, admin_headers, admin):
        _give_token(db, admin)
        r = client.post("/admin/push/broadcast", json={"title": "T52", "body": "self"}, headers=admin_headers)
        assert r.status_code == 200
        rows = _broadcast_rows(db, admin.id)
        assert any(row.title == "T52" and row.actor_id == admin.id for row in rows)

    def test_broadcast_response_shape_unchanged(self, client, db, admin_headers):
        u = _make_user(db, email="bcast_shape@example.com")
        _give_token(db, u)
        r = client.post("/admin/push/broadcast", json=_BODY, headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert set(data.keys()) == {"message", "sent_to"}
        assert isinstance(data["sent_to"], int)
        assert isinstance(data["message"], str)

    def test_broadcast_preserves_emoji_and_long_body(self, client, db, admin_headers):
        u = _make_user(db, email="bcast_emoji@example.com")
        _give_token(db, u)
        body = {"title": "📣 Café — naïve 🎧", "body": "x" * 500}
        r = client.post("/admin/push/broadcast", json=body, headers=admin_headers)
        assert r.status_code == 200
        rows = _broadcast_rows(db, u.id)
        row = rows[-1]
        assert row.title == "📣 Café — naïve 🎧"
        assert len(row.body) == 500

    def test_broadcast_row_visible_in_notifications_history(self, client, db, admin_headers):
        u = _make_user(db, email="bcast_history@example.com")
        _give_token(db, u)
        body = {"title": "History Title", "body": "History Body"}
        r = client.post("/admin/push/broadcast", json=body, headers=admin_headers)
        assert r.status_code == 200
        h = client.get("/notifications/history", headers=_auth(u))
        assert h.status_code == 200
        assert any(e["event_type"] == "admin_broadcast" and e["title"] == "History Title" for e in h.json())
