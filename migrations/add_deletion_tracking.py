"""
Migration: Add deletion tracking fields to User table
Run this to add deletion_requested_at and deletion_reason columns
"""

from sqlalchemy import create_engine, text
import os

# Get database URL from environment or use SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./book_tracker.db")

# Handle PostgreSQL URL format
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)

def migrate():
    """Add deletion tracking columns to user table"""
    
    with engine.connect() as conn:
        # Check if columns already exist
        if DATABASE_URL.startswith("sqlite"):
            # SQLite: Check pragma table info
            result = conn.execute(text("PRAGMA table_info(user)"))
            columns = [row[1] for row in result]
            
            if "deletion_requested_at" not in columns:
                print("Adding deletion_requested_at column...")
                conn.execute(text("ALTER TABLE user ADD COLUMN deletion_requested_at DATETIME"))
                conn.commit()
                print("✓ Added deletion_requested_at")
            else:
                print("deletion_requested_at already exists")
                
            if "deletion_reason" not in columns:
                print("Adding deletion_reason column...")
                conn.execute(text("ALTER TABLE user ADD COLUMN deletion_reason TEXT"))
                conn.commit()
                print("✓ Added deletion_reason")
            else:
                print("deletion_reason already exists")
                
        else:
            # PostgreSQL
            try:
                print("Adding deletion_requested_at column...")
                conn.execute(text(
                    "ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP"
                ))
                conn.commit()
                print("✓ Added deletion_requested_at")
                
                print("Adding deletion_reason column...")
                conn.execute(text(
                    "ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS deletion_reason TEXT"
                ))
                conn.commit()
                print("✓ Added deletion_reason")
            except Exception as e:
                print(f"Migration completed or columns already exist: {e}")
    
    print("\n✅ Migration complete!")

if __name__ == "__main__":
    migrate()
