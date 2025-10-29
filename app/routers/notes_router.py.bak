# app/routers/notes_router.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from ..database import get_session
from ..deps import get_current_user
from .. import models, crud

router = APIRouter(prefix="/notes", tags=["notes"])

class NoteIn(BaseModel):
    userbook_id: int
    text: str
    is_public: bool = False

class NoteUpdate(BaseModel):
    text: str
    is_public: bool

@router.post("", response_model=models.Note)
def create_note(payload: NoteIn, db: Session = Depends(get_session), user = Depends(get_current_user)):
    # verify userbook belongs to user
    ub = db.get(models.UserBook, payload.userbook_id)
    if not ub or ub.user_id != user.id:
        raise HTTPException(status_code=404, detail="UserBook not found or not yours")
    # create note
    note = crud.create_note(db, userbook_id=payload.userbook_id, user_id=user.id, text=payload.text, is_public=payload.is_public)
    return note

@router.get("/feed")
def feed(db: Session = Depends(get_session), user = Depends(get_current_user)):
    # get notes from followed users + own notes
    followed_notes = crud.get_feed_notes(db, user.id)
    own_notes = db.exec(
        select(models.Note)
        .join(models.UserBook)
        .where(models.UserBook.user_id == user.id)
    ).all()
    all_notes = {note.id: note for note in followed_notes + own_notes}  # merge unique
    return list(all_notes.values())

@router.get("/book/{userbook_id}")
def get_book_notes(userbook_id: int, db: Session = Depends(get_session), user = Depends(get_current_user)):
    """Get all notes for a specific book in user's library."""
    # verify userbook belongs to user or notes are public
    ub = db.get(models.UserBook, userbook_id)
    if not ub:
        raise HTTPException(status_code=404, detail="UserBook not found")
    
    # if it's user's book, get all notes, otherwise only public notes
    query = select(models.Note).where(models.Note.userbook_id == userbook_id)
    if ub.user_id != user.id:
        query = query.where(models.Note.is_public == True)
    
    notes = db.exec(query.order_by(models.Note.created_at.desc())).all()
    return notes

@router.put("/{note_id}", response_model=models.Note)
def update_note(note_id: int, payload: NoteUpdate, db: Session = Depends(get_session), user = Depends(get_current_user)):
    """Update an existing note."""
    note = db.get(models.Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your note")
    
    note.text = payload.text
    note.is_public = payload.is_public
    db.add(note)
    db.commit()
    db.refresh(note)
    return note

@router.delete("/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_session), user = Depends(get_current_user)):
    """Delete a note."""
    note = db.get(models.Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your note")
    
    db.delete(note)
    db.commit()
    return {"message": "Note deleted successfully"}
