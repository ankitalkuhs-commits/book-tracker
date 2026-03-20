"""
Migration: Add notification system
===================================
Changes:
  1. pushtoken   — add token_type TEXT (default 'expo') + device_info TEXT
  2. notificationlog — create new table for notification history

Run from project root:
    python migrations/add_notification_system.py

Safe to run multiple times (checks before altering).
"""
import os
import sys

# Ensure we can import from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, text
from app.database import engine


def column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(text(f"PRAGMA table_info({table_name})"))
    return any(row[1] == column_name for row in result)


def table_exists(conn, table_name: str) -> bool:
    result = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"),
        {"name": table_name}
    )
    return result.fetchone() is not None


def run():
    with engine.begin() as conn:
        # -- 1. pushtoken: add token_type -----------------------------------------
        if table_exists(conn, "pushtoken"):
            if not column_exists(conn, "pushtoken", "token_type"):
                print("  Adding pushtoken.token_type ...")
                conn.execute(text(
                    "ALTER TABLE pushtoken ADD COLUMN token_type TEXT NOT NULL DEFAULT 'expo'"
                ))
                conn.execute(text(
                    "UPDATE pushtoken SET token_type = 'expo' WHERE token_type IS NULL"
                ))
                print("  [OK] pushtoken.token_type added, existing rows set to 'expo'")
            else:
                print("  [SKIP] pushtoken.token_type already exists")

            # -- 2. pushtoken: add device_info ------------------------------------
            if not column_exists(conn, "pushtoken", "device_info"):
                print("  Adding pushtoken.device_info ...")
                conn.execute(text(
                    "ALTER TABLE pushtoken ADD COLUMN device_info TEXT"
                ))
                print("  [OK] pushtoken.device_info added")
            else:
                print("  [SKIP] pushtoken.device_info already exists")
        else:
            print("  [SKIP] pushtoken table not found - will be created on next app startup")

        # -- 3. Create notificationlog table --------------------------------------
        if not table_exists(conn, "notificationlog"):
            print("  Creating notificationlog table ...")
            conn.execute(text("""
                CREATE TABLE notificationlog (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id     INTEGER NOT NULL REFERENCES "user"(id),
                    actor_id    INTEGER,
                    event_type  TEXT    NOT NULL,
                    title       TEXT    NOT NULL,
                    body        TEXT    NOT NULL,
                    data        TEXT,
                    is_read     INTEGER NOT NULL DEFAULT 0,
                    sent_at     DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text(
                "CREATE INDEX ix_notificationlog_user_id ON notificationlog(user_id)"
            ))
            conn.execute(text(
                "CREATE INDEX ix_notificationlog_event_type ON notificationlog(event_type)"
            ))
            print("  [OK] notificationlog table created")
        else:
            print("  [SKIP] notificationlog already exists")

    print("\n[DONE] Migration complete.")


if __name__ == "__main__":
    print("Running migration: add_notification_system\n")
    run()
