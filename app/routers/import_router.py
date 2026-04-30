# app/routers/import_router.py
"""
Goodreads CSV import endpoint.

Goodreads CSV columns (exact, as of 2024 export format):
  Book Id, Title, Author, Author l-f, Additional Authors,
  ISBN, ISBN13, My Rating, Average Rating, Publisher, Binding,
  Number of Pages, Year Published, Original Publication Year,
  Date Read, Date Added, Bookshelves, Bookshelves with positions,
  Exclusive Shelf, My Review, Spoiler, Private Notes,
  Read Count, Owned Copies
"""

import csv
import io
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user
from .. import models

router = APIRouter(prefix="/import", tags=["import"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean_isbn(raw: str) -> Optional[str]:
    """Strip Goodreads/Excel quoting: =""1234567890"" → 1234567890"""
    if not raw:
        return None
    cleaned = re.sub(r'[="\'\\s]', '', raw).strip()
    return cleaned if cleaned else None


def _parse_gr_date(raw: str) -> Optional[datetime]:
    """Parse Goodreads date strings: YYYY/MM/DD or YYYY-MM-DD"""
    if not raw or raw.strip() == '':
        return None
    for fmt in ('%Y/%m/%d', '%Y-%m-%d', '%m/%d/%Y'):
        try:
            return datetime.strptime(raw.strip(), fmt)
        except ValueError:
            continue
    return None


def _map_status(exclusive_shelf: str) -> str:
    """Map Goodreads shelf name → TrackMyRead status."""
    mapping = {
        'read':             'finished',
        'currently-reading':'reading',
        'to-read':          'to-read',
    }
    return mapping.get(exclusive_shelf.strip().lower(), 'to-read')


def _map_format(binding: str) -> str:
    """Map Goodreads binding → TrackMyRead format."""
    b = binding.strip().lower()
    if 'kindle' in b:   return 'kindle'
    if 'ebook' in b:    return 'ebook'
    if 'audio' in b:    return 'audiobook'
    if 'paper' in b:    return 'paperback'
    if 'hard' in b:     return 'hardcover'
    return 'paperback'


def _cover_url_from_isbn(isbn13: Optional[str], isbn: Optional[str]) -> Optional[str]:
    """
    Build a cover URL from ISBN using Open Library Covers API.
    No API key required — returns None if no ISBN available.
    """
    target = isbn13 or isbn
    if not target:
        return None
    return f"https://covers.openlibrary.org/b/isbn/{target}-L.jpg"


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/goodreads")
async def import_goodreads_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
):
    """
    Upload a Goodreads library export CSV and import books into the user's library.

    - Skips books already in the user's library (matched by ISBN, then title+author).
    - Imports status, rating, date read, and review text (as a private note).
    - Returns a summary: { imported, skipped, failed, total }.
    """
    # ── Validate file type ────────────────────────────────────────────────────
    filename = file.filename or ''
    if not filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a .csv export from Goodreads")

    raw_bytes = await file.read()

    # ── Decode — try UTF-8 first, fall back to latin-1 ───────────────────────
    try:
        content = raw_bytes.decode('utf-8-sig')   # utf-8-sig strips BOM if present
    except UnicodeDecodeError:
        content = raw_bytes.decode('latin-1')

    reader = csv.DictReader(io.StringIO(content))

    # ── Validate that this looks like a Goodreads export ─────────────────────
    required_cols = {'Title', 'Author', 'Exclusive Shelf'}
    if not required_cols.issubset(set(reader.fieldnames or [])):
        raise HTTPException(
            status_code=400,
            detail="This doesn't look like a Goodreads export. Required columns missing: Title, Author, Exclusive Shelf"
        )

    imported = 0
    skipped  = 0
    failed   = []

    # Pre-fetch all of this user's book_ids for fast dedup check
    existing_book_ids: set[int] = set(
        row.book_id
        for row in db.exec(
            select(models.UserBook).where(models.UserBook.user_id == current_user.id)
        ).all()
    )

    # Also pre-fetch all Book ISBNs for global book dedup
    # (avoid creating duplicate Book records)

    for row_num, row in enumerate(reader, start=2):  # start=2 because row 1 is header
        title  = (row.get('Title') or '').strip()
        author = (row.get('Author') or row.get('Author l-f') or '').strip()

        if not title:
            failed.append({"row": row_num, "reason": "Missing title"})
            continue

        try:
            isbn13 = _clean_isbn(row.get('ISBN13', ''))
            isbn   = _clean_isbn(row.get('ISBN', ''))
            rating_raw = row.get('My Rating', '0').strip()
            rating = int(rating_raw) if rating_raw.isdigit() and rating_raw != '0' else None
            pages_raw = row.get('Number of Pages', '').strip()
            total_pages = int(pages_raw) if pages_raw.isdigit() else None
            status     = _map_status(row.get('Exclusive Shelf', 'to-read'))
            fmt        = _map_format(row.get('Binding', ''))
            date_read  = _parse_gr_date(row.get('Date Read', ''))
            date_added = _parse_gr_date(row.get('Date Added', ''))
            review     = (row.get('My Review') or '').strip()
            publisher  = (row.get('Publisher') or '').strip() or None
            year_pub   = (row.get('Year Published') or '').strip() or None

            # ── 1. Find or create the global Book record ──────────────────────
            book: Optional[models.Book] = None

            # Search by ISBN13 first, then ISBN
            for isbn_val in filter(None, [isbn13, isbn]):
                book = db.exec(
                    select(models.Book).where(models.Book.isbn == isbn_val)
                ).first()
                if book:
                    break

            # Fall back: exact title + author match
            if not book:
                book = db.exec(
                    select(models.Book).where(
                        models.Book.title == title,
                        models.Book.author == author,
                    )
                ).first()

            # Create a new Book record if still not found
            if not book:
                cover = _cover_url_from_isbn(isbn13, isbn)
                book = models.Book(
                    title=title,
                    author=author or None,
                    isbn=isbn13 or isbn or None,
                    cover_url=cover,
                    total_pages=total_pages,
                    publisher=publisher,
                    published_date=year_pub,
                    format=fmt,
                )
                db.add(book)
                db.flush()   # get book.id without a full commit

            # ── 2. Check if user already has this book ────────────────────────
            if book.id in existing_book_ids:
                skipped += 1
                continue

            # Double-check via DB (handles race conditions / same session)
            existing_ub = db.exec(
                select(models.UserBook).where(
                    models.UserBook.user_id == current_user.id,
                    models.UserBook.book_id == book.id,
                )
            ).first()
            if existing_ub:
                skipped += 1
                continue

            # ── 3. Create UserBook ────────────────────────────────────────────
            ub = models.UserBook(
                user_id=current_user.id,
                book_id=book.id,
                status=status,
                rating=rating,
                format=fmt,
                ownership_status='owned',
                # Use date_added as created_at proxy; date_read as updated_at for finished
                created_at=date_added or datetime.utcnow(),
                updated_at=date_read if status == 'finished' else None,
                # Set current_page = total_pages for finished books
                current_page=total_pages if status == 'finished' else None,
            )
            db.add(ub)
            db.flush()   # get ub.id

            existing_book_ids.add(book.id)

            # ── 4. Import review as a Note (private, not public) ──────────────
            if review:
                note = models.Note(
                    userbook_id=ub.id,
                    user_id=current_user.id,
                    text=review,
                    is_public=False,
                    created_at=date_read or date_added or datetime.utcnow(),
                )
                db.add(note)

            imported += 1

        except Exception as e:
            failed.append({"row": row_num, "title": title, "reason": str(e)})
            continue

    db.commit()

    return {
        "imported": imported,
        "skipped":  skipped,
        "failed":   len(failed),
        "total":    imported + skipped + len(failed),
        "errors":   failed[:10],   # cap at 10 so response stays small
    }
