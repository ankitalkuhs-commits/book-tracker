"""Sprint 4F (R-15): what a bot has already posted.

The bot holds no database credential (E-5/E-7 — the repository is public), so the only way it
can filter its candidate pool before it composes anything is to ask the API. This is that one
read-only endpoint. It is bot-only: nothing in it is a reader's data, but it exists for the
bots and should not be a public surface.

The guard here is the OPPOSITE sense to `deps.deny_bot_actor`, which 403s a bot. This route
403s a *reader*. The two must never be confused, so this route deliberately does not use a
shared dependency — the check is three lines in the handler, right where it is read.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text as sql_text
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, select

from .. import models
from ..deps import get_db, get_current_user

router = APIRouter(prefix="/bots", tags=["bots"])

# The content types bot_post.content_type may hold. An unknown one returns an empty list
# rather than a 500 — a run asking about a type nobody has posted is a normal state.
CONTENT_TYPES = ("bestseller", "prompt", "quote", "circles")

# R-14/R-15: @TMRBot's pre-4F history lives in `editorial_post.nyt_isbn` (created by
# migrations/add_editorial_bot.py, which has no SQLModel — the table is read-only history and
# 4F writes nothing to it). A bestseller the old bot already posted must never come back, so
# the union is computed here, server-side, once, rather than by every caller.
LEGACY_BESTSELLER_SQL = "SELECT nyt_isbn, posted_at FROM editorial_post"


@router.get("/posted", status_code=status.HTTP_200_OK)
def bots_posted(
    content_type: str = Query(..., min_length=1, max_length=32),
    since: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """The dedup_keys already used for `content_type` since `since`."""
    if not current_user.is_bot:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Automated accounts only",
        )

    if content_type not in CONTENT_TYPES:
        return {"dedup_keys": []}

    stmt = select(models.BotPost.dedup_key).where(models.BotPost.content_type == content_type)
    if since is not None:
        stmt = stmt.where(models.BotPost.posted_at >= _naive(since))
    keys = set(db.exec(stmt).all())

    if content_type == "bestseller":
        keys |= _legacy_bestseller_keys(db, since)

    return {"dedup_keys": sorted(keys)}


def _naive(value: datetime) -> datetime:
    """Instants are naive UTC throughout this codebase (localday.py's convention)."""
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


def _legacy_bestseller_keys(db: Session, since: Optional[datetime]) -> set:
    try:
        rows = db.exec(sql_text(LEGACY_BESTSELLER_SQL)).all()
    except SQLAlchemyError:
        # editorial_post predates SQLModel metadata and is absent on a fresh database. An
        # absent legacy table means no legacy history, not a 500 — but the failed statement
        # must not poison the session.
        db.rollback()
        return set()
    cutoff = _naive(since) if since is not None else None
    out = set()
    for isbn, posted_at in rows:
        if not isbn:
            continue
        if cutoff is not None and posted_at is not None:
            when = posted_at if isinstance(posted_at, datetime) else None
            if when is not None and _naive(when) < cutoff:
                continue
        out.add(f"bestseller:{isbn}")
    return out
