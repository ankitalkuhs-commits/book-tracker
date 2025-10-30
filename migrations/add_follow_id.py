# migrations/add_follow_id.py
import sqlite3
import shutil
import os
from datetime import datetime

DB_PATH = r"C:\Users\sonal\Documents\projects\book-tracker\book_tracker.db"
BACKUP_PATH = DB_PATH + ".bak"

print("Backing up DB to:", BACKUP_PATH)
shutil.copy2(DB_PATH, BACKUP_PATH)

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

try:
    print("Begin migration...")

    cur.execute("PRAGMA foreign_keys=OFF;")
    conn.commit()

    # create new table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS follow_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL,
      followed_id INTEGER NOT NULL,
      created_at TEXT
    );
    """)
    conn.commit()

    # copy data (only copy columns that exist in old table)
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='follow';")
    if cur.fetchone():
        cur.execute("INSERT INTO follow_new (follower_id, followed_id, created_at) SELECT follower_id, followed_id, created_at FROM follow;")
        conn.commit()
        cur.execute("DROP TABLE follow;")
        conn.commit()
    else:
        print("No existing 'follow' table found. Creating empty one.")

    cur.execute("ALTER TABLE follow_new RENAME TO follow;")
    conn.commit()

    cur.execute("CREATE INDEX IF NOT EXISTS idx_follow_follower ON follow(follower_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_follow_followed ON follow(followed_id);")
    conn.commit()

    cur.execute("PRAGMA foreign_keys=ON;")
    conn.commit()

    print("Migration complete.")
finally:
    conn.close()
