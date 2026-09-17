"""Tests for F-53 — unique (user_id, book_id), (note_id, user_id), (follower_id, followed_id).

Race tests T-A2-75..78 (before_flush-listener races) are intentionally not included here —
see the Builder's Build Notes for the K-12 reason. The three DB-constraint tests
(T-A2-70..72) and the shape/idempotency checks (T-A2-73, T-A2-74) below are not droppable.
"""
import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app import crud
from app.models import Book, Follow, Like, Note, UserBook
from tests.conftest import _auth, _make_user, engine


def _book(db, title="Uniq Book"):
    b = Book(title=title)
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


# ── T-A2-70..72: direct duplicate inserts raise IntegrityError ─────────────

class TestDbConstraints:
    def test_db_rejects_duplicate_userbook(self, db):
        u = _make_user(db, email="uniq_ub_user@example.com")
        b = _book(db, "Uniq UB Book")
        db.add(UserBook(user_id=u.id, book_id=b.id, status="to-read"))
        db.commit()
        db.add(UserBook(user_id=u.id, book_id=b.id, status="to-read"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        rows = db.exec(select(UserBook).where(UserBook.user_id == u.id, UserBook.book_id == b.id)).all()
        assert len(rows) == 1

    def test_db_rejects_duplicate_like(self, db):
        u = _make_user(db, email="uniq_like_user@example.com")
        note = Note(user_id=u.id, text="Uniq like note", is_public=True)
        db.add(note)
        db.commit()
        db.refresh(note)
        db.add(Like(note_id=note.id, user_id=u.id))
        db.commit()
        db.add(Like(note_id=note.id, user_id=u.id))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        rows = db.exec(select(Like).where(Like.note_id == note.id, Like.user_id == u.id)).all()
        assert len(rows) == 1

    def test_db_rejects_duplicate_follow(self, db):
        a = _make_user(db, email="uniq_follow_a@example.com")
        b = _make_user(db, email="uniq_follow_b@example.com")
        db.add(Follow(follower_id=a.id, followed_id=b.id))
        db.commit()
        db.add(Follow(follower_id=a.id, followed_id=b.id))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        rows = db.exec(select(Follow).where(Follow.follower_id == a.id, Follow.followed_id == b.id)).all()
        assert len(rows) == 1

    def test_sqlite_unique_constraints_present(self):
        insp = inspect(engine)
        cases = [
            ("userbook", {"user_id", "book_id"}),
            ("like", {"note_id", "user_id"}),
            ("follow", {"follower_id", "followed_id"}),
        ]
        for table, cols in cases:
            uniques = insp.get_unique_constraints(table)
            unique_col_sets = [set(u["column_names"]) for u in uniques]
            if cols not in unique_col_sets:
                # SQLite sometimes reports a unique constraint as a unique index instead
                indexes = insp.get_indexes(table)
                unique_index_sets = [set(i["column_names"]) for i in indexes if i.get("unique")]
                assert cols in unique_index_sets, f"{table}: no unique constraint/index on {cols}"

        assert any(
            isinstance(c, __import__("sqlalchemy").UniqueConstraint) and c.name == "uq_userbook_user_book"
            for c in UserBook.__table__.constraints
        )
        assert any(
            isinstance(c, __import__("sqlalchemy").UniqueConstraint) and c.name == "uq_like_note_user"
            for c in Like.__table__.constraints
        )
        assert any(
            isinstance(c, __import__("sqlalchemy").UniqueConstraint) and c.name == "uq_follow_pair"
            for c in Follow.__table__.constraints
        )


# ── T-A2-74: sequential duplicate contracts are unchanged ──────────────────

class TestSequentialDuplicateContracts:
    def test_sequential_duplicate_contracts_unchanged(self, client, db):
        user = _make_user(db, email="uniq_seq_user@example.com")
        h = _auth(user)

        # (a) add-to-library twice with the same google_books_id
        payload = {"title": "Uniq Seq Book", "google_books_id": "uniq-seq-gid", "total_pages": 100, "status": "reading"}
        client.post("/books/add-to-library", json=payload, headers=h)
        r_a = client.post("/books/add-to-library", json=payload, headers=h)
        assert r_a.status_code == 400
        assert "already in your library" in r_a.json()["detail"]
        book = db.exec(select(Book).where(Book.google_books_id == "uniq-seq-gid")).first()
        assert len(db.exec(select(UserBook).where(UserBook.user_id == user.id, UserBook.book_id == book.id)).all()) == 1

        # (b) POST /userbooks/ the same book twice
        book2 = _book(db, "Uniq Seq Book2")
        r_b1 = client.post("/userbooks/", json={"book_id": book2.id, "status": "to-read"}, headers=h)
        assert r_b1.status_code == 201
        r_b2 = client.post("/userbooks/", json={"book_id": book2.id, "status": "to-read"}, headers=h)
        assert r_b2.status_code == 400
        assert len(db.exec(select(UserBook).where(UserBook.user_id == user.id, UserBook.book_id == book2.id)).all()) == 1

        # (c) like the same note twice
        note_r = client.post("/notes/", json={"text": "Uniq seq note", "is_public": True}, headers=h)
        note_id = note_r.json()["id"]
        client.post(f"/notes/{note_id}/like", headers=h)
        r_c = client.post(f"/notes/{note_id}/like", headers=h)
        assert r_c.status_code == 201
        assert r_c.json() == {"message": "Already liked", "liked": True}
        db.expire_all()
        assert len(db.exec(select(Like).where(Like.note_id == note_id, Like.user_id == user.id)).all()) == 1

        # (d) follow twice
        other = _make_user(db, email="uniq_seq_other@example.com")
        client.post(f"/follow/{other.id}", headers=h)
        r_d = client.post(f"/follow/{other.id}", headers=h)
        assert r_d.status_code == 400
        assert r_d.json() == {"detail": "Already following"}
        db.expire_all()
        assert len(db.exec(select(Follow).where(Follow.follower_id == user.id, Follow.followed_id == other.id)).all()) == 1
