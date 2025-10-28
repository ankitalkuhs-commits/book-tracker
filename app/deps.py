# app/deps.py
from fastapi import Header, HTTPException, Depends
from .auth import decode_token
from .database import get_session
from sqlmodel import Session
from .crud import get_user_by_email
from . import models

# Note: get_session is a generator (yields a Session). We call it via Depends(get_session)
def get_db():
    """
    Simple wrapper to provide DB session via FastAPI Depends.
    Use like: db: Session = Depends(get_db)
    """
    yield from get_session()

def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)) -> models.User:
    """
    Extracts current user object from Authorization header (expects 'Bearer <token>').
    Returns the User model instance or raises HTTP 401 if invalid.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.replace("Bearer ", "")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = get_user_by_email(db, email=email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
