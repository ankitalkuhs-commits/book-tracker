"""
TrackMyRead Editorial Bot
=========================
Runs once daily (via Render cron job).

Flow:
  1. Fetch current NYT bestseller lists (fiction + non-fiction + YA, rotating)
  2. Skip books already posted
  3. Pick top unposted book
  4. Generate teaser + "why buzzing" via Gemini
  5. Post to community feed as @TMRBot
  6. Mark book as posted in editorial_post table

Environment variables required:
  NYT_API_KEY      - NYT Books API key
  GEMINI_API_KEY   - Google Gemini API key
  DATABASE_URL     - PostgreSQL connection string (set by Render)
  BOT_SECRET_KEY   - Same SECRET_KEY as main app (for JWT generation)
  SECRET_KEY       - App JWT secret (used if BOT_SECRET_KEY not set)
"""

import os
import sys
import requests
import random
import google.generativeai as genai
from sqlalchemy import create_engine, text
from datetime import datetime, timezone

# ── Config ────────────────────────────────────────────────────────────────────
NYT_API_KEY   = os.getenv("NYT_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DATABASE_URL  = os.getenv("DATABASE_URL", "sqlite:///./book_tracker.db")
BOT_EMAIL     = "tmrbot@trackmyread.com"

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# NYT lists to rotate through (one picked per day based on weekday)
NYT_LISTS = [
    "hardcover-fiction",
    "hardcover-nonfiction",
    "young-adult-hardcover",
    "trade-fiction-paperback",
    "advice-how-to-and-miscellaneous",
    "graphic-books-and-manga",
    "combined-print-and-e-book-fiction",
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_nyt_books(list_name: str) -> list:
    """Fetch current bestsellers from a NYT list."""
    url = f"https://api.nytimes.com/svc/books/v3/lists/current/{list_name}.json"
    resp = requests.get(url, params={"api-key": NYT_API_KEY}, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    return data.get("results", {}).get("books", [])


def get_already_posted_isbns(conn) -> set:
    """Return set of ISBNs already posted."""
    rows = conn.execute(text("SELECT nyt_isbn FROM editorial_post")).fetchall()
    return {r[0] for r in rows}


def get_book_cover(isbn: str, title: str) -> str | None:
    """Try to get a cover image from Google Books."""
    try:
        resp = requests.get(
            "https://www.googleapis.com/books/v1/volumes",
            params={"q": f"isbn:{isbn}" if isbn else title, "maxResults": 1},
            timeout=5
        )
        items = resp.json().get("items", [])
        if items:
            image_links = items[0].get("volumeInfo", {}).get("imageLinks", {})
            # Prefer high quality, fall back to thumbnail
            cover = (image_links.get("extraLarge") or
                     image_links.get("large") or
                     image_links.get("medium") or
                     image_links.get("thumbnail"))
            if cover:
                # Use HTTPS
                return cover.replace("http://", "https://")
    except Exception as e:
        print(f"⚠️  Cover fetch failed: {e}")
    return None


def generate_post_text(book: dict) -> dict:
    """Use Gemini to generate teaser + why buzzing text."""
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-1.5-flash")

    title       = book.get("title", "")
    author      = book.get("author", "")
    description = book.get("description", "No description available.")
    rank        = book.get("rank", 1)
    weeks_on    = book.get("weeks_on_list", 0)
    publisher   = book.get("publisher", "")

    prompt = f"""You are an editorial writer for a book-tracking social platform called TrackMyRead.
Write an engaging post about this NYT bestselling book for our community feed.

Book: "{title}" by {author}
Publisher: {publisher}
NYT Rank: #{rank}
Weeks on list: {weeks_on}
Description: {description}

Generate these three sections (keep it warm, literary, and conversational — not overly promotional):

1. TEASER (2-3 lines max): A compelling hook that makes readers want to pick it up immediately.

2. WHY_BUZZING (2-3 sentences): Why this book is resonating right now — cultural relevance, themes, reader reactions. Don't make things up; base this on the description and its bestseller status.

3. QUOTE (one line, 10-20 words): A short, safe, original line inspired by the book's themes (NOT a direct quote from the book — create a thematic line). Make it feel literary.

Reply in this exact format:
TEASER: <text>
WHY_BUZZING: <text>
QUOTE: <text>
"""

    response = model.generate_content(prompt)
    raw = response.text.strip()

    result = {"teaser": "", "why_buzzing": "", "quote": ""}
    for line in raw.split("\n"):
        if line.startswith("TEASER:"):
            result["teaser"] = line.replace("TEASER:", "").strip()
        elif line.startswith("WHY_BUZZING:"):
            result["why_buzzing"] = line.replace("WHY_BUZZING:", "").strip()
        elif line.startswith("QUOTE:"):
            result["quote"] = line.replace("QUOTE:", "").strip()

    return result


def build_post_text(book: dict, generated: dict) -> str:
    """Assemble the final post text."""
    title     = book.get("title", "Unknown Title")
    author    = book.get("author", "Unknown Author")
    rank      = book.get("rank", "?")
    weeks_on  = book.get("weeks_on_list", 0)
    list_name = book.get("_list_display", "NYT Bestseller")

    weeks_str = f" · {weeks_on} week{'s' if weeks_on != 1 else ''} on the list" if weeks_on else ""

    text = f"""📚 Editorial Pick

{title}
by {author}

🏆 #{rank} on {list_name}{weeks_str}

✨ {generated['teaser']}

💬 Why people are talking:
{generated['why_buzzing']}"""

    if generated.get("quote"):
        text += f'\n\n📖 "{generated["quote"]}"'

    text += "\n\n🔖 Tap to add to your library →"
    return text


# ── Main ──────────────────────────────────────────────────────────────────────

def run_bot():
    print(f"\n🤖 TrackMyRead Editorial Bot starting — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")

    # Validate env vars
    if not NYT_API_KEY:
        print("❌ NYT_API_KEY not set"); sys.exit(1)
    if not GEMINI_API_KEY:
        print("❌ GEMINI_API_KEY not set"); sys.exit(1)

    engine = create_engine(DATABASE_URL)

    with engine.begin() as conn:

        # ── Get bot user ID ───────────────────────────────────────────────────
        is_sqlite = DATABASE_URL.startswith("sqlite")
        bot_row = conn.execute(
            text(f"SELECT id FROM {'user' if is_sqlite else '\"user\"'} WHERE email = :email"),
            {"email": BOT_EMAIL}
        ).fetchone()

        if not bot_row:
            print("❌ @TMRBot user not found. Run: python migrations/add_editorial_bot.py")
            sys.exit(1)

        bot_user_id = bot_row[0]
        print(f"✅ Bot user id: {bot_user_id}")

        # ── Pick today's list (rotate by weekday) ─────────────────────────────
        list_index = datetime.now(timezone.utc).weekday() % len(NYT_LISTS)
        list_name  = NYT_LISTS[list_index]
        list_display_map = {
            "hardcover-fiction": "NYT Hardcover Fiction",
            "hardcover-nonfiction": "NYT Hardcover Nonfiction",
            "young-adult-hardcover": "NYT Young Adult",
            "trade-fiction-paperback": "NYT Paperback Fiction",
            "advice-how-to-and-miscellaneous": "NYT Advice & How-To",
            "graphic-books-and-manga": "NYT Graphic Books & Manga",
            "combined-print-and-e-book-fiction": "NYT Combined Fiction",
        }
        print(f"📋 Today's list: {list_display_map.get(list_name, list_name)}")

        # ── Fetch NYT books ───────────────────────────────────────────────────
        try:
            books = get_nyt_books(list_name)
        except Exception as e:
            print(f"❌ NYT API error: {e}"); sys.exit(1)

        print(f"📚 {len(books)} books fetched from NYT")

        # ── Skip already posted ───────────────────────────────────────────────
        posted_isbns = get_already_posted_isbns(conn)
        unposted = []
        for b in books:
            isbn = b.get("primary_isbn13") or b.get("primary_isbn10") or b.get("title", "")
            if isbn not in posted_isbns:
                b["_isbn_key"] = isbn
                b["_list_display"] = list_display_map.get(list_name, list_name)
                unposted.append(b)

        if not unposted:
            # All books on this list already posted — pick a different list
            print("⚠️  All books on this list already posted. Trying another list...")
            fallback_list = NYT_LISTS[(list_index + 1) % len(NYT_LISTS)]
            try:
                books = get_nyt_books(fallback_list)
                for b in books:
                    isbn = b.get("primary_isbn13") or b.get("primary_isbn10") or b.get("title", "")
                    if isbn not in posted_isbns:
                        b["_isbn_key"] = isbn
                        b["_list_display"] = list_display_map.get(fallback_list, fallback_list)
                        unposted.append(b)
            except Exception:
                pass

        if not unposted:
            print("⚠️  No new books to post today. All lists exhausted.")
            sys.exit(0)

        # Pick #1 ranked book (or random from top 3 for variety)
        book = unposted[0] if len(unposted) == 1 else random.choice(unposted[:3])
        title = book.get("title", "Unknown")
        isbn  = book["_isbn_key"]
        print(f"🎯 Selected: \"{title}\" (ISBN: {isbn})")

        # ── Generate post text via Gemini ─────────────────────────────────────
        print("🤖 Generating post text with Gemini...")
        try:
            generated = generate_post_text(book)
        except Exception as e:
            print(f"❌ Gemini error: {e}"); sys.exit(1)

        post_text = build_post_text(book, generated)
        print(f"✍️  Post text generated ({len(post_text)} chars)")

        # ── Get book cover ────────────────────────────────────────────────────
        cover_url = get_book_cover(
            book.get("primary_isbn13") or book.get("primary_isbn10", ""),
            title
        )
        if cover_url:
            print(f"🖼️  Cover found: {cover_url[:60]}...")
        else:
            print("⚠️  No cover image found")

        # ── Post to feed as @TMRBot ───────────────────────────────────────────
        note_result = conn.execute(
            text("""INSERT INTO note (user_id, text, image_url, is_public, created_at)
                    VALUES (:user_id, :text, :image_url, :is_public, :created_at)"""),
            {
                "user_id":   bot_user_id,
                "text":      post_text,
                "image_url": cover_url,
                "is_public": True,
                "created_at": datetime.utcnow(),
            }
        )
        note_id = note_result.lastrowid if is_sqlite else conn.execute(
            text("SELECT lastval()")
        ).scalar()

        # ── Track posted book ─────────────────────────────────────────────────
        conn.execute(
            text("INSERT INTO editorial_post (nyt_isbn, book_title, note_id, posted_at) VALUES (:isbn, :title, :note_id, :posted_at)"),
            {"isbn": isbn, "title": title, "note_id": note_id, "posted_at": datetime.utcnow()}
        )

    print(f"\n✅ Post published! Note id: {note_id}")
    print(f"   Book: \"{title}\"")
    print(f"   Posted as: @TMRBot\n")


if __name__ == "__main__":
    run_bot()
