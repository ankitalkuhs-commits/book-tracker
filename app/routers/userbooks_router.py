# app/routers/userbooks_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..database import get_session
from ..deps import get_current_user
from .. import models

router = APIRouter(prefix="/userbooks", tags=["userbooks"])

class UserBookInModel:
    """
    We expect JSON body like:
    { "book_id": 1, "status": "reading", "current_page": 25 }
    (We use dict access later, so no Pydantic required here for the light scaffold.)
    """

@router.post("")
def add_userbook(payload: dict, db: Session = Depends(get_session), user = Depends(get_current_user)):
    # Validate payload
    book_id = payload.get("book_id")
    if not book_id:
        raise HTTPException(status_code=400, detail="book_id is required")
    # ensure book exists
    book = db.get(models.Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    # prevent duplicate userbook
    existing = db.exec(
        select(models.UserBook).where(models.UserBook.user_id == user.id, models.UserBook.book_id == book_id)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Book already in your library")
    status = payload.get("status", "to-read")
    current_page = payload.get("current_page")
    ub = models.UserBook(user_id=user.id, book_id=book_id, status=status, current_page=current_page)
    db.add(ub); db.commit(); db.refresh(ub)
    return ub

@router.patch("/{userbook_id}")
def update_userbook(userbook_id: int, payload: dict, db: Session = Depends(get_session), user = Depends(get_current_user)):
    ub = db.get(models.UserBook, userbook_id)
    if not ub or ub.user_id != user.id:
        raise HTTPException(status_code=404, detail="UserBook not found")
    # permitted fields to update
    for k in ("status", "current_page", "rating", "private_notes"):
        if k in payload:
            setattr(ub, k, payload[k])
    from datetime import datetime
    ub.updated_at = datetime.utcnow()
    db.add(ub); db.commit(); db.refresh(ub)
    return ub

@router.get("")
def list_my_userbooks(db: Session = Depends(get_session), user = Depends(get_current_user)):
    # Get userbooks with their associated book information
    query = select(models.UserBook, models.Book).join(
        models.Book, models.UserBook.book_id == models.Book.id
    ).where(models.UserBook.user_id == user.id)
    
    results = db.exec(query).all()
    
    # Convert to dictionary with combined information
    return [
        {
            "id": ub.id,
            "status": ub.status,
            "current_page": ub.current_page,
            "rating": ub.rating,
            "created_at": ub.created_at,
            "updated_at": ub.updated_at,
            "book": {
                "id": book.id,
                "title": book.title,
                "author": book.author,
                "isbn": book.isbn,
                "description": book.description,
                "cover_url": book.cover_url,
                "tags": book.tags
            }
        }
        for ub, book in results
    ]
