# app/notifications/push_web.py
"""
Web Push notification sender for the PWA.
Uses the VAPID protocol (pywebpush library).

Setup:
  1. pip install pywebpush  (already in requirements.txt)
  2. Generate keys once:
       python -c "
       from py_vapid import Vapid
       v = Vapid()
       v.generate_keys()
       v.save_key('private_key.pem')
       v.save_public_key('public_key.pem')
       print('Private:', open('private_key.pem').read())
       print('Public:', v.public_key.decode())
       "
  3. Add to .env:
       VAPID_PRIVATE_KEY=<contents of private_key.pem>
       VAPID_CONTACT_EMAIL=you@yourdomain.com

  4. Add VAPID_PUBLIC_KEY to frontend so it can subscribe.

PWA frontend flow (when implemented):
  1. Call /notifications/vapid-public-key to get the public key
  2. Browser subscribes via PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  3. POST the subscription object to /notifications/web-subscribe
  4. Backend stores it as a PushToken with token_type='web'
"""
import json
import os
from typing import Optional
from sqlmodel import Session, select


# Loaded once at startup — set these env vars on Render
VAPID_PRIVATE_KEY: Optional[str] = os.getenv("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY: Optional[str] = os.getenv("VAPID_PUBLIC_KEY")
VAPID_CONTACT_EMAIL: str = os.getenv("VAPID_CONTACT_EMAIL", "admin@trackmyread.com")


def send_web_push(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    data: dict,
) -> None:
    """
    Send a Web Push notification to all PWA-subscribed browsers for a user.
    Requires VAPID_PRIVATE_KEY env var to be set.
    Silently skips if no VAPID key configured yet.
    """
    if not VAPID_PRIVATE_KEY:
        # Web push not configured yet — skip silently, don't block mobile
        return

    from ..models import PushToken  # deferred to avoid circular imports

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        print("[Push:Web] pywebpush not installed — skipping web push")
        return

    tokens = db.exec(
        select(PushToken).where(
            PushToken.user_id == user_id,
            PushToken.token_type == "web",
        )
    ).all()

    if not tokens:
        return  # no PWA subscriptions for this user

    vapid_claims = {"sub": f"mailto:{VAPID_CONTACT_EMAIL}"}
    payload = json.dumps({"title": title, "body": body, **data})

    for push_token in tokens:
        try:
            subscription = json.loads(push_token.token)

            webpush(
                subscription_info=subscription,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=vapid_claims,
            )
            print(f"[Push:Web] ✓ Sent '{title}' to user {user_id}")

        except Exception as e:
            error_str = str(e)
            if "410" in error_str or "404" in error_str:
                # Subscription expired — browser unsubscribed
                print(f"[Push:Web] ✗ Expired web subscription removed for user {user_id}")
                db.delete(push_token)
                db.commit()
            else:
                print(f"[Push:Web] ✗ Error for user {user_id}: {e}")
