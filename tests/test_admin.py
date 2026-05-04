"""Tests for /admin/* endpoints — access control + content moderation."""
import pytest
from tests.conftest import _make_user, _auth


def _create_note(client, headers, text="Admin test note"):
    return client.post("/notes/", json={"text": text, "is_public": True}, headers=headers)


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
