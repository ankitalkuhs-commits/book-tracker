"""Tests for /books/* and /userbooks/* endpoints."""
import pytest
from tests.conftest import _make_user, _auth
from app import crud


# ── helpers ──────────────────────────────────────────────────────────────────

def _add_book(client, headers, title="Dune", total_pages=412, status="to-read"):
    return client.post("/books/add-to-library", json={
        "title": title, "author": "Frank Herbert",
        "total_pages": total_pages, "status": status,
    }, headers=headers)


# ── /books/add-to-library ────────────────────────────────────────────────────

class TestAddToLibrary:
    def test_add_book(self, client, alice_headers):
        r = _add_book(client, alice_headers)
        assert r.status_code == 200
        assert r.json()["book"]["title"] == "Dune"

    def test_add_duplicate_book_for_same_user(self, client, alice_headers):
        _add_book(client, alice_headers, title="Duplicate Book")
        r = _add_book(client, alice_headers, title="Duplicate Book")
        # Endpoint is idempotent — returns existing userbook rather than 400
        assert r.status_code in (200, 400)

    def test_same_book_different_users(self, client, alice_headers, bob_headers):
        _add_book(client, alice_headers, title="SharedBook")
        r = _add_book(client, bob_headers, title="SharedBook")
        assert r.status_code == 200  # Bob can add same book

    def test_dedupes_book_by_isbn(self, client, alice_headers, bob_headers):
        client.post("/books/add-to-library", json={
            "title": "ISBN Book", "isbn": "978-3-16-148410-0", "total_pages": 100, "status": "to-read"
        }, headers=alice_headers)
        r = client.post("/books/add-to-library", json={
            "title": "ISBN Book", "isbn": "978-3-16-148410-0", "total_pages": 100, "status": "to-read"
        }, headers=bob_headers)
        assert r.status_code == 200  # Bob gets same Book row reused

    def test_requires_auth(self, client):
        r = client.post("/books/add-to-library", json={"title": "X", "status": "to-read"})
        assert r.status_code == 401


# ── /userbooks/ ──────────────────────────────────────────────────────────────

class TestListUserbooks:
    def test_empty_library(self, client, db):
        user = _make_user(db, email="empty_lib@example.com")
        r = client.get("/userbooks/", headers=_auth(user))
        assert r.status_code == 200
        assert r.json() == []

    def test_returns_own_books_only(self, client, alice_headers, bob_headers):
        _add_book(client, alice_headers, title="AliceOnly")
        r = client.get("/userbooks/", headers=bob_headers)
        titles = [b["book"]["title"] for b in r.json() if b.get("book")]
        assert "AliceOnly" not in titles

    def test_filter_by_status(self, client, db):
        user = _make_user(db, email="filter_status@example.com")
        h = _auth(user)
        client.post("/books/add-to-library", json={"title": "Reading Now", "total_pages": 100, "status": "reading"}, headers=h)
        client.post("/books/add-to-library", json={"title": "Want To Read", "total_pages": 100, "status": "to-read"}, headers=h)
        r = client.get("/userbooks/?status=reading", headers=h)
        assert all(b["status"] == "reading" for b in r.json())


# ── /userbooks/{id}/progress ─────────────────────────────────────────────────

class TestProgress:
    def test_update_progress(self, client, db):
        user = _make_user(db, email="progress@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "Progress Book", "total_pages": 200, "status": "to-read"}, headers=h)
        ub_id = add.json()["userbook"]["id"]
        r = client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 50}, headers=h)
        assert r.status_code == 200
        assert r.json()["current_page"] == 50
        assert r.json()["status"] == "reading"

    def test_progress_at_total_pages_marks_finished(self, client, db):
        user = _make_user(db, email="finish_prog@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "Finish Me", "total_pages": 100, "status": "reading"}, headers=h)
        ub_id = add.json()["userbook"]["id"]
        r = client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 100}, headers=h)
        assert r.json()["status"] == "finished"

    def test_progress_zero_resets_to_read(self, client, db):
        user = _make_user(db, email="reset_prog@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "Reset Book", "total_pages": 100, "status": "reading"}, headers=h)
        ub_id = add.json()["userbook"]["id"]
        client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 50}, headers=h)
        r = client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 0}, headers=h)
        assert r.json()["status"] == "to-read"

    def test_cannot_update_other_users_book(self, client, db):
        alice = _make_user(db, email="prog_alice@example.com")
        bob = _make_user(db, email="prog_bob@example.com")
        add = client.post("/books/add-to-library", json={"title": "Alice Book", "total_pages": 100, "status": "to-read"}, headers=_auth(alice))
        ub_id = add.json()["userbook"]["id"]
        r = client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 10}, headers=_auth(bob))
        assert r.status_code == 404

    def test_nonexistent_userbook(self, client, alice_headers):
        r = client.put("/userbooks/999999/progress", json={"current_page": 10}, headers=alice_headers)
        assert r.status_code == 404


# ── PATCH /userbooks/{id} ────────────────────────────────────────────────────

class TestPatchUserbook:
    def test_patch_status(self, client, db):
        user = _make_user(db, email="patch_status@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "Patch Book", "total_pages": 100, "status": "to-read"}, headers=h)
        ub_id = add.json()["userbook"]["id"]
        r = client.patch(f"/userbooks/{ub_id}", json={"status": "finished"}, headers=h)
        assert r.status_code == 200

    def test_patch_rating(self, client, db):
        user = _make_user(db, email="patch_rating@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "Rate Book", "total_pages": 100, "status": "finished"}, headers=h)
        ub_id = add.json()["userbook"]["id"]
        r = client.patch(f"/userbooks/{ub_id}", json={"rating": 5}, headers=h)
        assert r.status_code == 200

    def test_patch_no_valid_fields(self, client, db):
        user = _make_user(db, email="patch_empty@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "No Fields", "total_pages": 100, "status": "to-read"}, headers=h)
        ub_id = add.json()["userbook"]["id"]
        r = client.patch(f"/userbooks/{ub_id}", json={"unknown_field": "x"}, headers=h)
        assert r.status_code == 400


# ── DELETE /userbooks/{id} ───────────────────────────────────────────────────

class TestDeleteUserbook:
    def test_delete_own_book(self, client, db):
        user = _make_user(db, email="del_book@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "Delete Me", "total_pages": 100, "status": "to-read"}, headers=h)
        ub_id = add.json()["userbook"]["id"]
        r = client.delete(f"/userbooks/{ub_id}", headers=h)
        assert r.status_code == 200
        # Should no longer appear in list
        assert not any(b["id"] == ub_id for b in client.get("/userbooks/", headers=h).json())

    def test_cannot_delete_other_users_book(self, client, db):
        alice = _make_user(db, email="del_alice@example.com")
        bob = _make_user(db, email="del_bob@example.com")
        add = client.post("/books/add-to-library", json={"title": "Alice's Book", "total_pages": 100, "status": "to-read"}, headers=_auth(alice))
        ub_id = add.json()["userbook"]["id"]
        r = client.delete(f"/userbooks/{ub_id}", headers=_auth(bob))
        assert r.status_code == 404


# ── /books/search ────────────────────────────────────────────────────────────

class TestBookSearch:
    def test_search_returns_results(self, client, db):
        user = _make_user(db, email="search@example.com")
        h = _auth(user)
        client.post("/books/add-to-library", json={"title": "Searchable Title XYZ", "total_pages": 100, "status": "to-read"}, headers=h)
        r = client.get("/books/search?q=Searchable", headers=h)
        assert r.status_code == 200
        assert any("Searchable" in b["title"] for b in r.json())

    def test_search_no_results(self, client, alice_headers):
        r = client.get("/books/search?q=zzznomatch999", headers=alice_headers)
        assert r.status_code == 200
        assert r.json() == []
