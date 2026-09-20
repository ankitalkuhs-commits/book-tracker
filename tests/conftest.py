"""
Shared fixtures for all tests.
Uses a named shared-cache in-memory SQLite DB so all sessions see the same data.
"""
import os
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-not-production")

import re
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy.pool import QueuePool
from app.main import app
from app.database import get_db, get_session
from app import auth, crud
import app.localday as localday

# Named shared-cache in-memory DB — every Session(engine) gets its own
# connection but they all share the same in-memory database instance.
TEST_DB_URL = "sqlite:///file:testdb?mode=memory&cache=shared&uri=true"

# QueuePool, not SQLAlchemy 1.4's default SingletonThreadPool for in-memory SQLite. That pool
# keeps one connection per thread, and beyond 5 threads it closes other threads' connections,
# chosen arbitrarily, even while they are in use. FastAPI serves sync routes on AnyIO worker
# threads that retire after 10 s idle, so long runs exceed 5 threads and a request now and then
# failed at teardown with "Cannot operate on a closed database" (tests.md K-01; about 1 full run
# in 5). QueuePool never closes a checked-out connection, and it keeps idle ones open, which the
# shared-cache in-memory database needs in order to survive.
engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=QueuePool,
)

# Create tables at import time — before any fixture or test runs
SQLModel.metadata.create_all(engine)


def override_get_db():
    with Session(engine) as session:
        yield session


def override_get_session():
    with Session(engine) as session:
        yield session


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_session] = override_get_session


# ── User / token helpers ─────────────────────────────────────────────────────

def _make_user(db, email="alice@example.com", name="Alice", password="password123", is_admin=False):
    existing = crud.get_user_by_email(db, email=email)
    if existing:
        return existing
    hashed = auth.hash_password(password)
    user = crud.create_user(db, name=name, email=email, password_hash=hashed)
    if is_admin:
        user.is_admin = True
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def _token(user):
    return auth.create_access_token({"sub": user.email})


def _auth(user):
    return {"Authorization": f"Bearer {_token(user)}"}


# Create shared users once at module load time, before any test runs.
# These are re-fetched per fixture call so they're always attached to a live session.
with Session(engine) as _boot:
    _make_user(_boot, email="alice_f@example.com", name="Alice")
    _make_user(_boot, email="bob_f@example.com", name="Bob")
    _make_user(_boot, email="admin_f@example.com", name="Admin", is_admin=True)


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture()
def db():
    with Session(engine) as session:
        yield session


@pytest.fixture()
def client():
    return TestClient(app, raise_server_exceptions=True)


def _fresh_user(email):
    """Return a freshly-attached user object for use in fixtures."""
    with Session(engine) as s:
        user = crud.get_user_by_email(s, email=email)
        # Expunge so we can return it outside the session context;
        # only .id and .email are needed by _auth()
        s.expunge(user)
        return user


@pytest.fixture(scope="session")
def alice():
    return _fresh_user("alice_f@example.com")


@pytest.fixture(scope="session")
def bob():
    return _fresh_user("bob_f@example.com")


@pytest.fixture(scope="session")
def admin():
    return _fresh_user("admin_f@example.com")


@pytest.fixture(scope="session")
def alice_headers():
    return _auth(_fresh_user("alice_f@example.com"))


@pytest.fixture(scope="session")
def bob_headers():
    return _auth(_fresh_user("bob_f@example.com"))


@pytest.fixture(scope="session")
def admin_headers():
    return _auth(_fresh_user("admin_f@example.com"))


# ── Clock seam (Sprint 4C, F-62) ─────────────────────────────────────────────

@pytest.fixture(autouse=True)
def pinned_now(monkeypatch):
    """Every test sees localday.utcnow() == today's UTC date at a fixed hour (default 06:00:00).

    06:00 UTC is the same calendar date from UTC-6 to UTC+14, including IST (11:30) and UTC,
    so tests that build data with the real datetime.utcnow() agree with the server's "today".
    The hour is fixed, so no test can depend on the wall-clock hour (F-62). Boundary tests
    override with freeze_at(). BT_TEST_PIN_HOUR (0-18) lets gate G-4C-04 pin the hour on either
    side of the real clock (K-04)."""
    pin_hour = int(os.environ.get("BT_TEST_PIN_HOUR", "6"))
    pinned = datetime.utcnow().replace(hour=pin_hour, minute=0, second=0, microsecond=0)
    monkeypatch.setattr(localday, "utcnow", lambda: pinned)
    return pinned


@pytest.fixture()
def freeze_at(monkeypatch):
    """freeze_at("2026-09-17T19:00:00") -> localday.utcnow() returns that naive-UTC instant."""
    def _freeze(iso: str) -> datetime:
        t = datetime.fromisoformat(iso)
        monkeypatch.setattr(localday, "utcnow", lambda: t)
        return t
    return _freeze


class _StatementCounter:
    """Counts SQL statements on `engine` via before_cursor_execute (the F-08 pattern)."""

    _UPDATE_USER_RE = re.compile(r'^\s*UPDATE\s+"?user"?\s', re.IGNORECASE)

    def __init__(self):
        self.selects = 0
        self.updates_user = 0

    def reset(self):
        self.selects = 0
        self.updates_user = 0

    def _before_cursor_execute(self, conn, cursor, statement, parameters, context, executemany):
        s = statement.strip()
        if s[:6].upper() == "SELECT":
            self.selects += 1
        if self._UPDATE_USER_RE.match(s):
            self.updates_user += 1


@pytest.fixture()
def stmt_counter():
    """Listens on the SAME engine object the running app actually queries through.

    tests/conftest.py is imported twice under two different module names — once as the
    bare "conftest" plugin pytest auto-loads for fixtures, and again as "tests.conftest"
    by every test file's `from tests.conftest import ...`. Each import re-runs this whole
    module and creates its OWN `engine` (and re-registers `app.dependency_overrides`), so
    the two module instances end up with two different Engine objects; whichever imports
    last wins the dependency override. Listening on the bare-name copy's `engine` would
    silently miss every HTTP-driven query. Resolving through `tests.conftest` (the name
    every test file already imports) keeps this fixture correct regardless of import order.
    """
    import tests.conftest as _tc
    from sqlalchemy import event
    counter = _StatementCounter()
    event.listen(_tc.engine, "before_cursor_execute", counter._before_cursor_execute)
    try:
        yield counter
    finally:
        event.remove(_tc.engine, "before_cursor_execute", counter._before_cursor_execute)
