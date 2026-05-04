"""Tests for /notes/* — feed, CRUD, likes, comments."""
import pytest
from tests.conftest import _make_user, _auth


def _create_note(client, headers, text="Test note", is_public=True):
    return client.post("/notes/", json={"text": text, "is_public": is_public}, headers=headers)


class TestNotesCRUD:
    def test_create_note(self, client, alice_headers):
        r = _create_note(client, alice_headers)
        assert r.status_code in (200, 201)
        assert r.json()["text"] == "Test note"

    def test_create_note_with_emotion_and_quote(self, client, alice_headers):
        r = client.post("/notes/", json={
            "text": "Loved it",
            "quote": "It was the best of times",
            "emotion": "Moved 🥹",
            "is_public": True,
        }, headers=alice_headers)
        assert r.status_code in (200, 201)
        data = r.json()
        assert data["emotion"] == "Moved 🥹"
        assert data["quote"] == "It was the best of times"

    def test_edit_own_note(self, client, alice_headers):
        note_id = _create_note(client, alice_headers).json()["id"]
        r = client.put(f"/notes/{note_id}", json={"text": "Updated text", "is_public": True}, headers=alice_headers)
        assert r.status_code == 200
        assert r.json()["text"] == "Updated text"

    def test_edit_sets_updated_at(self, client, alice_headers):
        note_id = _create_note(client, alice_headers).json()["id"]
        r = client.put(f"/notes/{note_id}", json={"text": "Changed", "is_public": True}, headers=alice_headers)
        assert r.json().get("updated_at") is not None

    def test_cannot_edit_other_users_note(self, client, db):
        alice = _make_user(db, email="edit_alice@example.com")
        bob = _make_user(db, email="edit_bob@example.com")
        note_id = _create_note(client, _auth(alice)).json()["id"]
        r = client.put(f"/notes/{note_id}", json={"text": "Hack", "is_public": True}, headers=_auth(bob))
        assert r.status_code in (403, 404)

    def test_delete_own_note(self, client, db):
        user = _make_user(db, email="del_note@example.com")
        h = _auth(user)
        note_id = _create_note(client, h).json()["id"]
        r = client.delete(f"/notes/{note_id}", headers=h)
        assert r.status_code == 200

    def test_cannot_delete_other_users_note(self, client, db):
        alice = _make_user(db, email="deln_alice@example.com")
        bob = _make_user(db, email="deln_bob@example.com")
        note_id = _create_note(client, _auth(alice)).json()["id"]
        r = client.delete(f"/notes/{note_id}", headers=_auth(bob))
        assert r.status_code in (403, 404)

    def test_requires_auth(self, client):
        r = client.post("/notes/", json={"text": "x", "is_public": True})
        assert r.status_code == 401


class TestFeed:
    def test_community_feed_returns_public_notes(self, client, db):
        user = _make_user(db, email="feed_pub@example.com")
        _create_note(client, _auth(user), text="Public post", is_public=True)
        r = client.get("/notes/feed", headers=_auth(user))
        assert r.status_code == 200
        assert any(n["text"] == "Public post" for n in r.json())

    def test_private_notes_excluded_from_community_feed(self, client, db):
        user = _make_user(db, email="feed_priv@example.com")
        _create_note(client, _auth(user), text="Secret note", is_public=False)
        r = client.get("/notes/feed", headers=_auth(user))
        assert not any(n.get("text") == "Secret note" for n in r.json())

    def test_friends_feed_only_shows_followed_users(self, client, db):
        alice = _make_user(db, email="ff_alice@example.com")
        bob = _make_user(db, email="ff_bob@example.com")
        carol = _make_user(db, email="ff_carol@example.com")
        _create_note(client, _auth(bob), text="Bob's note", is_public=True)
        _create_note(client, _auth(carol), text="Carol's note", is_public=True)
        # Alice follows Bob but not Carol
        client.post(f"/follow/{bob.id}", headers=_auth(alice))
        r = client.get("/notes/friends-feed", headers=_auth(alice))
        texts = [n.get("text") for n in r.json()]
        assert "Bob's note" in texts
        assert "Carol's note" not in texts


class TestLikesComments:
    def test_like_note(self, client, db):
        owner = _make_user(db, email="like_owner@example.com")
        liker = _make_user(db, email="like_liker@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        r = client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        assert r.status_code in (200, 201)

    def test_unlike_note(self, client, db):
        owner = _make_user(db, email="unlike_owner@example.com")
        liker = _make_user(db, email="unlike_liker@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        r = client.delete(f"/notes/{note_id}/like", headers=_auth(liker))
        assert r.status_code == 200

    def test_double_like_does_not_error(self, client, db):
        owner = _make_user(db, email="dlike_owner@example.com")
        liker = _make_user(db, email="dlike_liker@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        r = client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        assert r.status_code in (200, 201, 400)  # idempotent or error, not 500

    def test_add_comment(self, client, db):
        owner = _make_user(db, email="comment_owner@example.com")
        commenter = _make_user(db, email="commenter@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        r = client.post(f"/notes/{note_id}/comments", json={"text": "Great post!"}, headers=_auth(commenter))
        assert r.status_code in (200, 201)

    def test_get_comments(self, client, db):
        owner = _make_user(db, email="getcomment_owner@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        client.post(f"/notes/{note_id}/comments", json={"text": "First!"}, headers=_auth(owner))
        r = client.get(f"/notes/{note_id}/comments", headers=_auth(owner))
        assert r.status_code == 200
        assert any(c["text"] == "First!" for c in r.json())

    def test_empty_comment_rejected(self, client, db):
        """Empty or whitespace-only comments should be rejected."""
        owner = _make_user(db, email="empty_comment@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        r = client.post(f"/notes/{note_id}/comments", json={"text": ""}, headers=_auth(owner))
        assert r.status_code == 400
        r2 = client.post(f"/notes/{note_id}/comments", json={"text": "   "}, headers=_auth(owner))
        assert r2.status_code == 400

    def test_like_nonexistent_note(self, client, alice_headers):
        r = client.post("/notes/999999/like", headers=alice_headers)
        assert r.status_code == 404
