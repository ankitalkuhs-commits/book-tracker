"""
Migration: Add usernames to existing users who don't have one.
Auto-generates usernames from user names or email.

Run this on production server with:
  python migrations/add_missing_usernames.py
"""

import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select, create_engine
from app.models import User

# Use the production database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./book_tracker.db")
engine = create_engine(DATABASE_URL, echo=True)


def migrate():
    """Add usernames to users who don't have them."""
    with Session(engine) as session:
        # Get all users without usernames
        users_without_username = session.exec(
            select(User).where(User.username == None)
        ).all()
        
        print(f"Found {len(users_without_username)} users without usernames")
        
        for user in users_without_username:
            # Generate username from name or email
            if user.name:
                base_username = ''.join(
                    c.lower() for c in user.name if c.isalnum() or c.isspace()
                ).replace(' ', '')
            else:
                base_username = user.email.split('@')[0].lower()
            
            # Ensure uniqueness
            username = base_username
            counter = 1
            while session.exec(select(User).where(User.username == username)).first():
                username = f"{base_username}{counter}"
                counter += 1
            
            # Update user
            user.username = username
            session.add(user)
            print(f"✓ Updated user {user.id} ({user.name or user.email}) → @{username}")
        
        session.commit()
        print(f"\n✅ Migration complete! Updated {len(users_without_username)} users")


if __name__ == "__main__":
    print("Starting username migration...")
    migrate()
