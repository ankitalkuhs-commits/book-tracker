# app/routers/users_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select, func, or_, and_
from sqlmodel import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
from ..database import get_session
from ..deps import get_current_user
from .. import models

router = APIRouter(prefix="/users", tags=["users"])


class UserSearchResult(BaseModel):
    """User search result with follow status."""
    id: int
    name: Optional[str]
    username: Optional[str]
    email: str
    bio: Optional[str]
    is_following: bool
    follows_you: bool
    is_mutual: bool


class FollowingUser(BaseModel):
    """User in following list."""
    id: int
    name: Optional[str]
    username: Optional[str]
    email: str
    bio: Optional[str]
    is_following: bool = True  # Always true in following list
    is_mutual: bool
    followed_at: str


@router.get("/search", response_model=List[UserSearchResult])
def search_users(
    q: str,
    db: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user)
):
    """
    Search for users by username (live search).
    Returns top 10 results with follow status.
    """
    if not q or len(q.strip()) < 1:
        return []
    
    search_term = f"%{q.lower()}%"
    
    # Search by username (case-insensitive)
    users = db.exec(
        select(models.User)
        .where(
            and_(
                models.User.id != current_user.id,  # Exclude current user
                or_(
                    func.lower(models.User.username).like(search_term),
                    func.lower(models.User.name).like(search_term)
                )
            )
        )
        .limit(10)
    ).all()
    
    # Get follow relationships for these users
    user_ids = [u.id for u in users]
    
    # Users current user is following
    following = db.exec(
        select(models.Follow.followed_id)
        .where(
            and_(
                models.Follow.follower_id == current_user.id,
                models.Follow.followed_id.in_(user_ids)
            )
        )
    ).all()
    following_set = set(following)
    
    # Users following current user
    followers = db.exec(
        select(models.Follow.follower_id)
        .where(
            and_(
                models.Follow.followed_id == current_user.id,
                models.Follow.follower_id.in_(user_ids)
            )
        )
    ).all()
    followers_set = set(followers)
    
    results = []
    for user in users:
        is_following = user.id in following_set
        follows_you = user.id in followers_set
        results.append(UserSearchResult(
            id=user.id,
            name=user.name,
            username=user.username,
            email=user.email,
            bio=user.bio,
            is_following=is_following,
            follows_you=follows_you,
            is_mutual=is_following and follows_you
        ))
    
    return results


@router.get("/following", response_model=List[FollowingUser])
def get_following_list(
    db: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get list of users current user is following with mutual follow status.
    """
    # Get all users current user follows
    following_records = db.exec(
        select(models.Follow)
        .where(models.Follow.follower_id == current_user.id)
    ).all()
    
    if not following_records:
        return []
    
    followed_ids = [f.followed_id for f in following_records]
    
    # Get user details
    users = db.exec(
        select(models.User)
        .where(models.User.id.in_(followed_ids))
    ).all()
    
    # Check which ones follow back (mutual)
    mutual_followers = db.exec(
        select(models.Follow.follower_id)
        .where(
            and_(
                models.Follow.followed_id == current_user.id,
                models.Follow.follower_id.in_(followed_ids)
            )
        )
    ).all()
    mutual_set = set(mutual_followers)
    
    # Create a map of user_id to followed_at timestamp
    follow_time_map = {f.followed_id: f.created_at for f in following_records}
    
    results = []
    for user in users:
        results.append(FollowingUser(
            id=user.id,
            name=user.name,
            username=user.username,
            email=user.email,
            bio=user.bio,
            is_following=True,  # Always true in following list
            is_mutual=user.id in mutual_set,
            followed_at=follow_time_map[user.id].isoformat() + 'Z'
        ))
    
    # Sort: mutual follows first, then by followed_at descending
    results.sort(key=lambda x: (not x.is_mutual, x.followed_at), reverse=True)
    
    return results


class UserStats(BaseModel):
    """User reading statistics."""
    total_books: int
    finished: int
    reading: int
    to_read: int
    last_month: int
    this_year: int
    total_pages: int


@router.get("/{user_id}/stats", response_model=UserStats)
def get_user_stats(
    user_id: int,
    db: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get reading statistics for a specific user.
    Returns total books, status counts, recent activity, and pages read.
    """
    # Verify user exists
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all user's books
    all_books = db.exec(
        select(models.UserBook)
        .where(models.UserBook.user_id == user_id)
    ).all()
    
    # Count by status
    total_books = len(all_books)
    finished = len([b for b in all_books if b.status == "finished"])
    reading = len([b for b in all_books if b.status == "reading"])
    to_read = len([b for b in all_books if b.status == "to-read"])
    
    # Calculate date ranges
    now = datetime.utcnow()
    one_month_ago = now - timedelta(days=30)
    year_start = datetime(now.year, 1, 1)
    
    # Count books finished last month
    last_month = len([
        b for b in all_books 
        if b.status == "finished" and b.updated_at and b.updated_at >= one_month_ago
    ])
    
    # Count books finished this year
    this_year = len([
        b for b in all_books 
        if b.status == "finished" and b.updated_at and b.updated_at >= year_start
    ])
    
    # Calculate total pages read (finished books only)
    total_pages = 0
    for userbook in all_books:
        if userbook.status == "finished" and userbook.book:
            total_pages += userbook.book.total_pages or 0
    
    return UserStats(
        total_books=total_books,
        finished=finished,
        reading=reading,
        to_read=to_read,
        last_month=last_month,
        this_year=this_year,
        total_pages=total_pages
    )
