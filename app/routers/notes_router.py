# app/routers/notes_router.py
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from typing import Optional, List
from pydantic import BaseModel
from sqlmodel import Session
from ..deps import get_db, get_current_user
from .. import crud, models
import os
import uuid
from pathlib import Path
import cloudinary
import cloudinary.uploader

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

router = APIRouter(prefix="/notes", tags=["notes"])


def format_timestamp(dt):
    """Format datetime to ISO string with UTC timezone indicator"""
    if dt:
        return dt.isoformat() + 'Z'  # Add Z to indicate UTC
    return None


class NoteCreateSchema(BaseModel):
    """
    Request body schema for creating a note.
    Fields are optional to keep it flexible for quick posts.
    """
    text: Optional[str] = None
    emotion: Optional[str] = None
    page_number: Optional[int] = None  # New field
    chapter: Optional[str] = None  # New field
    image_url: Optional[str] = None  # New field for image URL
    quote: Optional[str] = None  # New field for book quotes
    userbook_id: Optional[int] = None
    is_public: Optional[bool] = True


class NoteOutSchema(BaseModel):
    id: int
    text: Optional[str]
    emotion: Optional[str]
    page_number: Optional[int] = None  # New field
    chapter: Optional[str] = None  # New field
    image_url: Optional[str] = None  # New field
    quote: Optional[str] = None  # New field
    is_public: bool
    created_at: Optional[str]
    likes_count: Optional[int] = 0  # New field
    comments_count: Optional[int] = 0  # New field
    user_has_liked: Optional[bool] = False  # New field
    user: Optional[dict] = None
    book: Optional[dict] = None

    class Config:
        orm_mode = True


@router.post("/upload-image", status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user)
):
    """Upload an image for a note/post to Cloudinary"""
    # Validate file type
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Verify Cloudinary is configured
    if not all([os.getenv("CLOUDINARY_CLOUD_NAME"), os.getenv("CLOUDINARY_API_KEY"), os.getenv("CLOUDINARY_API_SECRET")]):
        raise HTTPException(status_code=500, detail="Cloudinary not configured. Please set environment variables.")
    
    # Upload to Cloudinary
    try:
        contents = await file.read()
        
        # Generate unique public_id
        file_extension = os.path.splitext(file.filename)[1].lstrip('.')
        unique_id = str(uuid.uuid4())
        
        # Upload to Cloudinary with folder organization
        upload_result = cloudinary.uploader.upload(
            contents,
            folder="book_tracker/notes",
            public_id=unique_id,
            resource_type="image"
        )
        
        # Get the secure URL from Cloudinary
        image_url = upload_result.get('secure_url')
        
        if not image_url:
            raise Exception("Failed to get image URL from Cloudinary")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")
    
    return {"image_url": image_url}


@router.post("/", response_model=NoteOutSchema, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreateSchema, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    text = payload.text
    emotion = payload.emotion
    page_number = payload.page_number
    chapter = payload.chapter
    image_url = payload.image_url
    quote = payload.quote
    userbook_id = payload.userbook_id
    is_public = payload.is_public if payload.is_public is not None else True

    # if userbook_id provided, ensure it belongs to current_user
    if userbook_id:
        ub = crud.get_userbook(db, userbook_id=userbook_id)
        if not ub or ub.user_id != current_user.id:
            raise HTTPException(status_code=400, detail="Invalid userbook_id")

    note = crud.create_note(
        db, 
        user_id=current_user.id, 
        text=text, 
        emotion=emotion, 
        userbook_id=userbook_id, 
        is_public=is_public,
        page_number=page_number,
        chapter=chapter,
        image_url=image_url,
        quote=quote
    )

    # Build response shape (include basic user and book info for convenience)
    book = note.userbook.book if note.userbook else None
    user = note.user
    out = {
        "id": note.id,
        "text": note.text,
        "emotion": note.emotion,
        "page_number": note.page_number,
        "chapter": note.chapter,
        "image_url": note.image_url,
        "quote": note.quote,
        "is_public": note.is_public,
        "created_at": format_timestamp(note.created_at),
        "user": {"id": user.id, "name": user.name} if user else None,
        "book": {"id": book.id, "title": book.title, "author": book.author} if book else None
    }
    return out


@router.get("/feed", status_code=status.HTTP_200_OK, response_model=List[NoteOutSchema])
def get_feed(limit: int = 50, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from sqlmodel import select, func
    notes = crud.get_notes_feed(db, limit=limit)
    result = []
    for n in notes:
        book = n.userbook.book if n.userbook else None
        user = n.user
        
        # Count likes
        likes_count = db.exec(
            select(func.count(models.Like.id)).where(models.Like.note_id == n.id)
        ).one()
        
        # Count comments
        comments_count = db.exec(
            select(func.count(models.Comment.id)).where(models.Comment.note_id == n.id)
        ).one()
        
        # Check if current user has liked
        user_has_liked = db.exec(
            select(models.Like)
            .where(models.Like.note_id == n.id)
            .where(models.Like.user_id == current_user.id)
        ).first() is not None
        
        result.append({
            "id": n.id,
            "text": n.text,
            "emotion": n.emotion,
            "page_number": n.page_number,
            "chapter": n.chapter,
            "image_url": n.image_url,
            "quote": n.quote,
            "is_public": n.is_public,
            "created_at": format_timestamp(n.created_at),
            "likes_count": likes_count,
            "comments_count": comments_count,
            "user_has_liked": user_has_liked,
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
            "page_number": n.page_number,
            "chapter": n.chapter,
            "image_url": n.image_url,
            "quote": n.quote,
            "is_public": n.is_public,
            "created_at": format_timestamp(n.created_at),
            "user": {"id": user.id, "name": user.name} if user else None,
            "book": {"id": book.id, "title": book.title, "author": book.author} if book else None
        })
    return out


@router.get("/userbook/{userbook_id}", status_code=status.HTTP_200_OK, response_model=List[NoteOutSchema])
def get_notes_for_userbook(
    userbook_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get all notes for a specific book in the user's library"""
    # Verify userbook belongs to current user
    ub = crud.get_userbook(db, userbook_id=userbook_id)
    if not ub or ub.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="UserBook not found")
    
    # Get notes for this userbook, ordered by created_at descending (newest first)
    from sqlmodel import select
    notes = db.exec(
        select(models.Note)
        .where(models.Note.userbook_id == userbook_id)
        .order_by(models.Note.created_at.desc())
    ).all()
    
    out = []
    for n in notes:
        book = n.userbook.book if n.userbook else None
        user = n.user
        out.append({
            "id": n.id,
            "text": n.text,
            "emotion": n.emotion,
            "page_number": n.page_number,
            "chapter": n.chapter,
            "image_url": n.image_url,
            "quote": n.quote,
            "is_public": n.is_public,
            "created_at": format_timestamp(n.created_at),
            "user": {"id": user.id, "name": user.name} if user else None,
            "book": {"id": book.id, "title": book.title, "author": book.author} if book else None
        })
    return out


@router.get("/friends-feed", status_code=status.HTTP_200_OK, response_model=List[NoteOutSchema])
def get_friends_feed(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get feed of posts from users you follow.
    Prioritizes mutual follows (most active on top), then regular follows (most active on top).
    """
    from sqlmodel import select, func, and_
    
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
    
    # Get notes from followed users, public only
    notes = db.exec(
        select(models.Note).where(
            and_(
                models.Note.user_id.in_(following_ids),
                models.Note.is_public == True
            )
        ).order_by(models.Note.created_at.desc()).limit(limit)
    ).all()
    
    result = []
    for n in notes:
        book = n.userbook.book if n.userbook else None
        user = n.user
        
        # Count likes
        likes_count = db.exec(
            select(func.count(models.Like.id)).where(models.Like.note_id == n.id)
        ).one()
        
        # Count comments
        comments_count = db.exec(
            select(func.count(models.Comment.id)).where(models.Comment.note_id == n.id)
        ).one()
        
        # Check if current user has liked
        user_has_liked = db.exec(
            select(models.Like)
            .where(models.Like.note_id == n.id)
            .where(models.Like.user_id == current_user.id)
        ).first() is not None
        
        result.append({
            "id": n.id,
            "text": n.text,
            "emotion": n.emotion,
            "page_number": n.page_number,
            "chapter": n.chapter,
            "image_url": n.image_url,
            "quote": n.quote,
            "is_public": n.is_public,
            "created_at": format_timestamp(n.created_at),
            "likes_count": likes_count,
            "comments_count": comments_count,
            "user_has_liked": user_has_liked,
            "user": {
                "id": user.id,
                "name": user.name,
                "username": user.username,
                "is_mutual": user.id in mutual_ids
            } if user else None,
            "book": {"id": book.id, "title": book.title, "author": book.author} if book else None
        })
    
    # Sort: mutual follows' posts first, then by created_at descending
    result.sort(key=lambda x: (
        0 if x["user"] and x["user"].get("is_mutual") else 1,
        x["created_at"]
    ), reverse=True)
    
    return result
