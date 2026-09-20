"""Server-Timing header (F-68 diagnosis).

Every response reports how long the request spent in the database and how many SQL statements
it ran, so per-query cost can be read straight off production (`curl -sI`, or DevTools > Network
> Timing) instead of being inferred from end-to-end timings. Durations and a count only: never
SQL, parameters or data.
"""
import re

from sqlalchemy import event

from tests.conftest import _auth, _make_user, engine

HEADER = re.compile(r'db;dur=(?P<db>\d+(?:\.\d+)?);desc="(?P<q>\d+) queries", total;dur=(?P<total>\d+(?:\.\d+)?)')


def _timing(response):
    value = response.headers.get("server-timing", "")
    m = HEADER.fullmatch(value)
    assert m, f"missing or malformed Server-Timing header: {value!r}"
    return float(m["db"]), int(m["q"]), float(m["total"]), value


def test_route_without_queries_reports_zero(client):
    db_ms, queries, total_ms, _ = _timing(client.get("/version"))
    assert queries == 0
    assert db_ms == 0.0
    assert total_ms >= 0.0


def test_query_count_matches_the_statements_actually_run(client, db):
    user = _make_user(db, email="st_count@example.com")
    headers = _auth(user)
    client.get("/userbooks/", headers=headers)   # prime: the once-a-day last_active touch

    seen = []
    listener = lambda *a, **k: seen.append(1)    # independent count on the test engine
    event.listen(engine, "before_cursor_execute", listener)
    try:
        response = client.get("/userbooks/", headers=headers)
    finally:
        event.remove(engine, "before_cursor_execute", listener)

    assert response.status_code == 200
    db_ms, queries, total_ms, _ = _timing(response)
    assert queries == len(seen) and queries >= 1, (queries, len(seen))
    assert db_ms > 0.0
    assert total_ms >= db_ms


def test_header_never_carries_sql_or_data(client, db):
    user = _make_user(db, email="st_leak@example.com")
    *_, value = _timing(client.get("/userbooks/", headers=_auth(user)))
    assert not re.search(r"select|from|where|insert|update|st_leak", value, re.IGNORECASE), value


def test_error_responses_are_timed_too(client):
    _, queries, _, _ = _timing(client.get("/userbooks/", headers={"Authorization": "Bearer not-a-token"}))
    assert queries >= 0
