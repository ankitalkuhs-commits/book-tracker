import sqlite3
from sqlmodel import SQLModel
from app.database import engine
from app.models import Book, UserBook, Note, User, Follow

def migrate_database():
    # First, try to add new columns if they don't exist
    conn = sqlite3.connect('book_tracker.db')
    cursor = conn.cursor()
    
    try:
        # Check if columns exist and add them if they don't
        cursor.execute("PRAGMA table_info(book)")
        columns = {row[1] for row in cursor.fetchall()}
        
        if 'total_pages' not in columns:
            cursor.execute("ALTER TABLE book ADD COLUMN total_pages INTEGER")
        if 'publisher' not in columns:
            cursor.execute("ALTER TABLE book ADD COLUMN publisher VARCHAR")
        if 'published_date' not in columns:
            cursor.execute("ALTER TABLE book ADD COLUMN published_date VARCHAR")
        
        conn.commit()
        print("Database migration successful!")
        
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

    # Now create/update all tables using SQLModel
    SQLModel.metadata.create_all(engine)
    print("Schema update complete!")

if __name__ == "__main__":
    migrate_database()