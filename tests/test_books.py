"""Tests for /books/* and /userbooks/* endpoints."""
import json as _json
import anyio
import pytest
from sqlmodel import select
from tests.conftest import _make_user, _auth
from app import crud
from app.models import Book, UserBook, Follow, NotificationLog


# ── helpers ──────────────────────────────────────────────────────────────────

def _add_book(client, headers, title="Dune", total_pages=412, status="to-read"):
    return client.post("/books/add-to-library", json={
        "title": title, "author": "Frank Herbert",
        "total_pages": total_pages, "status": status,
    }, headers=headers)


def _owned(client, headers, tag):
    """OWNED(u, tag): add a uniquely-tagged book to u's library. Returns the flat
    add-to-library response (book id at ["book"]["id"], userbook id at ["id"])."""
    r = client.post("/books/add-to-library", json={
        "title": f"F07 {tag}", "author": "QA",
        "google_books_id": f"f07-{tag}-gid", "isbn": f"f07-{tag}-isbn",
        "total_pages": 321, "status": "reading",
    }, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _book_count(db, google_books_id):
    return len(db.exec(select(Book).where(Book.google_books_id == google_books_id)).all())


def _asgi_order(method, path, headers, json_body, events):
    """Drive the ASGI app directly (bypassing TestClient's own send loop) so we can record the
    order of the ASGI 'http.response.start' send against the push calls that BackgroundTasks
    defers (F-59). Spies on send_expo_push/send_web_push for the duration of the call."""
    import app.notifications.dispatcher as _dispatcher
    from app.main import app as _app

    orig_expo, orig_web = _dispatcher.send_expo_push, _dispatcher.send_web_push

    def _spy_expo(*a, **kw):
        events.append("push.mobile")
        return orig_expo(*a, **kw)

    def _spy_web(*a, **kw):
        events.append("push.web")
        return orig_web(*a, **kw)

    _dispatcher.send_expo_push = _spy_expo
    _dispatcher.send_web_push = _spy_web

    body = _json.dumps(json_body).encode() if json_body is not None else b""
    req_headers = [(b"content-type", b"application/json")]
    for k, v in headers.items():
        req_headers.append((k.lower().encode(), v.encode()))

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": method, "path": path, "raw_path": path.encode(),
        "query_string": b"", "headers": req_headers,
        "server": ("testserver", 80), "client": ("testclient", 50000), "scheme": "http",
    }
    status_holder = {}
    body_chunks = []

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            events.append("response.start")
            status_holder["status"] = message["status"]
        elif message["type"] == "http.response.body":
            body_chunks.append(message.get("body", b""))

    try:
        anyio.run(_app, scope, receive, send)
    finally:
        _dispatcher.send_expo_push = orig_expo
        _dispatcher.send_web_push = orig_web

    resp_body = b"".join(body_chunks)
    parsed = _json.loads(resp_body) if resp_body else None
    return status_holder.get("status"), parsed


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

    # ── F-07 + F-33: dedup keys + book_id matching (T-A2-16a..22) ────────────

    def test_add_by_book_id_reuses_catalogue_row(self, client, db):
        u1 = _make_user(db, email="f07_u1_k@example.com", name="F07U1K")
        u2 = _make_user(db, email="f07_u2_k@example.com", name="F07U2K")
        K = _owned(client, _auth(u1), "K")["book"]["id"]
        n0 = len(db.exec(select(Book)).all())
        r = client.post("/books/add-to-library", json={
            "book_id": K, "title": "F07 K", "status": "to-read",
        }, headers=_auth(u2))
        assert r.status_code == 200
        assert r.json()["book"]["id"] == K
        assert len(db.exec(select(Book)).all()) == n0
        rows = client.get("/userbooks/", headers=_auth(u2)).json()
        assert sum(1 for row in rows if row["book_id"] == K) == 1

    def test_book_id_wins_over_google_books_id(self, client, db):
        u1 = _make_user(db, email="f07_u1_a@example.com", name="F07U1A")
        u2 = _make_user(db, email="f07_u2_a@example.com", name="F07U2A")
        A = _owned(client, _auth(u1), "A")["book"]["id"]
        _owned(client, _auth(u1), "B2")
        n0 = len(db.exec(select(Book)).all())
        r = client.post("/books/add-to-library", json={
            "book_id": A, "google_books_id": "f07-B2-gid", "isbn": "f07-B2-isbn",
            "title": "Different", "status": "to-read",
        }, headers=_auth(u2))
        assert r.status_code == 200
        assert r.json()["book"]["id"] == A
        assert len(db.exec(select(Book)).all()) == n0
        assert _book_count(db, "f07-B2-gid") == 1

    def test_unknown_book_id_falls_through_to_google_books_id(self, client, db):
        u1 = _make_user(db, email="f07_u1_a2@example.com", name="F07U1A2")
        u3 = _make_user(db, email="f07_u3@example.com", name="F07U3")
        A = _owned(client, _auth(u1), "A2")["book"]["id"]
        n0 = len(db.exec(select(Book)).all())
        r = client.post("/books/add-to-library", json={
            "book_id": 99999999, "google_books_id": "f07-A2-gid", "title": "x", "status": "to-read",
        }, headers=_auth(u3))
        assert r.status_code == 200
        assert r.json()["book"]["id"] == A
        assert len(db.exec(select(Book)).all()) == n0

    def test_google_books_id_matched_before_isbn(self, client, db):
        b_owner = _make_user(db, email="f07_b_owner@example.com", name="F07BOwner")
        B = _owned(client, _auth(b_owner), "B")["book"]["id"]
        c_owner = _make_user(db, email="f07_c_owner@example.com", name="F07COwner")
        client.post("/books/add-to-library", json={
            "title": "F07 C", "author": "QA", "isbn": "f07-C-isbn",
            "total_pages": 321, "status": "reading",
        }, headers=_auth(c_owner))
        u4 = _make_user(db, email="f07_u4@example.com", name="F07U4")
        r = client.post("/books/add-to-library", json={
            "google_books_id": "f07-B-gid", "isbn": "f07-C-isbn", "title": "y", "status": "to-read",
        }, headers=_auth(u4))
        assert r.status_code == 200
        assert r.json()["book"]["id"] == B

    def test_add_from_recommendation_item_reuses_book(self, client, db):
        friend = _make_user(db, email="f07_rec_friend@example.com", name="RecFriend")
        viewer = _make_user(db, email="f07_rec_viewer@example.com", name="RecViewer")
        fh, vh = _auth(friend), _auth(viewer)
        owned = _owned(client, fh, "R")
        book_id, ub_id = owned["book"]["id"], owned["id"]
        client.patch(f"/userbooks/{ub_id}", json={"status": "finished", "rating": 5}, headers=fh)
        client.post(f"/follow/{friend.id}", headers=vh)
        recs = client.get("/books/recommendations", headers=vh).json()
        item = next((r for r in recs if r["id"] == book_id), None)
        assert item is not None, f"F07 recommendation item for book {book_id} did not surface: {recs}"
        payload = {
            "book_id": item["id"], "google_books_id": item["google_books_id"], "isbn": item["isbn"],
            "title": item["title"], "author": item["author"], "cover_url": item["cover_url"],
            "total_pages": item["total_pages"], "status": "to-read",
        }
        r1 = client.post("/books/add-to-library", json=payload, headers=vh)
        assert r1.status_code == 200
        assert r1.json()["book"]["id"] == book_id
        r2 = client.post("/books/add-to-library", json=payload, headers=vh)
        assert r2.status_code == 400
        assert _book_count(db, "f07-R-gid") == 1

    def test_add_from_friends_reading_item_reuses_book(self, client, db):
        friend = _make_user(db, email="f07_fr_friend@example.com", name="FrFriend")
        viewer = _make_user(db, email="f07_fr_viewer@example.com", name="FrViewer")
        fh, vh = _auth(friend), _auth(viewer)
        FR = _owned(client, fh, "FR")["book"]["id"]
        client.post(f"/follow/{friend.id}", headers=vh)
        items = client.get("/userbooks/friends/currently-reading", headers=vh).json()
        item = next((i for i in items if i["book"]["id"] == FR), None)
        assert item is not None, f"friends-reading item for book {FR} did not surface: {items}"
        payload = {
            "book_id": item["book"]["id"], "google_books_id": item["book"]["google_books_id"],
            "isbn": item["book"]["isbn"], "title": item["book"]["title"],
            "total_pages": item["book"]["total_pages"], "status": "to-read",
        }
        r1 = client.post("/books/add-to-library", json=payload, headers=vh)
        assert r1.status_code == 200
        assert r1.json()["book"]["id"] == FR
        r2 = client.post("/books/add-to-library", json=payload, headers=vh)
        assert r2.status_code == 400
        assert _book_count(db, "f07-FR-gid") == 1

    def test_add_from_note_card_book_reuses_book(self, client, db):
        friend = _make_user(db, email="f07_nc_friend@example.com", name="NcFriend")
        viewer = _make_user(db, email="f07_nc_viewer@example.com", name="NcViewer")
        fh, vh = _auth(friend), _auth(viewer)
        owned = _owned(client, fh, "NC")
        book_id, ub_id = owned["book"]["id"], owned["id"]
        client.post("/notes/", json={"text": "F07 NC note", "userbook_id": ub_id, "is_public": True}, headers=fh)
        feed = client.get("/notes/feed?limit=200", headers=vh).json()
        card = next((n for n in feed if n.get("book") and n["book"]["id"] == book_id), None)
        assert card is not None, f"F07 note card for book {book_id} did not surface in feed"
        payload = {"book_id": card["book"]["id"], "title": card["book"]["title"], "status": "to-read"}
        r1 = client.post("/books/add-to-library", json=payload, headers=vh)
        assert r1.status_code == 200
        assert r1.json()["book"]["id"] == book_id
        r2 = client.post("/books/add-to-library", json=payload, headers=vh)
        assert r2.status_code == 400
        assert _book_count(db, "f07-NC-gid") == 1

    def test_add_from_circle_current_book_reuses_book(self, client, db):
        curator = _make_user(db, email="f07_cb_curator@example.com", name="CbCurator")
        member = _make_user(db, email="f07_cb_member@example.com", name="CbMember")
        ch, mh = _auth(curator), _auth(member)
        CB = _owned(client, ch, "CB")["book"]["id"]
        g = client.post("/groups/", json={"name": "F07 CB Circle", "is_private": False}, headers=ch).json()
        client.put(f"/groups/{g['id']}/book", json={"book_id": CB}, headers=ch)
        client.post(f"/groups/{g['id']}/join", headers=mh)
        current_book = client.get(f"/groups/{g['id']}", headers=mh).json()["current_book"]
        payload = {"book_id": current_book["id"], "title": current_book["title"], "status": "to-read"}
        r1 = client.post("/books/add-to-library", json=payload, headers=mh)
        assert r1.status_code == 200
        assert r1.json()["book"]["id"] == CB
        r2 = client.post("/books/add-to-library", json=payload, headers=mh)
        assert r2.status_code == 400
        assert _book_count(db, "f07-CB-gid") == 1


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


# ── F-52: validated PATCH /userbooks/{id} (T-A2-01..11) ─────────────────────

class TestPatchUserbookValidation:
    RK = {"book_total_pages", "current_page", "id", "rating", "status", "updated_at"}

    def _ub(self, client, db, email):
        user = _make_user(db, email=email)
        h = _auth(user)
        add = client.post("/books/add-to-library", json={
            "title": "F52", "total_pages": 300, "status": "reading",
        }, headers=h)
        return h, add.json()["id"]

    def test_rating_invalid_values_422(self, client, db):
        h, ub = self._ub(client, db, "f52_rating_invalid@example.com")
        for bad in ["abc", -1, 6, 99, 4.5, "4", True]:
            r = client.patch(f"/userbooks/{ub}", json={"rating": bad}, headers=h)
            assert r.status_code == 422, f"rating={bad!r} -> {r.status_code}"
        assert client.get(f"/userbooks/{ub}", headers=h).json()["rating"] is None

    def test_rating_zero_and_null_clear(self, client, db):
        h, ub = self._ub(client, db, "f52_rating_clear@example.com")
        r = client.patch(f"/userbooks/{ub}", json={"rating": 4}, headers=h)
        assert r.status_code == 200 and r.json()["rating"] == 4
        r = client.patch(f"/userbooks/{ub}", json={"rating": 0}, headers=h)
        assert r.status_code == 200 and r.json()["rating"] is None
        assert client.get(f"/userbooks/{ub}", headers=h).json()["rating"] is None
        client.patch(f"/userbooks/{ub}", json={"rating": 3}, headers=h)
        r = client.patch(f"/userbooks/{ub}", json={"rating": None}, headers=h)
        assert r.status_code == 200 and r.json()["rating"] is None

    def test_status_invalid_or_null_422(self, client, db):
        h, ub = self._ub(client, db, "f52_status_invalid@example.com")
        for bad in ["banana", None, "completed"]:
            r = client.patch(f"/userbooks/{ub}", json={"status": bad}, headers=h)
            assert r.status_code == 422, f"status={bad!r} -> {r.status_code}"
        assert client.get(f"/userbooks/{ub}", headers=h).json()["status"] == "reading"

    def test_current_page_negative_422_and_null_ok(self, client, db):
        h, ub = self._ub(client, db, "f52_page_negative@example.com")
        assert client.patch(f"/userbooks/{ub}", json={"current_page": -5}, headers=h).status_code == 422
        assert client.patch(f"/userbooks/{ub}", json={"current_page": None}, headers=h).status_code == 200
        assert client.patch(f"/userbooks/{ub}", json={"current_page": 0}, headers=h).status_code == 200

    def test_total_pages_zero_or_null_422(self, client, db):
        h, ub = self._ub(client, db, "f52_total_pages_zero@example.com")
        for bad in [0, -1, None]:
            r = client.patch(f"/userbooks/{ub}", json={"total_pages": bad}, headers=h)
            assert r.status_code == 422, f"total_pages={bad!r} -> {r.status_code}"
        assert client.get(f"/userbooks/{ub}", headers=h).json()["book"]["total_pages"] == 300

    def test_format_invalid_422(self, client, db):
        h, ub = self._ub(client, db, "f52_format_invalid@example.com")
        assert client.patch(f"/userbooks/{ub}", json={"format": "scroll"}, headers=h).status_code == 422
        assert client.patch(f"/userbooks/{ub}", json={"format": None}, headers=h).status_code == 422

    def test_ownership_status_invalid_422(self, client, db):
        h, ub = self._ub(client, db, "f52_ownership_invalid@example.com")
        assert client.patch(f"/userbooks/{ub}", json={"ownership_status": "junk"}, headers=h).status_code == 422
        assert client.patch(f"/userbooks/{ub}", json={"ownership_status": None}, headers=h).status_code == 422

    def test_every_valid_enum_value_200(self, client, db):
        h, ub = self._ub(client, db, "f52_every_valid@example.com")
        for status in ["to-read", "reading", "finished"]:
            assert client.patch(f"/userbooks/{ub}", json={"status": status}, headers=h).status_code == 200
        for rating in range(1, 6):
            assert client.patch(f"/userbooks/{ub}", json={"rating": rating}, headers=h).status_code == 200
        for fmt in ["hardcover", "paperback", "ebook", "kindle", "pdf", "audiobook"]:
            assert client.patch(f"/userbooks/{ub}", json={"format": fmt}, headers=h).status_code == 200
        for own, extra in [("owned", {}), ("borrowed", {"borrowed_from": "A Friend"}), ("loaned", {"loaned_to": "A Friend"})]:
            body = {"ownership_status": own, **extra}
            assert client.patch(f"/userbooks/{ub}", json=body, headers=h).status_code == 200
        assert client.patch(f"/userbooks/{ub}", json={"total_pages": 1}, headers=h).status_code == 200
        assert client.patch(f"/userbooks/{ub}", json={"private_notes": "\U0001F4DA note"}, headers=h).status_code == 200

    def test_extra_key_with_valid_key_ignored_200(self, client, db):
        h, ub = self._ub(client, db, "f52_extra_key@example.com")
        r = client.patch(f"/userbooks/{ub}", json={
            "status": "reading", "hacker": 1, "user_id": 999999, "id": 1,
        }, headers=h)
        assert r.status_code == 200
        assert "hacker" not in r.json()
        got = client.get(f"/userbooks/{ub}", headers=h).json()
        assert got["user_id"] != 999999
        assert got["id"] != 1

    def test_empty_body_400(self, client, db):
        h, ub = self._ub(client, db, "f52_empty_body@example.com")
        r = client.patch(f"/userbooks/{ub}", json={}, headers=h)
        assert r.status_code == 400

    def test_response_key_set_unchanged(self, client, db):
        h, ub = self._ub(client, db, "f52_key_set@example.com")
        other = _make_user(db, email="f52_key_set_other@example.com")
        r = client.patch(f"/userbooks/{ub}", json={"rating": 5}, headers=h)
        assert r.status_code == 200 and set(r.json().keys()) == self.RK
        r = client.patch(f"/userbooks/{ub}", json={"status": "finished"}, headers=h)
        assert r.status_code == 200 and set(r.json().keys()) == self.RK
        r = client.patch(f"/userbooks/{ub}", json={"rating": 4}, headers=_auth(other))
        assert r.status_code == 404


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

    def test_delete_after_progress_200_no_orphans(self, client, db):
        user = _make_user(db, email="f50_del_progress@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "F50 prog", "total_pages": 100, "status": "reading"}, headers=h)
        ub_id = add.json()["id"]
        r = client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 10}, headers=h)
        assert r.status_code == 200
        from app.models import ReadingActivity
        assert len(db.exec(select(ReadingActivity).where(ReadingActivity.userbook_id == ub_id)).all()) >= 1
        r = client.delete(f"/userbooks/{ub_id}", headers=h)
        assert r.status_code == 200
        assert r.json() == {"status": "ok", "message": "Book removed from library successfully"}
        db.expire_all()
        assert len(db.exec(select(ReadingActivity).where(ReadingActivity.userbook_id == ub_id)).all()) == 0
        assert db.get(UserBook, ub_id) is None
        assert not any(b["id"] == ub_id for b in client.get("/userbooks/", headers=h).json())

    def test_delete_keeps_notes_detached(self, client, db):
        user = _make_user(db, email="f50_del_notes@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "F50 note book", "total_pages": 100, "status": "reading"}, headers=h)
        ub_id = add.json()["id"]
        client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 10}, headers=h)
        note_r = client.post("/notes/", json={"text": "F50 note", "userbook_id": ub_id, "is_public": False}, headers=h)
        note_id = note_r.json()["id"]
        r = client.delete(f"/userbooks/{ub_id}", headers=h)
        assert r.status_code == 200
        db.expire_all()
        from app.models import Note
        note = db.get(Note, note_id)
        assert note is not None
        assert note.userbook_id is None
        my_notes = client.get("/notes/me", headers=h).json()
        mine = next((n for n in my_notes if n["id"] == note_id), None)
        assert mine is not None
        assert mine.get("book") is None

    def test_delete_nulls_group_post_userbook_id(self, client, db):
        user = _make_user(db, email="f50_del_grouppost@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={"title": "F50 gp book", "total_pages": 100, "status": "reading"}, headers=h)
        ub_id = add.json()["id"]
        client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 10}, headers=h)
        g = client.post("/groups/", json={"name": "F50 GP Circle", "is_private": False}, headers=h).json()
        from app.models import GroupPost
        gp = GroupPost(group_id=g["id"], user_id=user.id, text="F50 gp", userbook_id=ub_id)
        db.add(gp)
        db.commit()
        gp_id = gp.id
        r = client.delete(f"/userbooks/{ub_id}", headers=h)
        assert r.status_code == 200
        db.expire_all()
        gp_after = db.get(GroupPost, gp_id)
        assert gp_after is not None
        assert gp_after.userbook_id is None
        posts = client.get(f"/groups/{g['id']}/posts", headers=h).json()
        assert any(p["id"] == gp_id for p in posts)


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

    def test_search_limit_bounds_422(self, client, alice_headers):
        for limit, expected in [(0, 422), (-1, 422), (201, 422), (200, 200)]:
            r = client.get(f"/books/search?q=Dune&limit={limit}", headers=alice_headers)
            assert r.status_code == expected, f"limit={limit}"


# ── /books/recommendations ──────────────────────────────────────────────────

class TestRecommendations:
    def test_recommendations_with_token(self, client, alice_headers):
        r = client.get("/books/recommendations", headers=alice_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_recommendations_requires_auth(self, client):
        r = client.get("/books/recommendations")
        assert r.status_code == 401

    def test_recommendations_items_have_dedup_keys(self, client, db):
        friend = _make_user(db, email="f07_rk_friend@example.com", name="RkFriend")
        viewer = _make_user(db, email="f07_rk_viewer@example.com", name="RkViewer")
        fh, vh = _auth(friend), _auth(viewer)
        owned = _owned(client, fh, "R")
        ub_id = owned["id"]
        client.patch(f"/userbooks/{ub_id}", json={"status": "finished", "rating": 5}, headers=fh)
        client.post(f"/follow/{friend.id}", headers=vh)
        recs = client.get("/books/recommendations", headers=vh).json()
        assert recs, "expected at least one recommendation"
        for item in recs:
            assert set(item.keys()) == {
                "author", "cover_url", "description", "friend_name", "id",
                "reason", "title", "total_pages", "google_books_id", "isbn",
            }
        r_item = next((r for r in recs if r["id"] == owned["book"]["id"]), None)
        assert r_item is not None
        assert r_item["google_books_id"] == "f07-R-gid"
        assert r_item["isbn"] == "f07-R-isbn"
        assert r_item["total_pages"] == 321

    def test_recommendations_limit_bounds_422(self, client, alice_headers):
        for limit, expected in [(0, 422), (-1, 422), (201, 422), (200, 200), (1, 200)]:
            r = client.get(f"/books/recommendations?limit={limit}", headers=alice_headers)
            assert r.status_code == expected, f"limit={limit}"


# ── /userbooks/friends/currently-reading ─────────────────────────────────────

class TestFriendsReading:
    def test_friends_reading_book_has_dedup_keys_and_user_profile_picture(self, client, db):
        friend = _make_user(db, email="f07_frd_friend@example.com", name="FrdFriend")
        viewer = _make_user(db, email="f07_frd_viewer@example.com", name="FrdViewer")
        friend.profile_picture = "https://example.com/f.png"
        db.add(friend)
        db.commit()
        fh, vh = _auth(friend), _auth(viewer)
        _owned(client, fh, "FRD")
        client.post(f"/follow/{friend.id}", headers=vh)
        items = client.get("/userbooks/friends/currently-reading", headers=vh).json()
        assert items, "expected at least one friends-reading item"
        item = items[0]
        assert set(item.keys()) == {"book", "current_page", "id", "updated_at", "user"}
        assert set(item["book"].keys()) == {"author", "cover_url", "id", "title", "total_pages", "google_books_id", "isbn"}
        assert set(item["user"].keys()) == {"id", "is_mutual", "name", "username", "profile_picture"}
        assert item["user"]["profile_picture"] == "https://example.com/f.png"

    def test_friends_reading_limit_bounds_422(self, client, alice_headers):
        for limit, expected in [(0, 422), (-1, 422), (201, 422), (200, 200), (10, 200)]:
            r = client.get(f"/userbooks/friends/currently-reading?limit={limit}", headers=alice_headers)
            assert r.status_code == expected, f"limit={limit}"


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


# ── F-59: actions don't wait for push delivery (T-A2-28..30) ────────────────

class TestPushAfterResponse:
    def _actor_with_follower(self, db, tag):
        actor = _make_user(db, email=f"f59_actor_{tag}@example.com", name=f"F59Actor{tag}")
        follower = _make_user(db, email=f"f59_follower_{tag}@example.com", name=f"F59Follower{tag}")
        db.add(Follow(follower_id=follower.id, followed_id=actor.id))
        db.commit()
        return actor, follower

    def test_add_to_library_returns_before_push_delivery(self, client, db):
        actor, follower = self._actor_with_follower(db, "add")
        events = []
        status, body = _asgi_order(
            "POST", "/books/add-to-library", _auth(actor),
            {"title": "F59 add", "total_pages": 10, "status": "to-read"}, events,
        )
        assert status == 200
        assert "response.start" in events
        assert events.index("response.start") < min(
            (i for i, e in enumerate(events) if e.startswith("push.")), default=len(events)
        )
        db.expire_all()
        rows = db.exec(select(NotificationLog).where(
            NotificationLog.user_id == follower.id, NotificationLog.event_type == "book_added",
        )).all()
        assert len(rows) >= 1

    def test_patch_status_finished_returns_before_push_delivery(self, client, db):
        actor, follower = self._actor_with_follower(db, "patch")
        ah = _auth(actor)
        add = client.post("/books/add-to-library", json={
            "title": "F59 patch", "total_pages": 50, "status": "reading",
        }, headers=ah)
        ub_id = add.json()["id"]
        events = []
        status, body = _asgi_order("PATCH", f"/userbooks/{ub_id}", ah, {"status": "finished"}, events)
        assert status == 200
        assert "response.start" in events
        push_indices = [i for i, e in enumerate(events) if e.startswith("push.")]
        if push_indices:
            assert events.index("response.start") < min(push_indices)
        db.expire_all()
        rows = db.exec(select(NotificationLog).where(
            NotificationLog.user_id == follower.id, NotificationLog.event_type == "book_completed",
        )).all()
        assert len(rows) >= 1

    def test_progress_to_end_still_writes_notificationlog(self, client, db):
        actor = _make_user(db, email="f59_progress_actor@example.com", name="F59ProgressActor")
        follower = _make_user(db, email="f59_progress_follower@example.com", name="F59ProgressFollower")
        db.add(Follow(follower_id=follower.id, followed_id=actor.id))
        db.commit()
        ah = _auth(actor)
        add = client.post("/books/add-to-library", json={
            "title": "F59 progress", "total_pages": 20, "status": "reading",
        }, headers=ah)
        ub_id = add.json()["id"]
        g = client.post("/groups/", json={"name": "F59 Progress Circle", "is_private": False}, headers=ah).json()
        r = client.put(f"/userbooks/{ub_id}/progress", json={"current_page": 20}, headers=ah)
        assert r.status_code == 200
        assert r.json()["status"] == "finished"
        db.expire_all()
        rows = db.exec(select(NotificationLog).where(
            NotificationLog.user_id == follower.id, NotificationLog.event_type == "book_completed",
        )).all()
        assert len(rows) >= 1
        activity = client.get(f"/groups/{g['id']}/activity", headers=ah).json()
        book_id = add.json()["book_id"]
        assert any(
            e["event_type"] == "book_finished" and e["payload"].get("book_id") == book_id
            for e in activity
        )
