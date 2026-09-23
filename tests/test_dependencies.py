"""Route dependency hygiene.

app.database.get_session() is a plain function that returns Session(engine), written for
scripts ("with get_session() as s:"). Used as a FastAPI dependency, FastAPI calls it, hands the
session to the route and never closes it: only generator dependencies (yield) get teardown.
Every request through such a route leaked a session and its pooled connection until the
garbage collector happened to reclaim it. Found 2026-09-18 in app/routers/import_router.py.
"""
import inspect
import os

from fastapi.routing import APIRoute

from app.main import app
import app.database as database


def _dependency_calls(dependant):
    for dep in dependant.dependencies:
        yield dep.call
        yield from _dependency_calls(dep)


def test_every_database_dependency_is_a_generator():
    """Any dependency a route gets from app.database must be a generator, so FastAPI closes the
    session after the response. A plain function returning Session(engine) is never closed."""
    offenders = sorted(
        f"{','.join(sorted(route.methods))} {route.path} -> {call.__name__}"
        for route in app.routes
        if isinstance(route, APIRoute)
        for call in set(_dependency_calls(route.dependant))
        if getattr(call, "__module__", None) == "app.database" and not inspect.isgeneratorfunction(call)
    )
    assert offenders == [], f"{len(offenders)} route(s) get a DB session that is never closed: {offenders[:5]}"


def test_get_session_is_get_db():
    """F-67: 24 routes ask for get_session. It must stay the same generator as get_db, so every
    request gets one session and one pool checkout."""
    assert database.get_session is database.get_db


def test_pool_pre_ping_decision_is_written_down():
    """ST-4E-02 / R-02 (E-3): pool_pre_ping stays True, and the reasoning is on the record next
    to it — the measured cost, why it stays, and what would make it worth revisiting. A comment
    is the deliverable here, so the check is on the source, within 10 lines of the setting."""
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "database.py")
    with open(path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()

    hits = [i for i, line in enumerate(lines) if "pool_pre_ping=True" in line.replace(" ", "")]
    assert len(hits) == 1, f"expected exactly one pool_pre_ping setting in app/database.py, found {len(hits)}"
    i = hits[0]
    window = "\n".join(lines[max(0, i - 10): i + 11]).lower()

    for label, needles in (
        ("the measured cost", ("170-200 ms", "select 1")),
        ("the Supabase idle-close reason", ("supabase", "pool_recycle=300", "age")),
        ("the revisit condition", ("co-located", "5 ms")),
    ):
        missing = [n for n in needles if n not in window]
        assert not missing, (
            f"app/database.py:{i + 1} pool_pre_ping=True is undocumented: "
            f"{label} is missing {missing} from the 10 lines around it"
        )
