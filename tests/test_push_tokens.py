"""Tests for /push-tokens/* — the expo channel must not disturb the web channel."""
from sqlmodel import select
from app import models
from tests.conftest import _make_user, _auth

_SUB = {"endpoint": "https://fcm.googleapis.com/fcm/send/test-abc",
        "keys": {"p256dh": "test-key", "auth": "test-auth"}}
_EXPO = "ExponentPushToken[test-abc123]"


def _rows(db, user_id):
    db.expire_all()          # the request used a different Session on the same in-memory DB
    return db.exec(
        select(models.PushToken).where(models.PushToken.user_id == user_id)
    ).all()


def test_expo_and_web_tokens_coexist(client, db):
    user = _make_user(db, email="push_dual@example.com")
    h = _auth(user)

    r1 = client.post("/notifications/web-subscribe",
                      json={"subscription": _SUB, "device_info": "Chrome/Windows"},
                      headers=h)
    assert r1.status_code == 200
    assert r1.json() == {"message": "Web push subscription registered"}

    rows_after_web = _rows(db, user.id)
    web_token_before = next(t.token for t in rows_after_web if t.token_type == "web")

    r2 = client.post("/push-tokens/", json={"token": _EXPO}, headers=h)
    assert r2.status_code == 200
    assert r2.json() == {"message": "Push token registered"}

    rows = _rows(db, user.id)
    assert len(rows) == 2
    assert sorted(t.token_type for t in rows) == ["expo", "web"]

    web_row = next(t for t in rows if t.token_type == "web")
    expo_row = next(t for t in rows if t.token_type == "expo")
    assert web_row.token == web_token_before
    assert expo_row.token == _EXPO
    assert expo_row.token_type == "expo"


def test_reregistering_same_expo_token_does_not_duplicate(client, db):
    user = _make_user(db, email="push_redupe@example.com")
    h = _auth(user)

    client.post("/notifications/web-subscribe",
                json={"subscription": _SUB, "device_info": "Chrome/Windows"}, headers=h)
    client.post("/push-tokens/", json={"token": _EXPO}, headers=h)

    for _ in range(2):
        r = client.post("/push-tokens/", json={"token": _EXPO}, headers=h)
        assert r.status_code == 200
        rows = _rows(db, user.id)
        assert len([t for t in rows if t.token_type == "expo"]) == 1

    assert len(_rows(db, user.id)) == 2


def test_deregister_removes_only_expo_row(client, db):
    user = _make_user(db, email="push_dereg@example.com")
    h = _auth(user)

    client.post("/notifications/web-subscribe",
                json={"subscription": _SUB, "device_info": "Chrome/Windows"}, headers=h)
    client.post("/push-tokens/", json={"token": _EXPO}, headers=h)

    r = client.delete("/push-tokens/", headers=h)
    assert r.status_code == 200
    assert r.json() == {"message": "Push token removed"}

    remaining = _rows(db, user.id)
    assert [t.token_type for t in remaining] == ["web"]
    assert remaining[0].token != _EXPO


def test_invalid_token_format_creates_no_row(client, db):
    user = _make_user(db, email="push_invalid@example.com")
    h = _auth(user)

    for bad_token in ("not-a-real-token", ""):
        r = client.post("/push-tokens/", json={"token": bad_token}, headers=h)
        assert r.status_code == 200
        assert "Invalid token format" in r.json()["message"]
        assert len(_rows(db, user.id)) == 0


def test_push_token_routes_require_auth(client):
    assert client.post("/push-tokens/", json={"token": _EXPO}).status_code == 401
    assert client.delete("/push-tokens/").status_code == 401


def test_deregister_with_only_web_row_is_noop(client, db):
    user = _make_user(db, email="push_webonly@example.com")
    h = _auth(user)

    client.post("/notifications/web-subscribe",
                json={"subscription": _SUB, "device_info": "Chrome/Windows"}, headers=h)
    web_token_before = _rows(db, user.id)[0].token

    r = client.delete("/push-tokens/", headers=h)
    assert r.status_code == 200

    remaining = _rows(db, user.id)
    assert len(remaining) == 1
    assert remaining[0].token_type == "web"
    assert remaining[0].token == web_token_before


def test_deregister_removes_all_expo_duplicates(client, db):
    user = _make_user(db, email="push_dupes@example.com")
    h = _auth(user)

    client.post("/notifications/web-subscribe",
                json={"subscription": _SUB, "device_info": "Chrome/Windows"}, headers=h)

    db.add(models.PushToken(user_id=user.id, token="ExponentPushToken[dup-1]", token_type="expo"))
    db.add(models.PushToken(user_id=user.id, token="ExponentPushToken[dup-2]", token_type="expo"))
    db.commit()

    r = client.delete("/push-tokens/", headers=h)
    assert r.status_code == 200

    remaining = _rows(db, user.id)
    assert all(t.token_type != "expo" for t in remaining)
    assert any(t.token_type == "web" for t in remaining)
