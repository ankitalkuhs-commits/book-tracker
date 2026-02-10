"""Script to delete all public notes created today from PRODUCTION database"""
from sqlmodel import Session, select, create_engine
from app.models import Note
from datetime import datetime, timezone
import os

# PRODUCTION DATABASE URL
# Get this from Render dashboard -> your service -> Environment -> DATABASE_URL
PRODUCTION_DATABASE_URL = os.getenv("PRODUCTION_DATABASE_URL")

if not PRODUCTION_DATABASE_URL:
    print("ERROR: Please set PRODUCTION_DATABASE_URL environment variable")
    print("Get it from: Render Dashboard -> Your Service -> Environment -> DATABASE_URL")
    print("\nExample:")
    print('  $env:PRODUCTION_DATABASE_URL="postgresql://user:pass@host/db"')
    print("  python delete_today_notes.py")
    exit(1)

print(f"Connecting to production database...")
print(f"URL: {PRODUCTION_DATABASE_URL[:30]}...")

# Create engine and session for PRODUCTION
engine = create_engine(PRODUCTION_DATABASE_URL, echo=False)
session = Session(engine)

try:
    # Get today's date
    today = datetime.now(timezone.utc).date()
    
    # Get all public notes
    notes = session.exec(select(Note).where(Note.is_public == True)).all()
    
    # Filter for today's notes
    today_notes = [n for n in notes if n.created_at.date() == today]
    
    print(f'Found {len(today_notes)} public notes from today')
    
    if today_notes:
        # Delete them
        for note in today_notes:
            print(f'Deleting note ID {note.id}: {note.text[:50] if note.text else "No text"}...')
            session.delete(note)
        
        session.commit()
        print(f'\nSuccessfully deleted {len(today_notes)} notes!')
    else:
        print('No notes to delete')
        
finally:
    session.close()
