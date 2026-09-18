"""Tests for /reading-activity/* endpoints."""
from datetime import datetime, timedelta

from tests.conftest import _make_user, _auth


def _add_book(client, headers, title="Test Book", pages=200, status="reading"):
    return client.post("/books/add-to-library", json={
        "title": title, "total_pages": pages, "status": status
    }, headers=headers)


def _log_activity(db, user_id, userbook_id, days_ago, pages=10):
    from app.models import ReadingActivity
    db.add(ReadingActivity(
        user_id=user_id,
        userbook_id=userbook_id,
        date=datetime.utcnow() - timedelta(days=days_ago),
        pages_read=pages,
    ))
    db.commit()
    db.expire_all()


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
        ub_id = add.json()["id"]
        client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 50}, headers=h)
        r = client.get("/reading-activity/daily?days=1", headers=h)
        today_pages = r.json()["data"][-1]["pages_read"]
        assert today_pages >= 50

    def test_daily_shape_unchanged_after_insights_fix(self, client, db):
        user = _make_user(db, email="ra_daily_shape@example.com")
        h = _auth(user)
        add = _add_book(client, h, title="Daily Shape Book", pages=200, status="reading")
        ub_id = add.json()["id"]
        _log_activity(db, user.id, ub_id, days_ago=0, pages=5)

        r = client.get("/reading-activity/daily", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert set(data.keys()) == {"days", "data"}
        assert data["days"] == 30
        assert len(data["data"]) == 30
        for d in data["data"]:
            assert set(d.keys()) == {"date", "pages_read"}
            assert isinstance(d["pages_read"], int)
        today = datetime.utcnow().date().isoformat()
        assert data["data"][-1]["date"] == today

        r7 = client.get("/reading-activity/daily?days=7", headers=h)
        assert r7.status_code == 200
        assert len(r7.json()["data"]) == 7

    # ── F-51: bounded `days` (T-A2-42) ───────────────────────────────────────

    def test_days_bounds_422(self, client, db):
        user = _make_user(db, email="f51_days_bounds@example.com")
        h = _auth(user)
        for days, expected in [(0, 422), (-1, 422), (201, 422), (200, 200), (1, 200)]:
            r = client.get(f"/reading-activity/daily?days={days}", headers=h)
            assert r.status_code == expected, f"days={days}"

        public_user = _make_user(db, email="f51_days_public@example.com")
        for days, expected in [(0, 422), (201, 422), (200, 200)]:
            r = client.get(f"/reading-activity/user/{public_user.id}/daily?days={days}", headers=h)
            assert r.status_code == expected, f"days={days}"

    # ── §9 R-16 — cross-package regression: activity charts ─────────────────

    def test_recorded_caller_days_values_200(self, client, db):
        """R-16: days=7, 30, 90 on both daily routes (getMyActivity / getUserActivity)
        -> 200 with the existing shape. Every in-the-wild value must sit inside F-51's
        new 1..200 bound."""
        user = _make_user(db, email="r16_days@example.com")
        h = _auth(user)
        for days in (7, 30, 90):
            r = client.get(f"/reading-activity/daily?days={days}", headers=h)
            assert r.status_code == 200, f"own daily days={days}"
            assert r.json()["days"] == days
            assert len(r.json()["data"]) == days

        other = _make_user(db, email="r16_days_other@example.com")
        for days in (7, 30, 90):
            r = client.get(f"/reading-activity/user/{other.id}/daily?days={days}", headers=h)
            assert r.status_code == 200, f"user daily days={days}"
            assert r.json()["days"] == days
            assert len(r.json()["data"]) == days


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
        ub_id = add.json()["id"]
        client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 100}, headers=h)
        r = client.get("/reading-activity/insights", headers=h)
        # projected_finishes is a list (may be empty if avg_pages_per_day == 0)
        assert isinstance(r.json()["projected_finishes"], list)

    def test_insights_avg_rating_when_rated(self, client, db):
        user = _make_user(db, email="ra_rated@example.com")
        h = _auth(user)
        add = _add_book(client, h, title="Rated Book", pages=100, status="finished")
        ub_id = add.json()["id"]
        client.patch(f"/userbooks/{ub_id}", json={"rating": 4}, headers=h)
        r = client.get("/reading-activity/insights", headers=h)
        assert r.json()["avg_rating"] == 4.0

    # ── F-13 + F-14: Android <=2.2.1 aliases (T-A2-40, T-A2-41) ──────────────

    def test_yearly_goal_has_completed_and_finished_alias(self, client, db):
        user = _make_user(db, email="f13_yearly_goal@example.com")
        h = _auth(user)
        client.put("/profile/me", json={"yearly_goal": 12}, headers=h)
        _add_book(client, h, title="F13 Finished Book", pages=100, status="finished")
        r = client.get("/reading-activity/insights", headers=h)
        goal = r.json()["yearly_goal"]
        assert set(goal.keys()) == {"goal", "completed", "pct", "on_track", "finished"}
        assert goal["finished"] == goal["completed"] == 1

    def test_mobile_alias_keys_present(self, client, db):
        user = _make_user(db, email="f14_mobile_alias@example.com")
        h = _auth(user)
        finished = _add_book(client, h, title="F14 Finished", pages=100, status="finished")
        ub_id = finished.json()["id"]
        client.patch(f"/userbooks/{ub_id}", json={"rating": 4}, headers=h)
        reading = _add_book(client, h, title="F14 Reading", pages=300, status="reading")
        r_ub_id = reading.json()["id"]
        client.put(f"/userbooks/{r_ub_id}/progress", json={"current_page": 30}, headers=h)
        r = client.get("/reading-activity/insights", headers=h)
        data = r.json()
        assert set(data.keys()) == {
            "avg_pages_per_day", "avg_rating", "current_streak", "finished_this_year",
            "longest_streak", "monthly_pages", "projected_finishes", "total_books",
            "total_finished", "total_pages_read", "total_reading", "yearly_goal",
            "average_rating", "books_this_year",
        }
        assert data["average_rating"] == data["avg_rating"]
        assert data["books_this_year"] == data["finished_this_year"]
        for p in data["projected_finishes"]:
            assert p["projected_finish_date"] == p["projected_finish"]

    # ── §9 R-15 — cross-package regression: insights ─────────────────────────

    def test_insights_monthly_pages_shape_unchanged(self, client, db):
        """R-15: stays green unchanged (the strict monthly_pages key-set test above at
        TestInsightsMonthBuckets), and the 12 measured top-level keys are still all
        present after the 4 F-13/F-14 aliases are added."""
        user = _make_user(db, email="r15_insights@example.com")
        r = client.get("/reading-activity/insights", headers=_auth(user))
        assert r.status_code == 200
        data = r.json()
        original_12 = {
            "total_books", "total_finished", "total_reading", "finished_this_year",
            "total_pages_read", "avg_pages_per_day", "current_streak", "longest_streak",
            "avg_rating", "yearly_goal", "monthly_pages", "projected_finishes",
        }
        assert original_12 <= set(data.keys())
        for e in data["monthly_pages"]:
            assert set(e.keys()) == {"month", "pages_read"}


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


class TestInsightsMonthBuckets:
    """R4 — monthly_pages walks real calendar months, never a 30-day step."""

    def test_insights_monthly_has_exactly_12_entries(self, client, db):
        user = _make_user(db, email="ramb_12@example.com")
        r = client.get("/reading-activity/insights", headers=_auth(user))
        assert len(r.json()["monthly_pages"]) == 12

    def test_insights_monthly_months_match_independent_calendar_walk(self, client, db):
        user = _make_user(db, email="ramb_walk@example.com")
        today = datetime.utcnow().date()
        expected = []
        y, m = today.year, today.month
        for _ in range(12):
            expected.append(f"{y}-{m:02d}")
            m -= 1
            if m == 0:
                m, y = 12, y - 1
        expected.reverse()

        r = client.get("/reading-activity/insights", headers=_auth(user))
        got = [e["month"] for e in r.json()["monthly_pages"]]
        assert got == expected
        assert got[-1] == f"{today.year}-{today.month:02d}"

    def test_insights_monthly_months_are_consecutive_and_unique(self, client, db):
        user = _make_user(db, email="ramb_consec@example.com")
        r = client.get("/reading-activity/insights", headers=_auth(user))
        months = r.json()["monthly_pages"]
        pairs = [tuple(int(p) for p in e["month"].split("-")) for e in months]
        assert len(pairs) == 12
        assert len(set(pairs)) == 12
        for i in range(1, len(pairs)):
            y, m = pairs[i - 1]
            expected_next = (y + 1, 1) if m == 12 else (y, m + 1)
            assert pairs[i] == expected_next
        today = datetime.utcnow().date()
        assert pairs[-1] == (today.year, today.month)

    def test_insights_monthly_covers_every_month_number_once(self, client, db):
        user = _make_user(db, email="ramb_allmonths@example.com")
        r = client.get("/reading-activity/insights", headers=_auth(user))
        nums = sorted(int(e["month"].split("-")[1]) for e in r.json()["monthly_pages"])
        assert nums == list(range(1, 13))

    def test_insights_monthly_pages_bucketed_into_correct_month(self, client, db):
        user = _make_user(db, email="ramb_bucket@example.com")
        h = _auth(user)
        add = _add_book(client, h, title="Bucket Book", pages=300, status="reading")
        ub_id = add.json()["id"]
        _log_activity(db, user.id, ub_id, days_ago=0, pages=7)
        _log_activity(db, user.id, ub_id, days_ago=70, pages=13)

        key0 = datetime.utcnow().date()
        key0 = f"{key0.year}-{key0.month:02d}"
        key70 = (datetime.utcnow() - timedelta(days=70)).date()
        key70 = f"{key70.year}-{key70.month:02d}"

        r = client.get("/reading-activity/insights", headers=h)
        by_month = {e["month"]: e["pages_read"] for e in r.json()["monthly_pages"]}
        assert key0 in by_month
        assert key70 in by_month
        if key0 != key70:
            assert by_month[key0] == 7
            assert by_month[key70] == 13

    def test_insights_monthly_pages_shape_unchanged(self, client, db):
        user = _make_user(db, email="ramb_shape@example.com")
        r = client.get("/reading-activity/insights", headers=_auth(user))
        months = r.json()["monthly_pages"]
        assert isinstance(months, list)
        import re
        for e in months:
            assert set(e.keys()) == {"month", "pages_read"}
            assert re.match(r"^\d{4}-\d{2}$", e["month"])
            assert isinstance(e["pages_read"], int)


class TestInsightsStreak:
    """R4 — current_streak anchors on today if active, else yesterday."""

    def test_insights_streak_one_when_only_today(self, client, db):
        user = _make_user(db, email="ras_today@example.com")
        h = _auth(user)
        add = _add_book(client, h, title="Streak Today", pages=200, status="reading")
        ub_id = add.json()["id"]
        _log_activity(db, user.id, ub_id, days_ago=0)
        r = client.get("/reading-activity/insights", headers=h)
        assert r.json()["current_streak"] == 1

    def test_insights_streak_one_when_only_yesterday(self, client, db):
        user = _make_user(db, email="ras_yesterday@example.com")
        h = _auth(user)
        add = _add_book(client, h, title="Streak Yesterday", pages=200, status="reading")
        ub_id = add.json()["id"]
        _log_activity(db, user.id, ub_id, days_ago=1)
        r = client.get("/reading-activity/insights", headers=h)
        data = r.json()
        assert data["current_streak"] == 1
        assert data["longest_streak"] == 1

    def test_insights_streak_two_for_yesterday_and_today(self, client, db):
        user = _make_user(db, email="ras_both@example.com")
        h = _auth(user)
        add = _add_book(client, h, title="Streak Both", pages=200, status="reading")
        ub_id = add.json()["id"]
        _log_activity(db, user.id, ub_id, days_ago=0)
        _log_activity(db, user.id, ub_id, days_ago=1)
        r = client.get("/reading-activity/insights", headers=h)
        data = r.json()
        assert data["current_streak"] == 2
        assert data["longest_streak"] == 2

    def test_insights_streak_zero_when_last_activity_two_days_ago(self, client, db):
        user = _make_user(db, email="ras_twoago@example.com")
        h = _auth(user)
        add = _add_book(client, h, title="Streak Two Ago", pages=200, status="reading")
        ub_id = add.json()["id"]
        _log_activity(db, user.id, ub_id, days_ago=2)
        r = client.get("/reading-activity/insights", headers=h)
        data = r.json()
        assert data["current_streak"] == 0
        assert data["longest_streak"] == 1

    def test_insights_streak_zero_for_user_with_no_activity(self, client, db):
        user = _make_user(db, email="ras_none@example.com")
        r = client.get("/reading-activity/insights", headers=_auth(user))
        data = r.json()
        assert data["current_streak"] == 0
        assert data["longest_streak"] == 0

    def test_insights_longest_streak_unaffected_by_anchor_change(self, client, db):
        user = _make_user(db, email="ras_longest@example.com")
        h = _auth(user)
        add = _add_book(client, h, title="Streak Longest", pages=200, status="reading")
        ub_id = add.json()["id"]
        for days_ago in (10, 11, 12):
            _log_activity(db, user.id, ub_id, days_ago=days_ago)
        r = client.get("/reading-activity/insights", headers=h)
        data = r.json()
        assert data["current_streak"] == 0
        assert data["longest_streak"] == 3
