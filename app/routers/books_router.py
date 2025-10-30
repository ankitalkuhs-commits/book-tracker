# app/routers/books_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select, Session
from app.models import Book
from app.database import get_db
from datetime import datetime

router = APIRouter(prefix="/books", tags=["Books"])


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
