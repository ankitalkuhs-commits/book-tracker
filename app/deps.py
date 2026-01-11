# app/deps.py
from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session
from .database import get_session
from . import crud, auth

# Use HTTPBearer to parse the Authorization header (Bearer token)
bearer_scheme = HTTPBearer(auto_error=False)


#def get_db() -> Generator:
 #   """
 #   Provide a DB session dependency.
 #   If database.get_session() is a generator (yields a session), forward it with 'yield from'.
 #   This avoids incorrectly using 'with get_session() as session' when get_session is a generator.
 #   """
    # If get_session is a generator that yields a Session, this will yield the session correctly.
#   yield from get_session()


# app/deps.py
from typing import Optional
from .database import get_db  # <- import the generator

# Example dependency using get_db (do NOT 'yield from' a contextmanager)
def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(...),  # whatever your auth dependency is
) -> Optional[dict]:
    # your logic to resolve token -> user
    ...



def _extract_token(credentials: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    if not credentials:
        return None
    return credentials.credentials


def get_current_user(
    db: Session = Depends(get_db),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
):
    """
    Decode token and return the User model instance.
    Supports tokens whose 'sub' is either user id (int) or email (str).
    """
    token = _extract_token(creds)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = auth.decode_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")

    sub = payload.get("sub")
    if sub is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload (no sub)")

    # Try integer id first
    user = None
    try:
        user_id = int(sub)
        user = crud.get_user_by_id(db, user_id=user_id)
    except Exception:
        user = None

    # If not found and sub looks like an email, try lookup by email
    if user is None and isinstance(sub, str) and "@" in sub:
        user = crud.get_user_by_email(db, email=sub)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def get_current_user_optional(
    db: Session = Depends(get_db),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> Optional:
    """
    Optional authentication - returns User if authenticated, None if not.
    Does not raise an error for unauthenticated users.
    """
    token = _extract_token(creds)
    if not token:
        return None

    payload = auth.decode_token(token)
    if not payload:
        return None

    sub = payload.get("sub")
    if sub is None:
        return None

    # Try integer id first
    user = None
    try:
        user_id = int(sub)
        user = crud.get_user_by_id(db, user_id=user_id)
    except Exception:
        user = None

    # If not found and sub looks like an email, try lookup by email
    if user is None and isinstance(sub, str) and "@" in sub:
        user = crud.get_user_by_email(db, email=sub)

    return user

def get_admin_user(
    current_user = Depends(get_current_user)
):
    """
    Ensure the current user is an admin.
    Raises 403 Forbidden if user is not admin.
    Security: Only ankitalkuhs@gmail.com should have is_admin=True
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
