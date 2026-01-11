# app/models.py
"""
Models for BookPulse (SQLModel).
This version matches your existing DB which uses `password_hash`.
"""

from typing import Optional, List
from datetime import datetime
from sqlmodel import Field, Relationship, SQLModel
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
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
    is_admin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active: Optional[datetime] = None

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
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)

    # Relationships
    userbooks: List["UserBook"] = Relationship(back_populates="book")


class UserBook(SQLModel, table=True):
    """Join table connecting users to books with reading status and progress."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    book_id: int = Field(foreign_key="book.id", index=True)
    status: str = Field(default="to-read")  # 'to-read' | 'reading' | 'finished'
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
    page_number: Optional[int] = None  # New: track which page the note is about
    chapter: Optional[str] = None  # New: track which chapter the note is about
    image_url: Optional[str] = None  # New: store uploaded image URL
    quote: Optional[str] = None  # New: store book quotes
    is_public: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

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


from typing import Optional
from sqlmodel import SQLModel

class UserBookProgress(SQLModel):
    current_page : Optional[int] = 0