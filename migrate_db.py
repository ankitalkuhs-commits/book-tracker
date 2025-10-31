import sqlite3
from sqlmodel import SQLModel
from app.database import engine
from app.models import Book, UserBook, Note, User, Follow

def migrate_database():
    # First, try to add new columns if they don't exist
    conn = sqlite3.connect('book_tracker.db')
    cursor = conn.cursor()
    
    try:
        # Check if columns exist in 'book' table and add them if they don't
        cursor.execute("PRAGMA table_info(book)")
        book_columns = {row[1] for row in cursor.fetchall()}
        
        if 'total_pages' not in book_columns:
            cursor.execute("ALTER TABLE book ADD COLUMN total_pages INTEGER")
            print("✅ Added 'total_pages' to book table")
        if 'publisher' not in book_columns:
            cursor.execute("ALTER TABLE book ADD COLUMN publisher VARCHAR")
            print("✅ Added 'publisher' to book table")
        if 'published_date' not in book_columns:
            cursor.execute("ALTER TABLE book ADD COLUMN published_date VARCHAR")
            print("✅ Added 'published_date' to book table")
        
        # Check if columns exist in 'note' table and add them if they don't
        cursor.execute("PRAGMA table_info(note)")
        note_columns = {row[1] for row in cursor.fetchall()}
        
        if 'page_number' not in note_columns:
            cursor.execute("ALTER TABLE note ADD COLUMN page_number INTEGER")
            print("✅ Added 'page_number' to note table")
        if 'chapter' not in note_columns:
            cursor.execute("ALTER TABLE note ADD COLUMN chapter VARCHAR")
            print("✅ Added 'chapter' to note table")
        
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