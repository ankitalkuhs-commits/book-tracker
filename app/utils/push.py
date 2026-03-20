"""
Expo Push Notification helper.
Sends push notifications to user devices via Expo's free push relay API.
Docs: https://docs.expo.dev/push-notifications/sending-notifications/
"""
from typing import Optional
from exponent_server_sdk import (
    DeviceNotRegisteredError,
    PushClient,
    PushMessage,
    PushServerError,
)
from sqlalchemy.orm import Session
from sqlmodel import select


def send_push_notification_to_user(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> None:
    """
    Send a push notification to all devices of a user.
    Automatically removes stale tokens that are no longer valid.
    """
    from ..models import PushToken  # Import here to avoid circular imports

    tokens = db.exec(select(PushToken).where(PushToken.user_id == user_id)).all()

    if not tokens:
        print(f"[Push] No tokens found for user {user_id}")
        return

    for push_token in tokens:
        try:
            response = PushClient().publish(
                PushMessage(
                    to=push_token.token,
                    title=title,
                    body=body,
                    data=data or {},
                    sound="default",
                )
            )
            response.validate_response()
            print(f"[Push] ✓ Sent to user {user_id}: {title}")

        except DeviceNotRegisteredError:
            # Token is stale — remove it from DB
            print(f"[Push] ✗ Stale token removed for user {user_id}")
            db.delete(push_token)
            db.commit()

        except PushServerError as e:
            print(f"[Push] ✗ Server error for user {user_id}: {e}")

        except Exception as e:
            print(f"[Push] ✗ Unexpected error for user {user_id}: {e}")


def send_push_notification(
    token: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> None:
    """
    Send to a single token (backward compatibility for admin broadcast).
    Fire-and-forget: silently swallows errors.
    """
    if not token or not token.startswith(("ExponentPushToken", "ExpoPushToken")):
        return  # Not a valid Expo token — skip silently

    try:
        response = PushClient().publish(
            PushMessage(
                to=token,
                title=title,
                body=body,
                data=data or {},
                sound="default",
            )
        )
        response.validate_response()
        print(f"[Push] Sent '{title}' to {token[:30]}...")

    except DeviceNotRegisteredError:
        print(f"[Push] Device not registered: {token[:30]}...")

    except Exception as e:
        print(f"[Push] Failed to send notification: {e}")


def send_push_to_many(tokens: list[str], title: str, body: str, data: Optional[dict] = None) -> None:
    """
    Send same notification to multiple tokens in one batched request (up to 100 per Expo spec).
    Used for admin broadcasts.
    """
    valid_tokens = [t for t in tokens if t and t.startswith(("ExponentPushToken", "ExpoPushToken"))]
    if not valid_tokens:
        return

    # Expo allows max 100 per request — chunk if needed
    for i in range(0, len(valid_tokens), 100):
        chunk = valid_tokens[i : i + 100]
        messages = [
            PushMessage(to=token, title=title, body=body, data=data or {}, sound="default")
            for token in chunk
        ]

        try:
            PushClient().publish_multiple(messages)
            print(f"[Push] Batch sent {len(chunk)} notification(s)")
        except Exception as e:
            print(f"[Push] Batch send error: {e}")
