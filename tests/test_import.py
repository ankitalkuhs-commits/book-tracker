"""Tests for /import/goodreads endpoint."""
import io
from tests.conftest import _make_user, _auth

# Minimal valid Goodreads CSV with the required column headers
GOODREADS_CSV_HEADERS = (
    "Book Id,Title,Author,Author l-f,Additional Authors,"
    "ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,"
    "Number of Pages,Year Published,Original Publication Year,"
    "Date Read,Date Added,Bookshelves,Bookshelves with positions,"
    "Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies"
)

def _csv(rows: list[str]) -> bytes:
    lines = [GOODREADS_CSV_HEADERS] + rows
    return "\n".join(lines).encode("utf-8")


def _upload(client, headers, content: bytes, filename="goodreads_library_export.csv"):
    return client.post(
        "/import/goodreads",
        files={"file": (filename, io.BytesIO(content), "text/csv")},
        headers=headers,
    )


class TestGoodreadsImport:
    def test_requires_auth(self, client):
        r = client.post("/import/goodreads", files={"file": ("f.csv", io.BytesIO(b"x"), "text/csv")})
        assert r.status_code == 401

    def test_import_single_finished_book(self, client, db):
        user = _make_user(db, email="imp_single@example.com")
        row = '1,"The Hobbit","Tolkien J.R.R.","Tolkien, J.R.R.",,="9780261102217",="9780261102217",5,4.28,Allen & Unwin,Paperback,310,1937,1937,2023/06/15,2023/01/01,,,read,,,,1,0'
        r = _upload(client, _auth(user), _csv([row]))
        assert r.status_code == 200
        data = r.json()
        assert data["imported"] >= 1
        assert data["total"] >= 1

    def test_import_to_read_book(self, client, db):
        user = _make_user(db, email="imp_toread@example.com")
        row = '2,"Dune","Herbert, Frank","Herbert, Frank",,,,0,4.23,,Paperback,412,1965,1965,,2024/01/01,,,to-read,,,,0,0'
        r = _upload(client, _auth(user), _csv([row]))
        assert r.status_code == 200
        assert r.json()["imported"] >= 1

    def test_import_currently_reading(self, client, db):
        user = _make_user(db, email="imp_reading@example.com")
        row = '3,"1984","Orwell, George","Orwell, George",,,,0,4.17,,Paperback,328,1949,1949,,2024/03/01,,,currently-reading,,,,0,0'
        r = _upload(client, _auth(user), _csv([row]))
        assert r.status_code == 200
        assert r.json()["imported"] >= 1

    def test_import_multiple_books(self, client, db):
        user = _make_user(db, email="imp_multi@example.com")
        rows = [
            '10,"Book One","Author A","A, Author",,,,0,4.0,,Paperback,200,2000,2000,,2024/01/01,,,to-read,,,,0,0',
            '11,"Book Two","Author B","B, Author",,,,0,4.0,,Paperback,300,2001,2001,2024/02/01,2024/01/01,,,read,,,,1,0',
            '12,"Book Three","Author C","C, Author",,,,0,4.0,,Paperback,400,2002,2002,,2024/01/01,,,currently-reading,,,,0,0',
        ]
        r = _upload(client, _auth(user), _csv(rows))
        assert r.status_code == 200
        data = r.json()
        assert data["imported"] == 3
        assert data["total"] == 3
        assert data["skipped"] == 0

    def test_import_skips_already_imported_book(self, client, db):
        user = _make_user(db, email="imp_skip@example.com")
        row = '20,"Unique Book XYZ","Some Author","Author, Some",,,,0,4.0,,Paperback,200,2020,2020,,2024/01/01,,,to-read,,,,0,0'
        _upload(client, _auth(user), _csv([row]))
        r = _upload(client, _auth(user), _csv([row]))
        assert r.status_code == 200
        assert r.json()["skipped"] >= 1

    def test_import_returns_summary_fields(self, client, db):
        user = _make_user(db, email="imp_summary@example.com")
        r = _upload(client, _auth(user), _csv([]))
        assert r.status_code == 200
        data = r.json()
        for key in ("imported", "skipped", "failed", "total"):
            assert key in data, f"Missing key: {key}"

    def test_wrong_file_type_rejected(self, client, db):
        user = _make_user(db, email="imp_badfile@example.com")
        r = client.post(
            "/import/goodreads",
            files={"file": ("export.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
            headers=_auth(user),
        )
        assert r.status_code == 400

    def test_empty_csv_returns_zero_counts(self, client, db):
        user = _make_user(db, email="imp_empty@example.com")
        r = _upload(client, _auth(user), _csv([]))
        assert r.status_code == 200
        data = r.json()
        assert data["imported"] == 0
        assert data["total"] == 0

    def test_books_appear_in_library_after_import(self, client, db):
        user = _make_user(db, email="imp_verify@example.com")
        h = _auth(user)
        row = '30,"VerifyBook","Verify Author","Author, Verify",,,,5,4.5,,Paperback,250,2010,2010,2023/01/01,2022/01/01,,,read,,,,1,0'
        _upload(client, h, _csv([row]))
        r = client.get("/userbooks/", headers=h)
        titles = [b["book"]["title"] for b in r.json() if b.get("book")]
        assert "VerifyBook" in titles
