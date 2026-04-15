# app/routers/auth_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from google.oauth2 import id_token
from google.auth.transport import requests
from ..database import get_session
from ..deps import get_db, get_current_user
from .. import crud, auth, models
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

class AccountDeletionRequest(BaseModel):
    email: str
    reason: str = None

@router.post("/demo-login")
def demo_login(db: Session = Depends(get_session)):
    """Demo login endpoint for testing - uses existing user account"""
    demo_email = "ankitshukla47.as@gmail.com"
    
    # Get existing user
    user = crud.get_user_by_email(db, demo_email)
    if not user:
        raise HTTPException(status_code=404, detail="Demo user not found in database")
    
    token = auth.create_access_token({"sub": user.email})
    return {
        "access_token": token,
        "user": {"id": user.id, "name": user.name, "email": user.email}
    }

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
    Accepts tokens from both Web and Android clients.
    """
    from datetime import datetime, date
    import os
    
    # Accept both Web and Android client IDs
    WEB_CLIENT_ID = "580873034102-ukh12uuph4c17eqvvbjl1a48alrfepok.apps.googleusercontent.com"
    ANDROID_CLIENT_ID = "580873034102-hp8st6ei62sadh6t3iq1tdlp867h4be0.apps.googleusercontent.com"
    
    try:
        # Try verifying with Web Client ID first
        idinfo = None
        last_error = None
        
        for client_id in [WEB_CLIENT_ID, ANDROID_CLIENT_ID]:
            try:
                idinfo = id_token.verify_oauth2_token(
                    payload.token, 
                    requests.Request(),
                    audience=client_id,
                    clock_skew_in_seconds=10
                )
                print(f"✅ Token verified with client_id: {client_id}")
                break
            except ValueError as e:
                last_error = e
                print(f"❌ Token verification failed for {client_id}: {e}")
                continue
        
        if not idinfo:
            raise HTTPException(
                status_code=401, 
                detail=f"Invalid Google token: {str(last_error)}"
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

@router.post("/delete-account")
def request_account_deletion(payload: AccountDeletionRequest, db: Session = Depends(get_session)):
    """Legacy form-based deletion request (marks account, does not delete immediately)."""
    from datetime import datetime
    user = crud.get_user_by_email(db, payload.email)
    if not user:
        return {"message": "Account deletion request received"}
    user.deletion_requested_at = datetime.utcnow()
    user.deletion_reason = payload.reason
    db.add(user)
    db.commit()
    return {"message": "Account deletion request received"}


@router.post("/delete-account/me")
def delete_own_account(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Authenticated endpoint: immediately and permanently deletes the calling user's account
    and all associated data (userbooks, notes, follows, likes, comments, push tokens,
    notification logs, group memberships, group posts).
    """
    uid = current_user.id

    # Delete in dependency order to avoid FK violations
    for model_cls, col in [
        (models.NotificationLog, models.NotificationLog.user_id),
        (models.GroupPost,        models.GroupPost.user_id),
        (models.GroupMember,      models.GroupMember.user_id),
    ]:
        for row in db.exec(select(model_cls).where(col == uid)).all():
            db.delete(row)

    # Groups created by this user — delete members + posts first, then the group
    created_groups = db.exec(
        select(models.ReadingGroup).where(models.ReadingGroup.created_by == uid)
    ).all()
    for g in created_groups:
        for m in db.exec(select(models.GroupMember).where(models.GroupMember.group_id == g.id)).all():
            db.delete(m)
        for p in db.exec(select(models.GroupPost).where(models.GroupPost.group_id == g.id)).all():
            db.delete(p)
        db.delete(g)

    # Push tokens
    for row in db.exec(select(models.PushToken).where(models.PushToken.user_id == uid)).all():
        db.delete(row)

    # Social graph
    for row in db.exec(select(models.Follow).where(
        (models.Follow.follower_id == uid) | (models.Follow.followed_id == uid)
    )).all():
        db.delete(row)

    # Notes, likes, comments
    note_ids = [n.id for n in db.exec(select(models.Note).where(models.Note.user_id == uid)).all()]
    for nid in note_ids:
        for row in db.exec(select(models.Like).where(models.Like.note_id == nid)).all():
            db.delete(row)
        for row in db.exec(select(models.Comment).where(models.Comment.note_id == nid)).all():
            db.delete(row)
    for row in db.exec(select(models.Note).where(models.Note.user_id == uid)).all():
        db.delete(row)
    # Likes/comments the user left on other notes
    for row in db.exec(select(models.Like).where(models.Like.user_id == uid)).all():
        db.delete(row)
    for row in db.exec(select(models.Comment).where(models.Comment.user_id == uid)).all():
        db.delete(row)

    # Reading activity + userbooks
    for row in db.exec(select(models.ReadingActivity).where(models.ReadingActivity.user_id == uid)).all():
        db.delete(row)
    for row in db.exec(select(models.UserBook).where(models.UserBook.user_id == uid)).all():
        db.delete(row)

    # Finally delete the user
    user = db.get(models.User, uid)
    if user:
        db.delete(user)
    db.commit()

    return {"message": "Account deleted"}
