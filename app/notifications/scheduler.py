# app/notifications/scheduler.py
"""
Daily inactivity reminder scheduler.

Runs once per day at 14:30 UTC (8 PM IST).
Finds users who have not been active today and sends a reading reminder push.
"""

import os
from datetime import date, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, select

from ..database import engine
from .. import models
from .dispatcher import fire_event
from .config import NOTIFICATION_EVENTS

scheduler = AsyncIOScheduler(timezone="UTC")


def _send_inactivity_reminders() -> None:
    """Find users inactive today and send them a reading reminder push."""
    event_cfg = NOTIFICATION_EVENTS.get("reading_streak_reminder", {})
    if not event_cfg.get("is_active", False):
        print("[scheduler] reading_streak_reminder is disabled — skipping.")
        return

    today = date.today()

    with Session(engine) as db:
        # Any push channel — expo (mobile) or web (PWA). Not filtered by token_type:
        # filtering it was the bug (web subscribers never got the reminder).
        user_ids = db.exec(select(models.PushToken.user_id).distinct()).all()

        recipient_ids = []
        for user_id in user_ids:
            user = db.get(models.User, user_id)
            if not user:
                continue
            if user.last_active and user.last_active.date() >= today:
                continue          # already read today — nothing to remind them about
            recipient_ids.append(user_id)

        summary = fire_event(
            db=db,
            event_type="reading_streak_reminder",
            actor_id=0,
            actor_name="TrackMyRead",
            recipient_ids=recipient_ids,
        )

    print(f"[scheduler] Inactivity reminders sent: {summary.get('sent', 0)} users notified.")


def start_scheduler() -> None:
    """Register jobs and start the background scheduler. Call once at app startup.

    RUN_SCHEDULER=0 stops this service scheduling anything. During the region move two services
    run against one database, and exactly one may send the reminders — otherwise every reader
    gets each reminder twice (F-68).
    """
    if (os.getenv("RUN_SCHEDULER", "1") or "").strip().lower() in ("0", "false", "no", "off"):
        print("[scheduler] Not started: RUN_SCHEDULER is off for this service.")
        return
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
