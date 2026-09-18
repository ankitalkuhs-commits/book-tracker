"""Tests for /api/googlebooks/* — F-19 (null covers), F-29 (anonymous quota), F-54 (deep pagination)."""
import json as _json
import logging

import httpx
import pytest

import app.routers.googlebooks_router as gb
from tests.conftest import _make_user, _auth


VOLUMES = {
    "gb-img": {"id": "gb-img", "volumeInfo": {"title": "Img Book", "imageLinks": {"thumbnail": "http://books.google.com/x"}}},
    "gb-noimg": {"id": "gb-noimg", "volumeInfo": {"title": "NoImg Book"}},
}


def _resp(status_code=200, json_data=None):
    content = _json.dumps(json_data if json_data is not None else {}).encode()
    return httpx.Response(status_code, content=content, request=httpx.Request("GET", "http://fake"))


class _FakeAsyncClient:
    """Fake httpx.AsyncClient — records calls, serves VOLUMES, and can be told to fail."""
    calls = []
    behavior = {}

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, params=None, timeout=None):
        _FakeAsyncClient.calls.append((url, params))
        if _FakeAsyncClient.behavior.get("raise_error"):
            raise _FakeAsyncClient.behavior["raise_error"]
        status_override = _FakeAsyncClient.behavior.get("status_override")
        if status_override:
            return _resp(status_override, {"error": "boom-google-error-text"})
        if url.endswith("/volumes"):
            return _resp(200, {"totalItems": 2, "items": [VOLUMES["gb-img"], VOLUMES["gb-noimg"]]})
        vol_id = url.rsplit("/", 1)[-1]
        vol = VOLUMES.get(vol_id)
        if vol is None:
            return _resp(404, {})
        return _resp(200, vol)


@pytest.fixture(autouse=True)
def _fake_google(monkeypatch):
    gb._anon_calls.clear()
    _FakeAsyncClient.calls = []
    _FakeAsyncClient.behavior = {}
    monkeypatch.setattr(gb, "httpx", httpx)  # ensure the module attribute exists as expected
    monkeypatch.setattr(gb.httpx, "AsyncClient", _FakeAsyncClient)
    yield
    gb._anon_calls.clear()


LR = {"detail": {"code": "login_required", "message": "Log in to keep searching"}}
SEARCH = "/api/googlebooks/search?query=hobbit"


# ── F-19: null cover when Google has no imageLinks (T-A2-50..54) ────────────

class TestNullCover:
    def test_item_without_imagelinks_has_null_cover(self, client, alice_headers):
        r = client.get(SEARCH, headers=alice_headers)
        assert r.status_code == 200
        item = next(x for x in r.json()["results"] if x["google_id"] == "gb-noimg")
        assert item["cover_url"] is None

    def test_item_with_imagelinks_has_frontcover_url(self, client, alice_headers):
        r = client.get(SEARCH, headers=alice_headers)
        assert r.status_code == 200
        item = next(x for x in r.json()["results"] if x["google_id"] == "gb-img")
        assert item["cover_url"] == gb.normalize_google_cover_url(
            "https://books.google.com/books/content?id=gb-img"
        )

    def test_book_detail_without_imagelinks_has_null_cover(self, client, alice_headers):
        r = client.get("/api/googlebooks/book/gb-noimg", headers=alice_headers)
        assert r.status_code == 200
        assert r.json()["cover_url"] is None

    def test_book_detail_with_imagelinks_has_frontcover_url(self, client, alice_headers):
        r = client.get("/api/googlebooks/book/gb-img", headers=alice_headers)
        assert r.status_code == 200
        assert r.json()["cover_url"] is not None

    def test_add_imageless_result_stores_null_cover(self, client, db, alice_headers):
        search = client.get(SEARCH, headers=alice_headers).json()
        item = next(x for x in search["results"] if x["google_id"] == "gb-noimg")
        r = client.post("/books/add-to-library", json={
            "title": item["title"], "google_books_id": "gb-noimg", "cover_url": item["cover_url"],
            "status": "to-read",
        }, headers=alice_headers)
        assert r.status_code == 200
        assert r.json()["book"]["cover_url"] is None
        from app.models import Book
        from sqlmodel import select
        book = db.exec(select(Book).where(Book.google_books_id == "gb-noimg")).first()
        assert book.cover_url is None


# ── F-29: anonymous quota (T-A2-55..65) ──────────────────────────────────────

class TestAnonymousQuota:
    def test_anonymous_first_two_calls_200(self, client):
        assert client.get(SEARCH).status_code == 200
        assert client.get(SEARCH).status_code == 200

    def test_anonymous_third_call_401_login_required(self, client):
        client.get(SEARCH)
        client.get(SEARCH)
        r = client.get(SEARCH)
        assert r.status_code == 401
        assert r.json() == LR
        assert len(_FakeAsyncClient.calls) == 2

    def test_quota_shared_between_search_and_book(self, client):
        assert client.get(SEARCH).status_code == 200
        assert client.get("/api/googlebooks/book/gb-img").status_code == 200
        r = client.get(SEARCH)
        assert r.status_code == 401
        assert r.json() == LR

    def test_authenticated_unlimited(self, client, alice_headers):
        for _ in range(5):
            assert client.get(SEARCH, headers=alice_headers).status_code == 200
        assert client.get("/api/googlebooks/book/gb-img", headers=alice_headers).status_code == 200
        assert gb._anon_calls == {}

    def test_different_ip_has_own_quota(self, client):
        h1 = {"X-Forwarded-For": "203.0.113.1"}
        h2 = {"X-Forwarded-For": "203.0.113.2"}
        assert client.get(SEARCH, headers=h1).status_code == 200
        assert client.get(SEARCH, headers=h1).status_code == 200
        assert client.get(SEARCH, headers=h2).status_code == 200
        assert client.get(SEARCH, headers=h1).status_code == 401

    def test_forged_leftmost_xff_counts_against_real_ip(self, client):
        for n in (1, 2, 3):
            headers = {"X-Forwarded-For": f"198.51.100.{n}, 203.0.113.9"}
            r = client.get(SEARCH, headers=headers)
            if n < 3:
                assert r.status_code == 200
            else:
                assert r.status_code == 401
        r_other = client.get(SEARCH, headers={"X-Forwarded-For": "203.0.113.10"})
        assert r_other.status_code == 200

    def test_no_xff_falls_back_to_client_host(self, client):
        assert client.get(SEARCH).status_code == 200
        assert client.get(SEARCH).status_code == 200
        assert client.get(SEARCH).status_code == 401
        assert len(gb._anon_calls) == 1

    def test_quota_resets_after_window(self, client, monkeypatch):
        holder = {"t": 1_000_000.0}
        monkeypatch.setattr(gb, "_clock", lambda: holder["t"])
        assert client.get(SEARCH).status_code == 200
        assert client.get(SEARCH).status_code == 200
        assert client.get(SEARCH).status_code == 401
        holder["t"] += 86401
        assert client.get(SEARCH).status_code == 200

    def test_invalid_token_counts_as_anonymous(self, client):
        headers = {"Authorization": "Bearer garbage"}
        assert client.get(SEARCH, headers=headers).status_code == 200
        assert client.get(SEARCH, headers=headers).status_code == 200
        r = client.get(SEARCH, headers=headers)
        assert r.status_code == 401
        assert r.json() == LR

    def test_raw_ip_not_stored(self, client, caplog):
        caplog.set_level(logging.DEBUG)
        client.get(SEARCH, headers={"X-Forwarded-For": "203.0.113.77"})
        for key in gb._anon_calls.keys():
            assert __import__("re").fullmatch(r"[0-9a-f]{64}", key)
        assert "203.0.113.77" not in repr(gb._anon_calls)
        assert "203.0.113.77" not in caplog.text

    def test_short_query_400_does_not_consume(self, client):
        for _ in range(3):
            r = client.get("/api/googlebooks/search?query=a")
            assert r.status_code == 400
            assert r.json() == {"detail": "Query must be at least 2 characters"}
        assert client.get(SEARCH).status_code == 200
        assert client.get(SEARCH).status_code == 200
        assert client.get(SEARCH).status_code == 401


# ── F-54: deep pagination + error handling (T-A2-66..69) ────────────────────

class TestDeepPagination:
    def test_start_index_999999_returns_empty_200_without_calling_google(self, client, alice_headers):
        r = client.get(
            "/api/googlebooks/search?query=harry%20potter&max_results=40&start_index=999999",
            headers=alice_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["results"] == []
        assert body["total_items"] == 0
        assert body["has_more"] is False
        assert body["next_start_index"] == 999999
        assert len(_FakeAsyncClient.calls) == 0

    def test_start_index_boundary_1000_empty_999_calls_google(self, client, alice_headers):
        r1000 = client.get("/api/googlebooks/search?query=hobbit&start_index=1000", headers=alice_headers)
        assert r1000.status_code == 200
        assert r1000.json()["results"] == []
        assert len(_FakeAsyncClient.calls) == 0

        r999 = client.get("/api/googlebooks/search?query=hobbit&start_index=999", headers=alice_headers)
        assert r999.status_code == 200
        assert len(_FakeAsyncClient.calls) == 1
        assert r999.json()["has_more"] is False

    def test_google_non_200_returns_502(self, client, alice_headers):
        _FakeAsyncClient.behavior["status_override"] = 500
        r = client.get(SEARCH, headers=alice_headers)
        assert r.status_code == 502
        assert "boom-google-error-text" not in r.text

        r2 = client.get("/api/googlebooks/book/gb-img", headers=alice_headers)
        assert r2.status_code == 502
        assert "boom-google-error-text" not in r2.text

    def test_google_transport_error_returns_502(self, client, alice_headers):
        _FakeAsyncClient.behavior["raise_error"] = httpx.ConnectError("boom-transport")
        r = client.get(SEARCH, headers=alice_headers)
        assert r.status_code == 502
        assert r.json() == {"detail": "Google Books is unavailable right now"}
        assert "boom-transport" not in r.text


# ── §9 R-18 — cross-package regression: book search ──────────────────────────

class TestSearchRegression:
    def test_normal_search_unchanged(self, client, alice_headers):
        """R-18: an authenticated search with the fake client returns the existing
        response shape including has_more and next_start_index; normalize_google_cover_url
        is unchanged (userbooks_router imports it)."""
        r = client.get(SEARCH, headers=alice_headers)
        assert r.status_code == 200
        body = r.json()
        assert set(body.keys()) == {"results", "total_items", "query_used", "has_more", "next_start_index"}
        assert body["total_items"] == 2
        assert body["has_more"] is False
        assert body["next_start_index"] == 40
        assert len(body["results"]) == 2
        item_keys = {"google_id", "title", "authors", "description", "cover_url",
                     "total_pages", "publisher", "published_date", "average_rating",
                     "ratings_count", "isbn_10", "isbn_13", "categories"}
        for item in body["results"]:
            assert set(item.keys()) == item_keys

        import app.routers.userbooks_router as ubr
        assert ubr.normalize_google_cover_url is gb.normalize_google_cover_url
