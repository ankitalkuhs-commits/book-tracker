"""
Sprint 4F migration: create the three NEW automated accounts.

@TMRBot already exists (migrations/add_editorial_bot.py) — this script does not touch it.
The PM's SQL step flips its is_bot flag, renames it to "TrackMyRead Bestsellers" and rewrites
its bio (architecture.md §Data, E-9).

Every account created here is:
  * is_bot = True   — the single authority for everything a bot may and may not do (E-4, R-01)
  * is_admin = False — asserted by the deploy check (R-01)
  * given an UNUSABLE password: a random secret that is hashed and then thrown away, exactly as
    migrations/add_editorial_bot.py intends. There is no password login route in this API at
    all, so this is belt and braces; the bot signs in through /auth/bot-login (R-08).
  * given a bio that begins "Automated account." (E-9).

Idempotent: re-running it creates nothing and changes nothing.

    python -m migrations.add_bot_accounts          # uses DATABASE_URL
"""

import os
import secrets

from sqlmodel import Session, create_engine, select

from app import auth, crud, models

BOT_ACCOUNTS = (
    {
        "email": "tmrprompts@trackmyread.com",
        "name": "The Reading Prompt",
        "username": "TMRPrompts",
        "bio": "Automated account. One open question about reading, a few times a week.",
    },
    {
        "email": "tmrquotes@trackmyread.com",
        "name": "Margin Notes",
        "username": "TMRQuotes",
        "bio": "Automated account. A line worth keeping, from a book out of copyright.",
    },
    {
        "email": "tmrcircles@trackmyread.com",
        "name": "Circle Roundup",
        "username": "TMRCircles",
        "bio": "Automated account. What Literary Circles are reading, as counts and nothing else.",
    },
)


def create_bot_accounts(db: Session) -> list[models.User]:
    """Create any of BOT_ACCOUNTS that do not exist yet. Returns the three rows either way.

    Safe to call twice: an existing row is returned untouched, not re-created and not edited.
    """
    created_or_found = []
    for spec in BOT_ACCOUNTS:
        user = crud.get_user_by_email(db, email=spec["email"])
        if user is not None:
            created_or_found.append(user)
            continue

        # An unusable password: hash a value nobody holds, then drop it on the floor.
        unusable = auth.hash_password(secrets.token_urlsafe(48))
        user = crud.create_user(
            db, name=spec["name"], email=spec["email"], password_hash=unusable
        )
        user.username = spec["username"]
        user.bio = spec["bio"]
        user.is_bot = True
        user.is_admin = False
        db.add(user)
        db.commit()
        db.refresh(user)
        created_or_found.append(user)
    return created_or_found


def migrate() -> None:
    url = os.getenv("DATABASE_URL", "sqlite:///./book_tracker.db")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    engine = create_engine(url)
    with Session(engine) as db:
        rows = create_bot_accounts(db)
        for r in rows:
            print(f"[add_bot_accounts] {r.email} id={r.id} is_bot={r.is_bot} is_admin={r.is_admin}")
        bots = db.exec(select(models.User).where(models.User.is_bot == True)).all()  # noqa: E712
        print(f"[add_bot_accounts] rows with is_bot=true: {len(bots)}")


if __name__ == "__main__":
    migrate()
