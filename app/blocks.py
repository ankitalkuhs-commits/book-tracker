# app/blocks.py
"""Sprint 4I-B (R-23) — the one place the block relation is read, and the one place it is torn down.

WHY THIS IS A MODULE AND NOT A `NOT EXISTS` IN FOURTEEN QUERIES
===============================================================
A correlated `NOT EXISTS` with the two `or_` arms costs zero extra statements and was tried and
rejected (architecture §"The filter, proved", case F). Two reasons, the second the stronger:

1. It has to be hand-written into each of the fourteen filtered queries, and each one is a place
   to transpose `blocker_id` and `blocked_id` in one arm and ship a block that is silently
   one-directional. Here the two arms are written once, so there is one thing to get right and
   one thing to test (MUT-4I-30 is that mutation, and it turns every `blocked`-direction
   parameter of B-10 red).
2. It leaves every query budget unchanged, so `tests/test_query_budget.py` could not tell a
   filtered feed from an unfiltered one. The +1 on each of 24 rows **is** the evidence that the
   filter ran: delete a filter and the guard goes red. The extra statement buys a test.

THE TRAP THIS MODULE AVOIDS, HIT FOR REAL WHILE THE DESIGN WAS BEING CHECKED
============================================================================
A SQL `UNION` of `select(Block.blocked_id).where(blocker_id == me)` and
`select(Block.blocker_id).where(blocked_id == me)`, through SQLModel's `Session.exec()`, is one
statement and returns the right rows — as `Row` tuples, not scalars. Feeding those to `notin_()`
raises `ProgrammingError: type 'Row' is not supported`. Flattening with `.scalars()` costs a
SECOND statement, because `exec()` has already run the query by the time it is reached. The
two-arm `or_` on ONE select is one statement, returns two plain columns and needs no flattening
pass over a result proxy. B-35 asserts this file calls no such constructor, by AST and by text,
and reproduces the `Row` failure in CI so the trap cannot come back quietly.

`notin_(empty)` is safe and silent on the pinned SQLAlchemy 1.4.41: it emits
`NOT IN (SELECT 1 FROM (SELECT 1) WHERE 1!=1)`, returns every row, and raises no warning. That
is the state every reader is in on day one, so it is asserted (B-35b) rather than special-cased
— a `if not hidden` shortcut at a call site is MUT-4I-60 and must go red.

HOW CALL SITES MUST IMPORT THIS (K-4I-10, binding)
==================================================
Through the MODULE, never the function:

    from .. import blocks            #  yes
    hidden = blocks.hidden_user_ids(db, current_user)

The wrong form — importing the FUNCTION rather than the module — binds it into fourteen module
namespaces, and a test can then only patch them one at a time. B-35a is the AST walk that
forbids it (and ST-4I-04 greps for it, so the forbidden spelling is deliberately not written
out anywhere in `app/`, not even in a comment). One module attribute is one seam for all fourteen, which
is what lets B-11 prove the anonymous feed never calls it and B-37 prove it is called exactly
once per request. 4G made the same decision for `fetch_jwks`.
"""
from typing import Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from . import models


def _uid(who) -> Optional[int]:
    """A `User` row or a bare id, because call sites hold the first and tests hold either."""
    if who is None:
        return None
    return who.id if hasattr(who, "id") else int(who)


def hidden_user_ids(db: Session, viewer) -> set[int]:
    """Every user id that must not appear in anything served to `viewer`, in ONE statement.

    Symmetric by construction: the two `or_` arms are the whole of R-20's symmetric-visibility
    clause, and the set comprehension returns *the other* id of each row, so a row in either
    direction hides the same person.

    Call it AFTER an endpoint's early return, never before — eight budget rows are
    `empty_state` rows with a hard ceiling of 3 statements
    (`test_empty_accounts_keep_their_early_returns`), and `BQ-08e` already sits exactly on it.
    Call it ONCE per request, never inside a loop, or `test_no_endpoint_scales_with_row_count`
    fails, which is that test working.
    """
    vid = _uid(viewer)
    if vid is None:
        # No viewer, no block set (E-8). `GET /notes/feed` serves anonymous callers and there is
        # nobody to filter for; B-11 asserts the helper is not even reached on that path, so
        # this branch is defence in depth rather than the control.
        return set()
    rows = db.exec(
        select(models.Block.blocker_id, models.Block.blocked_id).where(
            or_(models.Block.blocker_id == vid, models.Block.blocked_id == vid)
        )
    ).all()
    return {(blocked if blocker == vid else blocker) for blocker, blocked in rows}


def is_blocked_pair(db: Session, a, b) -> bool:
    """True if either of the two has blocked the other, in ONE statement.

    For the five single-subject paths, where the question is about one other reader rather than
    a list. The same two arms as above, so a transposition cannot make one helper disagree with
    the other.
    """
    aid, bid = _uid(a), _uid(b)
    if aid is None or bid is None or aid == bid:
        return False
    return db.exec(
        select(models.Block.id).where(
            or_(and_(models.Block.blocker_id == aid, models.Block.blocked_id == bid),
                and_(models.Block.blocker_id == bid, models.Block.blocked_id == aid))
        )
    ).first() is not None


def sever_relationships(db: Session, a_id: int, b_id: int) -> None:
    """Delete every row that is a live relationship between the two. DOES NOT COMMIT.

    The caller commits, because the block row and these deletions are ONE transaction (R-21,
    B-08): a block that committed without the unfollow would leave the pair in the friends feed
    until somebody noticed, and there is no partial state to describe if there is no partial
    commit. `POST /reports` with `also_block` reuses the same function for the same reason
    (pm-decisions Q-3).

    What goes, and why each one:

    * **Both `follow` rows** (R-21, E-1). Deleting them makes the block true in the nine places
      `follow` is read without a filter in any of them. Unblocking does NOT restore them — the
      alternative is resurrecting a relationship neither person asked for, and R-28's confirm
      copy is what makes that recoverable rather than a surprise.
    * **Pending circle invites between the two**, either direction (pm-decisions Q-1).
    * **Pending self-join requests** where one of the two applied to a circle the other
      curates. Without this, `GET /groups/{id}/pending` would show the curator a request from
      somebody they blocked, and the only honest options would be to filter it — hiding a
      decision from the only person who can take it — or to leave the leak. Deleting the row
      makes "not filtered" true for the reason R-21 makes it true of `/follow/followers`: *the
      row cannot exist*.

    ACTIVE memberships are left alone. A block hides content inside a shared circle and does
    not eject anybody from one (E-2): letting one reader remove another from a space they both
    belong to is a worse act than a name in a Members list, and it is not reversible by the
    person it happens to. The accepted residual is that each still sees the other in Members
    and on the leaderboard, asserted by B-26 so a future "fix" has to be a decision.
    """
    for row in db.exec(
        select(models.Follow).where(
            or_(and_(models.Follow.follower_id == a_id, models.Follow.followed_id == b_id),
                and_(models.Follow.follower_id == b_id, models.Follow.followed_id == a_id))
        )
    ).all():
        db.delete(row)

    # `aliased` is load-bearing: the subquery selects from group_member and so does the outer
    # query, and without the alias SQLAlchemy auto-correlates it and the condition collapses.
    cur = aliased(models.GroupMember)

    def _curated_by(uid: int):
        return select(cur.group_id).where(cur.user_id == uid, cur.role == "curator",
                                          cur.status == "active")

    for row in db.exec(
        select(models.GroupMember).where(
            models.GroupMember.status == "pending",
            or_(
                # curator-sent invites, both directions
                and_(models.GroupMember.user_id == a_id, models.GroupMember.invited_by == b_id),
                and_(models.GroupMember.user_id == b_id, models.GroupMember.invited_by == a_id),
                # self-join requests into a circle the other one curates, both directions
                and_(models.GroupMember.user_id == a_id,
                     models.GroupMember.invited_by == None,            # noqa: E711
                     models.GroupMember.group_id.in_(_curated_by(b_id))),
                and_(models.GroupMember.user_id == b_id,
                     models.GroupMember.invited_by == None,            # noqa: E711
                     models.GroupMember.group_id.in_(_curated_by(a_id))),
            ),
        )
    ).all():
        db.delete(row)
