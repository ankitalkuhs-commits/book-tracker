"""
Migration: Add reading_activity table for tracking daily reading progress.
Run this to create the table for charts/analytics.
"""

import sqlite3
from datetime import datetime

DB_PATH = "book_tracker.db"

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create reading_activity table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reading_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            userbook_id INTEGER NOT NULL,
            date TIMESTAMP NOT NULL,
            pages_read INTEGER DEFAULT 0,
            current_page INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES user(id),
            FOREIGN KEY (userbook_id) REFERENCES userbook(id)
        )
    """)
    
    # Create index for faster queries
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_reading_activity_user_date 
        ON reading_activity(user_id, date)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_reading_activity_userbook 
        ON reading_activity(userbook_id)
    """)
    
    conn.commit()
    conn.close()
    print("✅ reading_activity table created successfully!")

if __name__ == "__main__":
    migrate()
