"""
Migration script to add format and ownership fields to UserBook table.
Sets default values for existing entries: format='hardcover', ownership_status='owned'
"""

import sqlite3
from datetime import datetime

DB_PATH = "book_tracker.db"

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("🔄 Starting migration: Adding format and ownership fields to UserBook table...")
    
    try:
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(userbook)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # Add format column if it doesn't exist
        if 'format' not in columns:
            print("  ➕ Adding 'format' column...")
            cursor.execute("""
                ALTER TABLE userbook 
                ADD COLUMN format TEXT DEFAULT 'hardcover'
            """)
            print("  ✅ 'format' column added")
        else:
            print("  ⏭️  'format' column already exists")
        
        # Add ownership_status column if it doesn't exist
        if 'ownership_status' not in columns:
            print("  ➕ Adding 'ownership_status' column...")
            cursor.execute("""
                ALTER TABLE userbook 
                ADD COLUMN ownership_status TEXT DEFAULT 'owned'
            """)
            print("  ✅ 'ownership_status' column added")
        else:
            print("  ⏭️  'ownership_status' column already exists")
        
        # Add borrowed_from column if it doesn't exist
        if 'borrowed_from' not in columns:
            print("  ➕ Adding 'borrowed_from' column...")
            cursor.execute("""
                ALTER TABLE userbook 
                ADD COLUMN borrowed_from TEXT
            """)
            print("  ✅ 'borrowed_from' column added")
        else:
            print("  ⏭️  'borrowed_from' column already exists")
        
        # Add loaned_to column if it doesn't exist
        if 'loaned_to' not in columns:
            print("  ➕ Adding 'loaned_to' column...")
            cursor.execute("""
                ALTER TABLE userbook 
                ADD COLUMN loaned_to TEXT
            """)
            print("  ✅ 'loaned_to' column added")
        else:
            print("  ⏭️  'loaned_to' column already exists")
        
        # Update existing NULL values to defaults
        print("\n  🔄 Updating existing records with default values...")
        cursor.execute("""
            UPDATE userbook 
            SET format = 'hardcover' 
            WHERE format IS NULL
        """)
        format_updated = cursor.rowcount
        
        cursor.execute("""
            UPDATE userbook 
            SET ownership_status = 'owned' 
            WHERE ownership_status IS NULL
        """)
        ownership_updated = cursor.rowcount
        
        conn.commit()
        
        # Get statistics
        cursor.execute("SELECT COUNT(*) FROM userbook")
        total_books = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT user_id) FROM userbook")
        total_users = cursor.fetchone()[0]
        
        print(f"\n📊 Migration Summary:")
        print(f"  • Total UserBook entries: {total_books}")
        print(f"  • Total users with books: {total_users}")
        print(f"  • Records updated with format='hardcover': {format_updated}")
        print(f"  • Records updated with ownership_status='owned': {ownership_updated}")
        
        print("\n✅ Migration completed successfully!")
        
    except sqlite3.Error as e:
        print(f"\n❌ Error during migration: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
