# app/routers/likes_comments.py
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from ..deps import get_db, get_current_user
from .. import models

router = APIRouter(prefix="/notes", tags=["likes-comments"])


@router.post("/{note_id}/like", status_code=status.HTTP_201_CREATED)
def like_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Like a note"""
    # Check if note exists
    note = db.get(models.Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Check if already liked
    existing_like = db.exec(
        select(models.Like)
        .where(models.Like.note_id == note_id)
        .where(models.Like.user_id == current_user.id)
    ).first()
    
    if existing_like:
        return {"message": "Already liked", "liked": True}
    
    # Create like
    like = models.Like(note_id=note_id, user_id=current_user.id)
    db.add(like)
    db.commit()
    
    return {"message": "Liked", "liked": True}


@router.delete("/{note_id}/like", status_code=status.HTTP_200_OK)
def unlike_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Unlike a note"""
    # Find and delete like
    like = db.exec(
        select(models.Like)
        .where(models.Like.note_id == note_id)
        .where(models.Like.user_id == current_user.id)
    ).first()
    
    if not like:
        return {"message": "Not liked", "liked": False}
    
    db.delete(like)
    db.commit()
    
    return {"message": "Unliked", "liked": False}


class CommentCreate(BaseModel):
    text: str


@router.post("/{note_id}/comments", status_code=status.HTTP_201_CREATED)
def create_comment(
    note_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Add a comment to a note"""
    # Check if note exists
    note = db.get(models.Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Create comment
    comment = models.Comment(note_id=note_id, user_id=current_user.id, text=payload.text)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    
    return {
        "id": comment.id,
        "text": comment.text,
        "created_at": comment.created_at.isoformat() + 'Z',
        "user": {"id": current_user.id, "name": current_user.name}
    }


@router.get("/{note_id}/comments", status_code=status.HTTP_200_OK)
def get_comments(
    note_id: int,
    db: Session = Depends(get_db)
):
    """Get all comments for a note"""
    comments = db.exec(
        select(models.Comment)
        .where(models.Comment.note_id == note_id)
        .order_by(models.Comment.created_at.asc())
    ).all()
    
    result = []
    for c in comments:
        user = db.get(models.User, c.user_id)
        result.append({
            "id": c.id,
            "text": c.text,
            "created_at": c.created_at.isoformat() + 'Z',
            "user": {"id": user.id, "name": user.name} if user else None
        })
    
    return result
