# app/notifications/scheduler.py
"""
Inactivity reminder (Sprint 4C, D-6): every 15 minutes, remind readers whose OWN clock reads
20:00–21:59, who have not been active on their local today and have not been reminded on it.
Idempotent across restarts and Render sleep: "already reminded" is the NotificationLog table.
"""
from datetime import timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, select

from ..database import engine
from .. import models, localday
from .dispatcher import fire_event
from .config import NOTIFICATION_EVENTS

scheduler = AsyncIOScheduler(timezone="UTC")

REMINDER_EVENT = "reading_streak_reminder"
WINDOW_START_HOUR, WINDOW_END_HOUR = 20, 22     # local wall clock, [start, end)


def _send_inactivity_reminders() -> None:
    """Find users inactive on their own local today, in their own 8-10 PM window, and remind them."""
    event_cfg = NOTIFICATION_EVENTS.get(REMINDER_EVENT, {})
    if not event_cfg.get("is_active", False):
        print("[scheduler] reading_streak_reminder is disabled — skipping.")
        return

    now = localday.utcnow()
    with Session(engine) as db:
        # Any push channel — expo (mobile) or web (PWA). Not filtered by token_type (unchanged).
        user_ids = db.exec(select(models.PushToken.user_id).distinct()).all()
        if not user_ids:
            return
        users = db.exec(select(models.User).where(models.User.id.in_(user_ids))).all()

        due = {}                                   # user_id -> (zone, local today)
        for user in users:
            zone = localday.zone_of(user)
            wall = localday.local_now(zone, now)
            if not (WINDOW_START_HOUR <= wall.hour < WINDOW_END_HOUR):
                continue
            today = wall.date()
            if user.last_active and localday.local_date(user.last_active, zone) >= today:
                continue                           # active on their own today
            due[user.id] = (zone, today)

        if due:
            sent_rows = db.exec(
                select(models.NotificationLog.user_id, models.NotificationLog.sent_at).where(
                    models.NotificationLog.event_type == REMINDER_EVENT,
                    models.NotificationLog.user_id.in_(list(due)),
                    models.NotificationLog.sent_at >= now - timedelta(hours=48),
                )
            ).all()
            for uid, sent_at in sent_rows:
                if uid in due and localday.local_date(sent_at, due[uid][0]) == due[uid][1]:
                    del due[uid]                   # already reminded on their local today

        recipient_ids = sorted(due)
        if not recipient_ids:
            return
        summary = fire_event(db=db, event_type=REMINDER_EVENT, actor_id=0,
                             actor_name="TrackMyRead", recipient_ids=recipient_ids)
    print(f"[scheduler] Inactivity reminders sent: {summary.get('sent', 0)} users notified.")


def start_scheduler() -> None:
    """Register jobs and start the background scheduler. Call once at app startup.

    Idempotent even before the scheduler has ever started: APScheduler's own
    `replace_existing=True` only reliably dedupes once the jobstore is running, so a
    second call (dev --reload, or a duplicate startup event) would otherwise register a
    second job. Removing any existing job by id first makes a repeat call a no-op."""
    if scheduler.get_job("inactivity_reminder"):
        scheduler.remove_job("inactivity_reminder")
    scheduler.add_job(
        _send_inactivity_reminders,
        CronTrigger(minute="0,15,30,45", timezone="UTC"),
        id="inactivity_reminder",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
        misfire_grace_time=600,
    )
    if not scheduler.running:
        scheduler.start()
    print("[scheduler] Started — inactivity reminder runs every 15 min; each reader at 20:00–22:00 their time.")


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler. Call at app shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("[scheduler] Stopped.")
