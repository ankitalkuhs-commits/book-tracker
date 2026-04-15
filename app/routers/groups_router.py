"""
Groups (Literary Circles) router.
Handles: CRUD, membership, invites, posts, leaderboard, group book, goals.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, func
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from ..deps import get_db, get_current_user
from .. import models

router = APIRouter(prefix="/groups", tags=["groups"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_member(db, group_id: int, user_id: int, require_active=True) -> Optional[models.GroupMember]:
    q = select(models.GroupMember).where(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id,
    )
    if require_active:
        q = q.where(models.GroupMember.status == "active")
    return db.exec(q).first()

def _is_curator(db, group_id: int, user_id: int) -> bool:
    m = _is_member(db, group_id, user_id)
    return m is not None and m.role == "curator"

def _member_count(db, group_id: int) -> int:
    return db.exec(
        select(func.count(models.GroupMember.id)).where(
            models.GroupMember.group_id == group_id,
            models.GroupMember.status == "active",
        )
    ).one()

def _group_or_404(db, group_id: int) -> models.ReadingGroup:
    g = db.get(models.ReadingGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return g

def _serialize_group(db, g: models.ReadingGroup, user_id: int) -> dict:
    membership = _is_member(db, g.id, user_id, require_active=False)
    book = db.get(models.Book, g.current_book_id) if g.current_book_id else None
    creator = db.get(models.User, g.created_by)
    return {
        "id": g.id,
        "name": g.name,
        "description": g.description,
        "is_private": g.is_private,
        "invite_code": g.invite_code,
        "cover_preset": g.cover_preset,
        "created_by": g.created_by,
        "creator_name": creator.name if creator else None,
        "goal_pages": g.goal_pages,
        "goal_period": g.goal_period,
        "goal_start_date": g.goal_start_date.isoformat() if g.goal_start_date else None,
        "current_book": {
            "id": book.id, "title": book.title,
            "author": book.author, "cover_url": book.cover_url,
        } if book else None,
        "member_count": _member_count(db, g.id),
        "membership_status": membership.status if membership else None,
        "membership_role": membership.role if membership else None,
        "created_at": g.created_at.isoformat(),
    }


# ─── Schemas ──────────────────────────────────────────────────────────────────

class CreateGroupBody(BaseModel):
    name: str
    description: Optional[str] = None
    is_private: bool = False
    cover_preset: str = "teal"
    goal_pages: Optional[int] = None
    goal_period: Optional[str] = None   # 'monthly' | 'yearly'
    invite_user_ids: List[int] = []

class UpdateGroupBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_private: Optional[bool] = None
    cover_preset: Optional[str] = None
    goal_pages: Optional[int] = None
    goal_period: Optional[str] = None

class CreatePostBody(BaseModel):
    text: str
    quote: Optional[str] = None
    userbook_id: Optional[int] = None

class SetBookBody(BaseModel):
    book_id: int


# ─── List / Discover ──────────────────────────────────────────────────────────

@router.get("/my")
def get_my_groups(
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    """Groups the current user is an active member of."""
    memberships = db.exec(
        select(models.GroupMember).where(
            models.GroupMember.user_id == me.id,
            models.GroupMember.status == "active",
        )
    ).all()
    groups = []
    for m in memberships:
        g = db.get(models.ReadingGroup, m.group_id)
        if g:
            groups.append(_serialize_group(db, g, me.id))
    return groups


@router.get("/discover")
def discover_groups(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    """Public groups the user has not joined, optionally filtered by name."""
    query = select(models.ReadingGroup).where(models.ReadingGroup.is_private == False)
    groups = db.exec(query).all()
    result = []
    for g in groups:
        if q and q.lower() not in g.name.lower() and (not g.description or q.lower() not in g.description.lower()):
            continue
        membership = _is_member(db, g.id, me.id)
        if membership:
            continue  # already a member — show in "my groups"
        result.append(_serialize_group(db, g, me.id))
    return result


# ─── Create ───────────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
def create_group(
    body: CreateGroupBody,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Group name is required")

    goal_start = None
    if body.goal_period:
        goal_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    g = models.ReadingGroup(
        name=body.name.strip(),
        description=body.description,
        is_private=body.is_private,
        cover_preset=body.cover_preset,
        created_by=me.id,
        goal_pages=body.goal_pages,
        goal_period=body.goal_period,
        goal_start_date=goal_start,
    )
    db.add(g)
    db.commit()
    db.refresh(g)

    # Make creator a curator
    db.add(models.GroupMember(group_id=g.id, user_id=me.id, role="curator", status="active"))
    db.commit()

    # Send pending invites to specified users
    for uid in body.invite_user_ids:
        if uid == me.id:
            continue
        if not _is_member(db, g.id, uid, require_active=False):
            db.add(models.GroupMember(
                group_id=g.id, user_id=uid,
                role="member", status="pending", invited_by=me.id,
            ))
    db.commit()

    return _serialize_group(db, g, me.id)


# ─── Read ─────────────────────────────────────────────────────────────────────

@router.get("/{group_id}")
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    g = _group_or_404(db, group_id)
    # Private groups: only members can view
    if g.is_private and not _is_member(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="This is a private group")
    return _serialize_group(db, g, me.id)


# ─── Update ───────────────────────────────────────────────────────────────────

@router.put("/{group_id}")
def update_group(
    group_id: int,
    body: UpdateGroupBody,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    g = _group_or_404(db, group_id)
    if not _is_curator(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Only the curator can edit this group")
    if body.name is not None:
        g.name = body.name.strip()
    if body.description is not None:
        g.description = body.description
    if body.is_private is not None:
        g.is_private = body.is_private
    if body.cover_preset is not None:
        g.cover_preset = body.cover_preset
    if body.goal_pages is not None:
        g.goal_pages = body.goal_pages
    if body.goal_period is not None:
        g.goal_period = body.goal_period
        if not g.goal_start_date:
            g.goal_start_date = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    db.add(g)
    db.commit()
    return _serialize_group(db, g, me.id)


@router.delete("/{group_id}", status_code=204)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    g = _group_or_404(db, group_id)
    if g.created_by != me.id:
        raise HTTPException(status_code=403, detail="Only the group creator can delete it")
    # Delete members, posts, then group
    db.exec(select(models.GroupMember).where(models.GroupMember.group_id == group_id))
    for m in db.exec(select(models.GroupMember).where(models.GroupMember.group_id == group_id)).all():
        db.delete(m)
    for p in db.exec(select(models.GroupPost).where(models.GroupPost.group_id == group_id)).all():
        db.delete(p)
    db.delete(g)
    db.commit()


# ─── Membership ───────────────────────────────────────────────────────────────

@router.post("/{group_id}/join", status_code=201)
def join_group(
    group_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    g = _group_or_404(db, group_id)
    existing = _is_member(db, group_id, me.id, require_active=False)
    if existing:
        return {"status": existing.status, "message": "Already a member or pending"}

    member_status = "pending" if g.is_private else "active"
    db.add(models.GroupMember(group_id=group_id, user_id=me.id, role="member", status=member_status))
    db.commit()
    return {"status": member_status}


@router.delete("/{group_id}/leave", status_code=204)
def leave_group(
    group_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    m = _is_member(db, group_id, me.id, require_active=False)
    if not m:
        raise HTTPException(status_code=404, detail="Not a member")
    # Prevent last curator from leaving
    if m.role == "curator":
        other_curators = db.exec(
            select(models.GroupMember).where(
                models.GroupMember.group_id == group_id,
                models.GroupMember.role == "curator",
                models.GroupMember.status == "active",
                models.GroupMember.user_id != me.id,
            )
        ).first()
        if not other_curators:
            raise HTTPException(status_code=400, detail="Transfer curator role before leaving")
    db.delete(m)
    db.commit()


@router.get("/{group_id}/members")
def get_members(
    group_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    _group_or_404(db, group_id)
    members = db.exec(
        select(models.GroupMember).where(
            models.GroupMember.group_id == group_id,
            models.GroupMember.status == "active",
        )
    ).all()
    result = []
    for m in members:
        u = db.get(models.User, m.user_id)
        if u:
            result.append({
                "user_id": u.id, "name": u.name, "username": u.username,
                "profile_picture": getattr(u, "profile_picture", None),
                "role": m.role, "joined_at": m.joined_at.isoformat(),
            })
    return result


@router.get("/{group_id}/pending")
def get_pending(
    group_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    if not _is_curator(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Curator only")
    pending = db.exec(
        select(models.GroupMember).where(
            models.GroupMember.group_id == group_id,
            models.GroupMember.status == "pending",
        )
    ).all()
    result = []
    for m in pending:
        u = db.get(models.User, m.user_id)
        if u:
            result.append({
                "user_id": u.id, "name": u.name, "username": u.username,
                "profile_picture": getattr(u, "profile_picture", None),
                "invited_by": m.invited_by,
            })
    return result


@router.post("/{group_id}/approve/{user_id}", status_code=200)
def approve_member(
    group_id: int, user_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    if not _is_curator(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Curator only")
    m = _is_member(db, group_id, user_id, require_active=False)
    if not m:
        raise HTTPException(status_code=404, detail="No pending request")
    m.status = "active"
    db.add(m)
    db.commit()
    return {"ok": True}


@router.post("/{group_id}/reject/{user_id}", status_code=204)
def reject_member(
    group_id: int, user_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    if not _is_curator(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Curator only")
    m = _is_member(db, group_id, user_id, require_active=False)
    if m:
        db.delete(m)
        db.commit()


@router.delete("/{group_id}/remove/{user_id}", status_code=204)
def remove_member(
    group_id: int, user_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    if not _is_curator(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Curator only")
    m = _is_member(db, group_id, user_id)
    if m:
        db.delete(m)
        db.commit()


@router.post("/{group_id}/invite/{user_id}", status_code=201)
def invite_user(
    group_id: int, user_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    _group_or_404(db, group_id)
    if not _is_curator(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Curator only")
    if _is_member(db, group_id, user_id, require_active=False):
        return {"message": "Already invited or a member"}
    target = db.get(models.User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    db.add(models.GroupMember(
        group_id=group_id, user_id=user_id,
        role="member", status="pending", invited_by=me.id,
    ))
    db.commit()
    return {"ok": True}


@router.post("/join/{invite_code}", status_code=201)
def join_by_invite_code(
    invite_code: str,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    g = db.exec(
        select(models.ReadingGroup).where(models.ReadingGroup.invite_code == invite_code)
    ).first()
    if not g:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    existing = _is_member(db, g.id, me.id, require_active=False)
    if existing:
        return {"group_id": g.id, "status": existing.status}
    # Private: pending for curator approval; public: instant
    member_status = "pending" if g.is_private else "active"
    db.add(models.GroupMember(group_id=g.id, user_id=me.id, role="member", status=member_status))
    db.commit()
    return {"group_id": g.id, "status": member_status}


# ─── Accept / Reject own invite ───────────────────────────────────────────────

@router.post("/{group_id}/accept", status_code=200)
def accept_invite(
    group_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    """User accepts a curator-sent invite to join a private group."""
    m = _is_member(db, group_id, me.id, require_active=False)
    if not m or m.status != "pending":
        raise HTTPException(status_code=404, detail="No pending invite")
    m.status = "active"
    db.add(m)
    db.commit()
    return {"ok": True}


@router.delete("/{group_id}/decline", status_code=204)
def decline_invite(
    group_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    """User declines a curator-sent invite."""
    m = _is_member(db, group_id, me.id, require_active=False)
    if m and m.status == "pending":
        db.delete(m)
        db.commit()


# ─── Posts / Group Feed ───────────────────────────────────────────────────────

@router.get("/{group_id}/posts")
def get_group_posts(
    group_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    g = _group_or_404(db, group_id)
    if g.is_private and not _is_member(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Members only")
    posts = db.exec(
        select(models.GroupPost)
        .where(models.GroupPost.group_id == group_id)
        .order_by(models.GroupPost.created_at.desc())
        .limit(50)
    ).all()
    result = []
    for p in posts:
        user = db.get(models.User, p.user_id)
        book = None
        if p.userbook_id:
            ub = db.get(models.UserBook, p.userbook_id)
            if ub:
                book = db.get(models.Book, ub.book_id)
        result.append({
            "id": p.id,
            "text": p.text,
            "quote": p.quote,
            "created_at": p.created_at.isoformat(),
            "user": {"id": user.id, "name": user.name,
                     "profile_picture": getattr(user, "profile_picture", None)} if user else None,
            "book": {"id": book.id, "title": book.title,
                     "cover_url": book.cover_url} if book else None,
        })
    return result


@router.post("/{group_id}/posts", status_code=201)
def create_group_post(
    group_id: int,
    body: CreatePostBody,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    if not _is_member(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Members only")
    p = models.GroupPost(
        group_id=group_id, user_id=me.id,
        text=body.text, quote=body.quote, userbook_id=body.userbook_id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    user = db.get(models.User, me.id)
    return {
        "id": p.id, "text": p.text, "quote": p.quote,
        "created_at": p.created_at.isoformat(),
        "user": {"id": user.id, "name": user.name,
                 "profile_picture": getattr(user, "profile_picture", None)},
        "book": None,
    }


@router.delete("/{group_id}/posts/{post_id}", status_code=204)
def delete_group_post(
    group_id: int, post_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    p = db.get(models.GroupPost, post_id)
    if not p or p.group_id != group_id:
        raise HTTPException(status_code=404, detail="Post not found")
    if p.user_id != me.id and not _is_curator(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Not allowed")
    db.delete(p)
    db.commit()


# ─── Leaderboard ─────────────────────────────────────────────────────────────

@router.get("/{group_id}/leaderboard")
def get_leaderboard(
    group_id: int,
    period: str = "monthly",   # 'monthly' | 'alltime'
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    g = _group_or_404(db, group_id)
    if g.is_private and not _is_member(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Members only")

    members = db.exec(
        select(models.GroupMember).where(
            models.GroupMember.group_id == group_id,
            models.GroupMember.status == "active",
        )
    ).all()

    since = None
    if period == "monthly":
        now = datetime.utcnow()
        since = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    rows = []
    for m in members:
        user = db.get(models.User, m.user_id)
        if not user:
            continue

        # Books finished
        ub_q = select(models.UserBook).where(
            models.UserBook.user_id == m.user_id,
            models.UserBook.status == "finished",
        )
        if since:
            ub_q = ub_q.where(models.UserBook.updated_at >= since)
        books_finished = len(db.exec(ub_q).all())

        # Pages read from activity
        ra_q = select(func.sum(models.ReadingActivity.pages_read)).where(
            models.ReadingActivity.user_id == m.user_id,
        )
        if since:
            ra_q = ra_q.where(models.ReadingActivity.date >= since)
        pages = db.exec(ra_q).one() or 0

        # Currently reading
        current = db.exec(
            select(models.UserBook).where(
                models.UserBook.user_id == m.user_id,
                models.UserBook.status == "reading",
            ).limit(1)
        ).first()
        current_book = None
        if current:
            b = db.get(models.Book, current.book_id)
            if b:
                current_book = b.title

        rows.append({
            "user_id": user.id,
            "name": user.name,
            "username": user.username,
            "profile_picture": getattr(user, "profile_picture", None),
            "books_finished": books_finished,
            "pages_read": int(pages),
            "current_book": current_book,
        })

    rows.sort(key=lambda r: (-r["pages_read"], -r["books_finished"]))
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows


# ─── Goal Progress ────────────────────────────────────────────────────────────

@router.get("/{group_id}/goal")
def get_goal_progress(
    group_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    g = _group_or_404(db, group_id)
    if not g.goal_pages:
        return {"goal_pages": None, "pages_read": 0, "pct": 0}

    members = db.exec(
        select(models.GroupMember).where(
            models.GroupMember.group_id == group_id,
            models.GroupMember.status == "active",
        )
    ).all()
    user_ids = [m.user_id for m in members]

    since = g.goal_start_date
    if g.goal_period == "monthly" and since:
        now = datetime.utcnow()
        since = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    ra_q = select(func.sum(models.ReadingActivity.pages_read)).where(
        models.ReadingActivity.user_id.in_(user_ids)
    )
    if since:
        ra_q = ra_q.where(models.ReadingActivity.date >= since)
    total_pages = db.exec(ra_q).one() or 0

    pct = min(100, round((total_pages / g.goal_pages) * 100)) if g.goal_pages else 0
    return {
        "goal_pages": g.goal_pages,
        "goal_period": g.goal_period,
        "pages_read": int(total_pages),
        "pct": pct,
    }


# ─── Group Book ───────────────────────────────────────────────────────────────

@router.put("/{group_id}/book")
def set_group_book(
    group_id: int,
    body: SetBookBody,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    if not _is_curator(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Curator only")
    g = _group_or_404(db, group_id)
    book = db.get(models.Book, body.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    g.current_book_id = body.book_id
    db.add(g)
    db.commit()
    return {"id": book.id, "title": book.title, "author": book.author, "cover_url": book.cover_url}


@router.delete("/{group_id}/book", status_code=204)
def clear_group_book(
    group_id: int,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    if not _is_curator(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Curator only")
    g = _group_or_404(db, group_id)
    g.current_book_id = None
    db.add(g)
    db.commit()


# ─── My pending invites ───────────────────────────────────────────────────────

@router.get("/invites/pending")
def get_my_pending_invites(
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    """Groups where the current user has a pending invite from a curator."""
    pending = db.exec(
        select(models.GroupMember).where(
            models.GroupMember.user_id == me.id,
            models.GroupMember.status == "pending",
            models.GroupMember.invited_by != None,
        )
    ).all()
    result = []
    for m in pending:
        g = db.get(models.ReadingGroup, m.group_id)
        if g:
            inviter = db.get(models.User, m.invited_by) if m.invited_by else None
            result.append({
                **_serialize_group(db, g, me.id),
                "invited_by_name": inviter.name if inviter else None,
            })
    return result
