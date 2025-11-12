#!/usr/bin/env python3
"""
Create all database tables.
Run this script to initialize the database schema.
"""
# Import all models first so SQLModel knows about them
from app.models import User, Book, UserBook, Note, Follow, Like, Comment, Journal
from app.database import init_db

if __name__ == "__main__":
    print("Creating database tables...")
    print(f"Models to create: User, Book, UserBook, Note, Follow, Like, Comment, Journal")
    init_db()
    print("✅ All tables created successfully!")
