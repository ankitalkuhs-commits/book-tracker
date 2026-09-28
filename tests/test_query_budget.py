"""Sprint 4E P7 — the query-budget guard (spec.md R-06, tests.md L-4E-46..50, ST-4E-08).

WHAT THIS FILE IS
=================
A ratchet. It measures how many SQL statements each read endpoint sends per request and
fails the build, naming the endpoint and both numbers, when a count rises.

WHAT THE NUMBERS MEAN — READ THIS BEFORE TRUSTING THEM
======================================================
Sprint 4E was cut from seven packages to three on 2026-09-23 (`pm-decisions.md`). P2, P3,
P4, P6 and the bulk of P5 were dropped. So for most endpoints there is **no optimised
"after" count**, and the "after" column in `architecture.md` describes work that was never
done.

Every row therefore carries a `kind`:

    RATCHET  the number is "no worse than measured today", on THIS tree, with the
             optimisation NOT done. It is not evidence of anything. The architecture's
             "after" column for that endpoint is still outstanding work.
    TARGET   the number is the measured post-fix count from a package that shipped, and
             matches the architecture's target. Only `GET /users/{id}/stats` and
             `GET /groups/my/pending` qualify (build-notes-4e-n1.md).

`kind` is a column of the table below, printed in every failure message, so a reader six
months from now cannot mistake a ratchet for a delivered optimisation.

A count that comes in UNDER its budget does not fail — it is an invitation to lower the
budget in the same commit (pm-decisions.md). The run prints an `UNDER:` line for each.

`budget == expected` on every row: margin zero, not R-06's permitted one. One query of slack
on a ratchet is one query of silent regression, and "no worse than today" means today's
number. The margin-of-one rule survives as a ceiling in `test_the_table_is_whole`.

67 rows, not the 68 in tests.md 7.1: BQ-39f measured `/admin/stats`'s A-5 fallback, which
belongs to the dropped P6 and does not exist on this tree. For the same reason there are
**no `varies` rows** — both of the two tests.md allowed (BQ-14's two shapes, BQ-39f's
fallback) were alternatives inside dropped packages, so every row here asserts exactly.

THE TRAP THIS FILE EXISTS TO AVOID, AND COULD ITSELF FALL INTO
==============================================================
A budget measured on an empty account is worthless: `/users/{id}/stats` costs 3 queries at
zero books *and* 103 at a hundred books if the N+1 is back. Every budget below is measured
on `seed(scale=1)`, which puts **50 finished books** behind the stats subject, **25 pending
circles**, 5 followed users, 50-row notification and activity histories and multi-member
circles — sizes at which a restored N+1 is unmistakable. L-4E-47 re-measures every row on
`seed(scale=10)` and fails on any difference, under budget or not.

HARNESS NOTES
=============
* K-03: this module owns its own databases. `tests/conftest.py` shares one in-memory DB
  across the whole session and `test_notes.py` seeds 100+ public notes into it, which makes
  the empty-state rows unmeasurable and `/admin/*` counts depend on test-file order. Three
  private shared-cache databases are used instead (small, large, empty) and the dependency
  overrides are restored exactly on teardown.
* None of conftest's `alice`/`bob`/`admin` fixtures are used — they belong to the other
  database and a request made with their token would 401 here and "pass" at 1 query.
* P1 moved the once-a-day `last_active` write into a BackgroundTask, and Starlette's
  TestClient runs background tasks *inside* `client.get()`. A naive counter therefore
  charges the reader for a write that happens after the response. `app.deps.
  _persist_user_touch` is wrapped so the recorder knows where the request phase ends; every
  number here is the request phase only (build-notes-4e-p1.md).
* K-09: `measure()` primes with one request. After P1 the prime is unnecessary — L-4E-49 is
  the case that proves it, and it is deliberately separate so a P1 regression fails one
  named test instead of shifting every budget at once.
"""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, Optional

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.pool import QueuePool
from sqlmodel import SQLModel, Session, create_engine, select

import app.deps as deps
from app import auth, models
from app.database import get_db, get_session
from app.main import app


# ══════════════════════════════════════════════════════════════════════════════
# 1. The databases this module owns (K-03)
# ══════════════════════════════════════════════════════════════════════════════

class BudgetDb:
    """One private shared-cache in-memory database, its engine and its seeded data.

    QueuePool and check_same_thread=False are copied from tests/conftest.py for the reason
    its comment gives (F-66): SQLAlchemy 1.4's default SingletonThreadPool closes other
    threads' connections above 5 threads, even while they are in use.
    """

    def __init__(self, name):
        self.name = name
        self.url = f"sqlite:///file:{name}?mode=memory&cache=shared&uri=true"
        self.engine = create_engine(
            self.url,
            connect_args={"check_same_thread": False},
            poolclass=QueuePool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.data = None

    def session_override(self):
        def _dep():
            with Session(self.engine) as session:
                yield session
        return _dep

    def session(self):
        return Session(self.engine)


SMALL = BudgetDb("bt_budget_small")
LARGE = BudgetDb("bt_budget_large")
EMPTY = BudgetDb("bt_budget_empty")


# ══════════════════════════════════════════════════════════════════════════════
# 2. The counter (tests.md 2.1) and the request/task split (P1)
# ══════════════════════════════════════════════════════════════════════════════

class BudgetRecorder:
    """Every statement and pool checkout on one engine, split at the background task.

    `request_statements` is the prefix executed before `app.deps._persist_user_touch` ran,
    i.e. what the reader actually waited for. Without the split, the first request of a
    reader's local day is charged one extra statement and one extra checkout for a write
    that P1 deliberately moved off the request path.
    """

    MAX_PRINTED = 40
    MAX_CHARS = 160

    def __init__(self):
        self.reset()

    def reset(self):
        self.statements = []
        self.checkouts = 0
        self.task_at = None
        self.task_calls = 0

    def mark_task(self):
        self.task_calls += 1
        if self.task_at is None:
            self.task_at = (len(self.statements), self.checkouts)

    @property
    def request_statements(self):
        return self.statements[: self.task_at[0]] if self.task_at else list(self.statements)

    @property
    def request_checkouts(self):
        return self.task_at[1] if self.task_at else self.checkouts

    def _before_cursor_execute(self, conn, cursor, statement, parameters, context, executemany):
        self.statements.append(" ".join(statement.split())[: self.MAX_CHARS])

    def _checkout(self, dbapi_conn, record, proxy):
        self.checkouts += 1


@dataclass
class Measurement:
    n: int
    statements: list
    checkouts: int
    body: object


def measure(db: BudgetDb, client, url, headers=None, expect=200, prime=True):
    """Statements on the request path for one GET, after an optional priming request.

    A request that does not return the expected status fails here, before any count is
    compared — a 401 or a 403 would otherwise "pass" at one query (tests.md 2.2).
    """
    rec = _RECORDERS[db.name]
    if prime:
        r0 = client.get(url, headers=headers)
        assert r0.status_code == expect, (
            f"GET {url} primed with {r0.status_code}, expected {expect}: {r0.text[:200]}"
        )
    rec.reset()
    r = client.get(url, headers=headers)
    assert r.status_code == expect, (
        f"GET {url} returned {r.status_code}, expected {expect}: {r.text[:200]}"
    )
    stmts = rec.request_statements
    try:
        body = r.json()
    except Exception:
        body = None
    return Measurement(len(stmts), stmts, rec.request_checkouts, body)


_RECORDERS = {}


# ══════════════════════════════════════════════════════════════════════════════
# 3. Seeds (tests.md 2.6)
# ══════════════════════════════════════════════════════════════════════════════

_PWD = "not-a-real-hash-tests-never-verify-it"


class Seeded:
    """Ids the row builders need. Same attribute names at every scale."""
    pass


def _user(s, email, name, *, admin=False, private=False, zone="Asia/Kolkata", created_at=None):
    u = models.User(
        name=name, email=email, username=email.split("@")[0], password_hash=_PWD,
        is_admin=admin, is_private_profile=private, timezone=zone,
        created_at=created_at or datetime.utcnow(),
    )
    s.add(u)
    return u


def headers_for(user_email):
    return {"Authorization": f"Bearer {auth.create_access_token({'sub': user_email})}"}


def _seed(db: BudgetDb, scale: int):
    """The architecture's realistic account at `scale`x.

    scale=1 is the budget seed: 50 finished books on the stats subject, 25 pending circles,
    5 followed users (3 mutual), 20 notifications, 30 days of activity. scale=10 is
    L-4E-47's large seed: every collection ten times bigger.
    """
    d = Seeded()
    now = datetime.utcnow()
    n = scale
    with db.session() as s:
        me = _user(s, "budget_me@example.com", "Budget Reader")
        admin = _user(s, "budget_admin@example.com", "Budget Admin", admin=True)
        pub = _user(s, "budget_pub@example.com", "Public Subject")
        priv = _user(s, "budget_priv@example.com", "Private Followed", private=True)
        privx = _user(s, "budget_privx@example.com", "Private Stranger", private=True)
        empty_viewer = _user(s, "budget_emptyviewer@example.com", "Empty Viewer")
        searchable = [
            _user(s, f"budget_search_{i}@example.com", f"Searchable Sam {i}")
            for i in range(4 * n)
        ]
        friends = [
            _user(s, f"budget_friend_{i}@example.com", f"Friend {i}")
            for i in range(5 * n)
        ]
        s.commit()
        for u in [me, admin, pub, priv, privx, empty_viewer] + searchable + friends:
            s.refresh(u)

        d.me, d.admin, d.pub, d.priv, d.privx = me.id, admin.id, pub.id, priv.id, privx.id
        d.empty_viewer = empty_viewer.id
        d.me_email, d.admin_email = me.email, admin.email
        d.empty_viewer_email = empty_viewer.email
        d.friend_ids = [f.id for f in friends]

        # ── follows: me -> every friend; the first 3n follow back (mutual); me -> priv
        follows = []
        for i, f in enumerate(friends):
            follows.append(models.Follow(follower_id=me.id, followed_id=f.id))
            if i < 3 * n:
                follows.append(models.Follow(follower_id=f.id, followed_id=me.id))
        follows.append(models.Follow(follower_id=me.id, followed_id=priv.id))
        follows.append(models.Follow(follower_id=me.id, followed_id=pub.id))
        follows.append(models.Follow(follower_id=pub.id, followed_id=me.id))
        s.add_all(follows)
        s.commit()

        # ── books
        books = [
            models.Book(title=f"Budget Book {i}", author=f"Author {i % 7}",
                        total_pages=100 + i, isbn=f"isbn-{db.name}-{i}")
            for i in range(85 * n + 40)   # consumed below: 78n + 5
        ]
        s.add_all(books)
        s.commit()
        for b in books:
            s.refresh(b)
        d.book_ids = [b.id for b in books]
        d.book = books[0].id

        cursor = 0

        def take(k):
            nonlocal cursor
            out = books[cursor:cursor + k]
            cursor += k
            return out

        # ── the stats subject: 50n finished + 3 reading + 2 to-read.
        # This is the size that makes a restored N+1 unmistakable: 3 queries vs 3 + 50n.
        pub_ubs = []
        for b in take(50 * n):
            pub_ubs.append(models.UserBook(user_id=pub.id, book_id=b.id, status="finished",
                                           current_page=b.total_pages, updated_at=now - timedelta(days=3)))
        for b in take(3):
            pub_ubs.append(models.UserBook(user_id=pub.id, book_id=b.id, status="reading",
                                           current_page=42, updated_at=now - timedelta(days=1)))
        for b in take(2):
            pub_ubs.append(models.UserBook(user_id=pub.id, book_id=b.id, status="to-read"))
        s.add_all(pub_ubs)

        # ── me: 8n userbooks
        my_ubs = []
        for i, b in enumerate(take(8 * n)):
            status = ("finished", "reading", "to-read")[i % 3]
            my_ubs.append(models.UserBook(user_id=me.id, book_id=b.id, status=status,
                                          current_page=50, rating=4,
                                          updated_at=now - timedelta(days=i % 20)))
        s.add_all(my_ubs)

        # ── the private subjects
        for who in (priv, privx):
            s.add_all([
                models.UserBook(user_id=who.id, book_id=b.id, status="finished",
                                current_page=b.total_pages, updated_at=now - timedelta(days=2))
                for b in take(5 * n)
            ])

        # ── friends: one reading + one finished each, so friends/currently-reading and
        #    /books/recommendations both have rows to batch
        friend_ubs = []
        for f in friends:
            rb, fb = take(2)
            friend_ubs.append(models.UserBook(user_id=f.id, book_id=rb.id, status="reading",
                                              current_page=30, updated_at=now))
            friend_ubs.append(models.UserBook(user_id=f.id, book_id=fb.id, status="finished",
                                              rating=5, current_page=fb.total_pages,
                                              updated_at=now - timedelta(days=1)))
        s.add_all(friend_ubs)
        s.commit()
        for ub in pub_ubs + my_ubs + friend_ubs:
            s.refresh(ub)
        d.my_userbook = my_ubs[0].id
        d.my_userbook_ids = [ub.id for ub in my_ubs]

        # ── notes: 2 per userbook of mine, 2 public per friend, 3n public for pub,
        #    2n public for priv
        notes = []
        for i, ub in enumerate(my_ubs):
            for j in range(2):
                notes.append(models.Note(user_id=me.id, userbook_id=ub.id,
                                         text=f"my note {i}-{j}", is_public=(j == 0),
                                         created_at=now - timedelta(minutes=i * 2 + j)))
        for k, f in enumerate(friends):
            fubs = [ub for ub in friend_ubs if ub.user_id == f.id]
            for j in range(2):
                notes.append(models.Note(user_id=f.id, userbook_id=fubs[j % len(fubs)].id,
                                         text=f"friend {k} note {j}", is_public=True,
                                         created_at=now - timedelta(minutes=100 + k * 2 + j)))
        pub_ub_ids = [ub.id for ub in pub_ubs[:10]]
        for j in range(3 * n):
            notes.append(models.Note(user_id=pub.id, userbook_id=pub_ub_ids[j % len(pub_ub_ids)],
                                     text=f"pub note {j}", is_public=True,
                                     created_at=now - timedelta(minutes=300 + j)))
        priv_ub = s.exec(
            select(models.UserBook).where(models.UserBook.user_id == priv.id)
        ).first()
        for j in range(2 * n):
            notes.append(models.Note(user_id=priv.id, userbook_id=priv_ub.id,
                                     text=f"priv note {j}", is_public=True,
                                     created_at=now - timedelta(minutes=500 + j)))
        s.add_all(notes)
        s.commit()
        for note in notes:
            s.refresh(note)
        d.my_note = next(nt.id for nt in notes if nt.user_id == me.id and nt.is_public)
        d.friend_note = next(nt.id for nt in notes if nt.user_id == friends[0].id)
        d.pub_note = next(nt.id for nt in notes if nt.user_id == pub.id)

        # ── likes and comments on a third of the notes, and plenty on the one note
        #    whose comment list is a budget row
        engagement = []
        for i, nt in enumerate(notes):
            if i % 3 == 0:
                engagement.append(models.Like(note_id=nt.id, user_id=me.id if nt.user_id != me.id
                                              else friends[0].id))
                engagement.append(models.Comment(note_id=nt.id, text="nice",
                                                 user_id=friends[i % len(friends)].id))
        for i in range(10 * n):
            engagement.append(models.Comment(note_id=d.friend_note, text=f"comment {i}",
                                             user_id=friends[i % len(friends)].id))
        s.add_all(engagement)

        # ── notifications: 20n rows, 12n unread
        s.add_all([
            models.NotificationLog(user_id=me.id, actor_id=friends[i % len(friends)].id,
                                   event_type="new_follower", title="t", body="b",
                                   is_read=(i >= 12 * n), sent_at=now - timedelta(hours=i))
            for i in range(20 * n)
        ])

        # ── reading activity: 30n days for me, plus rows for every friend so the
        #    leaderboard and the circle goal have something to sum
        acts = [
            models.ReadingActivity(user_id=me.id, userbook_id=my_ubs[i % len(my_ubs)].id,
                                   pages_read=10 + i, current_page=10 + i,
                                   date=now - timedelta(days=i % (30 * n)), local_day=True)
            for i in range(30 * n)
        ]
        for f in friends:
            fub = next(ub for ub in friend_ubs if ub.user_id == f.id)
            acts.append(models.ReadingActivity(user_id=f.id, userbook_id=fub.id,
                                               pages_read=25, current_page=25,
                                               date=now, local_day=True))
        s.add_all(acts)

        s.add_all([
            models.PushToken(user_id=me.id, token=f"tok-{db.name}-{i}", token_type="expo")
            for i in range(2)
        ])
        s.commit()

        # ── circles ───────────────────────────────────────────────────────────
        def circle(name, *, private=False, creator=None, goal=True, book=True):
            g = models.ReadingGroup(
                name=name, description=f"{name} description", is_private=private,
                created_by=(creator or me).id,
                goal_pages=1000 if goal else None,
                goal_period="monthly" if goal else None,
                goal_start_date=now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) if goal else None,
                current_book_id=d.book if book else None,
            )
            s.add(g)
            return g

        # Created by someone other than the caller on purpose: when `created_by` is the
        # caller, `_serialize_group`'s creator lookup is answered from the identity map
        # (get_current_user already loaded that row) and the endpoint measures one query
        # cheaper than it costs for any other reader. A ratchet must be the honest case.
        g_pub = circle("Budget Public Circle", creator=friends[0])
        g_priv = circle("Budget Private Circle", private=True, creator=friends[0])
        g_third = circle("Budget Third Circle", creator=friends[1])
        g_curator = circle("Budget Curator Circle", creator=friends[0])
        discover = [circle(f"Budget Discover {i}", creator=friends[i % len(friends)])
                    for i in range(3 * n)]
        invited = [circle(f"Budget Invite {i}", creator=friends[i % len(friends)])
                   for i in range(1 * n)]
        pendings = [circle(f"Budget Pending {i}", creator=friends[i % len(friends)])
                    for i in range(25 * n)]
        g_nomembers = circle("Budget Empty Circle", creator=friends[0])
        s.commit()
        for g in [g_pub, g_priv, g_third, g_curator, g_nomembers] + discover + invited + pendings:
            s.refresh(g)

        d.g_pub, d.g_priv, d.g_curator = g_pub.id, g_priv.id, g_curator.id
        d.g_nomembers = g_nomembers.id
        d.pending_circle_count = len(pendings)

        members = []
        # me is an active member of three circles (BQ-28) and curator of two of them
        for g, role in ((g_pub, "curator"), (g_priv, "curator"), (g_third, "member")):
            members.append(models.GroupMember(group_id=g.id, user_id=me.id, role=role,
                                              status="active"))
        members.append(models.GroupMember(group_id=g_curator.id, user_id=me.id,
                                          role="curator", status="active"))
        # other active members in the circles whose member lists / leaderboards are rows
        for g in (g_pub, g_priv, g_third, g_curator):
            for f in friends[: 5 * n]:
                members.append(models.GroupMember(group_id=g.id, user_id=f.id,
                                                  role="member", status="active"))
        # a circle where me is curator and there are pending self-join requests (BQ-38)
        for f in friends[: 4 * n]:
            members.append(models.GroupMember(group_id=g_curator.id, user_id=f.id,
                                              role="member", status="pending",
                                              invited_by=None))
        # circles others created that me has NOT joined (BQ-30 discover)
        for g in discover:
            members.append(models.GroupMember(group_id=g.id, user_id=g.created_by,
                                              role="curator", status="active"))
        # pending invites to me (BQ-31)
        for g in invited:
            members.append(models.GroupMember(group_id=g.id, user_id=g.created_by,
                                              role="curator", status="active"))
            members.append(models.GroupMember(group_id=g.id, user_id=me.id, role="member",
                                              status="pending", invited_by=g.created_by))
        # my own pending self-join requests (BQ-29) — the N+1 this guard was written for
        for g in pendings:
            members.append(models.GroupMember(group_id=g.id, user_id=g.created_by,
                                              role="curator", status="active"))
            members.append(models.GroupMember(group_id=g.id, user_id=me.id, role="member",
                                              status="pending", invited_by=None))
        s.add_all(members)
        s.commit()

        posts, activity = [], []
        for g in (g_pub, g_priv):
            for i in range(10 * n):
                posts.append(models.GroupPost(group_id=g.id, user_id=friends[i % len(friends)].id,
                                              text=f"post {i}",
                                              userbook_id=my_ubs[i % len(my_ubs)].id,
                                              created_at=now - timedelta(minutes=i)))
                activity.append(models.GroupActivity(group_id=g.id,
                                                     user_id=friends[i % len(friends)].id,
                                                     event_type="book_started", payload=None,
                                                     created_at=now - timedelta(minutes=i)))
        s.add_all(posts)
        s.add_all(activity)
        s.commit()

    db.data = d
    return d


def _seed_empty(db: BudgetDb):
    """A database with one reader and one admin and nothing else.

    The only way BQ-08e (`/notes/feed` on an empty feed) is measurable at all: the feed is
    global, not per-caller, so on the shared conftest database it can never be empty (K-03).
    """
    d = Seeded()
    with db.session() as s:
        me = _user(s, "budget_empty_me@example.com", "Empty Reader")
        admin = _user(s, "budget_empty_admin@example.com", "Empty Admin", admin=True)
        s.commit()
        s.refresh(me)
        s.refresh(admin)
        d.me, d.admin = me.id, admin.id
        d.me_email, d.admin_email = me.email, admin.email
    db.data = d
    return d


# ══════════════════════════════════════════════════════════════════════════════
# 4. The budget table (spec.md R-06, tests.md 7.1 re-measured under the scope cut)
# ══════════════════════════════════════════════════════════════════════════════

RATCHET = "ratchet"
TARGET = "target"


@dataclass
class Row:
    bq: str
    endpoint: str          # the architecture's template, e.g. "GET /profile/{id}"
    branch: str
    kind: str              # RATCHET | TARGET
    expected: int
    budget: int
    before: str            # the architecture's "now" column, printed so the message says
                           # what was lost
    url: Callable          # (Seeded) -> str
    who: Optional[str] = "me"   # "me" | "admin" | "anon" | "empty_viewer"
    status: int = 200
    db: str = "small"      # "small" | "empty"
    scales: bool = True    # re-measured on the large seed by L-4E-47
    empty_state: bool = False   # an `if not rows: return []` early-return row (L-4E-48)


def _h(d, who):
    if who is None or who == "anon":
        return None
    if who == "admin":
        return headers_for(d.admin_email)
    if who == "empty_viewer":
        return headers_for(d.empty_viewer_email)
    return headers_for(d.me_email)


# The `expected` numbers are filled in from the measured counts on this tree; see the
# build notes for the measurement and for what each `kind` means.
BUDGETS = [
    Row("01", "GET /version", "—", RATCHET, 0, 0, "0",
        lambda d: "/version", who="anon", scales=False),
    Row("02", "GET /profile/me", "signed in", RATCHET, 5, 5, "5",
        lambda d: "/profile/me"),
    Row("03", "GET /profile/{id}", "public subject", RATCHET, 7, 7, "7",
        lambda d: f"/profile/{d.pub}"),
    Row("03p", "GET /profile/{id}", "private, non-follower (locked 200)", RATCHET, 6, 6, "7",
        lambda d: f"/profile/{d.privx}"),
    Row("03f", "GET /profile/{id}", "private, follower", RATCHET, 7, 7, "7",
        lambda d: f"/profile/{d.priv}"),
    Row("04", "GET /userbooks/", "—", RATCHET, 3, 3, "3",
        lambda d: "/userbooks/"),
    Row("05", "GET /userbooks/{id}", "owner", RATCHET, 3, 3, "3",
        lambda d: f"/userbooks/{d.my_userbook}", scales=False),
    Row("06", "GET /userbooks/user/{id}", "public subject", RATCHET, 4, 4, "4",
        lambda d: f"/userbooks/user/{d.pub}"),
    Row("06f", "GET /userbooks/user/{id}", "private, follower", RATCHET, 5, 5, "5",
        lambda d: f"/userbooks/user/{d.priv}"),
    Row("07", "GET /userbooks/friends/currently-reading", "—", RATCHET, 6, 6, "6",
        lambda d: "/userbooks/friends/currently-reading"),
    Row("08", "GET /notes/feed", "signed in", RATCHET, 8, 8, "8",
        lambda d: "/notes/feed"),
    Row("08a", "GET /notes/feed", "anonymous (K-10)", RATCHET, 6, 6, "7",
        lambda d: "/notes/feed", who="anon"),
    Row("08e", "GET /notes/feed", "empty database (K-03)", RATCHET, 2, 2, "2",
        lambda d: "/notes/feed", db="empty", scales=False, empty_state=True),
    Row("09", "GET /notes/friends-feed", "—", RATCHET, 10, 10, "10",
        lambda d: "/notes/friends-feed"),
    Row("09e", "GET /notes/friends-feed", "follows nobody", RATCHET, 2, 2, "2",
        lambda d: "/notes/friends-feed", who="empty_viewer", scales=False, empty_state=True),
    Row("10", "GET /notes/me", "—", RATCHET, 8, 8, "8",
        lambda d: "/notes/me"),
    Row("11", "GET /notes/user/{id}", "public author", RATCHET, 9, 9, "9",
        lambda d: f"/notes/user/{d.pub}"),
    Row("11f", "GET /notes/user/{id}", "private author, follower", RATCHET, 10, 10, "10",
        lambda d: f"/notes/user/{d.priv}"),
    Row("12", "GET /notes/userbook/{id}", "owner", RATCHET, 6, 6, "6",
        lambda d: f"/notes/userbook/{d.my_userbook}", scales=False),
    Row("13", "GET /notes/{id}/comments", "—", RATCHET, 5, 5, "4",
        lambda d: f"/notes/{d.friend_note}/comments"),
    Row("14", "GET /books/recommendations", "—", RATCHET, 12, 12, "12",
        lambda d: "/books/recommendations"),
    Row("14n", "GET /books/recommendations", "follows nobody", RATCHET, 4, 4, "12",
        lambda d: "/books/recommendations", who="empty_viewer", scales=False),
    Row("15", "GET /books/{id}", "—", RATCHET, 2, 2, "2",
        lambda d: f"/books/{d.book}", scales=False),
    Row("16", "GET /books/search", "—", RATCHET, 2, 2, "2",
        lambda d: "/books/search?q=Budget"),
    Row("17", "GET /notifications/unread-count", "—", RATCHET, 2, 2, "2",
        lambda d: "/notifications/unread-count"),
    Row("18", "GET /notifications/history", "—", RATCHET, 2, 2, "2",
        lambda d: "/notifications/history"),
    Row("19", "GET /notifications/prefs", "—", RATCHET, 1, 1, "1",
        lambda d: "/notifications/prefs", scales=False),
    Row("20", "GET /follow/followers", "—", RATCHET, 2, 2, "2",
        lambda d: "/follow/followers"),
    Row("21", "GET /follow/following", "—", RATCHET, 2, 2, "2",
        lambda d: "/follow/following"),
    Row("22", "GET /users/following", "—", RATCHET, 4, 4, "4",
        lambda d: "/users/following"),
    Row("22e", "GET /users/following", "follows nobody", RATCHET, 2, 2, "2",
        lambda d: "/users/following", who="empty_viewer", scales=False, empty_state=True),
    Row("23", "GET /users/search", "q matches several", RATCHET, 4, 4, "4",
        lambda d: "/users/search?q=Searchable"),
    Row("23e", "GET /users/search", 'q="" (early return)', RATCHET, 1, 1, "1",
        lambda d: "/users/search?q=", scales=False, empty_state=True),
    Row("24", "GET /users/{id}/stats", "public subject, 50 finished", TARGET, 3, 3, "3+F",
        lambda d: f"/users/{d.pub}/stats"),
    Row("24f", "GET /users/{id}/stats", "private, follower", RATCHET, 4, 4, "4+F",
        lambda d: f"/users/{d.priv}/stats"),
    Row("25", "GET /reading-activity/daily", "—", RATCHET, 2, 2, "2",
        lambda d: "/reading-activity/daily?days=30"),
    Row("26", "GET /reading-activity/insights", "—", RATCHET, 4, 4, "4",
        lambda d: "/reading-activity/insights"),
    Row("27", "GET /reading-activity/user/{id}/daily", "public subject", RATCHET, 3, 3, "3",
        lambda d: f"/reading-activity/user/{d.pub}/daily?days=30"),
    Row("27f", "GET /reading-activity/user/{id}/daily", "private, follower", RATCHET, 4, 4, "4",
        lambda d: f"/reading-activity/user/{d.priv}/daily?days=30"),
    Row("28", "GET /groups/my", "4 circles", RATCHET, 6, 6, "6",
        lambda d: "/groups/my"),
    Row("28e", "GET /groups/my", "no circles", RATCHET, 2, 2, "2",
        lambda d: "/groups/my", who="empty_viewer", scales=False, empty_state=True),
    Row("29", "GET /groups/my/pending", "25 pending", TARGET, 3, 3, "3+n",
        lambda d: "/groups/my/pending"),
    Row("29e", "GET /groups/my/pending", "none pending", TARGET, 2, 2, "2",
        lambda d: "/groups/my/pending", who="empty_viewer", scales=False, empty_state=True),
    Row("30", "GET /groups/discover", "public circles not joined", RATCHET, 7, 7, "7",
        lambda d: "/groups/discover"),
    Row("30e", "GET /groups/discover", "none", RATCHET, 2, 2, "2",
        lambda d: "/groups/discover", db="empty", scales=False, empty_state=True),
    Row("31", "GET /groups/invites/pending", "1 invite", RATCHET, 7, 7, "7",
        lambda d: "/groups/invites/pending"),
    Row("31e", "GET /groups/invites/pending", "none", RATCHET, 2, 2, "2",
        lambda d: "/groups/invites/pending", who="empty_viewer", scales=False, empty_state=True),
    Row("32", "GET /groups/{id}", "public circle", RATCHET, 8, 8, "8",
        lambda d: f"/groups/{d.g_pub}"),
    Row("32p", "GET /groups/{id}", "private, active member", RATCHET, 9, 9, "9",
        lambda d: f"/groups/{d.g_priv}"),
    Row("33", "GET /groups/{id}/members", "public", RATCHET, 4, 4, "4",
        lambda d: f"/groups/{d.g_pub}/members"),
    Row("33p", "GET /groups/{id}/members", "private, member", RATCHET, 5, 5, "5",
        lambda d: f"/groups/{d.g_priv}/members"),
    Row("34", "GET /groups/{id}/leaderboard", "public, monthly", RATCHET, 8, 8, "8",
        lambda d: f"/groups/{d.g_pub}/leaderboard?period=monthly"),
    Row("34p", "GET /groups/{id}/leaderboard", "private, member, alltime", RATCHET, 9, 9, "9",
        lambda d: f"/groups/{d.g_priv}/leaderboard?period=alltime"),
    Row("34e", "GET /groups/{id}/leaderboard", "no active members", RATCHET, 3, 3, "3",
        lambda d: f"/groups/{d.g_nomembers}/leaderboard?period=monthly", scales=False),
    Row("35", "GET /groups/{id}/goal", "public", RATCHET, 4, 4, "4",
        lambda d: f"/groups/{d.g_pub}/goal"),
    Row("35p", "GET /groups/{id}/goal", "private, member", RATCHET, 5, 5, "5",
        lambda d: f"/groups/{d.g_priv}/goal"),
    Row("36", "GET /groups/{id}/posts", "with book cards", RATCHET, 6, 6, "7",
        lambda d: f"/groups/{d.g_pub}/posts"),
    Row("36p", "GET /groups/{id}/posts", "private, member", RATCHET, 7, 7, "8",
        lambda d: f"/groups/{d.g_priv}/posts"),
    Row("37", "GET /groups/{id}/activity", "public", RATCHET, 4, 4, "4",
        lambda d: f"/groups/{d.g_pub}/activity"),
    Row("37p", "GET /groups/{id}/activity", "private, member", RATCHET, 5, 5, "5",
        lambda d: f"/groups/{d.g_priv}/activity"),
    Row("38", "GET /groups/{id}/pending", "curator", RATCHET, 4, 4, "4",
        lambda d: f"/groups/{d.g_curator}/pending"),
    Row("39", "GET /admin/stats", "—", RATCHET, 15, 15, "15",
        lambda d: "/admin/stats", who="admin"),
    Row("40", "GET /admin/users", "—", RATCHET, 5, 5, "5",
        lambda d: "/admin/users", who="admin"),
    Row("41", "GET /admin/books", "—", RATCHET, 5, 5, "5",
        lambda d: "/admin/books", who="admin"),
    Row("42", "GET /admin/follows", "—", RATCHET, 3, 3, "3",
        lambda d: "/admin/follows", who="admin"),
    Row("43", "GET /admin/content/notes", "—", RATCHET, 5, 5, "5",
        lambda d: "/admin/content/notes", who="admin"),
    Row("44", "GET /admin/content/comments", "—", RATCHET, 3, 3, "3",
        lambda d: "/admin/content/comments", who="admin"),
]

# A guard that enumerates nothing passes. These two literals are what make that impossible;
# they are asserted before any count is compared (test_the_table_is_whole).
EXPECTED_ROWS = 67
EXPECTED_ENDPOINTS = 44

BY_ID = {r.bq: r for r in BUDGETS}


# ── the failure message (tests.md 2.4, spec.md R-06) ──────────────────────────

MESSAGE_RE = re.compile(
    r"^GET (?P<url>\S+) \[(?P<branch>[^\]]*)\] ran (?P<actual>\d+) queries, "
    r"budget (?P<budget>\d+) \((?P<kind>ratchet|target)\), "
    r"expected (?P<expected>\d+) \(was (?P<before>[^)]+) before Sprint 4E\)\."
)


def report(row: Row, url: str, m: Measurement) -> str:
    head = (
        f"GET {url} [{row.branch}] ran {m.n} queries, budget {row.budget} ({row.kind}), "
        f"expected {row.expected} (was {row.before} before Sprint 4E).\n"
        f"A query was added to this endpoint, or a batched load became per-row.\n"
        f"BQ-{row.bq}  {row.endpoint}  kind={row.kind}\n"
        f"Statements:"
    )
    shown = m.statements[: BudgetRecorder.MAX_PRINTED]
    lines = [f"  {i + 1}. {s}" for i, s in enumerate(shown)]
    if len(m.statements) > len(shown):
        lines.append(f"  ... and {len(m.statements) - len(shown)} more")
    return head + "\n" + "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# 5. Fixtures
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module", autouse=True)
def budget_world():
    """Own the databases, the counters and the request/task split for this module only."""
    _seed(SMALL, 1)
    _seed(LARGE, 10)
    _seed_empty(EMPTY)

    real_task = deps._persist_user_touch
    listening = []
    for db in (SMALL, LARGE, EMPTY):
        rec = BudgetRecorder()
        _RECORDERS[db.name] = rec
        event.listen(db.engine, "before_cursor_execute", rec._before_cursor_execute)
        event.listen(db.engine, "checkout", rec._checkout)
        listening.append((db, rec))

    def _wrapped(*args, **kwargs):
        for rec in _RECORDERS.values():
            rec.mark_task()
        return real_task(*args, **kwargs)

    deps._persist_user_touch = _wrapped

    previous = dict(app.dependency_overrides)
    try:
        yield
    finally:
        deps._persist_user_touch = real_task
        for db, rec in listening:
            event.remove(db.engine, "before_cursor_execute", rec._before_cursor_execute)
            event.remove(db.engine, "checkout", rec._checkout)
        _RECORDERS.clear()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def _use(db: BudgetDb):
    app.dependency_overrides[get_db] = db.session_override()
    app.dependency_overrides[get_session] = app.dependency_overrides[get_db]
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture()
def small_client():
    return _use(SMALL)


@pytest.fixture()
def empty_client():
    return _use(EMPTY)


# ══════════════════════════════════════════════════════════════════════════════
# 6. Cases
# ══════════════════════════════════════════════════════════════════════════════

class TestTableIntegrity:
    """ST-4E-08 and the "a guard that enumerates nothing passes" trap.

    These run before any count is compared. A parametrised budget test with zero
    parameters is silently green; a literal count is the only thing that catches it.
    """

    def test_the_table_is_whole(self):
        assert len(BUDGETS) == EXPECTED_ROWS, (
            f"the budget table has {len(BUDGETS)} rows, expected {EXPECTED_ROWS}. "
            "Rows were added or removed without updating the literal — a trimmed table is "
            "how this guard rots."
        )
        assert len(BY_ID) == len(BUDGETS), "duplicate BQ ids in the budget table"
        endpoints = {r.endpoint for r in BUDGETS}
        assert len(endpoints) == EXPECTED_ENDPOINTS, (
            f"the table covers {len(endpoints)} distinct endpoints, expected "
            f"{EXPECTED_ENDPOINTS}: {sorted(endpoints)}"
        )
        for r in BUDGETS:
            assert r.kind in (RATCHET, TARGET), f"BQ-{r.bq} has no kind"
            assert r.budget >= r.expected, f"BQ-{r.bq} budget is below its expected count"
            assert r.budget <= r.expected + 1, (
                f"BQ-{r.bq} budget {r.budget} is more than one above expected {r.expected} "
                "(R-06: margin of at most one)"
            )

    def test_only_two_targets_the_rest_are_ratchets(self):
        """pm-decisions.md: P2..P6 were dropped, so only two endpoints have a real target.

        If a later sprint delivers an optimisation it moves that row to TARGET here, in the
        same commit as the fix. Nobody may promote a row without doing the work.
        """
        targets = sorted({r.endpoint for r in BUDGETS if r.kind == TARGET})
        assert targets == ["GET /groups/my/pending", "GET /users/{id}/stats"], (
            f"targets are {targets}; only the two N+1 loops that shipped "
            "(build-notes-4e-n1.md) are targets. Everything else is a ratchet."
        )

    def test_the_table_covers_the_architectures_44_endpoints(self):
        """ST-4E-08: a table quietly trimmed to the endpoints that pass is not a guard."""
        arch = Path(__file__).resolve().parents[1] / (
            "features/maintenance/sprint-4e-query-budget/architecture.md")
        text = arch.read_text(encoding="utf-8")
        listed = re.findall(r"^\|\s*\d+\s*\|\s*`(GET [^`]+)`\s*\|", text, flags=re.M)
        assert len(listed) == EXPECTED_ENDPOINTS, (
            f"parsed {len(listed)} endpoints out of {arch.name}, expected "
            f"{EXPECTED_ENDPOINTS} — the table in architecture.md moved and this parse is "
            "no longer reading it"
        )
        missing = sorted(set(listed) - {r.endpoint for r in BUDGETS})
        assert not missing, f"the budget table does not cover: {missing}"


@pytest.mark.parametrize("bq", [r.bq for r in BUDGETS], ids=[r.bq for r in BUDGETS])
def test_query_budget(bq, budget_world):
    """L-4E-46: every row of the budget table, on seed(scale=1).

    Fails when a count RISES. A count that falls prints UNDER and passes — under the scope
    cut a lower number is an invitation to lower the budget in the same commit, not a
    failure (pm-decisions.md).
    """
    row = BY_ID[bq]
    db = {"small": SMALL, "empty": EMPTY}[row.db]
    client = _use(db)
    d = db.data
    url = row.url(d)
    m = measure(db, client, url, headers=_h(d, row.who), expect=row.status)

    assert m.n <= row.budget, report(row, url, m)
    if m.n < row.expected:
        print(f"UNDER: GET {url} [{row.branch}] ran {m.n}, expected {row.expected} "
              f"({row.kind}) — lower the budget in the same commit that earned it")


def test_no_endpoint_scales_with_row_count(budget_world):
    """L-4E-47: the N+1 killer — the same request on seed(1) and seed(10).

    A row whose count differs fails even when both counts are under budget: growth with n
    is the defect, not the absolute number. This is the rule that catches a restored N+1,
    and it is why the guard cannot be satisfied by raising a budget.
    """
    # `_use` rebinds the app's dependency overrides, so the client must be built again
    # immediately before each measurement — two clients held at once would both talk to
    # whichever database was wired last, and every row would compare a seed with itself.
    rows = [r for r in BUDGETS if r.scales and r.db == "small"]
    assert len(rows) >= 40, (
        f"only {len(rows)} rows are re-measured on the large seed; the N+1 case is not "
        "covering the table"
    )

    failures, bigger = [], []
    for row in rows:
        s = measure(SMALL, _use(SMALL), row.url(SMALL.data), headers=_h(SMALL.data, row.who),
                    expect=row.status)
        l = measure(LARGE, _use(LARGE), row.url(LARGE.data), headers=_h(LARGE.data, row.who),
                    expect=row.status)
        if s.n != l.n:
            failures.append(
                f"BQ-{row.bq} {row.endpoint} [{row.branch}]: {s.n} queries on the small "
                f"seed, {l.n} on the large seed — this endpoint scales with row count\n"
                + "\n".join(f"    {i + 1}. {t}" for i, t in enumerate(l.statements[:8]))
            )
        if isinstance(s.body, list) and isinstance(l.body, list) and len(l.body) > len(s.body):
            bigger.append(row.bq)

    assert not failures, "\n".join(failures)
    # (b) prove the large seed was really served — a guard that measured the small seed
    # twice would pass every row above.
    assert len(bigger) >= 5, (
        f"only {len(bigger)} endpoints returned a longer body on the large seed "
        f"({bigger}); the large seed does not look larger, so this case proves nothing"
    )
    stats_small = measure(SMALL, _use(SMALL), f"/users/{SMALL.data.pub}/stats",
                          headers=_h(SMALL.data, "me"))
    stats_large = measure(LARGE, _use(LARGE), f"/users/{LARGE.data.pub}/stats",
                          headers=_h(LARGE.data, "me"))
    assert stats_large.body["finished"] >= 10 * stats_small.body["finished"], (
        f"the stats subject has {stats_small.body['finished']} finished books on the small "
        f"seed and {stats_large.body['finished']} on the large one — the large seed is not "
        "ten times the small one, so a surviving N+1 could hide"
    )
    assert stats_small.body["finished"] >= 50, (
        f"the stats subject has only {stats_small.body['finished']} finished books; a "
        "budget measured there could not tell 3 queries from 3 + F"
    )
    pending_small = measure(SMALL, _use(SMALL), "/groups/my/pending",
                            headers=_h(SMALL.data, "me"))
    assert len(pending_small.body) >= 25, (
        f"the reader has only {len(pending_small.body)} pending circles; a budget measured "
        "there could not tell 3 queries from 3 + n"
    )


def test_empty_accounts_keep_their_early_returns(budget_world):
    """L-4E-48: the `if not rows: return []` guards.

    A merge that deletes the guard and runs the big statement anyway still returns [], so
    the body proves nothing — only the count does.
    """
    rows = [r for r in BUDGETS if r.empty_state]
    assert len(rows) == 8, f"expected 8 empty-state rows, found {len(rows)}: {[r.bq for r in rows]}"
    problems = []
    for row in rows:
        db = {"small": SMALL, "empty": EMPTY}[row.db]
        client = _use(db)
        d = db.data
        url = row.url(d)
        m = measure(db, client, url, headers=_h(d, row.who), expect=row.status)
        if isinstance(m.body, list) and m.body:
            problems.append(f"BQ-{row.bq} GET {url} returned {len(m.body)} rows, expected []")
        if m.n > row.budget:
            problems.append(report(row, url, m))
        if m.n > 3:
            problems.append(
                f"BQ-{row.bq} GET {url} [{row.branch}] ran {m.n} queries on an empty "
                f"account; an early-return guard costs 1-2 plus authentication"
            )
    assert not problems, "\n".join(problems)


def test_priming_the_reader_does_not_change_any_count(budget_world):
    """L-4E-49 (K-09): the guard's own assumption.

    Every other case primes with one request to absorb the once-a-day `last_active` write.
    After P1 that write is a background task and the prime is unnecessary — but the prime
    must stay, because a guard that assumes P1 is correct cannot also be the thing that
    catches P1 regressing. This case is the only one that does not prime.
    """
    client = _use(SMALL)
    d = SMALL.data
    urls = ["/profile/me", "/notifications/unread-count", "/userbooks/",
            "/reading-activity/daily?days=30", "/users/following", "/groups/my"]
    problems = []
    for url in urls:
        # a reader whose last_active is yesterday: the next request is the first of their
        # local day, which is when 4C's write used to happen inside the request
        with SMALL.session() as s:
            u = s.get(models.User, d.me)
            u.last_active = datetime.utcnow() - timedelta(days=2)
            s.add(u)
            s.commit()
        unprimed = measure(SMALL, client, url, headers=_h(d, "me"), prime=False)
        primed = measure(SMALL, client, url, headers=_h(d, "me"), prime=True)
        if (unprimed.n, unprimed.checkouts) != (primed.n, primed.checkouts):
            problems.append(
                f"GET {url} unprimed {unprimed.n} statements / {unprimed.checkouts} "
                f"checkouts, primed {primed.n} / {primed.checkouts}\n"
                + "\n".join(f"    {i + 1}. {t}" for i, t in enumerate(unprimed.statements))
            )
    assert not problems, (
        "the first request of a reader's local day costs more than a later one — P1's "
        "deferred `last_active` write is back on the request path:\n" + "\n".join(problems)
    )


def test_the_guard_fails_loudly(budget_world):
    """L-4E-50: the reporter itself. A guard whose failure is unreadable has not met R-06.

    R-06 requires the endpoint, the budget and the actual count; the table adds the kind,
    the expected count and the before number, so the message says what was lost and whether
    the number it broke was ever a target.
    """
    client = _use(SMALL)
    d = SMALL.data
    impossible = Row("XX", "GET /profile/me", "signed in", RATCHET, 0, 0, "5",
                     lambda _d: "/profile/me")
    m = measure(SMALL, client, "/profile/me", headers=_h(d, "me"))
    with pytest.raises(AssertionError) as exc:
        assert m.n <= impossible.budget, report(impossible, "/profile/me", m)
    text = str(exc.value)
    first = text.splitlines()[0]

    match = MESSAGE_RE.match(first)
    assert match, f"message did not match the R-06 format: {first!r}"
    assert match.group("url") == "/profile/me"
    assert int(match.group("actual")) == m.n and m.n > 0
    assert int(match.group("budget")) == 0
    assert match.group("kind") == RATCHET
    assert match.group("before") == "5"
    assert "Statements:" in text
    # pytest re-indents a custom assertion message, so match on any leading whitespace.
    printed = [ln for ln in text.splitlines() if re.match(r"^\s+\d+\. ", ln)]
    assert len(printed) >= 3, f"only {len(printed)} statements printed:\n{text}"

    # No bound parameter value may reach the message — the statements are the SQL text
    # only, so no email, token or note body can leak into a CI log.
    for needle in (d.me_email, "budget_friend_", "Budget Book", "my note"):
        assert needle not in text, f"the failure message leaked {needle!r}:\n{text}"
