"""
Expo Push Notification helper.
Sends push notifications to user devices via Expo's free push relay API.
Docs: https://docs.expo.dev/push-notifications/sending-notifications/
"""
import httpx
from typing import Optional

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_push_notification(
    token: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> None:
    """
    Fire-and-forget: send one push notification via Expo Push API.
    Silently swallows errors so a notification failure never crashes an endpoint.
    """
    if not token or not token.startswith("ExponentPushToken"):
        return  # Not a valid Expo token — skip silently

    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "priority": "default",
    }
    if data:
        payload["data"] = data

    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(
                EXPO_PUSH_URL,
                json=payload,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
    except Exception as e:
        print(f"[Push] Failed to send notification: {e}")


def send_push_to_many(tokens: list[str], title: str, body: str, data: Optional[dict] = None) -> None:
    """
    Send same notification to multiple tokens in one batched request (up to 100 per Expo spec).
    """
    valid_tokens = [t for t in tokens if t and t.startswith("ExponentPushToken")]
    if not valid_tokens:
        return

    messages = [
        {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
            "priority": "default",
            **({"data": data} if data else {}),
        }
        for token in valid_tokens
    ]

    # Expo allows max 100 per request — chunk if needed
    for i in range(0, len(messages), 100):
        chunk = messages[i : i + 100]
        try:
            with httpx.Client(timeout=10.0) as client:
                client.post(
                    EXPO_PUSH_URL,
                    json=chunk,
                    headers={"Accept": "application/json", "Content-Type": "application/json"},
                )
        except Exception as e:
            print(f"[Push] Batch send error: {e}")
