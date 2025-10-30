# app/database.py
from sqlmodel import SQLModel, create_engine, Session
import os

# Path to your sqlite DB file (adjust if needed)
BASE_DIR = os.path.dirname(os.path.dirname(__file__))  # points to project/app parent
DB_PATH = os.path.join(BASE_DIR, "book_tracker.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# create engine (check_same_thread=False important for SQLite + threaded dev server)
engine = create_engine(
    DATABASE_URL,
    echo=True,  # helpful while debugging; set to False in production
    connect_args={"check_same_thread": False},
)

# create tables for all models (no-op if already present)
def init_db():
    SQLModel.metadata.create_all(engine)

# convenience session factory for scripts / one-off use
def get_session():
    """
    Use this in scripts:
        with get_session() as session:
            ...
    """
    return Session(engine)

# FastAPI dependency: returns a generator that yields a Session instance
# Use this in deps.py or directly in route dependencies:
#   db: Session = Depends(get_db)
def get_db():
    """
    FastAPI dependency that yields a Session and ensures it is closed after use.
    """
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()

# initialize DB immediately on import (optional but convenient during dev)
init_db()
