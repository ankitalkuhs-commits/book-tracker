"""Goodreads import - hardening cases from the 2026-10-15 audit.

A separate file from tests/test_import.py on purpose: 4G's
test_no_existing_test_file_was_edited treats any change to a test file that existed at its
pinned base as an offence, and a new file is correctly outside that rule.

Every assertion here is a behaviour measured against the real endpoint during the audit, not
inferred from reading the code.
"""
import io
from tests.conftest import _make_user, _auth
from tests.test_import import GOODREADS_CSV_HEADERS, _csv, _upload

# ── Sprint 4M: audit findings, each pinned by a measured fact ────────────────
class TestGoodreadsImportHardening:
    """Added after an end-to-end audit of the import. Every assertion below is a behaviour
    that was measured against the real endpoint, not inferred from reading the code."""

    def test_isbn_is_normalised_whatever_goodreads_spelling(self, db):
        """`="9780140449136"`, spaced, and hyphenated must all reduce to the same ISBN.

        The old cleaner used the class [="\'\\s], which reads as "quotes and whitespace"
        but is the five characters = " \' \\ and a LITERAL 's'. Measured before the fix:
        "978 014 044 9136" kept its spaces, hyphens survived, and "notanisbn" came back as
        "notanibn". A malformed ISBN matches no Book and builds a broken cover URL.
        """
        from app.routers.import_router import _clean_isbn
        canonical = "9780140449136"
        for spelling in ('="9780140449136"', "  978 014 044 9136  ",
                         "978-0-14-044913-6", "9780140449136"):
            assert _clean_isbn(spelling) == canonical, f"{spelling!r} did not normalise"
        # the check character is kept and upper-cased; junk yields nothing at all
        assert _clean_isbn('="014044913x"') == "014044913X"
        assert _clean_isbn("notanisbn") is None
        assert _clean_isbn('=""') is None
        assert _clean_isbn("") is None

    def test_same_book_under_three_isbn_spellings_is_one_book(self, client, db):
        """The point of normalising: three rows, one Book, two skips."""
        from sqlmodel import select
        from app import models
        user = _make_user(db, email="isbn_norm@example.com")
        rows = [
            '1,"Normalised","N N","N, N",,,="9780140449136",0,,,Paperback,100,,,,,,,to-read,,,,0,0',
            '2,"Normalised B","N N","N, N",,,="978 014 044 9136",0,,,Paperback,100,,,,,,,to-read,,,,0,0',
            '3,"Normalised C","N N","N, N",,,="978-0-14-044913-6",0,,,Paperback,100,,,,,,,to-read,,,,0,0',
        ]
        r = _upload(client, _auth(user), _csv(rows))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["imported"] == 1, body
        assert body["skipped"] == 2, body
        books = db.exec(select(models.Book).where(models.Book.isbn == "9780140449136")).all()
        assert len(books) == 1, f"expected one Book row, found {len(books)}"

    def test_oversized_upload_is_refused_before_it_is_parsed(self, client, db):
        """There was no cap at all: the whole body went into memory and every row was run."""
        from app.routers.import_router import MAX_IMPORT_BYTES
        user = _make_user(db, email="too_big@example.com")
        payload = GOODREADS_CSV_HEADERS.encode() + b"\n" + (b"x" * (MAX_IMPORT_BYTES + 1024))
        r = _upload(client, _auth(user), payload)
        assert r.status_code == 413, f"expected 413, got {r.status_code}"
        assert "larger than" in r.json()["detail"]

    def test_a_file_just_under_the_cap_is_still_accepted(self, client, db):
        """CONTROL for the case above: the cap must not reject ordinary exports."""
        user = _make_user(db, email="just_under@example.com")
        rows = [f'{i},"Under {i}","A {i}","A, {i}",,,,0,,,Paperback,100,,,,,,,to-read,,,,0,0'
                for i in range(1, 51)]
        r = _upload(client, _auth(user), _csv(rows))
        assert r.status_code == 200, r.text
        assert r.json()["imported"] == 50, r.json()

    def test_review_is_imported_as_a_private_note(self, client, db):
        """A Goodreads review is the reader's own writing; it must not become a public post."""
        from sqlmodel import select
        from app import models
        user = _make_user(db, email="rev_private@example.com")
        row = ('1,"Reviewed","R R","R, R",,,,4,,,Paperback,200,,,2024/02/02,2024/01/01,,,read,'
               '"Loved it. Twice.",,,1,0')
        assert _upload(client, _auth(user), _csv([row])).status_code == 200
        notes = db.exec(select(models.Note).where(models.Note.user_id == user.id)).all()
        assert len(notes) == 1, f"expected one note, found {len(notes)}"
        assert notes[0].text == "Loved it. Twice."
        assert notes[0].is_public is False, "an imported review was made public"

    def test_unrated_books_have_no_rating_rather_than_zero_stars(self, client, db):
        """Goodreads writes My Rating=0 for unrated. Storing 0 would show an empty star rating."""
        from sqlmodel import select
        from app import models
        user = _make_user(db, email="unrated@example.com")
        row = '1,"Unrated","U U","U, U",,,,0,,,Paperback,100,,,,2024/01/01,,,to-read,,,,0,0'
        assert _upload(client, _auth(user), _csv([row])).status_code == 200
        ub = db.exec(select(models.UserBook).where(models.UserBook.user_id == user.id)).first()
        assert ub.rating is None, f"unrated book stored rating={ub.rating!r}"

    def test_a_row_that_cannot_be_parsed_does_not_abort_the_import(self, client, db):
        """One bad row must not cost the reader the other 499."""
        user = _make_user(db, email="partial@example.com")
        rows = [
            ',,"No Title","",,,,0,,,Paperback,,,,,,,,to-read,,,,0,0',                      # no title
            '2,"Bad Pages","D D","D, D",,,,0,,,Paperback,not-a-number,,,,,,,to-read,,,,0,0',
            '3,"Fine","E E","E, E",,,,0,,,Paperback,100,,,,,,,read,,,,0,0',
        ]
        r = _upload(client, _auth(user), _csv(rows))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["imported"] == 2, body          # bad pages is tolerated, missing title is not
        assert body["failed"] == 1, body
        assert body["errors"][0]["reason"] == "Missing title"

    def test_a_failure_midway_still_imports_the_rest(self, client, db, monkeypatch):
        """The per-row `except` must actually recover, not just look like it does.

        Added because MUT-4M-06 (turning that except into a bare `raise`) did NOT turn any
        test red: the two bad rows in the case above never reach it - a missing title is
        caught by an explicit check before the `try`, and non-numeric pages are guarded by
        isdigit(). The catch-all was unexercised, so nothing pinned it. This forces a real
        exception partway through and asserts the remaining rows still land.
        """
        from sqlmodel import Session as SMSession, select
        from app import models
        user = _make_user(db, email="midway@example.com")
        rows = [f'{i},"Midway {i}","A {i}","A, {i}",,,,0,,,Paperback,100,,,,,,,to-read,,,,0,0'
                for i in range(1, 6)]

        calls = {"n": 0}
        original = SMSession.flush

        def flaky(self, *a, **k):
            calls["n"] += 1
            if calls["n"] == 4:
                raise RuntimeError("simulated failure partway through")
            return original(self, *a, **k)

        monkeypatch.setattr(SMSession, "flush", flaky)
        r = _upload(client, _auth(user), _csv(rows))
        monkeypatch.undo()

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["failed"] == 1, body
        assert body["imported"] == 4, f"a mid-import failure cost more than its own row: {body}"
        persisted = db.exec(
            select(models.UserBook).where(models.UserBook.user_id == user.id)).all()
        assert len(persisted) == 4, f"{len(persisted)} of 4 survived the commit"

    def test_the_row_cap_stops_the_import_and_says_so(self, client, db, monkeypatch):
        """The cap is 20,000 rows in production; this patches it down so the branch is
        actually exercised rather than asserted about a file nobody will build in a test.

        Added because MUT-4M-07 (deleting the cap) did not turn anything red without it.
        """
        import app.routers.import_router as ir
        monkeypatch.setattr(ir, "MAX_IMPORT_ROWS", 3)
        user = _make_user(db, email="rowcap@example.com")
        rows = [f'{i},"Cap {i}","A {i}","A, {i}",,,,0,,,Paperback,100,,,,,,,to-read,,,,0,0'
                for i in range(1, 11)]
        r = _upload(client, _auth(user), _csv(rows))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["imported"] == 3, f"the cap did not stop the import: {body}"
        assert any("Stopped at 3 rows" in (e.get("reason") or "") for e in body["errors"]), body
