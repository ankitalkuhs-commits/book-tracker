# app/routers/auth_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
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

@router.post("/signup")
def signup(payload: SignupIn, db: Session = Depends(get_session)):
    existing = crud.get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = auth.hash_password(payload.password)
    user = crud.create_user(db, payload.name, payload.email, hashed)
    token = auth.create_access_token({"sub": user.email})
    return {"access_token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}

@router.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_session)):
    user = crud.get_user_by_email(db, payload.email)
    if not user or not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = auth.create_access_token({"sub": user.email})
    return {"access_token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}
