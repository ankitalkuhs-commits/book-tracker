#!/usr/bin/env python3
"""
Create all database tables.
Run this script to initialize the database schema.
"""
import sys
import time
from sqlmodel import SQLModel
# Import all models first so SQLModel knows about them
from app.models import User, Book, UserBook, Note, Follow, Like, Comment, Journal
from app.database import engine

if __name__ == "__main__":
    print("Creating database tables...")
    print(f"Models to create: User, Book, UserBook, Note, Follow, Like, Comment, Journal")
    
    # Retry logic for database connection issues
    max_retries = 3
    retry_delay = 5  # seconds
    
    for attempt in range(max_retries):
        try:
            # Create all tables
            SQLModel.metadata.create_all(engine)
            print("✅ All tables created successfully!")
            
            # Verify tables were created
            from sqlalchemy import inspect
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            print(f"✅ Verified {len(tables)} tables exist: {', '.join(tables)}")
            break  # Success, exit retry loop
            
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"⚠️ Attempt {attempt + 1} failed: {e}")
                print(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                print(f"❌ Error creating tables after {max_retries} attempts: {e}")
                sys.exit(1)
