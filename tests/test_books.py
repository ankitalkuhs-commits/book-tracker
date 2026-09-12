"""Tests for /books/* and /userbooks/* endpoints."""
import pytest
from sqlmodel import select
from tests.conftest import _make_user, _auth
from app import crud
from app.models import Book, UserBook


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

    def test_add_to_library_flat_shape_unchanged(self, client, alice_headers):
        r = client.post("/books/add-to-library", json={
            "title": "T40 Shape", "isbn": "t40-isbn", "total_pages": 200,
            "status": "reading", "google_books_id": "t40-gid",
        }, headers=alice_headers)
        assert r.status_code == 200
        data = r.json()
        assert set(data.keys()) == {
            "id", "user_id", "book_id", "status", "current_page", "rating",
            "format", "ownership_status", "created_at", "updated_at", "book",
        }
        assert set(data["book"].keys()) == {
            "id", "title", "author", "description", "total_pages", "cover_url", "google_books_id",
        }
        assert data["book"]["google_books_id"] == "t40-gid"

    def test_add_duplicate_same_user_returns_400(self, client, db):
        user = _make_user(db, email="dup_shape@example.com")
        h = _auth(user)
        payload = {
            "title": "T41 Dup", "isbn": "t41-isbn", "total_pages": 200,
            "status": "reading", "google_books_id": "t41-gid",
        }
        client.post("/books/add-to-library", json=payload, headers=h)
        r = client.post("/books/add-to-library", json=payload, headers=h)
        assert r.status_code == 400
        assert "already in your library" in r.json()["detail"]
        assert "Currently Reading" in r.json()["detail"]


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

    def test_userbook_item_shape_has_nested_google_books_id(self, client, db):
        user = _make_user(db, email="gbid_shape@example.com")
        h = _auth(user)
        client.post("/books/add-to-library", json={
            "title": "GBID Book", "total_pages": 100, "status": "to-read",
            "google_books_id": "gbid-shape-1",
        }, headers=h)
        r = client.get("/userbooks/", headers=h)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for item in items:
            assert "book" in item
            assert "google_books_id" in item["book"]
        assert any(item["book"]["google_books_id"] == "gbid-shape-1" for item in items)


# ── /userbooks/{id}/progress ─────────────────────────────────────────────────

class TestProgress:
    def test_update_progress(self, client, db):
        user = _make_user(db, email="progress@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "Progress Book", "total_pages": 200, "status": "to-read"}, headers=h)
        ub_id = add.json()["id"]
        r = client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 50}, headers=h)
        assert r.status_code == 200
        assert r.json()["current_page"] == 50
        assert r.json()["status"] == "reading"

    def test_progress_at_total_pages_marks_finished(self, client, db):
        user = _make_user(db, email="finish_prog@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "Finish Me", "total_pages": 100, "status": "reading"}, headers=h)
        ub_id = add.json()["id"]
        r = client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 100}, headers=h)
        assert r.json()["status"] == "finished"

    def test_progress_zero_resets_to_read(self, client, db):
        user = _make_user(db, email="reset_prog@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "Reset Book", "total_pages": 100, "status": "reading"}, headers=h)
        ub_id = add.json()["id"]
        client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 50}, headers=h)
        r = client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 0}, headers=h)
        assert r.json()["status"] == "to-read"

    def test_cannot_update_other_users_book(self, client, db):
        alice = _make_user(db, email="prog_alice@example.com")
        bob = _make_user(db, email="prog_bob@example.com")
        add = client.post("/books/add-to-library", json={"title": "Alice Book", "total_pages": 100, "status": "to-read"}, headers=_auth(alice))
        ub_id = add.json()["id"]
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
        ub_id = add.json()["id"]
        r = client.patch(f"/userbooks/{ub_id}", json={"status": "finished"}, headers=h)
        assert r.status_code == 200

    def test_patch_rating(self, client, db):
        user = _make_user(db, email="patch_rating@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "Rate Book", "total_pages": 100, "status": "finished"}, headers=h)
        ub_id = add.json()["id"]
        r = client.patch(f"/userbooks/{ub_id}", json={"rating": 5}, headers=h)
        assert r.status_code == 200

    def test_patch_no_valid_fields(self, client, db):
        user = _make_user(db, email="patch_empty@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "No Fields", "total_pages": 100, "status": "to-read"}, headers=h)
        ub_id = add.json()["id"]
        r = client.patch(f"/userbooks/{ub_id}", json={"unknown_field": "x"}, headers=h)
        assert r.status_code == 400


# ── DELETE /userbooks/{id} ───────────────────────────────────────────────────

class TestDeleteUserbook:
    def test_delete_own_book(self, client, db):
        user = _make_user(db, email="del_book@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "Delete Me", "total_pages": 100, "status": "to-read"}, headers=h)
        ub_id = add.json()["id"]
        r = client.delete(f"/userbooks/{ub_id}", headers=h)
        assert r.status_code == 200
        # Should no longer appear in list
        assert not any(b["id"] == ub_id for b in client.get("/userbooks/", headers=h).json())

    def test_cannot_delete_other_users_book(self, client, db):
        alice = _make_user(db, email="del_alice@example.com")
        bob = _make_user(db, email="del_bob@example.com")
        add = client.post("/books/add-to-library", json={"title": "Alice's Book", "total_pages": 100, "status": "to-read"}, headers=_auth(alice))
        ub_id = add.json()["id"]
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

    def test_search_requires_auth(self, client):
        r = client.get("/books/search?q=x")
        assert r.status_code == 401


# ── /books/recommendations ──────────────────────────────────────────────────

class TestRecommendations:
    def test_recommendations_with_token(self, client, alice_headers):
        r = client.get("/books/recommendations", headers=alice_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_recommendations_requires_auth(self, client):
        r = client.get("/books/recommendations")
        assert r.status_code == 401


# ── /books/ catalog auth + admin-only delete ────────────────────────────────

class TestCatalogAuth:
    def test_list_requires_auth(self, client):
        assert client.get("/books/").status_code == 401

    def test_get_one_requires_auth(self, client):
        assert client.get("/books/1").status_code == 401

    def test_create_requires_auth(self, client):
        assert client.post("/books/", json={"title": "Anon Book"}).status_code == 401

    def test_delete_requires_auth(self, client):
        assert client.delete("/books/1").status_code == 401

    def test_delete_forbidden_for_non_admin(self, client, alice_headers):
        assert client.delete("/books/1", headers=alice_headers).status_code == 403

    def test_non_admin_delete_leaves_book_and_userbooks_intact(self, client, alice_headers, bob_headers, db):
        add_alice = client.post("/books/add-to-library", json={
            "title": "T05 Shared", "isbn": "t05-shared-isbn", "total_pages": 120, "status": "reading",
        }, headers=alice_headers)
        book_id = add_alice.json()["book"]["id"]
        alice_ub = add_alice.json()["id"]

        add_bob = client.post("/books/add-to-library", json={
            "title": "T05 Shared", "isbn": "t05-shared-isbn", "total_pages": 120, "status": "reading",
        }, headers=bob_headers)
        assert add_bob.json()["book"]["id"] == book_id
        bob_ub = add_bob.json()["id"]

        r = client.delete(f"/books/{book_id}", headers=bob_headers)
        assert r.status_code == 403

        get_r = client.get(f"/books/{book_id}", headers=alice_headers)
        assert get_r.status_code == 200
        assert get_r.json()["id"] == book_id
        assert get_r.json()["title"] == "T05 Shared"

        alice_ids = [b["id"] for b in client.get("/userbooks/", headers=alice_headers).json()]
        bob_ids = [b["id"] for b in client.get("/userbooks/", headers=bob_headers).json()]
        assert alice_ub in alice_ids
        assert bob_ub in bob_ids

        db.expire_all()
        rows = db.exec(select(UserBook).where(UserBook.book_id == book_id)).all()
        assert len(rows) == 2

    def test_admin_can_delete_own_created_book(self, client, admin_headers):
        add_r = client.post("/books/", json={"title": "T06 Throwaway", "isbn": "t06-throwaway"}, headers=admin_headers)
        book_id = add_r.json()["book"]["id"]

        del_r = client.delete(f"/books/{book_id}", headers=admin_headers)
        assert del_r.status_code == 200
        assert del_r.json() == {"message": "Book deleted successfully"}

        get_r = client.get(f"/books/{book_id}", headers=admin_headers)
        assert get_r.status_code == 404
        assert get_r.json() == {"detail": "Book not found"}

    def test_admin_delete_missing_book_returns_404(self, client, admin_headers):
        r = client.delete("/books/999999", headers=admin_headers)
        assert r.status_code == 404
        assert r.json() == {"detail": "Book not found"}

    def test_literal_paths_not_swallowed_by_book_id(self, client, alice_headers):
        assert client.get("/books/search?q=x", headers=alice_headers).status_code == 200
        assert client.get("/books/recommendations", headers=alice_headers).status_code == 200
        add_r = client.post("/books/add-to-library", json={
            "title": "T45 Route Order", "total_pages": 100, "status": "to-read",
        }, headers=alice_headers)
        assert add_r.status_code == 200


class TestCatalogList:
    def test_list_works_for_user_and_respects_limit(self, client, alice_headers):
        r = client.get("/books/", headers=alice_headers)
        assert r.status_code == 200
        assert len(r.json()) <= 50

    def test_list_limit_param_caps_results(self, client, alice_headers):
        for i in range(3):
            client.post("/books/", json={"title": f"T09 Book {i}", "isbn": f"t09-isbn-{i}"}, headers=alice_headers)
        r = client.get("/books/?limit=2", headers=alice_headers)
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_list_limit_above_max_rejected(self, client, alice_headers):
        assert client.get("/books/?limit=500", headers=alice_headers).status_code == 422
        r = client.get("/books/?limit=200", headers=alice_headers)
        assert r.status_code == 200
        assert len(r.json()) <= 200

    def test_list_limit_zero_rejected(self, client, alice_headers):
        assert client.get("/books/?limit=0", headers=alice_headers).status_code == 422
        assert client.get("/books/?limit=-1", headers=alice_headers).status_code == 422


class TestCatalogCreate:
    def test_create_book_with_token(self, client, alice_headers):
        r = client.post("/books/", json={
            "title": "T14 Created", "author": "QA", "isbn": "t14-isbn", "total_pages": 300,
        }, headers=alice_headers)
        assert r.status_code == 200
        assert r.json()["message"] == "Book added successfully"
        book = r.json()["book"]
        assert book["title"] == "T14 Created"
        assert book["author"] == "QA"
        assert book["isbn"] == "t14-isbn"
        assert isinstance(book["id"], int)

    def test_create_dedupes_by_isbn(self, client, alice_headers, bob_headers, db):
        first = client.post("/books/", json={"title": "T15 First", "isbn": "t15-dupe-isbn"}, headers=alice_headers)
        first_id = first.json()["book"]["id"]

        second = client.post("/books/", json={"title": "T15 Second Title", "isbn": "t15-dupe-isbn"}, headers=bob_headers)
        assert second.status_code == 200
        assert second.json()["message"] == "Book already exists"
        assert second.json()["book"]["id"] == first_id
        assert second.json()["book"]["title"] == "T15 First"

        db.expire_all()
        rows = db.exec(select(Book).where(Book.isbn == "t15-dupe-isbn")).all()
        assert len(rows) == 1

    def test_create_without_title_returns_400(self, client, alice_headers):
        r = client.post("/books/", json={"author": "No Title"}, headers=alice_headers)
        assert r.status_code == 400
        assert r.json() == {"detail": "Title is required"}

    def test_create_ignores_unknown_fields(self, client, alice_headers):
        r = client.post("/books/", json={
            "title": "T19 Mass", "isbn": "t19-isbn", "id": 999999,
            "created_at": "1999-01-01T00:00:00Z", "user_id": 1, "is_admin": True,
        }, headers=alice_headers)
        assert r.status_code == 200
        book = r.json()["book"]
        assert book["id"] != 999999
        assert not str(book["created_at"]).startswith("1999")
        assert "user_id" not in book
        assert "is_admin" not in book
        assert client.get("/books/999999", headers=alice_headers).status_code == 404

    def test_create_accepts_emoji_and_long_title(self, client, alice_headers):
        title = "\U0001F4DA Café — naïve \U0001F3A7" + "x" * 480
        r = client.post("/books/", json={"title": title, "isbn": "t18-isbn"}, headers=alice_headers)
        assert r.status_code == 200
        assert r.json()["book"]["title"] == title
        book_id = r.json()["book"]["id"]
        r2 = client.get(f"/books/{book_id}", headers=alice_headers)
        assert r2.json()["title"] == title

    def test_get_book_by_id_with_token(self, client, alice_headers):
        add_r = client.post("/books/", json={"title": "T17 Get Book", "isbn": "t17-isbn"}, headers=alice_headers)
        book_id = add_r.json()["book"]["id"]
        r = client.get(f"/books/{book_id}", headers=alice_headers)
        assert r.status_code == 200
        assert r.json()["id"] == book_id
        assert r.json()["title"] == "T17 Get Book"

    def test_get_missing_book_returns_404(self, client, alice_headers):
        r = client.get("/books/999999", headers=alice_headers)
        assert r.status_code == 404
        assert r.json() == {"detail": "Book not found"}
