# app/routers/blocks_router.py
"""Sprint 4I-B — `POST /blocks/{user_id}`, `DELETE /blocks/{user_id}`, `GET /blocks`.

App Store Review Guideline 1.2 item 3 asks for "the ability to block abusive users". The thing a
reader is trying to stop is not *seeing* the other reader — they can scroll past — it is *being
reached by* them, so the block is **symmetric in visibility and interaction, asymmetric in
control, and destructive to the follow graph** (R-20, pm-decisions E-1).

What this router must never become:

- **A way to learn you have been blocked.** `GET /blocks` returns the viewer's OUTBOUND blocks
  only (B-07). No notification is fired, by anybody, for a block or an unblock. Every refusal
  elsewhere is a 404 shaped like a deleted account, not a 403 shaped like "you are blocked".
- **A way to enumerate reader ids.** A block on an existing reader is 200 whether or not they
  had already been blocked, and a missing row is the same 404 `/profile/{id}` already gives, so
  the route distinguishes nothing a reader could not already learn there.
- **A partial state.** The block row and the teardown of every live relationship between the two
  are ONE transaction with ONE commit (R-21, B-08). A block that committed without the unfollow
  would leave the pair in each other's friends feed until somebody noticed.

What a block does NOT do, stated because "blocked" is easily read as "gone":

- It does not unpublish public posts. `GET /notes/feed` serves signed-out callers and there is
  no viewer to filter for, so a blocked reader who signs out still sees the public feed (E-8).
  The control for that is the existing private-profile setting, and the client copy says so.
- It does not eject anybody from a circle (E-2). Each still sees the other in Members and on the
  leaderboard of a circle they share.
- It does not delete likes or comments left before it (E-4). Removing them would rewrite other
  people's threads; they are hidden from the blocked reader's view, which is the point.
- It does not survive as a reversible act: unblocking restores no follow (R-21).
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .. import blocks, models
from ..deps import get_db, get_current_user, deny_bot_actor

router = APIRouter(prefix="/blocks", tags=["blocks"])

# The two bodies this router returns. `blocked: true` is the same answer for a new block and for
# one that already existed, so tapping Block twice tells the reader nothing new (B-02).
_BLOCKED = {"blocked": True}
_UNBLOCKED = {"blocked": False}


@router.post("/{user_id}", status_code=status.HTTP_200_OK)
def block_user(
    user_id: int,
    response: Response,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _: None = Depends(deny_bot_actor),     # R-27: a bot does not block. Before any row.
):
    """Block a reader: one `block` row, and every live relationship between the two removed.

    A bot may be blocked — a reader who does not want `@TMRBot` in their feed can say so, and
    the symmetric half is simply inert, because a bot reads no feed and `deny_bot_actor` means
    it holds no follow, like or comment to lose (R-27, B-31).
    """
    if user_id == current_user.id:
        # `follow_router.py:15-16`'s rule and its status, so the two refusals match.
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    target = db.get(models.User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        db.add(models.Block(blocker_id=current_user.id, blocked_id=user_id))
        blocks.sever_relationships(db, current_user.id, user_id)
        db.commit()                        # ONE commit for the row and the teardown (B-08)
    except IntegrityError:
        # Already blocked, or a concurrent duplicate lost the race on uq_block_pair. Either way
        # the end state the caller asked for already holds, so this is the same 200 the first
        # call returned and never a 500 (`follow_router.py:39-44`'s shape).
        #
        # The `try` opens at the INSERT and not at the commit, which it did at first: the
        # teardown runs SELECTs, SQLAlchemy autoflushes the pending Block row to serve them, and
        # a second block therefore raises inside `sever_relationships` and never reaches the
        # commit. A catch wrapped around `db.commit()` alone turns tapping Block twice into a
        # 500 — measured, which is why this comment exists.
        db.rollback()
    return dict(_BLOCKED)


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
def unblock_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Lift a block. Restores NO follow (R-21) and notifies nobody.

    Only the blocker can reach this, because only their own row is looked up: a reader who was
    blocked cannot unblock themselves, and `DELETE /blocks/{someone}` with no row is a no-op
    200 rather than a 404, so it reveals nothing about whether that someone blocked them.

    No `deny_bot_actor`: a bot can hold no block row to lift, so the dependency would widen
    `tests/test_bots.py::GUARDED_ROUTES` for a route that cannot be reached with effect (B-04a
    asserts the inventory is exactly six and that this route is not in it).
    """
    row = db.exec(
        select(models.Block)
        .where(models.Block.blocker_id == current_user.id)
        .where(models.Block.blocked_id == user_id)
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return dict(_UNBLOCKED)


@router.get("", status_code=status.HTTP_200_OK)
def list_blocks(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """The readers THIS reader has blocked — never the readers who blocked them (R-20, R-28).

    Two statements whatever the number of blocks (B-07a): the rows, then one batched user load.
    This route is deliberately not in `tests/test_query_budget.py`'s table (E-7: its
    `EXPECTED_ENDPOINTS` literal does double duty against another sprint's document), so the
    ceiling is asserted inside `tests/test_blocks.py` instead. Unbudgeted is not unmeasured.
    """
    rows = db.exec(
        select(models.Block)
        .where(models.Block.blocker_id == current_user.id)
        .order_by(models.Block.created_at.desc())
    ).all()
    if not rows:
        return []
    ids = [r.blocked_id for r in rows]
    users = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(ids))).all()}
    out = []
    for r in rows:
        u = users.get(r.blocked_id)
        if not u:
            continue
        out.append({
            "user_id": u.id,
            "name": u.name,
            "username": u.username,
            "profile_picture": getattr(u, "profile_picture", None),
            "blocked_at": r.created_at.isoformat() + "Z",
        })
    return out
