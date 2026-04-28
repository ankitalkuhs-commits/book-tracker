# app/routers/googlebooks_router.py
"""
Router for Google Books API integration.

Search strategy (optimized for novel readers):
- ISBN-pattern queries → routed to isbn: field qualifier for exact lookup
- Genre chip selected  → subject:<genre> qualifier appended
- Default (no genre)   → subject:fiction bias to suppress textbooks/academic noise
- Always fetch 40 from Google, filter noise, re-rank by novel-friendliness, return top N
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional
import httpx
import os
import re
import asyncio
from pydantic import BaseModel

router = APIRouter(prefix="/api/googlebooks", tags=["Google Books"])

GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")

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
    max_results: int = 10,            # results to return per page
    start_index: int = 0,             # pagination offset (pass next_start_index from previous response)
    genre: Optional[str] = None,      # fiction|fantasy|mystery|thriller|sci-fi|romance|historical|literary|all
    order_by: str = "relevance",       # relevance|newest
    filter_noise: bool = True,         # apply noise filtering + re-ranking
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

    if max_results < 1 or max_results > 40:
        max_results = 10

    if start_index < 0:
        start_index = 0

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

            # Cover URL — use CDN format for reliability
            image_links = vi.get("imageLinks", {})
            raw_cover = (
                image_links.get("large") or image_links.get("medium") or
                image_links.get("thumbnail") or image_links.get("smallThumbnail")
            ) if image_links else None
            cover_url = normalize_google_cover_url(
                f"https://books.google.com/books/content?id={google_id}" if google_id else raw_cover
            )

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
        has_more = total_items > next_start

        return GoogleBooksSearchResponse(
            results=results,
            total_items=total_items,
            query_used=resolved_query,
            has_more=has_more,
            next_start_index=next_start,
        )

    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"Error fetching from Google Books: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@router.get("/book/{google_book_id}", response_model=GoogleBookResult)
async def get_book_details(google_book_id: str):
    """Get detailed information about a specific book by Google Books ID."""
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

        image_links = vi.get("imageLinks", {})
        raw_cover = (
            image_links.get("large") or image_links.get("medium") or
            image_links.get("thumbnail") or image_links.get("smallThumbnail")
        ) if image_links else None
        cover_url = normalize_google_cover_url(
            f"https://books.google.com/books/content?id={google_id_val}" if google_id_val else raw_cover
        )

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

    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"Error fetching from Google Books: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
