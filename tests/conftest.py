"""
Shared fixtures for all tests.
Uses a named shared-cache in-memory SQLite DB so all sessions see the same data.
"""
import os
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-not-production")

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from app.main import app
from app.database import get_db, get_session
from app import auth, crud

# Named shared-cache in-memory DB — every Session(engine) gets its own
# connection but they all share the same in-memory database instance.
TEST_DB_URL = "sqlite:///file:testdb?mode=memory&cache=shared&uri=true"

engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
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
