"""Tests for /notes/* — feed, CRUD, likes, comments."""
import asyncio
import json as _json

import pytest
from sqlalchemy import event
from sqlmodel import select

from app import models
from app.main import app as _app
from tests.conftest import _make_user, _auth, engine


def _create_note(client, headers, text="Test note", is_public=True):
    return client.post("/notes/", json={"text": text, "is_public": is_public}, headers=headers)


def _priv_note(client, headers, text="F02 private"):
    r = client.post("/notes/", json={"text": text, "is_public": False}, headers=headers)
    assert r.status_code == 201
    return r.json()["id"]


def _backdate(db, note_id, minutes):
    """Force a deterministic created_at — two API calls can land in the same second."""
    from app import models
    from datetime import datetime, timedelta
    n = db.get(models.Note, note_id)
    n.created_at = datetime.utcnow() - timedelta(minutes=minutes)
    db.add(n); db.commit(); db.expire_all()


def _forward_date(db, note_id):
    """Push a note's created_at far into the future so it outranks every other note in the
    shared DB — including the F-08 query-count tests' own far-future seed notes — in the
    created_at-desc feeds this module's shape/dedup-key tests read from."""
    from app import models
    from datetime import datetime, timedelta
    n = db.get(models.Note, note_id)
    n.created_at = datetime.utcnow() + timedelta(days=3650)
    db.add(n); db.commit(); db.expire_all()


def _create_group(client, headers, name="R3 Circle"):
    return client.post("/groups/", json={"name": name, "is_private": False,
                                         "description": "R3"}, headers=headers)


def _note_posted_events(client, headers, gid):
    r = client.get(f"/groups/{gid}/activity", headers=headers)
    assert r.status_code == 200
    return [e for e in r.json() if e["event_type"] == "note_posted"]


# ── F-59 ordering helper — a raw ASGI call so we can see "response sent" vs
#    "background task ran" separately. TestClient waits for background tasks before
#    returning, so it cannot show ordering; a direct call can. ──────────────────────

def _asgi_order(method, path, headers, body, events):
    raw = _json.dumps(body).encode() if body is not None else b""
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
             "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"", "root_path": "",
             "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]
                        + [(b"content-type", b"application/json"), (b"host", b"testserver")],
             "client": ("testclient", 50000), "server": ("testserver", 80)}
    state = {"sent": False, "status": None}

    async def receive():
        if not state["sent"]:
            state["sent"] = True
            return {"type": "http.request", "body": raw, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(msg):
        if msg["type"] == "http.response.start":
            events.append("response.start")
            state["status"] = msg["status"]

    asyncio.run(_app(scope, receive, send))
    return state["status"]


# ── F-08 query-count helpers ─────────────────────────────────────────────────────

@pytest.fixture()
def query_counter():
    counter = {"n": 0}

    def _count(conn, cursor, statement, parameters, context, executemany):
        counter["n"] += 1

    event.listen(engine, "before_cursor_execute", _count)
    yield counter
    event.remove(engine, "before_cursor_execute", _count)


def _queries_for(client, counter, url, headers):
    assert client.get(url, headers=headers).status_code == 200   # warm-up: absorbs the daily last_active write
    counter["n"] = 0
    r = client.get(url, headers=headers)
    assert r.status_code == 200
    return counter["n"], r.json()


def _seed_public_notes(db, n, tag, *, owner=None, userbook=None):
    """n public notes, created_at in the future so they lead the shared feed.

    - owner=None, userbook=None: each note gets its own DISTINCT author with its own
      Book + UserBook — the N+1 worst case (used by /feed and /friends-feed).
    - owner given, userbook=None: same author, a fresh Book + UserBook per note
      (used by /me and /user/{id}).
    - owner and userbook both given: every note shares the one userbook (/userbook/{id}).
    Commits, then expires the session so the caller's next read is fresh.
    """
    from datetime import datetime, timedelta
    future = datetime.utcnow() + timedelta(days=365)
    created = []
    for i in range(n):
        user = owner if owner is not None else _make_user(
            db, email=f"{tag}_author_{i}@example.com", name=f"{tag} Author {i}"
        )
        if userbook is not None:
            ub = userbook
        else:
            book = models.Book(title=f"{tag} book {i}", author="QA")
            db.add(book)
            db.commit()
            db.refresh(book)
            ub = models.UserBook(user_id=user.id, book_id=book.id, status="reading")
            db.add(ub)
            db.commit()
            db.refresh(ub)
        note = models.Note(
            user_id=user.id, userbook_id=ub.id, text=f"{tag} note {i}",
            is_public=True, created_at=future - timedelta(seconds=i),
        )
        db.add(note)
        created.append(note)
    db.commit()
    db.expire_all()
    return created


class TestNotesCRUD:
    def test_create_note(self, client, alice_headers):
        r = _create_note(client, alice_headers)
        assert r.status_code in (200, 201)
        assert r.json()["text"] == "Test note"

    def test_create_note_with_emotion_and_quote(self, client, alice_headers):
        r = client.post("/notes/", json={
            "text": "Loved it",
            "quote": "It was the best of times",
            "emotion": "Moved 🥹",
            "is_public": True,
        }, headers=alice_headers)
        assert r.status_code in (200, 201)
        data = r.json()
        assert data["emotion"] == "Moved 🥹"
        assert data["quote"] == "It was the best of times"

    def test_edit_own_note(self, client, alice_headers):
        note_id = _create_note(client, alice_headers).json()["id"]
        r = client.put(f"/notes/{note_id}", json={"text": "Updated text", "is_public": True}, headers=alice_headers)
        assert r.status_code == 200
        assert r.json()["text"] == "Updated text"

    def test_edit_sets_updated_at(self, client, alice_headers):
        note_id = _create_note(client, alice_headers).json()["id"]
        r = client.put(f"/notes/{note_id}", json={"text": "Changed", "is_public": True}, headers=alice_headers)
        assert r.json().get("updated_at") is not None

    def test_cannot_edit_other_users_note(self, client, db):
        alice = _make_user(db, email="edit_alice@example.com")
        bob = _make_user(db, email="edit_bob@example.com")
        note_id = _create_note(client, _auth(alice)).json()["id"]
        r = client.put(f"/notes/{note_id}", json={"text": "Hack", "is_public": True}, headers=_auth(bob))
        assert r.status_code in (403, 404)

    def test_delete_own_note(self, client, db):
        user = _make_user(db, email="del_note@example.com")
        h = _auth(user)
        note_id = _create_note(client, h).json()["id"]
        r = client.delete(f"/notes/{note_id}", headers=h)
        assert r.status_code == 200

    def test_cannot_delete_other_users_note(self, client, db):
        alice = _make_user(db, email="deln_alice@example.com")
        bob = _make_user(db, email="deln_bob@example.com")
        note_id = _create_note(client, _auth(alice)).json()["id"]
        r = client.delete(f"/notes/{note_id}", headers=_auth(bob))
        assert r.status_code in (403, 404)

    def test_requires_auth(self, client):
        r = client.post("/notes/", json={"text": "x", "is_public": True})
        assert r.status_code == 401

    # ── F-17 — notes private by default ──────────────────────────────────────

    def test_create_without_is_public_is_private(self, client, db):
        author = _make_user(db, email="f17_default_author@example.com")
        r = client.post("/notes/", json={"text": "F17 default"}, headers=_auth(author))
        assert r.status_code == 201
        assert r.json()["is_public"] is False
        rows = client.get("/notes/me", headers=_auth(author)).json()
        row = next(n for n in rows if n["text"] == "F17 default")
        assert row["is_public"] is False

    def test_explicit_public_still_in_feed(self, client, db):
        author = _make_user(db, email="f17_explicit_author@example.com")
        viewer = _make_user(db, email="f17_explicit_viewer@example.com")
        r = client.post("/notes/", json={"text": "F17 public", "is_public": True}, headers=_auth(author))
        assert r.status_code == 201
        assert r.json()["is_public"] is True
        note_id = r.json()["id"]
        feed = client.get("/notes/feed?limit=200", headers=_auth(viewer)).json()
        assert any(n["id"] == note_id for n in feed)

    def test_update_without_is_public_keeps_private(self, client, db):
        author = _make_user(db, email="f17_keepspriv_author@example.com")
        h = _auth(author)
        note_id = client.post("/notes/", json={"text": "F17 keep priv", "is_public": False}, headers=h).json()["id"]
        r = client.put(f"/notes/{note_id}", json={"text": "edited"}, headers=h)
        assert r.status_code == 200
        assert r.json()["is_public"] is False
        assert r.json()["text"] == "edited"
        feed = client.get("/notes/feed?limit=200", headers=h).json()
        assert not any(n["id"] == note_id for n in feed)

    def test_update_without_is_public_keeps_public(self, client, db):
        author = _make_user(db, email="f17_keepspub_author@example.com")
        h = _auth(author)
        note_id = client.post("/notes/", json={"text": "F17 keep pub", "is_public": True}, headers=h).json()["id"]
        r = client.put(f"/notes/{note_id}", json={"text": "edited", "quote": "q"}, headers=h)
        assert r.status_code == 200
        assert r.json()["is_public"] is True
        feed = client.get("/notes/feed?limit=200", headers=h).json()
        assert any(n["id"] == note_id for n in feed)

    def test_default_private_note_absent_from_all_feeds_and_group_activity(self, client, db):
        author = _make_user(db, email="f17_neverpub_author@example.com")
        viewer = _make_user(db, email="f17_neverpub_viewer@example.com")
        client.post(f"/follow/{author.id}", headers=_auth(viewer))
        gid = _create_group(client, _auth(author), name="F17 Circle").json()["id"]
        note_id = client.post("/notes/", json={"text": "F17 never public"}, headers=_auth(author)).json()["id"]

        feed = client.get("/notes/feed?limit=200", headers=_auth(viewer)).json()
        ff = client.get("/notes/friends-feed?limit=200", headers=_auth(viewer)).json()
        user_notes = client.get(f"/notes/user/{author.id}", headers=_auth(viewer)).json()
        assert not any(n["id"] == note_id for n in feed)
        assert not any(n["id"] == note_id for n in ff)
        assert not any(n["id"] == note_id for n in user_notes)
        assert _note_posted_events(client, _auth(author), gid) == []


class TestFeed:
    def test_community_feed_returns_public_notes(self, client, db):
        user = _make_user(db, email="feed_pub@example.com")
        _create_note(client, _auth(user), text="Public post", is_public=True)
        r = client.get("/notes/feed", headers=_auth(user))
        assert r.status_code == 200
        assert any(n["text"] == "Public post" for n in r.json())

    def test_private_notes_excluded_from_community_feed(self, client, db):
        user = _make_user(db, email="feed_priv@example.com")
        _create_note(client, _auth(user), text="Secret note", is_public=False)
        r = client.get("/notes/feed", headers=_auth(user))
        assert not any(n.get("text") == "Secret note" for n in r.json())

    def test_friends_feed_only_shows_followed_users(self, client, db):
        alice = _make_user(db, email="ff_alice@example.com")
        bob = _make_user(db, email="ff_bob@example.com")
        carol = _make_user(db, email="ff_carol@example.com")
        _create_note(client, _auth(bob), text="Bob's note", is_public=True)
        _create_note(client, _auth(carol), text="Carol's note", is_public=True)
        # Alice follows Bob but not Carol
        client.post(f"/follow/{bob.id}", headers=_auth(alice))
        r = client.get("/notes/friends-feed", headers=_auth(alice))
        texts = [n.get("text") for n in r.json()]
        assert "Bob's note" in texts
        assert "Carol's note" not in texts

    def test_community_feed_note_card_shape_unchanged(self, client, db):
        user = _make_user(db, email="feed_shape@example.com")
        _create_note(client, _auth(user), text="Shape check", is_public=True)
        r = client.get("/notes/feed", headers=_auth(user))
        assert r.status_code == 200
        rows = [n for n in r.json() if n["text"] == "Shape check"]
        assert rows
        n = rows[0]
        for key in ("id", "user_id", "text", "emotion", "page_number", "chapter",
                    "image_url", "quote", "is_public", "created_at", "likes_count",
                    "comments_count", "liked_by_me", "user_has_liked", "user", "book"):
            assert key in n, f"Missing key: {key}"
        assert n["created_at"].endswith("Z")
        assert n["liked_by_me"] == n["user_has_liked"]

    def test_user_notes_private_profile_still_403(self, client, db):
        a = _make_user(db, email="unp_a@example.com")
        b = _make_user(db, email="unp_b@example.com")
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(b))
        _create_note(client, _auth(b), text="B public note", is_public=True)
        r = client.get(f"/notes/user/{b.id}", headers=_auth(a))
        assert r.status_code == 403
        assert r.json()["detail"] == "This profile is private"
        client.post(f"/follow/{b.id}", headers=_auth(a))
        r2 = client.get(f"/notes/user/{b.id}", headers=_auth(a))
        assert r2.status_code == 200
        assert any(n["text"] == "B public note" for n in r2.json())


class TestLikesComments:
    def test_like_note(self, client, db):
        owner = _make_user(db, email="like_owner@example.com")
        liker = _make_user(db, email="like_liker@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        r = client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        assert r.status_code in (200, 201)

    def test_unlike_note(self, client, db):
        owner = _make_user(db, email="unlike_owner@example.com")
        liker = _make_user(db, email="unlike_liker@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        r = client.delete(f"/notes/{note_id}/like", headers=_auth(liker))
        assert r.status_code == 200

    def test_double_like_does_not_error(self, client, db):
        owner = _make_user(db, email="dlike_owner@example.com")
        liker = _make_user(db, email="dlike_liker@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        r = client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        assert r.status_code in (200, 201, 400)  # idempotent or error, not 500

    def test_add_comment(self, client, db):
        owner = _make_user(db, email="comment_owner@example.com")
        commenter = _make_user(db, email="commenter@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        r = client.post(f"/notes/{note_id}/comments", json={"text": "Great post!"}, headers=_auth(commenter))
        assert r.status_code in (200, 201)

    def test_get_comments(self, client, db):
        owner = _make_user(db, email="getcomment_owner@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        client.post(f"/notes/{note_id}/comments", json={"text": "First!"}, headers=_auth(owner))
        r = client.get(f"/notes/{note_id}/comments", headers=_auth(owner))
        assert r.status_code == 200
        assert any(c["text"] == "First!" for c in r.json())

    def test_empty_comment_rejected(self, client, db):
        """Empty or whitespace-only comments should be rejected."""
        owner = _make_user(db, email="empty_comment@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        r = client.post(f"/notes/{note_id}/comments", json={"text": ""}, headers=_auth(owner))
        assert r.status_code == 400
        r2 = client.post(f"/notes/{note_id}/comments", json={"text": "   "}, headers=_auth(owner))
        assert r2.status_code == 400

    def test_like_nonexistent_note(self, client, alice_headers):
        r = client.post("/notes/999999/like", headers=alice_headers)
        assert r.status_code == 404

    def test_like_still_writes_notification_log(self, client, db):
        from sqlmodel import select
        from app import models
        owner = _make_user(db, email="likelog_owner@example.com")
        liker = _make_user(db, email="likelog_liker@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]
        client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        db.expire_all()
        rows = db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.event_type == "post_liked")
        ).all()
        assert any(r.actor_id == liker.id for r in rows)

        # Self-like writes no row
        self_note_id = _create_note(client, _auth(owner)).json()["id"]
        before = len(db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.event_type == "post_liked")
        ).all())
        client.post(f"/notes/{self_note_id}/like", headers=_auth(owner))
        db.expire_all()
        after = len(db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.event_type == "post_liked")
        ).all())
        assert after == before

    # ── F-02 — visibility on likes and comments ──────────────────────────────

    def test_like_private_note_404(self, client, db):
        owner = _make_user(db, email="f02_like_owner@example.com")
        stranger = _make_user(db, email="f02_like_stranger@example.com")
        priv = _priv_note(client, _auth(owner))
        r = client.post(f"/notes/{priv}/like", headers=_auth(stranger))
        assert r.status_code == 404
        assert r.json() == {"detail": "Note not found"}
        db.expire_all()
        assert db.exec(select(models.Like).where(models.Like.note_id == priv)).all() == []
        assert db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.event_type == "post_liked")
            .where(models.NotificationLog.actor_id == stranger.id)
        ).all() == []

    def test_comment_private_note_404(self, client, db):
        owner = _make_user(db, email="f02_comment_owner@example.com")
        stranger = _make_user(db, email="f02_comment_stranger@example.com")
        priv = _priv_note(client, _auth(owner))
        r = client.post(f"/notes/{priv}/comments", json={"text": "F02 sneaky"}, headers=_auth(stranger))
        assert r.status_code == 404
        assert r.json() == {"detail": "Note not found"}
        db.expire_all()
        assert db.exec(select(models.Comment).where(models.Comment.note_id == priv)).all() == []

    def test_get_comments_private_note_404(self, client, db):
        owner = _make_user(db, email="f02_getc_owner@example.com")
        stranger = _make_user(db, email="f02_getc_stranger@example.com")
        priv = _priv_note(client, _auth(owner))
        r_own = client.post(f"/notes/{priv}/comments", json={"text": "owner only"}, headers=_auth(owner))
        assert r_own.status_code == 201
        r = client.get(f"/notes/{priv}/comments", headers=_auth(stranger))
        assert r.status_code == 404
        assert "owner only" not in r.text

    def test_follower_cannot_like_or_comment_private_note_404(self, client, db):
        owner = _make_user(db, email="f02_follower_owner@example.com")
        stranger = _make_user(db, email="f02_follower_stranger@example.com")
        priv = _priv_note(client, _auth(owner))
        client.post(f"/follow/{owner.id}", headers=_auth(stranger))
        assert client.post(f"/notes/{priv}/like", headers=_auth(stranger)).status_code == 404
        assert client.post(f"/notes/{priv}/comments", json={"text": "x"}, headers=_auth(stranger)).status_code == 404
        assert client.get(f"/notes/{priv}/comments", headers=_auth(stranger)).status_code == 404

    def test_comment_private_profile_non_follower_403(self, client, db):
        owner = _make_user(db, email="f02_privprof_owner@example.com")
        stranger = _make_user(db, email="f02_privprof_stranger@example.com")
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(owner))
        pub = client.post("/notes/", json={"text": "F02 pub", "is_public": True}, headers=_auth(owner)).json()["id"]

        r1 = client.post(f"/notes/{pub}/like", headers=_auth(stranger))
        r2 = client.post(f"/notes/{pub}/comments", json={"text": "x"}, headers=_auth(stranger))
        r3 = client.get(f"/notes/{pub}/comments", headers=_auth(stranger))
        assert r1.status_code == 403
        assert r1.json() == {"detail": "This profile is private"}
        assert r2.status_code == 403
        assert r3.status_code == 403

        db.expire_all()
        assert db.exec(select(models.Like).where(models.Like.note_id == pub)).all() == []
        assert db.exec(select(models.Comment).where(models.Comment.note_id == pub)).all() == []

    def test_refused_comment_writes_no_notificationlog(self, client, db):
        owner = _make_user(db, email="f02_refc_owner@example.com")
        stranger = _make_user(db, email="f02_refc_stranger@example.com")
        priv = _priv_note(client, _auth(owner))
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(owner))
        pub = client.post("/notes/", json={"text": "F02 refc pub", "is_public": True}, headers=_auth(owner)).json()["id"]

        def _count():
            db.expire_all()
            return len(db.exec(select(models.NotificationLog).where(models.NotificationLog.user_id == owner.id)).all())

        n0 = _count()
        client.post(f"/notes/{priv}/comments", json={"text": "F02 sneaky"}, headers=_auth(stranger))
        client.post(f"/notes/{pub}/comments", json={"text": "F02 sneaky2"}, headers=_auth(stranger))
        assert _count() == n0

    def test_refused_like_writes_no_notificationlog(self, client, db):
        owner = _make_user(db, email="f02_refl_owner@example.com")
        stranger = _make_user(db, email="f02_refl_stranger@example.com")
        priv = _priv_note(client, _auth(owner))
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(owner))
        pub = client.post("/notes/", json={"text": "F02 refl pub", "is_public": True}, headers=_auth(owner)).json()["id"]

        def _count():
            db.expire_all()
            return len(db.exec(select(models.NotificationLog).where(models.NotificationLog.user_id == owner.id)).all())

        n0 = _count()
        client.post(f"/notes/{priv}/like", headers=_auth(stranger))
        client.post(f"/notes/{pub}/like", headers=_auth(stranger))
        assert _count() == n0

    def test_follower_can_like_and_comment_private_profile_public_note(self, client, db):
        owner = _make_user(db, email="f02_follow_ok_owner@example.com")
        follower = _make_user(db, email="f02_follow_ok_follower@example.com")
        client.post(f"/follow/{owner.id}", headers=_auth(follower))
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(owner))
        pub = client.post("/notes/", json={"text": "F02 follower pub", "is_public": True}, headers=_auth(owner)).json()["id"]

        r1 = client.post(f"/notes/{pub}/like", headers=_auth(follower))
        assert r1.status_code == 201
        assert r1.json() == {"message": "Liked", "liked": True}

        r2 = client.post(f"/notes/{pub}/comments", json={"text": "F02 follower"}, headers=_auth(follower))
        assert r2.status_code == 201
        assert set(r2.json().keys()) == {"created_at", "id", "text", "user"}

        r3 = client.get(f"/notes/{pub}/comments", headers=_auth(follower))
        assert r3.status_code == 200
        assert any(c["text"] == "F02 follower" for c in r3.json())

        db.expire_all()
        liked_rows = db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.event_type == "post_liked")
            .where(models.NotificationLog.actor_id == follower.id)
        ).all()
        commented_rows = db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.event_type == "post_commented")
            .where(models.NotificationLog.actor_id == follower.id)
        ).all()
        assert len(liked_rows) == 1
        assert len(commented_rows) == 1

    def test_owner_can_like_and_comment_own_private_note(self, client, db):
        owner = _make_user(db, email="f02_owner_self@example.com")
        priv = _priv_note(client, _auth(owner))
        r1 = client.post(f"/notes/{priv}/like", headers=_auth(owner))
        assert r1.status_code == 201
        r2 = client.post(f"/notes/{priv}/comments", json={"text": "note to self"}, headers=_auth(owner))
        assert r2.status_code == 201
        r3 = client.get(f"/notes/{priv}/comments", headers=_auth(owner))
        assert r3.status_code == 200
        assert len(r3.json()) == 1

        db.expire_all()
        rows = db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.actor_id == owner.id)
        ).all()
        assert rows == []

    # ── F-51 — bounded list parameters ────────────────────────────────────────

    def test_feed_limit_bounds_422(self, client, alice_headers):
        for bad in (0, -1, 201):
            r = client.get(f"/notes/feed?limit={bad}", headers=alice_headers)
            assert r.status_code == 422
            assert r.json()["detail"][0]["loc"] == ["query", "limit"]
        assert client.get("/notes/feed?limit=200", headers=alice_headers).status_code == 200
        r_ok = client.get("/notes/feed?limit=1", headers=alice_headers)
        assert r_ok.status_code == 200
        assert len(r_ok.json()) <= 1

    def test_my_notes_limit_bounds_422(self, client, alice_headers):
        for bad in (0, -1, 201):
            r = client.get(f"/notes/me?limit={bad}", headers=alice_headers)
            assert r.status_code == 422
            assert r.json()["detail"][0]["loc"] == ["query", "limit"]
        assert client.get("/notes/me?limit=200", headers=alice_headers).status_code == 200
        r_ok = client.get("/notes/me?limit=1", headers=alice_headers)
        assert r_ok.status_code == 200
        assert len(r_ok.json()) <= 1

    def test_friends_feed_limit_bounds_422(self, client, alice_headers):
        for bad in (0, -1, 201):
            r = client.get(f"/notes/friends-feed?limit={bad}", headers=alice_headers)
            assert r.status_code == 422
            assert r.json()["detail"][0]["loc"] == ["query", "limit"]
        assert client.get("/notes/friends-feed?limit=200", headers=alice_headers).status_code == 200


class TestFriendsFeedOrder:
    """R1 — mutual follows sort first in /notes/friends-feed."""

    def test_friends_feed_puts_mutual_follows_first(self, client, db):
        viewer = _make_user(db, email="ff1_viewer@example.com")
        mutual = _make_user(db, email="ff1_mutual@example.com")
        nonmutual = _make_user(db, email="ff1_nonmutual@example.com")
        client.post(f"/follow/{mutual.id}", headers=_auth(viewer))
        client.post(f"/follow/{nonmutual.id}", headers=_auth(viewer))
        client.post(f"/follow/{viewer.id}", headers=_auth(mutual))

        m_id = _create_note(client, _auth(mutual), text="T01 mutual older").json()["id"]
        nm_id = _create_note(client, _auth(nonmutual), text="T01 nonmutual newer").json()["id"]
        _backdate(db, m_id, minutes=30)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        assert r.status_code == 200
        rows = r.json()
        ids = [n["id"] for n in rows]
        assert ids.index(m_id) < ids.index(nm_id)
        mutual_row = next(n for n in rows if n["id"] == m_id)
        nonmutual_row = next(n for n in rows if n["id"] == nm_id)
        assert mutual_row["user"]["is_mutual"] is True
        assert nonmutual_row["user"]["is_mutual"] is False

    def test_friends_feed_newest_first_within_mutual_group(self, client, db):
        viewer = _make_user(db, email="ff2_viewer@example.com")
        mutual_a = _make_user(db, email="ff2_mutual_a@example.com")
        mutual_b = _make_user(db, email="ff2_mutual_b@example.com")
        nonmutual = _make_user(db, email="ff2_nonmutual@example.com")
        for u in (mutual_a, mutual_b, nonmutual):
            client.post(f"/follow/{u.id}", headers=_auth(viewer))
        client.post(f"/follow/{viewer.id}", headers=_auth(mutual_a))
        client.post(f"/follow/{viewer.id}", headers=_auth(mutual_b))

        a_id = _create_note(client, _auth(mutual_a), text="ff2 a").json()["id"]
        b_id = _create_note(client, _auth(mutual_b), text="ff2 b").json()["id"]
        nm_id = _create_note(client, _auth(nonmutual), text="ff2 nm").json()["id"]
        _backdate(db, a_id, minutes=60)
        _backdate(db, b_id, minutes=10)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        ids = [n["id"] for n in r.json()]
        assert ids == [b_id, a_id, nm_id]

    def test_friends_feed_newest_first_when_all_non_mutual(self, client, db):
        viewer = _make_user(db, email="ff3_viewer@example.com")
        nm_a = _make_user(db, email="ff3_nm_a@example.com")
        nm_b = _make_user(db, email="ff3_nm_b@example.com")
        client.post(f"/follow/{nm_a.id}", headers=_auth(viewer))
        client.post(f"/follow/{nm_b.id}", headers=_auth(viewer))

        a_id = _create_note(client, _auth(nm_a), text="ff3 a").json()["id"]
        b_id = _create_note(client, _auth(nm_b), text="ff3 b").json()["id"]
        _backdate(db, a_id, minutes=45)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        rows = r.json()
        ids = [n["id"] for n in rows]
        assert ids.index(b_id) < ids.index(a_id)
        assert all(n["user"]["is_mutual"] is False for n in rows if n["id"] in (a_id, b_id))

    def test_friends_feed_empty_when_no_follows(self, client, db):
        user = _make_user(db, email="ff4_lonely@example.com")
        r = client.get("/notes/friends-feed", headers=_auth(user))
        assert r.status_code == 200
        assert r.json() == []

    def test_friends_feed_excludes_private_notes(self, client, db):
        viewer = _make_user(db, email="ff5_viewer@example.com")
        author = _make_user(db, email="ff5_author@example.com")
        client.post(f"/follow/{author.id}", headers=_auth(viewer))
        _create_note(client, _auth(author), text="T05 secret", is_public=False)
        _create_note(client, _auth(author), text="T05 public", is_public=True)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        rows = r.json()
        assert any(n["text"] == "T05 public" for n in rows)
        assert not any(n.get("text") == "T05 secret" for n in rows)
        assert not any(n.get("is_public") is False for n in rows)

    def test_friends_feed_includes_private_profile_author_you_follow(self, client, db):
        author = _make_user(db, email="ff6_author@example.com")
        viewer = _make_user(db, email="ff6_viewer@example.com")
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(author))
        client.post(f"/follow/{author.id}", headers=_auth(viewer))
        _create_note(client, _auth(author), text="ff6 public note", is_public=True)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        assert r.status_code == 200
        assert any(n["text"] == "ff6 public note" for n in r.json())

    def test_friends_feed_excludes_unfollowed_users(self, client, db):
        viewer = _make_user(db, email="ff7_viewer@example.com")
        followed = _make_user(db, email="ff7_followed@example.com")
        stranger = _make_user(db, email="ff7_stranger@example.com")
        client.post(f"/follow/{followed.id}", headers=_auth(viewer))
        _create_note(client, _auth(stranger), text="ff7 stranger note", is_public=True)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        assert not any(n["user_id"] == stranger.id for n in r.json())

    def test_friends_feed_requires_auth(self, client):
        r = client.get("/notes/friends-feed")
        assert r.status_code == 401

    def test_friends_feed_note_card_shape_unchanged(self, client, db):
        viewer = _make_user(db, email="ff8_viewer@example.com")
        author = _make_user(db, email="ff8_author@example.com")
        client.post(f"/follow/{author.id}", headers=_auth(viewer))
        client.post(f"/follow/{viewer.id}", headers=_auth(author))
        _create_note(client, _auth(author), text="ff8 note", is_public=True)

        r = client.get("/notes/friends-feed", headers=_auth(viewer))
        rows = r.json()
        row = next(n for n in rows if n["text"] == "ff8 note")
        for key in ("id", "user_id", "text", "emotion", "page_number", "chapter",
                    "image_url", "quote", "is_public", "created_at", "likes_count",
                    "comments_count", "liked_by_me", "user_has_liked", "user", "book"):
            assert key in row
        assert "is_mutual" in row["user"]
        assert isinstance(row["user"]["is_mutual"], bool)


class TestMyNotesLikeState:
    """R2 — /notes/me reports real liked_by_me / user_has_liked."""

    def test_my_notes_liked_by_me_reflects_real_likes(self, client, db):
        owner = _make_user(db, email="me_like@example.com")
        h = _auth(owner)
        liked_id = _create_note(client, h, text="liked one").json()["id"]
        unliked_id = _create_note(client, h, text="unliked one").json()["id"]
        r = client.post(f"/notes/{liked_id}/like", headers=h)
        assert r.status_code in (200, 201)

        rows = client.get("/notes/me", headers=h).json()
        liked_row = next(n for n in rows if n["id"] == liked_id)
        unliked_row = next(n for n in rows if n["id"] == unliked_id)
        assert liked_row["liked_by_me"] is True
        assert liked_row["user_has_liked"] is True
        assert unliked_row["liked_by_me"] is False
        assert unliked_row["user_has_liked"] is False

    def test_my_notes_sets_both_like_keys_consistently(self, client, db):
        owner = _make_user(db, email="me_like_consistent@example.com")
        h = _auth(owner)
        _create_note(client, h, text="consistent 1")
        note2 = _create_note(client, h, text="consistent 2").json()["id"]
        client.post(f"/notes/{note2}/like", headers=h)

        rows = client.get("/notes/me", headers=h).json()
        assert rows
        for n in rows:
            assert "user_has_liked" in n
            assert n["liked_by_me"] == n["user_has_liked"]

    def test_my_notes_other_users_like_does_not_set_liked_by_me(self, client, db):
        owner = _make_user(db, email="me_like_owner2@example.com")
        liker = _make_user(db, email="me_like_other@example.com")
        note_id = _create_note(client, _auth(owner), text="other liked").json()["id"]
        client.post(f"/notes/{note_id}/like", headers=_auth(liker))

        rows = client.get("/notes/me", headers=_auth(owner)).json()
        row = next(n for n in rows if n["id"] == note_id)
        assert row["liked_by_me"] is False
        assert row["user_has_liked"] is False
        assert row["likes_count"] == 1

    def test_my_notes_likes_count_counts_all_likers(self, client, db):
        owner = _make_user(db, email="me_like_owner3@example.com")
        liker = _make_user(db, email="me_like_other3@example.com")
        note_id = _create_note(client, _auth(owner), text="counted").json()["id"]
        client.post(f"/notes/{note_id}/like", headers=_auth(liker))
        client.post(f"/notes/{note_id}/like", headers=_auth(owner))

        rows = client.get("/notes/me", headers=_auth(owner)).json()
        row = next(n for n in rows if n["id"] == note_id)
        assert row["likes_count"] == 2
        assert row["liked_by_me"] is True

    def test_my_notes_liked_by_me_false_after_unlike(self, client, db):
        owner = _make_user(db, email="me_like_unlike@example.com")
        h = _auth(owner)
        note_id = _create_note(client, h, text="unlike me").json()["id"]
        client.post(f"/notes/{note_id}/like", headers=h)
        before_count = client.get("/notes/me", headers=h).json()
        before_row = next(n for n in before_count if n["id"] == note_id)

        client.delete(f"/notes/{note_id}/like", headers=h)
        rows = client.get("/notes/me", headers=h).json()
        row = next(n for n in rows if n["id"] == note_id)
        assert row["liked_by_me"] is False
        assert row["user_has_liked"] is False
        assert row["likes_count"] == before_row["likes_count"] - 1

    def test_my_notes_note_card_shape_unchanged(self, client, db):
        owner = _make_user(db, email="me_shape@example.com")
        _create_note(client, _auth(owner), text="shape note")
        rows = client.get("/notes/me", headers=_auth(owner)).json()
        row = next(n for n in rows if n["text"] == "shape note")
        for key in ("id", "user_id", "text", "emotion", "page_number", "chapter",
                    "image_url", "quote", "is_public", "created_at", "updated_at",
                    "likes_count", "comments_count", "liked_by_me", "user_has_liked",
                    "user", "book"):
            assert key in row, f"Missing key: {key}"
        assert row["created_at"].endswith("Z")
        assert set(row["user"].keys()) >= {"id", "name", "username", "profile_picture"}


class TestPrivateNotesAndGroupActivity:
    """R3 — a private note never appears in GET /groups/{id}/activity."""

    def test_private_note_does_not_appear_in_group_activity(self, client, db):
        author = _make_user(db, email="r3_priv@example.com")
        h = _auth(author)
        gid = _create_group(client, h, name="R3 Private Circle").json()["id"]
        before = _note_posted_events(client, h, gid)
        assert before == []
        note = client.post("/notes/", json={"text": "R3 private body", "is_public": False}, headers=h)
        note_id = note.json()["id"]
        after = _note_posted_events(client, h, gid)
        assert after == []
        r = client.get(f"/groups/{gid}/activity", headers=h)
        assert str(note_id) not in [str(e.get("payload", {}).get("note_id")) for e in r.json()]

    def test_public_note_still_appears_in_group_activity(self, client, db):
        author = _make_user(db, email="r3_pub@example.com")
        h = _auth(author)
        gid = _create_group(client, h, name="R3 Public Circle").json()["id"]
        note_id = client.post("/notes/", json={"text": "R3 public body", "is_public": True}, headers=h).json()["id"]
        events = _note_posted_events(client, h, gid)
        assert len(events) == 1
        assert events[0]["payload"]["note_id"] == note_id
        assert events[0]["user"]["id"] == author.id

    def test_updating_note_to_public_fires_no_group_activity(self, client, db):
        author = _make_user(db, email="r3_flipup@example.com")
        h = _auth(author)
        gid = _create_group(client, h, name="R3 Flip Up Circle").json()["id"]
        note_id = client.post("/notes/", json={"text": "R3 flip up", "is_public": False}, headers=h).json()["id"]
        count_before = len(_note_posted_events(client, h, gid))
        assert count_before == 0
        r = client.put(f"/notes/{note_id}", json={"text": "R3 flip up", "is_public": True}, headers=h)
        assert r.status_code == 200
        count_after = len(_note_posted_events(client, h, gid))
        assert count_after == 0

    def test_updating_note_to_private_fires_no_group_activity(self, client, db):
        author = _make_user(db, email="r3_flipdown@example.com")
        h = _auth(author)
        gid = _create_group(client, h, name="R3 Flip Down Circle").json()["id"]
        note_id = client.post("/notes/", json={"text": "R3 public first", "is_public": True}, headers=h).json()["id"]
        count_before = len(_note_posted_events(client, h, gid))
        assert count_before == 1
        client.put(f"/notes/{note_id}", json={"text": "now hidden", "is_public": False}, headers=h)
        count_after = len(_note_posted_events(client, h, gid))
        assert count_after == 1

    def test_private_note_still_visible_to_owner_in_my_notes(self, client, db):
        author = _make_user(db, email="r3_mine@example.com")
        h = _auth(author)
        note_id = client.post("/notes/", json={"text": "R3 mine only", "is_public": False}, headers=h).json()["id"]
        rows = client.get("/notes/me", headers=h).json()
        row = next((n for n in rows if n["id"] == note_id), None)
        assert row is not None
        assert row["text"] == "R3 mine only"
        assert row["is_public"] is False

    def test_private_note_still_visible_to_owner_via_userbook(self, client, db):
        author = _make_user(db, email="r3_ubook@example.com")
        other = _make_user(db, email="r3_ubook_other@example.com")
        h = _auth(author)
        add = client.post("/books/add-to-library", json={
            "title": "R3 Book", "total_pages": 100, "status": "reading"
        }, headers=h)
        ub_id = add.json()["id"]
        note_id = client.post("/notes/", json={
            "text": "R3 book-scoped private", "userbook_id": ub_id, "is_public": False
        }, headers=h).json()["id"]

        r = client.get(f"/notes/userbook/{ub_id}", headers=h)
        assert r.status_code == 200
        row = next((n for n in r.json() if n["id"] == note_id), None)
        assert row is not None
        assert row["is_public"] is False

        r2 = client.get(f"/notes/userbook/{ub_id}", headers=_auth(other))
        assert r2.status_code == 404

    def test_private_note_absent_from_every_public_list(self, client, db):
        author = _make_user(db, email="r3_neverpublic@example.com")
        viewer = _make_user(db, email="r3_neverpublic_viewer@example.com")
        client.post(f"/follow/{author.id}", headers=_auth(viewer))
        note_id = client.post("/notes/", json={
            "text": "R3 never public", "is_public": False
        }, headers=_auth(author)).json()["id"]

        for url in ("/notes/feed", "/notes/friends-feed", f"/notes/user/{author.id}"):
            r = client.get(url, headers=_auth(viewer))
            assert r.status_code == 200
            assert not any(n.get("id") == note_id or n.get("text") == "R3 never public" for n in r.json())

    def test_private_note_hidden_in_all_of_authors_groups(self, client, db):
        author = _make_user(db, email="r3_twogroups@example.com")
        h = _auth(author)
        g1 = _create_group(client, h, name="R3 Circle One").json()["id"]
        g2 = _create_group(client, h, name="R3 Circle Two").json()["id"]
        client.post("/notes/", json={"text": "R3 two circles", "is_public": False}, headers=h)
        assert _note_posted_events(client, h, g1) == []
        assert _note_posted_events(client, h, g2) == []

    def test_member_joined_activity_still_fires(self, client, db):
        x = _make_user(db, email="r3_member_x@example.com")
        y = _make_user(db, email="r3_member_y@example.com")
        gid = _create_group(client, _auth(x), name="R3 Join Circle").json()["id"]
        client.post(f"/groups/{gid}/join", headers=_auth(y))
        r = client.get(f"/groups/{gid}/activity", headers=_auth(x))
        assert r.status_code == 200
        assert any(e["event_type"] == "member_joined" for e in r.json())


class TestUploads:
    """F-55 — bad uploads return 400 instead of 500."""

    def _configure_cloudinary(self, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "test-cloud")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "test-key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "test-secret")

    def test_rejected_image_400(self, client, db, monkeypatch):
        import cloudinary.exceptions
        self._configure_cloudinary(monkeypatch)
        user = _make_user(db, email="f55_rejected@example.com")

        def _raise(*a, **k):
            raise cloudinary.exceptions.BadRequest("Invalid image file")

        monkeypatch.setattr("cloudinary.uploader.upload", _raise)
        r = client.post(
            "/notes/upload-image",
            files={"file": ("evil.png", b"plain text", "image/png")},
            headers=_auth(user),
        )
        assert r.status_code == 400
        assert r.json() == {"detail": "Invalid image file"}

    def test_empty_file_400(self, client, db, monkeypatch):
        calls = []
        self._configure_cloudinary(monkeypatch)
        user = _make_user(db, email="f55_empty@example.com")
        monkeypatch.setattr("cloudinary.uploader.upload", lambda *a, **k: calls.append(1))
        r = client.post(
            "/notes/upload-image",
            files={"file": ("empty.png", b"", "image/png")},
            headers=_auth(user),
        )
        assert r.status_code == 400
        assert r.json() == {"detail": "File is empty"}
        assert calls == []

    def test_upload_other_error_still_500(self, client, db, monkeypatch):
        self._configure_cloudinary(monkeypatch)
        user = _make_user(db, email="f55_other@example.com")

        def _raise(*a, **k):
            raise RuntimeError("network down")

        monkeypatch.setattr("cloudinary.uploader.upload", _raise)
        r = client.post(
            "/notes/upload-image",
            files={"file": ("x.png", b"some bytes", "image/png")},
            headers=_auth(user),
        )
        assert r.status_code == 500


class TestNoteQueryCount:
    """F-08 + F-07 note card — the query count stays constant as note count grows, and
    book objects on note cards carry google_books_id/isbn/total_pages."""

    def test_feed_query_count_constant(self, client, db, query_counter):
        viewer = _make_user(db, email="f08_feed_viewer@example.com")
        h = _auth(viewer)
        _seed_public_notes(db, 50, "f08feed")

        n_a, items_a = _queries_for(client, query_counter, "/notes/feed?limit=5", h)
        assert len(items_a) == 5
        n_b, items_b = _queries_for(client, query_counter, "/notes/feed?limit=50", h)
        assert len(items_b) >= 5

        assert n_a == n_b
        assert n_b <= 8

    def test_friends_feed_query_count_constant(self, client, db, query_counter):
        viewer = _make_user(db, email="f08_ff_viewer@example.com")
        h = _auth(viewer)
        first5 = _seed_public_notes(db, 5, "f08ff")
        for note in first5:
            client.post(f"/follow/{note.user_id}", headers=h)

        n_a, items_a = _queries_for(client, query_counter, "/notes/friends-feed?limit=50", h)
        assert len(items_a) == 5

        rest = _seed_public_notes(db, 45, "f08ff2")
        for note in rest:
            client.post(f"/follow/{note.user_id}", headers=h)

        n_b, items_b = _queries_for(client, query_counter, "/notes/friends-feed?limit=50", h)
        assert len(items_b) == 50

        assert n_a == n_b
        assert n_b <= 10

    def test_my_notes_query_count_constant(self, client, db, query_counter):
        owner = _make_user(db, email="f08_me_owner@example.com")
        h = _auth(owner)
        _seed_public_notes(db, 5, "f08me", owner=owner)

        n_a, items_a = _queries_for(client, query_counter, "/notes/me?limit=50", h)
        assert len(items_a) == 5

        _seed_public_notes(db, 45, "f08me2", owner=owner)
        n_b, items_b = _queries_for(client, query_counter, "/notes/me?limit=50", h)
        assert len(items_b) == 50

        assert n_a == n_b
        assert n_b <= 8

    def test_user_notes_query_count_constant(self, client, db, query_counter):
        author = _make_user(db, email="f08_user_author@example.com")
        viewer = _make_user(db, email="f08_user_viewer@example.com")
        h = _auth(viewer)
        _seed_public_notes(db, 5, "f08user", owner=author)

        n_a, items_a = _queries_for(client, query_counter, f"/notes/user/{author.id}", h)
        assert len(items_a) == 5

        _seed_public_notes(db, 45, "f08user2", owner=author)
        n_b, items_b = _queries_for(client, query_counter, f"/notes/user/{author.id}", h)
        assert len(items_b) == 20  # route cap

        assert n_a == n_b
        assert n_b <= 9

    def test_userbook_notes_query_count_constant(self, client, db, query_counter):
        owner = _make_user(db, email="f08_ub_owner@example.com")
        h = _auth(owner)
        book = models.Book(title="F08 UB Book", author="QA")
        db.add(book); db.commit(); db.refresh(book)
        ub = models.UserBook(user_id=owner.id, book_id=book.id, status="reading")
        db.add(ub); db.commit(); db.refresh(ub)

        _seed_public_notes(db, 5, "f08ub", owner=owner, userbook=ub)
        n_a, items_a = _queries_for(client, query_counter, f"/notes/userbook/{ub.id}", h)
        assert len(items_a) == 5

        _seed_public_notes(db, 45, "f08ub2", owner=owner, userbook=ub)
        n_b, items_b = _queries_for(client, query_counter, f"/notes/userbook/{ub.id}", h)
        assert len(items_b) == 50

        assert n_a == n_b
        assert n_b <= 6

    def test_note_card_book_has_dedup_keys(self, client, db):
        author = _make_user(db, email="f07_card_author@example.com")
        viewer = _make_user(db, email="f07_card_viewer@example.com")
        ha, hv = _auth(author), _auth(viewer)
        add = client.post("/books/add-to-library", json={
            "title": "F07 Card", "google_books_id": "f07-card-gid",
            "isbn": "f07-card-isbn", "total_pages": 321, "status": "reading",
        }, headers=ha)
        ub = add.json()["id"]
        note_id = client.post("/notes/", json={
            "text": "F07 card note", "userbook_id": ub, "is_public": True,
        }, headers=ha).json()["id"]
        client.post(f"/follow/{author.id}", headers=hv)
        _forward_date(db, note_id)  # outrank the shared DB's other notes, incl. the F-08 seeds above

        expected_book_keys = {"id", "title", "author", "cover_url", "google_books_id", "isbn", "total_pages"}
        for url, headers in (
            ("/notes/feed?limit=200", hv),
            ("/notes/friends-feed?limit=200", hv),
            ("/notes/me?limit=200", ha),
            (f"/notes/user/{author.id}", hv),
        ):
            rows = client.get(url, headers=headers).json()
            row = next(n for n in rows if n["id"] == note_id)
            assert set(row["book"].keys()) == expected_book_keys
            assert row["book"]["google_books_id"] == "f07-card-gid"
            assert row["book"]["isbn"] == "f07-card-isbn"
            assert row["book"]["total_pages"] == 321

        ub_rows = client.get(f"/notes/userbook/{ub}", headers=ha).json()
        ub_row = next(n for n in ub_rows if n["id"] == note_id)
        assert set(ub_row["book"].keys()) == {"id", "title", "author"}

    def test_note_list_outputs_unchanged_apart_from_book_keys(self, client, db):
        """`response_model=List[NoteOutSchema]` normalizes every response to the model's full
        field set (defaulting anything the handler dict omits), so the top-level key set is
        the same across all five endpoints regardless of what each handler builds. Only the
        nested `user` dict — a plain `dict` field, not schema-validated — varies per endpoint."""
        author = _make_user(db, email="f07_shape_author@example.com")
        viewer = _make_user(db, email="f07_shape_viewer@example.com")
        ha, hv = _auth(author), _auth(viewer)
        add = client.post("/books/add-to-library", json={
            "title": "F07 Shape", "total_pages": 200, "status": "reading",
        }, headers=ha)
        ub = add.json()["id"]
        note_id = client.post("/notes/", json={
            "text": "F07 shape note", "userbook_id": ub, "is_public": True,
        }, headers=ha).json()["id"]
        client.post(f"/follow/{author.id}", headers=hv)
        client.post(f"/notes/{note_id}/like", headers=hv)
        client.post(f"/notes/{note_id}/comments", json={"text": "nice"}, headers=hv)
        _forward_date(db, note_id)  # outrank the shared DB's other notes, incl. the F-08 seeds above

        top_keys = {"book", "chapter", "comments_count", "created_at", "emotion", "id",
                    "image_url", "is_public", "liked_by_me", "likes_count", "page_number",
                    "quote", "text", "updated_at", "user", "user_has_liked", "user_id"}

        feed = next(n for n in client.get("/notes/feed?limit=200", headers=hv).json() if n["id"] == note_id)
        ff = next(n for n in client.get("/notes/friends-feed?limit=200", headers=hv).json() if n["id"] == note_id)
        me = next(n for n in client.get("/notes/me?limit=200", headers=ha).json() if n["id"] == note_id)
        by_user = next(n for n in client.get(f"/notes/user/{author.id}", headers=hv).json() if n["id"] == note_id)
        by_ub = next(n for n in client.get(f"/notes/userbook/{ub}", headers=ha).json() if n["id"] == note_id)

        for row in (feed, ff, me, by_user, by_ub):
            assert set(row.keys()) == top_keys

        assert feed["created_at"].endswith("Z")
        assert set(feed["user"].keys()) == {"id", "name", "profile_picture", "username"}
        assert set(me["user"].keys()) == {"id", "name", "profile_picture", "username"}
        assert set(ff["user"].keys()) == {"id", "is_mutual", "name", "profile_picture", "username"}
        assert set(by_user["user"].keys()) == {"id", "name"}
        assert set(by_ub["user"].keys()) == {"id", "name"}

        assert feed["liked_by_me"] == feed["user_has_liked"] is True
        assert feed["likes_count"] == 1
        assert feed["comments_count"] == 1
        assert by_user["likes_count"] == 1
        assert by_user["comments_count"] == 1


# ── §9 R-01..R-04 — cross-package regression: F-07/F-08 must not have changed the shapes
#    the web app and Android app consume from /notes/* ──────────────────────────────────

class TestNoteShapeRegression:
    TOP_KEYS = {"book", "chapter", "comments_count", "created_at", "emotion", "id",
                "image_url", "is_public", "liked_by_me", "likes_count", "page_number",
                "quote", "text", "updated_at", "user", "user_has_liked", "user_id"}

    def test_feed_top_level_keys_unchanged(self, client, db):
        """R-01: the 17 measured top-level keys and the `user` sub-shape survive F-07 and
        F-08 byte for byte (T-A1-67 asserts it once; this re-asserts it against an
        UNAUTHENTICATED /notes/feed — the path App.js preloads before login state settles)."""
        user = _make_user(db, email="r01_feed_author@example.com")
        note_id = _create_note(client, _auth(user), text="R01 unauth feed", is_public=True).json()["id"]
        _forward_date(db, note_id)  # outrank the shared DB's other notes, incl. the F-08 seeds
        r = client.get("/notes/feed?limit=200")  # no headers — unauthenticated
        assert r.status_code == 200
        rows = [n for n in r.json() if n["text"] == "R01 unauth feed"]
        assert rows
        n = rows[0]
        assert set(n.keys()) == self.TOP_KEYS
        assert n["created_at"].endswith("Z")
        assert n["liked_by_me"] == n["user_has_liked"] is False
        assert set(n["user"].keys()) == {"id", "name", "profile_picture", "username"}

    def test_me_keeps_updated_at_and_like_keys(self, client, db):
        """R-02: /notes/me is the endpoint whose handler actually computes a real
        `updated_at` and real like state for the caller (unlike /user/{id} and
        /userbook/{id}, whose handlers never set either — see TestNoteShapeRegression
        docstring on test_user_notes_keeps_its_asymmetries below)."""
        owner = _make_user(db, email="r02_owner@example.com")
        liker = _make_user(db, email="r02_liker@example.com")
        ho, hl = _auth(owner), _auth(liker)
        note_id = _create_note(client, ho, text="R02 note", is_public=True).json()["id"]
        client.put(f"/notes/{note_id}", json={"text": "R02 note edited", "is_public": True}, headers=ho)
        client.post(f"/notes/{note_id}/like", headers=hl)
        client.post(f"/notes/{note_id}/like", headers=ho)  # owner likes their own note too

        rows = [n for n in client.get("/notes/me", headers=ho).json() if n["id"] == note_id]
        assert rows
        n = rows[0]
        assert n["updated_at"] is not None
        assert n["updated_at"].endswith("Z")
        assert n["likes_count"] == 2
        assert n["liked_by_me"] == n["user_has_liked"] is True

    def test_user_notes_keeps_its_asymmetries(self, client, db):
        """R-03 (tests.md §9) literally claims: '/notes/user/{id} still has no user_id and
        no like keys'. THIS DOES NOT MATCH THE MERGED TREE: response_model=List[NoteOutSchema]
        pads every note endpoint to the model's full 17-key set (see T-A1-67 /
        test_note_list_outputs_unchanged_apart_from_book_keys above, whose own docstring
        already documents this), so /notes/user/{id} DOES return a `user_id` key (defaulted
        to null) and DOES return `liked_by_me`/`user_has_liked` keys (defaulted to False,
        not reflecting real like state). This padding predates this sprint — response_model
        was already on this route before F-07/F-08 — so it is not a regression introduced by
        the A1/A2 merge, but it does mean the plan's R-03 wording is stale. Written verbatim
        to match tests.md so the mismatch is caught by the suite; see build-notes-regression.md."""
        alice = _make_user(db, email="r03_alice@example.com")
        bob = _make_user(db, email="r03_bob@example.com")
        _create_note(client, _auth(alice), text="R03 public note", is_public=True)

        rows = [n for n in client.get(f"/notes/user/{alice.id}", headers=_auth(bob)).json()
                if n["text"] == "R03 public note"]
        assert rows
        n = rows[0]
        assert "user_id" not in n
        assert "liked_by_me" not in n
        assert "user_has_liked" not in n
        assert n["user"] == {"id": alice.id, "name": alice.name}

        # private-profile gate still applies to a non-follower
        client.put("/profile/me", json={"is_private_profile": True}, headers=_auth(alice))
        r2 = client.get(f"/notes/user/{alice.id}", headers=_auth(bob))
        assert r2.status_code == 403

    def test_userbook_notes_book_shape_unchanged(self, client, db):
        """R-04: /notes/userbook/{id} `book` is still exactly {author, id, title}; F-07's
        dedup keys (cover_url, google_books_id, isbn, total_pages) must not leak in here."""
        user = _make_user(db, email="r04_user@example.com")
        h = _auth(user)
        add = client.post("/books/add-to-library", json={
            "title": "R04 Book", "google_books_id": "r04-gbid", "isbn": "r04-isbn",
            "total_pages": 250, "status": "reading",
        }, headers=h)
        ub_id = add.json()["id"]
        client.post("/notes/", json={"text": "R04 note", "userbook_id": ub_id, "is_public": True}, headers=h)

        rows = [n for n in client.get(f"/notes/userbook/{ub_id}", headers=h).json()
                if n["text"] == "R04 note"]
        assert rows
        assert set(rows[0]["book"].keys()) == {"author", "id", "title"}


class TestPushAfterResponse:
    """F-59 — like/comment/follow/public-note push and group-activity delivery happens
    after the response is sent, via BackgroundTasks."""

    def test_like_returns_before_push_delivery(self, client, db, monkeypatch):
        import app.notifications.dispatcher as dispatcher
        events = []
        monkeypatch.setattr(dispatcher, "send_expo_push", lambda *a, **k: events.append("push.expo"))
        monkeypatch.setattr(dispatcher, "send_web_push", lambda *a, **k: events.append("push.web"))

        owner = _make_user(db, email="f59_like_owner@example.com")
        liker = _make_user(db, email="f59_like_liker@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]

        status = _asgi_order("POST", f"/notes/{note_id}/like", _auth(liker), None, events)
        assert status == 201
        assert events.index("response.start") < events.index("push.expo")
        assert events.index("response.start") < events.index("push.web")

        db.expire_all()
        rows = db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.event_type == "post_liked")
            .where(models.NotificationLog.actor_id == liker.id)
        ).all()
        assert len(rows) == 1

    def test_comment_returns_before_push_delivery(self, client, db, monkeypatch):
        import app.notifications.dispatcher as dispatcher
        events = []
        monkeypatch.setattr(dispatcher, "send_expo_push", lambda *a, **k: events.append("push.expo"))
        monkeypatch.setattr(dispatcher, "send_web_push", lambda *a, **k: events.append("push.web"))

        owner = _make_user(db, email="f59_comment_owner@example.com")
        commenter = _make_user(db, email="f59_comment_commenter@example.com")
        note_id = _create_note(client, _auth(owner)).json()["id"]

        status = _asgi_order("POST", f"/notes/{note_id}/comments", _auth(commenter), {"text": "F59"}, events)
        assert status == 201
        assert events.index("response.start") < events.index("push.expo")
        assert events.index("response.start") < events.index("push.web")

        db.expire_all()
        rows = db.exec(
            select(models.NotificationLog)
            .where(models.NotificationLog.user_id == owner.id)
            .where(models.NotificationLog.event_type == "post_commented")
            .where(models.NotificationLog.actor_id == commenter.id)
        ).all()
        assert len(rows) == 1

    def test_public_note_group_activity_written_after_response(self, client, db, monkeypatch):
        import app.routers.notes_router as notes_router
        real_fire = notes_router.fire_group_activity_for_user
        events = []

        def _spy(*a, **k):
            result = real_fire(*a, **k)
            events.append("activity")
            return result

        monkeypatch.setattr(notes_router, "fire_group_activity_for_user", _spy)

        author = _make_user(db, email="f59_group_author@example.com")
        h = _auth(author)
        gid = _create_group(client, h, name="F59 Circle").json()["id"]

        status = _asgi_order("POST", "/notes/", h, {"text": "F59 pub", "is_public": True}, events)
        assert status == 201
        assert events.index("response.start") < events.index("activity")
        assert len(_note_posted_events(client, h, gid)) == 1

        events2 = []
        status2 = _asgi_order("POST", "/notes/", h, {"text": "F59 priv", "is_public": False}, events2)
        assert status2 == 201
        assert "activity" not in events2
