# app/routers/notes_router.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional, List
from pydantic import BaseModel
from sqlmodel import Session
from ..deps import get_db, get_current_user
from .. import crud, models

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteCreateSchema(BaseModel):
    """
    Request body schema for creating a note.
    Fields are optional to keep it flexible for quick posts.
    """
    text: Optional[str] = None
    emotion: Optional[str] = None
    userbook_id: Optional[int] = None
    is_public: Optional[bool] = True


class NoteOutSchema(BaseModel):
    id: int
    text: Optional[str]
    emotion: Optional[str]
    is_public: bool
    created_at: Optional[str]
    user: Optional[dict] = None
    book: Optional[dict] = None

    class Config:
        orm_mode = True


@router.post("/", response_model=NoteOutSchema, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreateSchema, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    text = payload.text
    emotion = payload.emotion
    userbook_id = payload.userbook_id
    is_public = payload.is_public if payload.is_public is not None else True

    # if userbook_id provided, ensure it belongs to current_user
    if userbook_id:
        ub = crud.get_userbook(db, userbook_id=userbook_id)
        if not ub or ub.user_id != current_user.id:
            raise HTTPException(status_code=400, detail="Invalid userbook_id")

    note = crud.create_note(db, user_id=current_user.id, text=text, emotion=emotion, userbook_id=userbook_id, is_public=is_public)

    # Build response shape (include basic user and book info for convenience)
    book = note.userbook.book if note.userbook else None
    user = note.user
    out = {
        "id": note.id,
        "text": note.text,
        "emotion": note.emotion,
        "is_public": note.is_public,
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "user": {"id": user.id, "name": user.name} if user else None,
        "book": {"id": book.id, "title": book.title, "author": book.author} if book else None
    }
    return out


@router.get("/feed", status_code=status.HTTP_200_OK, response_model=List[NoteOutSchema])
def get_feed(limit: int = 50, db: Session = Depends(get_db)):
    notes = crud.get_notes_feed(db, limit=limit)
    result = []
    for n in notes:
        book = n.userbook.book if n.userbook else None
        user = n.user
        result.append({
            "id": n.id,
            "text": n.text,
            "emotion": n.emotion,
            "is_public": n.is_public,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "user": {"id": user.id, "name": user.name} if user else None,
            "book": {"id": book.id, "title": book.title, "author": book.author} if book else None
        })
    return result


@router.get("/me", status_code=status.HTTP_200_OK, response_model=List[NoteOutSchema])
def get_my_notes(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    notes = crud.get_notes_for_user(db, user_id=current_user.id)
    out = []
    for n in notes:
        book = n.userbook.book if n.userbook else None
        user = n.user
        out.append({
            "id": n.id,
            "text": n.text,
            "emotion": n.emotion,
            "is_public": n.is_public,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "user": {"id": user.id, "name": user.name} if user else None,
            "book": {"id": book.id, "title": book.title, "author": book.author} if book else None
        })
    return out
