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

# Render provides postgres:// but SQLAlchemy 1.4+ requires postgresql://
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

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
        pool_size=5,  # Reduced pool size for better stability
        max_overflow=10,  # Reduced overflow
        connect_args={
            "sslmode": "prefer",  # Changed from "require" to "prefer" for better compatibility
            "connect_timeout": 30,  # Increased timeout
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
        }
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
