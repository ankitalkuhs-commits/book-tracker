# app/models.py
"""
Models for BookPulse (SQLModel).
This version matches your existing DB which uses `password_hash`.
"""

from typing import Optional, List
from datetime import datetime
from sqlmodel import Field, Relationship, SQLModel
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from .database import Base

class Journal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    entry_id: int = Field(foreign_key="userbook.id")   # Fixed: userbook not userbooks
    user_id: int = Field(foreign_key="user.id")  # Fixed: user not users
    timestamp: Optional[datetime] = Field(default=None)
    feeling: Optional[str] = None
    text: str



class User(SQLModel, table=True):
    """Application user."""
    id: Optional[int] = Field(default=None, primary_key=True)
    # DB uses column name 'name' and 'email' already; keep them
    name: Optional[str] = None
    username: Optional[str] = Field(default=None, index=True, unique=True)
    email: str = Field(index=True, nullable=False)
    # Use the same column name as existing DB:
    password_hash: str = Field(nullable=False)
    bio: Optional[str] = None
    profile_picture: Optional[str] = None
    yearly_goal: Optional[int] = None          # target books per year
    is_admin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active: Optional[datetime] = None
    deletion_requested_at: Optional[datetime] = None
    deletion_reason: Optional[str] = None

    # Relationships
    userbooks: List["UserBook"] = Relationship(back_populates="user")
    notes: List["Note"] = Relationship(back_populates="user")


class Book(SQLModel, table=True):
    """Global book record."""
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(nullable=False)
    author: Optional[str] = None
    isbn: Optional[str] = None
    cover_url: Optional[str] = None
    tags: Optional[str] = None
    description: Optional[str] = None
    total_pages: Optional[int] = None
    publisher: Optional[str] = None
    published_date: Optional[str] = None
    format: Optional[str] = None
    pages_source: Optional[str] = None
    google_books_id: Optional[str] = None
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)

    # Relationships
    userbooks: List["UserBook"] = Relationship(back_populates="book")


class UserBook(SQLModel, table=True):
    """Join table connecting users to books with reading status and progress."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    book_id: int = Field(foreign_key="book.id", index=True)
    status: str = Field(default="to-read", index=True)  # 'to-read' | 'reading' | 'finished'
    current_page: Optional[int] = None
    rating: Optional[int] = None
    private_notes: Optional[str] = None
    
    # Book format and ownership fields
    format: str = Field(default="hardcover")  # 'hardcover' | 'paperback' | 'ebook' | 'kindle' | 'pdf' | 'audiobook'
    ownership_status: str = Field(default="owned")  # 'owned' | 'borrowed' | 'loaned'
    borrowed_from: Optional[str] = None  # Person's name if borrowed
    loaned_to: Optional[str] = None  # Person's name if loaned
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    # Relationships
    user: Optional[User] = Relationship(back_populates="userbooks")
    book: Optional[Book] = Relationship(back_populates="userbooks")
    notes: List["Note"] = Relationship(back_populates="userbook")


class Note(SQLModel, table=True):
    """A short emotional note / post tied to a user and optionally a UserBook."""
    id: Optional[int] = Field(default=None, primary_key=True)
    userbook_id: Optional[int] = Field(default=None, foreign_key="userbook.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    text: Optional[str] = None
    emotion: Optional[str] = None
    page_number: Optional[int] = None
    chapter: Optional[str] = None
    image_url: Optional[str] = None
    quote: Optional[str] = None
    is_public: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: Optional[datetime] = None

    # Relationships
    user: Optional[User] = Relationship(back_populates="notes")
    userbook: Optional[UserBook] = Relationship(back_populates="notes")


class Follow(SQLModel, table=True):
    """Follow relationship: follower -> followed (both users)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    follower_id: int = Field(foreign_key="user.id", index=True)
    followed_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Like(SQLModel, table=True):
    """Like on a note/post."""
    id: Optional[int] = Field(default=None, primary_key=True)
    note_id: int = Field(foreign_key="note.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Comment(SQLModel, table=True):
    """Comment on a note/post."""
    id: Optional[int] = Field(default=None, primary_key=True)
    note_id: int = Field(foreign_key="note.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    text: str = Field(nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PushToken(SQLModel, table=True):
    """Push token for a user device — supports both Expo (mobile) and Web Push (PWA)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    token: str = Field(index=True)
    token_type: str = Field(default="expo")   # 'expo' (mobile) | 'web' (PWA browser)
    device_info: Optional[str] = None         # e.g. 'Android 14', 'Chrome/Windows'
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class NotificationLog(SQLModel, table=True):
    """Record of every push notification sent — used for in-app history + unread count."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)    # recipient
    actor_id: Optional[int] = Field(default=None)              # who triggered it (None = system)
    event_type: str = Field(index=True)                        # e.g. 'book_completed'
    title: str
    body: str
    data: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    is_read: bool = Field(default=False)
    sent_at: datetime = Field(default_factory=datetime.utcnow)


# class ReadingActivity(SQLModel, table=True):
#    """User reading activity log."""
#    id: Optional[int] = Field(default=None, primary_key=True)
#    user_id: int = Field(foreign_key="user.id")
#    book_id: int = Field(foreign_key="book.id")
#    activity_type: str  # e.g., 'start', 'finish', 'note', 'update'
#    timestamp: datetime = Field(default_factory=datetime.utcnow)
#    details: Optional[str] = None


class ReadingActivity(SQLModel, table=True):
    """User reading activity log."""
    __tablename__ = "reading_activity"

    id: Optional[int] = Field(default=None, primary_key=True)

    user_id: int = Field(foreign_key="user.id", index=True)
    userbook_id: int = Field(foreign_key="userbook.id", index=True)

    # date used for stats queries
    date: datetime = Field(default_factory=datetime.utcnow, index=True)

    pages_read: Optional[int] = Field(default=0)
    current_page: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


from typing import Optional
from sqlmodel import SQLModel

class UserBookProgress(SQLModel):
    current_page : Optional[int] = 0


# ─── Groups ───────────────────────────────────────────────────────────────────

import secrets

class ReadingGroup(SQLModel, table=True):
    """A reading group / literary circle."""
    __tablename__ = "reading_group"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(nullable=False)
    description: Optional[str] = None
    is_private: bool = Field(default=False)
    invite_code: str = Field(default_factory=lambda: secrets.token_urlsafe(8))
    cover_preset: str = Field(default="teal")   # maps to a CSS gradient preset
    created_by: int = Field(foreign_key="user.id")
    # Collective reading goal
    goal_pages: Optional[int] = None
    goal_period: Optional[str] = None           # 'monthly' | 'yearly'
    goal_start_date: Optional[datetime] = None
    # Current group book
    current_book_id: Optional[int] = Field(default=None, foreign_key="book.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GroupMember(SQLModel, table=True):
    """Membership record — also used for pending invites."""
    __tablename__ = "group_member"

    id: Optional[int] = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="reading_group.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    role: str = Field(default="member")         # 'curator' | 'member'
    status: str = Field(default="active")       # 'active' | 'pending'
    invited_by: Optional[int] = Field(default=None, foreign_key="user.id")
    joined_at: datetime = Field(default_factory=datetime.utcnow)


class GroupPost(SQLModel, table=True):
    """A post scoped to a reading group."""
    __tablename__ = "group_post"

    id: Optional[int] = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="reading_group.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    text: str
    quote: Optional[str] = None
    userbook_id: Optional[int] = Field(default=None, foreign_key="userbook.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
