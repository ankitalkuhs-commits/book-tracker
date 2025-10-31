import sqlite3

conn = sqlite3.connect('book_tracker.db')
cursor = conn.cursor()

print("Note table columns:")
cursor.execute('PRAGMA table_info(note)')
for col in cursor.fetchall():
    print(f'  {col[1]}: {col[2]}')

conn.close()
