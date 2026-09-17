"""Tests for /notifications/prefs (F-06/F-49 — merge, not replace) and the new
POST /notifications/{id}/read (F-23)."""
import json

from sqlmodel import select

from app import models
from tests.conftest import _make_user, _auth

# Measured response key set of GET /notifications/prefs.
K7 = {"new_follower", "post_liked", "post_commented", "book_completed",
      "reading_streak_reminder", "group_invite", "group_join_request"}


def _seed_notifications(db, tag):
    """Fresh U (owner) and V (actor), and 3 unread NotificationLog rows for U."""
    u = _make_user(db, email=f"{tag}_u@example.com", name=f"{tag} U")
    v = _make_user(db, email=f"{tag}_v@example.com", name=f"{tag} V")
    ids = []
    for _ in range(3):
        log = models.NotificationLog(
            user_id=u.id, actor_id=v.id, event_type="new_follower",
            title="New follower", body="Someone followed you", is_read=False,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        ids.append(log.id)
    return u, v, ids


class TestNotificationPrefs:
    def test_patch_prefs_full_body_200(self, client, db):
        user = _make_user(db, email="prefs_full@example.com")
        h = _auth(user)
        body = {k: False for k in K7}
        r = client.patch("/notifications/prefs", json=body, headers=h)
        assert r.status_code == 200
        assert set(r.json()) == K7
        assert all(v is False for v in r.json().values())
        assert client.get("/notifications/prefs", headers=h).json() == r.json()

    def test_patch_prefs_partial_preserves_other_keys(self, client, db):
        user = _make_user(db, email="prefs_partial@example.com")
        h = _auth(user)
        client.patch("/notifications/prefs", json={"new_follower": False}, headers=h)
        r = client.patch("/notifications/prefs", json={"post_liked": False}, headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["new_follower"] is False
        assert body["post_liked"] is False
        for k in K7 - {"new_follower", "post_liked"}:
            assert body[k] is True
        assert client.get("/notifications/prefs", headers=h).json() == body

    def test_patch_prefs_extra_keys_ignored(self, client, db):
        user = _make_user(db, email="prefs_extra@example.com")
        h = _auth(user)
        r = client.patch("/notifications/prefs", json={
            "post_commented": False, "totally_unknown_key": True, "book_added": False,
        }, headers=h)
        assert r.status_code == 200
        assert set(r.json()) == K7
        assert r.json()["post_commented"] is False

        db.expire_all()
        row = db.get(models.User, user.id)
        stored = json.loads(row.notification_prefs)
        assert "totally_unknown_key" not in stored
        assert stored["book_added"] is True
        assert stored["book_completed"] is True

    def test_patch_prefs_non_bool_422(self, client, db):
        user = _make_user(db, email="prefs_nonbool@example.com")
        h = _auth(user)
        before = client.get("/notifications/prefs", headers=h).json()
        r = client.patch("/notifications/prefs", json={"post_liked": {"x": 1}}, headers=h)
        assert r.status_code == 422
        assert client.get("/notifications/prefs", headers=h).json() == before

    def test_book_added_follows_book_completed(self, client, db):
        user = _make_user(db, email="prefs_bookadded@example.com")
        h = _auth(user)
        client.patch("/notifications/prefs", json={"book_completed": False}, headers=h)
        db.expire_all()
        row = db.get(models.User, user.id)
        assert json.loads(row.notification_prefs)["book_added"] is False

        client.patch("/notifications/prefs", json={"book_completed": True}, headers=h)
        db.expire_all()
        row2 = db.get(models.User, user.id)
        assert json.loads(row2.notification_prefs)["book_added"] is True

    def test_patch_prefs_requires_auth_401(self, client):
        r = client.patch("/notifications/prefs", json={"new_follower": False})
        assert r.status_code == 401

    def test_history_limit_bounds_422(self, client, db):
        user = _make_user(db, email="prefs_history_bounds@example.com")
        h = _auth(user)
        for bad in (0, -1, 201):
            r = client.get(f"/notifications/history?limit={bad}", headers=h)
            assert r.status_code == 422
            assert r.json()["detail"][0]["loc"] == ["query", "limit"]
        assert client.get("/notifications/history?limit=200", headers=h).status_code == 200
        r_ok = client.get("/notifications/history?limit=1", headers=h)
        assert r_ok.status_code == 200
        assert len(r_ok.json()) <= 1


class TestMarkOneRead:
    def test_mark_one_read_only_that_row(self, client, db):
        u, v, (n1, n2, n3) = _seed_notifications(db, "mor1")
        r = client.post(f"/notifications/{n2}/read", headers=_auth(u))
        assert r.status_code == 200
        assert r.json() == {"id": n2, "is_read": True}
        db.expire_all()
        assert db.get(models.NotificationLog, n2).is_read is True
        assert db.get(models.NotificationLog, n1).is_read is False
        assert db.get(models.NotificationLog, n3).is_read is False

    def test_mark_one_read_idempotent(self, client, db):
        u, v, (n1, n2, n3) = _seed_notifications(db, "mor2")
        h = _auth(u)
        r1 = client.post(f"/notifications/{n2}/read", headers=h)
        r2 = client.post(f"/notifications/{n2}/read", headers=h)
        assert r1.status_code == r2.status_code == 200
        assert r1.json() == r2.json() == {"id": n2, "is_read": True}
        db.expire_all()
        assert db.get(models.NotificationLog, n2).is_read is True
        assert db.get(models.NotificationLog, n1).is_read is False
        assert db.get(models.NotificationLog, n3).is_read is False

    def test_mark_other_users_notification_404(self, client, db):
        u, v, (n1, n2, n3) = _seed_notifications(db, "mor3")
        r = client.post(f"/notifications/{n1}/read", headers=_auth(v))
        assert r.status_code == 404
        assert r.json() == {"detail": "Notification not found"}
        db.expire_all()
        assert db.get(models.NotificationLog, n1).is_read is False

    def test_mark_unknown_notification_404(self, client, db):
        u, v, (n1, n2, n3) = _seed_notifications(db, "mor4")
        r_unknown = client.post("/notifications/999999999/read", headers=_auth(u))
        assert r_unknown.status_code == 404
        assert r_unknown.json() == {"detail": "Notification not found"}

        # Another user's real id must read identically — no existence oracle.
        r_other_owner = client.post(f"/notifications/{n1}/read", headers=_auth(v))
        assert r_other_owner.status_code == 404
        assert r_other_owner.json() == r_unknown.json()

    def test_unread_count_drops_after_mark_one(self, client, db):
        u, v, (n1, n2, n3) = _seed_notifications(db, "mor5")
        h = _auth(u)
        before = client.get("/notifications/unread-count", headers=h).json()["unread"]
        client.post(f"/notifications/{n1}/read", headers=h)
        after = client.get("/notifications/unread-count", headers=h).json()["unread"]
        assert after == before - 1
        client.post(f"/notifications/{n1}/read", headers=h)
        after2 = client.get("/notifications/unread-count", headers=h).json()["unread"]
        assert after2 == after

    def test_mark_one_read_requires_auth_401(self, client, db):
        u, v, (n1, n2, n3) = _seed_notifications(db, "mor6")
        r = client.post(f"/notifications/{n1}/read")
        assert r.status_code == 401
        db.expire_all()
        assert db.get(models.NotificationLog, n1).is_read is False

    def test_mark_all_read_route_unchanged(self, client, db):
        u, v, (n1, n2, n3) = _seed_notifications(db, "mor7")
        r = client.post("/notifications/mark-read", headers=_auth(u))
        assert r.status_code == 200
        assert set(r.json().keys()) == {"message"}
        db.expire_all()
        assert db.get(models.NotificationLog, n1).is_read is True
        assert db.get(models.NotificationLog, n2).is_read is True
        assert db.get(models.NotificationLog, n3).is_read is True
