"""
Seed the two allowlisted review accounts with a realistic library, notes,
a mutual follow and a Circle - entirely through the public API.

    python scripts/seed_review_accounts.py [--base-url URL]

This script is a plain API client. It imports nothing from `app/`, opens no
database connection, and knows no table names. It hard-codes no secret: if
REVIEW_LOGIN_SECRET cannot be resolved (env, then .env.review at the repo
root) it exits non-zero before making any request.

Exit codes:
    0  every step created or skipped; failed == 0
    1  at least one step failed (including a login failure)
    2  configuration / usage error (no secret resolvable, etc.)
"""
import argparse
import os
import sys
from pathlib import Path

import requests

READER = "review.reader@trackmyread.com"
FRIEND = "review.friend@trackmyread.com"

BOOKS = {
    READER: {
        "reading": "The Hobbit J R R Tolkien",
        "finished": "Pride and Prejudice Jane Austen",
        "to-read": "The Great Gatsby F Scott Fitzgerald",
    },
    FRIEND: {
        "reading": "Jane Eyre Charlotte Bronte",
        "finished": "The Old Man and the Sea Ernest Hemingway",
        "to-read": "Dracula Bram Stoker",
    },
}

NOTE_TEXT_EMOTION = "This chapter completely pulled me in - hard to put down tonight."
NOTE_TEXT_QUOTE = "A line from this book has been stuck in my head all week."
NOTE_QUOTE = "It is a truth universally acknowledged..."
GROUP_POST_TEXT = "Starting this one tonight - excited to see where it goes."

CIRCLE_NAME = "Review Circle"
CIRCLE_DESCRIPTION = "Where the review accounts talk about books."

counts = {"created": 0, "skipped": 0, "failed": 0}
failures = []


def log(status: str, message: str):
    print(f"[{status}] {message}")
    if status == "created":
        counts["created"] += 1
    elif status == "skipped":
        counts["skipped"] += 1
    elif status == "FAILED":
        counts["failed"] += 1
        failures.append(message)


def resolve_secret(env_file_path: str) -> str:
    secret = os.environ.get("REVIEW_LOGIN_SECRET")
    if secret:
        return secret

    env_file = Path(env_file_path)
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            if key == "REVIEW_LOGIN_SECRET" and value:
                return value

    print("REVIEW_LOGIN_SECRET not set (env or .env.review)", file=sys.stderr)
    sys.exit(2)


def login(base_url: str, email: str, secret: str) -> dict:
    r = requests.post(
        f"{base_url}/auth/review-login",
        json={"email": email, "secret": secret},
        timeout=90,
    )
    if r.status_code != 200:
        hint = ""
        if r.status_code == 404:
            hint = " (404 means REVIEW_LOGIN_SECRET / REVIEW_LOGIN_EMAILS are not set on the server)"
        print(f"[FAILED] login as {email}: {r.status_code} {r.text}{hint}", file=sys.stderr)
        sys.exit(1)
    return r.json()


def snapshot_library(base_url: str, headers: dict) -> dict:
    r = requests.get(f"{base_url}/userbooks/", headers=headers, timeout=60)
    r.raise_for_status()
    return {item["book"]["google_books_id"]: item for item in r.json() if item.get("book", {}).get("google_books_id")}


def search_book(base_url: str, headers: dict, query: str) -> dict | None:
    r = requests.get(
        f"{base_url}/api/googlebooks/search",
        params={"query": query, "max_results": 5},
        headers=headers,
        timeout=60,
    )
    if r.status_code != 200:
        return None
    results = r.json().get("results") or []
    return results[0] if results else None


def add_to_library(base_url: str, headers: dict, result: dict, status: str) -> dict | None:
    payload = {
        "title": result["title"],
        "author": ", ".join(result.get("authors") or []) or None,
        "isbn": result.get("isbn_13") or result.get("isbn_10"),
        "google_books_id": result["google_id"],
        "cover_url": result.get("cover_url"),
        "description": result.get("description"),
        "total_pages": result.get("total_pages"),
        "status": status,
    }
    r = requests.post(f"{base_url}/books/add-to-library", json=payload, headers=headers, timeout=60)
    if r.status_code == 400 and "already in your library" in r.text:
        return None  # caller treats as skipped, using the snapshot's existing row
    if r.status_code != 200:
        log("FAILED", f"add-to-library '{result['title']}': {r.status_code} {r.text}")
        return None
    return r.json()


def ensure_books(base_url: str, email: str, token: str) -> dict:
    """Returns {status: userbook_dict} for reading/finished/to-read for this account."""
    headers = {"Authorization": f"Bearer {token}"}
    snapshot = snapshot_library(base_url, headers)
    result_by_status = {}

    for status, query in BOOKS[email].items():
        found = search_book(base_url, headers, query)
        if not found:
            log("FAILED", f"{email} search for '{query}' returned no results")
            continue

        existing = snapshot.get(found["google_id"])
        if existing:
            log("skipped", f"{email} already has '{found['title']}'")
            result_by_status[status] = existing
            continue

        created = add_to_library(base_url, headers, found, status)
        if created:
            log("created", f"{email} added '{found['title']}' ({status})")
            result_by_status[status] = created
        else:
            # 400 "already in your library" but not in our snapshot (edge case)  - 
            # or the add failed and was already logged above.
            log("skipped", f"{email} '{found['title']}' already present (not in snapshot)")

    return result_by_status


def ensure_progress(base_url: str, token: str, email: str, ub: dict):
    headers = {"Authorization": f"Bearer {token}"}
    total_pages = ub["book"].get("total_pages")
    if total_pages:
        n = max(1, int(total_pages * 0.4))
        n = min(n, total_pages - 1)
    else:
        n = 120

    if ub.get("current_page") == n:
        log("skipped", f"{email} progress already at page {n}")
        return

    r = requests.put(
        f"{base_url}/userbooks/{ub['id']}/progress",
        json={"current_page": n},
        headers=headers,
        timeout=60,
    )
    if r.status_code == 200:
        log("created", f"{email} set progress to page {n}")
    else:
        log("FAILED", f"{email} set progress: {r.status_code} {r.text}")


def ensure_rating(base_url: str, token: str, email: str, ub: dict):
    headers = {"Authorization": f"Bearer {token}"}
    if ub.get("status") == "finished" and ub.get("rating") == 5:
        log("skipped", f"{email} book already finished + rated")
        return

    r = requests.patch(
        f"{base_url}/userbooks/{ub['id']}",
        json={"status": "finished", "rating": 5},
        headers=headers,
        timeout=60,
    )
    if r.status_code == 200:
        log("created", f"{email} rated finished book 5 stars")
    else:
        log("FAILED", f"{email} rate finished book: {r.status_code} {r.text}")


def ensure_notes(base_url: str, token: str, email: str, reading_ub: dict, finished_ub: dict):
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{base_url}/notes/me", headers=headers, timeout=60)
    r.raise_for_status()
    existing_texts = {n["text"] for n in r.json() if n.get("text")}

    notes_to_add = []
    if reading_ub and NOTE_TEXT_EMOTION not in existing_texts:
        notes_to_add.append({
            "userbook_id": reading_ub["id"],
            "text": NOTE_TEXT_EMOTION,
            "emotion": "inspired",
            "is_public": True,
        })
    elif reading_ub:
        log("skipped", f"{email} emotion note already exists")

    if finished_ub and NOTE_TEXT_QUOTE not in existing_texts:
        notes_to_add.append({
            "userbook_id": finished_ub["id"],
            "text": NOTE_TEXT_QUOTE,
            "quote": NOTE_QUOTE,
            "is_public": True,
        })
    elif finished_ub:
        log("skipped", f"{email} quote note already exists")

    for note_payload in notes_to_add:
        r = requests.post(f"{base_url}/notes/", json=note_payload, headers=headers, timeout=60)
        if r.status_code == 201:
            log("created", f"{email} posted note '{note_payload['text'][:30]}...'")
        else:
            log("FAILED", f"{email} post note: {r.status_code} {r.text}")


def ensure_mutual_follow(base_url: str, reader_token: str, friend_token: str, reader_id: int, friend_id: int):
    reader_headers = {"Authorization": f"Bearer {reader_token}"}
    friend_headers = {"Authorization": f"Bearer {friend_token}"}

    r = requests.get(f"{base_url}/follow/following", headers=reader_headers, timeout=60)
    r.raise_for_status()
    reader_following = {f["followed_id"] for f in r.json()}

    r = requests.get(f"{base_url}/follow/following", headers=friend_headers, timeout=60)
    r.raise_for_status()
    friend_following = {f["followed_id"] for f in r.json()}

    if friend_id in reader_following:
        log("skipped", "reader already follows friend")
    else:
        r = requests.post(f"{base_url}/follow/{friend_id}", headers=reader_headers, timeout=60)
        if r.status_code == 200 or (r.status_code == 400 and "Already following" in r.text):
            log("created" if r.status_code == 200 else "skipped", "reader follows friend")
        else:
            log("FAILED", f"reader follow friend: {r.status_code} {r.text}")

    if reader_id in friend_following:
        log("skipped", "friend already follows reader")
    else:
        r = requests.post(f"{base_url}/follow/{reader_id}", headers=friend_headers, timeout=60)
        if r.status_code == 200 or (r.status_code == 400 and "Already following" in r.text):
            log("created" if r.status_code == 200 else "skipped", "friend follows reader")
        else:
            log("FAILED", f"friend follow reader: {r.status_code} {r.text}")


def ensure_circle(base_url: str, reader_token: str) -> int | None:
    headers = {"Authorization": f"Bearer {reader_token}"}
    r = requests.get(f"{base_url}/groups/my", headers=headers, timeout=60)
    r.raise_for_status()
    for g in r.json():
        if g.get("name") == CIRCLE_NAME:
            log("skipped", "Review Circle already exists")
            return g["id"]

    r = requests.post(
        f"{base_url}/groups/",
        json={
            "name": CIRCLE_NAME,
            "description": CIRCLE_DESCRIPTION,
            "is_private": False,
            "cover_preset": "teal",
        },
        headers=headers,
        timeout=60,
    )
    if r.status_code == 201:
        log("created", "Review Circle created")
        return r.json()["id"]
    log("FAILED", f"create Review Circle: {r.status_code} {r.text}")
    return None


def ensure_friend_joins(base_url: str, friend_token: str, group_id: int):
    headers = {"Authorization": f"Bearer {friend_token}"}
    r = requests.get(f"{base_url}/groups/my", headers=headers, timeout=60)
    r.raise_for_status()
    if any(g["id"] == group_id for g in r.json()):
        log("skipped", "friend already a member of Review Circle")
        return

    r = requests.post(f"{base_url}/groups/{group_id}/join", headers=headers, timeout=60)
    if r.status_code == 201:
        log("created", "friend joined Review Circle")
    else:
        log("FAILED", f"friend join Review Circle: {r.status_code} {r.text}")


def ensure_group_post(base_url: str, reader_token: str, group_id: int, reading_ub: dict | None):
    headers = {"Authorization": f"Bearer {reader_token}"}
    r = requests.get(f"{base_url}/groups/{group_id}/posts", headers=headers, timeout=60)
    r.raise_for_status()
    if any(p.get("text") == GROUP_POST_TEXT for p in r.json()):
        log("skipped", "group post already exists")
        return

    payload = {"text": GROUP_POST_TEXT}
    if reading_ub:
        payload["userbook_id"] = reading_ub["id"]

    r = requests.post(f"{base_url}/groups/{group_id}/posts", json=payload, headers=headers, timeout=60)
    if r.status_code == 201:
        log("created", "group post created")
    else:
        log("FAILED", f"create group post: {r.status_code} {r.text}")


DEFAULT_ENV_FILE = str(Path(__file__).resolve().parent.parent / ".env.review")


def main():
    parser = argparse.ArgumentParser(description="Seed the two review accounts via the public API.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--env-file",
        default=DEFAULT_ENV_FILE,
        help="Path to a gitignored KEY=value file holding REVIEW_LOGIN_SECRET "
             "(default: .env.review at the repo root). Only used when "
             "REVIEW_LOGIN_SECRET is not already set in the environment.",
    )
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    secret = resolve_secret(args.env_file)

    reader_auth = login(base_url, READER, secret)
    friend_auth = login(base_url, FRIEND, secret)
    reader_token = reader_auth["access_token"]
    friend_token = friend_auth["access_token"]
    reader_id = reader_auth["user"]["id"]
    friend_id = friend_auth["user"]["id"]

    reader_books = ensure_books(base_url, READER, reader_token)
    friend_books = ensure_books(base_url, FRIEND, friend_token)

    if "reading" in reader_books:
        ensure_progress(base_url, reader_token, READER, reader_books["reading"])
    if "reading" in friend_books:
        ensure_progress(base_url, friend_token, FRIEND, friend_books["reading"])

    if "finished" in reader_books:
        ensure_rating(base_url, reader_token, READER, reader_books["finished"])
    if "finished" in friend_books:
        ensure_rating(base_url, friend_token, FRIEND, friend_books["finished"])

    ensure_notes(base_url, reader_token, READER, reader_books.get("reading"), reader_books.get("finished"))
    ensure_notes(base_url, friend_token, FRIEND, friend_books.get("reading"), friend_books.get("finished"))

    ensure_mutual_follow(base_url, reader_token, friend_token, reader_id, friend_id)

    circle_id = ensure_circle(base_url, reader_token)
    if circle_id:
        ensure_friend_joins(base_url, friend_token, circle_id)
        ensure_group_post(base_url, reader_token, circle_id, reader_books.get("reading"))

    print("--- Review accounts " + "-" * 32)
    print(f"  {READER}   id={reader_id}   new={reader_auth['is_new']}")
    print(f"  {FRIEND}   id={friend_id}   new={friend_auth['is_new']}")
    print("--- Summary " + "-" * 40)
    print(f"  created {counts['created']}   skipped {counts['skipped']}   failed {counts['failed']}")
    print(f"  base-url {base_url}")

    if failures:
        print()
        for f in failures:
            print(f"[FAILED] {f}")

    sys.exit(1 if counts["failed"] else 0)


if __name__ == "__main__":
    main()
