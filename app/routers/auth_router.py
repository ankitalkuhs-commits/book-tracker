# app/routers/auth_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from google.oauth2 import id_token
from google.auth.transport import requests
from ..database import get_session
from .. import crud, auth
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])


from pydantic import Field, validator

class SignupIn(BaseModel):
    name: str
    email: str
    password: str = Field(..., min_length=8, max_length=128)

    @validator("password")
    def password_must_be_str_and_not_too_long(cls, v):
        if not isinstance(v, str):
            raise ValueError("Password must be a string.")
        if len(v.encode("utf-8")) > 256:
            raise ValueError("Password must be less than 256 bytes.")
        return v

class LoginIn(BaseModel):
    email: str
    password: str

class GoogleAuthIn(BaseModel):
    token: str

@router.post("/signup")
def signup(payload: SignupIn, db: Session = Depends(get_session)):
    existing = crud.get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = auth.hash_password(payload.password)
    user = crud.create_user(db, name=payload.name, email=payload.email, password_hash=hashed)
    token = auth.create_access_token({"sub": user.email})
    return {"access_token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}

@router.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_session)):
    from datetime import datetime, date
    
    user = crud.get_user_by_email(db, payload.email)
    if not user or not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Update last_active only if date has changed
    today = date.today()
    if user.last_active is None or user.last_active.date() != today:
        user.last_active = datetime.utcnow()
        db.add(user)
        db.commit()
        db.refresh(user)
    
    token = auth.create_access_token({"sub": user.email})
    return {"access_token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}

@router.post("/google")
def google_auth(payload: GoogleAuthIn, db: Session = Depends(get_session)):
    """
    Verify Google OAuth token and create/login user.
    """
    from datetime import datetime, date
    
    try:
        # Verify the Google token
        # Note: In production, you should verify against your actual Google Client ID
        idinfo = id_token.verify_oauth2_token(
            payload.token, 
            requests.Request(),
            # TODO: Replace with your actual Google Client ID
            # For now, skip audience verification by passing None
            clock_skew_in_seconds=10
        )

        # Extract user info from Google token
        email = idinfo.get('email')
        name = idinfo.get('name', email.split('@')[0])
        google_id = idinfo.get('sub')

        if not email:
            raise HTTPException(status_code=400, detail="Email not provided by Google")

        # Check if user exists
        user = crud.get_user_by_email(db, email)
        
        if not user:
            # Create new user with a random password (since they're using OAuth)
            import secrets
            random_password = secrets.token_urlsafe(32)
            hashed = auth.hash_password(random_password)
            user = crud.create_user(db, name=name, email=email, password_hash=hashed)
        
        # Update last_active only if date has changed
        today = date.today()
        if user.last_active is None or user.last_active.date() != today:
            user.last_active = datetime.utcnow()
            db.add(user)
            db.commit()
            db.refresh(user)

        # Create access token
        token = auth.create_access_token({"sub": user.email})
        return {"access_token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}

    except ValueError as e:
        # Invalid token
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Google authentication failed: {str(e)}")


class DemoLoginIn(BaseModel):
    email: str

@router.post("/demo")
def demo_login(payload: DemoLoginIn, db: Session = Depends(get_session)):
    """
    Demo login endpoint for mobile app testing.
    Creates or logs in a user without password.
    REMOVE THIS IN PRODUCTION!
    """
    from datetime import datetime, date
    
    # Check if user exists
    user = crud.get_user_by_email(db, payload.email)
    
    if not user:
        # Create new demo user
        import secrets
        random_password = secrets.token_urlsafe(32)
        hashed = auth.hash_password(random_password)
        name = payload.email.split('@')[0]
        user = crud.create_user(db, name=name, email=payload.email, password_hash=hashed)
    
    # Update last_active
    today = date.today()
    if user.last_active is None or user.last_active.date() != today:
        user.last_active = datetime.utcnow()
        db.add(user)
        db.commit()
        db.refresh(user)
    
    # Create access token
    token = auth.create_access_token({"sub": user.email})
    return {"access_token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}
