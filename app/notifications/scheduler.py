# app/notifications/scheduler.py
"""
Daily inactivity reminder scheduler.

Runs once per day at 14:30 UTC (8 PM IST).
Finds users who have not been active today and sends a reading reminder push.
"""

from datetime import date, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, select

from ..database import engine
from .. import models
from .push_mobile import send_expo_push
from .config import NOTIFICATION_EVENTS

scheduler = AsyncIOScheduler(timezone="UTC")


def _send_inactivity_reminders() -> None:
    """Find users inactive today and send them a reading reminder push."""
    event_cfg = NOTIFICATION_EVENTS.get("reading_streak_reminder", {})
    if not event_cfg.get("is_active", False):
        print("[scheduler] reading_streak_reminder is disabled — skipping.")
        return

    title: str = event_cfg["title"]
    body: str = event_cfg["body"]
    today = date.today()
    sent = 0

    with Session(engine) as db:
        # Only consider users who have at least one registered Expo push token
        user_ids = db.exec(
            select(models.PushToken.user_id)
            .where(models.PushToken.token_type == "expo")
            .distinct()
        ).all()

        for user_id in user_ids:
            user = db.get(models.User, user_id)
            if not user:
                continue

            # Skip users who were already active today
            if user.last_active and user.last_active.date() >= today:
                continue

            # Send push to all their Expo devices
            send_expo_push(
                db=db,
                user_id=user_id,
                title=title,
                body=body,
                data={"type": "streak_reminder"},
            )

            # Log to NotificationLog for in-app notification history
            log = models.NotificationLog(
                user_id=user_id,
                actor_id=None,          # system-generated, no actor
                event_type="reading_streak_reminder",
                title=title,
                body=body,
                data={"type": "streak_reminder"},
            )
            db.add(log)
            sent += 1

        db.commit()

    print(f"[scheduler] Inactivity reminders sent: {sent} users notified.")


def start_scheduler() -> None:
    """Register jobs and start the background scheduler. Call once at app startup."""
    scheduler.add_job(
        _send_inactivity_reminders,
        CronTrigger(hour=14, minute=30, timezone="UTC"),   # 14:30 UTC = 8:00 PM IST
        id="inactivity_reminder",
        replace_existing=True,
        misfire_grace_time=3600,   # if server was down, still run if missed within 1 hr
    )
    if not scheduler.running:
        scheduler.start()
    print("[scheduler] Started — inactivity reminder fires daily at 14:30 UTC (8 PM IST).")


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler. Call at app shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("[scheduler] Stopped.")
