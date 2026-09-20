"""Tests for app/notifications/scheduler.py — the reader's-own-day inactivity reminder (4C, D-6).

Calls _send_inactivity_reminders() directly. Never starts APScheduler, never
touches CronTrigger / start_scheduler / stop_scheduler. Every case uses freeze_at
(Sprint 4C, F-62): the scheduler's clock is app.localday.utcnow(), the same seam
tests/conftest.py patches for every other 4C path.
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


def _inactive_user(db, email, token_type="expo", token="ExponentPushToken[sched-x]",
                    zone=None, last_active=None, frozen=None):
    u = _make_user(db, email=email)
    if zone:
        u.timezone = zone
    u.last_active = last_active if last_active is not None else (frozen - timedelta(days=2) if frozen else datetime.utcnow() - timedelta(days=2))
    db.add(u)
    db.add(models.PushToken(user_id=u.id, token=token, token_type=token_type))
    db.commit()
    db.expire_all()
    return u


# ── The 8 existing tests (N9): under freeze_at at the pinned date's 14:30 UTC ────────────

def test_inactivity_reminder_notifies_expo_user(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-09-18T14:30:00")
    sent = scheduler_env
    u = _inactive_user(db, "sched_expo@example.com", token_type="expo", frozen=frozen)
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


def test_inactivity_reminder_notifies_web_only_user(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-09-18T14:30:00")
    u = _inactive_user(
        db, "sched_web@example.com", token_type="web",
        token='{"endpoint": "https://fcm.googleapis.com/fcm/send/sched-web", "keys": {"p256dh": "k", "auth": "a"}}',
        frozen=frozen,
    )
    sched._send_inactivity_reminders()
    rows = _reminder_rows(db, u.id)
    assert len(rows) == 1
    assert rows[0].actor_id == 0


def test_inactivity_reminder_skips_user_active_today(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-09-18T14:30:00")
    u = _make_user(db, email="sched_active@example.com")
    u.last_active = frozen - timedelta(hours=1)
    db.add(u)
    db.add(models.PushToken(user_id=u.id, token="ExponentPushToken[sched-active]", token_type="expo"))
    db.commit()
    db.expire_all()
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u.id) == []


def test_inactivity_reminder_respects_user_preference(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-09-18T14:30:00")
    sent = scheduler_env
    u = _inactive_user(db, "sched_optout@example.com", frozen=frozen)
    u.notification_prefs = json.dumps({"reading_streak_reminder": False})
    db.add(u)
    db.commit()
    db.expire_all()

    other = _inactive_user(db, "sched_optout_other_key@example.com", token="ExponentPushToken[sched-other-key]", frozen=frozen)
    other.notification_prefs = json.dumps({"new_follower": False})
    db.add(other)
    db.commit()
    db.expire_all()

    sched._send_inactivity_reminders()

    assert _reminder_rows(db, u.id) == []
    assert u.id not in sent
    assert len(_reminder_rows(db, other.id)) == 1


def test_inactivity_reminder_daily_cap_prevents_second_send(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-09-18T14:30:00")
    u = _inactive_user(db, "sched_cap@example.com", frozen=frozen)
    sched._send_inactivity_reminders()
    sched._send_inactivity_reminders()
    rows = _reminder_rows(db, u.id)
    assert len(rows) == 1


def test_inactivity_reminder_skips_user_without_token(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-09-18T14:30:00")
    u = _make_user(db, email="sched_notoken@example.com")
    u.last_active = frozen - timedelta(days=2)
    db.add(u)
    db.commit()
    db.expire_all()
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u.id) == []


def test_inactivity_reminder_noop_when_event_disabled(db, scheduler_env, monkeypatch, freeze_at):
    frozen = freeze_at("2026-09-18T14:30:00")
    sent = scheduler_env
    from app.notifications.config import NOTIFICATION_EVENTS
    cfg = NOTIFICATION_EVENTS["reading_streak_reminder"]
    monkeypatch.setitem(cfg, "is_active", False)
    u = _inactive_user(db, "sched_disabled@example.com", frozen=frozen)
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u.id) == []
    assert sent == []


def test_inactivity_reminder_does_not_start_apscheduler(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-09-18T14:30:00")
    u = _inactive_user(db, "sched_noaps@example.com", frozen=frozen)
    sched._send_inactivity_reminders()
    assert sched.scheduler.running is False


# ── New 4C cases: T-4C-N1..N12 ───────────────────────────────────────────────

def test_reminder_never_reported_reader_at_1430_utc(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-09-18T14:15:00")
    u1 = _inactive_user(db, "sched_n1_u1@example.com", frozen=frozen)
    u3 = _inactive_user(db, "sched_n1_u3@example.com", token="ExponentPushToken[n1-u3]", zone="Mars/Olympus", frozen=frozen)
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u1.id) == []

    freeze_at("2026-09-18T14:30:00")
    sched._send_inactivity_reminders()
    assert len(_reminder_rows(db, u1.id)) == 1
    assert len(_reminder_rows(db, u3.id)) == 1

    frozen2 = freeze_at("2026-09-18T16:30:00")
    u2 = _inactive_user(db, "sched_n1_u2@example.com", token="ExponentPushToken[n1-u2]", frozen=frozen2)
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u2.id) == []


def test_reminder_kathmandu_offset(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-09-18T14:00:00")
    a = _inactive_user(db, "sched_n2_a@example.com", zone="Asia/Kathmandu", frozen=frozen)
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, a.id) == []

    freeze_at("2026-09-18T14:15:00")
    sched._send_inactivity_reminders()
    assert len(_reminder_rows(db, a.id)) == 1

    frozen_b = freeze_at("2026-09-18T16:00:00")
    b = _inactive_user(db, "sched_n2_b@example.com", token="ExponentPushToken[n2-b]", zone="Asia/Kathmandu", frozen=frozen_b)
    sched._send_inactivity_reminders()
    assert len(_reminder_rows(db, b.id)) == 1

    frozen_c = freeze_at("2026-09-18T16:15:00")
    c = _inactive_user(db, "sched_n2_c@example.com", token="ExponentPushToken[n2-c]", zone="Asia/Kathmandu", frozen=frozen_c)
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, c.id) == []


def test_reminder_new_york_evening(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-09-18T14:30:00")
    u = _inactive_user(db, "sched_n3@example.com", zone="America/New_York", frozen=frozen)
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u.id) == []

    freeze_at("2026-09-19T00:00:00")
    sched._send_inactivity_reminders()
    assert len(_reminder_rows(db, u.id)) == 1


def test_reminder_f62_regression_active_after_ist_midnight(db, scheduler_env, monkeypatch, freeze_at):
    frozen0 = datetime(2026, 9, 17, 19, 0)
    u = _make_user(db, email="sched_n4@example.com")
    u.timezone = "Asia/Kolkata"
    u.last_active = frozen0   # 00:30 IST on 09-18
    db.add(u)
    db.add(models.PushToken(user_id=u.id, token="ExponentPushToken[n4]", token_type="expo"))
    db.commit()
    db.expire_all()

    recipients = []
    real_fire_event = sched.fire_event

    def _spy(*args, **kwargs):
        recipients.extend(kwargs.get("recipient_ids", []))
        return real_fire_event(*args, **kwargs)

    monkeypatch.setattr(sched, "fire_event", _spy)
    freeze_at("2026-09-18T14:30:00")
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u.id) == []
    assert u.id not in recipients


def test_reminder_catch_up_and_once_per_local_day(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-09-18T15:45:00")
    u = _inactive_user(db, "sched_n5@example.com", zone="Asia/Kolkata", frozen=frozen)
    sched._send_inactivity_reminders()
    freeze_at("2026-09-18T16:00:00")
    sched._send_inactivity_reminders()
    freeze_at("2026-09-18T16:15:00")
    sched._send_inactivity_reminders()
    rows = _reminder_rows(db, u.id)
    assert len(rows) == 1
    assert rows[0].sent_at == datetime(2026, 9, 18, 15, 45)

    freeze_at("2026-09-19T14:30:00")
    sched._send_inactivity_reminders()
    assert len(_reminder_rows(db, u.id)) == 2


def test_reminder_dst_fall_back_new_york(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-11-02T00:00:00")
    u = _inactive_user(db, "sched_n6@example.com", zone="America/New_York", frozen=frozen)
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u.id) == []
    freeze_at("2026-11-02T01:00:00")
    sched._send_inactivity_reminders()
    assert len(_reminder_rows(db, u.id)) == 1


def test_reminder_dst_spring_forward_new_york(db, scheduler_env, freeze_at):
    frozen = freeze_at("2026-03-08T23:45:00")
    u = _inactive_user(db, "sched_n12@example.com", zone="America/New_York", frozen=frozen)
    sched._send_inactivity_reminders()
    assert _reminder_rows(db, u.id) == []
    freeze_at("2026-03-09T00:00:00")
    sched._send_inactivity_reminders()
    assert len(_reminder_rows(db, u.id)) == 1


def test_reminder_query_shape_no_n_plus_one(db, scheduler_env, freeze_at, stmt_counter):
    frozen = freeze_at("2026-09-18T14:30:00")
    users = [
        _inactive_user(db, f"sched_n7_{i}@example.com", token=f"ExponentPushToken[n7-{i}]",
                        zone="Asia/Kolkata", frozen=frozen)
        for i in range(20)
    ]
    recipients = []
    real_fire_event = sched.fire_event
    import app.notifications.scheduler as sched_mod

    def _spy(*args, **kwargs):
        recipients.extend(kwargs.get("recipient_ids", []))
        return {"sent": 0}

    from unittest.mock import patch
    with patch.object(sched_mod, "fire_event", _spy):
        stmt_counter.reset()
        sched._send_inactivity_reminders()
        assert stmt_counter.selects == 3
    assert set(u.id for u in users) <= set(recipients)

    extra = _inactive_user(db, "sched_n7_extra@example.com", token="ExponentPushToken[n7-extra]",
                            zone="Asia/Kolkata", frozen=frozen)
    with patch.object(sched_mod, "fire_event", _spy):
        stmt_counter.reset()
        sched._send_inactivity_reminders()
        assert stmt_counter.selects == 3


def test_cap_book_completed_uses_recipient_local_day(db, scheduler_env, freeze_at):
    from app.notifications.dispatcher import fire_event
    a = _make_user(db, email="sched_n8_a@example.com")
    b = _make_user(db, email="sched_n8_b@example.com")
    b.timezone = "Asia/Kolkata"
    db.add(b)
    db.commit()
    c = _make_user(db, email="sched_n8_c@example.com")
    c.timezone = "Asia/Kolkata"
    db.add(c)
    db.commit()

    freeze_at("2026-09-18T17:30:00")
    fire_event(db=db, event_type="book_completed", actor_id=a.id, actor_name="A",
               recipient_ids=[b.id], extra={"book_title": "x"})
    freeze_at("2026-09-18T19:00:00")
    fire_event(db=db, event_type="book_completed", actor_id=a.id, actor_name="A",
               recipient_ids=[b.id], extra={"book_title": "x"})
    b_rows = db.exec(select(models.NotificationLog).where(
        models.NotificationLog.user_id == b.id, models.NotificationLog.event_type == "book_completed")).all()
    assert len(b_rows) == 2

    freeze_at("2026-09-18T04:30:00")
    fire_event(db=db, event_type="book_completed", actor_id=a.id, actor_name="A",
               recipient_ids=[c.id], extra={"book_title": "x"})
    freeze_at("2026-09-18T12:30:00")
    fire_event(db=db, event_type="book_completed", actor_id=a.id, actor_name="A",
               recipient_ids=[c.id], extra={"book_title": "x"})
    c_rows = db.exec(select(models.NotificationLog).where(
        models.NotificationLog.user_id == c.id, models.NotificationLog.event_type == "book_completed")).all()
    assert len(c_rows) == 1


def test_cap_uses_recipients_zone_not_actors(db, scheduler_env, freeze_at):
    from app.notifications.dispatcher import fire_event
    a = _make_user(db, email="sched_n8b_a@example.com")
    a.timezone = "America/New_York"
    db.add(a)
    d = _make_user(db, email="sched_n8b_d@example.com")
    d.timezone = "Asia/Kolkata"
    db.add(d)
    db.commit()

    freeze_at("2026-09-18T17:30:00")
    fire_event(db=db, event_type="book_completed", actor_id=a.id, actor_name="A",
               recipient_ids=[d.id], extra={"book_title": "x"})
    freeze_at("2026-09-18T19:00:00")
    fire_event(db=db, event_type="book_completed", actor_id=a.id, actor_name="A",
               recipient_ids=[d.id], extra={"book_title": "x"})
    d_rows = db.exec(select(models.NotificationLog).where(
        models.NotificationLog.user_id == d.id, models.NotificationLog.event_type == "book_completed")).all()
    assert len(d_rows) == 2


def test_job_registered_every_15_minutes(monkeypatch):
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    fresh = AsyncIOScheduler(timezone="UTC")
    monkeypatch.setattr(sched, "scheduler", fresh)
    monkeypatch.setattr(fresh, "start", lambda *a, **k: None)
    sched.start_scheduler()
    sched.start_scheduler()
    jobs = fresh.get_jobs()
    assert len(jobs) == 1
    job = jobs[0]
    assert job.id == "inactivity_reminder"
    assert "minute='0,15,30,45'" in str(job.trigger)
    assert str(job.trigger.timezone) == "UTC"
    assert job.coalesce is True
    assert job.max_instances == 1
    assert job.misfire_grace_time == 600
    assert fresh.running is False


def test_restart_does_not_double_send(db, scheduler_env, freeze_at, monkeypatch):
    import importlib
    frozen = freeze_at("2026-09-18T14:30:00")
    u = _inactive_user(db, "sched_n11@example.com", zone="Asia/Kolkata", frozen=frozen)
    sched._send_inactivity_reminders()
    assert len(_reminder_rows(db, u.id)) == 1

    importlib.reload(sched)
    monkeypatch.setattr(sched, "engine", test_engine)
    monkeypatch.setattr(
        "app.notifications.dispatcher.send_expo_push",
        lambda db, user_id, title, body, data: None,
    )
    monkeypatch.setattr(
        "app.notifications.dispatcher.send_web_push",
        lambda db, user_id, title, body, data: None,
    )
    freeze_at("2026-09-18T15:00:00")
    recipients = []
    real_fire_event = sched.fire_event

    def _spy(*args, **kwargs):
        recipients.extend(kwargs.get("recipient_ids", []))
        return real_fire_event(*args, **kwargs)

    monkeypatch.setattr(sched, "fire_event", _spy)
    sched._send_inactivity_reminders()
    assert len(_reminder_rows(db, u.id)) == 1
    assert u.id not in recipients

    importlib.reload(sched)
