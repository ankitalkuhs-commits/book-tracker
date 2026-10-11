"""Sprint 4I-A — the report API (packages P1-A and P2).

Case ids are tests.md's: S-20..S-22 (the table and the guard), S-01..S-19 with their letter
suffixes (the route, the queue, the notification) and S-24 (the cascade). S-23 lives in
tests/test_sql_artifacts.py, beside the other PM-SQL cases.

S-25 is this file's own id and is NOT in tests.md: pm-decisions.md's addendum (Q-2) adds a
server-enforced cap of 20 reports per reporter per 24 hours, which supersedes spec R-09's "no
rate limiter". The QA plan was written before that decision, so the cap would otherwise ship
untested.

Every case names the one-line product change that must turn it red, in a comment on the
assertion it protects (the house rule; MUT-4I-xx ids are tests.md section 14's).

Import guard (tests.md non-vacuity rule 5 / K-4I-07): every symbol this file needs is asserted
at module scope, so a missing or renamed symbol is ONE loud collection error and never N silent
skips. `pytest tests/test_reports.py` against a tree without the router is a collection error,
which is the red-first baseline — never `0 passed`.
"""
import asyncio
import json as _json
from datetime import datetime, timedelta

import pytest
from fastapi.routing import APIRoute
from sqlalchemy.exc import IntegrityError
from sqlmodel import func, select

from app import models, schema_guard
from app.deps import deny_bot_actor
from app.main import app
from app.models import Report
from app.notifications.config import NOTIFICATION_EVENTS
from app.routers import admin_router, reports_router
from tests.conftest import _auth, _make_user

# ── Import guard ─────────────────────────────────────────────────────────────
assert callable(reports_router.create_report)
assert callable(admin_router.list_reports)
assert callable(admin_router.resolve_report)
assert "content_reported" in NOTIFICATION_EVENTS, "P2 has not registered the event"
assert hasattr(Report, "target_snapshot"), "P1-A has not added the column"
assert hasattr(Report, "__table__")
assert isinstance(schema_guard.REQUIRED_COLUMNS, tuple)
assert isinstance(reports_router.REASONS, tuple) and isinstance(reports_router.TARGET_TYPES, tuple)
assert isinstance(reports_router.REPORT_MAX_PER_DAY, int)

REASONS = reports_router.REASONS
TARGET_TYPES = reports_router.TARGET_TYPES


# ── Helpers ──────────────────────────────────────────────────────────────────

def _count(db, model_cls, *where):
    q = select(func.count(model_cls.id))
    for w in where:
        q = q.where(w)
    return db.exec(q).one()


def _reports(db, *where):
    q = select(Report)
    for w in where:
        q = q.where(w)
    return db.exec(q).all()


def _make_bot(db, email, name="Bot"):
    """A bot is a reader row with the flag set — tests/test_bots.py::_make_bot's shape."""
    user = _make_user(db, email=email, name=name)
    user.is_bot = True
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _note(client, headers, text, is_public=True, quote=None):
    body = {"text": text, "is_public": is_public}
    if quote:
        body["quote"] = quote
    r = client.post("/notes/", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _report(client, headers, target_type, target_id, reason="harassment", detail=None):
    body = {"target_type": target_type, "target_id": target_id, "reason": reason}
    if detail is not None:
        body["detail"] = detail
    return client.post("/reports", json=body, headers=headers)


def _asgi_order(method, path, headers, body, events):
    """A raw ASGI call so "response sent" and "background task ran" are separable.

    TestClient waits for background tasks before returning, so it cannot show the ordering;
    a direct call can. Copied from tests/test_notes.py:59 (the F-59 helper) rather than
    imported, so this file does not depend on another test module's import-time side effects.
    """
    raw = _json.dumps(body).encode() if body is not None else b""
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
             "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"",
             "root_path": "",
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

    asyncio.run(app(scope, receive, send))
    return state["status"]


# ═══════════════════════════════════════════════════════════════════════════
# Package P1-A — the table and the guard
# ═══════════════════════════════════════════════════════════════════════════

class TestReportTable:

    def test_column_shape(self):
        """S-20. MUT-4I-01: drop `target_snapshot` from the model.

        Asserted as ONE dict comparison against a literal written out here, not column by
        column, so an ADDED column fails this too — a report row is reader-authored text in a
        second table and a column creeping into it is a privacy decision, not a detail.
        """
        shape = {c.name: (str(c.type), c.nullable) for c in Report.__table__.columns}
        assert shape == {
            "id":              ("INTEGER", False),
            "reporter_id":     ("INTEGER", False),
            "target_type":     ("VARCHAR(16)", False),
            "target_id":       ("INTEGER", False),
            "target_user_id":  ("INTEGER", True),
            "reason":          ("VARCHAR(32)", False),
            "detail":          ("VARCHAR(1000)", True),
            "target_snapshot": ("VARCHAR(2000)", True),
            "status":          ("VARCHAR(16)", False),
            "created_at":      ("DATETIME", False),
            "resolved_at":     ("DATETIME", True),
            "resolved_by":     ("INTEGER", True),
            "resolution":      ("VARCHAR(500)", True),
        }
        # status defaults to "open" — the DDL's DEFAULT 'open', and the model's own default
        assert Report.__table__.c.status.default.arg == "open"
        assert Report(reporter_id=1, target_type="note", target_id=1, reason="spam").status == "open"

    def test_uniqueness_is_the_database_not_the_handler(self, db):
        """S-20a. MUT-4I-02: drop the UniqueConstraint.

        tests/test_uniqueness.py:84-93's shape. Two concurrent submissions cannot both win
        only if the index says so; a handler check loses that race.
        """
        from sqlalchemy import UniqueConstraint
        assert any(isinstance(c, UniqueConstraint) and c.name == "uq_report_once"
                   for c in Report.__table__.constraints)

        a = _make_user(db, email="4i-s20a-rep@example.com", name="S20aR")
        db.add(Report(reporter_id=a.id, target_type="note", target_id=911, reason="spam"))
        db.commit()
        db.add(Report(reporter_id=a.id, target_type="note", target_id=911, reason="hate"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        # CONTROL: a row differing only in target_id commits, so the refusal above was the
        # constraint and not a broken session
        db.add(Report(reporter_id=a.id, target_type="note", target_id=912, reason="spam"))
        db.commit()
        assert _count(db, Report, Report.reporter_id == a.id) == 2

    def test_no_foreign_keys(self):
        """S-20b. MUT-4I-03: add foreign_key="note.id" to target_id.

        R-07: the report outlives its target, so `target_id` is deliberately not an FK. The
        control proves this assertion is about THIS table and not a metadata quirk.
        """
        assert Report.__table__.foreign_keys == set()
        assert models.Like.__table__.foreign_keys != set(), "CONTROL: other tables DO carry FKs"

    def test_schema_guard_entry(self):
        """S-21. MUT-4I-04: drop ("report","reason") from REQUIRED_COLUMNS.

        This entry is what makes a pre-migration deploy fail loudly instead of booting and
        then 500ing on every report.
        """
        assert ("report", "reason") in schema_guard.REQUIRED_COLUMNS
        # 7 in the 4I-A tree; 8 once 4I-B appends ("block","blocked_id") in the deploy that
        # follows PM SQL step 11. The literal moves with the entry, in the same commit.
        assert len(schema_guard.REQUIRED_COLUMNS) == 8, schema_guard.REQUIRED_COLUMNS

        # every pair resolves to a real column, which is what catches ("report","reasons")
        from sqlmodel import SQLModel
        tables = SQLModel.metadata.tables
        for table, column in schema_guard.REQUIRED_COLUMNS:
            assert table in tables, f"{table} is not a model table"
            assert column in tables[table].c, f"{table}.{column} does not exist"

    def test_guard_raises_naming_report_reason(self):
        """S-22. MUT-4I-04: drop the entry — this then DOES NOT RAISE.

        The stub serves REQUIRED_COLUMNS minus the one pair, built by SUBTRACTION so the list
        cannot rot as later sprints append to it (tests/test_local_day.py:1333-1342's shape).
        """
        class _StubEngine:
            def __init__(self, dialect_name, rows):
                self.dialect = type("D", (), {"name": dialect_name})()
                self._rows = rows

            def connect(self):
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

        without = [p for p in schema_guard.REQUIRED_COLUMNS if p != ("report", "reason")]
        assert len(without) == len(schema_guard.REQUIRED_COLUMNS) - 1, "the subtraction matched nothing"

        with pytest.raises(RuntimeError) as exc:
            schema_guard.assert_migrated(_StubEngine("postgresql", without))
        msg = str(exc.value)
        assert "report.reason" in msg
        assert "user.is_bot" not in msg, "the others were present; the message must be specific"

        # SECOND CONTROL: the full list does not raise
        assert schema_guard.assert_migrated(
            _StubEngine("postgresql", list(schema_guard.REQUIRED_COLUMNS))) is None


# ═══════════════════════════════════════════════════════════════════════════
# Package P2 — POST /reports: the refusals
# ═══════════════════════════════════════════════════════════════════════════

class TestCreateReport:

    def test_a_visible_note_is_reported_once(self, client, db):
        """S-01. MUT-4I-06: drop the snapshot write. MUT-4I-07: drop target_user_id."""
        a = _make_user(db, email="4i-s01-reporter@example.com", name="S01A")
        b = _make_user(db, email="4i-s01-author@example.com", name="S01B")
        note_id = _note(client, _auth(b), "S01 NOTE TEXT SENTINEL")

        r = _report(client, _auth(a), "note", note_id, reason="harassment",
                    detail="S01 DETAIL SENTINEL")
        assert r.status_code == 201, r.text
        # key-for-key, so a count, an id or a consequence cannot creep into the body
        assert r.json() == {"status": "received"}

        rows = _reports(db, Report.reporter_id == a.id, Report.target_id == note_id)
        assert len(rows) == 1
        row = rows[0]
        assert row.status == "open"
        assert row.target_user_id == b.id                 # MUT-4I-07
        assert row.target_snapshot is not None            # MUT-4I-06
        assert "S01 NOTE TEXT SENTINEL" in row.target_snapshot
        assert row.detail == "S01 DETAIL SENTINEL"
        assert (row.resolved_at, row.resolved_by, row.resolution) == (None, None, None)

    def test_a_second_report_of_the_same_target_is_200_and_one_row(self, client, db):
        """S-02. MUT-4I-02: drop the UniqueConstraint. MUT-4I-08: return 409 for a repeat.

        A reader tapping Report twice has not done anything wrong.
        """
        a = _make_user(db, email="4i-s02-reporter@example.com", name="S02A")
        b = _make_user(db, email="4i-s02-author@example.com", name="S02B")
        note_id = _note(client, _auth(b), "S02 note")

        before = _count(db, Report)
        first = _report(client, _auth(a), "note", note_id)
        assert first.status_code == 201, first.text
        after_first = _count(db, Report)

        second = _report(client, _auth(a), "note", note_id, reason="spam")
        assert second.status_code == 200, second.text          # MUT-4I-08
        assert second.json() == {"status": "received"}         # no count, no id
        db.expire_all()
        assert _count(db, Report) == after_first == before + 1  # MUT-4I-02

    def test_a_concurrent_duplicate_leaves_one_row(self, client, db, monkeypatch):
        """S-03. MUT-4I-09: remove the `except IntegrityError` catch -> 500.

        The state a concurrent loser is in is: the duplicate pre-check saw nothing, and the
        INSERT then lost the race on `uq_report_once`. That state is reached here by planting
        a committed row and neutralising the pre-check seam for this request, which leaves the
        index as the only thing standing — the handler's own code path is unchanged.

        Honest scope (tests.md section 14 item 8): this is SQLite's unique index raising
        IntegrityError inside one handler, not two simultaneous PostgreSQL requests.
        """
        a = _make_user(db, email="4i-s03-reporter@example.com", name="S03A")
        b = _make_user(db, email="4i-s03-author@example.com", name="S03B")
        note_id = _note(client, _auth(b), "S03 note")

        db.add(Report(reporter_id=a.id, target_type="note", target_id=note_id, reason="spam"))
        db.commit()
        before = _count(db, Report)
        assert before >= 1

        monkeypatch.setattr(reports_router, "_existing_report", lambda *a_, **k_: None)
        r = _report(client, _auth(a), "note", note_id, reason="hate")

        assert r.status_code == 200, r.text                      # MUT-4I-09: never a 500
        assert r.json() == {"status": "received"}
        db.expire_all()
        assert _count(db, Report) == before                      # and never a second row
        assert _reports(db, Report.reporter_id == a.id,
                        Report.target_id == note_id)[0].reason == "spam", "the first report wins"

        # CONTROL: with the seam restored, the same request is the ordinary 200 duplicate path
        monkeypatch.undo()
        again = _report(client, _auth(a), "note", note_id, reason="hate")
        assert again.status_code == 200 and again.content == r.content

    def test_a_private_note_is_404_and_writes_nothing(self, client, db):
        """S-04. MUT-4I-10: remove the visibility check -> 201."""
        a = _make_user(db, email="4i-s04-reporter@example.com", name="S04A")
        b = _make_user(db, email="4i-s04-author@example.com", name="S04B")
        private_id = _note(client, _auth(b), "S04 private", is_public=False)
        public_id = _note(client, _auth(b), "S04 public", is_public=True)

        before = _count(db, Report)
        r = _report(client, _auth(a), "note", private_id)
        assert r.status_code == 404, r.text                     # MUT-4I-10
        db.expire_all()
        assert _count(db, Report) == before

        # CONTROL: the same reader, the same payload shape, a VISIBLE note -> 201. So the 404
        # was the visibility rule and not the request.
        assert _report(client, _auth(a), "note", public_id).status_code == 201

    def test_a_private_profiles_note_is_404_for_a_non_follower(self, client, db):
        """S-05. MUT-4I-10: remove the visibility check -> 201.

        Note the shape of the reuse: `likes_comments._assert_can_view_note` answers this case
        with 403 ("This profile is private"), and 403 here would tell the reporter which of
        the two refusals it was. The route maps every visibility refusal onto one 404.
        """
        a = _make_user(db, email="4i-s05-reporter@example.com", name="S05A")
        b = _make_user(db, email="4i-s05-author@example.com", name="S05B")
        b.is_private_profile = True
        db.add(b)
        db.commit()
        note_id = _note(client, _auth(b), "S05 note")

        before = _count(db, Report)
        r = _report(client, _auth(a), "note", note_id)
        assert r.status_code == 404, r.text
        db.expire_all()
        assert _count(db, Report) == before

        # CONTROL: after A follows B the same report is 201 — the rule is the follow
        # relationship, not a blanket refusal
        assert client.post(f"/follow/{b.id}", headers=_auth(a)).status_code == 200
        assert _report(client, _auth(a), "note", note_id).status_code == 201

    def test_reporting_a_person(self, client, db):
        """S-05a (pm-decisions Q-2). MUT-4I-11: apply _assert_can_view_note's private-profile
        branch to a `user` target -> the private sub-case becomes 404.

        Four sub-cases. The private-profile one is the decision: a report is a message to a
        moderator, so visibility is the wrong gate, and the response must be IDENTICAL whether
        or not the reporter could see that person — that sameness is what stops this route
        leaking the existence of private profiles.
        """
        a = _make_user(db, email="4i-s05a-reporter@example.com", name="S05aA")
        public = _make_user(db, email="4i-s05a-public@example.com", name="S05aP")
        private = _make_user(db, email="4i-s05a-private@example.com", name="S05aQ")
        private.is_private_profile = True
        db.add(private)
        db.commit()

        r_public = _report(client, _auth(a), "user", public.id, reason="harassment")
        r_private = _report(client, _auth(a), "user", private.id, reason="harassment")
        r_missing = _report(client, _auth(a), "user", 10_000_019, reason="harassment")
        r_self = _report(client, _auth(a), "user", a.id, reason="harassment")

        assert r_public.status_code == 201, r_public.text
        assert r_private.status_code == 201, r_private.text      # MUT-4I-11
        assert r_missing.status_code == 404
        assert r_self.status_code == 400

        # the sameness, asserted as a comparison and not as two separate expectations
        assert r_private.status_code == r_public.status_code
        assert r_private.content == r_public.content

    def test_self_reports_are_400(self, client, db):
        """S-06. MUT-4I-12: allow self-reports -> 201."""
        a = _make_user(db, email="4i-s06-reporter@example.com", name="S06A")
        b = _make_user(db, email="4i-s06-other@example.com", name="S06B")
        ha, hb = _auth(a), _auth(b)

        own_note = _note(client, ha, "S06 own note")
        b_note = _note(client, hb, "S06 b note")
        c = client.post(f"/notes/{b_note}/comments", json={"text": "S06 own comment"}, headers=ha)
        assert c.status_code == 201, c.text
        own_comment = c.json()["id"]
        b_comment = client.post(f"/notes/{own_note}/comments", json={"text": "S06 b comment"},
                                headers=hb).json()["id"]

        before = _count(db, Report)
        assert _report(client, ha, "note", own_note).status_code == 400        # MUT-4I-12
        assert _report(client, ha, "comment", own_comment).status_code == 400
        assert _report(client, ha, "user", a.id).status_code == 400
        db.expire_all()
        assert _count(db, Report) == before

        # CONTROL: the same three shapes aimed at B are accepted
        assert _report(client, ha, "note", b_note).status_code == 201
        assert _report(client, ha, "comment", b_comment).status_code == 201
        assert _report(client, ha, "user", b.id).status_code == 201

    def test_a_missing_target_is_byte_identical_to_an_invisible_one(self, client, db):
        """S-07. MUT-4I-13: give the missing-target branch its own message.

        This is the enumeration oracle and byte-identity is the only thing that closes it.
        """
        a = _make_user(db, email="4i-s07-reporter@example.com", name="S07A")
        b = _make_user(db, email="4i-s07-author@example.com", name="S07B")
        private_id = _note(client, _auth(b), "S07 private", is_public=False)

        r_missing = _report(client, _auth(a), "note", 10_000_007)
        r_invisible = _report(client, _auth(a), "note", private_id)

        assert r_missing.status_code == 404 and r_invisible.status_code == 404
        assert r_missing.content == r_invisible.content, (r_missing.text, r_invisible.text)
        assert r_missing.headers["content-type"] == r_invisible.headers["content-type"]

    def test_a_bot_cannot_file_a_report(self, client, db, monkeypatch):
        """S-08. MUT-4I-14: remove Depends(deny_bot_actor) -> 201."""
        calls = []
        monkeypatch.setattr(reports_router, "fire_event", lambda *a, **k: calls.append(k))

        bot = _make_bot(db, "4i-s08-bot@trackmyread.com", name="S08Bot")
        author = _make_user(db, email="4i-s08-author@example.com", name="S08Au")
        reader = _make_user(db, email="4i-s08-reader@example.com", name="S08Rd")
        note_id = _note(client, _auth(author), "S08 note")

        before = _count(db, Report)
        r = _report(client, _auth(bot), "note", note_id)
        assert r.status_code == 403, r.text                     # MUT-4I-14
        db.expire_all()
        assert _count(db, Report) == before
        assert calls == []

        # CONTROL: a reader's identical request is 201 and fires one event
        assert _report(client, _auth(reader), "note", note_id).status_code == 201
        assert len(calls) == 1

    def test_deny_bot_actor_is_a_route_dependency_not_a_handler_check(self):
        """S-08a (K-4I-02, rules 2 and 4). MUT-4I-15: move the bot check into the handler body.

        FastAPI resolves route dependencies BEFORE the handler body, so this IS the "before any
        row, before any notification" proof; a status-code test alone cannot see the difference.
        The count is asserted from this side too, so it cannot drift from
        tests/test_bots.py::GUARDED_ROUTES.
        """
        api_routes = [r for r in app.routes if isinstance(r, APIRoute)]
        assert len(api_routes) >= 100, "the walk found almost no routes — it would pass vacuously"

        def _dependency_calls(dependant):
            for dep in dependant.dependencies:
                yield dep.call
                yield from _dependency_calls(dep)

        found = set()
        for route in api_routes:
            if deny_bot_actor in set(_dependency_calls(route.dependant)):
                for method in route.methods:
                    found.add((method, route.path))

        assert ("POST", "/reports") in found, sorted(found)     # MUT-4I-15
        # 5 in the 4I-A tree; 6 once 4I-B adds POST /blocks/{user_id}
        assert ("POST", "/blocks/{user_id}") in found, sorted(found)   # Sprint 4I-B
        assert len(found) == 6, sorted(found)

    @pytest.mark.parametrize("reason", REASONS)
    def test_every_reason_is_accepted(self, client, db, reason):
        """S-17. MUT-4I-16: accept an unlisted reason -> the 422 half fails.

        Both halves are required: a closed set tested only for its rejections is satisfied by
        rejecting everything.
        """
        assert len(REASONS) == 7, REASONS

        a = _make_user(db, email=f"4i-s17-{reason}-reporter@example.com", name="S17A")
        b = _make_user(db, email=f"4i-s17-{reason}-author@example.com", name="S17B")
        note_id = _note(client, _auth(b), f"S17 note {reason}")

        r = _report(client, _auth(a), "note", note_id, reason=reason)
        assert r.status_code == 201, r.text
        db.expire_all()
        rows = _reports(db, Report.reporter_id == a.id, Report.target_id == note_id)
        assert len(rows) == 1 and rows[0].reason == reason      # stored verbatim

        other = _make_user(db, email=f"4i-s17-{reason}-other@example.com", name="S17O")
        before = _count(db, Report)
        bad = _report(client, _auth(other), "note", note_id, reason="whatever")
        assert bad.status_code in (400, 422), bad.text          # MUT-4I-16
        db.expire_all()
        assert _count(db, Report) == before

    @pytest.mark.parametrize("target_type", TARGET_TYPES)
    def test_every_target_type_is_accepted(self, client, db, target_type):
        """S-18. MUT-4I-17: accept a fifth type -> the 422 half fails.

        Each parameter is aimed at a REAL target of that kind, so "accepted" means the route
        resolved it, denormalised its author and snapshotted its words.
        """
        assert len(TARGET_TYPES) == 4, TARGET_TYPES

        a = _make_user(db, email=f"4i-s18-{target_type}-reporter@example.com", name="S18A")
        b = _make_user(db, email=f"4i-s18-{target_type}-author@example.com", name="S18B")
        ha, hb = _auth(a), _auth(b)

        if target_type == "note":
            target_id = _note(client, hb, "S18 NOTE WORDS")
        elif target_type == "comment":
            host = _note(client, hb, "S18 host note")
            target_id = client.post(f"/notes/{host}/comments", json={"text": "S18 COMMENT WORDS"},
                                    headers=hb).json()["id"]
        elif target_type == "group_post":
            g = client.post("/groups/", json={"name": f"S18 circle {target_type}",
                                              "is_private": False}, headers=hb)
            assert g.status_code == 201, g.text
            gid = g.json()["id"]
            p = client.post(f"/groups/{gid}/posts", json={"text": "S18 GROUP WORDS"}, headers=hb)
            assert p.status_code == 201, p.text
            target_id = p.json()["id"]
        else:
            target_id = b.id

        r = _report(client, ha, target_type, target_id, reason="spam")
        assert r.status_code == 201, r.text
        db.expire_all()
        rows = _reports(db, Report.reporter_id == a.id, Report.target_type == target_type)
        assert len(rows) == 1
        assert rows[0].target_user_id == b.id, "the author must be denormalised at creation"
        if target_type == "user":
            assert rows[0].target_snapshot is None, "a person has no words to snapshot"
        else:
            assert rows[0].target_snapshot, "the three content types carry a snapshot"

        # A fifth type is refused, with R-01's reason: a `group_activity` row carries no
        # reader-authored text (groups_router.py:1140-1151 serialises an event type and a
        # payload the server wrote).
        before = _count(db, Report)
        bad = _report(client, ha, "group_activity", target_id)
        assert bad.status_code in (400, 422), bad.text          # MUT-4I-17
        db.expire_all()
        assert _count(db, Report) == before

    def test_the_twenty_first_report_in_a_day_is_429(self, client, db):
        """S-25 — pm-decisions Q-2's cap, which is NOT in tests.md (spec R-09 said there would
        be no limiter and the addendum overrides it).

        MUT-4I-29 (this file's own id): raise REPORT_MAX_PER_DAY, or move the cap below the
        INSERT. The cap runs before anything is written, so a 429 leaves nothing behind —
        Sprint 4F's bot cap (notes_router.py:159-176) is the shape.
        """
        cap = reports_router.REPORT_MAX_PER_DAY
        assert cap == 20, cap

        a = _make_user(db, email="4i-s25-reporter@example.com", name="S25A")
        b = _make_user(db, email="4i-s25-author@example.com", name="S25B")
        ha, hb = _auth(a), _auth(b)
        note_ids = [_note(client, hb, f"S25 note {i}") for i in range(cap + 1)]

        for i in range(cap):
            r = _report(client, ha, "note", note_ids[i], reason="spam")
            assert r.status_code == 201, (i, r.text)

        before = _count(db, Report, Report.reporter_id == a.id)
        assert before == cap

        over = _report(client, ha, "note", note_ids[cap], reason="spam")
        assert over.status_code == 429, over.text
        db.expire_all()
        assert _count(db, Report, Report.reporter_id == a.id) == cap, "a 429 writes nothing"

        # CONTROL: the cap is per reporter. A second reader is unaffected by A's flood.
        other = _make_user(db, email="4i-s25-other@example.com", name="S25O")
        assert _report(client, _auth(other), "note", note_ids[cap]).status_code == 201

        # CONTROL: and it is a 24-hour window, not a lifetime limit — ageing one row out of
        # the window lets A file again
        oldest = _reports(db, Report.reporter_id == a.id)[0]
        oldest.created_at = datetime.utcnow() - timedelta(days=2)
        db.add(oldest)
        db.commit()
        assert _report(client, ha, "note", note_ids[cap], reason="spam").status_code == 201


# ═══════════════════════════════════════════════════════════════════════════
# Package P2 — what a report does NOT do, and the record it leaves
# ═══════════════════════════════════════════════════════════════════════════

class TestReportEffects:

    def test_a_bot_is_reportable_and_stays_in_every_feed(self, client, db):
        """S-09. MUT-4I-18a: add any auto-hide at a report threshold.

        R-04 is the whole mitigation for "report a bot out of the feed": no number of reports
        removes anything. A reader cannot tell a bot from a person and must not have to.
        """
        bot = _make_bot(db, "4i-s09-bot@trackmyread.com", name="S09Bot")
        note_id = _note(client, _auth(bot), "S09 BOT NOTE IN THE FEED")
        # /notes/feed serves the 50 most recent notes and other suites seed notes dated a year
        # ahead (tests/test_notes.py::_seed_public_notes), so in a whole-suite run this note
        # would fall off the end of the page for a reason that has nothing to do with reports.
        # Dating it further ahead keeps it on the page; it is the ABSENCE that this case is
        # about, and an absence caused by pagination would be a false pass.
        bot_note = db.get(models.Note, note_id)
        bot_note.created_at = datetime.utcnow() + timedelta(days=500)
        db.add(bot_note)
        db.commit()
        reporters = [_make_user(db, email=f"4i-s09-rep{i}@example.com", name=f"S09R{i}")
                     for i in range(3)]
        fourth = _make_user(db, email="4i-s09-fourth@example.com", name="S09F")

        for rep in reporters:
            assert _report(client, _auth(rep), "note", note_id, reason="spam").status_code == 201
        db.expire_all()
        assert _count(db, Report, Report.target_id == note_id,
                      Report.target_type == "note") == 3

        def _feed_ids(user):
            r = client.get("/notes/feed", headers=_auth(user))
            assert r.status_code == 200, r.text
            return [n["id"] for n in r.json()]

        assert note_id in _feed_ids(fourth), "MUT-4I-18a: three reports removed nothing"
        for rep in reporters:
            assert note_id in _feed_ids(rep), "not even for the reporters themselves"

    def test_a_report_changes_nothing_any_serving_path_reads(self, client, db):
        """S-09a. MUT-4I-18a: set any flag a feed reads.

        R-04 stated as a comparison against CAPTURED bodies rather than as an absence.
        """
        author = _make_user(db, email="4i-s09a-author@example.com", name="S09aA")
        reporter = _make_user(db, email="4i-s09a-reporter@example.com", name="S09aR")
        third = _make_user(db, email="4i-s09a-third@example.com", name="S09aT")
        note_id = _note(client, _auth(author), "S09a note")
        client.post(f"/notes/{note_id}/comments", json={"text": "S09a comment"},
                    headers=_auth(third))

        h3 = _auth(third)
        before = {
            "feed": client.get("/notes/feed", headers=h3).json(),
            "comments": client.get(f"/notes/{note_id}/comments", headers=h3).json(),
            "profile": client.get(f"/profile/{author.id}", headers=h3).json(),
        }

        assert _report(client, _auth(reporter), "note", note_id, reason="hate").status_code == 201

        after = {
            "feed": client.get("/notes/feed", headers=h3).json(),
            "comments": client.get(f"/notes/{note_id}/comments", headers=h3).json(),
            "profile": client.get(f"/profile/{author.id}", headers=h3).json(),
        }
        assert after["comments"] == before["comments"]
        assert after["profile"] == before["profile"]
        assert after["feed"] == before["feed"]

    def test_a_report_outlives_its_target(self, client, db, admin, admin_headers):
        """S-15. MUT-4I-03: make target_id a foreign key (the delete then fails or cascades).
        MUT-4I-06: drop the snapshot -> the queue row renders blank.
        """
        author = _make_user(db, email="4i-s15-author@example.com", name="S15A")
        reporter = _make_user(db, email="4i-s15-reporter@example.com", name="S15R")
        doomed = _note(client, _auth(author), "S15 DOOMED TEXT")
        survivor = _note(client, _auth(author), "S15 SURVIVING TEXT")

        assert _report(client, _auth(reporter), "note", doomed, reason="hate").status_code == 201
        assert _report(client, _auth(reporter), "note", survivor, reason="spam").status_code == 201

        d = client.delete(f"/admin/content/note/{doomed}", headers=admin_headers)
        assert d.status_code == 200, d.text
        db.expire_all()
        assert db.get(models.Note, doomed) is None, "the note really is gone"

        q = client.get("/admin/reports", headers=admin_headers)
        assert q.status_code == 200, q.text
        rows = {row["target_id"]: row for row in q.json()}
        assert doomed in rows, "the report must outlive the content it is about"
        assert "S15 DOOMED TEXT" in (rows[doomed]["target_snapshot"] or "")   # MUT-4I-06
        assert rows[doomed]["reason"] == "hate"
        # CONTROL: a report whose target still exists renders in the same response
        assert survivor in rows and "S15 SURVIVING TEXT" in (rows[survivor]["target_snapshot"] or "")

    def test_no_report_field_ever_reaches_a_non_admin(self, client, db, admin_headers):
        """S-16. MUT-4I-26: add `detail` or `target_snapshot` to any non-admin response.

        Sweeps every GET route reachable with the reporter's and the reported reader's tokens,
        in tests/test_local_day.py:408-430's shape. The swept count is asserted against a
        literal FIRST — a sweep that reaches nothing passes every content assertion.

        The reported note is DELETED before the sweep, on purpose: while it exists, its text
        is legitimately public and the snapshot sentinel would be found in the feed for the
        right reason. Once the admin has deleted it, `report.target_snapshot` is the only copy
        of those words anywhere, which is precisely the field that must never be served.
        """
        a = _make_user(db, email="4i-s16-reporter@example.com", name="S16A")
        b = _make_user(db, email="4i-s16-author@example.com", name="S16B")
        ha, hb = _auth(a), _auth(b)
        note_id = _note(client, hb, "S16-SNAPSHOT-SENTINEL words")
        g = client.post("/groups/", json={"name": "S16 circle", "is_private": False}, headers=hb)
        gid = g.json()["id"]
        ub = None

        assert _report(client, ha, "note", note_id, reason="spam",
                       detail="S16-DETAIL-SENTINEL").status_code == 201
        assert client.delete(f"/admin/content/note/{note_id}",
                             headers=admin_headers).status_code == 200
        # CONTROL: the admin's own queue DOES still carry both strings — the sweep below is
        # about who may read them, not about whether they were stored
        queue = client.get("/admin/reports", headers=admin_headers)
        assert "S16-SNAPSHOT-SENTINEL" in queue.text and "S16-DETAIL-SENTINEL" in queue.text

        # CONTROL (that the sweep reads bodies at all): the reporter's own email appears in
        # their own profile
        own = client.get("/profile/me", headers=ha)
        assert own.status_code == 200 and "4i-s16-reporter@example.com" in own.text

        path_values = {"user_id": b.id, "group_id": gid, "note_id": note_id,
                       "userbook_id": ub or 1, "book_id": 1, "id": b.id,
                       "report_id": 1, "notification_id": 1}
        swept = 0
        for route in list(client.app.routes):
            methods = getattr(route, "methods", None) or set()
            path = getattr(route, "path", None)
            if "GET" not in methods or not path:
                continue
            if any(seg in path for seg in ("/openapi.json", "/docs", "/redoc")) \
                    or path.startswith("/api/googlebooks"):
                continue
            real_path = path
            for param, value in path_values.items():
                real_path = real_path.replace("{" + param + "}", str(value))
            if "{" in real_path:
                continue
            for caller in (ha, hb):
                r = client.get(real_path, headers=caller)
                assert r.status_code < 500 or r.status_code == 503, f"{real_path} -> {r.status_code}"
                assert "S16-DETAIL-SENTINEL" not in r.text, real_path       # MUT-4I-26
                assert "S16-SNAPSHOT-SENTINEL" not in r.text, real_path
                assert "target_snapshot" not in r.text, real_path
                assert "reporter_id" not in r.text, real_path
            swept += 1
        # 51 in the 4I-A tree; 52 once 4I-B adds GET /blocks.
        assert swept == 52, swept   # measured. Rule 4: a sweep that reaches nothing would
        #                            otherwise pass every content assertion above it.

    def test_no_reported_text_is_logged(self, client, db, capsys):
        """S-19. MUT-4I-27: print the payload in the route.

        A report body is the most sensitive text this product holds. Status codes, reason
        strings and row ids are permitted; words and names are not.
        """
        a = _make_user(db, email="4i-s19-reporter-sentinel@example.com", name="S19-NAME-SENTINEL")
        b = _make_user(db, email="4i-s19-author@example.com", name="S19B")
        bot = _make_bot(db, "4i-s19-bot@trackmyread.com", name="S19Bot")
        note_id = _note(client, _auth(b), "S19-TEXT-SENTINEL body")
        private_id = _note(client, _auth(b), "S19 private", is_public=False)

        capsys.readouterr()
        assert _report(client, _auth(a), "note", note_id, reason="hate",
                       detail="S19-DETAIL-SENTINEL").status_code == 201
        assert _report(client, _auth(a), "note", private_id, detail="S19-DETAIL-SENTINEL").status_code == 404
        assert _report(client, _auth(bot), "note", note_id, detail="S19-DETAIL-SENTINEL").status_code == 403
        captured = capsys.readouterr()
        blob = captured.out + captured.err

        for sentinel in ("S19-TEXT-SENTINEL", "S19-DETAIL-SENTINEL", "S19-NAME-SENTINEL",
                         "4i-s19-reporter-sentinel@example.com"):
            assert sentinel not in blob, sentinel                # MUT-4I-27

        # CONTROL (rule 3): the same detector over a synthetic log line reports a hit, so a
        # green result above is not an empty capture
        print("report: S19-DETAIL-SENTINEL")
        synthetic = capsys.readouterr().out
        assert "S19-DETAIL-SENTINEL" in synthetic


# ═══════════════════════════════════════════════════════════════════════════
# Package P2 — the admin queue
# ═══════════════════════════════════════════════════════════════════════════

class TestAdminQueue:

    def test_queue_is_admin_only_and_actionable_in_one_request(self, client, db, admin_headers):
        """S-10. MUT-4I-19: drop get_admin_user -> 200 for a non-admin. Drop the
        other-report count -> None instead of 2.
        """
        a = _make_user(db, email="4i-s10-reporter@example.com", name="S10-REPORTER")
        a2 = _make_user(db, email="4i-s10-reporter2@example.com", name="S10R2")
        b = _make_user(db, email="4i-s10-author@example.com", name="S10-AUTHOR")
        note_id = _note(client, _auth(b), "S10-REPORTED-TEXT here")

        assert _report(client, _auth(a), "note", note_id, reason="violence",
                       detail="S10-DETAIL").status_code == 201

        assert client.get("/admin/reports", headers=_auth(a)).status_code == 403   # MUT-4I-19

        r = client.get("/admin/reports", headers=admin_headers)
        assert r.status_code == 200, r.text
        row = next(x for x in r.json() if x["target_id"] == note_id and x["target_type"] == "note")
        assert "S10-REPORTED-TEXT" in (row["target_snapshot"] or "")   # the reported text
        assert row["target_user_name"] == "S10-AUTHOR"                 # the author
        assert row["reporter_name"] == "S10-REPORTER"                  # the reporter
        assert row["reason"] == "violence"
        assert row["detail"] == "S10-DETAIL"
        assert row["reports_on_target"] == 1

        # a count that is always 1 proves nothing: a second reporter must move it
        assert _report(client, _auth(a2), "note", note_id, reason="spam").status_code == 201
        r2 = client.get("/admin/reports", headers=admin_headers)
        row2 = next(x for x in r2.json() if x["target_id"] == note_id and x["target_type"] == "note")
        assert row2["reports_on_target"] == 2

    def test_the_queue_does_not_scale_with_report_count(self, client, db, admin_headers,
                                                        stmt_counter):
        """S-10a (K-4I-14). MUT-4I-20: serialise the author with a per-row db.get.

        E-7 leaves these routes out of Sprint 4E's budget table, so this in-file ceiling is
        the only thing watching them. A cheap local budget is what stops the admin queue being
        the one N+1 nobody measured.
        """
        author = _make_user(db, email="4i-s10a-author@example.com", name="S10aA")
        ha = _auth(author)
        targets = [_note(client, ha, f"S10a note {i}") for i in range(5)]
        reporters = [_make_user(db, email=f"4i-s10a-rep{i}@example.com", name=f"S10aR{i}")
                     for i in range(4)]
        first = _make_user(db, email="4i-s10a-first@example.com", name="S10aF")

        assert _report(client, _auth(first), "note", targets[0]).status_code == 201

        client.get("/admin/reports", headers=admin_headers)      # warm-up: last_active write
        stmt_counter.reset()
        assert client.get("/admin/reports", headers=admin_headers).status_code == 200
        with_one = stmt_counter.selects

        for rep in reporters:
            for t in targets:
                assert _report(client, _auth(rep), "note", t).status_code == 201
        db.expire_all()
        assert _count(db, Report, Report.target_id.in_(targets)) == 21

        stmt_counter.reset()
        q = client.get("/admin/reports", headers=admin_headers)
        assert q.status_code == 200
        with_twenty = stmt_counter.selects

        assert len(q.json()) >= 21
        assert with_twenty == with_one, (with_one, with_twenty)   # MUT-4I-20
        assert with_twenty <= 5, with_twenty      # measured: 4 (auth, reports, users, counts)

    def test_patch_resolves_without_deleting(self, client, db, admin, admin_headers):
        """S-11. MUT-4I-21: delete the row on resolve. Leave resolved_by unset -> None == admin.
        """
        a = _make_user(db, email="4i-s11-reporter@example.com", name="S11A")
        b = _make_user(db, email="4i-s11-author@example.com", name="S11B")
        note_id = _note(client, _auth(b), "S11 note")
        assert _report(client, _auth(a), "note", note_id).status_code == 201
        db.expire_all()
        report_id = _reports(db, Report.reporter_id == a.id)[0].id
        before_total = _count(db, Report)

        p = client.patch(f"/admin/reports/{report_id}",
                         json={"status": "actioned", "resolution": "deleted the note"},
                         headers=admin_headers)
        assert p.status_code == 200, p.text

        db.expire_all()
        row = db.get(Report, report_id)
        assert row is not None                                   # MUT-4I-21
        assert row.status == "actioned"
        assert row.resolved_at is not None
        assert row.resolved_by == admin.id
        assert row.resolution == "deleted the note"
        assert _count(db, Report) == before_total                # CONTROL: nothing was deleted

        open_ids = [x["id"] for x in client.get("/admin/reports", headers=admin_headers).json()]
        assert report_id not in open_ids, "a resolved report leaves the open queue"
        all_ids = [x["id"] for x in
                   client.get("/admin/reports?status=all", headers=admin_headers).json()]
        assert report_id in all_ids, "and is still fetchable"

    def test_patch_refuses_an_unknown_status_and_a_non_admin(self, client, db, admin_headers):
        """S-11a. MUT-4I-22: accept any status string."""
        a = _make_user(db, email="4i-s11a-reporter@example.com", name="S11aA")
        b = _make_user(db, email="4i-s11a-author@example.com", name="S11aB")
        note_id = _note(client, _auth(b), "S11a note")
        assert _report(client, _auth(a), "note", note_id).status_code == 201
        db.expire_all()
        row = _reports(db, Report.reporter_id == a.id)[0]
        report_id, status_before = row.id, row.status
        assert status_before == "open"

        bad = client.patch(f"/admin/reports/{report_id}", json={"status": "vanished"},
                           headers=admin_headers)
        assert bad.status_code in (400, 422), bad.text           # MUT-4I-22
        db.expire_all()
        assert db.get(Report, report_id).status == status_before

        forbidden = client.patch(f"/admin/reports/{report_id}", json={"status": "dismissed"},
                                 headers=_auth(a))
        assert forbidden.status_code == 403, forbidden.text
        db.expire_all()
        assert db.get(Report, report_id).status == status_before


# ═══════════════════════════════════════════════════════════════════════════
# Package P2 — the notification
# ═══════════════════════════════════════════════════════════════════════════

class TestReportNotification:

    def test_one_event_to_the_admins_with_no_content_in_it(self, client, db, admin, monkeypatch):
        """S-12. MUT-4I-23: put the snapshot in the body. MUT-4I-24: call fire_event inline
        instead of through add_task -> the ordering assertion.

        A push notification is a lock-screen surface: it carries that a report exists and its
        reason, and nothing else.
        """
        calls = []
        # ONE list, written by both the ASGI send callback and the spy, so the ordering below
        # is an observation and not an arrangement. Appending "fire_event" from the test after
        # the request would make that assertion unfalsifiable — measured: MUT-4I-24 stayed
        # green against that version (non-vacuity rule 14).
        events = []

        def _spy(*args, **kwargs):
            calls.append(kwargs or args)
            events.append("fire_event")
            return {"sent": 0, "spied": True}

        monkeypatch.setattr(reports_router, "fire_event", _spy)

        a = _make_user(db, email="4i-s12-reporter@example.com", name="S12-REPORTER-SENTINEL")
        b = _make_user(db, email="4i-s12-author@example.com", name="S12-AUTHOR-SENTINEL")
        note_id = _note(client, _auth(b), "S12-NOTE-SENTINEL text")

        status_code = _asgi_order(
            "POST", "/reports", _auth(a),
            {"target_type": "note", "target_id": note_id, "reason": "hate",
             "detail": "S12-DETAIL-SENTINEL"},
            events,
        )
        assert status_code == 201
        assert len(calls) == 1, calls
        call = calls[0]
        assert call["event_type"] == "content_reported"
        # the admin ids AND NOTHING ELSE. Discovered from the rows rather than typed, because
        # other suites create admin readers too and a literal [admin.id] would be a
        # whole-suite-ordering failure rather than a statement about this route.
        admin_ids = {u.id for u in db.exec(select(models.User)
                                           .where(models.User.is_admin == True)).all()}  # noqa: E712
        assert admin.id in admin_ids, "CONTROL: the fixture admin is one of them"
        assert set(call["recipient_ids"]) == admin_ids, call["recipient_ids"]
        assert a.id not in admin_ids and b.id not in admin_ids, "neither party is an admin here"

        blob = repr(call)
        for sentinel in ("S12-NOTE-SENTINEL", "S12-DETAIL-SENTINEL",
                         "S12-REPORTER-SENTINEL", "S12-AUTHOR-SENTINEL"):
            assert sentinel not in blob, sentinel                # MUT-4I-23

        cfg = NOTIFICATION_EVENTS["content_reported"]
        rendered = cfg["title"] + " " + cfg["body"].replace("{reason}", call["extra"]["reason"])
        for sentinel in ("S12-NOTE-SENTINEL", "S12-DETAIL-SENTINEL",
                         "S12-REPORTER-SENTINEL", "S12-AUTHOR-SENTINEL"):
            assert sentinel not in rendered, sentinel
        assert "{" not in rendered, rendered   # every placeholder is filled by `extra`

        # It is a BackgroundTask: the response headers went out BEFORE the event fired, which
        # is what `background_tasks.add_task` buys and an inline call does not.
        assert "fire_event" in events, events
        assert events.index("response.start") < events.index("fire_event")  # MUT-4I-24

    def test_an_admin_with_no_push_token_still_gets_a_201(self, client, db, admin, monkeypatch):
        """S-13. A report must not be slower, or fail, because the admin's push token is stale.

        MUT-4I-24 as tests.md words it ("make the notification synchronous") does NOT turn this
        red — `_notify_admins` swallows delivery failures by design, so the 201 survives either
        way. It turns S-12's ordering assertion red instead. Recorded, not worked around.
        The mutation that DOES bite here is removing the try/except in `_notify_admins`.
        """
        import app.notifications.dispatcher as dispatcher

        def _boom(*a, **k):
            raise RuntimeError("stale token")

        monkeypatch.setattr(dispatcher, "send_expo_push", _boom)
        monkeypatch.setattr(dispatcher, "send_web_push", _boom)

        tokens = db.exec(select(models.PushToken)
                         .where(models.PushToken.user_id == admin.id)).all()
        assert tokens == [], "this case requires the admin to have no push token"

        a = _make_user(db, email="4i-s13-reporter@example.com", name="S13A")
        b = _make_user(db, email="4i-s13-author@example.com", name="S13B")
        note_id = _note(client, _auth(b), "S13 note")

        before = _count(db, Report)
        r = _report(client, _auth(a), "note", note_id, reason="spam")
        assert r.status_code == 201, r.text
        db.expire_all()
        assert _count(db, Report) == before + 1

    def test_the_reported_reader_is_told_nothing(self, client, db, admin, monkeypatch):
        """S-14. MUT-4I-25: add the reported reader to recipient_ids.

        The only observable consequence of a report is the admin deleting the content, which
        is observable today (R-10).
        """
        import app.notifications.dispatcher as dispatcher
        pushed = []
        monkeypatch.setattr(dispatcher, "send_expo_push",
                            lambda db_, uid, *a, **k: pushed.append(uid))
        monkeypatch.setattr(dispatcher, "send_web_push",
                            lambda db_, uid, *a, **k: pushed.append(uid))

        a = _make_user(db, email="4i-s14-reporter@example.com", name="S14A")
        b = _make_user(db, email="4i-s14-author@example.com", name="S14B")
        note_id = _note(client, _auth(b), "S14 note")

        logs_before = _count(db, models.NotificationLog, models.NotificationLog.user_id == b.id)
        admin_logs_before = _count(db, models.NotificationLog,
                                   models.NotificationLog.user_id == admin.id)
        history_before = client.get("/notifications/history", headers=_auth(b)).json()

        assert _report(client, _auth(a), "note", note_id, reason="hate").status_code == 201

        db.expire_all()
        assert _count(db, models.NotificationLog,
                      models.NotificationLog.user_id == b.id) == logs_before   # MUT-4I-25
        assert b.id not in pushed
        assert client.get("/notifications/history", headers=_auth(b)).json() == history_before
        # CONTROL: the admin's log DOES gain a row, so the absence above is not
        # "notifications are off"
        assert _count(db, models.NotificationLog,
                      models.NotificationLog.user_id == admin.id) == admin_logs_before + 1
        assert admin.id in pushed


# ═══════════════════════════════════════════════════════════════════════════
# Package P2 — the cascade
# ═══════════════════════════════════════════════════════════════════════════

class TestReportCascade:

    def test_account_deletion_takes_both_kinds_of_report(self, client, db):
        """S-24. MUT-4I-28: delete only the filed-by reports.

        `report` carries no foreign key, so a skipped delete fails nothing loudly — it just
        leaves rows pointing at a user id that no longer exists, with a snapshot of a deleted
        reader's words in them.
        """
        a = _make_user(db, email="4i-s24-a@example.com", name="S24A")
        b = _make_user(db, email="4i-s24-b@example.com", name="S24B")
        c = _make_user(db, email="4i-s24-c@example.com", name="S24C")
        third = _make_user(db, email="4i-s24-third@example.com", name="S24T")
        # ids as plain ints: `a`'s row is about to be deleted and any later attribute access
        # on the ORM object would raise ObjectDeletedError instead of asserting anything
        a_id, c_id, third_id = a.id, c.id, third.id
        ha = _auth(a)

        b_note = _note(client, _auth(b), "S24 b note")
        a_note = _note(client, ha, "S24 a note")
        third_note = _note(client, _auth(third), "S24 third note")

        assert _report(client, ha, "note", b_note, reason="spam").status_code == 201
        assert _report(client, _auth(c), "note", a_note, reason="hate").status_code == 201
        assert _report(client, _auth(c), "note", third_note, reason="other").status_code == 201

        db.expire_all()
        assert _count(db, Report, Report.reporter_id == a_id) == 1
        assert _count(db, Report, Report.target_user_id == a_id) == 1

        d = client.post("/auth/delete-account/me", headers=ha)
        assert d.status_code == 200, d.text

        db.expire_all()
        assert _count(db, Report, Report.reporter_id == a_id) == 0, "filed by A"
        assert _count(db, Report, Report.target_user_id == a_id) == 0, "about A"  # MUT-4I-28
        # CONTROL: C's report of a THIRD reader's note survives
        assert _count(db, Report, Report.reporter_id == c_id,
                      Report.target_user_id == third_id) == 1

        # no report row points at a user id that no longer exists
        live_ids = {u.id for u in db.exec(select(models.User)).all()}
        for row in _reports(db):
            assert row.reporter_id in live_ids, row.id
            assert row.target_user_id is None or row.target_user_id in live_ids, row.id
