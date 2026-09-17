"""Tests for /groups/* endpoints."""
import pytest
from tests.conftest import _make_user, _auth


def _create_group(client, headers, name="Test Circle", is_private=False):
    return client.post("/groups/", json={"name": name, "is_private": is_private, "description": "A test group"}, headers=headers)


class TestGroupsCRUD:
    G16 = {
        "cover_preset", "created_at", "created_by", "creator_name", "current_book", "description",
        "goal_pages", "goal_period", "goal_start_date", "id", "invite_code", "is_private",
        "member_count", "membership_role", "membership_status", "name",
    }
    CB7 = {"id", "title", "author", "cover_url", "google_books_id", "isbn", "total_pages"}

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

    # ── F-15: circle goal aliases (T-A2-31..35) ──────────────────────────────

    def test_create_accepts_reading_goal_alias(self, client, db):
        user = _make_user(db, email="f15_alias@example.com")
        r = client.post("/groups/", json={
            "name": "F15 alias", "is_private": False, "reading_goal": 1000, "goal_period": "monthly",
        }, headers=_auth(user))
        assert r.status_code == 201
        body = r.json()
        assert body["goal_pages"] == 1000
        assert body["goal_period"] == "monthly"
        assert body["goal_start_date"] is not None

    def test_goal_pages_wins_over_alias(self, client, db):
        user = _make_user(db, email="f15_both@example.com")
        r = client.post("/groups/", json={
            "name": "F15 both", "goal_pages": 500, "reading_goal": 1000, "goal_period": "yearly",
        }, headers=_auth(user))
        assert r.status_code == 201
        assert r.json()["goal_pages"] == 500

    def test_get_group_returns_reading_goal_and_pages_read_total(self, client, db):
        curator = _make_user(db, email="f15_goal_curator@example.com")
        h = _auth(curator)
        g = client.post("/groups/", json={
            "name": "F15 Goal Circle", "is_private": False, "goal_pages": 1000, "goal_period": "monthly",
        }, headers=h).json()
        add = client.post("/books/add-to-library", json={
            "title": "F15 Goal Book", "total_pages": 500, "status": "reading",
        }, headers=h)
        ub_id = add.json()["id"]
        client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 120}, headers=h)
        goal = client.get(f"/groups/{g['id']}/goal", headers=h).json()
        got = client.get(f"/groups/{g['id']}", headers=h).json()
        assert set(got.keys()) == self.G16 | {"reading_goal", "pages_read_total"}
        assert got["reading_goal"] == 1000
        assert got["pages_read_total"] == goal["pages_read"] == 120

    def test_get_group_no_goal_pages_read_total_zero(self, client, db):
        user = _make_user(db, email="f15_nogoal@example.com")
        g = _create_group(client, _auth(user)).json()
        got = client.get(f"/groups/{g['id']}", headers=_auth(user)).json()
        assert got["reading_goal"] is None
        assert got["pages_read_total"] == 0

    def test_goal_endpoint_shape_unchanged(self, client, db):
        curator = _make_user(db, email="f15_shape_curator@example.com")
        h = _auth(curator)
        g = client.post("/groups/", json={
            "name": "F15 Shape Circle", "is_private": False, "goal_pages": 1000, "goal_period": "monthly",
        }, headers=h).json()
        goal = client.get(f"/groups/{g['id']}/goal", headers=h).json()
        assert set(goal.keys()) == {"goal_pages", "goal_period", "pages_read", "pct"}
        no_goal_user = _make_user(db, email="f15_shape_nogoal@example.com")
        g2 = _create_group(client, _auth(no_goal_user)).json()
        goal2 = client.get(f"/groups/{g2['id']}/goal", headers=_auth(no_goal_user)).json()
        assert goal2 == {"goal_pages": None, "pages_read": 0, "pct": 0}

    # ── F-07: current_book / set_group_book dedup keys (T-A2-36..38) ────────

    def test_current_book_has_dedup_keys(self, client, db):
        curator = _make_user(db, email="f07_grp_curator@example.com")
        h = _auth(curator)
        add = client.post("/books/add-to-library", json={
            "title": "F07 G", "author": "QA", "google_books_id": "f07-G-gid", "isbn": "f07-G-isbn",
            "total_pages": 321, "status": "reading",
        }, headers=h)
        G = add.json()["book"]["id"]
        g = _create_group(client, h, name="F07 Circle").json()
        client.put(f"/groups/{g['id']}/book", json={"book_id": G}, headers=h)
        got = client.get(f"/groups/{g['id']}", headers=h).json()
        assert set(got["current_book"].keys()) == self.CB7
        assert got["current_book"]["google_books_id"] == "f07-G-gid"
        assert got["current_book"]["isbn"] == "f07-G-isbn"
        assert got["current_book"]["total_pages"] == 321
        put_r = client.put(f"/groups/{g['id']}", json={"description": "F07"}, headers=h).json()
        assert set(put_r["current_book"].keys()) == self.CB7
        g2 = _create_group(client, h, name="F07 Circle 2").json()
        assert g2["current_book"] is None

    def test_set_group_book_response_has_dedup_keys(self, client, db):
        curator = _make_user(db, email="f07_setbook_curator@example.com")
        h = _auth(curator)
        add = client.post("/books/add-to-library", json={
            "title": "F07 SB", "author": "QA", "google_books_id": "f07-sb-gid", "isbn": "f07-sb-isbn",
            "total_pages": 200, "status": "reading",
        }, headers=h)
        SB = add.json()["book"]["id"]
        g = _create_group(client, h, name="F07 SB Circle").json()
        r = client.put(f"/groups/{g['id']}/book", json={"book_id": SB}, headers=h)
        assert set(r.json().keys()) == self.CB7

    def test_private_group_goal_fields_still_403_for_non_member(self, client, db):
        curator = _make_user(db, email="f15_priv_curator@example.com")
        outsider = _make_user(db, email="f15_priv_outsider@example.com")
        g = client.post("/groups/", json={
            "name": "F15 Priv Circle", "is_private": True, "goal_pages": 500, "goal_period": "monthly",
        }, headers=_auth(curator)).json()
        r1 = client.get(f"/groups/{g['id']}", headers=_auth(outsider))
        r2 = client.get(f"/groups/{g['id']}/goal", headers=_auth(outsider))
        assert r1.status_code == 403
        assert r2.status_code == 403
        assert "pages_read_total" not in r1.text


# ── F-50: group delete leaves no orphaned rows (T-A2-15) ────────────────────

class TestGroupDelete:
    def test_delete_group_with_activity_leaves_no_rows(self, client, db):
        from sqlmodel import select
        from app.models import GroupActivity
        creator = _make_user(db, email="f50_grpdel_creator@example.com")
        member = _make_user(db, email="f50_grpdel_member@example.com")
        ch, mh = _auth(creator), _auth(member)
        g = _create_group(client, ch, name="F50 Delete Circle").json()
        client.post(f"/groups/{g['id']}/join", headers=mh)
        add = client.post("/books/add-to-library", json={
            "title": "F50 Circle Book", "total_pages": 100, "status": "to-read",
        }, headers=ch)
        book_id = add.json()["book"]["id"]
        client.put(f"/groups/{g['id']}/book", json={"book_id": book_id}, headers=ch)
        db.expire_all()
        rows = db.exec(select(GroupActivity).where(GroupActivity.group_id == g["id"])).all()
        assert len(rows) >= 2

        r = client.delete(f"/groups/{g['id']}", headers=ch)
        assert r.status_code == 204
        db.expire_all()
        rows_after = db.exec(select(GroupActivity).where(GroupActivity.group_id == g["id"])).all()
        assert len(rows_after) == 0
        assert client.get(f"/groups/{g['id']}", headers=ch).status_code == 404

        other_g = _create_group(client, ch, name="F50 Other Circle").json()
        r_other = client.delete(f"/groups/{other_g['id']}", headers=mh)
        assert r_other.status_code in (403, 404)


# ── F-51: bounded group activity limit (T-A2-39) ────────────────────────────

def test_activity_limit_bounds_422(client, db):
    user = _make_user(db, email="f51_activity_limit@example.com")
    h = _auth(user)
    g = _create_group(client, h, name="F51 Activity Circle").json()
    for limit, expected in [(0, 422), (-1, 422), (201, 422), (200, 200), (1, 200)]:
        r = client.get(f"/groups/{g['id']}/activity?limit={limit}", headers=h)
        assert r.status_code == expected, f"limit={limit}"


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
