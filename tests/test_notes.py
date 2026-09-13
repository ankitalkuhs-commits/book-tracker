"""Tests for /notes/* — feed, CRUD, likes, comments."""
import pytest
from tests.conftest import _make_user, _auth


def _create_note(client, headers, text="Test note", is_public=True):
    return client.post("/notes/", json={"text": text, "is_public": is_public}, headers=headers)


def _backdate(db, note_id, minutes):
    """Force a deterministic created_at — two API calls can land in the same second."""
    from app import models
    from datetime import datetime, timedelta
    n = db.get(models.Note, note_id)
    n.created_at = datetime.utcnow() - timedelta(minutes=minutes)
    db.add(n); db.commit(); db.expire_all()


def _create_group(client, headers, name="R3 Circle"):
    return client.post("/groups/", json={"name": name, "is_private": False,
                                         "description": "R3"}, headers=headers)


def _note_posted_events(client, headers, gid):
    r = client.get(f"/groups/{gid}/activity", headers=headers)
    assert r.status_code == 200
    return [e for e in r.json() if e["event_type"] == "note_posted"]


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

    def test_community_feed_note_card_shape_unchanged(self, client, db):
        user = _make_user(db, email="feed_shape@example.com")
        _create_note(client, _auth(user), text="Shape check", is_public=True)
        r = client.get("/notes/feed", headers=_auth(user))
        assert r.status_code == 200
        rows = [n for n in r.json() if n["text"] == "Shape check"]
        assert rows
        n = rows[0]
        for key in ("id", "user_id", "text", "emotion", "page_number", "chapter",
                    "image_url", "quote", "is_public", "created_at", "likes_count",
                    "comments_count", "liked_by_me", "user_has_liked", "user", "book"):
            assert key in n, f"Missing key: {key}"
        assert n["created_at"].endswith("Z")
        assert n["liked_by_me"] == n["user_has_liked"]

    def test_user_notes_private_profile_still_403(self, client, db):
        a = _make_user(db, email="unp_a@example.com")
        b = _make_user(db, email="unp_b@example.com")
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(b))
        _create_note(client, _auth(b), text="B public note", is_public=True)
        r = client.get(f"/notes/user/{b.id}", headers=_auth(a))
        assert r.status_code == 403
        assert r.json()["detail"] == "This profile is private"
        client.post(f"/follow/{b.id}", headers=_auth(a))
        r2 = client.get(f"/notes/user/{b.id}", headers=_auth(a))
        assert r2.status_code == 200
        assert any(n["text"] == "B public note" for n in r2.json())


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

    def test_like_still_writes_notification_log(self, client, db):
        from sqlmodel import select
        from app import models
        owner = _make_user(db, email="likelog_owner@example.com")
        liker = _make_user(db, email="likelog_liker@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        db.expire_all()
        rows = db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.event_type == "post_liked")
        ).all()
        assert any(r.actor_id == liker.id for r in rows)

        # Self-like writes no row
        self_note_id = _create_note(client, _auth(owner)).json()["id"]
        before = len(db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.event_type == "post_liked")
        ).all())
        client.post(f"/notes/{self_note_id}/like", headers=_auth(owner))
        db.expire_all()
        after = len(db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.event_type == "post_liked")
        ).all())
        assert after == before


class TestFriendsFeedOrder:
    """R1 — mutual follows sort first in /notes/friends-feed."""

    def test_friends_feed_puts_mutual_follows_first(self, client, db):
        viewer = _make_user(db, email="ff1_viewer@example.com")
        mutual = _make_user(db, email="ff1_mutual@example.com")
        nonmutual = _make_user(db, email="ff1_nonmutual@example.com")
        client.post(f"/follow/{mutual.id}", headers=_auth(viewer))
        client.post(f"/follow/{nonmutual.id}", headers=_auth(viewer))
        client.post(f"/follow/{viewer.id}", headers=_auth(mutual))

        m_id = _create_note(client, _auth(mutual), text="T01 mutual older").json()["id"]
        nm_id = _create_note(client, _auth(nonmutual), text="T01 nonmutual newer").json()["id"]
        _backdate(db, m_id, minutes=30)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        assert r.status_code == 200
        rows = r.json()
        ids = [n["id"] for n in rows]
        assert ids.index(m_id) < ids.index(nm_id)
        mutual_row = next(n for n in rows if n["id"] == m_id)
        nonmutual_row = next(n for n in rows if n["id"] == nm_id)
        assert mutual_row["user"]["is_mutual"] is True
        assert nonmutual_row["user"]["is_mutual"] is False

    def test_friends_feed_newest_first_within_mutual_group(self, client, db):
        viewer = _make_user(db, email="ff2_viewer@example.com")
        mutual_a = _make_user(db, email="ff2_mutual_a@example.com")
        mutual_b = _make_user(db, email="ff2_mutual_b@example.com")
        nonmutual = _make_user(db, email="ff2_nonmutual@example.com")
        for u in (mutual_a, mutual_b, nonmutual):
            client.post(f"/follow/{u.id}", headers=_auth(viewer))
        client.post(f"/follow/{viewer.id}", headers=_auth(mutual_a))
        client.post(f"/follow/{viewer.id}", headers=_auth(mutual_b))

        a_id = _create_note(client, _auth(mutual_a), text="ff2 a").json()["id"]
        b_id = _create_note(client, _auth(mutual_b), text="ff2 b").json()["id"]
        nm_id = _create_note(client, _auth(nonmutual), text="ff2 nm").json()["id"]
        _backdate(db, a_id, minutes=60)
        _backdate(db, b_id, minutes=10)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        ids = [n["id"] for n in r.json()]
        assert ids == [b_id, a_id, nm_id]

    def test_friends_feed_newest_first_when_all_non_mutual(self, client, db):
        viewer = _make_user(db, email="ff3_viewer@example.com")
        nm_a = _make_user(db, email="ff3_nm_a@example.com")
        nm_b = _make_user(db, email="ff3_nm_b@example.com")
        client.post(f"/follow/{nm_a.id}", headers=_auth(viewer))
        client.post(f"/follow/{nm_b.id}", headers=_auth(viewer))

        a_id = _create_note(client, _auth(nm_a), text="ff3 a").json()["id"]
        b_id = _create_note(client, _auth(nm_b), text="ff3 b").json()["id"]
        _backdate(db, a_id, minutes=45)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        rows = r.json()
        ids = [n["id"] for n in rows]
        assert ids.index(b_id) < ids.index(a_id)
        assert all(n["user"]["is_mutual"] is False for n in rows if n["id"] in (a_id, b_id))

    def test_friends_feed_empty_when_no_follows(self, client, db):
        user = _make_user(db, email="ff4_lonely@example.com")
        r = client.get("/notes/friends-feed", headers=_auth(user))
        assert r.status_code == 200
        assert r.json() == []

    def test_friends_feed_excludes_private_notes(self, client, db):
        viewer = _make_user(db, email="ff5_viewer@example.com")
        author = _make_user(db, email="ff5_author@example.com")
        client.post(f"/follow/{author.id}", headers=_auth(viewer))
        _create_note(client, _auth(author), text="T05 secret", is_public=False)
        _create_note(client, _auth(author), text="T05 public", is_public=True)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        rows = r.json()
        assert any(n["text"] == "T05 public" for n in rows)
        assert not any(n.get("text") == "T05 secret" for n in rows)
        assert not any(n.get("is_public") is False for n in rows)

    def test_friends_feed_includes_private_profile_author_you_follow(self, client, db):
        author = _make_user(db, email="ff6_author@example.com")
        viewer = _make_user(db, email="ff6_viewer@example.com")
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(author))
        client.post(f"/follow/{author.id}", headers=_auth(viewer))
        _create_note(client, _auth(author), text="ff6 public note", is_public=True)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        assert r.status_code == 200
        assert any(n["text"] == "ff6 public note" for n in r.json())

    def test_friends_feed_excludes_unfollowed_users(self, client, db):
        viewer = _make_user(db, email="ff7_viewer@example.com")
        followed = _make_user(db, email="ff7_followed@example.com")
        stranger = _make_user(db, email="ff7_stranger@example.com")
        client.post(f"/follow/{followed.id}", headers=_auth(viewer))
        _create_note(client, _auth(stranger), text="ff7 stranger note", is_public=True)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        assert not any(n["user_id"] == stranger.id for n in r.json())

    def test_friends_feed_requires_auth(self, client):
        r = client.get("/notes/friends-feed")
        assert r.status_code == 401

    def test_friends_feed_note_card_shape_unchanged(self, client, db):
        viewer = _make_user(db, email="ff8_viewer@example.com")
        author = _make_user(db, email="ff8_author@example.com")
        client.post(f"/follow/{author.id}", headers=_auth(viewer))
        client.post(f"/follow/{viewer.id}", headers=_auth(author))
        _create_note(client, _auth(author), text="ff8 note", is_public=True)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        rows = r.json()
        row = next(n for n in rows if n["text"] == "ff8 note")
        for key in ("id", "user_id", "text", "emotion", "page_number", "chapter",
                    "image_url", "quote", "is_public", "created_at", "likes_count",
                    "comments_count", "liked_by_me", "user_has_liked", "user", "book"):
            assert key in row
        assert "is_mutual" in row["user"]
        assert isinstance(row["user"]["is_mutual"], bool)


class TestMyNotesLikeState:
    """R2 — /notes/me reports real liked_by_me / user_has_liked."""

    def test_my_notes_liked_by_me_reflects_real_likes(self, client, db):
        owner = _make_user(db, email="me_like@example.com")
        h = _auth(owner)
        liked_id = _create_note(client, h, text="liked one").json()["id"]
        unliked_id = _create_note(client, h, text="unliked one").json()["id"]
        r = client.post(f"/notes/{liked_id}/like", headers=h)
        assert r.status_code in (200, 201)

        rows = client.get("/notes/me", headers=h).json()
        liked_row = next(n for n in rows if n["id"] == liked_id)
        unliked_row = next(n for n in rows if n["id"] == unliked_id)
        assert liked_row["liked_by_me"] is True
        assert liked_row["user_has_liked"] is True
        assert unliked_row["liked_by_me"] is False
        assert unliked_row["user_has_liked"] is False

    def test_my_notes_sets_both_like_keys_consistently(self, client, db):
        owner = _make_user(db, email="me_like_consistent@example.com")
        h = _auth(owner)
        _create_note(client, h, text="consistent 1")
        note2 = _create_note(client, h, text="consistent 2").json()["id"]
        client.post(f"/notes/{note2}/like", headers=h)

        rows = client.get("/notes/me", headers=h).json()
        assert rows
        for n in rows:
            assert "user_has_liked" in n
            assert n["liked_by_me"] == n["user_has_liked"]

    def test_my_notes_other_users_like_does_not_set_liked_by_me(self, client, db):
        owner = _make_user(db, email="me_like_owner2@example.com")
        liker = _make_user(db, email="me_like_other@example.com")
        note_id = _create_note(client, _auth(owner), text="other liked").json()["id"]
        client.post(f"/notes/{note_id}/like", headers=_auth(liker))

        rows = client.get("/notes/me", headers=_auth(owner)).json()
        row = next(n for n in rows if n["id"] == note_id)
        assert row["liked_by_me"] is False
        assert row["user_has_liked"] is False
        assert row["likes_count"] == 1

    def test_my_notes_likes_count_counts_all_likers(self, client, db):
        owner = _make_user(db, email="me_like_owner3@example.com")
        liker = _make_user(db, email="me_like_other3@example.com")
        note_id = _create_note(client, _auth(owner), text="counted").json()["id"]
        client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        client.post(f"/notes/{note_id}/like", headers=_auth(owner))

        rows = client.get("/notes/me", headers=_auth(owner)).json()
        row = next(n for n in rows if n["id"] == note_id)
        assert row["likes_count"] == 2
        assert row["liked_by_me"] is True

    def test_my_notes_liked_by_me_false_after_unlike(self, client, db):
        owner = _make_user(db, email="me_like_unlike@example.com")
        h = _auth(owner)
        note_id = _create_note(client, h, text="unlike me").json()["id"]
        client.post(f"/notes/{note_id}/like", headers=h)
        before_count = client.get("/notes/me", headers=h).json()
        before_row = next(n for n in before_count if n["id"] == note_id)

        client.delete(f"/notes/{note_id}/like", headers=h)
        rows = client.get("/notes/me", headers=h).json()
        row = next(n for n in rows if n["id"] == note_id)
        assert row["liked_by_me"] is False
        assert row["user_has_liked"] is False
        assert row["likes_count"] == before_row["likes_count"] - 1

    def test_my_notes_note_card_shape_unchanged(self, client, db):
        owner = _make_user(db, email="me_shape@example.com")
        _create_note(client, _auth(owner), text="shape note")
        rows = client.get("/notes/me", headers=_auth(owner)).json()
        row = next(n for n in rows if n["text"] == "shape note")
        for key in ("id", "user_id", "text", "emotion", "page_number", "chapter",
                    "image_url", "quote", "is_public", "created_at", "updated_at",
                    "likes_count", "comments_count", "liked_by_me", "user_has_liked",
                    "user", "book"):
            assert key in row, f"Missing key: {key}"
        assert row["created_at"].endswith("Z")
        assert set(row["user"].keys()) >= {"id", "name", "username", "profile_picture"}


class TestPrivateNotesAndGroupActivity:
    """R3 — a private note never appears in GET /groups/{id}/activity."""

    def test_private_note_does_not_appear_in_group_activity(self, client, db):
        author = _make_user(db, email="r3_priv@example.com")
        h = _auth(author)
        gid = _create_group(client, h, name="R3 Private Circle").json()["id"]
        before = _note_posted_events(client, h, gid)
        assert before == []
        note = client.post("/notes/", json={"text": "R3 private body", "is_public": False}, headers=h)
        note_id = note.json()["id"]
        after = _note_posted_events(client, h, gid)
        assert after == []
        r = client.get(f"/groups/{gid}/activity", headers=h)
        assert str(note_id) not in [str(e.get("payload", {}).get("note_id")) for e in r.json()]

    def test_public_note_still_appears_in_group_activity(self, client, db):
        author = _make_user(db, email="r3_pub@example.com")
        h = _auth(author)
        gid = _create_group(client, h, name="R3 Public Circle").json()["id"]
        note_id = client.post("/notes/", json={"text": "R3 public body", "is_public": True}, headers=h).json()["id"]
        events = _note_posted_events(client, h, gid)
        assert len(events) == 1
        assert events[0]["payload"]["note_id"] == note_id
        assert events[0]["user"]["id"] == author.id

    def test_updating_note_to_public_fires_no_group_activity(self, client, db):
        author = _make_user(db, email="r3_flipup@example.com")
        h = _auth(author)
        gid = _create_group(client, h, name="R3 Flip Up Circle").json()["id"]
        note_id = client.post("/notes/", json={"text": "R3 flip up", "is_public": False}, headers=h).json()["id"]
        count_before = len(_note_posted_events(client, h, gid))
        assert count_before == 0
        r = client.put(f"/notes/{note_id}", json={"text": "R3 flip up", "is_public": True}, headers=h)
        assert r.status_code == 200
        count_after = len(_note_posted_events(client, h, gid))
        assert count_after == 0

    def test_updating_note_to_private_fires_no_group_activity(self, client, db):
        author = _make_user(db, email="r3_flipdown@example.com")
        h = _auth(author)
        gid = _create_group(client, h, name="R3 Flip Down Circle").json()["id"]
        note_id = client.post("/notes/", json={"text": "R3 public first", "is_public": True}, headers=h).json()["id"]
        count_before = len(_note_posted_events(client, h, gid))
        assert count_before == 1
        client.put(f"/notes/{note_id}", json={"text": "now hidden", "is_public": False}, headers=h)
        count_after = len(_note_posted_events(client, h, gid))
        assert count_after == 1

    def test_private_note_still_visible_to_owner_in_my_notes(self, client, db):
        author = _make_user(db, email="r3_mine@example.com")
        h = _auth(author)
        note_id = client.post("/notes/", json={"text": "R3 mine only", "is_public": False}, headers=h).json()["id"]
        rows = client.get("/notes/me", headers=h).json()
        row = next((n for n in rows if n["id"] == note_id), None)
        assert row is not None
        assert row["text"] == "R3 mine only"
        assert row["is_public"] is False

    def test_private_note_still_visible_to_owner_via_userbook(self, client, db):
        author = _make_user(db, email="r3_ubook@example.com")
        other = _make_user(db, email="r3_ubook_other@example.com")
        h = _auth(author)
        add = client.post("/books/add-to-library", json={
            "title": "R3 Book", "total_pages": 100, "status": "reading"
        }, headers=h)
        ub_id = add.json()["id"]
        note_id = client.post("/notes/", json={
            "text": "R3 book-scoped private", "userbook_id": ub_id, "is_public": False
        }, headers=h).json()["id"]

        r = client.get(f"/notes/userbook/{ub_id}", headers=h)
        assert r.status_code == 200
        row = next((n for n in r.json() if n["id"] == note_id), None)
        assert row is not None
        assert row["is_public"] is False

        r2 = client.get(f"/notes/userbook/{ub_id}", headers=_auth(other))
        assert r2.status_code == 404

    def test_private_note_absent_from_every_public_list(self, client, db):
        author = _make_user(db, email="r3_neverpublic@example.com")
        viewer = _make_user(db, email="r3_neverpublic_viewer@example.com")
        client.post(f"/follow/{author.id}", headers=_auth(viewer))
        note_id = client.post("/notes/", json={
            "text": "R3 never public", "is_public": False
        }, headers=_auth(author)).json()["id"]

        for url in ("/notes/feed", "/notes/friends-feed", f"/notes/user/{author.id}"):
            r = client.get(url, headers=_auth(viewer))
            assert r.status_code == 200
            assert not any(n.get("id") == note_id or n.get("text") == "R3 never public" for n in r.json())

    def test_private_note_hidden_in_all_of_authors_groups(self, client, db):
        author = _make_user(db, email="r3_twogroups@example.com")
        h = _auth(author)
        g1 = _create_group(client, h, name="R3 Circle One").json()["id"]
        g2 = _create_group(client, h, name="R3 Circle Two").json()["id"]
        client.post("/notes/", json={"text": "R3 two circles", "is_public": False}, headers=h)
        assert _note_posted_events(client, h, g1) == []
        assert _note_posted_events(client, h, g2) == []

    def test_member_joined_activity_still_fires(self, client, db):
        x = _make_user(db, email="r3_member_x@example.com")
        y = _make_user(db, email="r3_member_y@example.com")
        gid = _create_group(client, _auth(x), name="R3 Join Circle").json()["id"]
        client.post(f"/groups/{gid}/join", headers=_auth(y))
        r = client.get(f"/groups/{gid}/activity", headers=_auth(x))
        assert r.status_code == 200
        assert any(e["event_type"] == "member_joined" for e in r.json())
