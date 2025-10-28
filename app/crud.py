# app/crud.py
from typing import Optional, List
from sqlmodel import Session, select
from . import models

# -----------------------
# User helpers
# -----------------------
def get_user_by_email(session: Session, email: str) -> Optional[models.User]:
    """Return a User by email, or None if not found."""
    return session.exec(select(models.User).where(models.User.email == email)).first()

def create_user(session: Session, name: str, email: str, password_hash: str) -> models.User:
    """Create a new user and return it."""
    user = models.User(name=name, email=email, password_hash=password_hash)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user

# -----------------------
# Book helpers
# -----------------------
def create_book(session: Session, title: str, author: Optional[str] = None, isbn: Optional[str] = None,
                cover_url: Optional[str] = None, tags: Optional[str] = None) -> models.Book:
    """Create a book record (if you want to add metadata)."""
    book = models.Book(title=title, author=author, isbn=isbn, cover_url=cover_url, tags=tags)
    session.add(book)
    session.commit()
    session.refresh(book)
    return book

def get_book(session: Session, book_id: int) -> Optional[models.Book]:
    """Return a Book by id, or None if not found."""
    return session.get(models.Book, book_id)

# -----------------------
# UserBook (user's library) helpers
# -----------------------
def add_userbook(session: Session, user_id: int, book_id: int, status: str = "to-read") -> models.UserBook:
    """Add a book to a user's library (UserBook) and return the record."""
    ub = models.UserBook(user_id=user_id, book_id=book_id, status=status)
    session.add(ub)
    session.commit()
    session.refresh(ub)
    return ub

def get_userbook(session: Session, userbook_id: int) -> Optional[models.UserBook]:
    """Return a UserBook by id."""
    return session.get(models.UserBook, userbook_id)

# -----------------------
# Notes & Feed helpers
# -----------------------
def create_note(session: Session, userbook_id: int, user_id: int, text: str, is_public: bool = False) -> models.Note:
    """Create a Note (public or private) for a userbook."""
    note = models.Note(userbook_id=userbook_id, user_id=user_id, text=text, is_public=is_public)
    session.add(note)
    session.commit()
    session.refresh(note)
    return note

def get_feed_notes(session: Session, user_id: int, limit: int = 20) -> List[models.Note]:
    """
    Return public notes from users that 'user_id' follows.
    If the user follows nobody, return an empty list.
    """
    followed_ids = session.exec(select(models.Follow.followed_id).where(models.Follow.follower_id == user_id)).all()
    if not followed_ids:
        return []
    notes = session.exec(
        select(models.Note)
        .where(models.Note.user_id.in_(followed_ids), models.Note.is_public == True)
        .order_by(models.Note.created_at.desc())
        .limit(limit)
    ).all()
    return notes
