"""Tests for F-56 (security headers) and F-58 (CORS-safe JSON 500s) — app/main.py."""
import logging

import pytest

from app.main import app


SEC = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
}
ORIGIN = "https://www.trackmyread.com"


def _assert_security_headers(headers):
    for k, v in SEC.items():
        assert headers.get(k) == v, f"missing/wrong header {k}"


@pytest.fixture()
def boom_route():
    async def _boom():
        raise RuntimeError("boom-secret-detail")
    app.add_api_route("/__test_boom", _boom, methods=["GET"])
    yield
    app.router.routes[:] = [r for r in app.router.routes if getattr(r, "path", None) != "/__test_boom"]


class TestSecurityHeaders:
    def test_headers_on_200(self, client):
        r = client.get("/version")
        assert r.status_code == 200
        _assert_security_headers(r.headers)

    def test_headers_on_404(self, client):
        r = client.get("/does-not-exist-4a")
        assert r.status_code == 404
        _assert_security_headers(r.headers)

    def test_headers_on_401_and_422(self, client, alice_headers):
        r401 = client.get("/profile/me")
        assert r401.status_code == 401
        _assert_security_headers(r401.headers)

        # Bounded by A2's own F-51 change (notes/notifications' F-51 bound is A1's, not
        # available standalone in this worktree) — any 422 proves the same thing here.
        r422 = client.get("/books/recommendations?limit=-1", headers=alice_headers)
        assert r422.status_code == 422
        _assert_security_headers(r422.headers)

    def test_preflight_keeps_cors_and_gets_headers(self, client):
        r = client.options(
            "/notes/feed",
            headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET"},
        )
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == ORIGIN
        _assert_security_headers(r.headers)

    def test_foreign_origin_no_allow_header(self, client):
        r = client.options(
            "/notes/feed",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
        )
        allow = r.headers.get("access-control-allow-origin")
        assert allow not in ("https://evil.example", "*")
        _assert_security_headers(r.headers)


class TestUnhandledException:
    def test_unhandled_exception_500_has_cors_and_json(self, client, boom_route):
        r = client.get("/__test_boom", headers={"Origin": ORIGIN})
        assert r.status_code == 500
        assert r.json() == {"detail": "Internal Server Error"}
        assert r.headers.get("access-control-allow-origin") == ORIGIN
        _assert_security_headers(r.headers)
        assert "boom-secret-detail" not in r.text
        assert "Traceback" not in r.text

    def test_unhandled_exception_logged(self, client, boom_route, caplog):
        caplog.set_level(logging.ERROR, logger="app.errors")
        client.get("/__test_boom")
        records = [rec for rec in caplog.records if rec.name == "app.errors" and rec.levelno == logging.ERROR]
        assert len(records) == 1
        msg = records[0].getMessage()
        assert "GET" in msg
        assert "/__test_boom" in msg
        assert records[0].exc_info is not None

    def test_error_log_has_no_query_string(self, client, boom_route, caplog):
        caplog.set_level(logging.ERROR, logger="app.errors")
        client.get("/__test_boom?secret=qa-f58-query")
        for rec in caplog.records:
            assert "qa-f58-query" not in rec.getMessage()
            assert "secret=" not in rec.getMessage()
        assert "qa-f58-query" not in caplog.text
        assert "secret=" not in caplog.text
