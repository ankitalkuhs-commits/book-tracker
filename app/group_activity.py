# app/group_activity.py
"""
Helper for writing and reading GroupActivity events.

Usage:
    from app.group_activity import fire_group_activity, fire_group_activity_for_user

Event types:
    member_joined       — user joined a group
    book_started        — user started reading a book
    book_finished       — user finished a book
    milestone_reached   — user hit 25 / 50 / 75 % of a book
    note_posted         — user posted a note on a book
    group_book_changed  — curator changed the group's current book
"""

import json
from datetime import datetime
from sqlalchemy.orm import Session
from sqlmodel import select
from .models import GroupActivity, GroupMember


def fire_group_activity(
    db: Session,
    group_id: int,
    user_id: int,
    event_type: str,
    payload: dict | None = None,
):
    """Insert one GroupActivity row."""
    event = GroupActivity(
        group_id=group_id,
        user_id=user_id,
        event_type=event_type,
        payload=json.dumps(payload or {}),
        created_at=datetime.utcnow(),
    )
    db.add(event)
    db.commit()


def fire_group_activity_for_user(
    db: Session,
    user_id: int,
    event_type: str,
    payload: dict | None = None,
):
    """
    Fire a GroupActivity event for every active group the user belongs to.
    Used for book_started, book_finished, milestone_reached, note_posted —
    events that aren't scoped to a specific group but should appear in all
    groups the user is a member of.
    """
    memberships = db.exec(
        select(GroupMember).where(
            GroupMember.user_id == user_id,
            GroupMember.status == "active",
        )
    ).all()

    for m in memberships:
        event = GroupActivity(
            group_id=m.group_id,
            user_id=user_id,
            event_type=event_type,
            payload=json.dumps(payload or {}),
            created_at=datetime.utcnow(),
        )
        db.add(event)

    if memberships:
        db.commit()
