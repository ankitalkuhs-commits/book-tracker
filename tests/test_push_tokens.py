"""Tests for /push-tokens/* — the expo channel must not disturb the web channel."""
import json
from uuid import uuid4

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


# ── F-03: every test below uses its own endpoint/token so the shared DB and the
#    reused _SUB/_EXPO constants above (needed by the pre-existing 7 tests) never collide. ──

def _endpoint():
    return f"https://fcm.googleapis.com/fcm/send/{uuid4().hex}"


def _token():
    return f"ExponentPushToken[f03-{uuid4().hex[:12]}]"


def _sub(endpoint):
    return {"endpoint": endpoint, "keys": {"p256dh": "k", "auth": "a"}}


def _web_rows_for(db, endpoint):
    db.expire_all()
    rows = []
    for row in db.exec(select(models.PushToken).where(models.PushToken.token_type == "web")).all():
        try:
            if json.loads(row.token).get("endpoint") == endpoint:
                rows.append(row)
        except (ValueError, TypeError):
            continue
    return rows


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


# ── F-03 — one owner per push token / browser endpoint ──────────────────────────

def test_register_token_owned_by_other_user_moves_row(client, db):
    a = _make_user(db, email=f"f03_a_{uuid4().hex}@example.com")
    b = _make_user(db, email=f"f03_b_{uuid4().hex}@example.com")
    tok = _token()

    r1 = client.post("/push-tokens/", json={"token": tok}, headers=_auth(a))
    assert r1.status_code == 200
    assert r1.json() == {"message": "Push token registered"}
    r2 = client.post("/push-tokens/", json={"token": tok}, headers=_auth(b))
    assert r2.status_code == 200
    assert r2.json() == {"message": "Push token registered"}

    rows = db.exec(select(models.PushToken).where(
        models.PushToken.token == tok, models.PushToken.token_type == "expo"
    )).all()
    assert len(rows) == 1
    assert rows[0].user_id == b.id
    assert [t for t in _rows(db, a.id) if t.token_type == "expo"] == []


def test_user_a_gets_no_push_after_token_moves(client, db, monkeypatch):
    import app.notifications.dispatcher as dispatcher

    a = _make_user(db, email=f"f03_ua_{uuid4().hex}@example.com")
    b = _make_user(db, email=f"f03_ub_{uuid4().hex}@example.com")
    tok = _token()
    client.post("/push-tokens/", json={"token": tok}, headers=_auth(a))
    client.post("/push-tokens/", json={"token": tok}, headers=_auth(b))

    recorded = {}

    def _spy(db_, user_id, title, body, data):
        rows = db_.exec(select(models.PushToken).where(
            models.PushToken.user_id == user_id, models.PushToken.token_type == "expo"
        )).all()
        recorded[user_id] = [t.token for t in rows]

    monkeypatch.setattr(dispatcher, "send_expo_push", _spy)
    monkeypatch.setattr(dispatcher, "send_web_push", lambda *a, **k: None)

    db.expire_all()
    dispatcher.fire_event(db=db, event_type="new_follower", actor_id=b.id, actor_name="B",
                           recipient_ids=[a.id], extra={})
    dispatcher.fire_event(db=db, event_type="new_follower", actor_id=a.id, actor_name="A",
                           recipient_ids=[b.id], extra={})

    assert recorded.get(a.id) == []
    assert recorded.get(b.id) == [tok]


def test_register_expo_does_not_touch_other_users_web_rows(client, db):
    a = _make_user(db, email=f"f03_expoweb_a_{uuid4().hex}@example.com")
    b = _make_user(db, email=f"f03_expoweb_b_{uuid4().hex}@example.com")
    e = _endpoint()
    client.post("/notifications/web-subscribe", json={"subscription": _sub(e)}, headers=_auth(a))
    a_before = [t for t in _rows(db, a.id) if t.token_type == "web"]
    assert len(a_before) == 1
    a_row_id = a_before[0].id

    client.post("/push-tokens/", json={"token": _token()}, headers=_auth(b))

    a_after = [t for t in _rows(db, a.id) if t.token_type == "web"]
    assert len(a_after) == 1
    assert a_after[0].id == a_row_id


def test_web_subscribe_same_endpoint_moves_between_users(client, db):
    a = _make_user(db, email=f"f03_moveweb_a_{uuid4().hex}@example.com")
    b = _make_user(db, email=f"f03_moveweb_b_{uuid4().hex}@example.com")
    e = _endpoint()

    r1 = client.post("/notifications/web-subscribe", json={"subscription": _sub(e)}, headers=_auth(a))
    assert r1.status_code == 200
    assert r1.json() == {"message": "Web push subscription registered"}
    r2 = client.post("/notifications/web-subscribe", json={"subscription": _sub(e)}, headers=_auth(b))
    assert r2.status_code == 200
    assert r2.json() == {"message": "Web push subscription registered"}

    rows = _web_rows_for(db, e)
    assert len(rows) == 1
    assert rows[0].user_id == b.id


def test_web_subscribe_keeps_same_users_other_browser(client, db):
    a = _make_user(db, email=f"f03_twobrowsers_{uuid4().hex}@example.com")
    e1, e2 = _endpoint(), _endpoint()
    client.post("/notifications/web-subscribe", json={"subscription": _sub(e1)}, headers=_auth(a))
    client.post("/notifications/web-subscribe", json={"subscription": _sub(e2)}, headers=_auth(a))

    web_rows = [t for t in _rows(db, a.id) if t.token_type == "web"]
    assert len(web_rows) == 2
    endpoints = {json.loads(t.token).get("endpoint") for t in web_rows}
    assert endpoints == {e1, e2}


def test_web_subscribe_same_endpoint_twice_single_row(client, db):
    a = _make_user(db, email=f"f03_dupe_{uuid4().hex}@example.com")
    e = _endpoint()
    client.post("/notifications/web-subscribe", json={"subscription": _sub(e)}, headers=_auth(a))
    client.post("/notifications/web-subscribe", json={"subscription": _sub(e)}, headers=_auth(a))

    rows = _web_rows_for(db, e)
    assert len(rows) == 1
    assert rows[0].user_id == a.id


def test_web_subscribe_key_order_does_not_duplicate(client, db):
    a = _make_user(db, email=f"f03_keyorder_{uuid4().hex}@example.com")
    e = _endpoint()
    client.post("/notifications/web-subscribe", json={
        "subscription": {"endpoint": e, "keys": {"p256dh": "k", "auth": "a"}}
    }, headers=_auth(a))
    client.post("/notifications/web-subscribe", json={
        "subscription": {"keys": {"auth": "a", "p256dh": "k"}, "expirationTime": None, "endpoint": e}
    }, headers=_auth(a))

    rows = _web_rows_for(db, e)
    assert len(rows) == 1
    assert rows[0].user_id == a.id


def test_web_unsubscribe_matches_by_endpoint(client, db):
    a = _make_user(db, email=f"f03_unsub_match_{uuid4().hex}@example.com")
    e1, e2 = _endpoint(), _endpoint()
    client.post("/notifications/web-subscribe", json={"subscription": _sub(e1)}, headers=_auth(a))
    client.post("/notifications/web-subscribe", json={"subscription": _sub(e2)}, headers=_auth(a))

    r = client.request(
        "DELETE", "/notifications/web-unsubscribe",
        json={"subscription": {"endpoint": e1, "keys": {"p256dh": "different", "auth": "different"}}},
        headers=_auth(a),
    )
    assert r.status_code == 200

    remaining = [t for t in _rows(db, a.id) if t.token_type == "web"]
    assert len(remaining) == 1
    assert json.loads(remaining[0].token).get("endpoint") == e2


def test_web_unsubscribe_cannot_remove_other_users_row(client, db):
    a = _make_user(db, email=f"f03_unsub_other_a_{uuid4().hex}@example.com")
    b = _make_user(db, email=f"f03_unsub_other_b_{uuid4().hex}@example.com")
    e = _endpoint()
    client.post("/notifications/web-subscribe", json={"subscription": _sub(e)}, headers=_auth(a))

    r = client.request("DELETE", "/notifications/web-unsubscribe", json={"subscription": _sub(e)}, headers=_auth(b))
    assert r.status_code == 200

    rows = _web_rows_for(db, e)
    assert len(rows) == 1
    assert rows[0].user_id == a.id


def test_web_subscribe_without_endpoint_400(client, db):
    a = _make_user(db, email=f"f03_noendpoint_{uuid4().hex}@example.com")
    before = len([t for t in _rows(db, a.id) if t.token_type == "web"])

    r = client.post("/notifications/web-subscribe",
                     json={"subscription": {"keys": {"p256dh": "k", "auth": "a"}}}, headers=_auth(a))
    assert r.status_code == 400
    assert r.json() == {"detail": "subscription.endpoint is required"}

    after = len([t for t in _rows(db, a.id) if t.token_type == "web"])
    assert after == before


def test_endpoint_with_like_wildcards_matched_exactly(client, db):
    a = _make_user(db, email=f"f03_wildcard_a_{uuid4().hex}@example.com")
    b = _make_user(db, email=f"f03_wildcard_b_{uuid4().hex}@example.com")
    base = _endpoint()
    ea = base + "/abc_%"     # LIKE metacharacters — must be matched literally, not as wildcards
    eb = base + "/abcX1"     # same base; would falsely match an unescaped "abc_%" LIKE pattern

    client.post("/notifications/web-subscribe", json={"subscription": _sub(eb)}, headers=_auth(a))
    client.post("/notifications/web-subscribe", json={"subscription": _sub(ea)}, headers=_auth(b))
    r = client.request("DELETE", "/notifications/web-unsubscribe", json={"subscription": _sub(ea)}, headers=_auth(b))
    assert r.status_code == 200

    a_rows = [t for t in _rows(db, a.id) if t.token_type == "web"]
    assert len(a_rows) == 1
    assert json.loads(a_rows[0].token).get("endpoint") == eb
    b_rows = [t for t in _rows(db, b.id) if t.token_type == "web"]
    assert b_rows == []
