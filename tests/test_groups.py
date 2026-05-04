"""Tests for /groups/* endpoints."""
import pytest
from tests.conftest import _make_user, _auth


def _create_group(client, headers, name="Test Circle", is_private=False):
    return client.post("/groups/", json={"name": name, "is_private": is_private, "description": "A test group"}, headers=headers)


class TestGroupsCRUD:
    def test_create_group(self, client, db):
        user = _make_user(db, email="grp_create@example.com")
        r = _create_group(client, _auth(user))
        assert r.status_code in (200, 201)
        assert r.json()["name"] == "Test Circle"

    def test_creator_is_curator(self, client, db):
        user = _make_user(db, email="grp_curator@example.com")
        group_id = _create_group(client, _auth(user)).json()["id"]
        r = client.get(f"/groups/{group_id}/members", headers=_auth(user))
        members = r.json()
        creator = next((m for m in members if m["user_id"] == user.id), None)
        assert creator is not None
        assert creator["role"] == "curator"

    def test_get_group(self, client, db):
        user = _make_user(db, email="grp_get@example.com")
        group_id = _create_group(client, _auth(user)).json()["id"]
        r = client.get(f"/groups/{group_id}", headers=_auth(user))
        assert r.status_code == 200

    def test_get_nonexistent_group(self, client, alice_headers):
        r = client.get("/groups/999999", headers=alice_headers)
        assert r.status_code == 404

    def test_my_groups_includes_created_group(self, client, db):
        user = _make_user(db, email="grp_mine@example.com")
        h = _auth(user)
        _create_group(client, h, name="MyCircle")
        r = client.get("/groups/my", headers=h)
        assert any(g["name"] == "MyCircle" for g in r.json())


class TestGroupMembership:
    def test_join_public_group(self, client, db):
        creator = _make_user(db, email="grp_join_creator@example.com")
        joiner = _make_user(db, email="grp_join_joiner@example.com")
        group_id = _create_group(client, _auth(creator), is_private=False).json()["id"]
        r = client.post(f"/groups/{group_id}/join", headers=_auth(joiner))
        assert r.status_code in (200, 201)
        assert r.json().get("status") == "active"

    def test_join_private_group_creates_pending(self, client, db):
        creator = _make_user(db, email="grp_priv_creator@example.com")
        joiner = _make_user(db, email="grp_priv_joiner@example.com")
        group_id = _create_group(client, _auth(creator), is_private=True).json()["id"]
        r = client.post(f"/groups/{group_id}/join", headers=_auth(joiner))
        assert r.status_code in (200, 201)
        assert r.json().get("status") == "pending"

    def test_leave_group(self, client, db):
        creator = _make_user(db, email="grp_leave_creator@example.com")
        joiner = _make_user(db, email="grp_leave_joiner@example.com")
        group_id = _create_group(client, _auth(creator), is_private=False).json()["id"]
        client.post(f"/groups/{group_id}/join", headers=_auth(joiner))
        r = client.delete(f"/groups/{group_id}/leave", headers=_auth(joiner))
        assert r.status_code in (200, 204)

    def test_pending_requests_only_visible_to_curator(self, client, db):
        creator = _make_user(db, email="grp_pend_creator@example.com")
        joiner = _make_user(db, email="grp_pend_joiner@example.com")
        outsider = _make_user(db, email="grp_pend_outsider@example.com")
        group_id = _create_group(client, _auth(creator), is_private=True).json()["id"]
        client.post(f"/groups/{group_id}/join", headers=_auth(joiner))
        r_curator = client.get(f"/groups/{group_id}/pending", headers=_auth(creator))
        assert r_curator.status_code == 200
        r_outsider = client.get(f"/groups/{group_id}/pending", headers=_auth(outsider))
        assert r_outsider.status_code in (403, 404)

    def test_approve_member(self, client, db):
        creator = _make_user(db, email="grp_approve_creator@example.com")
        joiner = _make_user(db, email="grp_approve_joiner@example.com")
        group_id = _create_group(client, _auth(creator), is_private=True).json()["id"]
        client.post(f"/groups/{group_id}/join", headers=_auth(joiner))
        r = client.post(f"/groups/{group_id}/approve/{joiner.id}", headers=_auth(creator))
        assert r.status_code == 200


class TestGroupPosts:
    def test_create_group_post(self, client, db):
        user = _make_user(db, email="gpost_user@example.com")
        h = _auth(user)
        group_id = _create_group(client, h).json()["id"]
        r = client.post(f"/groups/{group_id}/posts", json={"text": "Hello group!"}, headers=h)
        assert r.status_code in (200, 201)

    def test_group_post_with_emotion_and_image(self, client, db):
        user = _make_user(db, email="gpost_emo@example.com")
        h = _auth(user)
        group_id = _create_group(client, h).json()["id"]
        r = client.post(f"/groups/{group_id}/posts", json={
            "text": "Loved this part",
            "emotion": "Inspired ✨",
            "image_url": "https://res.cloudinary.com/test/image.jpg",
        }, headers=h)
        assert r.status_code in (200, 201)
        data = r.json()
        assert data["emotion"] == "Inspired ✨"
        assert data["image_url"] == "https://res.cloudinary.com/test/image.jpg"

    def test_non_member_cannot_post(self, client, db):
        creator = _make_user(db, email="gpost_creator@example.com")
        outsider = _make_user(db, email="gpost_outsider@example.com")
        group_id = _create_group(client, _auth(creator)).json()["id"]
        r = client.post(f"/groups/{group_id}/posts", json={"text": "Sneaky post"}, headers=_auth(outsider))
        assert r.status_code in (403, 404)

    def test_get_group_posts(self, client, db):
        user = _make_user(db, email="gpost_get@example.com")
        h = _auth(user)
        group_id = _create_group(client, h).json()["id"]
        client.post(f"/groups/{group_id}/posts", json={"text": "Post 1"}, headers=h)
        r = client.get(f"/groups/{group_id}/posts", headers=h)
        assert r.status_code == 200
        assert any(p["text"] == "Post 1" for p in r.json())


class TestGroupLeaderboard:
    def test_leaderboard_returns_members(self, client, db):
        user = _make_user(db, email="lb_user@example.com")
        h = _auth(user)
        group_id = _create_group(client, h).json()["id"]
        r = client.get(f"/groups/{group_id}/leaderboard", headers=h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
