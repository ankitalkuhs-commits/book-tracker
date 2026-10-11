"""Sprint 4I-B package P6 — the route-coverage guard (B-32, B-32a, spec R-31 item 3).

THIS IS A SECURITY CONTROL, NOT A TIDINESS ONE
==============================================
The failure mode nothing else in this design catches is F3: a later sprint adds an endpoint that
serves another reader's content, nobody remembers R-22's table, and a block leaks on a path no
test knows about. R-22's table is an enumeration built by reading the routers on one day; it
decays the moment somebody adds a route. This file is the durable form of it — a new route fails
CI **unclassified** instead of silently leaking — and it is the only control in the design that
still works in six months.

It is written so it cannot pass vacuously:

* `len(pairs) == EXPECTED_ROUTE_PAIRS` is asserted **before anything else** (rule 4). A coverage
  test that enumerated nothing would otherwise be green.
* `set(CLASSIFICATION) == pairs` reports BOTH differences by name, so an unclassified new route
  and a stale classification each fail loudly.
* The `FILTERED` path set must **equal** the path set of `tests/test_blocks.py::FILTERED_PATHS`.
  A route cannot be marked filtered without a per-path case being parametrised over it, and a
  per-path case cannot exist for a route nobody classified.
* Every `NOT_SERVING` reason must be a real sentence. A classification with no reason is how this
  rots into a list somebody appends to without thinking.
* The classifier is called with a synthetic extra pair and must report **exactly one**
  unclassified route (rules 3 and 14 — "at most one" would pass when it found none).
"""
import pytest
from fastapi.routing import APIRoute
from sqlmodel import select

from app import models
from app.main import app
from tests.blocks_classification import (CLASSIFICATION, EXPECTED_FILTERED, EXPECTED_NOT_SERVING,
                                         EXPECTED_REFUSED, EXPECTED_ROUTE_PAIRS, FILTERED,
                                         NOT_SERVING, REFUSED, unclassified)
from tests.conftest import _auth, _make_user
from tests.test_blocks import FILTERED_PATHS, _block

SENTINEL = "ZZBlockedSentinel"

# The eleven GET paths that deliberately still involve a blocked reader, each with the reason, so
# nobody "fixes" one of them. Two kinds, and the distinction is the point:
#
#   PRESENT       the blocked reader's NAME is still in the body, on purpose. Asserted as a
#                 POSITIVE control, so a future change that starts filtering one of these fails
#                 here and has to be a decision.
#   CANNOT_EXIST  the row itself cannot exist, because the block deleted it and refuses a new
#                 one (R-21 for follows, pm-decisions Q-1 for pending circle rows). "Not
#                 filtered" is true of these for the strong reason, not the weak one — so the
#                 assertion is that the blocked reader is ABSENT while a THIRD reader is
#                 PRESENT in the same response, which is what stops "absent" meaning "empty".
#
# tests.md's B-32a pins ten paths and asserts the sentinel is present on all of them. That is
# wrong on four of them:
# `/follow/*` return ids and no name at all, and all four of these rows are deleted by the
# block. See the build notes.
PRESENT = "present"
CANNOT_EXIST = "cannot_exist"

PINNED_UNFILTERED = (
    ("/follow/followers", CANNOT_EXIST,
     "ids only (follow_router.py:84-87); the row cannot exist under R-21's invariant, and "
     "filtering would desynchronise the client's own follow-button state"),
    ("/follow/following", CANNOT_EXIST,
     "the same, and it returns followed_id rather than follower_id (K-4I-16a)"),
    ("/groups/{group_id}/members", PRESENT,
     "membership is structure, not content (E-2); hiding it desynchronises member_count"),
    ("/groups/{group_id}/leaderboard", PRESENT,
     "a viewer-dependent leaderboard is not a leaderboard (E-2)"),
    ("/groups/my", PRESENT,
     "the only identity is creator_name; hiding it would hide the circle itself"),
    ("/groups/discover", PRESENT,
     "the same — a circle a reader could join must still be discoverable"),
    ("/groups/{group_id}", PRESENT,
     "the same creator_name, on the circle's own detail response"),
    ("/notifications/history", PRESENT,
     "history is a log; rewriting it makes a delivered notification vanish (R-22 row 20)"),
    ("/groups/{group_id}/pending", CANNOT_EXIST,
     "pm-decisions Q-1: a join request the curator must action. Filtering it would hide a "
     "decision from the only person who can take it, so the block deletes the row instead"),
    ("/groups/invites/pending", CANNOT_EXIST,
     "pm-decisions Q-1: the reader's own invites, deleted by the block in the same transaction"),
    # Found by this file's own sweep, which is what the sweep is for: `GET /blocks` carries the
    # blocked reader's name, username and avatar, BY DESIGN — R-28 requires the blocker to see
    # who they have blocked so that they can unblock them. It is the blocker's own list and it
    # is never served to the blocked reader (B-07), so it belongs here as a POSITIVE control
    # rather than in the sweep.
    ("/blocks", PRESENT,
     "R-28: the blocker's own list of who they blocked, so they can lift it. Never served to "
     "the blocked reader, which B-07 asserts from both sides"),
)

# Reachable with a READER's token, and therefore sweepable. The rest are classified
# NOT_SERVING in `tests/blocks_classification.py` with their reasons and are covered
# behaviourally by `tests/test_blocks.py::test_admin_routes_are_never_filtered`.
UNSWEEPABLE = {
    "/admin/books": "403 for a reader (get_admin_user)",
    "/admin/content/comments": "403 for a reader",
    "/admin/content/notes": "403 for a reader",
    "/admin/follows": "403 for a reader",
    "/admin/reports": "403 for a reader",
    "/admin/stats": "403 for a reader",
    "/admin/users": "403 for a reader",
    "/bots/posted": "403 for a reader (bots_router.py:44-48)",
    "/api/googlebooks/book/{google_book_id}": "calls an external API",
    "/api/googlebooks/search": "calls an external API",
    "/import/covers-status": "403 for a reader",
    "/notifications/admin/events": "403 for a reader",
    "/notifications/vapid-public-key": "503 without VAPID_PUBLIC_KEY, which tests do not set",
}

# Routes with a required query parameter. Without it the sweep gets a 422 and the absence of
# the sentinel would prove nothing about the route.
REQUIRED_QUERY = {
    "/books/search": "?q=ZZBlockedSentinel",
}

# Measured on this branch. The Builder re-measures; a difference means a route was added or
# removed by another branch and this guard is doing its job.
EXPECTED_SWEPT = 16


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


class TestRouteCoverage:

    def test_every_route_is_classified(self):
        """B-32. MUT-4I-64: add a route without classifying it -> assert 116 == 115, then the
        unclassified list names it. MUT: delete a FILTERED_PATHS entry -> step 5."""
        pairs = {(m, r.path) for r in app.routes if isinstance(r, APIRoute)
                 for m in r.methods if m != "HEAD"}

        # (1) BEFORE anything else (rule 4).
        assert len(pairs) == EXPECTED_ROUTE_PAIRS, (
            f"the app registers {len(pairs)} method/path pairs, expected "
            f"{EXPECTED_ROUTE_PAIRS}. A route was added or removed: classify it in "
            f"tests/blocks_classification.py and move this literal in the same commit.")

        # (2) both differences, by name.
        missing = sorted(f"{m} {p}" for m, p in pairs - set(CLASSIFICATION))
        stale = sorted(f"{m} {p}" for m, p in set(CLASSIFICATION) - pairs)
        assert missing == [], f"UNCLASSIFIED routes — a block may leak on these: {missing}"
        assert stale == [], f"classified routes that no longer exist: {stale}"

        # (3) the three buckets, each against a literal.
        buckets = {FILTERED: 0, REFUSED: 0, NOT_SERVING: 0}
        for kind, _reason in CLASSIFICATION.values():
            buckets[kind] += 1
        assert buckets[FILTERED] == EXPECTED_FILTERED, buckets
        assert buckets[REFUSED] == EXPECTED_REFUSED, buckets
        assert buckets[NOT_SERVING] == EXPECTED_NOT_SERVING, buckets
        assert sum(buckets.values()) == EXPECTED_ROUTE_PAIRS

        # (4) every reason is a real sentence, not a placeholder.
        thin = sorted(f"{m} {p}" for (m, p), (_k, reason) in CLASSIFICATION.items()
                      if len(reason.strip()) < 20)
        assert thin == [], f"classified with no usable reason: {thin}"

        # (5) FILTERED equals the parametrised table in tests/test_blocks.py. This is the
        # coupling: a route cannot be called filtered unless a case runs against it in both
        # directions, and a case cannot run against a route nobody classified.
        classified_filtered = {p for (m, p), (k, _r) in CLASSIFICATION.items() if k == FILTERED}
        executed = {spec[1] for spec in FILTERED_PATHS}
        assert classified_filtered == executed, sorted(classified_filtered ^ executed)

        # (6) every REFUSED pair is a non-GET: a refusal is an action, not a read.
        refused = {(m, p) for (m, p), (k, _r) in CLASSIFICATION.items() if k == REFUSED}
        assert refused == {
            ("POST", "/follow/{followed_id}"),
            ("POST", "/notes/{note_id}/like"),
            ("POST", "/notes/{note_id}/comments"),
            ("POST", "/groups/{group_id}/invite/{user_id}"),
            ("POST", "/groups/{group_id}/join"),
            ("POST", "/groups/join/{invite_code}"),
            ("POST", "/reports"),
        }, sorted(refused)
        assert not [p for m, p in refused if m == "GET"]

        # CONTROL (rules 3 and 14): the classifier is a pure function, and over a synthetic
        # extra pair it reports EXACTLY one unclassified route. A detector that said "at most
        # one" would be green when it found none.
        synthetic = pairs | {("GET", "/synthetic/leak/{user_id}")}
        assert unclassified(synthetic) == ["GET /synthetic/leak/{user_id}"]
        assert unclassified(pairs) == []

    @pytest.mark.parametrize("path,kind,reason", PINNED_UNFILTERED,
                             ids=[p[0] for p in PINNED_UNFILTERED])
    def test_the_deliberately_unfiltered_paths_are_what_they_claim(self, client, db, path, kind,
                                                                   reason):
        """B-32a. MUT-4I-51: start filtering /groups/{id}/members -> the PRESENT half fails
        naming the path. MUT: stop deleting the pending rows -> the CANNOT_EXIST half."""
        assert len(PINNED_UNFILTERED) == 11, [p[0] for p in PINNED_UNFILTERED]
        assert len([p for p in PINNED_UNFILTERED if p[1] == PRESENT]) == 7
        assert len([p for p in PINNED_UNFILTERED if p[1] == CANNOT_EXIST]) == 4
        assert len(reason) >= 20, reason
        # Every pinned path is classified NOT_SERVING, or the two halves of this file disagree.
        assert CLASSIFICATION[("GET", path)][0] == NOT_SERVING, path

        w = _pinned_world(db, client, path)
        url = path.replace("{group_id}", str(w["group_id"]))
        r = client.get(url, headers=_auth(w["viewer"]))
        assert r.status_code == 200, f"{url}: {r.status_code} {r.text[:200]}"

        if kind == PRESENT:
            assert SENTINEL in r.text, (
                f"{path} no longer shows a blocked reader. That may be an improvement, but it "
                f"is a DECISION — this path is pinned unfiltered because: {reason}")
        else:
            assert SENTINEL not in r.text, (
                f"{path} served a blocked reader. It is classified not-filtered because the "
                f"row cannot exist ({reason}) — if the row CAN exist, the classification is "
                f"wrong and the path needs a filter.")
            # The id check is path-specific: `/follow/*` carry an id and NO name, so the id is
            # the only thing that could leak there. A bare `str(id) not in body` over the whole
            # response matches unrelated ids (it fired on a circle id of 5) and would be a false
            # failure, so the marker is the key-and-value the route actually emits.
            if w["leak_marker"]:
                assert w["leak_marker"] not in r.text, (
                    f"{path} served the blocked reader's id as {w['leak_marker']}")
            # The control that stops "absent" meaning "this endpoint returns nothing".
            assert w["control_marker"] in r.text, (
                f"{path}: the uninvolved reader is missing too, so the body proves nothing. "
                f"Body: {r.text[:300]}")

    def test_no_other_reader_facing_get_leaks_a_blocked_reader(self, client, db):
        """B-32a's sweep half. MUT: leak the sentinel on an unpinned route -> that route named.

        Every NOT_SERVING GET a reader can actually reach, other than the ten pinned ones, must
        not carry the blocked reader's name. The swept count is asserted against a literal
        first, because a sweep that reached nothing passes everything.
        """
        w = _pinned_world(db, client, "/groups/{group_id}/members")
        params = {"{group_id}": str(w["group_id"]), "{user_id}": str(w["viewer"].id),
                  "{userbook_id}": str(w["userbook_id"]), "{book_id}": str(w["book_id"]),
                  "{note_id}": str(w["note_id"])}
        pinned = {p[0] for p in PINNED_UNFILTERED}

        swept, leaks, nonzero = [], [], 0
        for (method, path), (kind, _reason) in sorted(CLASSIFICATION.items()):
            if method != "GET" or kind != NOT_SERVING:
                continue
            if path in pinned or path in UNSWEEPABLE:
                continue
            url = path
            for token, value in params.items():
                url = url.replace(token, value)
            assert "{" not in url, f"add {path} to the sweep's parameter map"
            url += REQUIRED_QUERY.get(path, "")
            swept.append(path)
            r = client.get(url, headers=_auth(w["viewer"]))
            assert r.status_code == 200, f"{url}: {r.status_code} {r.text[:200]}"
            if r.text and r.text not in ("[]", "{}"):
                nonzero += 1
            if SENTINEL in r.text:
                leaks.append(f"GET {path}")

        assert len(swept) == EXPECTED_SWEPT, (
            f"swept {len(swept)} routes, expected {EXPECTED_SWEPT}: {swept}")
        assert nonzero >= 10, (
            f"only {nonzero} of {len(swept)} swept routes returned a non-empty body — the "
            "sweep is not really reading anything")
        assert leaks == [], f"a blocked reader leaked on an unpinned route: {leaks}"


# ══════════════════════════════════════════════════════════════════════════════
# The world the two behavioural cases share
# ══════════════════════════════════════════════════════════════════════════════

def _pinned_world(db, client, path):
    """A viewer who has blocked `ZZBlockedSentinel`, with every pinned path populated.

    Built per path with its own emails, because `tests/conftest.py::_make_user` returns the
    EXISTING row for a reused address and a shared world would silently turn a three-reader
    setup into a one-reader one.
    """
    tag = "".join(ch for ch in path if ch.isalnum())[:28]
    viewer = _make_user(db, email=f"4i-b32a-{tag}-v@example.com", name="B32aViewer")
    blocked = _make_user(db, email=f"4i-b32a-{tag}-b@example.com", name=SENTINEL)
    control = _make_user(db, email=f"4i-b32a-{tag}-c@example.com", name="ZZControlReader")
    # `user.username` is UNIQUE, so the sentinel is suffixed with the tag. The assertions
    # look for SENTINEL as a substring, so both the name and the username still carry it.
    blocked.username = f"{SENTINEL}{tag}"
    db.add(blocked)
    db.commit()
    for u in (viewer, blocked, control):
        db.refresh(u)

    # A circle the BLOCKED reader created and the viewer belongs to, so `creator_name`,
    # Members and the leaderboard all carry the sentinel.
    g = models.ReadingGroup(name=f"ZZ{tag} Circle", description="d", is_private=False,
                            created_by=blocked.id)
    db.add(g)
    db.commit()
    db.refresh(g)
    for u, role in ((blocked, "curator"), (viewer, "member"), (control, "member")):
        db.add(models.GroupMember(group_id=g.id, user_id=u.id, role=role, status="active"))
    # A second public circle the blocked reader created and the viewer has NOT joined, so
    # /groups/discover has a row whose creator_name is the sentinel.
    g2 = models.ReadingGroup(name=f"ZZ{tag} Discover", is_private=False, created_by=blocked.id)
    db.add(g2)
    db.commit()
    db.refresh(g2)
    db.add(models.GroupMember(group_id=g2.id, user_id=blocked.id, role="curator",
                              status="active"))
    db.commit()

    book = models.Book(title=f"ZZ{tag} Book", author="QA", total_pages=120)
    db.add(book)
    db.commit()
    db.refresh(book)
    ub = models.UserBook(user_id=viewer.id, book_id=book.id, status="reading", current_page=5)
    db.add(ub)
    db.commit()
    db.refresh(ub)
    note = models.Note(user_id=viewer.id, userbook_id=ub.id, text=f"ZZ{tag}-OWN-NOTE",
                       is_public=True)
    db.add(note)
    db.commit()
    db.refresh(note)

    # Follows BEFORE the block, so /follow/* has rows the block must remove, plus the control
    # reader's rows which it must not.
    client.post(f"/follow/{blocked.id}", headers=_auth(viewer))
    client.post(f"/follow/{viewer.id}", headers=_auth(blocked))
    client.post(f"/follow/{control.id}", headers=_auth(viewer))
    client.post(f"/follow/{viewer.id}", headers=_auth(control))
    # The blocked reader's follow fired `new_follower` at the viewer, so
    # /notifications/history holds a DELIVERED row carrying the sentinel. That row must survive.

    # A private circle the VIEWER curates, with a pending self-join request from each of the
    # other two, so /groups/{id}/pending has both before the block.
    g3 = models.ReadingGroup(name=f"ZZ{tag} Curated", is_private=True, created_by=viewer.id)
    db.add(g3)
    db.commit()
    db.refresh(g3)
    db.add(models.GroupMember(group_id=g3.id, user_id=viewer.id, role="curator",
                              status="active"))
    db.commit()
    client.post(f"/groups/{g3.id}/join", headers=_auth(blocked))
    client.post(f"/groups/{g3.id}/join", headers=_auth(control))

    # Pending invites TO the viewer, from each of the other two, so /groups/invites/pending has
    # both before the block.
    for inviter in (blocked, control):
        gi = models.ReadingGroup(name=f"ZZ{tag} From {inviter.id}", is_private=True,
                                 created_by=inviter.id)
        db.add(gi)
        db.commit()
        db.refresh(gi)
        db.add(models.GroupMember(group_id=gi.id, user_id=inviter.id, role="curator",
                                  status="active"))
        db.commit()
        client.post(f"/groups/{gi.id}/invite/{viewer.id}", headers=_auth(inviter))

    _block(client, viewer, blocked.id)

    group_for = {
        "/groups/{group_id}/pending": g3.id,
    }
    # The control marker each CANNOT_EXIST path proves itself with.
    control_marker = {
        "/follow/followers": f'"follower_id":{control.id}',
        "/follow/following": f'"followed_id":{control.id}',
        "/groups/{group_id}/pending": "ZZControlReader",
        "/groups/invites/pending": "ZZControlReader",
    }.get(path, "ZZControlReader")
    # Only the two id-only routes get an id assertion; see the comment at the call site.
    leak_marker = {
        "/follow/followers": f'"follower_id":{blocked.id}',
        "/follow/following": f'"followed_id":{blocked.id}',
    }.get(path)

    db.expire_all()
    return {
        "viewer": viewer, "blocked_id": blocked.id, "control": control,
        "group_id": group_for.get(path, g.id),
        "userbook_id": ub.id, "book_id": book.id, "note_id": note.id,
        "control_marker": control_marker, "leak_marker": leak_marker,
    }
