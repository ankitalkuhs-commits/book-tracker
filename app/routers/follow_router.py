# app/routers/follow_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel import Session
from ..database import get_session
from ..deps import get_current_user
from .. import models

router = APIRouter(prefix="/follow", tags=["follow"])

@router.post("/{followed_id}")
def follow_user(followed_id: int, db: Session = Depends(get_session), user = Depends(get_current_user)):
    if followed_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
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
    db.add(follow); db.commit()
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
