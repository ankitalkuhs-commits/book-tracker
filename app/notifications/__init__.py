# app/notifications/__init__.py
"""
Event-driven notification system for BookPulse.

Usage anywhere in the codebase:
    from app.notifications.dispatcher import fire_event

    fire_event(
        db=db,
        event_type="book_completed",
        actor_id=current_user.id,
        actor_name=current_user.name,
        recipient_ids=follower_ids,
        extra={"book_title": book.title},
    )

To add a new notification type:
  1. Add one entry to app/notifications/config.py  ← zero app update needed
  2. Call fire_event() from the relevant route
"""
