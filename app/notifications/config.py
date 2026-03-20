# app/notifications/config.py
"""
Central registry of all notification event types.

How to add a new notification type:
  1. Add an entry below (even commented out until the feature is built)
  2. Call fire_event(db, "your_event_type", ...) from your route
  3. Deploy — zero mobile app update required

Template variables:
  {actor}           — display name of the user who triggered the event
  {book_title}      — title of the relevant book (if any)
  {comment_preview} — first 60 chars of a comment (for comment events)
  Any extra key passed via `extra={}` in fire_event() becomes available here.
"""

NOTIFICATION_EVENTS: dict[str, dict] = {
    # ── Social events ────────────────────────────────────────────────────────

    "new_follower": {
        "title": "New follower 👥",
        "body": "{actor} started following you",
        "is_active": True,
        "daily_cap": False,   # each new follower is a distinct event
    },

    "post_liked": {
        "title": "{actor} liked your post ❤️",
        "body": "{actor} liked your note",
        "is_active": True,
        "daily_cap": False,
    },

    # ── Reading activity events ───────────────────────────────────────────────

    "book_completed": {
        "title": "{actor} finished a book 🎉",
        "body": "{actor} just finished reading {book_title}",
        "is_active": True,
        "daily_cap": True,    # max 1 per actor→recipient pair per day (anti-spam)
    },

    "book_added": {
        "title": "{actor} added a new book 📚",
        "body": "{actor} added {book_title} to their library",
        "is_active": True,
        "daily_cap": True,
    },

    # ── Future events — uncomment when the feature is built ──────────────────
    # No mobile app update needed; just uncomment + call fire_event() in route.

    # "comment_added": {
    #     "title": "{actor} commented on your post 💬",
    #     "body": "{actor}: {comment_preview}",
    #     "is_active": True,
    #     "daily_cap": False,
    # },

    # "reading_streak_reminder": {
    #     "title": "Keep your streak alive! 🔥",
    #     "body": "You haven't logged any reading today. Even 5 pages counts!",
    #     "is_active": True,
    #     "daily_cap": True,
    # },

    # "book_recommended": {
    #     "title": "{actor} recommended a book 💡",
    #     "body": "{actor} thinks you'd love {book_title}",
    #     "is_active": True,
    #     "daily_cap": False,
    # },

    # "reading_milestone": {
    #     "title": "{actor} hit a reading milestone 🏆",
    #     "body": "{actor} has read {milestone} books this year!",
    #     "is_active": True,
    #     "daily_cap": True,
    # },

    # "quiz_published": {
    #     "title": "New quiz available 📝",
    #     "body": "A new quiz on {book_title} is live. Can you beat the high score?",
    #     "is_active": True,
    #     "daily_cap": False,
    # },
}
