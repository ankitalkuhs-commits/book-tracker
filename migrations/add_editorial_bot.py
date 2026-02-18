"""
Migration: Set up editorial bot user and tracking table.
Creates:
  - @TMRBot user account in the user table
  - editorial_posts table to track already-posted books (avoid duplicates)
"""

from sqlalchemy import create_engine, text
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./book_tracker.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)

BOT_EMAIL = "tmrbot@trackmyread.com"
BOT_NAME  = "TrackMyRead Bot"
BOT_USERNAME = "TMRBot"
BOT_BIO = "📚 Your daily editorial picks — trending books, bestsellers & buzzing reads."

def migrate():
    with engine.begin() as conn:

        # ── 1. Create editorial_posts tracking table ─────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS editorial_post (
                id         SERIAL PRIMARY KEY,
                nyt_isbn   VARCHAR(50)  NOT NULL UNIQUE,
                book_title VARCHAR(500) NOT NULL,
                note_id    INTEGER,
                posted_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """) if not DATABASE_URL.startswith("sqlite") else text("""
            CREATE TABLE IF NOT EXISTS editorial_post (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                nyt_isbn   TEXT NOT NULL UNIQUE,
                book_title TEXT NOT NULL,
                note_id    INTEGER,
                posted_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        print("✓ editorial_post table ready")

        # ── 2. Create or verify the @TMRBot user ─────────────────────────────
        existing = conn.execute(
            text("SELECT id FROM \"user\" WHERE email = :email" if not DATABASE_URL.startswith("sqlite")
                 else "SELECT id FROM user WHERE email = :email"),
            {"email": BOT_EMAIL}
        ).fetchone()

        if existing:
            print(f"✓ @TMRBot user already exists (id={existing[0]})")
        else:
            conn.execute(
                text("""INSERT INTO "user" (name, username, email, password_hash, bio, is_admin, created_at)
                        VALUES (:name, :username, :email, :pw, :bio, false, CURRENT_TIMESTAMP)"""
                     if not DATABASE_URL.startswith("sqlite") else
                     """INSERT INTO user (name, username, email, password_hash, bio, is_admin, created_at)
                        VALUES (:name, :username, :email, :pw, :bio, 0, CURRENT_TIMESTAMP)"""),
                {
                    "name": BOT_NAME,
                    "username": BOT_USERNAME,
                    "email": BOT_EMAIL,
                    "pw": "bot-no-login",
                    "bio": BOT_BIO,
                }
            )
            print("✓ @TMRBot user created")

    print("\n✅ Editorial bot migration complete!")
    print(f"   Bot email: {BOT_EMAIL}")
    print(f"   Bot username: @{BOT_USERNAME}")

if __name__ == "__main__":
    migrate()
