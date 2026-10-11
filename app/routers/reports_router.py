# app/routers/reports_router.py
"""Sprint 4I-A — `POST /reports`: a reader tells a moderator about another reader's content.

App Store Review Guideline 1.2 item 2 asks for a mechanism to report offensive content *with
timely responses*. The row is half of that; the other half is `GET /admin/reports` and the
`content_reported` notification, both in `admin_router.py` and `notifications/config.py`.

What this route is NOT allowed to be:

- **A visibility oracle.** Every refusal that depends on what the viewer may see answers with
  one byte-identical 404 (`_NOT_FOUND_DETAIL`), so a missing note and an invisible note are
  indistinguishable and the route cannot be used to enumerate ids (R-02, S-07).
- **A channel to the reported reader.** Nothing here notifies them, and no response shape
  changes for anybody (R-10).
- **An action against the target.** No flag any serving path reads is written (R-04). The
  content stays exactly as visible as it was until a human deletes it.

Two decisions come from pm-decisions.md and override spec.md where they differ:

- **Any existing user may be reported, bots included** (Q-2). A report is a message to a
  moderator, so visibility is the wrong gate for `target_type: "user"`; `is_private_profile` is
  irrelevant to reporting a person. The response is identical whether or not the reporter could
  see that person, which is what stops this route leaking the existence of private profiles.
- **20 reports per reporter per 24 hours** (Q-2), server-enforced, in the shape of Sprint 4F's
  bot cap (`notes_router.py:159-176`): the cap runs before anything is written, so a 429 leaves
  nothing behind. spec R-09 ("no rate limiter, the unique index is the cap") is superseded.

Sprint 4I-B adds **`also_block`** to the request body (pm-decisions Q-3) and the one visibility
condition a `user` target has — a blocked pair is 404'd like a missing row. The report and the
block are written in ONE transaction, which is why `also_block` could not exist before blocking
did and why it is a field here rather than a second request the client has to sequence.
"""
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field as PydField
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, select

from .. import blocks, localday, models        # Sprint 4I-B: the MODULE, never the function
from ..deps import get_db, get_current_user, deny_bot_actor
from ..notifications.dispatcher import fire_event
from .likes_comments import _assert_can_view_note
from .groups_router import _is_member

router = APIRouter(prefix="/reports", tags=["reports"])

# The two closed sets. `reason` is a closed set of strings and free text goes in `detail`,
# which is never rendered anywhere except the admin queue (R-01).
REASONS = ("spam", "harassment", "hate", "sexual", "violence", "self_harm", "other")
# The four things a reader can see that belong to someone else. There is no fifth:
# `group_activity` rows carry no reader-authored text (`groups_router.py:1140-1151` serialises
# an event type and a payload the server wrote), and a book is not a reader's content.
TARGET_TYPES = ("note", "comment", "group_post", "user")

# pm-decisions Q-2. Without a cap, "report anyone" is a spam channel into the admin queue.
REPORT_MAX_PER_DAY = 20
REPORT_CAP_WINDOW = timedelta(hours=24)

SNAPSHOT_MAX = 2000          # must match models.Report.target_snapshot's max_length

# ONE body for every refusal that depends on what the viewer may see. A missing target, a
# private note, a private-profile author the viewer does not follow and a members-only circle
# post all answer with this, byte for byte (R-02, S-07).
_NOT_FOUND_DETAIL = "Not found"

# The only thing a reporter is ever told. It says nothing about whether this is the first
# report, how many others exist, or what will happen (R-02).
_RECEIVED = {"status": "received"}


class ReportCreate(BaseModel):
    target_type: str
    target_id: int
    reason: str
    detail: Optional[str] = PydField(default=None, max_length=1000)
    # Sprint 4I-B (pm-decisions E-3 and Q-3). The report dialog carries "Also block this person",
    # CHECKED BY DEFAULT, because what matters in the moment is relief by the reader's own hand.
    # It is a field on THIS request and not a second call: two requests leave "what if the block
    # half fails" to be specified, and the answer here is that there is no second half — the
    # report and the block are written in one transaction, so either both happen or neither does.
    # The default is False on the WIRE: an old client that does not know the field must not start
    # blocking people. The checked-by-default decision belongs to the clients (C-13).
    also_block: bool = False


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)


def _can_view_note(db: Session, note: models.Note, viewer: models.User) -> bool:
    """The feeds' own visibility rule, reused rather than re-implemented (R-02).

    `likes_comments._assert_can_view_note` is the one copy of the rule. It is called here for
    its decision only, not for its exception: it answers a private note with 404 and a
    private-profile author with **403** (`likes_comments.py:28`), and a 403 here would tell the
    reporter which of the two it was. Every refusal this route makes is the same 404.
    """
    try:
        _assert_can_view_note(db, note, viewer)
    except HTTPException:
        return False
    return True


def _snapshot(*parts) -> Optional[str]:
    """A capped copy of the reported words (R-07), so a resolved report whose content has been
    deleted is still a record of something rather than an id and a reason."""
    text = "\n".join(p for p in parts if p)
    if not text:
        return None
    return text[:SNAPSHOT_MAX]


def _resolve_target(db: Session, viewer: models.User, target_type: str, target_id: int):
    """-> (target_user_id, snapshot). Raises 404 for anything the viewer may not see and 400
    for the viewer's own content or the viewer themselves."""
    if target_type == "note":
        note = db.get(models.Note, target_id)
        if not note:
            raise _not_found()
        if note.user_id == viewer.id:
            raise HTTPException(status_code=400, detail="You cannot report your own content")
        if not _can_view_note(db, note, viewer):
            raise _not_found()
        return note.user_id, _snapshot(note.text, note.quote)

    if target_type == "comment":
        comment = db.get(models.Comment, target_id)
        if not comment:
            raise _not_found()
        if comment.user_id == viewer.id:
            raise HTTPException(status_code=400, detail="You cannot report your own content")
        note = db.get(models.Note, comment.note_id)
        if not note or not _can_view_note(db, note, viewer):
            raise _not_found()
        return comment.user_id, _snapshot(comment.text)

    if target_type == "group_post":
        post = db.get(models.GroupPost, target_id)
        if not post:
            raise _not_found()
        if post.user_id == viewer.id:
            raise HTTPException(status_code=400, detail="You cannot report your own content")
        group = db.get(models.ReadingGroup, post.group_id)
        # The same gate `get_group_posts` applies (`groups_router.py:827`), answered as a 404
        # rather than its 403 so this route distinguishes nothing.
        if not group or (group.is_private and not _is_member(db, post.group_id, viewer.id)):
            raise _not_found()
        return post.user_id, _snapshot(post.text, post.quote)

    # target_type == "user" (pm-decisions Q-2): any existing user, bots included. The rule is
    # "the row exists", NOT `_assert_can_view_note`'s private-profile branch — harassment
    # arrives through comments and follows, both of which a private profile can still send, so
    # gating on visibility would delete the affordance for exactly the readers who need it.
    subject = db.get(models.User, target_id)
    if not subject:
        raise _not_found()
    if subject.id == viewer.id:
        raise HTTPException(status_code=400, detail="You cannot report yourself")
    # Sprint 4I-B: the one visibility condition a `user` target DOES have. Q-2's rule is "a user
    # target is reportable iff `GET /profile/{id}` would not 404 for that viewer — i.e. the row
    # exists AND the pair is not blocked"; `is_private_profile` stays irrelevant. The same 404 as
    # a missing row, so the route still distinguishes nothing.
    if blocks.is_blocked_pair(db, viewer, subject.id):
        raise _not_found()
    return subject.id, None


def _existing_report(db: Session, reporter_id: int, target_type: str, target_id: int):
    """The sequential duplicate check.

    A module-level function, not an inline query, so a test can neutralise it for one call and
    leave `uq_report_once` as the only thing standing — which is exactly the state a concurrent
    loser is in when its INSERT reaches the database (S-03). The 4G precedent for one
    monkeypatchable seam is `fetch_jwks`.
    """
    return db.exec(
        select(models.Report)
        .where(models.Report.reporter_id == reporter_id)
        .where(models.Report.target_type == target_type)
        .where(models.Report.target_id == target_id)
    ).first()


def _write_block(db: Session, blocker_id: int, blocked_id: int) -> None:
    """Stage the `also_block` block and the teardown it implies. DOES NOT COMMIT.

    The existing-row check is not an optimisation. Without it, reporting somebody who is already
    blocked raises on `uq_block_pair`, and the handler's `except IntegrityError` — which exists
    for the duplicate REPORT — would roll back the report as well and answer 200 "received" with
    nothing written. Reporting a reader you blocked earlier is an ordinary thing to do, so it
    must not cost the report.
    """
    if db.exec(
        select(models.Block)
        .where(models.Block.blocker_id == blocker_id)
        .where(models.Block.blocked_id == blocked_id)
    ).first():
        return
    db.add(models.Block(blocker_id=blocker_id, blocked_id=blocked_id))
    blocks.sever_relationships(db, blocker_id, blocked_id)


def _admin_ids(db: Session) -> list[int]:
    return list(db.exec(select(models.User.id).where(models.User.is_admin == True)).all())  # noqa: E712


def _notify_admins(db: Session, recipient_ids: list[int], reason: str) -> None:
    """Fire `content_reported` at every admin, and never let it break the report.

    Registered as a BackgroundTask by the handler, so it runs after the response (R-03). The
    try/except is the second half of the same requirement: a report must not fail because the
    admin's push token is stale. Nothing reported is logged — the reason string only
    (architecture §Security review 3).
    """
    try:
        fire_event(
            db=db,
            event_type="content_reported",
            actor_id=0,              # the system, not the reporter: no reader is named (R-03)
            actor_name="TrackMyRead",
            recipient_ids=recipient_ids,
            extra={"reason": reason},
        )
    except Exception as e:                     # noqa: BLE001 — delivery is best-effort by design
        print(f"[reports] notification failed: {type(e).__name__}")


# ONE path, deliberately: `POST /reports`. A second decorator for the trailing slash would
# register a second route, and `tests/test_bots.py::GUARDED_ROUTES` is an exact inventory of
# the routes carrying `deny_bot_actor` — two paths would make the count lie.
@router.post("", status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportCreate,
    background_tasks: BackgroundTasks,
    response: Response,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _: None = Depends(deny_bot_actor),     # R-02: a bot does not report. Before any row.
):
    if payload.target_type not in TARGET_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="target_type must be one of " + ", ".join(TARGET_TYPES))
    if payload.reason not in REASONS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="reason must be one of " + ", ".join(REASONS))

    # The cap runs before the target is even looked up, so a flood costs one COUNT and writes
    # nothing (pm-decisions Q-2, the `notes_router.py:159` shape).
    window_start = localday.utcnow() - REPORT_CAP_WINDOW
    recent = db.exec(
        select(func.count(models.Report.id))
        .where(models.Report.reporter_id == current_user.id)
        .where(models.Report.created_at >= window_start)
    ).one()
    if (recent or 0) >= REPORT_MAX_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"You may file at most {REPORT_MAX_PER_DAY} reports in 24 hours",
        )

    target_user_id, snapshot = _resolve_target(db, current_user, payload.target_type,
                                               payload.target_id)

    # Sprint 4I-B (pm-decisions Q-3). Whether the block is written is decided here, before the
    # duplicate check below, so that re-reporting somebody with the box ticked still blocks them.
    # `target_user_id` is None only for a `user` target with no author, which cannot happen —
    # `_resolve_target` returns the subject's own id there.
    block_target = target_user_id if (payload.also_block and target_user_id
                                      and target_user_id != current_user.id) else None

    if _existing_report(db, current_user.id, payload.target_type, payload.target_id):
        # A reader tapping Report twice has not done anything wrong (R-01): the first report's
        # state, no second row, and a 200 that says no more than the 201 does.
        if block_target is not None:
            _write_block(db, current_user.id, block_target)
            db.commit()
        response.status_code = status.HTTP_200_OK
        return dict(_RECEIVED)

    report = models.Report(
        reporter_id=current_user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        target_user_id=target_user_id,
        reason=payload.reason,
        detail=payload.detail,
        target_snapshot=snapshot,
        status="open",
    )
    db.add(report)
    if block_target is not None:
        # ONE transaction with the report (pm-decisions Q-3): the block row and the teardown of
        # every live relationship between the two go in before the single commit below, so there
        # is no partial state in which the reader is told "report received" while the block
        # silently did not happen.
        _write_block(db, current_user.id, block_target)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent duplicate lost the race on uq_report_once — the same contract the
        # sequential check above returns, never a 500 and never a second row
        # (`follow_router.py:39-44`'s shape).
        db.rollback()
        response.status_code = status.HTTP_200_OK
        return dict(_RECEIVED)

    admins = _admin_ids(db)
    if admins:
        background_tasks.add_task(_notify_admins, db, admins, payload.reason)

    return dict(_RECEIVED)
