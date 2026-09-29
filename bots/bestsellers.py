"""@TMRBot / *TrackMyRead Bestsellers* — the bestseller teaser (R-12, E-9).

Lifted from `editorial_bot.py` unchanged in substance — the same NYT list rotation, the
same Open Library -> Google Books -> NYT cover chain, the same Gemini teaser with the
description fallback — **minus** the old script's lines 287-290, which opened their own
engine and wrote a raw INSERT. The post goes through `POST /notes/` and the dedup row is
the server's (R-07, R-15).

Two deliberate differences from the old script, both recorded in the build notes:

* **No `random.choice(unposted[:3])`.** The highest-ranked unposted book is taken. A bot
  whose output cannot be predicted from its inputs cannot be tested, and rank order is a
  better editorial rule than a coin flip anyway.
* **The candidate pool is filtered before the model is called** (C-05a), so a run that has
  to skip fourteen already-posted books still spends exactly one Gemini call.

Since 2026-09-29 the post also carries a **real linked book**. `@TMRBot` adds the title to
its own library through `POST /books/add-to-library` — the reader's path, unchanged — and
passes the resulting `userbook_id` to `POST /notes/`. That is the only way the feed can
emit a `book` object, because the serialiser derives it from `note.userbook.book`. The
side effect is deliberate and was put to the PM: `@TMRBot`'s profile now holds a library,
and that library is "the bestsellers it has featured". See `common.add_to_library` for why
the rows are `to-read` and what that keeps them out of.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

from . import common

CONTENT_TYPE = "bestseller"

# R-15: a bestseller is never posted twice, across all lists, ever. No `since` window.
NO_REPEAT_DAYS: Optional[int] = None

MAX_TEASER_WORDS = 30

NYT_LISTS = [
    "hardcover-fiction",
    "hardcover-nonfiction",
    "young-adult-hardcover",
    "trade-fiction-paperback",
    "advice-how-to-and-miscellaneous",
    "graphic-books-and-manga",
    "combined-print-and-e-book-fiction",
]

LIST_DISPLAY = {
    "hardcover-fiction": "NYT Hardcover Fiction",
    "hardcover-nonfiction": "NYT Hardcover Nonfiction",
    "young-adult-hardcover": "NYT Young Adult",
    "trade-fiction-paperback": "NYT Paperback Fiction",
    "advice-how-to-and-miscellaneous": "NYT Advice & How-To",
    "graphic-books-and-manga": "NYT Graphic Books & Manga",
    "combined-print-and-e-book-fiction": "NYT Combined Fiction",
}


def list_for_today(now=None) -> str:
    now = now or common.utcnow()
    return NYT_LISTS[now.weekday() % len(NYT_LISTS)]


def fetch_list(list_name: str) -> List[Dict[str, Any]]:
    resp = common._request(
        "GET",
        "https://api.nytimes.com/svc/books/v3/lists/current/{}.json".format(list_name),
        params={"api-key": os.environ.get("NYT_API_KEY")},
    )
    if resp.status_code != 200:
        raise common.BotError("NYT list fetch failed", resp.status_code)
    return ((resp.json() or {}).get("results") or {}).get("books") or []


def isbn_key(book: Dict[str, Any]) -> str:
    return (
        book.get("primary_isbn13")
        or book.get("primary_isbn10")
        or book.get("title")
        or ""
    )


def truncate_words(text: str, limit: int = MAX_TEASER_WORDS) -> str:
    words = (text or "").split()
    return text if len(words) <= limit else " ".join(words[:limit])


def description_teaser(book: Dict[str, Any]) -> str:
    """The fallback: the first sentence of the NYT description, capped at 30 words."""
    description = (book.get("description") or "").strip()
    if description:
        first = description.split(".")[0].strip()
        if len(first) > 20:
            return truncate_words(first + ".")
    return "A must-read that's captivating readers everywhere."


def generate_teaser(book: Dict[str, Any]) -> str:
    """One Gemini call. Imported lazily so `bots/` imports without the SDK present."""
    import google.generativeai as genai

    genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
    model = genai.GenerativeModel("gemini-2.5-flash")
    prompt = (
        "Write a 1-2 sentence teaser for this NYT bestselling book. Make it compelling "
        "but concise.\n\n"
        'Book: "{title}" by {author}\n'
        "Description: {description}\n\n"
        "Reply with ONLY the teaser text, no labels or formatting. Keep it under 30 "
        "words.\n".format(
            title=book.get("title", ""),
            author=book.get("author", ""),
            description=book.get("description", "No description available."),
        )
    )
    teaser = (model.generate_content(prompt).text or "").strip()
    teaser = teaser.replace("TEASER:", "").strip()
    if teaser.startswith('"') and teaser.endswith('"'):
        teaser = teaser[1:-1]
    return teaser


def book_cover(book: Dict[str, Any]) -> Optional[str]:
    """Open Library -> Google Books -> NYT, exactly as `editorial_bot.py` had it."""
    isbn = book.get("primary_isbn13") or book.get("primary_isbn10")
    if isbn:
        cover_url = "https://covers.openlibrary.org/b/isbn/{}-L.jpg".format(isbn)
        try:
            resp = common._request("HEAD", cover_url)
            final_url = str(getattr(resp, "url", "") or "")
            placeholder = "-1-" in final_url or "default" in final_url
            if resp.status_code == 200 and not placeholder:
                return cover_url
        except Exception:
            pass
        try:
            resp = common._request(
                "GET",
                "https://www.googleapis.com/books/v1/volumes",
                params={"q": "isbn:{}".format(isbn), "maxResults": 1},
            )
            items = (resp.json() or {}).get("items") or []
            thumbnail = (
                (items[0].get("volumeInfo") or {}).get("imageLinks") or {}
            ).get("thumbnail") if items else None
            if thumbnail:
                return thumbnail.replace("zoom=1", "zoom=3").replace("http://", "https://")
        except Exception:
            pass
    nyt_image = book.get("book_image")
    if nyt_image:
        return nyt_image.replace("http://", "https://")
    return None


def compose(book: Dict[str, Any], teaser: str, list_display: str) -> str:
    weeks_on = book.get("weeks_on_list") or 0
    weeks = " - {} weeks".format(weeks_on) if weeks_on > 1 else ""
    # R-05a withdrawn 2026-09-29: the teaser is the whole post, nothing is appended.
    return "{title} by {author}\n\n#{rank} {list_display}{weeks}\n\n{teaser}".format(
        title=book.get("title", "Unknown Title"),
        author=book.get("author", "Unknown Author"),
        rank=book.get("rank", "?"),
        list_display=list_display,
        weeks=weeks,
        teaser=teaser,
    )


def run() -> None:
    token = common.login(CONTENT_TYPE)
    used = set(common.posted_keys(token, CONTENT_TYPE, NO_REPEAT_DAYS))

    list_name = list_for_today()
    candidates: List[Tuple[Dict[str, Any], str]] = []
    try:
        books = fetch_list(list_name)
    except Exception as exc:
        # R-09: a missed run is not made up, and nothing is fabricated in its place. An
        # NYT outage is a skipped day and a clean exit, not a placeholder book (C-07).
        common.log("NYT unavailable; skipping today.", type(exc).__name__)
        return

    for book in books:
        if "{}:{}".format(CONTENT_TYPE, isbn_key(book)) not in used:
            candidates.append((book, LIST_DISPLAY.get(list_name, list_name)))

    if not candidates:
        # Every book on today's list is already posted; try the next list along.
        fallback = NYT_LISTS[(NYT_LISTS.index(list_name) + 1) % len(NYT_LISTS)]
        try:
            for book in fetch_list(fallback):
                if "{}:{}".format(CONTENT_TYPE, isbn_key(book)) not in used:
                    candidates.append((book, LIST_DISPLAY.get(fallback, fallback)))
        except Exception as exc:
            common.log("NYT fallback list unavailable.", type(exc).__name__)

    if not candidates:
        common.log("no unposted bestseller today; nothing to do")
        return

    # The pool is filtered by now, so exactly one model call is spent (C-05a).
    book, list_display = candidates[0]
    try:
        teaser = truncate_words(generate_teaser(book))
    except Exception as exc:
        common.log("model unavailable; using the NYT description.", type(exc).__name__)
        teaser = description_teaser(book)
    if not teaser:
        teaser = description_teaser(book)

    # The cover goes into the catalogue row, not onto the post as a loose attachment, so the
    # card renders the same furniture a reader's does: a cover thumbnail and the title above
    # the author's name, both derived by the feed from `note.userbook.book`.
    cover = book_cover(book)
    userbook_id = common.add_to_library(
        token,
        title=book.get("title") or "Unknown Title",
        author=book.get("author") or "Unknown Author",
        isbn=book.get("primary_isbn13") or book.get("primary_isbn10"),
        cover_url=cover,
        description=(book.get("description") or None),
    )

    common.post_note(
        token,
        text=compose(book, teaser, list_display),
        # Only when the link failed: otherwise the same cover would render twice, once as
        # the book thumbnail and once as an attached image.
        image_url=None if userbook_id else cover,
        userbook_id=userbook_id,
        dedup_key="{}:{}".format(CONTENT_TYPE, isbn_key(book)),
    )


if __name__ == "__main__":  # pragma: no cover - exercised as a subprocess
    common.main_for(run)
