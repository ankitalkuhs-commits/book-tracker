# app/routers/googlebooks_router.py
"""
Router for Google Books API integration.
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional
import httpx
import os
import asyncio
from pydantic import BaseModel

router = APIRouter(prefix="/googlebooks", tags=["Google Books"])

# Google Books API Key - read from environment variable
GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")

if not GOOGLE_BOOKS_API_KEY:
    print("WARNING: GOOGLE_BOOKS_API_KEY environment variable not set. Google Books API may have rate limits.")


class GoogleBookResult(BaseModel):
    """Single book result from Google Books API"""
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


class GoogleBooksSearchResponse(BaseModel):
    """Response containing multiple book results"""
    results: List[GoogleBookResult]
    total_items: int


@router.get("/search", response_model=GoogleBooksSearchResponse)
async def search_google_books(query: str, max_results: int = 10):
    """
    Search for books using Google Books API.
    
    Args:
        query: Search query (book title, author, ISBN, etc.)
        max_results: Maximum number of results to return (default 10)
    
    Returns:
        List of book results with details
    """
    if not query or len(query.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters")

    # Always fetch max (40) from Google, then filter + trim to 15
    fetch_count = 40

    # Google Books API endpoint
    url = "https://www.googleapis.com/books/v1/volumes"
    params = {
        "q": query,
        "maxResults": fetch_count,
        "printType": "books",
        "langRestrict": "en",
        "orderBy": "relevance",
        "key": GOOGLE_BOOKS_API_KEY
    }

    try:
        async with httpx.AsyncClient() as client:
            for attempt in range(3):
                response = await client.get(url, params=params, timeout=10.0)
                if response.status_code == 200:
                    break
                if response.status_code == 503 and attempt < 2:
                    print(f"[GoogleBooks] 503 for query='{query}', retry {attempt + 1}/2 after 1s")
                    await asyncio.sleep(1)
                    continue
                print(f"[GoogleBooks] Error {response.status_code} for query='{query}': {response.text[:300]}")
                raise HTTPException(status_code=502, detail=f"Google Books API error {response.status_code}")
            data = response.json()

        total_items = data.get("totalItems", 0)
        items = data.get("items", [])

        results = []
        for item in items:
            volume_info = item.get("volumeInfo", {})

            # ── Quality filters ──────────────────────────────────────
            # Must have a cover image
            image_links = volume_info.get("imageLinks", {})
            if not image_links:
                continue

            # Must have at least one author
            authors = volume_info.get("authors", [])
            if not authors:
                continue

            # Must have a title (not just "Unknown")
            title = volume_info.get("title", "").strip()
            if not title:
                continue

            # Skip magazines / periodicals that slip through
            categories = volume_info.get("categories", [])
            if any("magazine" in c.lower() or "periodical" in c.lower() for c in categories):
                continue

            # ── Extract cover (prefer high quality) ─────────────────
            cover_url = (
                image_links.get("large") or
                image_links.get("medium") or
                image_links.get("thumbnail") or
                image_links.get("smallThumbnail")
            )
            if cover_url:
                cover_url = cover_url.replace("http://", "https://")

            # ── Extract ISBNs ────────────────────────────────────────
            isbn_10 = None
            isbn_13 = None
            for identifier in volume_info.get("industryIdentifiers", []):
                if identifier.get("type") == "ISBN_10":
                    isbn_10 = identifier.get("identifier")
                elif identifier.get("type") == "ISBN_13":
                    isbn_13 = identifier.get("identifier")

            # ── Description ──────────────────────────────────────────
            description = volume_info.get("description", "")
            if description and len(description) > 500:
                description = description[:497] + "..."

            results.append(GoogleBookResult(
                google_id=item.get("id", ""),
                title=title,
                authors=authors,
                description=description or None,
                cover_url=cover_url,
                total_pages=volume_info.get("pageCount"),
                publisher=volume_info.get("publisher"),
                published_date=volume_info.get("publishedDate"),
                average_rating=volume_info.get("averageRating"),
                ratings_count=volume_info.get("ratingsCount"),
                isbn_10=isbn_10,
                isbn_13=isbn_13,
            ))

        # Sort: books with page count first, then without
        results.sort(key=lambda b: (0 if b.total_pages else 1))

        # Return top 15
        results = results[:15]

        return GoogleBooksSearchResponse(
            results=results,
            total_items=total_items
        )
    
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching from Google Books API: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )


@router.get("/book/{google_book_id}", response_model=GoogleBookResult)
async def get_book_details(google_book_id: str):
    """
    Get detailed information about a specific book by Google Books ID.
    
    Args:
        google_book_id: The Google Books volume ID
    
    Returns:
        Detailed book information
    """
    url = f"https://www.googleapis.com/books/v1/volumes/{google_book_id}"
    params = {"key": GOOGLE_BOOKS_API_KEY}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=10.0)
            response.raise_for_status()
            item = response.json()
        
        volume_info = item.get("volumeInfo", {})
        
        # Extract ISBN information
        isbn_10 = None
        isbn_13 = None
        identifiers = volume_info.get("industryIdentifiers", [])
        for identifier in identifiers:
            if identifier.get("type") == "ISBN_10":
                isbn_10 = identifier.get("identifier")
            elif identifier.get("type") == "ISBN_13":
                isbn_13 = identifier.get("identifier")
        
        # Extract cover image
        image_links = volume_info.get("imageLinks", {})
        cover_url = None
        if image_links:
            cover_url = (
                image_links.get("large") or
                image_links.get("medium") or
                image_links.get("thumbnail") or
                image_links.get("smallThumbnail")
            )
            if cover_url:
                cover_url = cover_url.replace("http://", "https://")
        
        book_result = GoogleBookResult(
            google_id=item.get("id", ""),
            title=volume_info.get("title", "Unknown Title"),
            authors=volume_info.get("authors", []),
            description=volume_info.get("description"),
            cover_url=cover_url,
            total_pages=volume_info.get("pageCount"),
            publisher=volume_info.get("publisher"),
            published_date=volume_info.get("publishedDate"),
            average_rating=volume_info.get("averageRating"),
            ratings_count=volume_info.get("ratingsCount"),
            isbn_10=isbn_10,
            isbn_13=isbn_13
        )
        
        return book_result
    
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching from Google Books API: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )
