"""
Migration script to update status values in UserBook table
Old values: 'currently-reading', 'to-be-read', 'finished'
New values: 'reading', 'to-read', 'finished'
"""

import sqlite3

def migrate_status_values():
    # Connect to the database
    conn = sqlite3.connect('book_tracker.db')
    cursor = conn.cursor()
    
    print("Starting status migration...")
    
    # Check current status values
    cursor.execute("SELECT DISTINCT status FROM userbook")
    current_statuses = cursor.fetchall()
    print(f"Current status values: {[s[0] for s in current_statuses]}")
    
    # Count books with each old status
    cursor.execute("SELECT status, COUNT(*) FROM userbook GROUP BY status")
    status_counts = cursor.fetchall()
    print("\nBefore migration:")
    for status, count in status_counts:
        print(f"  {status}: {count} books")
    
    # Update 'currently-reading' to 'reading'
    cursor.execute("UPDATE userbook SET status = 'reading' WHERE status = 'currently-reading'")
    reading_updated = cursor.rowcount
    print(f"\n✓ Updated {reading_updated} books from 'currently-reading' to 'reading'")
    
    # Update 'to-be-read' to 'to-read'
    cursor.execute("UPDATE userbook SET status = 'to-read' WHERE status = 'to-be-read'")
    to_read_updated = cursor.rowcount
    print(f"✓ Updated {to_read_updated} books from 'to-be-read' to 'to-read'")
    
    # Commit the changes
    conn.commit()
    
    # Verify the changes
    cursor.execute("SELECT status, COUNT(*) FROM userbook GROUP BY status")
    new_status_counts = cursor.fetchall()
    print("\nAfter migration:")
    for status, count in new_status_counts:
        print(f"  {status}: {count} books")
    
    # Close connection
    conn.close()
    print("\n✅ Migration completed successfully!")

if __name__ == "__main__":
    try:
        migrate_status_values()
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
