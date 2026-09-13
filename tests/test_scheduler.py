"""Tests for app/notifications/scheduler.py — the daily inactivity reminder.

Calls _send_inactivity_reminders() directly. Never starts APScheduler, never
touches CronTrigger / start_scheduler / stop_scheduler.
"""
import json
from datetime import datetime, timedelta

import pytest
from sqlmodel import select

from app import models
import app.notifications.scheduler as sched
from tests.conftest import engine as test_engine, _make_user


@pytest.fixture()
def scheduler_env(monkeypatch):
    """Point the scheduler at the test DB and stop any real push from leaving the machine."""
    monkeypatch.setattr(sched, "engine", test_engine)
    sent = []
    monkeypatch.setattr(
        "app.notifications.dispatcher.send_expo_push",
        lambda db, user_id, title, body, data: sent.append(user_id),
    )
    monkeypatch.setattr(
        "app.notifications.dispatcher.send_web_push",
        lambda db, user_id, title, body, data: None,
    )
    return sent


def _reminder_rows(db, user_id):
    db.expire_all()
    return db.exec(
        select(models.NotificationLog)
        .where(models.NotificationLog.user_id == user_id)
        .where(models.NotificationLog.event_type == "reading_streak_reminder")
    ).all()


def _inactive_user(db, email, token_type="expo", token="ExponentPushToken[sched-x]"):
    u = _make_user(db, email=email)
    u.last_active = datetime.utcnow() - timedelta(days=2)
    db.add(u)
    db.add(models.PushToken(user_id=u.id, token=token, token_type=token_type))
    db.commit()
    db.expire_all()
    return u


def test_inactivity_reminder_notifies_expo_user(db, scheduler_env):
    sent = scheduler_env
    u = _inactive_user(db, "sched_expo@example.com", token_type="expo")
    sched._send_inactivity_reminders()
    rows = _reminder_rows(db, u.id)
    assert len(rows) == 1
    row = rows[0]
    assert row.event_type == "reading_streak_reminder"
    assert row.actor_id == 0
    assert row.user_id == u.id
    assert row.title == "Keep your streak alive! 🔥"
    assert row.body == "You haven't logged any reading today. Even 5 pages counts!"
    assert "{" not in row.title and "{" not in row.body
    assert u.id in sent


def test_inactivity_reminder_notifies_web_only_user(db, scheduler_env):
    u = _inactive_user(
        db, "sched_web@example.com", token_type="web",
        token='{"endpoint": "https://fcm.googleapis.com/fcm/send/sched-web", "keys": {"p256dh": "k", "auth": "a"}}',
    )
    sched._send_inactivity_reminders()
    rows = _reminder_rows(db, u.id)
    assert len(rows) == 1
    assert rows[0].actor_id == 0


def test_inactivity_reminder_skips_user_active_today(db, scheduler_env):
    u = _make_user(db, email="sched_active@example.com")
    u.last_active = datetime.utcnow()
    db.add(u)
    db.add(models.PushToken(user_id=u.id, token="ExponentPushToken[sched-active]", token_type="expo"))
    db.commit()
    db.expire_all()
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u.id) == []


def test_inactivity_reminder_respects_user_preference(db, scheduler_env):
    sent = scheduler_env
    u = _inactive_user(db, "sched_optout@example.com")
    u.notification_prefs = json.dumps({"reading_streak_reminder": False})
    db.add(u)
    db.commit()
    db.expire_all()

    other = _inactive_user(db, "sched_optout_other_key@example.com", token="ExponentPushToken[sched-other-key]")
    other.notification_prefs = json.dumps({"new_follower": False})
    db.add(other)
    db.commit()
    db.expire_all()

    sched._send_inactivity_reminders()

    assert _reminder_rows(db, u.id) == []
    assert u.id not in sent
    assert len(_reminder_rows(db, other.id)) == 1


def test_inactivity_reminder_daily_cap_prevents_second_send(db, scheduler_env):
    u = _inactive_user(db, "sched_cap@example.com")
    sched._send_inactivity_reminders()
    sched._send_inactivity_reminders()
    rows = _reminder_rows(db, u.id)
    assert len(rows) == 1


def test_inactivity_reminder_skips_user_without_token(db, scheduler_env):
    u = _make_user(db, email="sched_notoken@example.com")
    u.last_active = datetime.utcnow() - timedelta(days=2)
    db.add(u)
    db.commit()
    db.expire_all()
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u.id) == []


def test_inactivity_reminder_noop_when_event_disabled(db, scheduler_env, monkeypatch):
    sent = scheduler_env
    from app.notifications.config import NOTIFICATION_EVENTS
    cfg = NOTIFICATION_EVENTS["reading_streak_reminder"]
    monkeypatch.setitem(cfg, "is_active", False)
    u = _inactive_user(db, "sched_disabled@example.com")
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u.id) == []
    assert sent == []


def test_inactivity_reminder_does_not_start_apscheduler(db, scheduler_env):
    u = _inactive_user(db, "sched_noaps@example.com")
    sched._send_inactivity_reminders()
    assert sched.scheduler.running is False
