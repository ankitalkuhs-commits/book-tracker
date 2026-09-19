"""Route dependency hygiene.

app.database.get_session() is a plain function that returns Session(engine), written for
scripts ("with get_session() as s:"). Used as a FastAPI dependency, FastAPI calls it, hands the
session to the route and never closes it: only generator dependencies (yield) get teardown.
Every request through such a route leaked a session and its pooled connection until the
garbage collector happened to reclaim it. Found 2026-09-18 in app/routers/import_router.py.
"""
import inspect

from fastapi.routing import APIRoute

from app.main import app


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
