# app/routers/auth_router.py
import hashlib
import hmac
import os
import secrets
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from google.oauth2 import id_token
from google.auth.transport import requests
from ..database import get_session
from ..deps import get_db, get_current_user
from .. import crud, auth, models, localday
from .. import apple_keys                    # Sprint 4G: its own line, so this sprint's diff
                                             # over this file removes nothing (ST-4G-05)
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleAuthIn(BaseModel):
    token: str

class AppleAuthIn(BaseModel):
    # Sprint 4G (R-01, R-04). `full_name` is NOT in the identity token — Apple puts it on the
    # credential object, on the first authorization only — so it travels in the body, and is
    # read ONLY on a create path (R-07).
    identity_token: str
    nonce: str
    full_name: Optional[str] = None

class ReviewLoginIn(BaseModel):
    email: str
    secret: str

class BotLoginIn(BaseModel):
    email: str
    secret: str

class AccountDeletionRequest(BaseModel):
    email: str
    reason: str = None


@router.post("/google")
def google_auth(payload: GoogleAuthIn, db: Session = Depends(get_session)):
    """
    Verify Google OAuth token and create/login user.
    Accepts tokens from both Web and Android clients.
    """
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
        is_new_user = False

        if not user:
            # Create new user with a random password (since they're using OAuth)
            import secrets
            random_password = secrets.token_urlsafe(32)
            hashed = auth.hash_password(random_password)
            user = crud.create_user(db, name=name, email=email, password_hash=hashed)
            is_new_user = True
        
        # Login is activity on the reader's day, whatever their zone (R-10). No date comparison.
        user.last_active = localday.utcnow()
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create access token
        token = auth.create_access_token({"sub": user.email})
        return {"access_token": token, "is_new": is_new_user, "user": {"id": user.id, "name": user.name, "email": user.email}}

    except ValueError as e:
        # Invalid token
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Google authentication failed: {str(e)}")


def _review_login_config() -> tuple[Optional[str], list[str]]:
    """
    Read the review-login env vars on every request so tests can monkeypatch them
    and so an operator can set them on Render without a redeploy of this module.
    Returns (secret_or_None, allowlist) where allowlist is lowercased + trimmed
    and NOT yet domain-filtered.
    """
    secret = (os.getenv("REVIEW_LOGIN_SECRET") or "").strip()
    raw = os.getenv("REVIEW_LOGIN_EMAILS") or ""
    allowlist = [e.strip().lower() for e in raw.split(",") if e.strip()]
    return (secret or None), allowlist


TRACKMYREAD_DOMAIN = "@trackmyread.com"


@router.post("/review-login", include_in_schema=False)
def review_login(payload: ReviewLoginIn, db: Session = Depends(get_session)):
    """
    Password-style login for allowlisted @trackmyread.com QA / review accounts.
    Returns 404 unless BOTH REVIEW_LOGIN_SECRET and REVIEW_LOGIN_EMAILS are set,
    so the route is unusable in local dev, in tests, and in any fork.
    """
    configured_secret, allowlist = _review_login_config()

    # 1. Not opted in -> the route behaves as if it does not exist.
    if not configured_secret or not allowlist:
        raise HTTPException(status_code=404, detail="Not Found")

    # 2 + 3. Domain guard, allowlist membership and secret are all evaluated
    #        before a single 401 is raised, so the response cannot be used to
    #        tell "unknown email" from "wrong secret".
    email = payload.email.strip().lower()
    permitted = {e for e in allowlist if e.endswith(TRACKMYREAD_DOMAIN)}
    email_ok = email in permitted
    secret_ok = hmac.compare_digest(
        payload.secret.encode("utf-8"), configured_secret.encode("utf-8")
    )
    if not (email_ok and secret_ok):
        raise HTTPException(status_code=401, detail="Invalid review credentials")

    # 4. Find or create, exactly as /auth/google does.
    user = crud.get_user_by_email(db, email)
    is_new_user = False
    if not user:
        random_password = secrets.token_urlsafe(32)
        hashed = auth.hash_password(random_password)
        name = email.split("@")[0].title()          # review.reader -> Review.Reader
        user = crud.create_user(db, name=name, email=email, password_hash=hashed)
        is_new_user = True

    # Login is activity on the reader's day, whatever their zone (R-10). No date comparison.
    user.last_active = localday.utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)

    token = auth.create_access_token({"sub": user.email})
    return {
        "access_token": token,
        "is_new": is_new_user,
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }


def _bot_login_config() -> tuple[Optional[str], list[str]]:
    """Read the bot-login env vars on every request, for the same two reasons
    `_review_login_config` does: tests monkeypatch them, and clearing BOT_LOGIN_SECRET on
    Render is the emergency stop (R-14) and must not need a code deploy."""
    secret = (os.getenv("BOT_LOGIN_SECRET") or "").strip()
    raw = os.getenv("BOT_LOGIN_EMAILS") or ""
    allowlist = [e.strip().lower() for e in raw.split(",") if e.strip()]
    return (secret or None), allowlist


BOT_LOGIN_TOKEN_MINUTES = 15


@router.post("/bot-login", include_in_schema=False)
def bot_login(payload: BotLoginIn, db: Session = Depends(get_session)):
    """
    Sprint 4F (R-08). Exchange the shared BOT_LOGIN_SECRET for a 15-minute token for one
    allowlisted @trackmyread.com account whose row already has is_bot = true.

    Modelled on /auth/review-login and then tightened in two ways that matter:
      * it NEVER creates a user — review_login's find-or-create block is deliberately absent,
        because a login route that can conjure an account, driven by an env var an operator
        edits, is a different risk class (architecture §Security review 3.5);
      * it never writes last_active (R-12), so posting through the API does not make a bot
        look like an active reader.

    The token it mints is an ordinary user token and carries no scope claim (E-4). `user.is_bot`
    on the row is the single authority for everything the bot may and may not do.
    """
    configured_secret, allowlist = _bot_login_config()

    # 1. Not opted in -> the route behaves as if it does not exist. Local dev, CI and forks
    #    never have both set, so /auth/bot-login does not exist there.
    if not configured_secret or not allowlist:
        raise HTTPException(status_code=404, detail="Not Found")

    # 2. Domain guard, allowlist membership, the row's existence, the row's is_bot flag and the
    #    secret are ALL evaluated before a single 401 is raised, so the response cannot separate
    #    "unknown account" from "wrong secret".
    #    The domain guard is applied to the REQUEST, independently of the allowlist, so a
    #    typo'd BOT_LOGIN_EMAILS cannot admit an address outside the company domain.
    email = payload.email.strip().lower()
    email_ok = email in set(allowlist) and email.endswith(TRACKMYREAD_DOMAIN)
    user = crud.get_user_by_email(db, email) if email_ok else None
    row_ok = user is not None and bool(user.is_bot)
    secret_ok = hmac.compare_digest(
        payload.secret.encode("utf-8"), configured_secret.encode("utf-8")
    )
    if not (email_ok and row_ok and secret_ok):
        raise HTTPException(status_code=401, detail="Invalid bot credentials")

    # 3. No find-or-create. No last_active write. Just the short-lived token.
    token = auth.create_access_token(
        {"sub": user.email},
        expires_delta=timedelta(minutes=BOT_LOGIN_TOKEN_MINUTES),
    )
    return {
        "access_token": token,
        "expires_in": BOT_LOGIN_TOKEN_MINUTES * 60,
        "user": {"id": user.id, "email": user.email},
    }


def _apple_config() -> list[str]:
    """Read APPLE_AUDIENCES on every request, for the same two reasons `_bot_login_config`
    and `_review_login_config` are read per request: tests monkeypatch it, and an operator
    changes the bundle id on Render without a code deploy. Parsed like BOT_LOGIN_EMAILS
    (`:181-182`): comma-separated, trimmed, empties dropped.

    NOT defaulted to the bundle id. A silent default is how a staging build ends up
    accepting production tokens. Unset -> the route 404s (R-02)."""
    raw = os.getenv("APPLE_AUDIENCES") or ""
    return [a.strip() for a in raw.split(",") if a.strip()]


# R-01: one message for every failure. The route never reports WHICH check failed.
APPLE_INVALID_DETAIL = "Invalid Apple token"

# Sprint 4G, pm-decisions K-05. The claim is the primary rule and this domain is the floor
# under it: an address in this domain NEVER links, whatever `is_private_email` says.
APPLE_RELAY_DOMAIN = "privaterelay.appleid.com"

# R-07: branch 5's placeholder. A digest, not the raw subject, so the Apple subject is not
# sitting in a column clients can read; a subdomain this project owns and routes no mail to.
APPLE_PLACEHOLDER_DOMAIN = "users.noreply.trackmyread.com"


def _coerce_apple_bool(value) -> bool:
    """R-05. The account-takeover gate, and the sharpest edge in this sprint.

    Apple sends `email_verified` and `is_private_email` as the boolean `true` in some token
    shapes and as the STRING "true" in others, and python-jose passes strings through
    uncoerced (measured). So `if claims.get("email_verified"):` is TRUE for the string
    "false" — which links an unverified email onto an existing reader's row (F7).

    The only accepted forms are the literal True and "true" case-insensitively. Everything
    else — "false", False, None, absent, "1", 1, "" — is NOT verified.
    """
    if value is True:
        return True
    if isinstance(value, str):
        return value.strip().lower() == "true"
    return False


def _apple_placeholder_email(sub: str) -> str:
    """apple-<16 hex of a digest of the subject>@users.noreply.trackmyread.com

    A pure function of the subject, which is what makes branch 5 self-heal if the second
    commit is ever lost (architecture §"Why not one transaction")."""
    digest = hashlib.sha256(sub.encode("utf-8")).hexdigest()[:16]
    return f"apple-{digest}@{APPLE_PLACEHOLDER_DOMAIN}"


def _user_by_apple_sub(db: Session, sub: str) -> Optional[models.User]:
    """Branch 1's lookup. A named function so the suite can drive the concurrent-write race
    at the one seam where it happens (B-29)."""
    return db.exec(select(models.User).where(models.User.apple_sub == sub)).first()


@router.post("/apple")
def apple_auth(payload: AppleAuthIn, db: Session = Depends(get_session)):
    """
    Sprint 4G (R-01..R-08). Sign in with Apple, for the iOS client.

    Unlike /auth/review-login and /auth/bot-login this stays in the OpenAPI schema: it is a
    public reader-facing route like /auth/google.

    The linking rule is five ordered branches, first match wins (R-06, pm-decisions E-1):

      1. a row already carries this `apple_sub`  -> that reader. NO email is read at all.
      2. no match, and the row found by email    -> 401. An existing Apple identity is never
         carries a DIFFERENT `apple_sub`            overwritten.
      3. no match, email present, verified,      -> LINK: set `apple_sub` on that row and
         not a relay, and a row has that email      nothing else. The only branch that links.
      4. no match, email present and verified    -> create with that email.
      5. no match, no usable email               -> create with a synthesised placeholder.

    Branch 1 reading no email is the whole design: once a reader is known, a token whose
    `email` claim changed — they turned Hide My Email on, or changed their Apple ID address —
    must not move them to another row or rewrite their address.
    """
    audiences = _apple_config()

    # Not opted in -> the route behaves as if it does not exist, the same contract
    # /auth/review-login (`:137-138`) and /auth/bot-login (`:209-210`) already have. This is
    # what keeps Apple sign-in impossible in local dev, in CI and in a fork.
    if not audiences:
        raise HTTPException(status_code=404, detail="Not Found")

    try:
        claims = apple_keys.verify_identity_token(payload.identity_token, payload.nonce, audiences)
    except apple_keys.AppleKeysUnavailable:
        # Apple is unreachable. 503, never a token: "not fetched" must not become "not checked".
        raise HTTPException(status_code=503, detail="Apple sign-in temporarily unavailable")
    except apple_keys.AppleTokenInvalid:
        raise HTTPException(status_code=401, detail=APPLE_INVALID_DETAIL)

    # R-01: everything downstream keys off `sub`, so an absent or empty one is a 401.
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail=APPLE_INVALID_DETAIL)
    sub = sub.strip()

    # Trimmed, never case-folded: branch 3 matches rows that /auth/google created from the
    # address Google asserted (`:83` does no folding either), so folding here would be a new
    # normalisation on one side of the comparison only.
    raw_email = claims.get("email")
    email = raw_email.strip() if isinstance(raw_email, str) and raw_email.strip() else None
    verified = _coerce_apple_bool(claims.get("email_verified"))
    # The claim is the rule; the domain is the floor under it (pm-decisions K-05).
    # The domain half IS case-folded — a domain is case-insensitive, so a floor that only
    # recognised the lowercase spelling would not be a floor.
    is_relay = _coerce_apple_bool(claims.get("is_private_email")) or (
        email is not None and email.rsplit("@", 1)[-1].lower() == APPLE_RELAY_DOMAIN
    )

    user = _user_by_apple_sub(db, sub)                      # branch 1
    is_new = False

    if user is None:
        by_email = crud.get_user_by_email(db, email) if email else None

        if by_email is not None and by_email.apple_sub and by_email.apple_sub != sub:
            # branch 2. Never overwrite: this is an attacker-facing rule, not a tidiness one.
            raise HTTPException(status_code=401, detail=APPLE_INVALID_DETAIL)

        if email and verified and not is_relay and by_email is not None:
            # branch 3 — the ONLY branch that links, and the link is additive: it writes
            # `apple_sub` and nothing else. `full_name` is ignored here, or a request body
            # could rename an existing reader (R-07).
            user = by_email
        else:
            if email and verified:
                new_email = email                           # branch 4 (relay or real)
            else:
                new_email = _apple_placeholder_email(sub)    # branch 5
            name = payload.full_name or new_email.split("@")[0]
            random_password = secrets.token_urlsafe(32)
            user = crud.create_user(
                db, name=name, email=new_email, password_hash=auth.hash_password(random_password)
            )
            is_new = True

        # R-03: persisted in THIS request, before the token is returned. If this write is
        # lost, every later sign-in creates another account for ever (F4).
        user.apple_sub = sub

    # Login is activity on the reader's day, whatever their zone — /auth/google's rule at `:95`.
    user.last_active = localday.utcnow()
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent first sign-in with the same subject beat us to it. The unique index is
        # the control; this is follow_router.py:39-44's contract, so the loser gets one
        # deterministic error and never a second row.
        db.rollback()
        raise HTTPException(status_code=409, detail="Apple account already linked")
    db.refresh(user)

    # The ordinary 30-day reader token, carrying NO provider claim: get_current_user resolves
    # the row on every request (deps.py:76), so the row is the single authority.
    token = auth.create_access_token({"sub": user.email})
    return {
        "access_token": token,
        "is_new": is_new,
        # pm-decisions addendum Q-1: additive. `is_new` alone cannot tell a brand-new reader
        # from a Hide My Email duplicate, and the relay address is right there in the token.
        "private_relay": bool(is_relay),
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }


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
    # Sprint 4G (R-13). Apple requires an app that offers Sign in with Apple and account
    # deletion to revoke the reader's tokens as part of that deletion.
    #
    # Three properties, all of them load-bearing:
    #   * Gated on `apple_sub` — a Google-only reader's deletion makes NO outbound call and is
    #     byte-identical to today (B-41). A reader who never used Apple must cost nothing.
    #   * ABOVE the cascade — after the deletes below there is no `apple_sub` left to revoke.
    #   * Best effort — `revoke_token` returns instead of raising, so a failed, slow or
    #     unconfigured revocation cannot block the deletion. Guideline 5.1.1(v) is the
    #     stronger obligation of the two: a reader must be able to delete their account when
    #     Apple is down (B-42).
    #
    # `client_id` is the first configured audience, i.e. the bundle id (architecture E-2
    # item 5). With `APPLE_AUDIENCES` unset there is no client id to present and nothing is
    # sent, which is the same inert state an unset `APPLE_PRIVATE_KEY` produces.
    if current_user.apple_sub:
        _apple_audiences = _apple_config()
        apple_keys.revoke_token(
            current_user.apple_sub, _apple_audiences[0] if _apple_audiences else ""
        )

    uid = current_user.id

    # F-50: group activity rows this user triggered, in any group (delete before the
    # created-groups loop, which handles activity scoped to groups this user created).
    for row in db.exec(select(models.GroupActivity).where(models.GroupActivity.user_id == uid)).all():
        db.delete(row)

    # Groups created by this user — delete activity, members + posts first, then the group
    created_groups = db.exec(
        select(models.ReadingGroup).where(models.ReadingGroup.created_by == uid)
    ).all()
    for g in created_groups:
        for row in db.exec(select(models.GroupActivity).where(models.GroupActivity.group_id == g.id)).all():
            db.delete(row)
        for m in db.exec(select(models.GroupMember).where(models.GroupMember.group_id == g.id)).all():
            db.delete(m)
        for p in db.exec(select(models.GroupPost).where(models.GroupPost.group_id == g.id)).all():
            db.delete(p)
        db.delete(g)

    # F-50: before deleting the user's own GroupMember rows — pending invites this user sent
    # (in any group) are removed; accepted/active ones keep the row, just lose the inviter.
    for row in db.exec(select(models.GroupMember).where(
        models.GroupMember.invited_by == uid, models.GroupMember.status == "pending"
    )).all():
        db.delete(row)
    for row in db.exec(select(models.GroupMember).where(models.GroupMember.invited_by == uid)).all():
        row.invited_by = None
        db.add(row)

    # Delete in dependency order to avoid FK violations
    for model_cls, col in [
        (models.NotificationLog, models.NotificationLog.user_id),
        (models.GroupPost,        models.GroupPost.user_id),
        (models.GroupMember,      models.GroupMember.user_id),
    ]:
        for row in db.exec(select(model_cls).where(col == uid)).all():
            db.delete(row)

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

    # F-50: before the userbook delete — group posts referencing this user's userbooks are
    # detached, not deleted (a group post is another user's content too).
    userbook_ids = [ub.id for ub in db.exec(select(models.UserBook).where(models.UserBook.user_id == uid)).all()]
    if userbook_ids:
        for row in db.exec(select(models.GroupPost).where(models.GroupPost.userbook_id.in_(userbook_ids))).all():
            row.userbook_id = None
            db.add(row)

    # Reading activity + userbooks
    for row in db.exec(select(models.ReadingActivity).where(models.ReadingActivity.user_id == uid)).all():
        db.delete(row)
    # Journal entries reference a userbook (entry_id) and this user (user_id); they must go
    # before the userbook delete below.
    for row in db.exec(select(models.Journal).where(models.Journal.user_id == uid)).all():
        db.delete(row)
    for row in db.exec(select(models.UserBook).where(models.UserBook.user_id == uid)).all():
        db.delete(row)

    # Finally delete the user
    user = db.get(models.User, uid)
    if user:
        db.delete(user)
    db.commit()

    return {"message": "Account deleted"}
