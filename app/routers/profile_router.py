from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from pydantic import BaseModel
import os
import uuid

import cloudinary
import cloudinary.uploader

from ..models import User, UserBook, Follow, Book
from ..deps import get_db, get_current_user

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
)

router = APIRouter(prefix="/profile", tags=["profile"])


# -----------------------------
# ✅ Schema for updating profile
# -----------------------------
class ProfileUpdate(BaseModel):
    name: str | None = None
    bio: str | None = None
    yearly_goal: int | None = None
    profile_picture: str | None = None
    is_private_profile: bool | None = None


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

    # Calculate total pages read — batch-fetch books instead of N individual lookups
    _book_ids = [ub.book_id for ub in total_books if ub.book_id]
    _books_map = {b.id: b for b in db.exec(select(Book).where(Book.id.in_(_book_ids))).all()} if _book_ids else {}
    total_pages_read = 0
    for ub in total_books:
        if ub.status == "finished":
            book = _books_map.get(ub.book_id)
            total_pages_read += (book.total_pages if book and book.total_pages else 0) or (ub.current_page or 0)
        elif ub.status == "reading":
            total_pages_read += ub.current_page or 0

    # NOTE: For cross-platform compatibility, we return both snake_case and camelCase keys in the stats object.
    # - The web frontend expects snake_case (e.g., total_books, to_read, total_pages_read)
    # - The mobile app expects camelCase (e.g., totalBooks, toRead, totalPagesRead)
    # This avoids the need to rebuild the mobile app after backend changes.
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

    # Log the outgoing profile response for debugging mobile issues
    import logging
    _log_data = {
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'bio': user.bio,
        'created_at': user.created_at,
        'followers_count': len(followers),
        'following_count': len(following),
        'stats': stats,
        'is_admin': user.is_admin,
    }
    logging.warning(f"/profile/me response: {repr(_log_data)}")

    return {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "email": user.email,
        "bio": user.bio,
        "profile_picture": getattr(user, "profile_picture", None),
        "yearly_goal": getattr(user, "yearly_goal", None),
        "created_at": user.created_at,
        "followers_count": len(followers),
        "following_count": len(following),
        "stats": stats,
        "is_admin": user.is_admin,
        "is_private_profile": getattr(user, "is_private_profile", False),
    }


# ---------------------------------
# ✅ PUT /profile/me - Update profile
# ---------------------------------
@router.put("/me")
def update_profile(payload: ProfileUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    user = db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.name is not None:
        user.name = payload.name
    if payload.bio is not None:
        user.bio = payload.bio
    if payload.yearly_goal is not None:
        user.yearly_goal = payload.yearly_goal
    if payload.profile_picture is not None:
        user.profile_picture = payload.profile_picture
    if payload.is_private_profile is not None:
        user.is_private_profile = payload.is_private_profile

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
        "username": user.username,
        "email": user.email,
        "bio": user.bio,
        "profile_picture": getattr(user, "profile_picture", None),
        "yearly_goal": getattr(user, "yearly_goal", None),
        "created_at": user.created_at,
        "followers_count": len(followers),
        "following_count": len(following),
        "stats": stats,
        "is_admin": user.is_admin,
        "is_private_profile": getattr(user, "is_private_profile", False),
    }


# ---------------------------------
# ✅ POST /profile/me/picture - Upload avatar
# ---------------------------------
@router.post("/me/picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    if not all([os.getenv("CLOUDINARY_CLOUD_NAME"), os.getenv("CLOUDINARY_API_KEY"), os.getenv("CLOUDINARY_API_SECRET")]):
        raise HTTPException(status_code=500, detail="Cloudinary not configured")

    try:
        contents = await file.read()
        result = cloudinary.uploader.upload(
            contents,
            folder="book_tracker/avatars",
            public_id=f"user_{current_user.id}_{uuid.uuid4().hex[:8]}",
            resource_type="image",
            transformation=[{"width": 256, "height": 256, "crop": "fill", "gravity": "face"}],
        )
        url = result.get("secure_url")
        if not url:
            raise Exception("No URL returned from Cloudinary")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    user = db.get(User, current_user.id)
    user.profile_picture = url
    db.add(user)
    db.commit()
    return {"profile_picture": url}


# ---------------------------------
# ✅ GET /profile/{user_id} - Public profile
# ---------------------------------
@router.get("/{user_id}")
def get_public_profile(user_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Self-view always allowed
    is_self = current_user.id == user.id

    # Check if the requesting user follows this profile
    is_following = bool(db.exec(
        select(Follow).where(Follow.follower_id == current_user.id, Follow.followed_id == user.id)
    ).first())

    is_private = getattr(user, "is_private_profile", False)

    followers = db.exec(select(Follow).where(Follow.followed_id == user.id)).all()
    following = db.exec(select(Follow).where(Follow.follower_id == user.id)).all()

    base = {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "bio": user.bio,
        "profile_picture": user.profile_picture,
        "created_at": user.created_at,
        "followers_count": len(followers),
        "following_count": len(following),
        "is_private": is_private,
        "is_following": is_following,
    }

    # Private profile — only followers (and self) see stats + content
    if is_private and not is_self and not is_following:
        base["stats"] = None
        base["locked"] = True
        return base

    total_books = db.exec(select(UserBook).where(UserBook.user_id == user.id)).all()
    finished = [b for b in total_books if b.status == "finished"]
    reading = [b for b in total_books if b.status == "reading"]

    base["stats"] = {
        "total_books": len(total_books),
        "finished": len(finished),
        "reading": len(reading),
        "to_read": len([b for b in total_books if b.status == "to-read"]),
    }
    base["locked"] = False
    return base
