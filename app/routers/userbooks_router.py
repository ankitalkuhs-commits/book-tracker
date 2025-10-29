# app/routers/userbooks_router.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from sqlmodel import Session, select
from ..deps import get_db, get_current_user
from .. import crud, models

router = APIRouter(prefix="/userbooks", tags=["userbooks"])


@router.post("/", status_code=status.HTTP_201_CREATED)
def add_userbook(payload: dict, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Add a book to the current user's library.
    Expected payload: { "book_id": int, "status": "reading"|"to-read"|"finished", "current_page": int (optional) }
    """
    book_id = payload.get("book_id")
    if not book_id:
        raise HTTPException(status_code=400, detail="book_id is required")

    # verify book exists
    book = crud.get_book(db, book_id=book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # create userbook
    status_val = payload.get("status", "to-read")
    current_page = payload.get("current_page")
    ub = crud.create_userbook(db, user_id=current_user.id, book_id=book_id, status=status_val, current_page=current_page)
    return {"status": "ok", "userbook": ub}


@router.get("/", status_code=status.HTTP_200_OK)
def list_userbooks(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    ubs = crud.get_userbooks_for_user(db, user_id=current_user.id)
    return ubs


@router.patch("/{userbook_id}", status_code=status.HTTP_200_OK)
def patch_userbook(userbook_id: int, payload: dict, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    ub = crud.get_userbook(db, userbook_id=userbook_id)
    if not ub or ub.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="UserBook not found")

    allowed = {"status", "current_page", "rating", "private_notes"}
    update_fields = {k: v for k, v in payload.items() if k in allowed}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    ub = crud.update_userbook(db, ub, **update_fields)
    return {"status": "ok", "userbook": ub}
