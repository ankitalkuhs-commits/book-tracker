# app/routers/books_router.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from fastapi.responses import StreamingResponse
from ..database import get_session
from ..deps import get_current_user
from .. import models
import csv
from io import StringIO
import io
from ..models import Book

router = APIRouter(prefix="/books", tags=["books"])


# -----------------------
# 1️⃣  Create Book Endpoint
# -----------------------
@router.post("")
def create_book(book: Book, db: Session = Depends(get_session)):
    # Check if book with same title already exists
    existing = db.exec(select(Book).where(Book.title == book.title)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Book already exists")
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


# -----------------------
# 2️⃣  Get Books Endpoint
# -----------------------
@router.get("/", response_model=list[Book])
def list_books(db: Session = Depends(get_session)):
    return db.exec(select(Book)).all()

# -----------------------
# Delete Book Endpoint
# -----------------------
@router.delete("/{book_id}")
def delete_book(book_id: int, db: Session = Depends(get_session)):
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    db.delete(book)
    db.commit()
    return {"message": "Book deleted"}

# -----------------------
# Update Book Endpoint
# -----------------------
@router.patch("/{book_id}", response_model=Book)
def update_book(book_id: int, book: Book, db: Session = Depends(get_session)):
    existing = db.get(Book, book_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Book not found")
    
    # Update fields if provided
    if book.title is not None:
        existing.title = book.title
    if book.author is not None:
        existing.author = book.author
    if book.isbn is not None:
        existing.isbn = book.isbn
    if book.description is not None:
        existing.description = book.description
    if book.cover_url is not None:
        existing.cover_url = book.cover_url
    if book.tags is not None:
        existing.tags = book.tags
        
    db.add(existing)
    db.commit()
    db.refresh(existing)
    return existing

# -----------------------
# 3️⃣  CSV Import Endpoint
# -----------------------
@router.post("/import")
async def import_csv(file: UploadFile = File(...), db: Session = Depends(get_session), user = Depends(get_current_user)):
    """
    Upload a CSV file with headers: title, author, isbn, status
    Example row:
    The Pragmatic Programmer,Andrew Hunt,9780201616224,reading
    """
    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(StringIO(text))
    imported = []
    for row in reader:
        title = row.get("title")
        author = row.get("author")
        isbn = row.get("isbn")
        status = (row.get("status") or "to-read").lower()

        if not title:
            continue

        # Check if book already exists
        existing = db.exec(select(models.Book).where(models.Book.title == title, models.Book.author == author)).first()
        if not existing:
            b = models.Book(title=title, author=author, isbn=isbn)
            db.add(b)
            db.commit()
            db.refresh(b)
        else:
            b = existing

        # Add to user's library
        existing_userbook = db.exec(
            select(models.UserBook).where(
                models.UserBook.user_id == user.id,
                models.UserBook.book_id == b.id
            )
        ).first()

        if not existing_userbook:
            ub = models.UserBook(user_id=user.id, book_id=b.id, status=status)
            db.add(ub)
            db.commit()
            db.refresh(ub)

        imported.append({"title": b.title, "book_id": b.id})

    return {"imported": imported}


# -----------------------
# 4️⃣  CSV Export Endpoint
# -----------------------
@router.get("/export")
def export_library(db: Session = Depends(get_session), user = Depends(get_current_user)):
    ubs = db.exec(select(models.UserBook).where(models.UserBook.user_id == user.id)).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["title", "author", "isbn", "status", "current_page"])
    for ub in ubs:
        book = db.get(models.Book, ub.book_id)
        writer.writerow([
            book.title or "",
            book.author or "",
            book.isbn or "",
            ub.status or "",
            ub.current_page or ""
        ])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=library.csv"}
    )
