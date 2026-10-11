# app/routers/likes_comments.py
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from ..deps import get_db, get_current_user, deny_bot_actor
# Sprint 4I-B (K-4I-10): the MODULE, never the bound function. One seam for every call site.
from .. import blocks, models
from ..utils.push import send_push_notification_to_user
from ..notifications.dispatcher import fire_event

router = APIRouter(prefix="/notes", tags=["likes-comments"])


def _assert_can_view_note(db: Session, note: models.Note, user: models.User,
                          hidden=None) -> None:
    """Same rule as the feeds: owner always; otherwise the note must be public and a
    private-profile author must be followed. 404 hides a private note's existence.

    Sprint 4I-B (R-22 rows 4 and 5) adds the blocked-pair branch, FIRST, so one edit covers
    like (`:46`), comment (`:135`) and comment-read (`:177`) — and `POST /reports`, which calls
    this through `reports_router._can_view_note`.

    `hidden` is the caller's already-computed block set. `get_comments` needs the set anyway to
    filter the comment authors, so passing it keeps that endpoint at ONE helper call and BQ-13
    at +1 rather than +2. When it is None the function fetches its own, which is what the three
    POST/DELETE call sites do; none of them is in a query budget.
    """
    if note.user_id == user.id:
        return
    if hidden is None:
        hidden = blocks.hidden_user_ids(db, user)
    if note.user_id in hidden:
        # 404 and not 403, and not an empty 200: a block must be indistinguishable from a
        # deleted note, which is the same reason the line below already uses 404. A 403 here
        # would tell the blocked reader exactly what had happened.
        raise HTTPException(status_code=404, detail="Note not found")
    if not note.is_public:
        raise HTTPException(status_code=404, detail="Note not found")
    author = db.get(models.User, note.user_id)
    if author and getattr(author, "is_private_profile", False):
        follows = db.exec(select(models.Follow).where(
            models.Follow.follower_id == user.id,
            models.Follow.followed_id == note.user_id,
        )).first()
        if not follows:
            raise HTTPException(status_code=403, detail="This profile is private")


@router.post("/{note_id}/like", status_code=status.HTTP_201_CREATED)
def like_note(
    note_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _: None = Depends(deny_bot_actor),          # R-05: before any row, before any notification
):
    """Like a note"""
    # Check if note exists
    note = db.get(models.Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Visibility: strangers cannot like a private note or a private profile's note (F-02)
    _assert_can_view_note(db, note, current_user)

    # Check if already liked
    existing_like = db.exec(
        select(models.Like)
        .where(models.Like.note_id == note_id)
        .where(models.Like.user_id == current_user.id)
    ).first()

    if existing_like:
        return {"message": "Already liked", "liked": True}

    # Create like
    like = models.Like(note_id=note_id, user_id=current_user.id)
    db.add(like)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent request beat us to it (F-53) — same contract as the sequential check.
        db.rollback()
        return {"message": "Already liked", "liked": True}

    # Send push notification to note owner (skip if liking own post) — after the response (F-59)
    if note.user_id != current_user.id:
        liker_name = current_user.name or current_user.username or "Someone"
        background_tasks.add_task(
            fire_event,
            db=db,
            event_type="post_liked",
            actor_id=current_user.id,
            actor_name=liker_name,
            recipient_ids=[note.user_id],
            extra={"note_id": note_id},
        )

    return {"message": "Liked", "liked": True}


@router.delete("/{note_id}/like", status_code=status.HTTP_200_OK)
def unlike_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _: None = Depends(deny_bot_actor),          # R-05: before any row, before any notification
):
    """Unlike a note.

    Sprint 4I-B: DELIBERATELY NOT BLOCK-GUARDED (pm-decisions, "R-24 — the unlike refusal:
    dropped"). This handler never loads the note, and unliking removes a row the reader
    themselves created; letting someone withdraw a like they left before a block is correct, not
    a leak. spec R-24, R-22 row 5, architecture §"Call sites" and tests.md's B-15u/MUT-4I-49 all
    still list unlike among the refusals — pm-decisions is binding and overrides them, and the
    build notes record it rather than leaving it to look like an omission.

    The PRE-EXISTING hole this leaves untouched: a stranger unliking a private note they cannot
    see gets 200 `{"message": "Not liked"}` rather than a 404, because there is no visibility
    check here at all while like, comment and comment-read all have one. Logged as a triage
    finding by the test plan (K-4I-04); not this sprint's to fix.
    """
    # Find and delete like
    like = db.exec(
        select(models.Like)
        .where(models.Like.note_id == note_id)
        .where(models.Like.user_id == current_user.id)
    ).first()

    if not like:
        return {"message": "Not liked", "liked": False}

    db.delete(like)
    db.commit()

    return {"message": "Unliked", "liked": False}


class CommentCreate(BaseModel):
    text: str

    def validate_text(self):
        if not self.text or not self.text.strip():
            raise ValueError("Comment text cannot be empty")


@router.post("/{note_id}/comments", status_code=status.HTTP_201_CREATED)
def create_comment(
    note_id: int,
    payload: CommentCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _: None = Depends(deny_bot_actor),          # R-05: before any row, before any notification
):
    """Add a comment to a note"""
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=400, detail="Comment text cannot be empty")

    # Check if note exists
    note = db.get(models.Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Visibility: strangers cannot comment on a private note or a private profile's note (F-02)
    _assert_can_view_note(db, note, current_user)

    # Create comment
    comment = models.Comment(note_id=note_id, user_id=current_user.id, text=payload.text)
    db.add(comment)
    db.commit()
    db.refresh(comment)

    # Notify post owner via dispatcher (writes to NotificationLog + sends push) — after the response (F-59)
    if note.user_id != current_user.id:
        commenter_name = current_user.name or current_user.username or "Someone"
        background_tasks.add_task(
            fire_event,
            db=db,
            event_type="post_commented",
            actor_id=current_user.id,
            actor_name=commenter_name,
            recipient_ids=[note.user_id],
            extra={"preview": payload.text[:80], "note_id": note_id},
        )

    return {
        "id": comment.id,
        "text": comment.text,
        "created_at": comment.created_at.isoformat() + 'Z',
        "user": {"id": current_user.id, "name": current_user.name,
                 "is_bot": bool(current_user.is_bot)}   # R-02
    }


@router.get("/{note_id}/comments", status_code=status.HTTP_200_OK)
def get_comments(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get all comments for a note"""
    note = db.get(models.Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Sprint 4I-B (R-22 row 4): one helper call, used twice — for the note's own author below
    # and for the comment authors further down. Two calls would put BQ-13 at +2.
    hidden = blocks.hidden_user_ids(db, current_user)

    # Visibility: strangers cannot read comments on a private note or a private profile's note (F-02)
    _assert_can_view_note(db, note, current_user, hidden=hidden)

    comments = db.exec(
        select(models.Comment)
        .where(models.Comment.note_id == note_id)
        # Sprint 4I-B (R-22 row 4, K-4I-06). The filter is on the COMMENT, not on the
        # `users_map` below. Filtering the map would drop the blocked reader's NAME and leave
        # their WORDS in the response with `"user": null`, through the pre-existing null-author
        # branch at the bottom of this function — the single most likely way this path ships
        # broken. B-14 asserts the text is gone and B-14a asserts no element is ever served
        # with a null author.
        .where(models.Comment.user_id.notin_(hidden))
        .order_by(models.Comment.created_at.asc())
    ).all()

    if not comments:
        return []
    user_ids = list({c.user_id for c in comments})
    users_map = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(user_ids))).all()}
    result = []
    for c in comments:
        user = users_map.get(c.user_id)
        result.append({
            "id": c.id,
            "text": c.text,
            "created_at": c.created_at.isoformat() + 'Z',
            "user": {
                "id": user.id,
                "name": user.name,
                "username": getattr(user, "username", None),
                "profile_picture": getattr(user, "profile_picture", None),
                "is_bot": bool(user.is_bot),   # R-02
            } if user else None
        })

    return result
