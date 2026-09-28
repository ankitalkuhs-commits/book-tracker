"""Sprint 4E — GET /users/{id}/stats: values and the finished-book N+1.

Cases L-4E-11 (values, LEFT-join behaviour) and L-4E-12 (query count does not grow
with the shelf).  Scope is the N+1 loop only; the private-profile gate (L-4E-10) is
not part of the descoped sprint and is left alone.
"""
from datetime import datetime

import pytest
from sqlalchemy import event

import tests.conftest as _tc
from tests.conftest import _make_user, _auth
from app import models


# ── counting harness (the F-08 pattern, on the engine the app really queries) ──

@pytest.fixture()
def stats_counter():
    """Counts every statement sent to the DBAPI cursor on the test engine.

    Resolved through `tests.conftest` for the reason the `stmt_counter` fixture
    documents: conftest is imported twice and each copy builds its own Engine.
    """
    counter = {"n": 0, "statements": []}

    def _count(conn, cursor, statement, parameters, context, executemany):
        counter["n"] += 1
        counter["statements"].append(" ".join(statement.split())[:160])

    event.listen(_tc.engine, "before_cursor_execute", _count)
    try:
        yield counter
    finally:
        event.remove(_tc.engine, "before_cursor_execute", _count)


def _measure(client, counter, url, headers):
    """Prime once (absorbs the once-per-local-day last_active UPDATE), then count."""
    assert client.get(url, headers=headers).status_code == 200
    counter["n"] = 0
    counter["statements"].clear()
    r = client.get(url, headers=headers)
    assert r.status_code == 200
    return counter["n"], r.json(), list(counter["statements"])


# ── seed helpers ──────────────────────────────────────────────────────────────

ORPHAN_BOOK_ID = 9_900_001          # no `book` row has this id


def _book(db, title, pages):
    b = models.Book(title=title, author="QA", total_pages=pages)
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


def _userbook(db, user_id, book_id, status, *, current_page=None, updated_at=None):
    ub = models.UserBook(
        user_id=user_id, book_id=book_id, status=status,
        current_page=current_page, updated_at=updated_at,
    )
    db.add(ub)
    db.commit()
    db.refresh(ub)
    return ub


class TestUserStatsValues:
    """L-4E-11 — every value the endpoint reports, on a mixed shelf.

    Deviation from tests.md, recorded in the build notes: the case asks for "one
    finished userbook whose book_id is null".  `userbook.book_id` is NOT NULL in
    every schema this app has (models.py:77, create_tables.sql:35), so that row
    cannot exist.  The reachable equivalent — and the one the lazy load used to
    hide just the same — is a userbook pointing at a `book` row that is not there.
    """

    def test_all_values_on_a_mixed_shelf(self, client, db, freeze_at):
        freeze_at("2026-06-15T06:00:00")
        subject = _make_user(db, email="l4e11_subject@example.com", name="Subject")
        viewer = _make_user(db, email="l4e11_viewer@example.com", name="Viewer")

        # 4 finished books with known page counts, spread over the two date windows
        finished = [
            (_book(db, "L4E11 F1", 100), datetime(2026, 6, 10, 12, 0)),   # last 30 days + this year
            (_book(db, "L4E11 F2", 200), datetime(2026, 6, 1, 12, 0)),    # last 30 days + this year
            (_book(db, "L4E11 F3", 300), datetime(2026, 2, 10, 12, 0)),   # this year only
            (_book(db, "L4E11 F4", 400), datetime(2025, 11, 20, 12, 0)),  # neither window
        ]
        for bk, when in finished:
            _userbook(db, subject.id, bk.id, "finished", updated_at=when)

        # 2 reading with progress, 1 to-read
        _userbook(db, subject.id, _book(db, "L4E11 R1", 900).id, "reading",
                  current_page=50, updated_at=datetime(2026, 6, 11, 12, 0))
        _userbook(db, subject.id, _book(db, "L4E11 R2", 900).id, "reading",
                  current_page=75, updated_at=datetime(2026, 6, 12, 12, 0))
        _userbook(db, subject.id, _book(db, "L4E11 T1", 900).id, "to-read",
                  updated_at=datetime(2026, 6, 13, 12, 0))

        # the LEFT-join row: finished, but its book is gone
        _userbook(db, subject.id, ORPHAN_BOOK_ID, "finished", updated_at=None)

        r = client.get(f"/users/{subject.id}/stats", headers=_auth(viewer))
        assert r.status_code == 200, r.text
        s = r.json()

        # (h) the orphan row does not 500 and is still counted
        assert s["total_books"] == 8, f"total_books == {s['total_books']}, expected 8"
        assert s["finished"] == 5, f"finished == {s['finished']}, expected 5"
        assert s["reading"] == 2
        assert s["to_read"] == 1
        assert s["last_month"] == 2, f"last_month == {s['last_month']}, expected 2"
        assert s["this_year"] == 3, f"this_year == {s['this_year']}, expected 3"
        # 100+200+300+400 finished pages + 50+75 current progress; the orphan adds 0
        assert s["total_pages"] == 1125, f"total_pages == {s['total_pages']}, expected 1125"


class TestUserStatsQueryCount:
    """L-4E-12 — the count must not grow with the number of finished books."""

    def test_query_count_flat_across_shelf_size(self, client, db, stats_counter):
        subject = _make_user(db, email="l4e12_subject@example.com", name="Subject12")
        viewer = _make_user(db, email="l4e12_viewer@example.com", name="Viewer12")

        for i in range(5):
            _userbook(db, subject.id, _book(db, f"L4E12 small {i}", 100 + i).id, "finished",
                      updated_at=datetime(2026, 6, 10, 12, 0))

        url = f"/users/{subject.id}/stats"
        n_small, body_small, _ = _measure(client, stats_counter, url, _auth(viewer))

        for i in range(45):
            _userbook(db, subject.id, _book(db, f"L4E12 large {i}", 100 + i).id, "finished",
                      updated_at=datetime(2026, 6, 10, 12, 0))

        n_large, body_large, stmts = _measure(client, stats_counter, url, _auth(viewer))

        # (c) the second request really did more work
        assert body_small["total_books"] == 5
        assert body_large["total_books"] == 50
        # (a) flat
        assert n_small == n_large, (
            f"5 finished books cost {n_small} queries, 50 cost {n_large} (must be equal)\n"
            + "\n".join(f"  {i + 1}. {s}" for i, s in enumerate(stmts[:8]))
        )
        # (b) under budget
        assert n_large <= 4, f"GET /users/{{id}}/stats ran {n_large} queries, budget 4"
