# app/database.py
from sqlmodel import SQLModel, create_engine, Session


# -----------------------
#  Database Setup
# -----------------------
DATABASE_URL = "sqlite:///./book_tracker.db"

engine = create_engine(DATABASE_URL, echo=True, connect_args={"check_same_thread": False})


# -----------------------
#  Function 1: Initialize DB
# -----------------------
def init_db():
    SQLModel.metadata.create_all(engine)

# It sets up a simple SQLite database (like a tiny file-based database) and connects it.

# -----------------------
#  Function 2: Get Session
# -----------------------
def get_session():
    """
    Creates and yields a database session.
    This is used inside API routes via 'Depends(get_session)'.
    """
    with Session(engine) as session:
        yield session

