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


def get_book_cover(book: dict) -> str | None:
    """Get book cover - prefer NYT image, fallback to Open Library (higher res than Google Books)."""
    # NYT provides book_image directly - usually good quality
    nyt_image = book.get("book_image")
    if nyt_image:
        return nyt_image.replace("http://", "https://")
    
    # Fallback: Open Library covers (higher quality than Google Books)
    isbn = book.get("primary_isbn13") or book.get("primary_isbn10")
    if isbn:
        # Open Library provides L (large), M (medium), S (small)
        cover_url = f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg"
        try:
            # Check if image exists (returns 1x1 pixel if not found)
            resp = requests.head(cover_url, timeout=3)
            if resp.status_code == 200:
                return cover_url
        except Exception:
            pass
    
    return None


def generate_fallback_text(book: dict) -> dict:
    """Generate a template-based post if Gemini fails."""
    description = book.get("description", "")
    
    # Use first sentence of description or a generic teaser
    if description:
        first_sentence = description.split('.')[0].strip()
        teaser = first_sentence + "." if len(first_sentence) > 20 else "A must-read that's captivating readers everywhere."
    else:
        teaser = "A must-read that's captivating readers everywhere."
    
    return {"teaser": teaser}


def generate_post_text(book: dict) -> dict:
    """Use Gemini to generate teaser + why buzzing text."""
    genai.configure(api_key=GEMINI_API_KEY)
    
    # Use gemini-2.5-flash (stable, free tier as of Feb 2026)
    model = genai.GenerativeModel("gemini-2.5-flash")

    title       = book.get("title", "")
    author      = book.get("author", "")
    description = book.get("description", "No description available.")
    rank        = book.get("rank", 1)
    weeks_on    = book.get("weeks_on_list", 0)
    publisher   = book.get("publisher", "")

    prompt = f"""Write a 1-2 sentence teaser for this NYT bestselling book. Make it compelling but concise.

Book: "{title}" by {author}
Description: {description}

Reply with ONLY the teaser text, no labels or formatting. Keep it under 30 words.
"""

    response = model.generate_content(prompt)
    teaser = response.text.strip()
    
    # Clean up any accidental formatting
    teaser = teaser.replace("TEASER:", "").strip()
    if teaser.startswith('"') and teaser.endswith('"'):
        teaser = teaser[1:-1]

    return {"teaser": teaser}


def build_post_text(book: dict, generated: dict) -> str:
    """Assemble the final post text."""
    title     = book.get("title", "Unknown Title")
    author    = book.get("author", "Unknown Author")
    rank      = book.get("rank", "?")
    weeks_on  = book.get("weeks_on_list", 0)
    list_name = book.get("_list_display", "NYT Bestseller")

    weeks_str = f" · {weeks_on} weeks" if weeks_on > 1 else ""

    text = f"""📚 {title} by {author}

🏆 #{rank} {list_name}{weeks_str}

{generated['teaser']}"""

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
        user_table = "user" if is_sqlite else '"user"'
        bot_row = conn.execute(
            text(f"SELECT id FROM {user_table} WHERE email = :email"),
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
            print("✅ Gemini generation successful")
        except Exception as e:
            print(f"⚠️  Gemini error: {e}")
            print("📝 Using fallback template...")
            generated = generate_fallback_text(book)

        post_text = build_post_text(book, generated)
        print(f"✍️  Post text generated ({len(post_text)} chars)")

        # ── Get book cover ────────────────────────────────────────────────────
        cover_url = get_book_cover(book)
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
                "created_at": datetime.now(timezone.utc),
            }
        )
        note_id = note_result.lastrowid if is_sqlite else conn.execute(
            text("SELECT lastval()")
        ).scalar()

        # ── Track posted book ─────────────────────────────────────────────────
        conn.execute(
            text("INSERT INTO editorial_post (nyt_isbn, book_title, note_id, posted_at) VALUES (:isbn, :title, :note_id, :posted_at)"),
            {"isbn": isbn, "title": title, "note_id": note_id, "posted_at": datetime.now(timezone.utc)}
        )

    print(f"\n✅ Post published! Note id: {note_id}")
    print(f"   Book: \"{title}\"")
    print(f"   Posted as: @TMRBot\n")


if __name__ == "__main__":
    run_bot()
