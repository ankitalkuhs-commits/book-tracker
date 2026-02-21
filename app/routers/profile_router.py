from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, func
from pydantic import BaseModel
from datetime import datetime

from ..models import User, UserBook, Follow, ReadingActivity, Book
from ..deps import get_db, get_current_user

router = APIRouter(prefix="/profile", tags=["profile"])


# -----------------------------
# ✅ Schema for updating profile
# -----------------------------
class ProfileUpdate(BaseModel):
    name: str | None = None
    bio: str | None = None


# ---------------------------------
# ✅ GET /profile/me - Fetch profile
# ---------------------------------
@router.get("/me")
def get_profile(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Re-fetch user from active DB session to avoid detached errors
    user = db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Followers: who follows this user
    followers = db.exec(select(Follow).where(Follow.followed_id == user.id)).all()
    # Following: who this user follows
    following = db.exec(select(Follow).where(Follow.follower_id == user.id)).all()

    # Reading stats
    total_books = db.exec(select(UserBook).where(UserBook.user_id == user.id)).all()
    finished = [b for b in total_books if b.status == "finished"]
    reading = [b for b in total_books if b.status == "reading"]
    to_read = [b for b in total_books if b.status == "to-read"]

    # Calculate total pages read
    # First try: sum from reading_activity table (most accurate)
    activity_sum = db.exec(
        select(func.coalesce(func.sum(ReadingActivity.pages_read), 0))
        .where(ReadingActivity.user_id == user.id)
    ).first()
    
    if activity_sum and activity_sum > 0:
        total_pages_read = activity_sum
    else:
        # Fallback: calculate from book data
        total_pages_read = 0
        for ub in total_books:
            if ub.status == "finished":
                # Finished: use total_pages, fallback to current_page
                book = db.get(Book, ub.book_id)
                total_pages_read += (book.total_pages if book and book.total_pages else 0) or (ub.current_page or 0)
            elif ub.status == "reading":
                # Reading: use current progress
                total_pages_read += ub.current_page or 0

    stats = {
        "total_books": len(total_books),
        "totalBooks": len(total_books),
        "finished": len(finished),
        "reading": len(reading),
        "to_read": len(to_read),
        "toRead": len(to_read),
        "total_pages_read": total_pages_read,
        "totalPagesRead": total_pages_read,
    }

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "bio": user.bio,
        "created_at": user.created_at,
        "followers_count": len(followers),
        "following_count": len(following),
        "stats": stats,
        "is_admin": user.is_admin,
    }


# ---------------------------------
# ✅ PUT /profile/me - Update profile
# ---------------------------------
@router.put("/me")
def update_profile(payload: ProfileUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Fetch user from active DB session
    user = db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update editable fields only
    if payload.name is not None:
        user.name = payload.name
    if payload.bio is not None:
        user.bio = payload.bio

    db.add(user)
    db.commit()
    db.refresh(user)

    # Recompute followers/following and stats to return identical shape as GET /profile/me
    followers = db.exec(select(Follow).where(Follow.followed_id == user.id)).all()
    following = db.exec(select(Follow).where(Follow.follower_id == user.id)).all()

    total_books = db.exec(select(UserBook).where(UserBook.user_id == user.id)).all()
    finished = [b for b in total_books if b.status == "finished"]
    reading = [b for b in total_books if b.status == "reading"]
    to_read = [b for b in total_books if b.status == "to-read"]

    stats = {
        "total_books": len(total_books),
        "totalBooks": len(total_books),
        "finished": len(finished),
        "reading": len(reading),
        "to_read": len(to_read),
        "toRead": len(to_read),
    }

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "bio": user.bio,
        "created_at": user.created_at,
        "followers_count": len(followers),
        "following_count": len(following),
        "stats": stats,
    }
