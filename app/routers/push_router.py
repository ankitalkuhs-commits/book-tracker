"""
Push Token Router
Handles device push token registration so the backend can send notifications.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..deps import get_db, get_current_user
from .. import models

router = APIRouter(prefix="/push-tokens", tags=["push"])


class PushTokenRegister(BaseModel):
    token: str


@router.post("/", status_code=status.HTTP_200_OK)
def register_push_token(
    payload: PushTokenRegister,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Register (or update) the Expo push token for the current user's device.
    Call this once after login from the mobile app.
    """
    valid_prefixes = ("ExponentPushToken", "ExpoPushToken")
    if not payload.token or not payload.token.startswith(valid_prefixes):
        print(
            f"[Push] Invalid token format from user {current_user.id} ({current_user.email}): {payload.token}"
        )
        return {
            "message": "Invalid token format — must start with ExponentPushToken or ExpoPushToken"
        }

    existing = db.exec(
        select(models.PushToken).where(models.PushToken.user_id == current_user.id)
    ).first()

    if existing:
        existing.token = payload.token
        existing.updated_at = datetime.utcnow()
        db.add(existing)
        print(f"[Push] Token updated for user {current_user.id} ({current_user.email})")
    else:
        db.add(models.PushToken(user_id=current_user.id, token=payload.token))
        print(f"[Push] Token registered for user {current_user.id} ({current_user.email})")

    db.commit()
    return {"message": "Push token registered"}


@router.delete("/", status_code=status.HTTP_200_OK)
def deregister_push_token(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Remove push token on logout so the user stops receiving notifications."""
    existing = db.exec(
        select(models.PushToken).where(models.PushToken.user_id == current_user.id)
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        print(f"[Push] Token removed for user {current_user.id} ({current_user.email})")

    return {"message": "Push token removed"}
