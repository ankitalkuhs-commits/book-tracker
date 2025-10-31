import sqlite3

conn = sqlite3.connect('book_tracker.db')
cursor = conn.cursor()

try:
    print("Adding page_number column...")
    cursor.execute("ALTER TABLE note ADD COLUMN page_number INTEGER")
    print("✅ Added page_number column")
    
    print("Adding chapter column...")
    cursor.execute("ALTER TABLE note ADD COLUMN chapter VARCHAR")
    print("✅ Added chapter column")
    
    conn.commit()
    print("\n✅ Migration completed successfully!")
    
    # Verify
    print("\nVerifying columns:")
    cursor.execute('PRAGMA table_info(note)')
    for col in cursor.fetchall():
        print(f'  {col[1]}: {col[2]}')
        
except Exception as e:
    print(f"❌ Error: {e}")
    conn.rollback()
finally:
    conn.close()
