# app/routers/profile_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..database import get_session
from ..deps import get_current_user
from .. import models
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/profile", tags=["profile"])

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None

@router.get("/me")
def get_profile(db: Session = Depends(get_session), user = Depends(get_current_user)):
    """Get current user's profile with reading stats"""
    # Get user's reading stats
    stats = {
        "total_books": 0,
        "reading": 0,
        "finished": 0,
        "to_read": 0
    }
    
    # Count books by status
    userbooks = db.exec(
        select(models.UserBook).where(models.UserBook.user_id == user.id)
    ).all()
    
    for ub in userbooks:
        stats["total_books"] += 1
        if ub.status == "reading":
            stats["reading"] += 1
        elif ub.status == "finished":
            stats["finished"] += 1
        elif ub.status == "to-read":
            stats["to_read"] += 1

    # Count followers and following
    followers = db.exec(
        select(models.Follow).where(models.Follow.followed_id == user.id)
    ).all()
    
    following = db.exec(
        select(models.Follow).where(models.Follow.follower_id == user.id)
    ).all()

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "bio": user.bio,
        "created_at": user.created_at,
        "stats": stats,
        "followers_count": len(followers),
        "following_count": len(following)
    }

@router.put("/me")
def update_profile(payload: ProfileUpdate, db: Session = Depends(get_session), user = Depends(get_current_user)):
    """Update user's profile information"""
    if payload.name is not None:
        user.name = payload.name
    if payload.bio is not None:
        user.bio = payload.bio
        
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "bio": user.bio,
        "created_at": user.created_at
    }