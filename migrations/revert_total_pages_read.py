# migrations/revert_total_pages_read.py
# Script to drop the total_pages_read column from the user table

import sqlite3

DB_PATH = '../book_tracker.db'  # Adjust path if needed

def drop_column():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # SQLite does not support DROP COLUMN directly; workaround is required
    # 1. Rename original table
    cursor.execute('ALTER TABLE "user" RENAME TO user_old;')
    # 2. Create new table without total_pages_read
    cursor.execute('''
        CREATE TABLE "user" (
            id INTEGER PRIMARY KEY,
            email TEXT,
            name TEXT,
            ... -- add all other columns except total_pages_read
        );
    ''')
    # 3. Copy data (excluding total_pages_read)
    cursor.execute('''
        INSERT INTO "user" (id, email, name, ...)
        SELECT id, email, name, ... FROM user_old;
    ''')
    # 4. Drop old table
    cursor.execute('DROP TABLE user_old;')
    conn.commit()
    conn.close()

if __name__ == '__main__':
    drop_column()
