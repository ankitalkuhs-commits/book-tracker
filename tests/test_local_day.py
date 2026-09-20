"""Sprint 4C (F-62): a reader's day is their own local day.

New file — 79 cases across TestLocalDayUnits, TestZoneHeader, TestLastActive,
TestProgressLabel, TestReadDays, TestCutoverBridge, TestTravel, TestSchemaGuard,
TestStaticRules, TestClockIndependence. See features/reading-stats/sprint-4c-local-day/tests.md
section 2 for the authoritative case table this file implements.

Pytest conventions (binding, per tests.md):
- Fresh user per case (unique email) — a stored zone must never leak into alice_f/bob_f/admin_f.
- Explicit instants for every boundary case, via the `freeze_at` fixture.
- `H(user, zone)` builds the auth + optional X-Timezone header.
"""
import ast
import importlib
import os
import subprocess
import sys
import time as _time_mod
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlmodel import select

from app import models
import app.localday as localday
from tests.conftest import _make_user, _auth, engine as test_engine

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ── Shared helpers ────────────────────────────────────────────────────────────

def H(user, zone=None):
    h = dict(_auth(user))
    if zone:
        h["X-Timezone"] = zone
    return h


def _add_book(client, headers, title="4c Book", pages=500, status="reading", current_page=0):
    r = client.post("/books/add-to-library", json={
        "title": title, "total_pages": pages, "status": status, "current_page": current_page,
    }, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _seed(db, user_id, ub_id, label, pages, local_day, created_at=None):
    row = models.ReadingActivity(
        user_id=user_id, userbook_id=ub_id,
        date=datetime(label.year, label.month, label.day),
        pages_read=pages, current_page=pages, local_day=local_day,
        created_at=created_at or datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.expire_all()
    return row


def _set_zone(db, user, zone):
    u = db.get(models.User, user.id)
    u.timezone = zone
    db.add(u)
    db.commit()
    db.expire_all()


def _d(y, m, d):
    return date(y, m, d)


# ══════════════════════════════════════════════════════════════════════════
# 2.1 app/localday.py units
# ══════════════════════════════════════════════════════════════════════════

class TestLocalDayUnits:
    def test_valid_zone_accepts_iana_names(self):
        for z in ("Asia/Kolkata", "America/New_York", "UTC", "Asia/Calcutta",
                  "Asia/Katmandu", "Asia/Kathmandu", "Pacific/Chatham", "Europe/London"):
            assert localday.valid_zone(z) == z

    def test_valid_zone_rejects_garbage(self):
        for bad in ("Mars/Olympus", "../../etc/passwd", "/etc/localtime", "asia/kolkata",
                    "ASIA/KOLKATA", "", None, 123, b"UTC", "A" * 65, "localtime",
                    "posixrules", "Etc/Unknown", " UTC"):
            assert localday.valid_zone(bad) is None

    def test_valid_zone_length_cap_independent_of_allowlist(self, monkeypatch):
        monkeypatch.setattr(localday, "_VALID_ZONES", localday._VALID_ZONES | {"Z" * 65, "Y" * 64})
        assert "Z" * 65 in localday._VALID_ZONES   # control: the patch bites
        assert localday.valid_zone("Z" * 65) is None
        assert localday.valid_zone("Y" * 64) == "Y" * 64

    def test_valid_zone_never_touches_filesystem(self, monkeypatch):
        import builtins
        import importlib.resources as _res

        def _boom(*a, **k):
            raise AssertionError("fs touched")

        # The patches below are intentionally hostile: a mutated valid_zone is EXPECTED to
        # trip one of them. If that AssertionError escaped this `with` block, pytest's own
        # failure-reporting machinery (building the traceback) also calls os.stat() — while
        # the patch is still active — and crashes the whole run instead of reporting a clean
        # failure (measured). So every call is wrapped and the exception captured as a plain
        # value; the patches are gone (context exited) before any pytest assertion runs.
        results = {}
        control_raised = False
        with monkeypatch.context() as m:
            m.setattr(builtins, "open", _boom)
            m.setattr(os, "stat", _boom)
            m.setattr(os.path, "exists", _boom)
            m.setattr(_res, "files", _boom)
            # Direct guard: valid_zone must never construct a ZoneInfo at all — membership is
            # a frozenset lookup. The indirect filesystem patches alone are not reliable:
            # ZoneInfo's per-key cache and its own upfront key-format validation can let a
            # garbage or already-cached key return correctly *without* ever touching the
            # filesystem (measured: MUT16 "return name if not ZoneInfo(name) raises" passed
            # under the filesystem patches alone). Patching the plain module-level name that
            # `localday.py` itself calls closes that gap.
            m.setattr(localday, "ZoneInfo", _boom)

            for key, value in (("passwd", "../../etc/passwd"), ("kolkata", "Asia/Kolkata"), ("lower", "asia/kolkata")):
                try:
                    results[key] = localday.valid_zone(value)
                except AssertionError as e:
                    results[key] = e
            try:
                localday.ZoneInfo("Asia/Tokyo")
            except AssertionError:
                control_raised = True

        # Control: the same patch DOES bite a real ZoneInfo construction via localday.py.
        assert control_raised, "the patch never fired — this case would test nothing"
        assert results["passwd"] is None, f"got {results['passwd']!r}"
        assert results["kolkata"] == "Asia/Kolkata", f"got {results['kolkata']!r}"
        assert results["lower"] is None, f"got {results['lower']!r}"

    def test_zone_of_fallback_and_stored(self):
        assert localday.zone_of(None).key == "Asia/Kolkata"
        assert localday.zone_of(SimpleNamespace(timezone=None)).key == "Asia/Kolkata"
        assert localday.zone_of(SimpleNamespace(timezone="garbage")).key == "Asia/Kolkata"
        assert localday.zone_of(SimpleNamespace(timezone="../../etc/passwd")).key == "Asia/Kolkata"
        assert localday.zone_of(SimpleNamespace(timezone="America/New_York")).key == "America/New_York"

    def test_local_date_ist_ny_utc_and_aware_input(self):
        from zoneinfo import ZoneInfo
        instant = datetime(2026, 9, 17, 19, 0)
        assert localday.local_date(instant, ZoneInfo("Asia/Kolkata")) == _d(2026, 9, 18)
        assert localday.local_date(instant, ZoneInfo("America/New_York")) == _d(2026, 9, 17)
        assert localday.local_date(instant, ZoneInfo("UTC")) == _d(2026, 9, 17)
        aware = datetime(2026, 9, 17, 19, 0, tzinfo=ZoneInfo("Asia/Tokyo"))  # 10:00Z
        assert localday.local_date(aware, ZoneInfo("UTC")) == _d(2026, 9, 17)

    def test_local_date_dst_new_york(self):
        from zoneinfo import ZoneInfo
        ny = ZoneInfo("America/New_York")
        assert localday.local_date(datetime(2026, 3, 8, 4, 59), ny) == _d(2026, 3, 7)
        assert localday.local_date(datetime(2026, 3, 8, 5, 0), ny) == _d(2026, 3, 8)
        assert localday.local_date(datetime(2026, 3, 8, 7, 30), ny) == _d(2026, 3, 8)
        assert localday.local_now(ny, datetime(2026, 3, 8, 7, 30)).hour == 3
        assert localday.local_date(datetime(2026, 11, 1, 4, 30), ny) == _d(2026, 11, 1)
        assert localday.local_date(datetime(2026, 11, 1, 5, 30), ny) == _d(2026, 11, 1)
        assert localday.local_date(datetime(2026, 11, 1, 6, 30), ny) == _d(2026, 11, 1)
        assert localday.local_now(ny, datetime(2026, 11, 2, 1, 0)).hour == 20

    def test_local_date_dst_at_midnight_santiago(self):
        from zoneinfo import ZoneInfo
        santiago = ZoneInfo("America/Santiago")
        assert localday.local_date(datetime(2026, 9, 6, 3, 59), santiago) == _d(2026, 9, 5)
        assert localday.local_date(datetime(2026, 9, 6, 4, 0), santiago) == _d(2026, 9, 6)
        assert localday.local_now(santiago, datetime(2026, 9, 6, 4, 0)).hour == 1
        assert localday.local_date(datetime(2026, 4, 5, 2, 30), santiago) == _d(2026, 4, 4)
        assert localday.local_date(datetime(2026, 4, 5, 3, 30), santiago) == _d(2026, 4, 4)

    def test_local_date_extreme_offsets(self):
        from zoneinfo import ZoneInfo
        kathmandu = ZoneInfo("Asia/Kathmandu")
        assert localday.local_date(datetime(2026, 9, 18, 18, 14), kathmandu) == _d(2026, 9, 18)
        assert localday.local_date(datetime(2026, 9, 18, 18, 15), kathmandu) == _d(2026, 9, 19)
        kiritimati = ZoneInfo("Pacific/Kiritimati")
        assert localday.local_date(datetime(2026, 9, 18, 9, 59), kiritimati) == _d(2026, 9, 18)
        assert localday.local_date(datetime(2026, 9, 18, 10, 0), kiritimati) == _d(2026, 9, 19)

    def test_day_label_is_naive_midnight(self):
        lbl = localday.day_label(_d(2026, 9, 18))
        assert lbl == datetime(2026, 9, 18, 0, 0)
        assert lbl.tzinfo is None

    def test_constants_e1_fallback_header_and_cap(self):
        assert localday.FALLBACK_ZONE == "Asia/Kolkata"
        assert localday.ZONE_HEADER == "X-Timezone"
        assert localday.MAX_ZONE_LEN == 64
        assert localday.FALLBACK_ZONE in localday._VALID_ZONES


# ══════════════════════════════════════════════════════════════════════════
# 2.2 The zone header, storage and privacy (R-07, R-08, R-09, R-13)
# ══════════════════════════════════════════════════════════════════════════

class TestZoneHeader:
    def test_header_persisted_and_used_on_first_request(self, client, db, freeze_at):
        freeze_at("2026-09-17T19:00:00")
        u1 = _make_user(db, email="4c-h1a@example.com")
        r = client.get("/profile/me", headers=H(u1, "America/New_York"))
        assert r.status_code == 200
        assert r.json()["timezone"] == "America/New_York"
        db.expire_all()
        assert db.get(models.User, u1.id).timezone == "America/New_York"

        u2 = _make_user(db, email="4c-h1b@example.com")
        r2 = client.get("/reading-activity/daily?days=2", headers=H(u2, "America/New_York"))
        assert r2.json()["data"][-1]["date"] == "2026-09-17"

    def test_invalid_header_values_ignored(self, client, db):
        u = _make_user(db, email="4c-h2@example.com")
        _set_zone(db, u, "Asia/Tokyo")
        for bad in ("Mars/Olympus", "../../etc/passwd", "asia/kolkata", "", "A" * 65,
                    "Etc/Unknown", "localtime"):
            r = client.get("/profile/me", headers=H(u, bad))
            assert r.status_code == 200
            assert r.json()["timezone"] == "Asia/Tokyo"
        db.expire_all()
        assert db.get(models.User, u.id).timezone == "Asia/Tokyo"

    def test_header_never_changes_status_or_body(self, client, db):
        u = _make_user(db, email="4c-h2b@example.com")
        pairs = [
            ("GET", "/profile/me", None),
            ("GET", "/reading-activity/daily?days=3", None),
            ("GET", "/userbooks/999999999", None),
            ("GET", "/reading-activity/daily?days=0", None),
        ]
        for method, path, _ in pairs:
            r_without = client.request(method, path, headers=H(u))
            r_with = client.request(method, path, headers=H(u, "Mars/Olympus"))
            assert r_without.status_code == r_with.status_code
            assert r_without.json() == r_with.json()
        r1 = client.get("/profile/me")
        r2 = client.get("/profile/me", headers={"X-Timezone": "Mars/Olympus"})
        assert r1.status_code == r2.status_code == 401

    def test_header_value_never_logged(self, client, db, caplog, capsys):
        import logging
        caplog.set_level(logging.DEBUG)
        u = _make_user(db, email="4c-h3a@example.com")
        v = _make_user(db, email="4c-h3b@example.com")
        bad_values = ("Mars/Olympus", "../../etc/passwd", "asia/kolkata", "A" * 65, "Etc/Unknown")
        for bad in bad_values:
            client.get("/profile/me", headers=H(u, bad))
            client.get("/reading-activity/daily", headers=H(u, bad))
        client.post(f"/follow/{v.id}", headers=H(u))
        out = capsys.readouterr()
        text = out.out + out.err + caplog.text
        for bad in ("Mars/Olympus", "etc/passwd", "asia/kolkata", "A" * 65, "Etc/Unknown"):
            assert bad not in text
        assert "[Notify] new_follower" in text  # control: app-thread prints are captured

    def test_absent_header_keeps_stored_zone_and_null_for_never_reported(self, client, db):
        a = _make_user(db, email="4c-h4a@example.com")
        client.get("/profile/me", headers=H(a, "Europe/Paris"))
        for _ in range(3):
            r = client.get("/profile/me", headers=H(a))
            assert r.json()["timezone"] == "Europe/Paris"

        b = _make_user(db, email="4c-h4b@example.com")
        r = client.get("/profile/me", headers=H(b))
        assert r.status_code == 200
        assert r.json()["timezone"] is None

    def test_zone_change_follows_device_one_update_per_change(self, client, db, freeze_at, stmt_counter):
        freeze_at("2026-09-18T10:00:00")
        u = _make_user(db, email="4c-h5@example.com")

        stmt_counter.reset()
        client.get("/profile/me", headers=H(u, "Asia/Kolkata"))
        assert stmt_counter.updates_user == 1

        stmt_counter.reset()
        client.get("/profile/me", headers=H(u, "Asia/Kolkata"))
        assert stmt_counter.updates_user == 0

        stmt_counter.reset()
        client.get("/profile/me", headers=H(u, "Europe/London"))
        assert stmt_counter.updates_user == 1

        stmt_counter.reset()
        client.get("/profile/me", headers=H(u, "Europe/London"))
        assert stmt_counter.updates_user == 0

        db.expire_all()
        assert db.get(models.User, u.id).timezone == "Europe/London"

    def test_header_persisted_before_last_active_compared(self, client, db, freeze_at):
        """D-1 precedence, guarded directly: the reported zone must be persisted BEFORE it is
        used for the last_active local-day comparison — not after. If the comparison ran
        against the stale (pre-update) zone, these two instants (23:30 UTC 09-17 and 00:30 UTC
        09-18 — different UTC-based days, but the SAME IST calendar day, 09-18) would wrongly
        look like a new day once the reader's zone becomes IST."""
        u = _make_user(db, email="4c-h1c@example.com")
        freeze_at("2026-09-17T23:30:00")
        client.get("/profile/me", headers=H(u, "UTC"))
        freeze_at("2026-09-18T00:30:00")
        client.get("/profile/me", headers=H(u, "Asia/Kolkata"))
        db.expire_all()
        user = db.get(models.User, u.id)
        assert user.timezone == "Asia/Kolkata"
        assert user.last_active == datetime(2026, 9, 17, 23, 30)

    def test_cors_preflight_allows_x_timezone(self, client):
        r = client.options("/profile/me", headers={
            "Origin": "https://www.trackmyread.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,content-type,x-timezone",
        })
        assert r.status_code == 200
        assert "x-timezone" in r.headers.get("access-control-allow-headers", "").lower()
        assert r.headers.get("access-control-allow-origin") == "https://www.trackmyread.com"

    def test_timezone_absent_from_named_views(self, client, db):
        s = _make_user(db, email="4c-h7-s@example.com")
        _set_zone(db, s, "Asia/Tokyo")
        v = _make_user(db, email="4c-h7-v@example.com")
        w = _make_user(db, email="4c-h7-w@example.com")
        client.post(f"/follow/{s.id}", headers=H(v))

        def _walk(obj):
            if isinstance(obj, dict):
                assert "timezone" not in obj, obj
                for val in obj.values():
                    _walk(val)
            elif isinstance(obj, list):
                for item in obj:
                    _walk(item)

        for path in (f"/profile/{s.id}", f"/users/search?q={s.username}",
                     f"/users/{s.id}/stats", f"/reading-activity/user/{s.id}/daily"):
            r = client.get(path, headers=H(v))
            assert r.status_code < 500
            _walk(r.json())

        r = client.get("/admin/users", headers=H(_make_user(db, email="4c-h7-admin@example.com", is_admin=True)))
        if r.status_code == 200:
            _walk(r.json())

        s.is_private_profile = True
        db.add(s)
        db.commit()
        r = client.get(f"/profile/{s.id}", headers=H(w))
        assert r.status_code == 200
        _walk(r.json())

    def test_timezone_never_in_any_other_get_response(self, client, db):
        s = _make_user(db, email="4c-h7b-s@example.com")
        _set_zone(db, s, "Pacific/Chatham")
        v = _make_user(db, email="4c-h7b-v@example.com")
        a = _make_user(db, email="4c-h7b-admin@example.com", is_admin=True)
        client.post(f"/follow/{s.id}", headers=H(v))
        note_r = client.post("/notes/", json={"text": "4c-h7b note"}, headers=H(s))
        note_id = note_r.json().get("id") if note_r.status_code < 400 else 1
        ub_id = _add_book(client, H(s), title="4c-h7b book")
        group_r = client.post("/groups/", json={"name": "4c-h7b group", "is_private": False}, headers=H(s))
        group_id = group_r.json().get("id") if group_r.status_code < 400 else 1
        if group_r.status_code < 400:
            client.post(f"/groups/{group_id}/join", headers=H(v))

        # Control: /profile/me DOES contain the sentinel for its owner.
        own = client.get("/profile/me", headers=H(s))
        assert "Pacific/Chatham" in own.text

        path_values = {
            "user_id": s.id, "group_id": group_id, "note_id": note_id,
            "userbook_id": ub_id, "book_id": 1, "id": s.id,
        }
        swept = 0
        for route in list(client.app.routes):
            methods = getattr(route, "methods", None) or set()
            path = getattr(route, "path", None)
            if "GET" not in methods or not path:
                continue
            if any(seg in path for seg in ("/openapi.json", "/docs", "/redoc")) or path.startswith("/api/googlebooks"):
                continue
            if path == "/profile/me":
                continue   # the control case above already proves it DOES appear there (own profile)
            try:
                real_path = path
                for param in ("user_id", "group_id", "note_id", "userbook_id", "book_id", "id"):
                    token = "{" + param + "}"
                    if token in real_path:
                        if param not in path_values:
                            raise AssertionError(f"add {param} to the sweep map")
                        real_path = real_path.replace(token, str(path_values[param]))
                if "{" in real_path:
                    continue   # an unmapped param — skip rather than send garbage
            except AssertionError:
                raise
            for caller in (H(v), H(s), H(a)):
                r = client.get(real_path, headers=caller)
                # 503 = a legitimate "not configured in this env" (e.g. VAPID keys), not a crash.
                assert r.status_code < 500 or r.status_code == 503, f"{real_path} -> {r.status_code}"
                assert "Pacific/Chatham" not in r.text
            swept += 1
        assert swept >= 20   # a meaningful slice of the route table was actually exercised

    def test_deploy_invariance_sums_and_rows(self, client, db, freeze_at):
        frozen = freeze_at("2026-09-18T06:00:00")
        users = [_make_user(db, email=f"4c-h8-{i}@example.com") for i in range(3)]
        ub_ids = [_add_book(client, H(u), title=f"4c-h8-book-{i}") for i, u in enumerate(users)]

        seeded = []
        for i, (u, ub) in enumerate(zip(users, ub_ids)):
            for day_offset in range(0, 60, 5):
                label = (frozen.date() - timedelta(days=day_offset))
                row = _seed(db, u.id, ub, label, pages=3 + i, local_day=None, created_at=frozen)
                seeded.append((row.id, row.date, row.pages_read, row.local_day))

        group_r = client.post("/groups/", json={"name": "4c-h8-group", "is_private": False}, headers=H(users[0]))
        group_id = group_r.json().get("id") if group_r.status_code < 400 else None
        if group_id:
            _seed(db, users[0].id, ub_ids[0], frozen.date(), 7, None, created_at=frozen)

        for u in users:
            r = client.get("/reading-activity/daily?days=60", headers=H(u))
            assert r.status_code == 200
            r2 = client.get("/reading-activity/insights", headers=H(u))
            assert r2.status_code == 200
        if group_id:
            client.get(f"/groups/{group_id}/goal", headers=H(users[0]))

        db.expire_all()
        for rid, rdate, pages, ld in seeded:
            row = db.get(models.ReadingActivity, rid)
            assert (row.date, row.pages_read, row.local_day) == (rdate, pages, ld)

    def test_put_profile_me_cannot_set_timezone(self, client, db):
        u = _make_user(db, email="4c-h9@example.com")
        _set_zone(db, u, "Asia/Tokyo")
        r = client.put("/profile/me", json={"timezone": "America/New_York", "bio": "4c-h9"}, headers=H(u))
        assert r.status_code == 200
        assert r.json()["bio"] == "4c-h9"
        assert r.json()["timezone"] == "Asia/Tokyo" if "timezone" in r.json() else True
        db.expire_all()
        assert db.get(models.User, u.id).timezone == "Asia/Tokyo"

    def test_header_only_writes_callers_own_row(self, client, db):
        a = _make_user(db, email="4c-h10a@example.com")
        _set_zone(db, a, "Asia/Tokyo")
        b = _make_user(db, email="4c-h10b@example.com")
        client.get(f"/profile/{a.id}", headers=H(b, "Europe/Paris"))
        client.get(f"/reading-activity/user/{a.id}/daily", headers=H(b, "Europe/Paris"))
        db.expire_all()
        assert db.get(models.User, a.id).timezone == "Asia/Tokyo"
        assert db.get(models.User, b.id).timezone == "Europe/Paris"

    def test_invalid_stored_zone_falls_back_without_500(self, client, db, freeze_at):
        freeze_at("2026-09-17T19:00:00")
        u1 = _make_user(db, email="4c-h11a@example.com")
        _set_zone(db, u1, "Mars/Olympus")
        u2 = _make_user(db, email="4c-h11b@example.com")
        _set_zone(db, u2, "../../etc/passwd")
        for u in (u1, u2):
            r1 = client.get("/reading-activity/daily?days=2", headers=H(u))
            assert r1.status_code == 200
            assert r1.json()["data"][-1]["date"] == "2026-09-18"
            r2 = client.get("/reading-activity/insights", headers=H(u))
            assert r2.status_code == 200
            r3 = client.get("/profile/me", headers=H(u))
            assert r3.status_code == 200

    def test_timezone_deleted_with_account(self, client, db):
        u = _make_user(db, email="4c-h12@example.com")
        _set_zone(db, u, "Asia/Tokyo")
        uid = u.id   # captured before the account (and this identity-mapped instance) is deleted
        r = client.post("/auth/delete-account/me", headers=H(u))
        assert r.status_code == 200
        assert r.json() == {"message": "Account deleted"}
        db.expire_all()
        assert db.exec(select(models.User).where(models.User.id == uid)).first() is None

    def test_header_ignored_without_valid_auth(self, client, db):
        before = len(db.exec(select(models.User).where(models.User.timezone == "Asia/Tokyo")).all())
        r1 = client.get("/notes/feed", headers={"X-Timezone": "Asia/Tokyo"})
        assert r1.status_code == 200
        r2 = client.get("/profile/me", headers={"Authorization": "Bearer not-a-token", "X-Timezone": "Asia/Tokyo"})
        assert r2.status_code == 401
        after = len(db.exec(select(models.User).where(models.User.timezone == "Asia/Tokyo")).all())
        assert after == before

    def test_old_client_without_header_uses_stored_then_fallback(self, client, db):
        a = _make_user(db, email="4c-h14a@example.com")
        _set_zone(db, a, "America/New_York")
        b = _make_user(db, email="4c-h14b@example.com")
        ra = client.get("/reading-activity/daily?days=2", headers=H(a))
        rb = client.get("/reading-activity/daily?days=2", headers=H(b))
        db.expire_all()
        assert db.get(models.User, a.id).timezone == "America/New_York"
        assert db.get(models.User, b.id).timezone is None


# ══════════════════════════════════════════════════════════════════════════
# 2.3 last_active — TestLastActive (R-10)
# ══════════════════════════════════════════════════════════════════════════

class TestLastActive:
    def test_last_active_refreshed_on_new_local_day_ist(self, client, db, freeze_at):
        u = _make_user(db, email="4c-l1@example.com")
        _set_zone(db, u, "Asia/Kolkata")
        freeze_at("2026-09-17T18:00:00")
        client.get("/profile/me", headers=H(u))
        db.expire_all()
        assert db.get(models.User, u.id).last_active == datetime(2026, 9, 17, 18, 0)

        freeze_at("2026-09-17T19:00:00")
        client.get("/profile/me", headers=H(u))
        db.expire_all()
        assert db.get(models.User, u.id).last_active == datetime(2026, 9, 17, 19, 0)

    def test_last_active_not_rewritten_same_local_day_across_utc_midnight(self, client, db, freeze_at):
        u = _make_user(db, email="4c-l2@example.com")
        _set_zone(db, u, "America/New_York")
        freeze_at("2026-09-17T23:30:00")
        client.get("/profile/me", headers=H(u))
        freeze_at("2026-09-18T03:30:00")
        client.get("/profile/me", headers=H(u))
        db.expire_all()
        assert db.get(models.User, u.id).last_active == datetime(2026, 9, 17, 23, 30)

    def test_last_active_uses_fallback_for_never_reported(self, client, db, freeze_at):
        u = _make_user(db, email="4c-l4@example.com")
        freeze_at("2026-09-17T18:00:00")
        client.get("/profile/me", headers=H(u))
        freeze_at("2026-09-17T19:00:00")
        client.get("/profile/me", headers=H(u))
        db.expire_all()
        assert db.get(models.User, u.id).last_active == datetime(2026, 9, 17, 19, 0)

    def test_no_user_update_same_zone_same_local_day(self, client, db, freeze_at, stmt_counter):
        u = _make_user(db, email="4c-l5@example.com")
        _set_zone(db, u, "Asia/Kolkata")
        freeze_at("2026-09-18T05:00:00")
        client.get("/profile/me", headers=H(u, "Asia/Kolkata"))
        freeze_at("2026-09-18T12:00:00")
        stmt_counter.reset()
        client.get("/profile/me", headers=H(u, "Asia/Kolkata"))
        assert stmt_counter.updates_user == 0


# ══════════════════════════════════════════════════════════════════════════
# 2.4 Where a day's reading lands — TestProgressLabel (R-01, R-02, R-05)
# ══════════════════════════════════════════════════════════════════════════

class TestProgressLabel:
    def test_progress_labelled_local_day_ist_after_midnight(self, client, db, freeze_at):
        frozen = freeze_at("2026-09-17T19:00:00")
        u = _make_user(db, email="4c-p1@example.com")
        ub = _add_book(client, H(u, "Asia/Kolkata"), title="4c-p1")
        r = client.put(f"/userbooks/{ub}/progress", json={"current_page": 10}, headers=H(u, "Asia/Kolkata"))
        assert r.status_code == 200
        assert set(r.json().keys()) == {"id", "status", "current_page", "rating", "updated_at"}
        assert r.json()["updated_at"].startswith("2026-09-17T19:00:00")
        db.expire_all()
        rows = db.exec(select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).all()
        assert len(rows) == 1
        row = rows[0]
        assert row.date == datetime(2026, 9, 18)
        assert row.local_day is True
        assert row.created_at == frozen
        assert row.pages_read == 10

    def test_progress_same_instant_ny_and_utc_label_utc_day(self, client, db, freeze_at):
        freeze_at("2026-09-17T19:00:00")
        ny = _make_user(db, email="4c-p2-ny@example.com")
        utc = _make_user(db, email="4c-p2-utc@example.com")
        for u, zone in ((ny, "America/New_York"), (utc, "UTC")):
            ub = _add_book(client, H(u, zone), title=f"4c-p2-{zone}")
            client.put(f"/userbooks/{ub}/progress", json={"current_page": 5}, headers=H(u, zone))
            db.expire_all()
            row = db.exec(select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).first()
            assert row.date == datetime(2026, 9, 17)

    def test_progress_merges_across_utc_midnight(self, client, db, freeze_at):
        u = _make_user(db, email="4c-p3@example.com")
        freeze_at("2026-09-17T19:00:00")
        ub = _add_book(client, H(u, "Asia/Kolkata"), title="4c-p3")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 10}, headers=H(u, "Asia/Kolkata"))
        freeze_at("2026-09-18T18:00:00")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 15}, headers=H(u, "Asia/Kolkata"))
        db.expire_all()
        rows = db.exec(select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).all()
        assert len(rows) == 1
        assert rows[0].date == datetime(2026, 9, 18)
        assert rows[0].pages_read == 15

    def test_progress_splits_at_local_midnight(self, client, db, freeze_at):
        u = _make_user(db, email="4c-p4@example.com")
        freeze_at("2026-09-18T18:29:00")
        ub = _add_book(client, H(u, "Asia/Kolkata"), title="4c-p4")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 5}, headers=H(u, "Asia/Kolkata"))
        freeze_at("2026-09-18T18:31:00")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 10}, headers=H(u, "Asia/Kolkata"))
        db.expire_all()
        rows = sorted(
            db.exec(select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).all(),
            key=lambda r: r.date,
        )
        assert len(rows) == 2
        assert rows[0].date == datetime(2026, 9, 18) and rows[0].pages_read == 5
        assert rows[1].date == datetime(2026, 9, 19) and rows[1].pages_read == 5

    def test_progress_never_merges_into_future_row(self, client, db, freeze_at):
        u = _make_user(db, email="4c-p5@example.com")
        freeze_at("2026-09-18T20:00:00")
        ub = _add_book(client, H(u, "America/New_York"), title="4c-p5", current_page=5)
        _seed(db, u.id, ub, _d(2026, 9, 19), pages=5, local_day=None)
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 12}, headers=H(u, "America/New_York"))
        db.expire_all()
        rows = {r.date: r for r in db.exec(
            select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).all()}
        assert len(rows) == 2
        new_row = rows[datetime(2026, 9, 18)]
        assert (new_row.pages_read, new_row.local_day) == (7, True)
        old_row = rows[datetime(2026, 9, 19)]
        assert (old_row.pages_read, old_row.local_day) == (5, None)

    def test_progress_merges_into_same_label_old_row(self, client, db, freeze_at):
        u = _make_user(db, email="4c-p6@example.com")
        freeze_at("2026-09-18T10:00:00")
        ub = _add_book(client, H(u, "Asia/Kolkata"), title="4c-p6", current_page=4)
        old = _seed(db, u.id, ub, _d(2026, 9, 18), pages=4, local_day=None)
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 8}, headers=H(u, "Asia/Kolkata"))
        db.expire_all()
        rows = db.exec(select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).all()
        assert len(rows) == 1
        assert rows[0].id == old.id
        assert rows[0].pages_read == 8
        assert rows[0].local_day is None

    def test_progress_west_of_utc_is_not_tomorrow(self, client, db, freeze_at):
        u = _make_user(db, email="4c-p7@example.com")
        freeze_at("2026-09-19T03:00:00")
        ub = _add_book(client, H(u, "America/Los_Angeles"), title="4c-p7")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 10}, headers=H(u, "America/Los_Angeles"))
        db.expire_all()
        row = db.exec(select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).first()
        assert row.date == datetime(2026, 9, 18)

    def test_progress_nepal_offset_splits_at_local_midnight(self, client, db, freeze_at):
        u = _make_user(db, email="4c-p8@example.com")
        freeze_at("2026-09-18T18:14:00")
        ub = _add_book(client, H(u, "Asia/Kathmandu"), title="4c-p8")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 5}, headers=H(u, "Asia/Kathmandu"))
        freeze_at("2026-09-18T18:15:00")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 10}, headers=H(u, "Asia/Kathmandu"))
        db.expire_all()
        dates = sorted(r.date for r in db.exec(
            select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).all())
        assert dates == [datetime(2026, 9, 18), datetime(2026, 9, 19)]

    def test_progress_dst_repeated_midnight_hour_merges(self, client, db, freeze_at):
        u = _make_user(db, email="4c-p9@example.com")
        freeze_at("2026-04-05T02:30:00")
        ub = _add_book(client, H(u, "America/Santiago"), title="4c-p9")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 5}, headers=H(u, "America/Santiago"))
        freeze_at("2026-04-05T03:30:00")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 10}, headers=H(u, "America/Santiago"))
        db.expire_all()
        rows = db.exec(select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).all()
        assert len(rows) == 1
        assert rows[0].date == datetime(2026, 4, 4)
        assert rows[0].pages_read == 10

    def test_progress_dst_23_hour_day_is_one_label(self, client, db, freeze_at):
        u = _make_user(db, email="4c-p10@example.com")
        freeze_at("2026-03-08T05:00:00")
        ub = _add_book(client, H(u, "America/New_York"), title="4c-p10")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 5}, headers=H(u, "America/New_York"))
        freeze_at("2026-03-09T03:59:00")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 10}, headers=H(u, "America/New_York"))
        db.expire_all()
        rows = db.exec(select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).all()
        assert len(rows) == 1
        assert rows[0].date == datetime(2026, 3, 8)
        assert rows[0].pages_read == 10

    def test_progress_ownership_unchanged_with_header(self, client, db):
        a = _make_user(db, email="4c-p11a@example.com")
        b = _make_user(db, email="4c-p11b@example.com")
        ub = _add_book(client, H(a), title="4c-p11", current_page=3)
        r = client.put(f"/userbooks/{ub}/progress", json={"current_page": 50}, headers=H(b, "Asia/Tokyo"))
        assert r.status_code == 404
        assert r.json() == {"detail": "UserBook not found"}
        db.expire_all()
        assert db.get(models.UserBook, ub).current_page == 3
        assert db.exec(select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).all() == []
        assert db.get(models.User, a.id).timezone is None


# ══════════════════════════════════════════════════════════════════════════
# 2.5 Every "today" read — TestReadDays (R-03, R-04)
# ══════════════════════════════════════════════════════════════════════════

class TestReadDays:
    def test_daily_ends_at_callers_local_today(self, client, db, freeze_at):
        freeze_at("2026-09-17T19:00:00")
        ist = _make_user(db, email="4c-r1-ist@example.com")
        ny = _make_user(db, email="4c-r1-ny@example.com")
        ri = client.get("/reading-activity/daily?days=2", headers=H(ist, "Asia/Kolkata"))
        rn = client.get("/reading-activity/daily?days=2", headers=H(ny, "America/New_York"))
        assert [d["date"] for d in ri.json()["data"]] == ["2026-09-17", "2026-09-18"]
        assert [d["date"] for d in rn.json()["data"]] == ["2026-09-16", "2026-09-17"]

    def test_user_daily_ends_at_subjects_today(self, client, db, freeze_at):
        freeze_at("2026-09-17T19:00:00")
        s = _make_user(db, email="4c-r2-s@example.com")
        _set_zone(db, s, "Asia/Kolkata")
        v = _make_user(db, email="4c-r2-v@example.com")
        r = client.get(f"/reading-activity/user/{s.id}/daily?days=2", headers=H(v, "America/New_York"))
        assert r.json()["data"][-1]["date"] == "2026-09-18"
        r_own = client.get("/reading-activity/daily?days=2", headers=H(v, "America/New_York"))
        assert r_own.json()["data"][-1]["date"] == "2026-09-17"

    def test_insights_finished_this_year_local_year(self, client, db, freeze_at):
        ist = _make_user(db, email="4c-r3-ist@example.com")
        utc = _make_user(db, email="4c-r3-utc@example.com")
        for u, zone in ((ist, "Asia/Kolkata"), (utc, "UTC")):
            ub = _add_book(client, H(u, zone), title=f"4c-r3-{zone}", status="finished")
            row = db.get(models.UserBook, ub)
            row.updated_at = datetime(2026, 12, 31, 20, 0)
            db.add(row)
            db.commit()
        freeze_at("2027-01-01T02:00:00")
        ri = client.get("/reading-activity/insights", headers=H(ist, "Asia/Kolkata"))
        ru = client.get("/reading-activity/insights", headers=H(utc, "UTC"))
        assert ri.json()["finished_this_year"] == 1 and ri.json()["books_this_year"] == 1
        assert ru.json()["finished_this_year"] == 0 and ru.json()["books_this_year"] == 0

    def test_user_stats_this_year_uses_subjects_zone(self, client, db, freeze_at):
        s1 = _make_user(db, email="4c-r4-s1@example.com")
        _set_zone(db, s1, "Asia/Kolkata")
        s2 = _make_user(db, email="4c-r4-s2@example.com")
        _set_zone(db, s2, "UTC")
        for s in (s1, s2):
            ub = _add_book(client, H(s), title=f"4c-r4-{s.id}", status="finished")
            row = db.get(models.UserBook, ub)
            row.updated_at = datetime(2026, 12, 31, 20, 0)
            db.add(row)
            db.commit()
        v1 = _make_user(db, email="4c-r4-v1@example.com")
        v2 = _make_user(db, email="4c-r4-v2@example.com")
        freeze_at("2027-01-01T02:00:00")
        r1 = client.get(f"/users/{s1.id}/stats", headers=H(v1, "UTC"))
        r2 = client.get(f"/users/{s2.id}/stats", headers=H(v2, "Asia/Kolkata"))
        assert r1.json()["this_year"] == 1
        assert r2.json()["this_year"] == 0
        assert r1.json()["last_month"] == 1
        assert r2.json()["last_month"] == 1

    def test_projected_finish_counts_from_local_today(self, client, db, freeze_at):
        freeze_at("2026-09-17T19:00:00")
        ist = _make_user(db, email="4c-r5-ist@example.com")
        utc = _make_user(db, email="4c-r5-utc@example.com")
        for u, zone in ((ist, "Asia/Kolkata"), (utc, "UTC")):
            ub = _add_book(client, H(u, zone), title=f"4c-r5-{zone}", pages=300, current_page=0)
            row = db.get(models.UserBook, ub)
            row.current_page = 100
            db.add(row)
            db.commit()
            _seed(db, u.id, ub, _d(2026, 9, 18), pages=300, local_day=True)
        ri = client.get("/reading-activity/insights", headers=H(ist, "Asia/Kolkata"))
        ru = client.get("/reading-activity/insights", headers=H(utc, "UTC"))
        pi = ri.json()["projected_finishes"][0]
        pu = ru.json()["projected_finishes"][0]
        assert pi["projected_finish"] == "2026-10-08" and pi["days_left"] == 20
        assert pu["projected_finish"] == "2026-10-07"

    def test_monthly_pages_ends_at_local_month(self, client, db, freeze_at):
        freeze_at("2026-09-30T19:00:00")
        ist = _make_user(db, email="4c-r6-ist@example.com")
        utc = _make_user(db, email="4c-r6-utc@example.com")
        for u, zone in ((ist, "Asia/Kolkata"), (utc, "UTC")):
            ri = client.get("/reading-activity/insights", headers=H(u, zone))
            months = ri.json()["monthly_pages"]
            assert set(months[-1].keys()) == {"month", "pages_read"}
            if zone == "Asia/Kolkata":
                assert months[-1]["month"] == "2026-10"
            else:
                assert months[-1]["month"] == "2026-09"

    def test_on_track_uses_local_day_of_year(self, client, db, freeze_at):
        ist = _make_user(db, email="4c-r7-ist@example.com")
        utc = _make_user(db, email="4c-r7-utc@example.com")
        for u in (ist, utc):
            u.yearly_goal = 12
            db.add(u)
            db.commit()
        freeze_at("2026-12-31T20:00:00")
        ri = client.get("/reading-activity/insights", headers=H(ist, "Asia/Kolkata"))
        ru = client.get("/reading-activity/insights", headers=H(utc, "UTC"))
        assert ri.json()["yearly_goal"]["on_track"] is True
        assert ru.json()["yearly_goal"]["on_track"] is False

    def test_avg_pages_30_day_window_local(self, client, db, freeze_at):
        freeze_at("2026-09-17T19:00:00")
        ist = _make_user(db, email="4c-r8-ist@example.com")
        utc = _make_user(db, email="4c-r8-utc@example.com")
        for u, zone in ((ist, "Asia/Kolkata"), (utc, "UTC")):
            ub = _add_book(client, H(u, zone), title=f"4c-r8-{zone}")
            _seed(db, u.id, ub, _d(2026, 8, 19), pages=30, local_day=True)
            _seed(db, u.id, ub, _d(2026, 8, 18), pages=300, local_day=True)
        ri = client.get("/reading-activity/insights", headers=H(ist, "Asia/Kolkata"))
        ru = client.get("/reading-activity/insights", headers=H(utc, "UTC"))
        assert ri.json()["avg_pages_per_day"] == 1.0
        assert ru.json()["avg_pages_per_day"] == 11.0

    def test_user_daily_privacy_gate_unchanged(self, client, db):
        s = _make_user(db, email="4c-r9-s@example.com")
        s.is_private_profile = True
        db.add(s)
        db.commit()
        w = _make_user(db, email="4c-r9-w@example.com")
        f = _make_user(db, email="4c-r9-f@example.com")
        client.post(f"/follow/{s.id}", headers=H(f))
        rw = client.get(f"/reading-activity/user/{s.id}/daily", headers=H(w, "Asia/Tokyo"))
        rf = client.get(f"/reading-activity/user/{s.id}/daily", headers=H(f, "Asia/Tokyo"))
        rs = client.get(f"/reading-activity/user/{s.id}/daily", headers=H(s, "Asia/Tokyo"))
        assert rw.status_code == 403 and rw.json() == {"detail": "This profile is private"}
        assert rf.status_code == 200
        assert rs.status_code == 200

    def test_user_stats_privacy_gate_unchanged(self, client, db):
        s = _make_user(db, email="4c-r10-s@example.com")
        s.is_private_profile = True
        db.add(s)
        db.commit()
        w = _make_user(db, email="4c-r10-w@example.com")
        f = _make_user(db, email="4c-r10-f@example.com")
        client.post(f"/follow/{s.id}", headers=H(f))
        rw = client.get(f"/users/{s.id}/stats", headers=H(w))
        rf = client.get(f"/users/{s.id}/stats", headers=H(f))
        assert rw.status_code == 403
        assert rf.status_code == 200


# ══════════════════════════════════════════════════════════════════════════
# 2.6 The cut-over bridge (E-2, R-06) — TestCutoverBridge
# ══════════════════════════════════════════════════════════════════════════

class TestCutoverBridge:
    def test_cutover_bridge_unit(self):
        from app.routers.reading_activity_router import _cutover_bridge
        d = _d(2026, 9, 16)
        assert _cutover_bridge(set(), {d}) == set()
        assert _cutover_bridge({d}, set()) == set()
        assert _cutover_bridge({_d(2026, 9, 15)}, {_d(2026, 9, 16)}) == set()          # gap 1
        assert _cutover_bridge({_d(2026, 9, 14)}, {_d(2026, 9, 16)}) == {_d(2026, 9, 15)}  # gap 2
        assert _cutover_bridge({_d(2026, 9, 13)}, {_d(2026, 9, 16)}) == set()          # gap 3
        assert _cutover_bridge({_d(2026, 9, 18)}, {_d(2026, 9, 16)}) == set()          # min(new) < max(old)

    def _ub(self, client, u, zone="Asia/Kolkata"):
        return _add_book(client, H(u, zone), title=f"4c-bridge-{u.id}")

    def test_bridge_fills_the_one_cutover_day(self, client, db, freeze_at):
        u = _make_user(db, email="4c-b1@example.com")
        _set_zone(db, u, "Asia/Kolkata")
        ub = self._ub(client, u)
        for day, ld in ((14, None), (15, None), (16, None)):
            _seed(db, u.id, ub, _d(2026, 9, day), 10, ld)
        _seed(db, u.id, ub, _d(2026, 9, 18), 10, True)
        freeze_at("2026-09-18T10:00:00")
        r = client.get("/reading-activity/insights", headers=H(u, "Asia/Kolkata"))
        assert r.json()["current_streak"] == 5
        assert r.json()["longest_streak"] == 5

    def test_no_bridge_across_three_day_gap(self, client, db, freeze_at):
        u = _make_user(db, email="4c-b2@example.com")
        ub = self._ub(client, u)
        _seed(db, u.id, ub, _d(2026, 9, 15), 10, None)
        _seed(db, u.id, ub, _d(2026, 9, 18), 10, True)
        freeze_at("2026-09-18T10:00:00")
        r = client.get("/reading-activity/insights", headers=H(u, "Asia/Kolkata"))
        assert r.json()["current_streak"] == 1
        assert r.json()["longest_streak"] == 1

    def test_no_bridge_between_two_new_rows(self, client, db, freeze_at):
        u = _make_user(db, email="4c-b3@example.com")
        ub = self._ub(client, u)
        _seed(db, u.id, ub, _d(2026, 9, 16), 10, True)
        _seed(db, u.id, ub, _d(2026, 9, 18), 10, True)
        freeze_at("2026-09-18T10:00:00")
        r = client.get("/reading-activity/insights", headers=H(u, "Asia/Kolkata"))
        assert r.json()["current_streak"] == 1
        assert r.json()["longest_streak"] == 1

    def test_no_bridge_without_new_rows(self, client, db, freeze_at):
        u = _make_user(db, email="4c-b4@example.com")
        ub = self._ub(client, u)
        _seed(db, u.id, ub, _d(2026, 9, 16), 10, None)
        freeze_at("2026-09-18T10:00:00")
        r = client.get("/reading-activity/insights", headers=H(u, "Asia/Kolkata"))
        assert r.json()["current_streak"] == 0
        assert r.json()["longest_streak"] == 1

    def test_bridge_touches_streaks_only(self, client, db, freeze_at):
        u = _make_user(db, email="4c-b5@example.com")
        ub = self._ub(client, u)
        for day, ld in ((14, None), (15, None), (16, None)):
            _seed(db, u.id, ub, _d(2026, 9, day), 10, ld)
        _seed(db, u.id, ub, _d(2026, 9, 18), 10, True)
        freeze_at("2026-09-18T10:00:00")
        daily = client.get("/reading-activity/daily?days=7", headers=H(u, "Asia/Kolkata")).json()["data"]
        by_date = {d["date"]: d["pages_read"] for d in daily}
        assert by_date["2026-09-17"] == 0
        insights = client.get("/reading-activity/insights", headers=H(u, "Asia/Kolkata")).json()
        month = [m for m in insights["monthly_pages"] if m["month"] == "2026-09"][0]
        assert month["pages_read"] == 40
        assert insights["avg_pages_per_day"] == 1.3

    def test_future_row_west_excluded_from_today_and_streaks(self, client, db, freeze_at):
        u = _make_user(db, email="4c-b6@example.com")
        ub = self._ub(client, u, zone="America/New_York")
        _seed(db, u.id, ub, _d(2026, 9, 19), 5, None)
        _seed(db, u.id, ub, _d(2026, 9, 18), 7, True)
        freeze_at("2026-09-18T20:00:00")
        insights = client.get("/reading-activity/insights", headers=H(u, "America/New_York")).json()
        assert insights["current_streak"] == 1
        assert insights["longest_streak"] == 1
        daily = client.get("/reading-activity/daily?days=3", headers=H(u, "America/New_York")).json()["data"]
        dates = [d["date"] for d in daily]
        assert "2026-09-19" not in dates
        assert daily[-1] == {"date": "2026-09-18", "pages_read": 7}
        month = [m for m in insights["monthly_pages"] if m["month"] == "2026-09"][0]
        assert month["pages_read"] == 12

    def test_bridge_at_most_once(self, client, db, freeze_at):
        u = _make_user(db, email="4c-b7@example.com")
        ub = self._ub(client, u)
        for day in (10, 11, 12):
            _seed(db, u.id, ub, _d(2026, 9, day), 10, None)
        for day in (14, 16, 17):
            _seed(db, u.id, ub, _d(2026, 9, day), 10, True)
        freeze_at("2026-09-17T10:00:00")
        r = client.get("/reading-activity/insights", headers=H(u, "Asia/Kolkata")).json()
        assert r["current_streak"] == 2
        assert r["longest_streak"] == 5


# ══════════════════════════════════════════════════════════════════════════
# 2.7 Travel (D-7, E-6) — TestTravel
# ══════════════════════════════════════════════════════════════════════════

class TestTravel:
    def test_flying_west_new_row_and_future_row_excluded(self, client, db, freeze_at):
        u = _make_user(db, email="4c-t1@example.com")
        freeze_at("2026-09-18T19:00:00")
        ub = _add_book(client, H(u, "Asia/Kolkata"), title="4c-t1")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 5}, headers=H(u, "Asia/Kolkata"))
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 8}, headers=H(u, "Europe/London"))
        db.expire_all()
        rows = {r.date: r for r in db.exec(
            select(models.ReadingActivity).where(models.ReadingActivity.userbook_id == ub)).all()}
        assert len(rows) == 2
        assert (rows[datetime(2026, 9, 19)].pages_read, rows[datetime(2026, 9, 19)].local_day) == (5, True)
        assert (rows[datetime(2026, 9, 18)].pages_read, rows[datetime(2026, 9, 18)].local_day) == (3, True)
        daily = client.get("/reading-activity/daily?days=2", headers=H(u, "Europe/London")).json()["data"]
        assert daily == [{"date": "2026-09-17", "pages_read": 0}, {"date": "2026-09-18", "pages_read": 3}]
        insights = client.get("/reading-activity/insights", headers=H(u, "Europe/London")).json()
        assert insights["current_streak"] == 1
        assert sum(r.pages_read for r in rows.values()) == 8

    def test_flying_east_gap_not_forgiven(self, client, db, freeze_at):
        u = _make_user(db, email="4c-t2@example.com")
        freeze_at("2026-09-17T02:00:00")
        ub = _add_book(client, H(u, "America/New_York"), title="4c-t2")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 5}, headers=H(u, "America/New_York"))
        freeze_at("2026-09-18T15:00:00")
        client.put(f"/userbooks/{ub}/progress", json={"current_page": 15}, headers=H(u, "Asia/Kolkata"))
        r = client.get("/reading-activity/insights", headers=H(u, "Asia/Kolkata")).json()
        assert r["current_streak"] == 1
        assert r["longest_streak"] == 1
        db.expire_all()
        assert db.get(models.User, u.id).timezone == "Asia/Kolkata"


# ══════════════════════════════════════════════════════════════════════════
# 2.9 Schema guard — TestSchemaGuard (R-14)
# ══════════════════════════════════════════════════════════════════════════

class _StubEngine:
    def __init__(self, dialect_name, rows=None, connect_error=None):
        self.dialect = SimpleNamespace(name=dialect_name)
        self._rows = rows or []
        self._connect_error = connect_error
        self.connect_calls = 0

    def connect(self):
        self.connect_calls += 1
        if self._connect_error:
            raise self._connect_error
        rows = self._rows

        class _Conn:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *a):
                return False

            def execute(self_inner, *a, **k):
                class _Result:
                    def all(self_r):
                        return rows
                return _Result()

        return _Conn()


class TestSchemaGuard:
    def test_guard_skips_sqlite_without_query(self):
        from app.schema_guard import assert_migrated
        eng = _StubEngine("sqlite")
        assert_migrated(eng)
        assert eng.connect_calls == 0

    def test_guard_raises_naming_missing_column(self):
        from app.schema_guard import assert_migrated
        eng = _StubEngine("postgresql", rows=[("user", "timezone"), ("reading_activity", "id")])
        with pytest.raises(RuntimeError) as exc:
            assert_migrated(eng)
        msg = str(exc.value)
        assert "reading_activity.local_day" in msg
        assert "user.timezone" not in msg
        assert "supabase_migration.sql" in msg
        assert eng.connect_calls == 1

    def test_guard_passes_when_both_present(self):
        from app.schema_guard import assert_migrated
        eng = _StubEngine("postgresql", rows=[("user", "timezone"), ("reading_activity", "local_day")])
        assert assert_migrated(eng) is None

    def test_guard_fails_open_on_db_error(self, capsys):
        from app.schema_guard import assert_migrated
        from sqlalchemy.exc import OperationalError
        err = OperationalError("postgresql://user:SECRET@host", {}, Exception("boom"))
        eng = _StubEngine("postgresql", connect_error=err)
        assert_migrated(eng)
        out = capsys.readouterr().out
        assert "[schema_guard] check skipped: OperationalError" in out
        assert "SECRET" not in out and "postgresql://" not in out and "host" not in out

    def test_localday_refuses_import_without_tz_database(self):
        code = (
            "import zoneinfo; zoneinfo.available_timezones = lambda: set(); import app.localday"
        )
        r = subprocess.run(
            [sys.executable, "-c", code],
            cwd=REPO_ROOT, env={**os.environ, "SECRET_KEY": "x"},
            capture_output=True, text=True,
        )
        assert r.returncode != 0
        assert "IANA tz database unavailable" in r.stderr

        control = subprocess.run(
            [sys.executable, "-c", "import app.localday"],
            cwd=REPO_ROOT, env={**os.environ, "SECRET_KEY": "x"},
            capture_output=True, text=True,
        )
        assert control.returncode == 0

    def test_startup_refuses_before_scheduler_when_column_missing(self, monkeypatch):
        import app.database as appdb
        from fastapi.testclient import TestClient
        from app.main import app as fastapi_app
        import app.notifications.scheduler as sched_mod

        bad_engine = _StubEngine("postgresql", rows=[("user", "timezone"), ("reading_activity", "id")])
        calls = []
        monkeypatch.setattr(appdb, "engine", bad_engine)
        monkeypatch.setattr(sched_mod, "start_scheduler", lambda: calls.append(1))
        with pytest.raises(RuntimeError):
            with TestClient(fastapi_app):
                pass
        assert calls == []

        good_engine = _StubEngine("postgresql", rows=[("user", "timezone"), ("reading_activity", "local_day")])
        monkeypatch.setattr(appdb, "engine", good_engine)
        with TestClient(fastapi_app):
            pass
        assert calls == [1]

    def test_required_columns_match_models(self):
        from app.schema_guard import REQUIRED_COLUMNS
        from sqlmodel import SQLModel
        assert ("user", "timezone") in REQUIRED_COLUMNS
        assert ("reading_activity", "local_day") in REQUIRED_COLUMNS
        tables = SQLModel.metadata.tables
        for tname, cname in REQUIRED_COLUMNS:
            assert cname in tables[tname].columns
        length = models.User.__table__.c.timezone.type.length
        assert length in (None, 64)


# ══════════════════════════════════════════════════════════════════════════
# 2.10 Static rules — TestStaticRules
# ══════════════════════════════════════════════════════════════════════════

_BANNED_CALLS = {
    ("date", "today"), ("datetime", "today"), ("datetime", "now"),
    ("time", "localtime"), ("time", "mktime"),
}
_BANNED_ONE_ARG = {("datetime", "fromtimestamp"), ("date", "fromtimestamp")}


def _find_banned_clock_calls(tree):
    hits = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            owner = node.func.value
            owner_name = owner.id if isinstance(owner, ast.Name) else getattr(owner, "attr", None)
            key = (owner_name, node.func.attr)
            if key in _BANNED_CALLS and not node.args and not node.keywords:
                hits.append((node.func.attr, node.lineno))
            if key in _BANNED_ONE_ARG and len(node.args) == 1:
                hits.append((node.func.attr, node.lineno))
            if node.func.attr == "mktime":
                hits.append((node.func.attr, node.lineno))
    return hits


class TestStaticRules:
    def test_app_never_reads_a_local_clock(self):
        app_dir = os.path.join(REPO_ROOT, "app")
        walked = 0
        violations = []
        for root, _dirs, files in os.walk(app_dir):
            for fname in files:
                if not fname.endswith(".py") or fname.endswith(".bak"):
                    continue
                path = os.path.join(root, fname)
                walked += 1
                with open(path, "r", encoding="utf-8") as f:
                    src = f.read()
                tree = ast.parse(src, filename=path)
                for _name, lineno in _find_banned_clock_calls(tree):
                    violations.append((path, lineno))
        assert walked >= 35   # measured 37 .py files under app/ on this tree (K-nn)
        assert violations == []

        # Non-vacuity control: the detector finds exactly 2 hits on a synthetic positive.
        snippet = "from datetime import date\nx = date.today()\ny = datetime.now()\n"
        control_hits = _find_banned_clock_calls(ast.parse(snippet))
        assert len(control_hits) == 2

    def _utcnow_import_hits(self, tree):
        """A `from <...>localday import utcnow`, at any relative-import depth."""
        hits = []
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom):
                continue
            module = node.module or ""
            is_localday = module == "app.localday" or module == "localday" or module.endswith(".localday")
            if is_localday:
                for alias in node.names:
                    if alias.name == "utcnow":
                        hits.append((getattr(node, "lineno", None),))
        return hits

    def test_localday_utcnow_never_copied(self):
        app_dir = os.path.join(REPO_ROOT, "app")
        hits = []
        for root, _dirs, files in os.walk(app_dir):
            for fname in files:
                if not fname.endswith(".py") or fname.endswith(".bak"):
                    continue
                path = os.path.join(root, fname)
                with open(path, "r", encoding="utf-8") as f:
                    tree = ast.parse(f.read(), filename=path)
                for _lineno in self._utcnow_import_hits(tree):
                    hits.append((path, _lineno))
        assert hits == []

        control_tree = ast.parse("from ..localday import utcnow\n")
        assert len(self._utcnow_import_hits(control_tree)) == 1

    def test_seam_used_in_every_4c_path(self):
        targets = {
            "update_progress": os.path.join(REPO_ROOT, "app", "routers", "userbooks_router.py"),
            "get_daily_reading_stats": os.path.join(REPO_ROOT, "app", "routers", "reading_activity_router.py"),
            "get_reading_insights": os.path.join(REPO_ROOT, "app", "routers", "reading_activity_router.py"),
            "get_user_daily_reading_stats": os.path.join(REPO_ROOT, "app", "routers", "reading_activity_router.py"),
            "get_user_stats": os.path.join(REPO_ROOT, "app", "routers", "users_router.py"),
            "get_current_user": os.path.join(REPO_ROOT, "app", "deps.py"),
            "google_auth": os.path.join(REPO_ROOT, "app", "routers", "auth_router.py"),
            "review_login": os.path.join(REPO_ROOT, "app", "routers", "auth_router.py"),
            "_check_daily_cap": os.path.join(REPO_ROOT, "app", "notifications", "dispatcher.py"),
            "fire_event": os.path.join(REPO_ROOT, "app", "notifications", "dispatcher.py"),
            "_send_inactivity_reminders": os.path.join(REPO_ROOT, "app", "notifications", "scheduler.py"),
        }
        found = []
        violations = []
        by_file = {}
        for name, path in targets.items():
            by_file.setdefault(path, []).append(name)
        for path, names in by_file.items():
            with open(path, "r", encoding="utf-8") as f:
                tree = ast.parse(f.read(), filename=path)
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef) and node.name in names:
                    found.append(node.name)
                    for inner in ast.walk(node):
                        if (isinstance(inner, ast.Call) and isinstance(inner.func, ast.Attribute)
                                and inner.func.attr == "utcnow"
                                and isinstance(inner.func.value, ast.Name) and inner.func.value.id == "datetime"):
                            violations.append(node.name)
        # deps.py briefly has an unrelated dead placeholder also named get_current_user
        # (pre-existing, out of scope) — dedupe rather than assume one def per name.
        assert sorted(set(found)) == sorted(targets.keys())
        assert violations == []

    def test_tzdata_pinned_utf16_requirements(self):
        path = os.path.join(REPO_ROOT, "requirements.txt")
        with open(path, "r", encoding="utf-16") as f:
            content = f.read()
        lines = content.splitlines()
        assert len(lines) >= 5
        assert "fastapi==0.95.2" in lines
        assert "tzdata==2026.2" in lines
        with open(path, "rb") as f:
            assert f.read(2) == b"\xff\xfe"
        legacy_path = os.path.join(REPO_ROOT, "requirements.txt.txt")
        with open(legacy_path, "r", encoding="utf-8") as f:
            assert "tzdata" not in f.read()


# ══════════════════════════════════════════════════════════════════════════
# 2.11 Clock independence (R-16, K-02, K-03) — TestClockIndependence
# ══════════════════════════════════════════════════════════════════════════

_TZ_OFFSETS = {
    "UTC0": 0, "IST-5:30": 19800, "PST8PDT": -25200, "LIN-14": 50400, "BIT+12": -43200,
}


class TestClockIndependence:
    """Both cases spawn a nested `pytest -k "not TestClockIndependence"` subprocess — being
    inside this class is what makes that filter actually exclude them from their own nested
    run. (A first draft left them as bare module functions: the filter then matched nothing,
    and each nested run re-collected and re-spawned this same test, recursively, without
    bound. Caught by a runaway process count during this build — see Diverged From Brief.)"""

    @pytest.mark.parametrize("tz", list(_TZ_OFFSETS))
    def test_subset_passes_under_tz(self, tz):
        expected_offset = _TZ_OFFSETS[tz]
        env = {**os.environ, "TZ": tz, "SECRET_KEY": "test-secret-key-for-pytest-only-not-production"}
        control = subprocess.run(
            [sys.executable, "-c", "import time; print(time.localtime().tm_gmtoff)"],
            cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=30,
        )
        actual = control.stdout.strip()
        if actual != str(expected_offset):
            pytest.fail(f"TZ={tz} not applied — this case would test nothing (K-02); got {actual!r}")

        targets = ["tests/test_local_day.py", "tests/test_scheduler.py", "tests/test_auth.py::TestReviewLogin"]
        collect = subprocess.run(
            [sys.executable, "-m", "pytest", *targets, "-q", "-p", "no:cacheprovider",
             "-k", "not TestClockIndependence", "--collect-only", "-q"],
            cwd=REPO_ROOT, env={**os.environ, "SECRET_KEY": env["SECRET_KEY"]}, capture_output=True,
            text=True, timeout=60,
        )
        collected_line = [l for l in collect.stdout.splitlines() if "test" in l.lower() and ("collected" in l.lower() or "/" in l)]
        run = subprocess.run(
            [sys.executable, "-m", "pytest", *targets, "-q", "-p", "no:cacheprovider", "-k", "not TestClockIndependence"],
            cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=300,
        )
        assert run.returncode == 0, run.stdout[-3000:] + run.stderr[-2000:]
        tail = run.stdout.strip().splitlines()[-1] if run.stdout.strip() else ""
        assert "passed" in tail and "failed" not in tail
        n_passed = int(tail.split()[0])
        assert n_passed >= 120

    def test_extreme_zones_reproduce_f62_now(self):
        code = "from datetime import date, datetime; print(date.today() != datetime.utcnow().date())"
        saw_true = False
        for tz in ("LIN-14", "BIT+12"):
            r = subprocess.run(
                [sys.executable, "-c", code], cwd=REPO_ROOT,
                env={**os.environ, "TZ": tz}, capture_output=True, text=True, timeout=30,
            )
            if r.stdout.strip() == "True":
                saw_true = True
        assert saw_true
