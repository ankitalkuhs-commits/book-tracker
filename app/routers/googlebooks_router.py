# app/routers/googlebooks_router.py
"""
Router for Google Books API integration.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import httpx
import os
from pydantic import BaseModel

router = APIRouter(prefix="/api/googlebooks", tags=["Google Books"])

# Google Books API Key - get from environment variable or use default
GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY", "AIzaSyDKd9VimeN2ggeLC2oQNlzAWpPKXRybigs")


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
    
    if max_results < 1 or max_results > 40:
        max_results = 10
    
    # Google Books API endpoint
    url = "https://www.googleapis.com/books/v1/volumes"
    params = {
        "q": query,
        "maxResults": max_results,
        "printType": "books",
        "langRestrict": "en",
        "key": GOOGLE_BOOKS_API_KEY
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=10.0)
            response.raise_for_status()
            data = response.json()
        
        total_items = data.get("totalItems", 0)
        items = data.get("items", [])
        
        results = []
        for item in items:
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
            
            # Extract cover image (prefer high quality)
            image_links = volume_info.get("imageLinks", {})
            cover_url = None
            if image_links:
                # Try to get the best quality image available
                cover_url = (
                    image_links.get("large") or
                    image_links.get("medium") or
                    image_links.get("thumbnail") or
                    image_links.get("smallThumbnail")
                )
                # Replace http with https for security
                if cover_url:
                    cover_url = cover_url.replace("http://", "https://")
            
            # Get description and truncate if too long
            description = volume_info.get("description", "")
            if description and len(description) > 500:
                description = description[:497] + "..."
            
            book_result = GoogleBookResult(
                google_id=item.get("id", ""),
                title=volume_info.get("title", "Unknown Title"),
                authors=volume_info.get("authors", []),
                description=description or None,
                cover_url=cover_url,
                total_pages=volume_info.get("pageCount"),
                publisher=volume_info.get("publisher"),
                published_date=volume_info.get("publishedDate"),
                average_rating=volume_info.get("averageRating"),
                ratings_count=volume_info.get("ratingsCount"),
                isbn_10=isbn_10,
                isbn_13=isbn_13
            )
            results.append(book_result)
        
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
