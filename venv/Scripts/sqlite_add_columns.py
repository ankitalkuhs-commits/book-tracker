# scripts/sqlite_fix_columns.py
# Inspect main tables and add missing columns used by current models.
# Configured for your DB path: C:\Users\sonal\Documents\projects\book-tracker\book_tracker.db
#
# Run: python .\scripts\sqlite_fix_columns.py

import sqlite3, os, sys

DB_PATH = r"C:\Users\sonal\Documents\projects\book-tracker\book_tracker.db"

if not os.path.exists(DB_PATH):
    print(f"ERROR: DB file not found at {DB_PATH!r}")
    sys.exit(1)

con = sqlite3.connect(DB_PATH)
cur = con.cursor()

def get_cols(table):
    cur.execute(f"PRAGMA table_info('{table}')")
    return [row[1] for row in cur.fetchall()]

# Map of tables to desired columns (name -> SQL snippet to use in ALTER)
# Keep columns nullable/default so ALTER is simple and non-destructive.
desired_map = {
    "user": {
        # existing schema may have 'password_hash' instead of 'hashed_password'; we will not drop anything,
        # but ensure hashed_password exists. If the DB uses password_hash we leave it as-is.
        "hashed_password": "TEXT",
        "created_at": "TEXT"
    },
    "book": {
        "format": "TEXT",
        "total_pages": "INTEGER",
        "pages_source": "TEXT",
        "cover_url": "TEXT",
        "created_at": "TEXT"
    },
    "userbook": {
        "status": "TEXT",
        "current_page": "INTEGER",
        "created_at": "TEXT"
    },
    "note": {
        "userbook_id": "INTEGER",
        "user_id": "INTEGER",
        "text": "TEXT",
        "emotion": "TEXT",
        "is_public": "INTEGER",  # SQLite uses 0/1 for booleans
        "created_at": "TEXT"
    },
    "follow": {
        "follower_id": "INTEGER",
        "followed_id": "INTEGER",
        "created_at": "TEXT"
    }
}

print("Checking tables and adding missing columns where necessary...")
for table, cols in desired_map.items():
    # check if table exists
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?;", (table,))
    if cur.fetchone() is None:
        print(f"  - Table '{table}' does not exist in DB. Skipping (will be created on fresh init).")
        continue

    existing = get_cols(table)
    print(f"\nTable '{table}' existing columns: {existing}")
    for col_name, sqltype in cols.items():
        if col_name in existing:
            print(f"    - Column '{col_name}' already exists -> OK")
            continue
        # Special note: if our desired is 'hashed_password' but DB has 'password_hash', skip adding duplicate
        if table == "user" and col_name == "hashed_password" and "password_hash" in existing:
            print(f"    - DB already has 'password_hash'. Skipping adding 'hashed_password' to avoid duplicate semantics.")
            continue

        # Add the column (nullable, no default to be safe). Use TEXT / INTEGER types.
        try:
            sql = f"ALTER TABLE {table} ADD COLUMN {col_name} {sqltype};"
            print("    - Adding column with SQL:", sql)
            cur.execute(sql)
            con.commit()
            print(f"    - Added '{col_name}' to '{table}'")
        except Exception as e:
            print(f"    ! Failed to add '{col_name}' to '{table}': {e}")
            con.rollback()

    # final columns
    print("    -> Final columns:", get_cols(table))

con.close()
print("\nAll done. If you added columns, restart the backend server and test the endpoints.")
