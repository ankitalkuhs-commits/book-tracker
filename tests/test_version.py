"""Tests for GET /version — unauthenticated deploy-verification endpoint."""
import pytest


class TestVersion:
    @pytest.fixture(autouse=True)
    def _clean_render_env(self, monkeypatch):
        monkeypatch.delenv("RENDER_GIT_COMMIT", raising=False)
        monkeypatch.delenv("RENDER_GIT_BRANCH", raising=False)
        monkeypatch.delenv("RENDER_SERVICE_NAME", raising=False)

    def test_version_all_null_when_env_unset(self, client):
        r = client.get("/version")
        assert r.status_code == 200
        assert r.json() == {"commit": None, "service": None, "branch": None}

    def test_version_reflects_render_env_vars(self, client, monkeypatch):
        monkeypatch.setenv("RENDER_GIT_COMMIT", "b8b6124abcdef")
        monkeypatch.setenv("RENDER_SERVICE_NAME", "book-tracker-stitch")
        monkeypatch.setenv("RENDER_GIT_BRANCH", "master")
        r = client.get("/version")
        assert r.json() == {
            "commit": "b8b6124abcdef",
            "service": "book-tracker-stitch",
            "branch": "master",
        }

    def test_version_returns_exactly_three_keys(self, client, monkeypatch):
        monkeypatch.setenv("RENDER_GIT_COMMIT", "b8b6124abcdef")
        monkeypatch.setenv("RENDER_SERVICE_NAME", "book-tracker-stitch")
        monkeypatch.setenv("RENDER_GIT_BRANCH", "master")
        r = client.get("/version")
        assert set(r.json()) == {"commit", "service", "branch"}

    def test_version_requires_no_auth(self, client):
        r1 = client.get("/version")
        assert r1.status_code == 200
        r2 = client.get("/version", headers={"Authorization": "Bearer garbage"})
        assert r2.status_code == 200
        assert r1.json() == r2.json()

    def test_version_leaks_no_other_env_var(self, client, monkeypatch):
        monkeypatch.setenv("REVIEW_LOGIN_SECRET", "leak-canary-review-secret")
        monkeypatch.setenv("DATABASE_URL", "postgresql://leak-canary-db")
        monkeypatch.setenv("BT_DECOY_ENV", "leak-canary-decoy")
        monkeypatch.setenv("RENDER_GIT_COMMIT", "b8b6124abcdef")
        monkeypatch.setenv("RENDER_SERVICE_NAME", "book-tracker-stitch")
        monkeypatch.setenv("RENDER_GIT_BRANCH", "master")

        r = client.get("/version")
        assert r.status_code == 200
        blob = r.text

        for canary in ("leak-canary-review-secret", "leak-canary-db", "leak-canary-decoy"):
            assert canary not in blob
        import os
        assert os.environ["SECRET_KEY"] not in blob
        for key_name in ("SECRET_KEY", "DATABASE_URL", "REVIEW_LOGIN_SECRET"):
            assert key_name not in blob

    def test_version_partial_env_returns_null_for_the_rest(self, client, monkeypatch):
        monkeypatch.setenv("RENDER_GIT_COMMIT", "only-commit-set")
        r = client.get("/version")
        assert r.json() == {"commit": "only-commit-set", "service": None, "branch": None}

    def test_version_read_per_request_not_at_import(self, client, monkeypatch):
        body_a = client.get("/version").json()
        assert body_a["commit"] is None

        monkeypatch.setenv("RENDER_GIT_COMMIT", "second-read")
        body_b = client.get("/version").json()
        assert body_b["commit"] == "second-read"
