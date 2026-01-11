"""
Admin Router - Statistics and management dashboard
Security: Only accessible by admin users (ankitalkuhs@gmail.com)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, func
from typing import List, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timedelta
from ..database import get_session
from ..deps import get_admin_user
from .. import models

router = APIRouter(prefix="/admin", tags=["admin"])


class PlatformStats(BaseModel):
    """Overall platform statistics."""
    total_users: int
    new_users_this_week: int
    new_users_this_month: int
    total_books: int
    total_userbooks: int
    books_being_read: int
    books_completed: int
    books_wishlist: int
    total_notes: int
    total_follows: int
    total_journals: int
    total_likes: int
    total_comments: int


class UserSummary(BaseModel):
    """User summary for admin view."""
    id: int
    name: str | None
    username: str | None
    email: str
    is_admin: bool
    books_count: int
    followers_count: int
    following_count: int
    created_at: datetime


class BookSummary(BaseModel):
    """Book summary for admin view."""
    id: int
    title: str
    author: str | None
    users_reading: int
    users_completed: int
    total_users: int


class FollowRelationship(BaseModel):
    """Follow relationship for network view."""
    follower_id: int
    follower_name: str
    followed_id: int
    followed_name: str
    created_at: datetime


@router.get("/stats", response_model=PlatformStats)
def get_platform_stats(
    db: Session = Depends(get_session),
    admin_user = Depends(get_admin_user)
):
    """
    Get overall platform statistics.
    Requires admin access.
    """
    # Calculate date thresholds
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    
    # Total users
    total_users = db.exec(select(func.count(models.User.id))).one()
    
    # New users this week/month
    new_users_week = db.exec(
        select(func.count(models.User.id))
        .where(models.User.created_at >= week_ago)
    ).one()
    
    new_users_month = db.exec(
        select(func.count(models.User.id))
        .where(models.User.created_at >= month_ago)
    ).one()
    
    # Total books
    total_books = db.exec(select(func.count(models.Book.id))).one()
    
    # Total userbooks
    total_userbooks = db.exec(select(func.count(models.UserBook.id))).one()
    
    # Books by status
    books_reading = db.exec(
        select(func.count(models.UserBook.id))
        .where(models.UserBook.status == "reading")
    ).one()
    
    books_completed = db.exec(
        select(func.count(models.UserBook.id))
        .where(models.UserBook.status == "completed")
    ).one()
    
    books_wishlist = db.exec(
        select(func.count(models.UserBook.id))
        .where(models.UserBook.status == "want_to_read")
    ).one()
    
    # Total notes
    total_notes = db.exec(select(func.count(models.Note.id))).one()
    
    # Total follows
    total_follows = db.exec(select(func.count(models.Follow.id))).one()
    
    # Total journals (if table exists)
    try:
        total_journals = db.exec(select(func.count(models.Journal.id))).one()
    except:
        total_journals = 0
    
    # Total likes
    try:
        total_likes = db.exec(select(func.count(models.Like.id))).one()
    except:
        total_likes = 0
    
    # Total comments
    try:
        total_comments = db.exec(select(func.count(models.Comment.id))).one()
    except:
        total_comments = 0
    
    return PlatformStats(
        total_users=total_users or 0,
        new_users_this_week=new_users_week or 0,
        new_users_this_month=new_users_month or 0,
        total_books=total_books or 0,
        total_userbooks=total_userbooks or 0,
        books_being_read=books_reading or 0,
        books_completed=books_completed or 0,
        books_wishlist=books_wishlist or 0,
        total_notes=total_notes or 0,
        total_follows=total_follows or 0,
        total_journals=total_journals,
        total_likes=total_likes,
        total_comments=total_comments
    )


@router.get("/users", response_model=List[UserSummary])
def get_all_users(
    db: Session = Depends(get_session),
    admin_user = Depends(get_admin_user),
    limit: int = 100,
    offset: int = 0
):
    """
    Get list of all users with their statistics.
    Requires admin access.
    """
    users = db.exec(
        select(models.User)
        .offset(offset)
        .limit(limit)
    ).all()
    
    result = []
    for user in users:
        # Count user's books
        books_count = db.exec(
            select(func.count(models.UserBook.id))
            .where(models.UserBook.user_id == user.id)
        ).one() or 0
        
        # Count followers
        followers_count = db.exec(
            select(func.count(models.Follow.id))
            .where(models.Follow.followed_id == user.id)
        ).one() or 0
        
        # Count following
        following_count = db.exec(
            select(func.count(models.Follow.id))
            .where(models.Follow.follower_id == user.id)
        ).one() or 0
        
        result.append(UserSummary(
            id=user.id,
            name=user.name,
            username=user.username,
            email=user.email,
            is_admin=user.is_admin,
            books_count=books_count,
            followers_count=followers_count,
            following_count=following_count,
            created_at=user.created_at
        ))
    
    return result


@router.get("/books", response_model=List[BookSummary])
def get_popular_books(
    db: Session = Depends(get_session),
    admin_user = Depends(get_admin_user),
    limit: int = 50
):
    """
    Get most popular books by user count.
    Requires admin access.
    """
    # Get books with user counts
    books = db.exec(
        select(models.Book)
        .limit(limit)
    ).all()
    
    result = []
    for book in books:
        users_reading = db.exec(
            select(func.count(models.UserBook.id))
            .where(models.UserBook.book_id == book.id)
            .where(models.UserBook.status == "reading")
        ).one() or 0
        
        users_completed = db.exec(
            select(func.count(models.UserBook.id))
            .where(models.UserBook.book_id == book.id)
            .where(models.UserBook.status == "completed")
        ).one() or 0
        
        total_users = db.exec(
            select(func.count(models.UserBook.id))
            .where(models.UserBook.book_id == book.id)
        ).one() or 0
        
        result.append(BookSummary(
            id=book.id,
            title=book.title,
            author=book.author,
            users_reading=users_reading,
            users_completed=users_completed,
            total_users=total_users
        ))
    
    # Sort by total users descending
    result.sort(key=lambda x: x.total_users, reverse=True)
    return result


@router.get("/follows", response_model=List[FollowRelationship])
def get_follow_relationships(
    db: Session = Depends(get_session),
    admin_user = Depends(get_admin_user),
    limit: int = 100
):
    """
    Get follow relationships for network analysis.
    Requires admin access.
    """
    follows = db.exec(
        select(models.Follow)
        .limit(limit)
    ).all()
    
    result = []
    for follow in follows:
        follower = db.exec(
            select(models.User).where(models.User.id == follow.follower_id)
        ).first()
        
        followed = db.exec(
            select(models.User).where(models.User.id == follow.followed_id)
        ).first()
        
        if follower and followed:
            result.append(FollowRelationship(
                follower_id=follower.id,
                follower_name=follower.name or follower.email,
                followed_id=followed.id,
                followed_name=followed.name or followed.email,
                created_at=follow.created_at
            ))
    
    return result


@router.post("/set-admin/{user_id}")
def set_admin_status(
    user_id: int,
    is_admin: bool,
    db: Session = Depends(get_session),
    admin_user = Depends(get_admin_user)
):
    """
    Set admin status for a user.
    Requires admin access.
    WARNING: Use with extreme caution!
    """
    user = db.exec(select(models.User).where(models.User.id == user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_admin = is_admin
    db.add(user)
    db.commit()
    
    return {
        "message": f"Admin status {'granted' if is_admin else 'revoked'} for user {user.email}",
        "user_id": user_id,
        "is_admin": is_admin
    }
