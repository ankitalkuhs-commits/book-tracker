# app/notifications/router.py
"""
Notification endpoints:
  - PWA web push subscription management
  - Notification history + unread count for in-app badge
  - Admin: list/toggle event configs, test-fire any event
"""
import json
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..deps import get_db, get_current_user, get_admin_user
from .. import models
from .config import NOTIFICATION_EVENTS
from .dispatcher import fire_event

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── PWA: subscribe / unsubscribe ──────────────────────────────────────────────

class WebPushSubscription(BaseModel):
    subscription: dict       # browser PushSubscription JSON: {endpoint, keys: {p256dh, auth}}
    device_info: Optional[str] = None   # e.g. "Chrome/Windows", "Firefox/macOS"


@router.get("/vapid-public-key")
def get_vapid_public_key():
    """
    Return the VAPID public key so the frontend can subscribe to web push.
    Frontend usage:
        const { public_key } = await fetch('/notifications/vapid-public-key').then(r => r.json())
        const sub = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: public_key
        })
        await fetch('/notifications/web-subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) })
    """
    key = os.getenv("VAPID_PUBLIC_KEY")
    if not key:
        raise HTTPException(
            status_code=503,
            detail="VAPID_PUBLIC_KEY not configured on server — PWA push not available yet"
        )
    return {"public_key": key}


@router.post("/web-subscribe", status_code=status.HTTP_200_OK)
def web_subscribe(
    payload: WebPushSubscription,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register a PWA (browser) push subscription for the current user."""
    token_str = json.dumps(payload.subscription)

    # Remove all existing web tokens for this user (replace, don't duplicate)
    existing_tokens = db.exec(
        select(models.PushToken).where(
            models.PushToken.user_id == current_user.id,
            models.PushToken.token_type == "web",
        )
    ).all()
    for t in existing_tokens:
        db.delete(t)

    db.add(models.PushToken(
        user_id=current_user.id,
        token=token_str,
        token_type="web",
        device_info=payload.device_info,
    ))
    db.commit()
    print(f"[Push:Web] PWA subscription registered for user {current_user.id}")

    return {"message": "Web push subscription registered"}


@router.delete("/web-unsubscribe", status_code=status.HTTP_200_OK)
def web_unsubscribe(
    payload: WebPushSubscription,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a PWA push subscription (called when user denies permission or logs out)."""
    token_str = json.dumps(payload.subscription)

    existing = db.exec(
        select(models.PushToken).where(
            models.PushToken.user_id == current_user.id,
            models.PushToken.token == token_str,
            models.PushToken.token_type == "web",
        )
    ).first()

    if existing:
        db.delete(existing)
        db.commit()

    return {"message": "Web push subscription removed"}


# ── Notification history (for in-app notification inbox) ──────────────────────

@router.get("/unread-count")
def unread_count(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns number of unread notifications. Use for the bell badge in the app."""
    count = db.exec(
        select(models.NotificationLog).where(
            models.NotificationLog.user_id == current_user.id,
            models.NotificationLog.is_read == False,
        )
    ).all()
    return {"unread": len(count)}


@router.get("/history")
def notification_history(
    limit: int = 50,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the 50 most recent notifications for the current user."""
    logs = db.exec(
        select(models.NotificationLog)
        .where(models.NotificationLog.user_id == current_user.id)
        .order_by(models.NotificationLog.sent_at.desc())
        .limit(limit)
    ).all()

    return [
        {
            "id": log.id,
            "event_type": log.event_type,
            "title": log.title,
            "body": log.body,
            "data": log.data,
            "is_read": log.is_read,
            "sent_at": log.sent_at.isoformat() + "Z",
        }
        for log in logs
    ]


@router.post("/mark-read", status_code=status.HTTP_200_OK)
def mark_all_read(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all notifications as read (call when user opens notification inbox)."""
    unread = db.exec(
        select(models.NotificationLog).where(
            models.NotificationLog.user_id == current_user.id,
            models.NotificationLog.is_read == False,
        )
    ).all()

    for log in unread:
        log.is_read = True
        db.add(log)

    db.commit()
    return {"message": f"Marked {len(unread)} notifications as read"}


# ── Per-user notification preferences ────────────────────────────────────────

# The preference keys exposed to users (subset of all event types)
USER_PREF_KEYS = ["new_follower", "post_liked", "post_commented", "book_completed", "reading_streak_reminder"]

class NotificationPrefs(BaseModel):
    new_follower: bool = True
    post_liked: bool = True
    post_commented: bool = True
    book_completed: bool = True          # covers book_completed + book_added
    reading_streak_reminder: bool = True


@router.get("/prefs")
def get_prefs(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the current user's notification preferences."""
    user = db.get(models.User, current_user.id)
    defaults = {k: True for k in USER_PREF_KEYS}
    if not user or not getattr(user, "notification_prefs", None):
        return defaults
    try:
        stored = json.loads(user.notification_prefs)
        return {k: stored.get(k, True) for k in USER_PREF_KEYS}
    except (json.JSONDecodeError, TypeError):
        return defaults


@router.patch("/prefs")
def update_prefs(
    prefs: NotificationPrefs,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's notification preferences."""
    user = db.get(models.User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # book_added follows the same pref as book_completed
    pref_dict = prefs.model_dump()
    pref_dict["book_added"] = pref_dict["book_completed"]

    user.notification_prefs = json.dumps(pref_dict)
    db.add(user)
    db.commit()
    return {k: pref_dict.get(k, True) for k in USER_PREF_KEYS}


# ── Admin: manage event configs ───────────────────────────────────────────────

@router.get("/admin/events")
def list_events(admin_user: models.User = Depends(get_admin_user)):
    """List all notification event types and their current config."""
    return [
        {"event_type": k, **v}
        for k, v in NOTIFICATION_EVENTS.items()
    ]


@router.patch("/admin/events/{event_type}/toggle")
def toggle_event(
    event_type: str,
    admin_user: models.User = Depends(get_admin_user),
):
    """
    Toggle a notification event type on or off — no redeploy needed.
    Use to quickly silence a noisy notification type in production.
    """
    if event_type not in NOTIFICATION_EVENTS:
        raise HTTPException(status_code=404, detail=f"Unknown event type: {event_type}")

    NOTIFICATION_EVENTS[event_type]["is_active"] = not NOTIFICATION_EVENTS[event_type]["is_active"]
    new_state = NOTIFICATION_EVENTS[event_type]["is_active"]

    print(f"[Notify:Admin] Event '{event_type}' toggled to is_active={new_state}")
    return {"event_type": event_type, "is_active": new_state}


@router.post("/admin/test/{event_type}/{user_id}")
def test_fire_event(
    event_type: str,
    user_id: int,
    dry_run: bool = False,
    admin_user: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Test-fire any notification event to a specific user.
    Use dry_run=true to preview without actually sending.
    """
    if event_type not in NOTIFICATION_EVENTS:
        raise HTTPException(status_code=404, detail=f"Unknown event type: {event_type}")

    target_user = db.get(models.User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    result = fire_event(
        db=db,
        event_type=event_type,
        actor_id=0,           # 0 = system / TrackMyRead
        actor_name="TrackMyRead",
        recipient_ids=[user_id],
        extra={"book_title": "The Hitchhiker's Guide to the Galaxy"},
        dry_run=dry_run,
    )

    return {
        "message": f"{'[DRY RUN] ' if dry_run else ''}Test event '{event_type}' fired to user {user_id}",
        **result,
    }
