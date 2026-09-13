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
