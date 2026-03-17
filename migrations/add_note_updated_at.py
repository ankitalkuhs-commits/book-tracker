"""
Migration: Add updated_at column to note table.
Run once: python migrations/add_note_updated_at.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        # Check if column already exists
        try:
            conn.execute(text("SELECT updated_at FROM note LIMIT 1"))
            print("Column 'updated_at' already exists in 'note' table. Skipping.")
            return
        except Exception:
            pass

        # Add the column
        conn.execute(text("ALTER TABLE note ADD COLUMN updated_at DATETIME"))
        conn.commit()
        print("✅ Added 'updated_at' column to 'note' table.")

if __name__ == "__main__":
    migrate()
