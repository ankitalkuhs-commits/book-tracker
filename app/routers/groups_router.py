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
from ..group_activity import fire_group_activity

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
    book_id: Optional[int] = None
    # Google Books fallback — provide these if no local book_id yet
    google_books_id: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    cover_url: Optional[str] = None
    isbn: Optional[str] = None
    total_pages: Optional[int] = None
    description: Optional[str] = None


# ─── My pending invites (must be before /{group_id}/... routes) ──────────────

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
    if not pending:
        return []

    # Batch fetch groups
    group_ids = list({m.group_id for m in pending})
    groups_map = {g.id: g for g in db.exec(select(models.ReadingGroup).where(models.ReadingGroup.id.in_(group_ids))).all()}

    # Batch fetch inviters
    inviter_ids = list({m.invited_by for m in pending if m.invited_by})
    inviters_map = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(inviter_ids))).all()} if inviter_ids else {}

    # Batch fetch current books + creators
    book_ids = list({g.current_book_id for g in groups_map.values() if g.current_book_id})
    books_map = {b.id: b for b in db.exec(select(models.Book).where(models.Book.id.in_(book_ids))).all()} if book_ids else {}
    creator_ids = list({g.created_by for g in groups_map.values()})
    creators_map = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(creator_ids))).all()} if creator_ids else {}

    # Batch member counts
    count_rows = db.exec(
        select(models.GroupMember.group_id, func.count(models.GroupMember.id))
        .where(models.GroupMember.group_id.in_(group_ids), models.GroupMember.status == "active")
        .group_by(models.GroupMember.group_id)
    ).all()
    member_counts = {r[0]: r[1] for r in count_rows}

    # My memberships for these groups
    my_memberships = {m.group_id: m for m in pending}

    result = []
    for m in pending:
        g = groups_map.get(m.group_id)
        if not g:
            continue
        inviter = inviters_map.get(m.invited_by) if m.invited_by else None
        book = books_map.get(g.current_book_id) if g.current_book_id else None
        creator = creators_map.get(g.created_by)
        membership = my_memberships.get(g.id)
        result.append({
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
            "member_count": member_counts.get(g.id, 0),
            "membership_status": membership.status if membership else None,
            "membership_role": membership.role if membership else None,
            "created_at": g.created_at.isoformat(),
            "invited_by_name": inviter.name if inviter else None,
        })
    return result


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
    if not memberships:
        return []
    group_ids = [m.group_id for m in memberships]
    membership_map = {m.group_id: m for m in memberships}
    all_groups = db.exec(select(models.ReadingGroup).where(models.ReadingGroup.id.in_(group_ids))).all()

    # Batch fetch books + creators + member counts
    book_ids = list({g.current_book_id for g in all_groups if g.current_book_id})
    books_map = {b.id: b for b in db.exec(select(models.Book).where(models.Book.id.in_(book_ids))).all()} if book_ids else {}
    creator_ids = list({g.created_by for g in all_groups})
    creators_map = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(creator_ids))).all()} if creator_ids else {}
    count_rows = db.exec(
        select(models.GroupMember.group_id, func.count(models.GroupMember.id))
        .where(models.GroupMember.group_id.in_(group_ids), models.GroupMember.status == "active")
        .group_by(models.GroupMember.group_id)
    ).all()
    member_counts = {r[0]: r[1] for r in count_rows}

    result = []
    for g in all_groups:
        membership = membership_map.get(g.id)
        book = books_map.get(g.current_book_id) if g.current_book_id else None
        creator = creators_map.get(g.created_by)
        result.append({
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
            "member_count": member_counts.get(g.id, 0),
            "membership_status": membership.status if membership else None,
            "membership_role": membership.role if membership else None,
            "created_at": g.created_at.isoformat(),
        })
    return result


@router.get("/discover")
def discover_groups(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    """Public groups the user has not joined, optionally filtered by name."""
    groups = db.exec(select(models.ReadingGroup).where(models.ReadingGroup.is_private == False)).all()
    if not groups:
        return []

    group_ids = [g.id for g in groups]

    # Batch fetch my active memberships so we can filter without per-group queries
    my_active_group_ids = {
        m.group_id for m in db.exec(
            select(models.GroupMember).where(
                models.GroupMember.group_id.in_(group_ids),
                models.GroupMember.user_id == me.id,
                models.GroupMember.status == "active",
            )
        ).all()
    }

    # Filter: name/description match + not already an active member
    visible = []
    for g in groups:
        if g.id in my_active_group_ids:
            continue
        if q and q.lower() not in g.name.lower() and (not g.description or q.lower() not in g.description.lower()):
            continue
        visible.append(g)

    if not visible:
        return []

    visible_ids = [g.id for g in visible]

    # Batch fetch books + creators + member counts
    book_ids = list({g.current_book_id for g in visible if g.current_book_id})
    books_map = {b.id: b for b in db.exec(select(models.Book).where(models.Book.id.in_(book_ids))).all()} if book_ids else {}
    creator_ids = list({g.created_by for g in visible})
    creators_map = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(creator_ids))).all()} if creator_ids else {}
    count_rows = db.exec(
        select(models.GroupMember.group_id, func.count(models.GroupMember.id))
        .where(models.GroupMember.group_id.in_(visible_ids), models.GroupMember.status == "active")
        .group_by(models.GroupMember.group_id)
    ).all()
    member_counts = {r[0]: r[1] for r in count_rows}

    # My non-active memberships (pending/invited) for these groups
    my_memberships = {m.group_id: m for m in db.exec(
        select(models.GroupMember).where(
            models.GroupMember.group_id.in_(visible_ids),
            models.GroupMember.user_id == me.id,
        )
    ).all()}

    result = []
    for g in visible:
        book = books_map.get(g.current_book_id) if g.current_book_id else None
        creator = creators_map.get(g.created_by)
        membership = my_memberships.get(g.id)
        result.append({
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
            "member_count": member_counts.get(g.id, 0),
            "membership_status": membership.status if membership else None,
            "membership_role": membership.role if membership else None,
            "created_at": g.created_at.isoformat(),
        })
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
    if member_status == "active":
        fire_group_activity(db, group_id, me.id, "member_joined")
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
    if not members:
        return []
    user_ids = [m.user_id for m in members]
    users_map = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(user_ids))).all()}
    result = []
    for m in members:
        u = users_map.get(m.user_id)
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
            models.GroupMember.invited_by == None,  # self-join requests only; curator invites are accepted by the invitee
        )
    ).all()
    if not pending:
        return []
    user_ids = [m.user_id for m in pending]
    users_map = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(user_ids))).all()}
    result = []
    for m in pending:
        u = users_map.get(m.user_id)
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
    fire_group_activity(db, group_id, me.id, "member_joined")
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
    if not posts:
        return []
    user_ids = list({p.user_id for p in posts})
    users_map = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(user_ids))).all()}
    ub_ids = [p.userbook_id for p in posts if p.userbook_id]
    ubs_map = {ub.id: ub for ub in db.exec(select(models.UserBook).where(models.UserBook.id.in_(ub_ids))).all()} if ub_ids else {}
    bk_ids = list({ub.book_id for ub in ubs_map.values() if ub.book_id})
    books_map = {b.id: b for b in db.exec(select(models.Book).where(models.Book.id.in_(bk_ids))).all()} if bk_ids else {}
    result = []
    for p in posts:
        user = users_map.get(p.user_id)
        book = None
        if p.userbook_id:
            ub = ubs_map.get(p.userbook_id)
            if ub:
                book = books_map.get(ub.book_id)
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

    if not members:
        return []
    member_ids = [m.user_id for m in members]

    # Batch: user details
    users_map = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(member_ids))).all()}

    # Batch: books finished per user
    ub_q = select(models.UserBook.user_id, func.count(models.UserBook.id)).where(
        models.UserBook.user_id.in_(member_ids),
        models.UserBook.status == "finished",
    )
    if since:
        ub_q = ub_q.where(models.UserBook.updated_at >= since)
    finished_map = {r[0]: r[1] for r in db.exec(ub_q.group_by(models.UserBook.user_id)).all()}

    # Batch: pages read per user from activity
    ra_q = select(models.ReadingActivity.user_id, func.sum(models.ReadingActivity.pages_read)).where(
        models.ReadingActivity.user_id.in_(member_ids),
    )
    if since:
        ra_q = ra_q.where(models.ReadingActivity.date >= since)
    pages_map = {r[0]: r[1] or 0 for r in db.exec(ra_q.group_by(models.ReadingActivity.user_id)).all()}

    # Batch: currently reading book per user (one per user)
    reading_ubs = db.exec(
        select(models.UserBook).where(
            models.UserBook.user_id.in_(member_ids),
            models.UserBook.status == "reading",
        )
    ).all()
    # Keep only most-recently-updated per user
    reading_map: dict = {}
    for ub in reading_ubs:
        if ub.user_id not in reading_map or (ub.updated_at or 0) > (reading_map[ub.user_id].updated_at or 0):
            reading_map[ub.user_id] = ub
    reading_book_ids = [ub.book_id for ub in reading_map.values() if ub.book_id]
    reading_books = {b.id: b for b in db.exec(select(models.Book).where(models.Book.id.in_(reading_book_ids))).all()} if reading_book_ids else {}

    rows = []
    for m in members:
        user = users_map.get(m.user_id)
        if not user:
            continue
        cur_ub = reading_map.get(m.user_id)
        cur_book = reading_books.get(cur_ub.book_id) if cur_ub and cur_ub.book_id else None
        rows.append({
            "user_id": user.id,
            "name": user.name,
            "username": user.username,
            "profile_picture": getattr(user, "profile_picture", None),
            "books_finished": finished_map.get(m.user_id, 0),
            "pages_read": int(pages_map.get(m.user_id, 0)),
            "current_book": cur_book.title if cur_book else None,
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

    if body.book_id:
        book = db.get(models.Book, body.book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
    elif body.title:
        # Find or create from Google Books data
        book = None
        if body.isbn:
            book = db.exec(select(models.Book).where(models.Book.isbn == body.isbn)).first()
        if not book and body.google_books_id:
            book = db.exec(select(models.Book).where(models.Book.google_books_id == body.google_books_id)).first()
        if not book:
            from datetime import datetime as _dt
            book = models.Book(
                title=body.title,
                author=body.author or "Unknown",
                isbn=body.isbn,
                cover_url=body.cover_url,
                description=body.description,
                total_pages=body.total_pages,
                google_books_id=body.google_books_id,
                created_at=_dt.utcnow(),
            )
            db.add(book)
            db.commit()
            db.refresh(book)
    else:
        raise HTTPException(status_code=400, detail="book_id or book title required")

    g.current_book_id = book.id
    db.add(g)
    db.commit()
    fire_group_activity(db, group_id, me.id, "group_book_changed", {"book_title": book.title})
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


# ─── Group Activity Feed ──────────────────────────────────────────────────────

@router.get("/{group_id}/activity")
def get_group_activity(
    group_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    """Return the activity feed for a group (most recent first)."""
    g = _group_or_404(db, group_id)
    if g.is_private and not _is_member(db, group_id, me.id):
        raise HTTPException(status_code=403, detail="Members only")

    events = db.exec(
        select(models.GroupActivity)
        .where(models.GroupActivity.group_id == group_id)
        .order_by(models.GroupActivity.created_at.desc())
        .limit(limit)
    ).all()

    import json as _json
    if not events:
        return []
    ev_user_ids = list({ev.user_id for ev in events})
    ev_users_map = {u.id: u for u in db.exec(select(models.User).where(models.User.id.in_(ev_user_ids))).all()}
    result = []
    for ev in events:
        user = ev_users_map.get(ev.user_id)
        payload = _json.loads(ev.payload) if ev.payload else {}
        result.append({
            "id": ev.id,
            "event_type": ev.event_type,
            "payload": payload,
            "created_at": ev.created_at,
            "user": {
                "id": user.id,
                "name": user.name or user.username,
                "username": user.username,
                "avatar_url": getattr(user, "avatar_url", None),
            } if user else None,
        })
    return result
