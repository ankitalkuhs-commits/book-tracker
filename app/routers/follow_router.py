# app/routers/follow_router.py
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel import Session
from ..database import get_session
from ..deps import get_current_user, deny_bot_actor
# Sprint 4I-B (K-4I-10): the MODULE, never the bound function.
from .. import blocks, models
from ..notifications.dispatcher import fire_event

router = APIRouter(prefix="/follow", tags=["follow"])

@router.post("/{followed_id}")
def follow_user(followed_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_session), user = Depends(get_current_user), _: None = Depends(deny_bot_actor)):
    # Sprint 4I-B (R-21, R-24): before the self-follow check below, before the target is loaded,
    # before any row is added and before `add_task(fire_event, ...)` is registered. The ordering
    # IS the requirement — a refusal that lands after the notification has already reached the
    # person the reader is hiding from (B-05, MUT-4I-33).
    # 403 and not 404 here, and the SAME body whichever of the two blocked, so the blocked reader
    # cannot tell a block from a platform rule. The 403 is also what the surrounding code already
    # answers for a refused follow (`deny_bot_actor`, `deps.py:191-211`), so a reader who has
    # blocked somebody and then taps Follow on them sees the same refusal a bot would.
    if blocks.is_blocked_pair(db, user, followed_id):
        raise HTTPException(status_code=403, detail="Cannot follow this user")
    if followed_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    target = db.exec(select(models.User).where(models.User.id == followed_id)).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    existing = db.exec(
        select(models.Follow).where(
            models.Follow.follower_id == user.id,
            models.Follow.followed_id == followed_id
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already following")

    # Check if they follow you (for mutual status)
    follows_you = db.exec(
        select(models.Follow).where(
            models.Follow.follower_id == followed_id,
            models.Follow.followed_id == user.id
        )
    ).first()

    follow = models.Follow(follower_id=user.id, followed_id=followed_id)
    db.add(follow)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent request beat us to it (F-53) — same contract as the sequential check.
        db.rollback()
        raise HTTPException(status_code=400, detail="Already following")

    # Send push notification to the followed user — after the response (F-59)
    follower_name = user.name or user.username or "Someone"
    background_tasks.add_task(
        fire_event,
        db=db,
        event_type="new_follower",
        actor_id=user.id,
        actor_name=follower_name,
        recipient_ids=[followed_id],
    )

    return {
        "detail": "followed",
        "is_following": True,
        "is_mutual": follows_you is not None
    }

@router.delete("/{followed_id}")
def unfollow_user(followed_id: int, db: Session = Depends(get_session), user = Depends(get_current_user)):
    follow = db.exec(
        select(models.Follow).where(
            models.Follow.follower_id == user.id,
            models.Follow.followed_id == followed_id
        )
    ).first()
    if not follow:
        raise HTTPException(status_code=404, detail="Not following")
    db.delete(follow); db.commit()
    return {
        "detail": "unfollowed",
        "is_following": False
    }

@router.get("/following")
def list_following(db: Session = Depends(get_session), user = Depends(get_current_user)):
    rows = db.exec(select(models.Follow).where(models.Follow.follower_id == user.id)).all()
    return [{"followed_id": r.followed_id} for r in rows]

@router.get("/followers")
def list_followers(db: Session = Depends(get_session), user = Depends(get_current_user)):
    rows = db.exec(select(models.Follow).where(models.Follow.followed_id == user.id)).all()
    return [{"follower_id": r.follower_id} for r in rows]
