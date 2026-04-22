# app/routers/likes_comments.py
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from ..deps import get_db, get_current_user
from .. import models
from ..utils.push import send_push_notification_to_user
from ..notifications.dispatcher import fire_event

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
    
    # Send push notification to note owner (skip if liking own post)
    if note.user_id != current_user.id:
        liker_name = current_user.name or current_user.username or "Someone"
        fire_event(
            db=db,
            event_type="post_liked",
            actor_id=current_user.id,
            actor_name=liker_name,
            recipient_ids=[note.user_id],
        )
    
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

    # Notify post owner via dispatcher (writes to NotificationLog + sends push)
    if note.user_id != current_user.id:
        commenter_name = current_user.name or current_user.username or "Someone"
        fire_event(
            db=db,
            event_type="post_commented",
            actor_id=current_user.id,
            actor_name=commenter_name,
            recipient_ids=[note.user_id],
            extra={"preview": payload.text[:80], "note_id": note_id},
        )

    return {
        "id": comment.id,
        "text": comment.text,
        "created_at": comment.created_at.isoformat() + 'Z',
        "user": {"id": current_user.id, "name": current_user.name}
    }


@router.get("/{note_id}/comments", status_code=status.HTTP_200_OK)
def get_comments(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get all comments for a note"""
    note = db.get(models.Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Enforce private profile — non-followers cannot read comments on private users' notes
    if note.user_id != current_user.id:
        author = db.get(models.User, note.user_id)
        if author and getattr(author, "is_private_profile", False):
            is_following = bool(db.exec(
                select(models.Follow).where(
                    models.Follow.follower_id == current_user.id,
                    models.Follow.followed_id == note.user_id,
                )
            ).first())
            if not is_following:
                raise HTTPException(status_code=403, detail="This profile is private")

    comments = db.exec(
        select(models.Comment)
        .where(models.Comment.note_id == note_id)
        .order_by(models.Comment.created_at.asc())
    ).all()
    
    if not comments:
        return []
    user_ids = list({c.user_id for c in comments})
    users_map = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(user_ids))).all()}
    result = []
    for c in comments:
        user = users_map.get(c.user_id)
        result.append({
            "id": c.id,
            "text": c.text,
            "created_at": c.created_at.isoformat() + 'Z',
            "user": {
                "id": user.id,
                "name": user.name,
                "username": getattr(user, "username", None),
                "profile_picture": getattr(user, "profile_picture", None),
            } if user else None
        })

    return result
