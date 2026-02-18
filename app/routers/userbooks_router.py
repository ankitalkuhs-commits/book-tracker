# app/routers/userbooks_router.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from sqlmodel import Session, select
from ..deps import get_db, get_current_user
from .. import crud, models
from typing import List
from ..models import UserBook, Book   # adjust import path if different
from datetime import datetime
from pydantic import BaseModel
from app.models import UserBookProgress
from app.database import get_db
from sqlalchemy.orm import Session


router = APIRouter(prefix="/userbooks", tags=["userbooks"])


class UpdatePagePayload(BaseModel):
    current_page: int


@router.put("/{userbook_id}/progress")
def update_progress(userbook_id: int, data: UserBookProgress, db: Session = Depends(get_db)):
    userbook = db.get(UserBook, userbook_id)
    if not userbook:
        raise HTTPException(status_code=404, detail="UserBook not found")

    # Track previous page for activity logging
    old_page = userbook.current_page or 0
    new_page = data.current_page or 0

    # ✅ Update the current page
    userbook.current_page = new_page

    # ✅ Fetch total pages if the book exists
    book = db.get(Book, userbook.book_id) if userbook.book_id else None
    total_pages = book.total_pages if book and book.total_pages else None

    # ✅ Auto-update status based on current progress
    if userbook.current_page <= 0:
        userbook.status = "to-read"

    elif total_pages:
        if userbook.current_page >= total_pages:
            userbook.current_page = total_pages
            userbook.status = "finished"
        else:
            userbook.status = "reading"

    else:
        # If we don't have total_pages but user started reading
        userbook.status = "reading"

    # ✅ Always update timestamp
    userbook.updated_at = datetime.utcnow()

    # ✅ Log reading activity if pages increased
    if new_page > old_page:
        from ..models import ReadingActivity
        pages_read = new_page - old_page
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Check if activity for today already exists
        existing_activity = db.exec(
            select(models.ReadingActivity)
            .where(models.ReadingActivity.user_id == userbook.user_id)
            .where(models.ReadingActivity.userbook_id == userbook_id)
            .where(models.ReadingActivity.date >= today)
        ).first()
        
        if existing_activity:
            # Update existing activity
            existing_activity.pages_read += pages_read
            existing_activity.current_page = new_page
            db.add(existing_activity)
        else:
            # Create new activity entry
            activity = models.ReadingActivity(
                user_id=userbook.user_id,
                userbook_id=userbook_id,
                date=today,
                pages_read=pages_read,
                current_page=new_page
            )
            db.add(activity)

    db.add(userbook)
    db.commit()
    db.refresh(userbook)

    return userbook

@router.post("/{userbook_id}/finish", status_code=200)
def mark_userbook_finished(userbook_id: int, db: Session = Depends(get_db)):
    """
    Mark a user's book as finished.
    If the Book has total_pages set, set userbook.current_page to total_pages.
    Always set status='finished' and update updated_at.
    """
    ub = db.get(UserBook, userbook_id)
    if not ub:
        raise HTTPException(status_code=404, detail="UserBook not found")

    # Try to fetch the book to read total_pages (may be None)
    book = db.get(Book, ub.book_id) if ub.book_id else None
    total_pages = getattr(book, "total_pages", None)

    # If we know total pages, set current_page to that number
    if total_pages:
        ub.current_page = total_pages
    # otherwise leave current_page as-is (or optionally set to 0 or keep current)

    ub.status = "finished"
    ub.updated_at = datetime.utcnow()

    db.add(ub)
    db.commit()
    db.refresh(ub)

    return {"ok": True, "userbook": ub}


@router.post("/", status_code=status.HTTP_201_CREATED)
def add_userbook(payload: dict, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Add a book to the current user's library.
    Expected payload: { 
        "book_id": int, 
        "status": "reading"|"to-read"|"finished", 
        "current_page": int (optional),
        "format": "hardcover"|"paperback"|"ebook"|"kindle"|"pdf"|"audiobook" (optional, default: "hardcover"),
        "ownership_status": "owned"|"borrowed"|"loaned" (optional, default: "owned"),
        "borrowed_from": str (optional),
        "loaned_to": str (optional)
    }
    """
    book_id = payload.get("book_id")
    if not book_id:
        raise HTTPException(status_code=400, detail="book_id is required")

    # verify book exists
    book = crud.get_book(db, book_id=book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # Check if user already has this book in their library
    existing_userbook = db.exec(
        select(UserBook).where(
            UserBook.user_id == current_user.id,
            UserBook.book_id == book_id
        )
    ).first()
    
    if existing_userbook:
        raise HTTPException(
            status_code=400, 
            detail=f"You already have '{book.title}' in your library"
        )

    # create userbook with new fields
    status_val = payload.get("status", "to-read")
    current_page = payload.get("current_page")
    book_format = payload.get("format", "hardcover")
    ownership_status = payload.get("ownership_status", "owned")
    borrowed_from = payload.get("borrowed_from")
    loaned_to = payload.get("loaned_to")
    
    ub = crud.create_userbook(
        db, 
        user_id=current_user.id, 
        book_id=book_id, 
        status=status_val, 
        current_page=current_page,
        format=book_format,
        ownership_status=ownership_status,
        borrowed_from=borrowed_from,
        loaned_to=loaned_to
    )
    return {"status": "ok", "userbook": ub}


@router.get("/", response_model=List[dict])
def list_userbooks(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # fetch userbooks for current user
    userbooks = db.exec(select(UserBook).where(UserBook.user_id == current_user.id)).all()

    results = []
    for ub in userbooks:
        book = db.get(Book, ub.book_id)
        results.append({
            "id": ub.id,
            "user_id": ub.user_id,
            "book_id": ub.book_id,
            "status": ub.status,
            "current_page": ub.current_page,
            "rating": ub.rating,
            "private_notes": ub.private_notes,
            "format": ub.format,
            "ownership_status": ub.ownership_status,
            "borrowed_from": ub.borrowed_from,
            "loaned_to": ub.loaned_to,
            "created_at": ub.created_at,
            "updated_at": ub.updated_at,
            # embed book details (or null)
            "book": {
                "id": book.id,
                "title": book.title,
                "author": book.author,
                "description": book.description,
                "total_pages": book.total_pages,
                "cover_url": book.cover_url,
                "pages_source": getattr(book, "pages_source", None)
            } if book else None
        })
    return results


@router.patch("/{userbook_id}", status_code=status.HTTP_200_OK)
def patch_userbook(userbook_id: int, payload: dict, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    ub = crud.get_userbook(db, userbook_id=userbook_id)
    if not ub or ub.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="UserBook not found")

    allowed = {"status", "current_page", "rating", "private_notes", "format", "ownership_status", "borrowed_from", "loaned_to"}
    update_fields = {k: v for k, v in payload.items() if k in allowed}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    ub = crud.update_userbook(db, ub, **update_fields)
    return {"status": "ok", "userbook": ub}


@router.delete("/{userbook_id}", status_code=status.HTTP_200_OK)
def delete_userbook(userbook_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Delete a book from the user's library.
    This will also delete all associated notes for this userbook.
    """
    ub = crud.get_userbook(db, userbook_id=userbook_id)
    if not ub or ub.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="UserBook not found")
    
    # Delete the userbook (cascading deletes should handle notes if configured)
    db.delete(ub)
    db.commit()
    
    return {"status": "ok", "message": "Book removed from library successfully"}


@router.get("/user/{user_id}", response_model=List[dict])
def get_user_books(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get books for a specific user (for viewing their profile)."""
    # Verify user exists
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's books
    userbooks = db.exec(select(UserBook).where(UserBook.user_id == user_id)).all()
    
    results = []
    for ub in userbooks:
        book = db.get(Book, ub.book_id)
        results.append({
            "id": ub.id,
            "user_id": ub.user_id,
            "book_id": ub.book_id,
            "status": ub.status,
            "current_page": ub.current_page,
            "rating": ub.rating,
            "created_at": ub.created_at,
            "updated_at": ub.updated_at,
            # embed book details (or null)
            "book": {
                "id": book.id,
                "title": book.title,
                "author": book.author,
                "description": book.description,
                "total_pages": book.total_pages,
                "cover_url": book.cover_url,
                "page_count": getattr(book, "page_count", None),
            } if book else None
        })
    return results


@router.get("/friends/currently-reading", response_model=List[dict])
def get_friends_currently_reading(
    limit: int = 10,
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """
    Get books that friends are currently reading.
    Returns userbooks with status='reading' from users that the current user follows.
    """
    from sqlmodel import and_
    
    # Get all users current user follows
    following = db.exec(
        select(models.Follow.followed_id)
        .where(models.Follow.follower_id == current_user.id)
    ).all()
    
    if not following:
        return []
    
    following_ids = list(following)
    
    # Get mutual follows (users who follow you back)
    mutual_followers = db.exec(
        select(models.Follow.follower_id)
        .where(
            and_(
                models.Follow.followed_id == current_user.id,
                models.Follow.follower_id.in_(following_ids)
            )
        )
    ).all()
    mutual_ids = list(mutual_followers)
    
    # Get currently reading books from followed users
    userbooks = db.exec(
        select(UserBook)
        .where(
            and_(
                UserBook.user_id.in_(following_ids),
                UserBook.status == "reading"
            )
        )
        .order_by(UserBook.updated_at.desc())
        .limit(limit)
    ).all()
    
    results = []
    for ub in userbooks:
        user = db.get(models.User, ub.user_id)
        book = db.get(Book, ub.book_id)
        
        if user and book:
            results.append({
                "id": ub.id,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "name": user.name,
                    "is_mutual": user.id in mutual_ids
                },
                "book": {
                    "id": book.id,
                    "title": book.title,
                    "author": book.author,
                    "cover_url": book.cover_url,
                    "total_pages": book.total_pages
                },
                "current_page": ub.current_page,
                "updated_at": ub.updated_at
            })
    
    return results
