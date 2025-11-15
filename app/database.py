# app/database.py
import os
from typing import Generator
from sqlmodel import SQLModel, create_engine, Session

# Path to your sqlite DB file (adjust if needed)
BASE_DIR = os.path.dirname(os.path.dirname(__file__))  # points to project/app parent
DB_PATH = os.path.join(BASE_DIR, "book_tracker.db")

# Get DATABASE_URL from environment variable (for production) or use SQLite (for local dev)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{DB_PATH}"  # Default to SQLite for local development
)


# create engine
# Only pass the sqlite-only connect_args when using SQLite.
if DATABASE_URL.startswith("sqlite://"):
    engine = create_engine(
        DATABASE_URL,
        echo=True,  # helpful while debugging; set to False in production
        connect_args={"check_same_thread": False},
    )
else:
    # PostgreSQL with connection pooling and SSL settings
    engine = create_engine(
        DATABASE_URL,
        echo=False,  # Set to False in production for cleaner logs
        pool_pre_ping=True,  # Verify connections before using them
        pool_recycle=300,  # Recycle connections after 5 minutes
        pool_size=10,  # Connection pool size
        max_overflow=20,  # Allow up to 20 extra connections beyond pool_size
    )


# Provide a Base symbol for compatibility with modules that import `Base`
# (some code expects `Base` like from SQLAlchemy declarative_base()).
# With SQLModel we export SQLModel itself so models can subclass SQLModel.
Base = SQLModel

# create tables for all models (no-op if already present)
def init_db() -> None:
    SQLModel.metadata.create_all(engine)

# convenience session factory for scripts / one-off use
def get_session() -> Session:
    """
    Use this in scripts:
        with get_session() as session:
            ...
    """
    return Session(engine)

# FastAPI dependency: returns a generator that yields a Session instance
# Use this in deps.py or directly in route dependencies:
#   db: Session = Depends(get_db)
def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a Session and ensures it is closed after use.
    """
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()

# Note: init_db() is called explicitly via create_tables.py during deployment
# Not calling it here to avoid duplicate initialization and SSL connection issues
