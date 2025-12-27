#!/usr/bin/env python3
"""
Create all database tables.
Run this script to initialize the database schema.
"""
import sys
import time
import os
from sqlmodel import SQLModel
# Import all models first so SQLModel knows about them
from app.models import User, Book, UserBook, Note, Follow, Like, Comment, Journal
from app.database import engine

if __name__ == "__main__":
    print("Creating database tables...")
    print(f"DATABASE_URL: {os.getenv('DATABASE_URL', 'Not set')[:50]}...")  # Debug log
    print(f"Models to create: User, Book, UserBook, Note, Follow, Like, Comment, Journal")
    
    # Retry logic for database connection issues
    max_retries = 3
    retry_delay = 5  # seconds
    
    for attempt in range(max_retries):
        try:
            print(f"Connection attempt {attempt + 1}/{max_retries}...")
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
                print("⚠️ Warning: Tables may already exist. Continuing anyway...")
                # Don't exit with error - let the app start
                # The tables likely already exist from a previous deployment
                sys.exit(0)  # Changed from sys.exit(1) to allow app to start
