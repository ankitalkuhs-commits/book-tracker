"""Tests for /reading-activity/* endpoints."""
from tests.conftest import _make_user, _auth


def _add_book(client, headers, title="Test Book", pages=200, status="reading"):
    return client.post("/books/add-to-library", json={
        "title": title, "total_pages": pages, "status": status
    }, headers=headers)


class TestDailyStats:
    def test_daily_requires_auth(self, client):
        r = client.get("/reading-activity/daily")
        assert r.status_code == 401

    def test_daily_returns_correct_shape(self, client, db):
        user = _make_user(db, email="ra_daily@example.com")
        r = client.get("/reading-activity/daily", headers=_auth(user))
        assert r.status_code == 200
        data = r.json()
        assert "days" in data
        assert "data" in data
        assert isinstance(data["data"], list)
        assert data["days"] == 30  # default

    def test_daily_data_has_date_and_pages(self, client, db):
        user = _make_user(db, email="ra_shape@example.com")
        r = client.get("/reading-activity/daily", headers=_auth(user))
        data = r.json()["data"]
        assert len(data) == 30
        assert all("date" in d and "pages_read" in d for d in data)

    def test_daily_custom_days_param(self, client, db):
        user = _make_user(db, email="ra_days@example.com")
        r = client.get("/reading-activity/daily?days=7", headers=_auth(user))
        assert r.status_code == 200
        assert r.json()["days"] == 7
        assert len(r.json()["data"]) == 7

    def test_daily_zero_pages_for_new_user(self, client, db):
        user = _make_user(db, email="ra_zero@example.com")
        r = client.get("/reading-activity/daily", headers=_auth(user))
        assert all(d["pages_read"] == 0 for d in r.json()["data"])

    def test_pages_logged_after_progress_update(self, client, db):
        """Progress updates should log reading activity."""
        user = _make_user(db, email="ra_progress@example.com")
        h = _auth(user)
        add = _add_book(client, h, title="Activity Book", pages=200, status="reading")
        ub_id = add.json()["userbook"]["id"]
        client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 50}, headers=h)
        r = client.get("/reading-activity/daily?days=1", headers=h)
        today_pages = r.json()["data"][-1]["pages_read"]
        assert today_pages >= 50


class TestInsights:
    def test_insights_requires_auth(self, client):
        r = client.get("/reading-activity/insights")
        assert r.status_code == 401

    def test_insights_returns_correct_shape(self, client, db):
        user = _make_user(db, email="ra_insights@example.com")
        r = client.get("/reading-activity/insights", headers=_auth(user))
        assert r.status_code == 200
        data = r.json()
        expected_keys = [
            "total_books", "total_finished", "total_reading",
            "finished_this_year", "total_pages_read", "avg_pages_per_day",
            "current_streak", "longest_streak", "avg_rating",
            "yearly_goal", "monthly_pages", "projected_finishes"
        ]
        for key in expected_keys:
            assert key in data, f"Missing key: {key}"

    def test_insights_new_user_all_zeros(self, client, db):
        user = _make_user(db, email="ra_zeros@example.com")
        r = client.get("/reading-activity/insights", headers=_auth(user))
        data = r.json()
        assert data["total_books"] == 0
        assert data["total_finished"] == 0
        assert data["current_streak"] == 0
        assert data["avg_rating"] is None
        assert data["yearly_goal"] is None

    def test_insights_counts_finished_book(self, client, db):
        user = _make_user(db, email="ra_finished@example.com")
        h = _auth(user)
        _add_book(client, h, title="Finished Book", pages=100, status="finished")
        r = client.get("/reading-activity/insights", headers=h)
        data = r.json()
        assert data["total_books"] >= 1
        assert data["total_finished"] >= 1

    def test_insights_counts_reading_book(self, client, db):
        user = _make_user(db, email="ra_reading@example.com")
        h = _auth(user)
        _add_book(client, h, title="Reading Book", pages=300, status="reading")
        r = client.get("/reading-activity/insights", headers=h)
        assert r.json()["total_reading"] >= 1

    def test_insights_yearly_goal_progress(self, client, db):
        user = _make_user(db, email="ra_goal@example.com")
        h = _auth(user)
        client.put("/profile/me", json={"yearly_goal": 12}, headers=h)
        r = client.get("/reading-activity/insights", headers=h)
        goal = r.json()["yearly_goal"]
        assert goal is not None
        assert goal["goal"] == 12
        assert "completed" in goal
        assert "pct" in goal
        assert "on_track" in goal

    def test_insights_monthly_pages_has_12_months(self, client, db):
        user = _make_user(db, email="ra_monthly@example.com")
        r = client.get("/reading-activity/insights", headers=_auth(user))
        assert len(r.json()["monthly_pages"]) == 12

    def test_insights_projected_finishes_when_reading(self, client, db):
        """With a reading book and some progress, projected_finishes may be populated."""
        user = _make_user(db, email="ra_proj@example.com")
        h = _auth(user)
        add = _add_book(client, h, title="Long Book", pages=500, status="reading")
        ub_id = add.json()["userbook"]["id"]
        client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 100}, headers=h)
        r = client.get("/reading-activity/insights", headers=h)
        # projected_finishes is a list (may be empty if avg_pages_per_day == 0)
        assert isinstance(r.json()["projected_finishes"], list)

    def test_insights_avg_rating_when_rated(self, client, db):
        user = _make_user(db, email="ra_rated@example.com")
        h = _auth(user)
        add = _add_book(client, h, title="Rated Book", pages=100, status="finished")
        ub_id = add.json()["userbook"]["id"]
        client.patch(f"/userbooks/{ub_id}", json={"rating": 4}, headers=h)
        r = client.get("/reading-activity/insights", headers=h)
        assert r.json()["avg_rating"] == 4.0


class TestPublicUserDaily:
    def test_other_user_daily_public_profile(self, client, db):
        viewer = _make_user(db, email="ra_viewer@example.com")
        target = _make_user(db, email="ra_target@example.com")
        r = client.get(f"/reading-activity/user/{target.id}/daily", headers=_auth(viewer))
        assert r.status_code == 200
        assert "data" in r.json()

    def test_nonexistent_user_returns_404(self, client, db):
        viewer = _make_user(db, email="ra_nouser@example.com")
        r = client.get("/reading-activity/user/999999/daily", headers=_auth(viewer))
        assert r.status_code == 404

    def test_private_profile_blocked_for_non_follower(self, client, db):
        viewer = _make_user(db, email="ra_priv_viewer@example.com")
        target = _make_user(db, email="ra_priv_target@example.com")
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(target))
        r = client.get(f"/reading-activity/user/{target.id}/daily", headers=_auth(viewer))
        assert r.status_code == 403

    def test_private_profile_visible_to_follower(self, client, db):
        viewer = _make_user(db, email="ra_priv_fol_viewer@example.com")
        target = _make_user(db, email="ra_priv_fol_target@example.com")
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(target))
        client.post(f"/follow/{target.id}", headers=_auth(viewer))
        r = client.get(f"/reading-activity/user/{target.id}/daily", headers=_auth(viewer))
        assert r.status_code == 200
