# app/routers/googlebooks_router.py
"""
Router for Google Books API integration.

Search strategy (optimized for novel readers):
- ISBN-pattern queries → routed to isbn: field qualifier for exact lookup
- Genre chip selected  → subject:<genre> qualifier appended
- Default (no genre)   → subject:fiction bias to suppress textbooks/academic noise
- Always fetch 40 from Google, filter noise, re-rank by novel-friendliness, return top N
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
import httpx
import os
import re
import asyncio
import hashlib
import secrets
import time
from pydantic import BaseModel
from ..deps import get_current_user_optional

router = APIRouter(prefix="/api/googlebooks", tags=["Google Books"])

GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")

# ── F-29: anonymous quota ───────────────────────────────────────────────────────
ANON_CALLS_PER_WINDOW = 2
ANON_WINDOW_SECONDS = 24 * 60 * 60
_anon_calls: dict[str, list[float]] = {}   # salted ip-hash -> call times. In-process only: resets on Render restart/sleep (PM-accepted).
_IP_SALT = secrets.token_bytes(16)          # per process, so hashes cannot be reversed from a memory dump
_clock = time.time                          # tests monkeypatch this


def _caller_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    # Right-most X-Forwarded-For entry: the one Render's proxy appends. Everything to its left is
    # caller-supplied and forgeable (resolved, orchestrator default 2026-09-13).
    hops = [h.strip() for h in fwd.split(",") if h.strip()]
    ip = hops[-1] if hops else (request.client.host if request.client else "unknown")
    return hashlib.sha256(_IP_SALT + ip.encode()).hexdigest()


def _consume_anonymous_call(request: Request) -> None:
    now = _clock()
    key = _caller_key(request)
    recent = [t for t in _anon_calls.get(key, ()) if now - t < ANON_WINDOW_SECONDS]
    if len(recent) >= ANON_CALLS_PER_WINDOW:
        _anon_calls[key] = recent
        raise HTTPException(status_code=401, detail={"code": "login_required", "message": "Log in to keep searching"})
    recent.append(now)
    _anon_calls[key] = recent
    if len(_anon_calls) > 10_000:           # bound memory: drop callers with no call inside the window
        for k in [k for k, ts in _anon_calls.items() if not ts or now - ts[-1] >= ANON_WINDOW_SECONDS]:
            del _anon_calls[k]


MAX_START_INDEX = 1000   # F-54: Google yields nothing useful this deep; short-circuit instead of erroring

if not GOOGLE_BOOKS_API_KEY:
    print("WARNING: GOOGLE_BOOKS_API_KEY not set. Google Books API may be rate-limited.")

# ── Genre → Google Books subject qualifier ─────────────────────────────────────
GENRE_SUBJECTS: dict[str, str] = {
    "fiction":    "fiction",
    "fantasy":    "fantasy fiction",
    "mystery":    "mystery fiction",
    "thriller":   "thriller",
    "sci-fi":     "science fiction",
    "romance":    "romance",
    "historical": "historical fiction",
    "literary":   "literary fiction",
}

# ── Categories that strongly suggest a novel/fiction work ─────────────────────
NOVEL_CATEGORY_SIGNALS = frozenset([
    "fiction", "novel", "fantasy", "science fiction", "mystery", "thriller",
    "romance", "historical fiction", "literary fiction", "horror", "adventure",
    "young adult", "crime", "suspense", "magical realism", "dystopian",
    "contemporary fiction", "drama", "classic", "short stories",
])

# ── Categories that strongly suggest non-novel / noise ────────────────────────
NOISE_CATEGORY_SIGNALS = frozenset([
    "mathematics", "technology", "engineering", "medical", "law",
    "education", "reference", "computers", "business", "economics",
    "self-help", "political science", "psychology", "religion",
    "sports", "cooking", "art", "study aids", "juvenile nonfiction",
    "biography", "true crime", "textbooks",
])

# ── Title patterns that indicate noise (study guides, summaries, etc.) ─────────
_NOISE_TITLE_RE = re.compile(
    r"\b(study guide|cliffs\s?notes|sparknotes|workbook|test prep|"
    r"answer key|critical essays|summary and analysis|teacher.{0,5}guide|"
    r"reading guide|book club guide|questions and answers|"
    r"the complete guide to|encyclopedia of|dictionary of)\b",
    re.IGNORECASE,
)

# ── ISBN detection: 10 or 13 digits, optional hyphens/spaces ──────────────────
def _is_isbn(query: str) -> bool:
    cleaned = re.sub(r"[-\s]", "", query)
    return bool(re.match(r"^\d{10}$", cleaned) or re.match(r"^\d{13}$", cleaned))


def _build_query(raw: str, genre: Optional[str]) -> str:
    """
    Build the best Google Books `q` string for novel readers.

    Rules:
    - ISBN detected → isbn:<digits>
    - genre chip selected → <raw> + subject:<genre_subject>
    - default → <raw> + subject:fiction  (suppresses most academic noise)
    - never double-add qualifiers if user already typed one (inauthor:, intitle:, isbn:)
    """
    q = raw.strip()

    # 1. ISBN shortcut — exact lookup, no subject qualifier needed
    if _is_isbn(q):
        return f"isbn:{re.sub(r'[-s]', '', q)}"

    # 2. User already typed a field qualifier — respect it as-is
    qualifier_re = re.compile(r"\b(inauthor|intitle|subject|isbn|inpublisher):", re.IGNORECASE)
    if qualifier_re.search(q):
        return q

    # 3. Genre chip provided
    if genre and genre != "all" and genre in GENRE_SUBJECTS:
        return f"{q}+subject:{GENRE_SUBJECTS[genre]}"

    # 4. Default: fiction bias — the single biggest quality improvement for novel readers
    return f"{q}+subject:fiction"


def _novel_score(result: dict) -> int:
    """
    Score a processed result for novel-reader relevance.
    Used to re-rank results after fetching from Google.
    """
    score = 0
    categories_raw: List[str] = result.get("categories") or []
    # Flatten hierarchical Google categories like "Fiction / Fantasy" → ["Fiction", "Fantasy"]
    categories: List[str] = []
    for cat in categories_raw:
        categories.extend(part.strip().lower() for part in cat.split("/"))

    # Cover image is table stakes for a good reading app
    if result.get("cover_url"):
        score += 3

    # Description present
    if result.get("description"):
        score += 2

    # Page count in the range typical for novels (100–1400)
    pages: int = result.get("total_pages") or 0
    if 100 <= pages <= 1400:
        score += 2
    elif pages > 0:
        score += 1  # has pages but outside typical novel range

    # Fiction/novel category match
    for cat in categories:
        if any(signal in cat for signal in NOVEL_CATEGORY_SIGNALS):
            score += 5
            break

    # Noise category — heavily penalise
    for cat in categories:
        if any(signal in cat for signal in NOISE_CATEGORY_SIGNALS):
            score -= 10
            break

    # Rating signal (social proof)
    rating: float = result.get("average_rating") or 0.0
    n_ratings: int = result.get("ratings_count") or 0
    if rating >= 4.0 and n_ratings >= 100:
        score += 3
    elif rating >= 3.5 and n_ratings >= 20:
        score += 1

    return score


def _is_noise_title(title: str) -> bool:
    return bool(_NOISE_TITLE_RE.search(title))


def normalize_google_cover_url(cover_url: Optional[str]) -> Optional[str]:
    """
    Convert old-style books.google.com/books/content?id=XXX URLs to the
    modern CDN format. Also normalises http → https.
    """
    if not cover_url:
        return None
    if "books.google.com/books/publisher/content/images/frontcover/" in cover_url:
        return cover_url
    if "books.google.com/books/content" in cover_url:
        m = re.search(r"[?&]id=([^&]+)", cover_url)
        if m:
            google_id = m.group(1)
            return f"https://books.google.com/books/publisher/content/images/frontcover/{google_id}?fife=w300-h450"
    return cover_url.replace("http://", "https://")


def _cover_from_volume(google_id: str, image_links: Optional[dict]) -> Optional[str]:
    """Google's front-cover CDN answers 200 with an 'image not available' PNG for volumes that
    have no imageLinks, which defeats every client's onError fallback. Only build a URL when
    Google says an image exists."""
    if not image_links:
        return None
    raw = (image_links.get("large") or image_links.get("medium")
           or image_links.get("thumbnail") or image_links.get("smallThumbnail"))
    if not raw:
        return None
    return normalize_google_cover_url(
        f"https://books.google.com/books/content?id={google_id}" if google_id else raw)


class GoogleBookResult(BaseModel):
    google_id: str
    title: str
    authors: Optional[List[str]] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    total_pages: Optional[int] = None
    publisher: Optional[str] = None
    published_date: Optional[str] = None
    average_rating: Optional[float] = None
    ratings_count: Optional[int] = None
    isbn_10: Optional[str] = None
    isbn_13: Optional[str] = None
    categories: Optional[List[str]] = None   # NEW — primary genre tags


class GoogleBooksSearchResponse(BaseModel):
    results: List[GoogleBookResult]
    total_items: int
    query_used: str          # resolved query for debugging
    has_more: bool           # whether more pages are likely available
    next_start_index: int    # pass this back as start_index to get the next page


@router.get("/search", response_model=GoogleBooksSearchResponse)
async def search_google_books(
    query: str,
    request: Request,
    max_results: int = 10,            # results to return per page
    start_index: int = 0,             # pagination offset (pass next_start_index from previous response)
    genre: Optional[str] = None,      # fiction|fantasy|mystery|thriller|sci-fi|romance|historical|literary|all
    order_by: str = "relevance",       # relevance|newest
    filter_noise: bool = True,         # apply noise filtering + re-ranking
    current_user=Depends(get_current_user_optional),
):
    """
    Search for books using Google Books API — optimised for novel readers.

    Pagination: each call fetches a 40-item window from Google starting at
    `start_index`. Pass the returned `next_start_index` on the next call to
    get the following page. `has_more` tells the client whether to offer a
    "load more" button.

    Quality pipeline per page:
    - ISBN detection → exact isbn: lookup (no subject bias needed)
    - Genre chip → subject:<genre> qualifier
    - Default → subject:fiction bias (suppresses textbooks / study guides)
    - Noise title filter (study guides, CliffsNotes, workbooks…)
    - Re-rank by novel-friendliness (cover + fiction category + page range + rating)
    - Returns categories so clients can render genre badges on cards
    """
    if not query or len(query.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters")

    # F-29: the quota check sits outside the try below, so its 401 is never re-wrapped.
    if current_user is None:
        _consume_anonymous_call(request)

    if max_results < 1 or max_results > 40:
        max_results = 10

    if start_index < 0:
        start_index = 0

    # F-54: Google yields nothing useful this deep — short-circuit instead of a 500.
    if start_index >= MAX_START_INDEX:
        return GoogleBooksSearchResponse(
            results=[], total_items=0, query_used=_build_query(query, genre),
            has_more=False, next_start_index=start_index,
        )

    # Fetch Google's maximum per request so we have the most to filter/re-rank
    google_fetch = 40

    resolved_query = _build_query(query, genre)
    order_param = "newest" if order_by == "newest" else "relevance"

    url = "https://www.googleapis.com/books/v1/volumes"
    params = {
        "q": resolved_query,
        "maxResults": google_fetch,
        "startIndex": start_index,       # pagination window
        "printType": "books",
        "langRestrict": "en",
        "orderBy": order_param,
        "key": GOOGLE_BOOKS_API_KEY,
    }

    try:
        async with httpx.AsyncClient() as client:
            for attempt in range(3):
                response = await client.get(url, params=params, timeout=15.0)
                if response.status_code == 200:
                    break
                if response.status_code == 503 and attempt < 2:
                    print(f"[GoogleBooks] 503 for q='{resolved_query}', retry {attempt + 1}/2")
                    await asyncio.sleep(1)
                    continue
                print(f"[GoogleBooks] Error {response.status_code}: {response.text[:300]}")
                raise HTTPException(status_code=502, detail=f"Google Books API error {response.status_code}")
            data = response.json()

        total_items = data.get("totalItems", 0)
        items = data.get("items", [])

        # ── Parse all items ────────────────────────────────────────────────────
        parsed: List[dict] = []
        for item in items:
            vi = item.get("volumeInfo", {})
            google_id = item.get("id", "")

            # Cover URL — F-19: null when Google has no imageLinks, rather than a URL that
            # answers 200 with an "image not available" placeholder.
            cover_url = _cover_from_volume(google_id, vi.get("imageLinks"))

            # ISBNs
            isbn_10 = isbn_13 = None
            for ident in vi.get("industryIdentifiers", []):
                if ident.get("type") == "ISBN_10":
                    isbn_10 = ident.get("identifier")
                elif ident.get("type") == "ISBN_13":
                    isbn_13 = ident.get("identifier")

            # Description — truncate for storage
            description = vi.get("description", "") or ""
            if len(description) > 600:
                description = description[:597] + "..."

            # Categories — keep raw Google strings (client can display/filter)
            categories: List[str] = vi.get("categories") or []

            parsed.append({
                "google_id": google_id,
                "title": vi.get("title", "Unknown Title"),
                "authors": vi.get("authors", []),
                "description": description or None,
                "cover_url": cover_url,
                "total_pages": vi.get("pageCount"),
                "publisher": vi.get("publisher"),
                "published_date": vi.get("publishedDate"),
                "average_rating": vi.get("averageRating"),
                "ratings_count": vi.get("ratingsCount"),
                "isbn_10": isbn_10,
                "isbn_13": isbn_13,
                "categories": categories,
            })

        # ── Noise filtering + re-ranking ───────────────────────────────────────
        if filter_noise:
            # Step 1: drop obvious noise titles (study guides, summaries, etc.)
            parsed = [r for r in parsed if not _is_noise_title(r["title"])]

            # Step 2: score and sort — best novel-relevant results first
            parsed.sort(key=_novel_score, reverse=True)

        # ── Return top N ───────────────────────────────────────────────────────
        results = [GoogleBookResult(**r) for r in parsed[:max_results]]

        # Pagination: next window starts where this one ended in Google's index
        next_start = start_index + google_fetch
        has_more = total_items > next_start and next_start < MAX_START_INDEX

        return GoogleBooksSearchResponse(
            results=results,
            total_items=total_items,
            query_used=resolved_query,
            has_more=has_more,
            next_start_index=next_start,
        )

    except HTTPException:
        raise                                   # keep our own 502 instead of rewrapping it as 500
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Google Books is unavailable right now")
    except Exception:
        raise HTTPException(status_code=502, detail="Google Books returned an unexpected response")


@router.get("/book/{google_book_id}", response_model=GoogleBookResult)
async def get_book_details(
    google_book_id: str,
    request: Request,
    current_user=Depends(get_current_user_optional),
):
    """Get detailed information about a specific book by Google Books ID."""
    # F-29: the quota check is the first line, outside the try, so its 401 is never re-wrapped.
    if current_user is None:
        _consume_anonymous_call(request)

    url = f"https://www.googleapis.com/books/v1/volumes/{google_book_id}"
    params = {"key": GOOGLE_BOOKS_API_KEY}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=10.0)
            response.raise_for_status()
            item = response.json()

        vi = item.get("volumeInfo", {})
        google_id_val = item.get("id", "")

        isbn_10 = isbn_13 = None
        for ident in vi.get("industryIdentifiers", []):
            if ident.get("type") == "ISBN_10":
                isbn_10 = ident.get("identifier")
            elif ident.get("type") == "ISBN_13":
                isbn_13 = ident.get("identifier")

        # Cover URL — F-19: null when Google has no imageLinks, rather than a URL that
        # answers 200 with an "image not available" placeholder.
        cover_url = _cover_from_volume(google_id_val, vi.get("imageLinks"))

        return GoogleBookResult(
            google_id=google_id_val,
            title=vi.get("title", "Unknown Title"),
            authors=vi.get("authors", []),
            description=vi.get("description"),
            cover_url=cover_url,
            total_pages=vi.get("pageCount"),
            publisher=vi.get("publisher"),
            published_date=vi.get("publishedDate"),
            average_rating=vi.get("averageRating"),
            ratings_count=vi.get("ratingsCount"),
            isbn_10=isbn_10,
            isbn_13=isbn_13,
            categories=vi.get("categories") or [],
        )

    except HTTPException:
        raise                                   # keep our own 502 instead of rewrapping it as 500
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Google Books is unavailable right now")
    except Exception:
        raise HTTPException(status_code=502, detail="Google Books returned an unexpected response")
