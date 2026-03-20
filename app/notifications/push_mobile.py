# app/notifications/push_mobile.py
"""
Expo push notification sender for the mobile app.
Uses exponent-server-sdk for proper error handling (stale token removal, etc.)
"""
from typing import Optional
from sqlmodel import Session, select

from exponent_server_sdk import (
    DeviceNotRegisteredError,
    PushClient,
    PushMessage,
    PushServerError,
)


def send_expo_push(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    data: dict,
) -> None:
    """
    Send a push notification to all Expo-registered devices for a user.
    Automatically removes stale/expired tokens from the database.
    """
    from ..models import PushToken  # deferred to avoid circular imports

    tokens = db.exec(
        select(PushToken).where(
            PushToken.user_id == user_id,
            PushToken.token_type == "expo",
        )
    ).all()

    if not tokens:
        return  # no mobile devices registered for this user

    for push_token in tokens:
        try:
            response = PushClient().publish(
                PushMessage(
                    to=push_token.token,
                    title=title,
                    body=body,
                    data=data,
                    sound="default",
                )
            )
            response.validate_response()
            print(f"[Push:Mobile] ✓ Sent '{title}' to user {user_id}")

        except DeviceNotRegisteredError:
            # Token is no longer valid — remove to avoid future failed sends
            print(f"[Push:Mobile] ✗ Stale token removed for user {user_id}: {push_token.token[:30]}...")
            db.delete(push_token)
            db.commit()

        except PushServerError as e:
            print(f"[Push:Mobile] ✗ Expo server error for user {user_id}: {e}")

        except Exception as e:
            print(f"[Push:Mobile] ✗ Unexpected error for user {user_id}: {e}")
