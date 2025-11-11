# app/routers/books_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select, Session
from app.models import Book, UserBook, User
from app.database import get_db
from app.deps import get_current_user
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/books", tags=["Books"])


class AddBookFromGooglePayload(BaseModel):
    """Payload for adding a book from Google Books API"""
    title: str
    author: Optional[str] = None
    isbn: Optional[str] = None
    cover_url: Optional[str] = None
    description: Optional[str] = None
    total_pages: Optional[int] = None
    publisher: Optional[str] = None
    published_date: Optional[str] = None
    status: str = "to-read"  # Default status when adding a book (reading|to-read|finished)
    current_page: int = 0
    format: str = "hardcover"  # Book format (hardcover|paperback|ebook|kindle|pdf|audiobook)
    ownership_status: str = "owned"  # Ownership status (owned|borrowed|loaned)
    borrowed_from: Optional[str] = None  # Person's name if borrowed
    loaned_to: Optional[str] = None  # Person's name if loaned


# --- POST: Add book from Google Books to user's library ---
@router.post("/add-to-library")
def add_book_to_library(
    payload: AddBookFromGooglePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Add a book from Google Books API to the user's library.
    - Checks if book exists in Book table by ISBN (avoids duplicates)
    - Creates UserBook entry linking user to the book
    - Returns error if book already in user's library
    """
    book = None
    
    # Step 1: Check if book already exists in Book table by ISBN
    if payload.isbn:
        book = db.exec(select(Book).where(Book.isbn == payload.isbn)).first()
    
    # Step 2: If book doesn't exist, create it
    if not book:
        book = Book(
            title=payload.title,
            author=payload.author or "Unknown Author",
            isbn=payload.isbn,
            cover_url=payload.cover_url,
            description=payload.description,
            total_pages=payload.total_pages,
            publisher=payload.publisher,
            published_date=payload.published_date,
            created_at=datetime.utcnow(),
        )
        db.add(book)
        db.commit()
        db.refresh(book)
    
    # Step 3: Check if user already has this book in their library
    existing_userbook = db.exec(
        select(UserBook).where(
            UserBook.user_id == current_user.id,
            UserBook.book_id == book.id
        )
    ).first()
    
    if existing_userbook:
        # Map status to tab name for user-friendly message
        status_map = {
            "to-read": "Want to Read",
            "reading": "Currently Reading",
            "finished": "Finished"
        }
        tab_name = status_map.get(existing_userbook.status, existing_userbook.status)
        
        raise HTTPException(
            status_code=400,
            detail=f"This book is already in your library in the '{tab_name}' tab."
        )
    
    # Step 4: Create UserBook entry
    userbook = UserBook(
        user_id=current_user.id,
        book_id=book.id,
        status=payload.status,
        current_page=payload.current_page,
        format=payload.format,
        ownership_status=payload.ownership_status,
        borrowed_from=payload.borrowed_from,
        loaned_to=payload.loaned_to,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(userbook)
    db.commit()
    db.refresh(userbook)
    
    return {
        "message": "Book added to your library successfully",
        "book": {
            "id": book.id,
            "title": book.title,
            "author": book.author,
            "cover_url": book.cover_url,
            "total_pages": book.total_pages,
        },
        "userbook": {
            "id": userbook.id,
            "status": userbook.status,
            "current_page": userbook.current_page,
        }
    }


# --- GET all books ---
@router.get("/")
def list_books(db: Session = Depends(get_db)):
    books = db.exec(select(Book)).all()
    return books


# --- POST: add a new book (supports both manual and Google API data) ---
@router.post("/")
def add_book(book_data: dict, db: Session = Depends(get_db)):
    """
    Add a new book to the library.
    If ISBN exists, returns existing book instead of creating duplicate.
    """
    # Safely extract fields from incoming JSON
    title = book_data.get("title", "").strip()
    author = book_data.get("author", "").strip() or "Unknown"
    isbn = book_data.get("isbn", "").strip() or None
    cover_url = book_data.get("cover_url", "").strip() or None
    description = book_data.get("description", "").strip() or None
    total_pages = book_data.get("total_pages", None)
    publisher = book_data.get("publisher", None)
    published_date = book_data.get("published_date", None)

    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    # Prevent duplicates based on ISBN if available
    if isbn:
        existing = db.exec(select(Book).where(Book.isbn == isbn)).first()
        if existing:
            return {"message": "Book already exists", "book": existing}

    # Create new Book object
    new_book = Book(
        title=title,
        author=author,
        isbn=isbn,
        cover_url=cover_url,
        description=description,
        total_pages=total_pages,
        publisher=publisher,
        published_date=published_date,
        created_at=datetime.utcnow(),
    )

    db.add(new_book)
    db.commit()
    db.refresh(new_book)

    return {"message": "Book added successfully", "book": new_book}


# --- GET a single book by ID ---
@router.get("/{book_id}")
def get_book(book_id: int, db: Session = Depends(get_db)):
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


# --- DELETE a book by ID ---
@router.delete("/{book_id}")
def delete_book(book_id: int, db: Session = Depends(get_db)):
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    db.delete(book)
    db.commit()
    return {"message": "Book deleted successfully"}
