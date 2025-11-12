#!/usr/bin/env python3
"""
Create all database tables.
Run this script to initialize the database schema.
"""
import sys
from sqlmodel import SQLModel
# Import all models first so SQLModel knows about them
from app.models import User, Book, UserBook, Note, Follow, Like, Comment, Journal
from app.database import engine

if __name__ == "__main__":
    print("Creating database tables...")
    print(f"Models to create: User, Book, UserBook, Note, Follow, Like, Comment, Journal")
    
    try:
        # Create all tables
        SQLModel.metadata.create_all(engine)
        print("✅ All tables created successfully!")
        
        # Verify tables were created
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        print(f"✅ Verified {len(tables)} tables exist: {', '.join(tables)}")
        
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        sys.exit(1)
