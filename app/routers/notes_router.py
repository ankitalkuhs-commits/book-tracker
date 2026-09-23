# app/routers/notes_router.py
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, UploadFile, File, Query
from typing import Optional, List
from pydantic import BaseModel
from sqlmodel import Session
from sqlalchemy.exc import IntegrityError
from datetime import timedelta
from ..deps import get_db, get_current_user, get_current_user_optional
from .. import crud, models, localday
from ..group_activity import fire_group_activity_for_user
import os
import uuid
from pathlib import Path
import cloudinary
import cloudinary.exceptions
import cloudinary.uploader

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

router = APIRouter(prefix="/notes", tags=["notes"])

# ── Sprint 4F: the bot cap and the dedup key (R-13, R-15) ───────────────────
# R-13: a hard server-side cap. The bot's own restraint is not a control, and the seven-a-week
# schedule (R-09) must never read this as headroom.
BOT_MAX_NOTES_PER_DAY = 2
BOT_CAP_WINDOW = timedelta(hours=24)
# The four content types bot_post.content_type may hold. A dedup_key is "<type>:<id>"; the
# server splits on the first colon. Bot-only field, so failing loudly costs a reader nothing.
BOT_CONTENT_TYPES = ("bestseller", "prompt", "quote", "circles")


def format_timestamp(dt):
    """Format datetime to ISO string with UTC timezone indicator"""
    if dt:
        return dt.isoformat() + 'Z'  # Add Z to indicate UTC
    return None


def _note_relations(db, notes):
    """Batch-load the author, userbook and book for a page of notes: 3 queries for any page
    size. Replaces per-note lazy loads of n.user / n.userbook / n.userbook.book (F-08)."""
    from sqlmodel import select
    user_ids = {n.user_id for n in notes}
    ub_ids = {n.userbook_id for n in notes if n.userbook_id}
    users = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(user_ids))).all()} if user_ids else {}
    ubs = {u.id: u for u in db.exec(select(models.UserBook).where(models.UserBook.id.in_(ub_ids))).all()} if ub_ids else {}
    book_ids = {ub.book_id for ub in ubs.values() if ub.book_id}
    books = {b.id: b for b in db.exec(select(models.Book).where(models.Book.id.in_(book_ids))).all()} if book_ids else {}
    return users, ubs, books


class NoteCreateSchema(BaseModel):
    text: Optional[str] = None
    emotion: Optional[str] = None
    page_number: Optional[int] = None
    chapter: Optional[str] = None
    image_url: Optional[str] = None
    quote: Optional[str] = None
    userbook_id: Optional[int] = None
    is_public: Optional[bool] = None   # F-17: omitted on create => private; omitted on update => unchanged
    # Sprint 4F (R-07/R-15): "<content_type>:<id>", e.g. "bestseller:9780593321447". Honoured
    # ONLY when the caller is a bot account; silently ignored for a reader, and never read by
    # PUT /notes/{id}, which shares this schema (see the F-17 comment above). A 422 here would
    # have to be duplicated on a route that has no dedup concept, and would break any old
    # client that round-trips a note body.
    dedup_key: Optional[str] = None

    def has_content(self) -> bool:
        return bool(
            (self.text and self.text.strip()) or
            (self.quote and self.quote.strip()) or
            self.image_url
        )


class NoteOutSchema(BaseModel):
    id: int
    user_id: Optional[int] = None
    text: Optional[str]
    emotion: Optional[str]
    page_number: Optional[int] = None
    chapter: Optional[str] = None
    image_url: Optional[str] = None
    quote: Optional[str] = None
    is_public: bool
    created_at: Optional[str]
    updated_at: Optional[str] = None
    likes_count: Optional[int] = 0
    comments_count: Optional[int] = 0
    user_has_liked: Optional[bool] = False
    liked_by_me: Optional[bool] = False
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

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="File is empty")

    # Upload to Cloudinary
    try:
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

    except cloudinary.exceptions.BadRequest:
        raise HTTPException(status_code=400, detail="Invalid image file")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")

    return {"image_url": image_url}


@router.post("/", response_model=NoteOutSchema, status_code=status.HTTP_201_CREATED)
def create_note(
    payload: NoteCreateSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Sprint 4F R-13: the cap, and the dedup key, are BOTH gated on the row's is_bot flag, so a
    # reader's POST runs exactly the statements it ran before 4F (B-33 pins the number). The
    # cap runs first, before anything is written, so a 429 leaves nothing behind (B-15a).
    dedup_key = None
    content_type = None
    if current_user.is_bot:
        from sqlmodel import select as _select
        from sqlalchemy import func as _func
        window_start = localday.utcnow() - BOT_CAP_WINDOW
        recent = db.exec(
            _select(_func.count(models.Note.id))
            .where(models.Note.user_id == current_user.id)
            .where(models.Note.created_at >= window_start)
        ).one()
        if (recent or 0) >= BOT_MAX_NOTES_PER_DAY:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Automated accounts may post at most "
                       f"{BOT_MAX_NOTES_PER_DAY} times in 24 hours",
            )
        if payload.dedup_key:
            prefix = payload.dedup_key.split(":", 1)[0]
            if ":" not in payload.dedup_key or prefix not in BOT_CONTENT_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="dedup_key must be '<content_type>:<id>' with content_type one of "
                           + ", ".join(BOT_CONTENT_TYPES),
                )
            dedup_key = payload.dedup_key
            content_type = prefix

    text = payload.text
    emotion = payload.emotion
    page_number = payload.page_number
    chapter = payload.chapter
    image_url = payload.image_url
    quote = payload.quote
    userbook_id = payload.userbook_id
    # F-17: a note created without is_public is private. The literal default can't be
    # False on the schema itself because PUT shares it, and an edit that omits the key
    # must keep visibility rather than force it private.
    is_public = payload.is_public if payload.is_public is not None else False

    if not payload.has_content():
        raise HTTPException(status_code=400, detail="Post must have text, a quote, or an image")

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
        quote=quote,
        commit=(dedup_key is None),
    )

    # Sprint 4F R-15: the bot_post row goes in the SAME transaction as the note. There is no
    # window between the two writes, so a collision on uq_bot_post(content_type, dedup_key)
    # rolls the whole transaction back and the note is never created — the failure mode the old
    # "post, then record it" design had does not exist here. This runs BEFORE the group-activity
    # hook below, so a 409 raises before any background task is registered.
    if dedup_key is not None:
        db.add(models.BotPost(
            bot_email=current_user.email,
            content_type=content_type,
            dedup_key=dedup_key,
            note_id=note.id,
        ))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()       # the note goes with it — nothing was committed
            raise HTTPException(status_code=409, detail="Already posted")
        db.refresh(note)

    # Fire group activity for note posted — public notes only, and after the response (F-59).
    # A private note must never surface in GET /groups/{id}/activity.
    if is_public:
        book_for_activity = note.userbook.book if note.userbook else None
        book_title = book_for_activity.title if book_for_activity else None
        background_tasks.add_task(
            fire_group_activity_for_user, db, current_user.id, "note_posted",
            {"note_id": note.id, "book_title": book_title},
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
        "user": {"id": user.id, "name": user.name, "is_bot": bool(user.is_bot)} if user else None,
        "book": {"id": book.id, "title": book.title, "author": book.author} if book else None
    }
    return out


@router.put("/{note_id}", response_model=NoteOutSchema, status_code=status.HTTP_200_OK)
def update_note(
    note_id: int,
    payload: NoteCreateSchema,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update an existing note - only the owner can update"""
    # Get the note
    note = crud.get_note_by_id(db, note_id=note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Check ownership
    if note.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this note")

    # Update fields
    note.text = payload.text
    note.emotion = payload.emotion
    note.page_number = payload.page_number
    note.chapter = payload.chapter
    note.quote = payload.quote
    if payload.image_url is not None:
        note.image_url = payload.image_url
    if payload.is_public is not None:
        note.is_public = payload.is_public

    from datetime import datetime, timezone
    note.updated_at = datetime.now(timezone.utc)

    db.add(note)
    db.commit()
    db.refresh(note)

    # Build response
    book = note.userbook.book if note.userbook else None
    user = note.user
    return {
        "id": note.id,
        "text": note.text,
        "emotion": note.emotion,
        "page_number": note.page_number,
        "chapter": note.chapter,
        "image_url": note.image_url,
        "quote": note.quote,
        "is_public": note.is_public,
        "created_at": format_timestamp(note.created_at),
        "updated_at": format_timestamp(note.updated_at),
        "user": {"id": user.id, "name": user.name, "is_bot": bool(user.is_bot)} if user else None,
        "book": {"id": book.id, "title": book.title, "author": book.author} if book else None
    }


@router.get("/feed", status_code=status.HTTP_200_OK, response_model=List[NoteOutSchema])
def get_feed(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user_optional)
):
    from sqlmodel import select, func
    notes = crud.get_notes_feed(db, limit=limit)
    if not notes:
        return []

    note_ids = [n.id for n in notes]
    users, ubs, books = _note_relations(db, notes)

    # Batch: like counts per note
    likes_rows = db.exec(
        select(models.Like.note_id, func.count(models.Like.id))
        .where(models.Like.note_id.in_(note_ids))
        .group_by(models.Like.note_id)
    ).all()
    likes_map = {row[0]: row[1] for row in likes_rows}

    # Batch: comment counts per note
    comments_rows = db.exec(
        select(models.Comment.note_id, func.count(models.Comment.id))
        .where(models.Comment.note_id.in_(note_ids))
        .group_by(models.Comment.note_id)
    ).all()
    comments_map = {row[0]: row[1] for row in comments_rows}

    # Batch: which notes the current user has liked
    liked_set = set()
    if current_user:
        liked_rows = db.exec(
            select(models.Like.note_id)
            .where(models.Like.user_id == current_user.id)
            .where(models.Like.note_id.in_(note_ids))
        ).all()
        liked_set = set(liked_rows)

    result = []
    for n in notes:
        ub = ubs.get(n.userbook_id)
        book = books.get(ub.book_id) if ub else None
        user = users.get(n.user_id)
        user_has_liked = n.id in liked_set
        result.append({
            "id": n.id,
            "user_id": n.user_id,
            "text": n.text,
            "emotion": n.emotion,
            "page_number": n.page_number,
            "chapter": n.chapter,
            "image_url": n.image_url,
            "quote": n.quote,
            "is_public": n.is_public,
            "created_at": format_timestamp(n.created_at),
            "likes_count": likes_map.get(n.id, 0),
            "comments_count": comments_map.get(n.id, 0),
            "liked_by_me": user_has_liked,
            "user_has_liked": user_has_liked,
            "user": {
                "id": user.id,
                "name": user.name,
                "username": getattr(user, "username", None),
                "profile_picture": getattr(user, "profile_picture", None),
                "is_bot": bool(user.is_bot),
            } if user else None,
            "book": {
                "id": book.id, "title": book.title,
                "author": book.author, "cover_url": book.cover_url,
                "google_books_id": book.google_books_id, "isbn": book.isbn, "total_pages": book.total_pages,
            } if book else None
        })
    return result


@router.get("/me", status_code=status.HTTP_200_OK, response_model=List[NoteOutSchema])
def get_my_notes(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    from sqlmodel import select, func
    notes = crud.get_notes_for_user(db, user_id=current_user.id, limit=limit)
    if not notes:
        return []
    note_ids = [n.id for n in notes]
    users, ubs, books = _note_relations(db, notes)
    likes_map = {r[0]: r[1] for r in db.exec(
        select(models.Like.note_id, func.count(models.Like.id))
        .where(models.Like.note_id.in_(note_ids)).group_by(models.Like.note_id)
    ).all()}
    comments_map = {r[0]: r[1] for r in db.exec(
        select(models.Comment.note_id, func.count(models.Comment.id))
        .where(models.Comment.note_id.in_(note_ids)).group_by(models.Comment.note_id)
    ).all()}
    liked_set = set(db.exec(
        select(models.Like.note_id)
        .where(models.Like.user_id == current_user.id)
        .where(models.Like.note_id.in_(note_ids))
    ).all())
    out = []
    for n in notes:
        ub = ubs.get(n.userbook_id)
        book = books.get(ub.book_id) if ub else None
        user = users.get(n.user_id)
        user_has_liked = n.id in liked_set
        out.append({
            "id": n.id,
            "user_id": n.user_id,
            "text": n.text,
            "emotion": n.emotion,
            "page_number": n.page_number,
            "chapter": n.chapter,
            "image_url": n.image_url,
            "quote": n.quote,
            "is_public": n.is_public,
            "created_at": format_timestamp(n.created_at),
            "updated_at": format_timestamp(n.updated_at),
            "likes_count": likes_map.get(n.id, 0),
            "comments_count": comments_map.get(n.id, 0),
            "liked_by_me": user_has_liked,
            "user_has_liked": user_has_liked,
            "user": {
                "id": user.id, "name": user.name,
                "username": getattr(user, "username", None),
                "profile_picture": getattr(user, "profile_picture", None),
                "is_bot": bool(user.is_bot),
            } if user else None,
            "book": {
                "id": book.id, "title": book.title,
                "author": book.author, "cover_url": book.cover_url,
                "google_books_id": book.google_books_id, "isbn": book.isbn, "total_pages": book.total_pages,
            } if book else None
        })
    return out


@router.get("/user/{user_id}", status_code=status.HTTP_200_OK, response_model=List[NoteOutSchema])
def get_public_notes_for_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get public notes for a specific user (for their public profile)"""
    from sqlmodel import select, func

    # Enforce private profile — non-followers cannot see notes
    target_user = db.get(models.User, user_id)
    if target_user and getattr(target_user, "is_private_profile", False) and current_user.id != user_id:
        is_following = bool(db.exec(
            select(models.Follow).where(models.Follow.follower_id == current_user.id, models.Follow.followed_id == user_id)
        ).first())
        if not is_following:
            raise HTTPException(status_code=403, detail="This profile is private")

    notes = db.exec(
        select(models.Note)
        .where(models.Note.user_id == user_id)
        .where(models.Note.is_public == True)
        .order_by(models.Note.created_at.desc())
        .limit(20)
    ).all()
    if not notes:
        return []
    note_ids = [n.id for n in notes]
    users, ubs, books = _note_relations(db, notes)
    likes_map = {r[0]: r[1] for r in db.exec(
        select(models.Like.note_id, func.count(models.Like.id))
        .where(models.Like.note_id.in_(note_ids)).group_by(models.Like.note_id)
    ).all()}
    comments_map = {r[0]: r[1] for r in db.exec(
        select(models.Comment.note_id, func.count(models.Comment.id))
        .where(models.Comment.note_id.in_(note_ids)).group_by(models.Comment.note_id)
    ).all()}
    # F-63: the viewer's own like state. Without it the response model pads
    # liked_by_me/user_has_liked to False, so a liked note showed an empty heart.
    liked_set = set(db.exec(
        select(models.Like.note_id)
        .where(models.Like.user_id == current_user.id)
        .where(models.Like.note_id.in_(note_ids))
    ).all())
    out = []
    for n in notes:
        ub = ubs.get(n.userbook_id)
        book = books.get(ub.book_id) if ub else None
        user = users.get(n.user_id)
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
            "user": {"id": user.id, "name": user.name, "is_bot": bool(user.is_bot)} if user else None,
            "book": {
                "id": book.id, "title": book.title, "author": book.author, "cover_url": book.cover_url,
                "google_books_id": book.google_books_id, "isbn": book.isbn, "total_pages": book.total_pages,
            } if book else None,
            "likes_count": likes_map.get(n.id, 0),
            "comments_count": comments_map.get(n.id, 0),
            "liked_by_me": n.id in liked_set,
            "user_has_liked": n.id in liked_set,
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
        .limit(100)
    ).all()

    users, ubs, books = _note_relations(db, notes)

    out = []
    for n in notes:
        note_ub = ubs.get(n.userbook_id)
        book = books.get(note_ub.book_id) if note_ub else None
        user = users.get(n.user_id)
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
            "user": {"id": user.id, "name": user.name, "is_bot": bool(user.is_bot)} if user else None,
            "book": {"id": book.id, "title": book.title, "author": book.author} if book else None
        })
    return out


@router.get("/friends-feed", status_code=status.HTTP_200_OK, response_model=List[NoteOutSchema])
def get_friends_feed(
    limit: int = Query(50, ge=1, le=200),
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

    if not notes:
        return []

    note_ids = [n.id for n in notes]
    users, ubs, books = _note_relations(db, notes)

    # Batch: like counts per note
    likes_rows = db.exec(
        select(models.Like.note_id, func.count(models.Like.id))
        .where(models.Like.note_id.in_(note_ids))
        .group_by(models.Like.note_id)
    ).all()
    likes_map = {row[0]: row[1] for row in likes_rows}

    # Batch: comment counts per note
    comments_rows = db.exec(
        select(models.Comment.note_id, func.count(models.Comment.id))
        .where(models.Comment.note_id.in_(note_ids))
        .group_by(models.Comment.note_id)
    ).all()
    comments_map = {row[0]: row[1] for row in comments_rows}

    # Batch: which notes current user has liked
    liked_rows = db.exec(
        select(models.Like.note_id)
        .where(models.Like.user_id == current_user.id)
        .where(models.Like.note_id.in_(note_ids))
    ).all()
    liked_set = set(liked_rows)

    result = []
    for n in notes:
        ub = ubs.get(n.userbook_id)
        book = books.get(ub.book_id) if ub else None
        user = users.get(n.user_id)
        user_has_liked = n.id in liked_set
        result.append({
            "id": n.id,
            "user_id": n.user_id,
            "text": n.text,
            "emotion": n.emotion,
            "page_number": n.page_number,
            "chapter": n.chapter,
            "image_url": n.image_url,
            "quote": n.quote,
            "is_public": n.is_public,
            "created_at": format_timestamp(n.created_at),
            "likes_count": likes_map.get(n.id, 0),
            "comments_count": comments_map.get(n.id, 0),
            "liked_by_me": user_has_liked,
            "user_has_liked": user_has_liked,
            "user": {
                "id": user.id,
                "name": user.name,
                "username": getattr(user, "username", None),
                "profile_picture": getattr(user, "profile_picture", None),
                "is_mutual": user.id in mutual_ids,
                "is_bot": bool(user.is_bot),
            } if user else None,
            "book": {
                "id": book.id, "title": book.title,
                "author": book.author, "cover_url": book.cover_url,
                "google_books_id": book.google_books_id, "isbn": book.isbn, "total_pages": book.total_pages,
            } if book else None
        })

    # Mutual follows' posts first; the DB already returned newest-first, and
    # list.sort is stable, so the order inside each group is preserved.
    result.sort(key=lambda x: 0 if (x["user"] and x["user"].get("is_mutual")) else 1)

    return result


@router.delete("/{note_id}", status_code=status.HTTP_200_OK)
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Note owner or admin can delete a note/post."""
    from sqlmodel import select
    note = crud.get_note_by_id(db, note_id=note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != current_user.id and not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized to delete this note")
    # Delete likes and comments first to avoid FK constraint violations in PostgreSQL
    for like in db.exec(select(models.Like).where(models.Like.note_id == note_id)).all():
        db.delete(like)
    for comment in db.exec(select(models.Comment).where(models.Comment.note_id == note_id)).all():
        db.delete(comment)
    db.delete(note)
    db.commit()
    return {"message": "Note deleted successfully"}
