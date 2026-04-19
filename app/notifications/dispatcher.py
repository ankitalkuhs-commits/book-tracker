# app/notifications/dispatcher.py
"""
Central notification dispatcher.

Single entry point for ALL notification delivery — mobile (Expo) + web (PWA).
Adding a new notification type = one entry in config.py + one fire_event() call.
Zero mobile app update required.

Usage:
    from app.notifications.dispatcher import fire_event, get_follower_ids

    follower_ids = get_follower_ids(db, current_user.id)

    fire_event(
        db=db,
        event_type="book_completed",
        actor_id=current_user.id,
        actor_name=current_user.name or current_user.username or "Someone",
        recipient_ids=follower_ids,
        extra={"book_title": book.title},
    )
"""
from datetime import datetime, date
from typing import Optional
from sqlmodel import Session, select

from .config import NOTIFICATION_EVENTS
from .push_mobile import send_expo_push
from .push_web import send_web_push


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_follower_ids(db: Session, user_id: int) -> list[int]:
    """
    Return the IDs of all users who follow `user_id`.
    Use when you want to notify someone's followers about their activity.

    Example: User completes a book → notify their followers.
        follower_ids = get_follower_ids(db, current_user.id)
    """
    from ..models import Follow  # deferred to avoid circular imports

    rows = db.exec(
        select(Follow.follower_id).where(Follow.followed_id == user_id)
    ).all()
    return list(rows)


def _check_daily_cap(
    db: Session,
    actor_id: int,
    recipient_id: int,
    event_type: str,
) -> bool:
    """
    Returns True if this notification is allowed (under daily cap).
    Returns False if this actor has already sent this event type to this recipient today.

    Purpose: prevents spam when e.g. a user adds 5 books in one day —
    their followers receive 1 notification, not 5.
    """
    from ..models import NotificationLog  # deferred to avoid circular imports

    today_start = datetime.combine(date.today(), datetime.min.time())

    existing = db.exec(
        select(NotificationLog).where(
            NotificationLog.user_id == recipient_id,
            NotificationLog.actor_id == actor_id,
            NotificationLog.event_type == event_type,
            NotificationLog.sent_at >= today_start,
        )
    ).first()

    return existing is None  # True = allowed, False = capped


def _render_template(template: str, vars: dict) -> str:
    """Fill in {placeholders} in a template string. Returns template as-is if a key is missing."""
    try:
        return template.format(**vars)
    except KeyError as e:
        print(f"[Notify] Warning: missing template variable {e} — sending with raw template")
        return template


def _user_wants_event(db: Session, user_id: int, event_type: str) -> bool:
    """
    Returns True if the user has not explicitly disabled this event type.
    Missing key = enabled (opt-out model, not opt-in).
    """
    import json
    from ..models import User
    user = db.get(User, user_id)
    if not user or not getattr(user, "notification_prefs", None):
        return True  # no prefs set = all enabled
    try:
        prefs = json.loads(user.notification_prefs)
        return prefs.get(event_type, True)
    except (json.JSONDecodeError, TypeError):
        return True


# ── Main dispatcher ───────────────────────────────────────────────────────────

def fire_event(
    db: Session,
    event_type: str,
    actor_id: int,
    actor_name: str,
    recipient_ids: list[int],
    extra: Optional[dict] = None,
    dry_run: bool = False,
) -> dict:
    """
    Fire a named notification event to a list of recipients.

    Args:
        db:            Database session
        event_type:    Key from NOTIFICATION_EVENTS config (e.g. "book_completed")
        actor_id:      User ID of who triggered the event
        actor_name:    Display name of the actor (for message templates)
        recipient_ids: List of user IDs to notify
        extra:         Additional template variables (e.g. {"book_title": "Dune"})
        dry_run:       If True, log what would be sent but don't actually send.
                       Use for testing on production before enabling.

    Returns:
        Summary dict: {"sent": N, "skipped_cap": N, "skipped_self": N, "dry_run": bool}
    """
    config = NOTIFICATION_EVENTS.get(event_type)

    if not config:
        print(f"[Notify] Unknown event type: '{event_type}' — skipping. Add it to config.py.")
        return {"sent": 0, "error": f"Unknown event type: {event_type}"}

    if not config.get("is_active", True):
        print(f"[Notify] Event '{event_type}' is disabled in config — skipping")
        return {"sent": 0, "disabled": True}

    template_vars = {"actor": actor_name, **(extra or {})}
    title = _render_template(config["title"], template_vars)
    body  = _render_template(config["body"],  template_vars)
    data  = {"type": event_type, "actor_id": actor_id, **(extra or {})}

    sent = skipped_cap = skipped_self = 0

    for user_id in recipient_ids:
        # Never notify someone about their own action
        if user_id == actor_id:
            skipped_self += 1
            continue

        # Check user's personal notification preferences
        if not _user_wants_event(db, user_id, event_type):
            print(f"[Notify] User {user_id} has disabled '{event_type}' — skipping")
            continue

        # Enforce daily cap if configured for this event type
        if config.get("daily_cap") and not _check_daily_cap(db, actor_id, user_id, event_type):
            print(f"[Notify] Daily cap hit: {event_type} from actor {actor_id} → user {user_id}")
            skipped_cap += 1
            continue

        if dry_run:
            print(f"[Notify:DryRun] Would send '{event_type}' to user {user_id}: {title!r} / {body!r}")
        else:
            # Deliver via all available channels — dispatcher handles which tokens exist
            send_expo_push(db, user_id, title, body, data)
            send_web_push(db, user_id, title, body, data)

            # Log every sent notification for history / unread count
            from ..models import NotificationLog
            db.add(NotificationLog(
                user_id=user_id,
                actor_id=actor_id,
                event_type=event_type,
                title=title,
                body=body,
                data=data,
            ))

        sent += 1

    if not dry_run and sent > 0:
        db.commit()

    summary = {
        "sent": sent,
        "skipped_self": skipped_self,
        "skipped_cap": skipped_cap,
        "dry_run": dry_run,
    }
    print(f"[Notify] {event_type}: sent={sent}, skipped_cap={skipped_cap}, dry_run={dry_run}")
    return summary
