# app/deps.py
from typing import Generator, Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session
from .database import get_session
from . import crud, auth, localday

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
    request: Request,
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

    # Sprint 4C (R-07, R-10): the device zone, then last_active once per LOCAL day — one commit.
    now = localday.utcnow()
    dirty = False
    reported = localday.valid_zone(request.headers.get(localday.ZONE_HEADER))
    if reported and reported != user.timezone:
        user.timezone = reported
        dirty = True
    zone = localday.zone_of(user)
    if user.last_active is None or localday.local_date(user.last_active, zone) < localday.local_date(now, zone):
        user.last_active = now
        dirty = True
    if dirty:
        db.add(user)
        db.commit()

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


BOT_ACTOR_DENIED = "Automated accounts cannot interact with readers' posts"


def deny_bot_actor(
    current_user = Depends(get_current_user)
):
    """Sprint 4F (R-05): an automated account may post, and may read. It may not follow, like,
    unlike or comment.

    This is a dependency and not a check inside the four handlers on purpose: FastAPI resolves
    dependencies BEFORE the handler body runs, so the 403 lands before any row is added and
    before any `background_tasks.add_task(fire_event, ...)` is registered. That ordering is the
    requirement, not a side effect of it.

    The decision is read from `current_user.is_bot` — the database row `get_current_user` just
    loaded — and never from a token claim (E-4). Revoking a bot is therefore one UPDATE and not
    a token-expiry problem.
    """
    if current_user.is_bot:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=BOT_ACTOR_DENIED,
        )
    return current_user
