# app/models.py
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field

# -----------------------
# User
# -----------------------
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = Field(index=True, unique=True)
    password_hash: str
    bio: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# -----------------------
# Book
# -----------------------
class Book(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    author: Optional[str] = None
    isbn: Optional[str] = None
    cover_url: Optional[str] = None
    tags: Optional[str] = None
    description: Optional[str] = None
    total_pages: Optional[int] = None
    publisher: Optional[str] = None
    published_date: Optional[str] = None


# -----------------------
# UserBook (a user's copy/entry for a book)
# -----------------------
class UserBook(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    book_id: int = Field(foreign_key="book.id")
    status: str = Field(default="to-read")  # to-read | reading | finished
    current_page: Optional[int] = None
    rating: Optional[int] = None
    private_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# -----------------------
# Note
# -----------------------
class Note(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    userbook_id: int = Field(foreign_key="userbook.id")
    user_id: int = Field(foreign_key="user.id")
    text: str
    is_public: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# -----------------------
# Follow
# -----------------------
class Follow(SQLModel, table=True):
    follower_id: int = Field(foreign_key="user.id", primary_key=True)
    followed_id: int = Field(foreign_key="user.id", primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
