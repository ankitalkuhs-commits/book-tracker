# app/crud.py
from typing import Optional, List
from sqlmodel import Session, select
from . import models
from datetime import datetime

# -------- User helpers --------
def get_user_by_id(db: Session, user_id: int) -> Optional[models.User]:
    return db.exec(select(models.User).where(models.User.id == user_id)).first()


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.exec(select(models.User).where(models.User.email == email)).first()


def create_user(db: Session, *, name: Optional[str], email: str, password_hash: str) -> models.User:
    user = models.User(name=name, email=email, password_hash=password_hash)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# -------- Book helpers --------
def list_books(db: Session) -> List[models.Book]:
    return db.exec(select(models.Book)).all()


def create_book(db: Session, *, title: str, author: Optional[str] = None,
                description: Optional[str] = None, isbn: Optional[str] = None,
                cover_url: Optional[str] = None, total_pages: Optional[int] = None,
                publisher: Optional[str] = None, published_date: Optional[str] = None,
                format: Optional[str] = None, pages_source: Optional[str] = None) -> models.Book:
    book = models.Book(
        title=title,
        author=author,
        description=description,
        isbn=isbn,
        cover_url=cover_url,
        total_pages=total_pages,
        publisher=publisher,
        published_date=published_date,
        format=format,
        pages_source=pages_source
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


def get_book(db: Session, book_id: int) -> Optional[models.Book]:
    return db.exec(select(models.Book).where(models.Book.id == book_id)).first()


# -------- UserBook helpers (user library) --------
def create_userbook(db: Session, user_id: int, book_id: int, status: str, current_page: int = 0):
    """
    Create a new UserBook entry with both created_at and updated_at timestamps.
    Prevents SQLite NOT NULL constraint failure.
    """
    now = datetime.utcnow()
    ub = models.UserBook(
        user_id=user_id,
        book_id=book_id,
        status=status,
        current_page=current_page,
        created_at=now,
        updated_at=now  # ✅ ensure updated_at is never NULL
    )
    db.add(ub)
    db.commit()
    db.refresh(ub)
    return ub
    


def get_userbooks_for_user(db: Session, user_id: int) -> List[models.UserBook]:
    return db.exec(select(models.UserBook).where(models.UserBook.user_id == user_id)).all()


def get_userbook(db: Session, userbook_id: int) -> Optional[models.UserBook]:
    return db.exec(select(models.UserBook).where(models.UserBook.id == userbook_id)).first()


def update_userbook(db: Session, userbook: models.UserBook, **fields) -> models.UserBook:
    for k, v in fields.items():
        if hasattr(userbook, k):
            setattr(userbook, k, v)
    db.add(userbook)
    db.commit()
    db.refresh(userbook)
    return userbook


# -------- Notes helpers (posts) --------
def create_note(db: Session, *, user_id: int, text: Optional[str] = None,
                emotion: Optional[str] = None, userbook_id: Optional[int] = None,
                is_public: bool = True, page_number: Optional[int] = None,
                chapter: Optional[str] = None, image_url: Optional[str] = None,
                quote: Optional[str] = None) -> models.Note:
    note = models.Note(
        user_id=user_id,
        text=text,
        emotion=emotion,
        userbook_id=userbook_id,
        is_public=is_public,
        page_number=page_number,
        chapter=chapter,
        image_url=image_url,
        quote=quote
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def get_notes_feed(db: Session, limit: int = 50) -> List[models.Note]:
    # Return public notes most recent first
    q = select(models.Note).where(models.Note.is_public == True).order_by(models.Note.created_at.desc()).limit(limit)
    return db.exec(q).all()


def get_notes_for_user(db: Session, user_id: int) -> List[models.Note]:
    q = select(models.Note).where(models.Note.user_id == user_id).order_by(models.Note.created_at.desc())
    return db.exec(q).all()
