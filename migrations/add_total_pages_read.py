"""
Migration: Add total_pages_read column to user table
"""
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy import text

def upgrade(engine):
    with engine.connect() as conn:
        # SQLite and PostgreSQL compatible
        conn.execute(text("""
            ALTER TABLE user ADD COLUMN total_pages_read INTEGER NOT NULL DEFAULT 0;
        """))
        print("Added total_pages_read column to user table.")

def downgrade(engine):
    # SQLite does not support DROP COLUMN directly; would require table recreation
    print("Downgrade not supported for this migration.")

if __name__ == "__main__":
    import os
    db_url = os.getenv("DATABASE_URL", "sqlite:///book_tracker.db")
    engine = create_engine(db_url)
    upgrade(engine)
