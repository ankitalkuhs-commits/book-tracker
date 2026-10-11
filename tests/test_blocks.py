"""Sprint 4I-B — the block API, its fourteen serving paths and its refusals.

WHAT THIS FILE IS FOR
=====================
A block that leaks on ONE serving path is worse than no block at all, because the reader believes
they are protected and they are not — and it is a failure they cannot detect. So the shape of this
file is not "test the feature", it is:

* **Every serving-path case runs in BOTH directions** (`DIRECTIONS`, length asserted). A
  one-directional suite cannot tell a symmetric block from an `or_` arm transposed in
  `app/blocks.py` — which is the single most likely way this ships broken, and is MUT-4I-30.
* **Every "absent" assertion is paired with a "present" assertion about a third, uninvolved
  reader in the same response.** Without it, a filter that returns `[]` for everybody passes
  every case.
* **The path table is a literal whose length is asserted before anything else**
  (`test_the_path_table_is_whole`), and `tests/test_route_coverage.py` imports it, so a route
  cannot be marked filtered without a per-path case being parametrised over it.

TWO DELIBERATE DEPARTURES FROM tests.md, BOTH BECAUSE pm-decisions.md IS BINDING
===============================================================================
1. **B-15u is struck.** pm-decisions ("R-24 — the unlike refusal: dropped") removes the
   requirement that `DELETE /notes/{id}/like` refuse a blocked pair: it never loads the note, and
   withdrawing a like you left yourself is not a leak. `test_unlike_is_deliberately_unguarded`
   pins that decision instead, so a future reading of spec R-24 cannot quietly re-add it without
   turning a test red and having the conversation.
2. **B-10 re-plants the two `follow` rows after the block.** Four of the nine FILTER_LIST paths
   read `follow` (`/notes/friends-feed`, `/users/following`,
   `/userbooks/friends/currently-reading`, `/books/recommendations`), and R-21 deletes both rows
   at block time — so without a planted row those four parameters would pass with the filter
   removed, and MUT-4I-39/42/43/44 would not bite. tests.md names this exception for B-12 only;
   it is needed on all four, and the deletion itself is covered by B-01 and B-06.

FEED PAGINATION, WHICH HAS ALREADY CAUSED ONE FALSE PASS HERE
=============================================================
`tests/conftest.py` shares one in-memory database across the whole suite and
`tests/test_notes.py::_seed_public_notes` dates its notes **+365 days** so they lead the global
feed. A note of ours dated "now" falls off the page in a whole-suite run and is then absent for
the wrong reason — a false pass. Every note this file creates is dated far further ahead and
every feed read uses `?limit=200`, and the "C is present" control is what turns a pagination
accident into a loud failure rather than a green assertion about nothing.
"""
import subprocess
import warnings
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app import blocks, models, schema_guard
from app.deps import deny_bot_actor
from app.main import app
from app.models import Block
from app.notifications import dispatcher
from app.routers import blocks_router
from tests.conftest import _auth, _make_user, engine

# ── The import guard (rule 5): a missing or renamed symbol is ONE loud collection error here,
#    never N silent passes in the cases below.
assert callable(blocks.hidden_user_ids) and callable(blocks.is_blocked_pair)
assert callable(blocks.sever_relationships), "P3 has not added the one-transaction teardown"
assert callable(blocks_router.block_user) and callable(blocks_router.unblock_user)
assert callable(blocks_router.list_blocks)
assert hasattr(Block, "blocked_id"), "P1-B has not added the column"

REPO_ROOT = Path(__file__).resolve().parents[1]

# Both directions of every serving-path case. The length is asserted by B-09 before any
# parameter runs, so a direction cannot be quietly dropped (rule 9).
DIRECTIONS = ("blocker", "blocked")

HIDE_404 = "hide_404"
FILTER_LIST = "filter_list"

# The ONE body every single-subject refusal answers with. It is what `/profile/{id}`,
# `/users/{id}/stats`, `/userbooks/user/{id}` and `/reading-activity/user/{id}/daily` already
# answer for a user id that has never existed, so a block is indistinguishable from a deleted
# account (R-20's asymmetric control, B-13a).
DELETED_ACCOUNT_BODY = b'{"detail":"User not found"}'

# A user id no row has ever had, for the "deleted account" half of B-13a.
NEVER_EXISTED = 987654321


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _block(client, blocker, blocked_id):
    """Create a block through the REAL route (rule 12), asserting the 200 inline.

    No test in this file plants a `Block` row to reach a blocked state. If it did, B-01's
    unfollow and the one-transaction guarantee would be uncovered: the row would exist and the
    teardown would never have run.
    """
    r = client.post(f"/blocks/{blocked_id}", headers=_auth(blocker))
    assert r.status_code == 200, f"arrange step failed: {r.status_code} {r.text[:200]}"
    assert r.json() == {"blocked": True}
    return r


def _follow(client, follower, followed_id, *, expect=200):
    r = client.post(f"/follow/{followed_id}", headers=_auth(follower))
    assert r.status_code == expect, f"{r.status_code} {r.text[:200]}"
    return r


def _plant_follow(db, follower_id, followed_id):
    """Insert a `follow` row directly, DEFEATING R-21 on purpose.

    Named exception to rule 12, extended from tests.md's B-12 to every follow-derived path (see
    the module docstring). The point of these four cases is the FILTER, and the filter is only
    under test when the row R-21 deletes is back.
    """
    db.add(models.Follow(follower_id=follower_id, followed_id=followed_id))
    db.commit()


def _warm(client, *users):
    """Absorb the once-a-local-day `last_active` write (deps.py:87) before counting."""
    for u in users:
        client.get("/profile/me", headers=_auth(u))


# ── Shared-database hygiene (found by running the whole suite, not by reading) ────────────
#
# `tests/conftest.py` keeps ONE in-memory database for the whole session, and this file is first
# alphabetically, so everything it leaves behind is somebody else's problem. Two ways it bit,
# both measured rather than predicted:
#
# 1. `/notes/feed` is a GLOBAL feed, newest first, 50 to a page. Every world below dates its
#    notes far in the future so they lead that page while the case runs — and ~120 far-future
#    public notes left behind pushed `tests/test_notes.py`'s own +365-day notes off the page.
#    13 cases in test_books.py, test_bots.py and test_notes.py went red in a whole-suite run
#    and were green one file at a time.
# 2. `/admin/users?limit=200` pages, and the ~200 readers these cases create pushed
#    `tests/test_bots.py::test_admin_lists_carry_is_bot`'s two accounts off the first page.
#
# So every row these cases create is removed afterwards, in dependency order, and the database
# is left as it was found. That is cheaper and more honest than widening somebody else's limit.
@pytest.fixture(autouse=True)
def _leave_the_shared_database_as_we_found_it(db):
    from sqlmodel import func as _func

    def _high(model):
        return db.exec(select(_func.max(model.id))).one() or 0

    before_user = _high(models.User)
    before_note = _high(models.Note)
    before_group = _high(models.ReadingGroup)
    yield
    db.rollback()

    new_users = [u for u in db.exec(select(models.User).where(
        models.User.id > before_user)).all()]
    uids = {u.id for u in new_users}
    new_groups = [g for g in db.exec(select(models.ReadingGroup).where(
        models.ReadingGroup.id > before_group)).all()]
    gids = {g.id for g in new_groups}

    # Circle children first: group_member / group_post / group_activity all carry a
    # reading_group FK, so the groups cannot go before them.
    for model in (models.GroupActivity, models.GroupPost, models.GroupMember):
        for row in db.exec(select(model)).all():
            if row.group_id in gids or row.user_id in uids:
                db.delete(row)
    for row in db.exec(select(models.GroupMember)).all():
        if row.invited_by in uids:
            row.invited_by = None
            db.add(row)
    db.commit()

    # Notes created by anybody during the case, with their likes and comments, then every row
    # belonging to a reader created during the case.
    fresh_notes = db.exec(select(models.Note).where(models.Note.id > before_note)).all()
    note_ids = {n.id for n in fresh_notes}
    for model in (models.Like, models.Comment):
        for row in db.exec(select(model)).all():
            if row.note_id in note_ids or row.user_id in uids:
                db.delete(row)
    db.commit()
    for n in fresh_notes:
        db.delete(n)
    for row in db.exec(select(models.Note)).all():
        if row.user_id in uids:
            db.delete(row)
    db.commit()

    for model, cols in ((models.Block, ("blocker_id", "blocked_id")),
                        (models.Follow, ("follower_id", "followed_id")),
                        (models.Report, ("reporter_id", "target_user_id")),
                        (models.NotificationLog, ("user_id", "actor_id")),
                        (models.PushToken, ("user_id",)),
                        (models.ReadingActivity, ("user_id",)),
                        (models.Journal, ("user_id",)),
                        (models.UserBook, ("user_id",))):
        for row in db.exec(select(model)).all():
            if any(getattr(row, c, None) in uids for c in cols):
                db.delete(row)
    db.commit()
    for g in new_groups:
        db.delete(g)
    db.commit()
    for u in new_users:
        db.delete(u)
    db.commit()


class _Spy:
    """Records every call instead of firing it (`tests/test_bots.py:86`'s shape)."""

    def __init__(self):
        self.calls = []

    def __call__(self, *args, **kwargs):
        self.calls.append(kwargs or args)
        return {"sent": 0, "spied": True}


# ══════════════════════════════════════════════════════════════════════════════
# P1-B — the table, the guard, PM step 11
# ══════════════════════════════════════════════════════════════════════════════

class TestBlockTable:
    """B-50..B-52."""

    def test_column_shape(self):
        """B-50. MUT-4I-29: drop the `blocked_id` index. MUT: add a column."""
        cols = {c.name: (str(c.type), c.nullable) for c in Block.__table__.columns}
        assert set(cols) == {"id", "blocker_id", "blocked_id", "created_at"}, cols
        assert cols["blocker_id"][1] is False
        assert cols["blocked_id"][1] is False
        assert cols["created_at"][1] is False
        # No foreign keys: the cascade deletes both directions itself and a FK would turn a
        # missed cascade step into a 500 instead of the orphan row P-4I-08 looks for.
        assert Block.__table__.foreign_keys == set()
        # `ix_block_blocked` by that exact name, because PM step 11 creates it by that name.
        # `Field(index=True)` would have produced `ix_block_blocked_id` and the model and the
        # migration would have disagreed for ever without anything noticing.
        assert sorted(i.name for i in Block.__table__.indexes) == ["ix_block_blocked"]
        assert [c.name for c in list(Block.__table__.indexes)[0].columns] == ["blocked_id"]

    def test_uq_block_pair_is_the_database(self, db):
        """B-50a. MUT-4I-02b: drop the UniqueConstraint -> DID NOT RAISE."""
        names = {c.name for c in Block.__table__.constraints if c.name}
        assert "uq_block_pair" in names, names

        a = _make_user(db, email="4i-b50a-a@example.com", name="B50aA")
        b = _make_user(db, email="4i-b50a-b@example.com", name="B50aB")
        c = _make_user(db, email="4i-b50a-c@example.com", name="B50aC")
        db.add(models.Block(blocker_id=a.id, blocked_id=b.id))
        db.commit()

        # CONTROL 1: the REVERSE pair commits. The table is not symmetric in storage — the
        # symmetry is in the read — and a "fix" that stored two rows per block would make this
        # control meaningless, so it is asserted rather than assumed.
        db.add(models.Block(blocker_id=b.id, blocked_id=a.id))
        db.commit()
        # CONTROL 2: a third, unrelated pair commits.
        db.add(models.Block(blocker_id=a.id, blocked_id=c.id))
        db.commit()

        db.add(models.Block(blocker_id=a.id, blocked_id=b.id))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_schema_guard_entry(self):
        """B-51. MUT-4I-04b: drop ("block","blocked_id") from REQUIRED_COLUMNS."""
        pairs = schema_guard.REQUIRED_COLUMNS
        assert ("block", "blocked_id") in pairs, pairs
        # A literal, not `>= 8`: the point of the count is that a sprint cannot REPLACE a pair
        # and have it read as an append.
        assert len(pairs) == 8, pairs
        from sqlmodel import SQLModel
        tables = SQLModel.metadata.tables
        for tname, cname in pairs:
            assert tname in tables, tname
            assert cname in tables[tname].columns, f"{tname}.{cname}"

    def test_guard_raises_naming_block_blocked_id(self, monkeypatch):
        """B-52. MUT-4I-04b: the same drop -> DID NOT RAISE RuntimeError.

        The stub serves the full required list MINUS ("block","blocked_id"), by subtraction, so
        the case cannot go stale when a later sprint appends a pair.
        """
        class _FakeResult:
            def __init__(self, rows):
                self._rows = rows

            def all(self):
                return self._rows

        class _FakeConn:
            def __init__(self, rows):
                self._rows = rows

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def execute(self, *a, **k):
                return _FakeResult(self._rows)

        class _FakeDialect:
            name = "postgresql"

        class _FakeEngine:
            def __init__(self, rows):
                self._rows = rows
                self.dialect = _FakeDialect()

            def connect(self):
                return _FakeConn(self._rows)

        full = list(schema_guard.REQUIRED_COLUMNS)
        minus = [p for p in full if p != ("block", "blocked_id")]
        assert len(minus) == len(full) - 1

        with pytest.raises(RuntimeError) as exc:
            schema_guard.assert_migrated(_FakeEngine(minus))
        msg = str(exc.value)
        assert "block.blocked_id" in msg, msg
        assert "report.reason" not in msg, msg          # only the missing one is named

        # CONTROL: the full list does not raise, so "it raised" is about the subtraction.
        schema_guard.assert_migrated(_FakeEngine(full))


class TestBlockSQL:
    """B-53 — PM step 11 in context/PM_SQL_QUEUE.md."""

    def _queue(self):
        return (REPO_ROOT / "context" / "PM_SQL_QUEUE.md").read_text(encoding="utf-8")

    def _section(self, whole, heading):
        start = whole.index(heading)
        after = whole.index("\n## ", start + len(heading))
        return whole[start:after]

    def test_step_11_is_bounded_idempotent_and_additive(self):
        """B-53. MUT-4I-05b: drop `IF NOT EXISTS`, or put step 11 before step 10."""
        whole = self._queue()
        for heading in ("## 6. Sprint 4F", "## 8. Sprint 4G", "## 10. Sprint 4I-A",
                        "## 11. Sprint 4I-B"):
            assert heading in whole, heading

        section = self._section(whole, "## 11. Sprint 4I-B")
        assert len(section) > 400, "the bound collapsed — this case would assert nothing"

        for stmt in ("CREATE TABLE IF NOT EXISTS block",
                     "CREATE UNIQUE INDEX IF NOT EXISTS uq_block_pair ON block (blocker_id, blocked_id)",
                     "CREATE INDEX IF NOT EXISTS ix_block_blocked ON block (blocked_id)"):
            assert stmt in section, stmt
        for banned in ("UPDATE ", "DELETE FROM", "DROP ", "ALTER "):
            assert banned not in section, banned

        # The PM works down this file in order, so the order is a property of the file.
        assert whole.index("## 10. Sprint 4I-A") < whole.index("## 11. Sprint 4I-B")
        # And the earlier sections still bound on themselves and not on each other.
        assert "Sprint 4F" in self._section(whole, "## 6. Sprint 4F")
        assert "block" not in self._section(whole, "## 9. Sprint 4H")
        assert "CREATE TABLE IF NOT EXISTS block" not in self._section(
            whole, "## 10. Sprint 4I-A")


# ══════════════════════════════════════════════════════════════════════════════
# P3 — block semantics
# ══════════════════════════════════════════════════════════════════════════════

class TestBlockSemantics:
    """B-01..B-08."""

    def test_blocking_deletes_both_follows(self, client, db):
        """B-01. MUT-4I-31: delete only one direction of the unfollow."""
        a = _make_user(db, email="4i-b01-a@example.com", name="B01A")
        b = _make_user(db, email="4i-b01-b@example.com", name="B01B")
        c = _make_user(db, email="4i-b01-c@example.com", name="B01C")
        _follow(client, a, b.id)
        _follow(client, b, a.id)
        _follow(client, c, b.id)            # the control follow, by an uninvolved reader
        before = len(db.exec(select(models.Follow)).all())

        _block(client, a, b.id)

        db.expire_all()
        assert len(db.exec(select(models.Block).where(
            models.Block.blocker_id == a.id, models.Block.blocked_id == b.id)).all()) == 1
        assert db.exec(select(models.Follow).where(
            models.Follow.follower_id == a.id, models.Follow.followed_id == b.id)).first() is None
        assert db.exec(select(models.Follow).where(
            models.Follow.follower_id == b.id, models.Follow.followed_id == a.id)).first() is None
        assert len(db.exec(select(models.Follow)).all()) == before - 2
        # CONTROL: the delete was targeted, not a sweep of everything touching B.
        assert db.exec(select(models.Follow).where(
            models.Follow.follower_id == c.id, models.Follow.followed_id == b.id)).first() is not None

    def test_blocking_twice_is_200_and_one_row(self, client, db):
        """B-02. MUT-4I-09b: remove the IntegrityError catch -> assert 500 == 200."""
        a = _make_user(db, email="4i-b02-a@example.com", name="B02A")
        b = _make_user(db, email="4i-b02-b@example.com", name="B02B")
        first = client.post(f"/blocks/{b.id}", headers=_auth(a))
        second = client.post(f"/blocks/{b.id}", headers=_auth(a))
        assert first.status_code == 200, first.text
        assert second.status_code == 200, second.text
        assert second.json() == first.json()     # tapping Block twice tells them nothing new
        db.expire_all()
        assert len(db.exec(select(models.Block).where(
            models.Block.blocker_id == a.id, models.Block.blocked_id == b.id)).all()) == 1

    def test_blocking_yourself_is_400(self, client, db):
        """B-03. MUT-4I-32: allow a self-block -> assert 200 == 400."""
        a = _make_user(db, email="4i-b03-a@example.com", name="B03A")
        b = _make_user(db, email="4i-b03-b@example.com", name="B03B")
        r = client.post(f"/blocks/{a.id}", headers=_auth(a))
        assert r.status_code == 400, r.text
        db.expire_all()
        assert db.exec(select(models.Block).where(
            models.Block.blocker_id == a.id, models.Block.blocked_id == a.id)).first() is None
        # CONTROL: blocking somebody else is 200, so the 400 is about self and not about the route.
        _block(client, a, b.id)

    def test_a_bot_cannot_block(self, client, db):
        """B-04. MUT-4I-14b: remove Depends(deny_bot_actor) -> assert 200 == 403."""
        bot = _make_user(db, email="4i-b04-bot@trackmyread.com", name="B04Bot")
        bot.is_bot = True
        db.add(bot)
        db.commit()
        reader = _make_user(db, email="4i-b04-reader@example.com", name="B04R")
        target = _make_user(db, email="4i-b04-target@example.com", name="B04T")

        r = client.post(f"/blocks/{target.id}", headers=_auth(bot))
        assert r.status_code == 403, r.text
        db.expire_all()
        assert db.exec(select(models.Block).where(
            models.Block.blocker_id == bot.id)).first() is None
        # CONTROL: a reader's identical call is 200.
        _block(client, reader, target.id)

    def test_the_guarded_route_inventory_is_six(self):
        """B-04a (K-4I-02). MUT-4I-15b: move the bot check into the handler body, or guard
        DELETE /blocks/{user_id} as well -> the count or the membership assertion."""
        api_routes = [r for r in app.routes if isinstance(r, APIRoute)]
        assert len(api_routes) >= 100, "the walk found almost no routes — it would pass vacuously"

        found = set()
        for route in api_routes:
            calls = {d.call for d in route.dependant.dependencies}
            if deny_bot_actor in calls:
                for method in route.methods:
                    found.add((method, route.path))

        from tests.test_bots import GUARDED_ROUTES
        assert len(found) == 6, f"expected 6, found {len(found)}: {sorted(found)}"
        assert found == GUARDED_ROUTES, sorted(found ^ GUARDED_ROUTES)
        assert ("POST", "/reports") in found
        assert ("POST", "/blocks/{user_id}") in found
        # A bot can hold no block row to lift, so guarding the DELETE would widen the inventory
        # for a route that cannot be reached with effect.
        assert ("DELETE", "/blocks/{user_id}") not in found
        assert not [p for m, p in found if m == "GET"], "a GET must never carry deny_bot_actor"

    @pytest.mark.parametrize("direction", DIRECTIONS)
    def test_follow_is_403_for_a_blocked_pair(self, client, db, monkeypatch, direction):
        """B-05. MUT-4I-33: put the check below db.add / add_task -> the spy or the row count.
        MUT-4I-30: a one-directional filter -> the `blocked` parameter."""
        assert len(DIRECTIONS) == 2
        tag = f"4i-b05-{direction}"
        a = _make_user(db, email=f"{tag}-a@example.com", name="B05A")
        b = _make_user(db, email=f"{tag}-b@example.com", name="B05B")
        c = _make_user(db, email=f"{tag}-c@example.com", name="B05C")
        _block(client, a, b.id)
        actor, other = (a, b) if direction == "blocker" else (b, a)

        spy = _Spy()
        monkeypatch.setattr("app.routers.follow_router.fire_event", spy)
        before = len(db.exec(select(models.Follow)).all())

        r = client.post(f"/follow/{other.id}", headers=_auth(actor))
        assert r.status_code == 403, r.text
        db.expire_all()
        assert len(db.exec(select(models.Follow)).all()) == before
        assert spy.calls == [], spy.calls

        # The body is identical whichever of the two blocked, so the blocked reader cannot tell
        # a block from a platform rule.
        other_way = client.post(f"/follow/{actor.id}", headers=_auth(other))
        assert other_way.status_code == 403
        assert other_way.content == r.content

        # CONTROL: the same reader follows a third party and fires exactly one event.
        ok = client.post(f"/follow/{c.id}", headers=_auth(actor))
        assert ok.status_code == 200, ok.text
        assert len(spy.calls) == 1, spy.calls

    def test_unblock_removes_the_row_and_restores_nothing(self, client, db):
        """B-06. MUT-4I-34: restore the follows on unblock -> assert 2 == 0."""
        a = _make_user(db, email="4i-b06-a@example.com", name="B06A")
        b = _make_user(db, email="4i-b06-b@example.com", name="B06B")
        _follow(client, a, b.id)
        _follow(client, b, a.id)
        _block(client, a, b.id)
        db.expire_all()
        after_block = len(db.exec(select(models.Follow)).all())
        logs_before = len(db.exec(select(models.NotificationLog).where(
            models.NotificationLog.user_id == b.id)).all())

        r = client.delete(f"/blocks/{b.id}", headers=_auth(a))
        assert r.status_code == 200, r.text
        db.expire_all()
        assert db.exec(select(models.Block).where(
            models.Block.blocker_id == a.id, models.Block.blocked_id == b.id)).first() is None
        # The follows do NOT come back. This is the irreversible half of R-21 and the whole
        # reason the confirm copy has to say so before the tap.
        assert len(db.exec(select(models.Follow)).all()) == after_block
        # And B is told nothing, by the block or by the unblock.
        assert len(db.exec(select(models.NotificationLog).where(
            models.NotificationLog.user_id == b.id)).all()) == logs_before

    def test_get_blocks_returns_only_outbound(self, client, db):
        """B-07. MUT-4I-35: include inbound blocks -> assert 2 == 1, then B's list is non-empty."""
        a = _make_user(db, email="4i-b07-a@example.com", name="B07A")
        b = _make_user(db, email="4i-b07-b@example.com", name="B07B")
        c = _make_user(db, email="4i-b07-c@example.com", name="B07C")
        _block(client, a, b.id)
        _block(client, c, a.id)

        mine = client.get("/blocks", headers=_auth(a))
        assert mine.status_code == 200, mine.text
        rows = mine.json()
        assert len(rows) == 1, rows
        assert rows[0]["user_id"] == b.id
        assert rows[0]["name"] == "B07B"
        assert set(rows[0]) >= {"user_id", "name", "username", "profile_picture"}
        assert c.id not in [r["user_id"] for r in rows], "an INBOUND block leaked into the list"

        # B learns nothing — R-20's asymmetric control is the whole of why the list is outbound.
        assert client.get("/blocks", headers=_auth(b)).json() == []
        # CONTROL: C's own list does contain A, so "empty" is about direction, not about the route.
        assert [r["user_id"] for r in client.get("/blocks", headers=_auth(c)).json()] == [a.id]

    def test_get_blocks_does_not_scale(self, client, db, stmt_counter):
        """B-07a (K-4I-14). MUT-4I-20b: a per-row db.get of each blocked reader.

        `GET /blocks` is deliberately NOT in tests/test_query_budget.py (E-7), so the ceiling
        lives here. Measured on this branch: 3 statements (the reader, the blocks, the users).
        """
        a = _make_user(db, email="4i-b07a-a@example.com", name="B07aA")
        one = _make_user(db, email="4i-b07a-one@example.com", name="B07aOne")
        _block(client, a, one.id)
        _warm(client, a)

        stmt_counter.reset()
        client.get("/blocks", headers=_auth(a))
        at_one = stmt_counter.selects

        for i in range(24):
            other = _make_user(db, email=f"4i-b07a-f{i}@example.com", name=f"B07aF{i}")
            _block(client, a, other.id)
        assert len(client.get("/blocks", headers=_auth(a)).json()) == 25

        stmt_counter.reset()
        client.get("/blocks", headers=_auth(a))
        at_twentyfive = stmt_counter.selects

        assert at_one == at_twentyfive, (
            f"{at_one} statements at 1 block and {at_twentyfive} at 25 — the serialisation is "
            "per row")
        assert at_twentyfive <= 3, at_twentyfive

    def test_the_block_and_the_unfollow_are_one_transaction(self, client, db, monkeypatch,
                                                            stmt_counter):
        """B-08. MUT-4I-36: commit twice -> an orphan block survives the forced failure."""
        a = _make_user(db, email="4i-b08-a@example.com", name="B08A")
        b = _make_user(db, email="4i-b08-b@example.com", name="B08B")
        _follow(client, a, b.id)
        _follow(client, b, a.id)
        db.expire_all()
        blocks_before = len(db.exec(select(models.Block)).all())
        follows_before = len(db.exec(select(models.Follow)).all())

        # The teardown is made to raise AFTER the block row has been added to the session. If
        # the row were committed before the teardown, it would survive this and the pair would
        # be blocked and still following each other.
        def _boom(db_, x, y):
            raise RuntimeError("B-08: forced failure after the insert")

        monkeypatch.setattr("app.blocks.sever_relationships", _boom)
        # `app/main.py` installs a global exception handler, so an unhandled error becomes a
        # 500 response rather than propagating out of TestClient. Either way the request failed;
        # what this case is about is what it LEFT BEHIND.
        failed = client.post(f"/blocks/{b.id}", headers=_auth(a))
        assert failed.status_code == 500, failed.text

        db.rollback()
        db.expire_all()
        assert len(db.exec(select(models.Block)).all()) == blocks_before, "an orphan block survived"
        assert len(db.exec(select(models.Follow)).all()) == follows_before

        monkeypatch.undo()
        _warm(client, a)
        stmt_counter.reset()
        _block(client, a, b.id)
        # One commit: the counter sees no second INSERT batch, and the rows agree.
        db.expire_all()
        assert len(db.exec(select(models.Block)).all()) == blocks_before + 1
        assert len(db.exec(select(models.Follow)).all()) == follows_before - 2
        assert stmt_counter.inserts == 1, (
            f"{stmt_counter.inserts} INSERTs for one block — the block row and the teardown "
            "must be one transaction with one row written")


# ══════════════════════════════════════════════════════════════════════════════
# P3 — the fourteen serving paths, both directions each
# ══════════════════════════════════════════════════════════════════════════════

class _World:
    """Three readers — A, B and an uninvolved C — with content on every filtered path.

    Every reader's `name` and `username` is the single token `ZZ<tag><who>`, and every piece of
    their content carries it too, so ONE sentinel covers "their name is absent" and "their words
    are absent" on every path. `friend_name` in `/books/recommendations` is
    `name.split()[0]`, which is why the name is one word.
    """


def _make_world(db, client, tag, *, future_days=900):
    w = _World()
    w.tag = tag
    w.sent = {}
    users = {}
    for who in ("a", "b", "c"):
        sentinel = f"ZZ{tag}{who.upper()}"
        u = _make_user(db, email=f"4i-{tag}-{who}@example.com", name=sentinel)
        u.username = sentinel
        db.add(u)
        users[who] = u
        w.sent[who] = sentinel
    db.commit()
    for u in users.values():
        db.refresh(u)
    w.a, w.b, w.c = users["a"], users["b"], users["c"]
    w.by_id = {u.id: k for k, u in users.items()}

    future = datetime.utcnow() + timedelta(days=future_days)
    w.note = {}
    w.userbook = {}
    for who, u in users.items():
        book = models.Book(title=f"{w.sent[who]} Book", author=w.sent[who], total_pages=200)
        db.add(book)
        db.commit()
        db.refresh(book)
        ub = models.UserBook(user_id=u.id, book_id=book.id, status="reading", current_page=10,
                             updated_at=future)
        db.add(ub)
        db.commit()
        db.refresh(ub)
        w.userbook[who] = ub
        note = models.Note(user_id=u.id, userbook_id=ub.id, text=f"{w.sent[who]}-NOTE",
                           is_public=True, created_at=future)
        db.add(note)
        db.commit()
        db.refresh(note)
        w.note[who] = note
        db.add(models.ReadingActivity(user_id=u.id, userbook_id=ub.id, pages_read=10,
                                      current_page=10, date=datetime.utcnow(), local_day=True))
    db.commit()

    # A public note owned by C, with a comment from each of the three. C is both the owner and
    # the control commenter, which is fine: the assertion is about the OTHER reader's comment.
    w.third_note = models.Note(user_id=w.c.id, userbook_id=w.userbook["c"].id,
                               text=f"ZZ{tag}THIRD-NOTE", is_public=True, created_at=future)
    db.add(w.third_note)
    db.commit()
    db.refresh(w.third_note)
    for who, u in users.items():
        db.add(models.Comment(note_id=w.third_note.id, user_id=u.id,
                              text=f"{w.sent[who]}-COMMENT"))
    db.commit()

    # One circle all three are active members of, each with a post and an activity row.
    g = models.ReadingGroup(name=f"ZZ{tag} Circle", description="d", is_private=False,
                            created_by=w.c.id)
    db.add(g)
    db.commit()
    db.refresh(g)
    w.group = g
    for who, u in users.items():
        db.add(models.GroupMember(group_id=g.id, user_id=u.id,
                                  role="curator" if who == "c" else "member", status="active"))
        db.add(models.GroupPost(group_id=g.id, user_id=u.id, text=f"{w.sent[who]}-POST",
                                created_at=future))
        db.add(models.GroupActivity(group_id=g.id, user_id=u.id, event_type="book_started",
                                    payload=None, created_at=future))
    db.commit()
    return w


def _url_feed(w, viewer, other):
    return "/notes/feed?limit=200"


FILTERED_PATHS = (
    # (arch_id, route_path, mode, url_builder(world, viewer, other))
    ("B-10", "/notes/feed", FILTER_LIST, lambda w, v, o: "/notes/feed?limit=200"),
    ("B-12", "/notes/friends-feed", FILTER_LIST, lambda w, v, o: "/notes/friends-feed?limit=200"),
    ("B-13", "/notes/user/{user_id}", HIDE_404, lambda w, v, o: f"/notes/user/{o.id}"),
    ("B-14", "/notes/{note_id}/comments", FILTER_LIST,
     lambda w, v, o: f"/notes/{w.third_note.id}/comments"),
    ("B-16", "/profile/{user_id}", HIDE_404, lambda w, v, o: f"/profile/{o.id}"),
    ("B-17", "/users/{user_id}/stats", HIDE_404, lambda w, v, o: f"/users/{o.id}/stats"),
    ("B-18", "/users/search", FILTER_LIST, lambda w, v, o: f"/users/search?q=ZZ{w.tag}"),
    ("B-19", "/users/following", FILTER_LIST, lambda w, v, o: "/users/following"),
    ("B-20", "/userbooks/user/{user_id}", HIDE_404, lambda w, v, o: f"/userbooks/user/{o.id}"),
    ("B-21", "/userbooks/friends/currently-reading", FILTER_LIST,
     lambda w, v, o: "/userbooks/friends/currently-reading?limit=200"),
    ("B-22", "/books/recommendations", FILTER_LIST,
     lambda w, v, o: "/books/recommendations?limit=200"),
    ("B-23", "/reading-activity/user/{user_id}/daily", HIDE_404,
     lambda w, v, o: f"/reading-activity/user/{o.id}/daily?days=30"),
    ("B-24", "/groups/{group_id}/posts", FILTER_LIST,
     lambda w, v, o: f"/groups/{w.group.id}/posts"),
    ("B-25", "/groups/{group_id}/activity", FILTER_LIST,
     lambda w, v, o: f"/groups/{w.group.id}/activity"),
)

HIDE_404_PATHS = tuple(p for p in FILTERED_PATHS if p[2] == HIDE_404)
PARAMS = [(spec, d) for spec in FILTERED_PATHS for d in DIRECTIONS]
PARAM_IDS = [f"{spec[0]}-{d}" for spec in FILTERED_PATHS for d in DIRECTIONS]


class TestBlockServingPaths:
    """B-09..B-37."""

    def test_the_path_table_is_whole(self):
        """B-09. MUT-4I-37: drop a path from FILTERED_PATHS -> assert 13 == 14."""
        assert len(FILTERED_PATHS) == 14, [p[0] for p in FILTERED_PATHS]
        assert len(DIRECTIONS) == 2
        assert len(PARAMS) == 28
        ids = [p[0] for p in FILTERED_PATHS]
        assert len(set(ids)) == 14, ids
        assert {p[2] for p in FILTERED_PATHS} <= {HIDE_404, FILTER_LIST}
        assert len(HIDE_404_PATHS) == 5, [p[0] for p in HIDE_404_PATHS]

        # Every route_path resolves to a REAL route. A typo would otherwise make a parameter
        # exercise a 404 for the wrong reason and pass.
        real = {r.path for r in app.routes if isinstance(r, APIRoute) and "GET" in r.methods}
        missing = [p[1] for p in FILTERED_PATHS if p[1] not in real]
        assert missing == [], missing

        # And the set equals the table written in tests.md section 7, typed once here.
        assert {p[1] for p in FILTERED_PATHS} == {
            "/notes/feed", "/notes/friends-feed", "/notes/user/{user_id}",
            "/notes/{note_id}/comments", "/profile/{user_id}", "/users/{user_id}/stats",
            "/users/search", "/users/following", "/userbooks/user/{user_id}",
            "/userbooks/friends/currently-reading", "/books/recommendations",
            "/reading-activity/user/{user_id}/daily", "/groups/{group_id}/posts",
            "/groups/{group_id}/activity",
        }

    @pytest.mark.parametrize("spec,direction", PARAMS, ids=PARAM_IDS)
    def test_a_blocked_pair_is_invisible(self, client, db, spec, direction):
        """B-10, 14 paths x both directions.

        MUT-4I-38..45, one per call site -> that path's two parameters.
        MUT-4I-30 (transpose one `or_` arm in app/blocks.py) -> every `blocked` parameter.
        """
        arch_id, route_path, mode, url = spec
        tag = f"{arch_id.replace('-', '').lower()}{direction}"
        w = _make_world(db, client, tag)
        _block(client, w.a, w.b.id)
        viewer, other = (w.a, w.b) if direction == "blocker" else (w.b, w.a)

        # The four follow-derived paths need the row R-21 just deleted (module docstring).
        _plant_follow(db, viewer.id, other.id)
        _plant_follow(db, viewer.id, w.c.id)

        theirs = w.sent[w.by_id[other.id]]
        control = w.sent["c"]

        if mode == HIDE_404:
            r = client.get(url(w, viewer, other), headers=_auth(viewer))
            assert r.status_code == 404, f"{arch_id}: {r.status_code} {r.text[:200]}"
            assert r.content == DELETED_ACCOUNT_BODY, r.content
            # CONTROL, same request shape: the uninvolved reader is still served.
            ok = client.get(url(w, viewer, w.c), headers=_auth(viewer))
            assert ok.status_code == 200, f"{arch_id} control: {ok.status_code} {ok.text[:200]}"
        else:
            r = client.get(url(w, viewer, other), headers=_auth(viewer))
            assert r.status_code == 200, f"{arch_id}: {r.status_code} {r.text[:200]}"
            assert theirs not in r.text, (
                f"{arch_id} [{direction}]: {theirs} LEAKED into {url(w, viewer, other)}")
            # rule 10: without this, a filter that returns [] for everybody passes.
            assert control in r.text, (
                f"{arch_id} [{direction}]: the control reader {control} is absent too, so the "
                f"body proves nothing — setup or pagination, not the filter. Body: {r.text[:300]}")

    def test_the_anonymous_feed_is_unfiltered_and_never_calls_the_helper(self, client, db,
                                                                         monkeypatch):
        """B-11 (E-8). MUT-4I-47: call the helper for an anonymous viewer -> assert 1 == 0."""
        w = _make_world(db, client, "b11", future_days=905)
        _block(client, w.a, w.b.id)

        calls = []
        real = blocks.hidden_user_ids

        def counting(db_, viewer):
            calls.append(getattr(viewer, "id", viewer))
            return real(db_, viewer)

        monkeypatch.setattr("app.blocks.hidden_user_ids", counting)

        anon = client.get("/notes/feed?limit=200")
        assert anon.status_code == 200, anon.text
        assert w.sent["a"] in anon.text, "A's public note is missing from the anonymous feed"
        assert w.sent["b"] in anon.text, "B's public note is missing from the anonymous feed"
        assert calls == [], (
            f"the helper ran {len(calls)} time(s) for a request with no viewer: {calls}")

        # CONTROL in the same test: signed in, it runs exactly ONCE and hides B.
        signed_in = client.get("/notes/feed?limit=200", headers=_auth(w.a))
        assert signed_in.status_code == 200
        assert w.sent["b"] not in signed_in.text
        assert w.sent["c"] in signed_in.text
        assert len(calls) == 1, calls

    @pytest.mark.parametrize("direction", DIRECTIONS)
    def test_friends_feed_is_filtered_even_with_a_planted_follow(self, client, db, direction):
        """B-12. MUT-4I-39: remove the notin_ and rely on R-21 -> this parameter.

        The one case that proves the filter is defence in depth over R-21 rather than a
        restatement of it: the `follow` row the block deleted is put back by hand.
        """
        w = _make_world(db, client, f"b12plant{direction}", future_days=910)
        _block(client, w.a, w.b.id)
        viewer, other = (w.a, w.b) if direction == "blocker" else (w.b, w.a)
        _plant_follow(db, viewer.id, other.id)
        _plant_follow(db, viewer.id, w.c.id)

        r = client.get("/notes/friends-feed?limit=200", headers=_auth(viewer))
        assert r.status_code == 200, r.text
        theirs = w.sent[w.by_id[other.id]]
        assert theirs not in r.text, f"{theirs} survived a planted follow"
        assert w.sent["c"] in r.text, "the control follow produced nothing — setup failure"

    @pytest.mark.parametrize("spec", HIDE_404_PATHS, ids=[p[0] for p in HIDE_404_PATHS])
    def test_the_404_body_is_the_deleted_account_body(self, client, db, spec):
        """B-13a. MUT-4I-48: return 403, an empty 200, or a distinct message -> the comparison.

        A block must be indistinguishable from a deleted account, or R-20's asymmetric-control
        clause is false: the blocked reader would learn from the status code exactly what had
        happened.
        """
        assert len(HIDE_404_PATHS) == 5
        arch_id, route_path, mode, url = spec
        w = _make_world(db, client, f"b13a{arch_id.replace('-', '').lower()}", future_days=915)
        _block(client, w.a, w.b.id)

        blocked = client.get(url(w, w.a, w.b), headers=_auth(w.a))

        class _Ghost:
            id = NEVER_EXISTED

        gone = client.get(url(w, w.a, _Ghost()), headers=_auth(w.a))

        assert blocked.status_code == 404, f"{arch_id}: {blocked.status_code} {blocked.text[:200]}"
        assert gone.status_code == 404, f"{arch_id} (never existed): {gone.status_code}"
        assert blocked.content == gone.content, (
            f"{arch_id}: a blocked pair answers {blocked.content!r} and a user id that never "
            f"existed answers {gone.content!r} — the block is distinguishable")

    @pytest.mark.parametrize("direction", DIRECTIONS)
    def test_a_blocked_readers_comment_leaves_no_text_behind(self, client, db, direction):
        """B-14 (K-4I-06). MUT-4I-18: filter users_map and keep the serialisation loop ->
        the sentinel assertion, because the TEXT would still be there with a null author."""
        w = _make_world(db, client, f"b14text{direction}", future_days=920)
        before = client.get(f"/notes/{w.third_note.id}/comments", headers=_auth(w.a))
        assert before.status_code == 200, before.text
        count_before = len(before.json())
        assert count_before == 3, before.json()

        _block(client, w.a, w.b.id)
        viewer, other = (w.a, w.b) if direction == "blocker" else (w.b, w.a)
        theirs = w.sent[w.by_id[other.id]]

        r = client.get(f"/notes/{w.third_note.id}/comments", headers=_auth(viewer))
        assert r.status_code == 200, r.text
        rows = r.json()
        assert len(rows) == count_before - 1, rows
        # id, text AND author all gone — asserting the TEXT is the point of this case.
        assert theirs not in r.text, f"{theirs}'s words survived the filter: {r.text[:300]}"
        assert f"{theirs}-COMMENT" not in r.text
        assert w.sent["c"] in r.text, "the control comment is absent too — setup failure"
        assert w.sent[w.by_id[viewer.id]] in r.text, "the viewer's own comment vanished"

    def test_no_comment_is_ever_served_with_a_null_author(self, client, db):
        """B-14a (K-4I-06). The same mutation (MUT-4I-18) -> a `{"user": None}` element.

        `get_comments` has a pre-existing `"user": None` branch for a comment whose author row
        is missing. That is exactly the shape a half-done filter produces, so it is named.
        """
        w = _make_world(db, client, "b14a", future_days=925)
        _block(client, w.a, w.b.id)
        d = _make_user(db, email="4i-b14a-d@example.com", name="ZZb14aD")
        db.add(models.Comment(note_id=w.third_note.id, user_id=d.id, text="ZZb14aD-COMMENT"))
        db.commit()

        for reader in (w.a, w.b, w.c, d):
            r = client.get(f"/notes/{w.third_note.id}/comments", headers=_auth(reader))
            assert r.status_code == 200, r.text
            nulls = [row for row in r.json() if row.get("user") is None]
            assert nulls == [], f"as {reader.name}: {nulls}"
            assert r.json(), f"as {reader.name}: the whole list is empty — setup failure"

    @pytest.mark.parametrize("direction", DIRECTIONS)
    def test_like_and_comment_are_refused_before_any_row_or_event(self, client, db, monkeypatch,
                                                                   stmt_counter, direction):
        """B-15. MUT-4I-33b: check inside the handler after db.add -> inserts; after add_task ->
        the spy."""
        w = _make_world(db, client, f"b15{direction}", future_days=930)
        _block(client, w.a, w.b.id)
        viewer, other = (w.a, w.b) if direction == "blocker" else (w.b, w.a)
        theirs_note = w.note[w.by_id[other.id]]

        spy = _Spy()
        monkeypatch.setattr("app.routers.likes_comments.fire_event", spy)
        _warm(client, viewer)

        stmt_counter.reset()
        like = client.post(f"/notes/{theirs_note.id}/like", headers=_auth(viewer))
        comment = client.post(f"/notes/{theirs_note.id}/comments", json={"text": "x"},
                              headers=_auth(viewer))
        assert like.status_code == 404, like.text
        assert comment.status_code == 404, comment.text
        assert stmt_counter.inserts == 0, "a row was written before the refusal"
        assert spy.calls == [], spy.calls

        # CONTROL in the same test: the same two calls against the uninvolved reader's note
        # succeed, write rows and fire at least one event — so "zero" is not "the counter broke".
        stmt_counter.reset()
        ok_like = client.post(f"/notes/{w.note['c'].id}/like", headers=_auth(viewer))
        ok_comment = client.post(f"/notes/{w.note['c'].id}/comments", json={"text": "y"},
                                 headers=_auth(viewer))
        assert ok_like.status_code == 201, ok_like.text
        assert ok_comment.status_code == 201, ok_comment.text
        assert stmt_counter.inserts >= 2, stmt_counter.inserts
        assert len(spy.calls) >= 1, spy.calls

    def test_unlike_is_deliberately_unguarded(self, client, db):
        """Replaces tests.md's B-15u, which pm-decisions struck ("R-24 — the unlike refusal:
        dropped"). MUT: add a block check to `unlike_note` -> assert 404 == 200.

        The decision is pinned from BOTH sides so it cannot drift: a blocked reader may still
        withdraw a like they left before the block, AND the pre-existing `Like` row is not
        deleted by the block (E-4 — removing it would rewrite the blocker's like count).
        """
        w = _make_world(db, client, "b15n", future_days=935)
        liked = client.post(f"/notes/{w.note['a'].id}/like", headers=_auth(w.b))
        assert liked.status_code == 201, liked.text
        _block(client, w.a, w.b.id)

        db.expire_all()
        row = db.exec(select(models.Like).where(
            models.Like.note_id == w.note["a"].id, models.Like.user_id == w.b.id)).first()
        assert row is not None, "E-4: the block must not delete a like left before it"

        r = client.delete(f"/notes/{w.note['a'].id}/like", headers=_auth(w.b))
        assert r.status_code == 200, r.text
        assert r.json() == {"message": "Unliked", "liked": False}
        db.expire_all()
        assert db.exec(select(models.Like).where(
            models.Like.note_id == w.note["a"].id, models.Like.user_id == w.b.id)).first() is None

    def test_the_refusal_precedes_every_write_in_source_order(self):
        """B-15a. MUT-4I-33b: move the guard below db.add in one handler ->
        assert ['like_note'] == [].

        A status-code test cannot prove ordering; this reads the source. `unlike_note` is
        deliberately absent from the inspected set — it has no guard by decision (see
        `test_unlike_is_deliberately_unguarded`), so demanding one here would contradict
        pm-decisions.
        """
        import ast
        src = (REPO_ROOT / "app" / "routers" / "likes_comments.py").read_text(encoding="utf-8")
        tree = ast.parse(src)
        wanted = {"like_note", "create_comment", "get_comments"}
        funcs = {n.name: n for n in ast.walk(tree)
                 if isinstance(n, ast.FunctionDef) and n.name in wanted}
        assert set(funcs) == wanted, sorted(funcs)       # assert found BEFORE asserting about

        def _violations(fn):
            guard = writes = None
            for i, stmt in enumerate(fn.body):
                text = ast.dump(stmt)
                if guard is None and ("_assert_can_view_note" in text
                                      or "hidden_user_ids" in text):
                    guard = i
                if writes is None and ("attr='add'" in text or "attr='delete'" in text
                                       or "attr='add_task'" in text):
                    writes = i
            if guard is None:
                return [f"{fn.name}: no guard found at statement level"]
            if writes is not None and writes < guard:
                return [fn.name]
            return []

        offenders = []
        for name in sorted(wanted):
            offenders += _violations(funcs[name])
        assert offenders == [], offenders

        # CONTROL (rule 3): a synthetic handler whose guard sits last reports exactly one.
        synthetic = ast.parse(
            "def bad(db, note, user):\n"
            "    db.add(1)\n"
            "    _assert_can_view_note(db, note, user)\n"
        ).body[0]
        assert _violations(synthetic) == ["bad"]

    @pytest.mark.parametrize("direction", DIRECTIONS)
    def test_a_block_404s_before_the_private_gate_and_never_opens_it(self, client, db, direction):
        """B-16. MUT-4I-50: move the block check below the private gate -> assert 200 == 404."""
        tag = f"b16gate{direction}"
        priv = _make_user(db, email=f"4i-{tag}-priv@example.com", name=f"ZZ{tag}P")
        priv.is_private_profile = True
        db.add(priv)
        other_priv = _make_user(db, email=f"4i-{tag}-priv2@example.com", name=f"ZZ{tag}Q")
        other_priv.is_private_profile = True
        db.add(other_priv)
        viewer = _make_user(db, email=f"4i-{tag}-v@example.com", name=f"ZZ{tag}V")
        db.commit()
        for u in (priv, other_priv, viewer):
            db.refresh(u)

        if direction == "blocker":
            _block(client, viewer, priv.id)
        else:
            _block(client, priv, viewer.id)

        r = client.get(f"/profile/{priv.id}", headers=_auth(viewer))
        assert r.status_code == 404, r.text
        assert r.content == DELETED_ACCOUNT_BODY, r.content

        # CONTROL (a): the private gate still works for an UNBLOCKED non-follower — 200 with
        # `locked: true`. So the 404 above is the block, not the gate.
        locked = client.get(f"/profile/{other_priv.id}", headers=_auth(viewer))
        assert locked.status_code == 200, locked.text
        assert locked.json()["locked"] is True
        assert locked.json()["stats"] is None
        # CONTROL (b): the blocked response is NOT that 200 shape.
        assert r.content != locked.content
        # CONTROL (c): the ORDER of the two checks, on a second path. An unblocked non-follower
        # of a private author gets 403 there; the blocked reader gets 404.
        assert client.get(f"/notes/user/{other_priv.id}",
                          headers=_auth(viewer)).status_code == 403
        assert client.get(f"/notes/user/{priv.id}", headers=_auth(viewer)).status_code == 404

    @pytest.mark.parametrize("direction", DIRECTIONS)
    def test_circle_structure_survives_a_block(self, client, db, direction):
        """B-26 (E-2). MUT-4I-51: filter the member list -> the count-vs-list agreement.

        The accepted residual of E-2, asserted as a POSITIVE control so a future "fix" that
        starts filtering Members has to be a decision rather than a quiet change.
        """
        w = _make_world(db, client, f"b26{direction}", future_days=940)
        _block(client, w.a, w.b.id)
        viewer, other = (w.a, w.b) if direction == "blocker" else (w.b, w.a)
        theirs = w.sent[w.by_id[other.id]]

        members = client.get(f"/groups/{w.group.id}/members", headers=_auth(viewer))
        assert members.status_code == 200, members.text
        assert theirs in members.text, (
            "E-2: a block hides content and leaves structure. Filtering Members desynchronises "
            "member_count, which is a worse failure than a name in a list.")

        board = client.get(f"/groups/{w.group.id}/leaderboard?period=alltime",
                           headers=_auth(viewer))
        assert board.status_code == 200, board.text
        assert theirs in board.text, "a viewer-dependent leaderboard is not a leaderboard"

        # The disagreement a half-applied filter creates.
        detail = client.get(f"/groups/{w.group.id}", headers=_auth(viewer))
        assert detail.status_code == 200, detail.text
        assert detail.json()["member_count"] == len(members.json()), (
            f"member_count {detail.json()['member_count']} disagrees with the "
            f"{len(members.json())}-row members list")

    @pytest.mark.parametrize("direction", DIRECTIONS)
    def test_a_circle_invite_is_refused_for_a_blocked_pair(self, client, db, monkeypatch,
                                                            stmt_counter, direction):
        """B-27. MUT-4I-52: check after the row is added -> inserts."""
        tag = f"b27{direction}"
        curator = _make_user(db, email=f"4i-{tag}-cur@example.com", name=f"ZZ{tag}CUR")
        guest = _make_user(db, email=f"4i-{tag}-guest@example.com", name=f"ZZ{tag}G")
        third = _make_user(db, email=f"4i-{tag}-third@example.com", name=f"ZZ{tag}T")
        g = models.ReadingGroup(name=f"ZZ{tag} Circle", is_private=True, created_by=curator.id)
        db.add(g)
        db.commit()
        db.refresh(g)
        db.add(models.GroupMember(group_id=g.id, user_id=curator.id, role="curator",
                                  status="active"))
        db.commit()

        if direction == "blocker":
            _block(client, curator, guest.id)
        else:
            _block(client, guest, curator.id)

        spy = _Spy()
        monkeypatch.setattr("app.routers.groups_router.fire_event", spy)
        db.expire_all()
        before = len(db.exec(select(models.GroupMember)).all())
        _warm(client, curator)

        stmt_counter.reset()
        r = client.post(f"/groups/{g.id}/invite/{guest.id}", headers=_auth(curator))
        assert r.status_code == 403, r.text
        assert stmt_counter.inserts == 0
        assert spy.calls == [], spy.calls
        db.expire_all()
        assert len(db.exec(select(models.GroupMember)).all()) == before

        # CONTROL: inviting a third reader succeeds, writes a row and fires an event.
        ok = client.post(f"/groups/{g.id}/invite/{third.id}", headers=_auth(curator))
        assert ok.status_code == 201, ok.text
        db.expire_all()
        assert len(db.exec(select(models.GroupMember)).all()) == before + 1
        assert len(spy.calls) == 1, spy.calls

    def test_admin_routes_are_never_filtered(self, client, db, admin, admin_headers):
        """B-28 (Q-4). MUT-4I-53: apply the filter to any /admin/* route -> assert 0 == 1.

        An admin's block is a reader relationship and is visibility-only for them. Moderation
        needs the unfiltered truth, or blocking the admin would be a way to escape it.
        """
        w = _make_world(db, client, "b28", future_days=945)
        _block(client, admin, w.b.id)
        db.add(models.Report(reporter_id=w.c.id, target_type="note", target_id=w.note["b"].id,
                             target_user_id=w.b.id, reason="spam",
                             target_snapshot=f"{w.sent['b']}-SNAPSHOT", status="open"))
        db.commit()

        for url in ("/admin/content/notes", "/admin/content/comments", "/admin/reports"):
            r = client.get(url, headers=admin_headers)
            assert r.status_code == 200, f"{url}: {r.status_code} {r.text[:200]}"
            assert w.sent["b"] in r.text, f"{url} hid a blocked reader from moderation"

        # `/admin/users` pages at 100 rows and the shared conftest database is well past that
        # in a whole-suite run, so the reader is looked for across pages rather than on the
        # first one — an absence caused by pagination would otherwise read as a filter.
        pages, found = 0, False
        while pages < 40:
            page = client.get(f"/admin/users?limit=200&offset={pages * 200}",
                              headers=admin_headers)
            assert page.status_code == 200, page.text
            if not page.json():
                break
            if w.sent["b"] in page.text:
                found = True
                break
            pages += 1
        assert found, "/admin/users hid a blocked reader from moderation"

        # CONTROL: the same admin's own feed DOES hide them, so the block is real and only
        # /admin/* is exempt.
        feed = client.get("/notes/feed?limit=200", headers=admin_headers)
        assert feed.status_code == 200
        assert w.sent["b"] not in feed.text
        assert w.sent["c"] in feed.text

    @pytest.mark.parametrize("direction", DIRECTIONS)
    def test_fire_event_suppresses_a_blocked_pair_inside_the_loop(self, db, monkeypatch,
                                                                   client, direction):
        """B-29. MUT-4I-54: move the check above the per-recipient loop -> C's log row.
        MUT-4I-55: write the NotificationLog row before the skip -> A's row.

        The recipient list is MIXED on purpose. A decision taken above the loop either skips
        both or neither, and only a mixed list can tell the two apart.
        """
        tag = f"b29{direction}"
        a = _make_user(db, email=f"4i-{tag}-a@example.com", name="B29A")
        b = _make_user(db, email=f"4i-{tag}-b@example.com", name="B29B")
        c = _make_user(db, email=f"4i-{tag}-c@example.com", name="B29C")
        _block(client, a, b.id)
        actor, blocked = (a, b) if direction == "blocker" else (b, a)

        expo, web = [], []
        monkeypatch.setattr("app.notifications.dispatcher.send_expo_push",
                            lambda db_, uid, t, bd, d: expo.append(uid))
        monkeypatch.setattr("app.notifications.dispatcher.send_web_push",
                            lambda db_, uid, t, bd, d: web.append(uid))

        summary = dispatcher.fire_event(
            db=db, event_type="post_liked", actor_id=actor.id, actor_name="Actor",
            recipient_ids=[blocked.id, c.id], extra={"note_id": 1},
        )

        db.expire_all()
        logs_blocked = db.exec(select(models.NotificationLog).where(
            models.NotificationLog.user_id == blocked.id,
            models.NotificationLog.actor_id == actor.id)).all()
        logs_c = db.exec(select(models.NotificationLog).where(
            models.NotificationLog.user_id == c.id,
            models.NotificationLog.actor_id == actor.id)).all()

        assert logs_blocked == [], "a NotificationLog row was written for a blocked pair"
        assert len(logs_c) == 1, "the uninvolved recipient was skipped too — the check is not in the loop"
        assert blocked.id not in expo and blocked.id not in web
        assert c.id in expo and c.id in web
        assert summary["skipped_blocked"] == 1, summary
        assert summary["sent"] == 1, summary

    def test_notification_history_is_not_rewritten_by_a_block(self, client, db):
        """B-30. MUT-4I-56: delete history on block -> the captured comparison."""
        a = _make_user(db, email="4i-b30-a@example.com", name="B30A")
        b = _make_user(db, email="4i-b30-b@example.com", name="B30B")
        _follow(client, b, a.id)                      # fires new_follower at A
        captured = client.get("/notifications/history", headers=_auth(a))
        assert captured.status_code == 200, captured.text
        assert any(row.get("event_type") == "new_follower" for row in captured.json()), (
            f"the arrange step produced no notification — this case would prove nothing: "
            f"{captured.json()}")

        _block(client, a, b.id)
        after = client.get("/notifications/history", headers=_auth(a))
        assert after.json() == captured.json(), (
            "history is a log: rewriting it makes a delivered notification vanish")

        # CONTROL: a notification fired AFTER the block does not appear.
        dispatcher.fire_event(db=db, event_type="post_liked", actor_id=b.id, actor_name="B30B",
                             recipient_ids=[a.id], extra={"note_id": 1})
        assert client.get("/notifications/history", headers=_auth(a)).json() == captured.json()

    def test_blocking_a_bot_is_quiet_and_local(self, client, db, monkeypatch):
        """B-31 (R-27). MUT-4I-57: reject a bot target, or filter every reader's feed."""
        w = _make_world(db, client, "b31", future_days=950)
        bot = _make_user(db, email="4i-b31-bot@trackmyread.com", name="ZZb31BOT")
        bot.is_bot = True
        db.add(bot)
        db.commit()
        db.refresh(bot)
        ub = models.UserBook(user_id=bot.id, book_id=w.userbook["c"].book_id, status="reading")
        db.add(ub)
        db.commit()
        db.refresh(ub)
        db.add(models.Note(user_id=bot.id, userbook_id=ub.id, text="ZZb31BOT-NOTE",
                           is_public=True, created_at=datetime.utcnow() + timedelta(days=950)))
        db.commit()

        spy = _Spy()
        monkeypatch.setattr("app.notifications.dispatcher.fire_event", spy)
        _block(client, w.a, bot.id)
        assert spy.calls == [], spy.calls
        db.expire_all()
        assert len(db.exec(select(models.Block).where(
            models.Block.blocker_id == w.a.id, models.Block.blocked_id == bot.id)).all()) == 1

        mine = client.get("/notes/feed?limit=200", headers=_auth(w.a))
        assert mine.status_code == 200, mine.text
        assert "ZZb31BOT-NOTE" not in mine.text
        # CONTROL: every OTHER reader's feed is unchanged.
        theirs = client.get("/notes/feed?limit=200", headers=_auth(w.c))
        assert theirs.status_code == 200
        assert "ZZb31BOT-NOTE" in theirs.text, "one reader's block emptied everybody's feed"

    def test_account_deletion_takes_blocks_in_both_directions(self, client, db):
        """B-33. MUT-4I-28b: delete only the outbound blocks -> the inbound count."""
        a = _make_user(db, email="4i-b33-a@example.com", name="B33A", password="password123")
        b = _make_user(db, email="4i-b33-b@example.com", name="B33B")
        c = _make_user(db, email="4i-b33-c@example.com", name="B33C")
        d = _make_user(db, email="4i-b33-d@example.com", name="B33D")
        _block(client, a, b.id)        # outbound
        _block(client, c, a.id)        # inbound — the half a careless cascade misses
        _block(client, c, d.id)        # the control, uninvolved
        a_id = a.id

        r = client.post("/auth/delete-account/me", headers=_auth(a))
        assert r.status_code == 200, r.text

        db.expire_all()
        assert db.exec(select(models.Block).where(models.Block.blocker_id == a_id)).all() == []
        assert db.exec(select(models.Block).where(models.Block.blocked_id == a_id)).all() == []
        # CONTROL: an unrelated block survives.
        assert len(db.exec(select(models.Block).where(
            models.Block.blocker_id == c.id, models.Block.blocked_id == d.id)).all()) == 1
        # The production-shaped invariant (P-4I-08): no block row points at a missing user.
        user_ids = set(db.exec(select(models.User.id)).all())
        orphans = [(r_.blocker_id, r_.blocked_id) for r_ in db.exec(select(models.Block)).all()
                   if r_.blocker_id not in user_ids or r_.blocked_id not in user_ids]
        assert orphans == [], orphans

    def test_the_helper_is_one_statement_and_is_not_a_union(self, db, client, stmt_counter):
        """B-35. MUT-4I-58: build the set with union() -> the ProgrammingError control.

        The `union()` trap is reproduced HERE, in CI, rather than in production: through
        SQLModel's `Session.exec()` a union returns `Row` tuples, and feeding those to
        `notin_()` raises. That is why the helper is a two-arm `or_` on one select.
        """
        src = (REPO_ROOT / "app" / "blocks.py").read_text(encoding="utf-8")
        assert "union(" not in src, "the union() trap is back in app/blocks.py"
        import ast
        assert not [n for n in ast.walk(ast.parse(src))
                    if isinstance(n, ast.Call) and getattr(n.func, "id", None) == "union"]

        viewer = _make_user(db, email="4i-b35-v@example.com", name="B35V")
        others = [_make_user(db, email=f"4i-b35-o{i}@example.com", name=f"B35O{i}")
                  for i in range(25)]

        # `stmt_counter` listens on `tests.conftest.engine`, and the `db` fixture comes from the
        # OTHER copy of conftest that pytest auto-loads as the bare "conftest" plugin — a
        # different Engine object over the SAME shared-cache database (conftest's own docstring
        # records the double import). A direct call through `db` is therefore invisible to the
        # counter, so the helper is called through a session on the engine being listened to.
        # Measured: without this the case read 0 statements and would have passed any mutation
        # that removed the query altogether.
        from sqlmodel import Session as _Session

        expected = set()
        for n in (0, 1, 2, 25):
            while len(expected) < n:
                i = len(expected)
                o = others[i]
                if i % 2:                      # half of them INBOUND, so both arms are exercised
                    _block(client, o, viewer.id)
                else:
                    _block(client, viewer, o.id)
                expected.add(o.id)
            with _Session(engine) as counted:
                stmt_counter.reset()
                got = blocks.hidden_user_ids(counted, viewer)
                assert stmt_counter.selects == 1, (
                    f"{stmt_counter.selects} statements at {n} blocks — not zero, not two, one")
            assert got == expected, (sorted(got), sorted(expected))

        # CONTROL (rule 3): the rejected implementation really does fail, in this test.
        from sqlalchemy import union
        from sqlmodel import select as _select
        rows = db.exec(union(
            _select(models.Block.blocked_id).where(models.Block.blocker_id == viewer.id),
            _select(models.Block.blocker_id).where(models.Block.blocked_id == viewer.id),
        )).all()
        assert rows and not isinstance(rows[0], int), (
            "union() through exec() returned scalars here; the trap this helper avoids would "
            "not reproduce and the control is vacuous")
        with pytest.raises(Exception) as exc:
            db.exec(_select(models.Note).where(models.Note.user_id.notin_(rows))).all()
        assert "Row" in str(exc.value) or "not supported" in str(exc.value), str(exc.value)

    def test_the_helper_is_imported_as_a_module_attribute_everywhere(self):
        """B-35a (K-4I-10, rule 13). MUT-4I-59: `from ..blocks import hidden_user_ids` in one
        router -> that file in the violation list, and B-11's stub stops seeing that path."""
        import ast
        files = sorted((REPO_ROOT / "app").rglob("*.py"))
        assert len(files) >= 25, f"the walk saw {len(files)} files — it would prove nothing"

        def _violations(source, label):
            out = []
            for node in ast.walk(ast.parse(source)):
                if isinstance(node, ast.ImportFrom) and (node.module or "").endswith("blocks"):
                    names = {a.name for a in node.names}
                    if names & {"hidden_user_ids", "is_blocked_pair", "sever_relationships"}:
                        out.append(label)
            return out

        offenders, callers = [], []
        for f in files:
            src = f.read_text(encoding="utf-8")
            rel = f.relative_to(REPO_ROOT).as_posix()
            offenders += _violations(src, rel)
            if "blocks.hidden_user_ids(" in src or "blocks.is_blocked_pair(" in src:
                callers.append(rel)
        assert offenders == [], offenders
        # The positive half: the attribute really is used, in enough places to be the seam.
        assert len(callers) >= 9, callers

        # CONTROL (rule 3): the detector over a synthetic violation reports exactly one.
        assert _violations("from ..blocks import hidden_user_ids\n", "synthetic.py") == [
            "synthetic.py"]

    def test_an_empty_block_set_is_safe_and_silent(self, client, db):
        """B-35b (rule 16). MUT-4I-60: special-case the empty set with an early `return []`
        at a call site -> the captured comparison.

        Day one, all 131 readers: `notin_(set())` must return every row and warn about nothing.
        "No warning" is asserted with a POSITIVE control, not by trusting that none appeared —
        a timezone test once passed on Windows for exactly that reason.
        """
        w = _make_world(db, client, "b35b", future_days=955)
        viewer = _make_user(db, email="4i-b35b-v@example.com", name="ZZb35bV")
        db.commit()
        assert blocks.hidden_user_ids(db, viewer) == set()

        urls = ("/notes/feed?limit=200", f"/users/search?q=ZZ{w.tag}",
                f"/notes/{w.third_note.id}/comments")
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            bodies = {u: client.get(u, headers=_auth(viewer)) for u in urls}
            from sqlalchemy.exc import SAWarning
            warnings.warn("B-35b positive control", SAWarning)
        sa = [w_ for w_ in caught if issubclass(w_.category, SAWarning)]
        assert len(sa) == 1 and "positive control" in str(sa[0].message), [str(x.message) for x in sa]

        for u, r in bodies.items():
            assert r.status_code == 200, f"{u}: {r.status_code} {r.text[:200]}"
        for who in ("a", "b", "c"):
            assert w.sent[who] in bodies["/notes/feed?limit=200"].text, who
            assert w.sent[who] in bodies[f"/users/search?q=ZZ{w.tag}"].text, who
        assert len(bodies[f"/notes/{w.third_note.id}/comments"].json()) == 3

    def test_only_the_named_test_files_were_edited(self):
        """B-36 (static, rule 15). MUT-4I-61: delete an assertion in tests/test_notes.py ->
        that file in the violation list.

        Reads COMMITTED state, so it is red until this sprint's work is committed — which is
        the point: it polices the commit, not the working tree.
        """
        base = "27a8427"      # the 4I-A merge this package is built on
        probe = subprocess.run(["git", "cat-file", "-e", base + "^{commit}"],
                               cwd=REPO_ROOT, capture_output=True, text=True)
        assert probe.returncode == 0, (
            f"B-36's pinned base {base} is not reachable in this clone. That is a CHECKOUT "
            "problem — the pytest job sets fetch-depth: 0 — and never a reason to re-point the "
            "rule at origin/master.")
        diff = subprocess.run(["git", "diff", f"{base}...HEAD", "--numstat", "--", "tests/"],
                              cwd=REPO_ROOT, capture_output=True, text=True,
                              encoding="utf-8", errors="replace")
        assert diff.returncode == 0, diff.stderr[:200]
        rows = [r.split("\t") for r in diff.stdout.splitlines() if r.count("\t") == 2]
        assert rows, "the diff over tests/ is empty — this case would assert nothing"

        # The three files this package is allowed to REMOVE lines from, each with its reason:
        #   test_query_budget.py  the 24 re-measured numbers and the seed wiring (K-4I-03)
        #   test_bots.py          GUARDED_ROUTES 5 -> 6 and the test's own name (K-4I-02)
        #   test_apple_auth.py    len(pairs) 7 -> 8, EXPECTED_GETS 51 -> 52, and the
        #                         permitted-removals set this sprint had to add there
        #   test_notes.py         three TestNoteQueryCount ceilings, +1 each, digits only
        #   test_reports.py       the schema_guard count 7 -> 8, the deny_bot_actor
        #                         inventory 5 -> 6 and the GET sweep 51 -> 52
        may_change = {"tests/test_query_budget.py", "tests/test_bots.py",
                      "tests/test_apple_auth.py", "tests/test_notes.py",
                      "tests/test_reports.py"}
        offenders = []
        for added, removed, path in rows:
            path = path.replace("\\", "/")
            if path in may_change:
                continue
            if removed not in ("0", "-"):
                offenders.append(f"{path}: {removed} line(s) removed")
        assert offenders == [], offenders
        assert "tests/conftest.py" not in {r[2].replace("\\", "/") for r in rows}, (
            "this sprint requires no change to conftest.py and is not permitted one")

        # CONTROL (rule 3): the same rule over a synthetic numstat row reports exactly one.
        synthetic = [("0", "1", "tests/test_follow_profile.py")]
        assert [f"{p}: {rm} line(s) removed" for _a, rm, p in synthetic
                if rm not in ("0", "-")] == [
                    "tests/test_follow_profile.py: 1 line(s) removed"]

    def test_the_helper_runs_once_per_request_and_after_the_early_return(self, client, db,
                                                                         monkeypatch):
        """B-37. MUT-4I-62: call the helper inside a loop -> assert 12 == 1.
        MUT-4I-63: call it above `if not following: return []` -> assert 1 == 0, and B-42 too."""
        w = _make_world(db, client, "b37", future_days=960)
        _block(client, w.a, w.b.id)
        _plant_follow(db, w.a.id, w.c.id)
        _warm(client, w.a)

        # BOTH seams are counted: the nine FILTER_LIST paths call `hidden_user_ids` and the
        # five HIDE_404 paths call `is_blocked_pair`. Counting only the first would have let
        # a per-row block lookup on a single-subject path through.
        calls = []
        real_hidden = blocks.hidden_user_ids
        real_pair = blocks.is_blocked_pair
        monkeypatch.setattr("app.blocks.hidden_user_ids",
                            lambda d, v: (calls.append("hidden"), real_hidden(d, v))[1])
        monkeypatch.setattr("app.blocks.is_blocked_pair",
                            lambda d, x, y: (calls.append("pair"), real_pair(d, x, y))[1])

        paths = [spec[3](w, w.a, w.b) for spec in FILTERED_PATHS]
        assert len(paths) == 14
        problems = []
        for spec, url in zip(FILTERED_PATHS, paths):
            calls.clear()
            r = client.get(url, headers=_auth(w.a))
            if len(calls) != 1:
                problems.append(f"{spec[0]} GET {url}: helper called {len(calls)} time(s) "
                                f"(status {r.status_code})")
        assert problems == [], problems

        # And ZERO calls on the three early-return paths, which is what keeps the eight
        # empty-state budget rows at their counts.
        empty = _make_user(db, email="4i-b37-empty@example.com", name="B37E")
        db.commit()
        _warm(client, empty)
        for url in ("/notes/friends-feed", "/users/following", "/users/search?q="):
            calls.clear()
            r = client.get(url, headers=_auth(empty))
            assert r.status_code == 200, f"{url}: {r.text[:200]}"
            assert r.json() == []
            assert calls == [], f"{url}: the helper ran above the early return"


# ══════════════════════════════════════════════════════════════════════════════
# P3 — pm-decisions Q-1 and Q-3: the pending rows, and `also_block`
# ══════════════════════════════════════════════════════════════════════════════

class TestPendingRowsAndAlsoBlock:
    """Cases tests.md does not carry. Both are binding pm-decisions requirements with no case
    in the plan — see the build notes."""

    def test_a_block_deletes_pending_invites_and_requests_both_ways(self, client, db):
        """pm-decisions Q-1. MUT: drop the GroupMember half of `sever_relationships` ->
        the pending row survives and `GET /groups/{id}/pending` serves the name.

        This is WHY `GET /groups/{id}/pending` and `GET /groups/invites/pending` need no filter:
        the row cannot exist. Filtering a pending request instead would hide a decision from the
        only person who can take it.
        """
        cur = _make_user(db, email="4i-q1-cur@example.com", name="ZZq1CUR")
        guest = _make_user(db, email="4i-q1-guest@example.com", name="ZZq1GUEST")
        third = _make_user(db, email="4i-q1-third@example.com", name="ZZq1THIRD")
        g = models.ReadingGroup(name="ZZq1 Circle", is_private=True, created_by=cur.id)
        db.add(g)
        db.commit()
        db.refresh(g)
        db.add(models.GroupMember(group_id=g.id, user_id=cur.id, role="curator",
                                  status="active"))
        db.commit()

        # a self-join request by the guest, and a pending invite to the third reader
        assert client.post(f"/groups/{g.id}/join", headers=_auth(guest)).status_code == 201
        assert client.post(f"/groups/{g.id}/invite/{third.id}",
                           headers=_auth(cur)).status_code == 201
        pending = client.get(f"/groups/{g.id}/pending", headers=_auth(cur))
        assert "ZZq1GUEST" in pending.text, "arrange failed: no pending request to delete"

        _block(client, cur, guest.id)

        after = client.get(f"/groups/{g.id}/pending", headers=_auth(cur))
        assert after.status_code == 200, after.text
        assert "ZZq1GUEST" not in after.text, (
            "the pending request survived the block, so `/groups/{id}/pending` is unfiltered "
            "AND leaking — the two decisions together are now wrong")
        # CONTROL: the third reader's pending INVITE is untouched by somebody else's block.
        invites = client.get("/groups/invites/pending", headers=_auth(third))
        assert invites.status_code == 200
        assert "ZZq1 Circle" in invites.text, "an unrelated pending invite was swept away"

        # And a NEW request is refused, in both directions.
        assert client.post(f"/groups/{g.id}/join",
                           headers=_auth(guest)).status_code == 403
        assert client.post(f"/groups/{g.id}/invite/{guest.id}",
                           headers=_auth(cur)).status_code == 403
        # CONTROL: an active membership is NOT ejected (E-2) — proved by B-26; here, that the
        # refusal is about the pair and not about the circle.
        assert client.post(f"/groups/{g.id}/join", headers=_auth(third)).status_code == 201

    def test_also_block_writes_the_report_and_the_block_in_one_transaction(self, client, db):
        """pm-decisions Q-3. MUT: ignore `also_block` -> no block row; MUT: make it a second
        commit -> the forced-failure half below leaves a report with no block."""
        w = _make_world(db, client, "q3", future_days=965)
        _follow(client, w.a, w.b.id)
        _follow(client, w.b, w.a.id)

        r = client.post("/reports", headers=_auth(w.a), json={
            "target_type": "note", "target_id": w.note["b"].id,
            "reason": "harassment", "also_block": True,
        })
        assert r.status_code == 201, r.text
        assert r.json() == {"status": "received"}
        db.expire_all()
        assert len(db.exec(select(models.Report).where(
            models.Report.reporter_id == w.a.id)).all()) == 1
        assert len(db.exec(select(models.Block).where(
            models.Block.blocker_id == w.a.id, models.Block.blocked_id == w.b.id)).all()) == 1
        # The teardown ran in the same transaction.
        assert db.exec(select(models.Follow).where(
            models.Follow.follower_id == w.a.id, models.Follow.followed_id == w.b.id)).first() is None
        assert db.exec(select(models.Follow).where(
            models.Follow.follower_id == w.b.id, models.Follow.followed_id == w.a.id)).first() is None
        # And the block is real on a serving path.
        feed = client.get("/notes/feed?limit=200", headers=_auth(w.a))
        assert w.sent["b"] not in feed.text
        assert w.sent["c"] in feed.text

    def test_also_block_defaults_to_false_on_the_wire(self, client, db):
        """The default is False server-side even though the clients check the box by default
        (E-3). MUT: `also_block: bool = True` -> this case.

        An old client that does not know the field must not start blocking people.
        """
        w = _make_world(db, client, "q3b", future_days=970)
        r = client.post("/reports", headers=_auth(w.a), json={
            "target_type": "note", "target_id": w.note["b"].id, "reason": "spam",
        })
        assert r.status_code == 201, r.text
        db.expire_all()
        assert db.exec(select(models.Block).where(
            models.Block.blocker_id == w.a.id)).first() is None
        # CONTROL: the report itself was written, so "no block" is not "nothing happened".
        assert len(db.exec(select(models.Report).where(
            models.Report.reporter_id == w.a.id)).all()) == 1

    def test_reporting_an_already_blocked_reader_keeps_the_report(self, client, db):
        """A regression this package could easily have shipped: the handler's
        `except IntegrityError` exists for the duplicate REPORT, and without the existing-row
        check in `_write_block` a second `also_block` on the SAME person raises on
        `uq_block_pair`, rolls the report back, and answers 200 "received" with nothing written.

        Reaching it takes care, and the first version of this case did not: `_resolve_target`
        404s a blocked `user` target and 404s a blocked note's author, so most second reports of
        an already-blocked reader never get as far as `_write_block`. The one path that does is
        a COMMENT: `_resolve_target` checks whether the viewer may see the comment's parent
        NOTE, and says nothing about the commenter. So A may still report B's comment under C's
        note after blocking B — which is exactly what a client with a stale screen will send.

        MUT (Q3c): drop the existing-row check in `_write_block` -> `assert 0 == 1` on the
        report. The first version of this case left that mutation GREEN; see the build notes.
        """
        w = _make_world(db, client, "q3c", future_days=975)
        comment = db.exec(select(models.Comment).where(
            models.Comment.note_id == w.third_note.id,
            models.Comment.user_id == w.b.id)).first()
        assert comment is not None, "arrange failed: B has no comment on C's note"

        _block(client, w.a, w.b.id)
        db.expire_all()
        assert len(db.exec(select(models.Block).where(
            models.Block.blocker_id == w.a.id, models.Block.blocked_id == w.b.id)).all()) == 1

        r = client.post("/reports", headers=_auth(w.a), json={
            "target_type": "comment", "target_id": comment.id, "reason": "harassment",
            "also_block": True,
        })
        assert r.status_code == 201, r.text
        db.expire_all()
        # THE REPORT SURVIVED. Without the check this is 0, because the block's IntegrityError
        # rolled the whole transaction back while the reader was told "received".
        reports = db.exec(select(models.Report).where(
            models.Report.reporter_id == w.a.id)).all()
        assert len(reports) == 1, reports
        assert reports[0].target_user_id == w.b.id
        # And still exactly one block row, not two and not none.
        assert len(db.exec(select(models.Block).where(
            models.Block.blocker_id == w.a.id)).all()) == 1

    def test_a_blocked_reader_cannot_be_reported(self, client, db):
        """pm-decisions Q-2's full rule — "the row exists AND the pair is not blocked".
        MUT: drop the blocked-pair branch from `_resolve_target`'s user arm -> assert 201 == 404.
        """
        w = _make_world(db, client, "q2b", future_days=980)
        _block(client, w.a, w.b.id)
        blocked = client.post("/reports", headers=_auth(w.a), json={
            "target_type": "user", "target_id": w.b.id, "reason": "spam"})
        gone = client.post("/reports", headers=_auth(w.a), json={
            "target_type": "user", "target_id": NEVER_EXISTED, "reason": "spam"})
        assert blocked.status_code == 404, blocked.text
        assert blocked.content == gone.content, (blocked.content, gone.content)
        # CONTROL: an uninvolved reader IS reportable.
        assert client.post("/reports", headers=_auth(w.a), json={
            "target_type": "user", "target_id": w.c.id, "reason": "spam"}).status_code == 201


# ══════════════════════════════════════════════════════════════════════════════
# P3 — the budget seed's own invariants
# ══════════════════════════════════════════════════════════════════════════════

class TestBudgetSeed:
    """B-43a — because a seed that silently stopped inserting blocks would make
    `test_no_endpoint_scales_with_row_count` vacuous rather than red."""

    def test_the_block_seed_is_what_b43_needs(self):
        """B-43a. MUT-4I-68: insert a fixed 3 blocks regardless of scale -> assert 3 == 30.
        MUT-4I-67: block `d.pub` instead of a filler -> twelve budget rows fail on status."""
        from sqlalchemy.pool import QueuePool
        from sqlmodel import Session, SQLModel, create_engine

        from tests import block_seed

        for scale in (1, 10):
            url = f"sqlite:///file:bt_b43a_{scale}?mode=memory&cache=shared&uri=true"
            eng = create_engine(url, connect_args={"check_same_thread": False},
                                poolclass=QueuePool)
            SQLModel.metadata.create_all(eng)
            with Session(eng) as s:
                me = models.User(name="Seed Me", email="b43a_me@example.com",
                                 username="b43a_me", password_hash="x")
                pub = models.User(name="Public Subject", email="b43a_pub@example.com",
                                  username="b43a_pub", password_hash="x")
                s.add_all([me, pub])
                s.commit()
                s.refresh(me)
                s.refresh(pub)

                class _D:
                    pass

                d = _D()
                d.me, d.pub = me.id, pub.id
                ids = block_seed.add_block_rows(s, d, scale, password_hash="x")

                assert len(ids) == block_seed.BLOCKS_PER_SCALE * scale, len(ids)
                rows = s.exec(select(models.Block)).all()
                assert len(rows) == block_seed.BLOCKS_PER_SCALE * scale, len(rows)
                assert {r.blocker_id for r in rows} == {me.id}
                assert {r.blocked_id for r in rows} == set(ids)
                # NOT any reader the budget table measures.
                assert d.pub not in ids and d.me not in ids

                for fid in ids:
                    u = s.get(models.User, fid)
                    for lit in block_seed.SEARCH_LITERALS:
                        assert lit not in (u.name or "").lower(), u.name
                        assert lit not in (u.username or "").lower(), u.username
                    # authors nothing and holds no follow, so no measured body shortens
                    assert s.exec(select(models.Note).where(models.Note.user_id == fid)).all() == []
                    assert s.exec(select(models.Comment).where(
                        models.Comment.user_id == fid)).all() == []
                    assert s.exec(select(models.GroupPost).where(
                        models.GroupPost.user_id == fid)).all() == []
                    assert s.exec(select(models.GroupMember).where(
                        models.GroupMember.user_id == fid)).all() == []
                    assert s.exec(select(models.Follow).where(
                        (models.Follow.follower_id == fid)
                        | (models.Follow.followed_id == fid))).all() == []

    def test_bq_24_is_still_a_target_at_its_new_number(self):
        """B-44 (K-4I-01). MUT-4I-69: demote BQ-24 to RATCHET -> the targets list."""
        from tests.test_query_budget import BY_ID, TARGET
        assert BY_ID["24"].kind == TARGET
        assert BY_ID["24"].expected == 4 and BY_ID["24"].budget == 4
        # Three TARGET rows over two endpoints (the plan's correction to spec R-29's wording).
        from tests.test_query_budget import BUDGETS
        target_rows = [r.bq for r in BUDGETS if r.kind == TARGET]
        assert sorted(target_rows) == ["24", "29", "29e"], target_rows
        assert sorted({r.endpoint for r in BUDGETS if r.kind == TARGET}) == [
            "GET /groups/my/pending", "GET /users/{id}/stats"]
        # BQ-08e sits exactly on the empty-state ceiling, with nothing left after this sprint.
        assert BY_ID["08e"].expected == 3 and BY_ID["08e"].budget == 3
        for bq, n in (("09e", 2), ("22e", 2), ("23e", 1)):
            assert BY_ID[bq].expected == n, (bq, BY_ID[bq].expected)
