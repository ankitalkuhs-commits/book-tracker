"""
Migration: Add is_admin column to users table and set admin user.
Security: Only ankitalkuhs@gmail.com is set as admin.
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select, text
from app.database import engine
from app.models import User


def migrate():
    """Add is_admin column and set admin user."""
    with Session(engine) as session:
        print("Adding is_admin column to users table...")
        
        # Add column (PostgreSQL syntax)
        try:
            session.exec(text("ALTER TABLE user ADD COLUMN is_admin BOOLEAN DEFAULT FALSE"))
            session.commit()
            print("✓ Column added successfully")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("✓ Column already exists")
                session.rollback()
            else:
                raise
        
        # Set admin user
        print("\nSetting admin user...")
        admin_email = "ankitalkuhs@gmail.com"
        admin_user = session.exec(
            select(User).where(User.email == admin_email)
        ).first()
        
        if admin_user:
            admin_user.is_admin = True
            session.add(admin_user)
            session.commit()
            print(f"✓ Admin privileges granted to: {admin_user.name} ({admin_email})")
        else:
            print(f"⚠️  User with email {admin_email} not found")
            print("   Admin will be set automatically when this user signs up")
        
        print("\n✅ Migration complete!")


if __name__ == "__main__":
    print("Starting is_admin migration...")
    migrate()
