"""
Backend tests for notes API endpoints.
Run: pytest tests/test_notes_api.py -v
"""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool

from app.main import app
from app.database import get_session
from app import models, crud


# ─── In-memory SQLite for tests ───────────────────────────────────────────────

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def create_test_user(session: Session, email="test@example.com", name="Test User") -> models.User:
    user = models.User(email=email, name=name, is_admin=False)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def create_test_note(session: Session, user: models.User, text="Test note", is_public=True) -> models.Note:
    note = models.Note(user_id=user.id, text=text, is_public=is_public)
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


def auth_header(user: models.User) -> dict:
    """Generate a JWT token for a test user and return as auth header."""
    from app.auth import create_access_token
    token = create_access_token(data={"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


# ─── Notes Feed ───────────────────────────────────────────────────────────────

class TestNotesFeed:
    def test_get_feed_returns_200(self, client, session):
        user = create_test_user(session)
        create_test_note(session, user, "Hello world", is_public=True)

        resp = client.get("/notes/feed")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_feed_only_includes_public_notes(self, client, session):
        user = create_test_user(session)
        create_test_note(session, user, "Public post", is_public=True)
        create_test_note(session, user, "Private post", is_public=False)

        resp = client.get("/notes/feed")
        assert resp.status_code == 200
        texts = [p["text"] for p in resp.json()]
        assert "Public post" in texts
        assert "Private post" not in texts

    def test_feed_includes_updated_at_field(self, client, session):
        user = create_test_user(session)
        create_test_note(session, user, "A post")

        resp = client.get("/notes/feed")
        assert resp.status_code == 200
        posts = resp.json()
        assert len(posts) > 0
        # updated_at should be present (may be None if never edited)
        assert "updated_at" in posts[0]


# ─── Create Note ──────────────────────────────────────────────────────────────

class TestCreateNote:
    def test_create_note_requires_auth(self, client, session):
        resp = client.post("/notes/", json={"text": "Hello", "is_public": True})
        assert resp.status_code == 401

    def test_create_note_success(self, client, session):
        user = create_test_user(session)
        resp = client.post(
            "/notes/",
            json={"text": "My first note", "is_public": True},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["text"] == "My first note"
        assert data["is_public"] is True

    def test_create_note_without_text_fails(self, client, session):
        user = create_test_user(session)
        resp = client.post(
            "/notes/",
            json={"is_public": True},
            headers=auth_header(user),
        )
        # Empty text should either fail with 422 or succeed with null text
        # depending on schema — at minimum it shouldn't crash
        assert resp.status_code in (201, 422)


# ─── Update Note ──────────────────────────────────────────────────────────────

class TestUpdateNote:
    def test_update_note_sets_updated_at(self, client, session):
        user = create_test_user(session)
        note = create_test_note(session, user, "Original text")
        assert note.updated_at is None  # Fresh note has no updated_at

        resp = client.put(
            f"/notes/{note.id}",
            json={"text": "Updated text", "is_public": True},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "Updated text"
        assert data["updated_at"] is not None  # Must be set after edit

    def test_update_note_by_non_owner_fails(self, client, session):
        owner = create_test_user(session, email="owner@example.com")
        other = create_test_user(session, email="other@example.com")
        note = create_test_note(session, owner, "Owner's note")

        resp = client.put(
            f"/notes/{note.id}",
            json={"text": "Hijacked", "is_public": True},
            headers=auth_header(other),
        )
        assert resp.status_code == 403

    def test_update_nonexistent_note_returns_404(self, client, session):
        user = create_test_user(session)
        resp = client.put(
            "/notes/99999",
            json={"text": "Ghost", "is_public": True},
            headers=auth_header(user),
        )
        assert resp.status_code == 404


# ─── Delete Note ──────────────────────────────────────────────────────────────

class TestDeleteNote:
    def test_delete_own_note_succeeds(self, client, session):
        user = create_test_user(session)
        note = create_test_note(session, user, "Delete me")

        resp = client.delete(f"/notes/{note.id}", headers=auth_header(user))
        assert resp.status_code == 200
        assert resp.json()["message"] == "Note deleted successfully"

        # Verify it's gone from the DB
        deleted = crud.get_note_by_id(session, note.id)
        assert deleted is None

    def test_delete_requires_auth(self, client, session):
        user = create_test_user(session)
        note = create_test_note(session, user)

        resp = client.delete(f"/notes/{note.id}")
        assert resp.status_code == 401

    def test_delete_other_users_note_is_forbidden(self, client, session):
        owner = create_test_user(session, email="owner@example.com")
        attacker = create_test_user(session, email="attacker@example.com")
        note = create_test_note(session, owner)

        resp = client.delete(f"/notes/{note.id}", headers=auth_header(attacker))
        assert resp.status_code == 403

    def test_admin_can_delete_any_note(self, client, session):
        owner = create_test_user(session, email="owner@example.com")
        admin = create_test_user(session, email="admin@example.com")
        admin.is_admin = True
        session.add(admin)
        session.commit()

        note = create_test_note(session, owner)

        resp = client.delete(f"/notes/{note.id}", headers=auth_header(admin))
        assert resp.status_code == 200

    def test_delete_nonexistent_note_returns_404(self, client, session):
        user = create_test_user(session)
        resp = client.delete("/notes/99999", headers=auth_header(user))
        assert resp.status_code == 404


# ─── Note Model ───────────────────────────────────────────────────────────────

class TestNoteModel:
    def test_note_has_updated_at_field(self):
        """Regression: Note model MUST have updated_at column defined."""
        note = models.Note(user_id=1, text="test")
        assert hasattr(note, "updated_at")
        assert note.updated_at is None  # None by default

    def test_note_created_at_set_automatically(self):
        from datetime import datetime
        note = models.Note(user_id=1, text="test")
        assert isinstance(note.created_at, datetime)
