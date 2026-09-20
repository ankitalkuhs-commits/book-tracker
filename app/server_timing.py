"""Server-Timing header: per-request database time and SQL statement count (F-68 diagnosis).

Adds `Server-Timing: db;dur=<ms>;desc="<n> queries", total;dur=<ms>` to every HTTP response,
so the cost of each database round trip can be read directly off production with `curl -sI`,
or in DevTools > Network > Timing. It carries durations and a count only, never SQL,
parameters or data.

The listeners are registered on the Engine class, so they count statements on whichever
engine serves the request (production PostgreSQL, local SQLite or the test engine). A
statement is counted only while a request is being timed: the context variable is None
everywhere else, for example in the scheduler.
"""
import time
from contextvars import ContextVar
from typing import Optional

from sqlalchemy import event
from sqlalchemy.engine import Engine

_current: ContextVar[Optional[dict]] = ContextVar("server_timing", default=None)


@event.listens_for(Engine, "before_cursor_execute")
def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    if _current.get() is not None:
        conn.info.setdefault("_server_timing_starts", []).append(time.perf_counter())


@event.listens_for(Engine, "after_cursor_execute")
def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    timing = _current.get()
    starts = conn.info.get("_server_timing_starts")
    if timing is not None and starts:
        timing["db"] += time.perf_counter() - starts.pop()
        timing["queries"] += 1


class ServerTimingMiddleware:
    """Pure ASGI middleware, like the others in main.py. Sync routes run in the threadpool
    with a copy of this context, so they update the same `timing` dict."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        timing = {"db": 0.0, "queries": 0}
        token = _current.set(timing)
        start = time.perf_counter()

        async def send_with_timing(message):
            if message["type"] == "http.response.start":
                total_ms = (time.perf_counter() - start) * 1000
                value = f'db;dur={timing["db"] * 1000:.3f};desc="{timing["queries"]} queries", total;dur={total_ms:.3f}'
                message["headers"] = list(message.get("headers", [])) + [(b"server-timing", value.encode())]
            await send(message)

        try:
            await self.app(scope, receive, send_with_timing)
        finally:
            _current.reset(token)
