"""
Migration: Add last_active column to user table.
Tracks when users last logged in.
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, text
from app.database import engine


def migrate():
    """Add last_active column to user table."""
    with Session(engine) as session:
        print("Adding last_active column to user table...")
        
        # Add column (PostgreSQL syntax - "user" is a reserved keyword, needs quotes)
        try:
            session.exec(text('ALTER TABLE "user" ADD COLUMN last_active TIMESTAMP'))
            session.commit()
            print("✓ Column added successfully")
        except Exception as e:
            error_msg = str(e).lower()
            if "duplicate column" in error_msg or "already exists" in error_msg:
                print("✓ Column already exists")
                session.rollback()
            else:
                print(f"❌ Error: {e}")
                raise
        
        print("\n✅ Migration complete!")


if __name__ == "__main__":
    print("Starting last_active migration...")
    migrate()
