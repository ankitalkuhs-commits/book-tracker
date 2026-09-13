"""
Post-deploy live checks against production, run as the seeded review accounts (sprint-2 behaviours + sprint-1 auth). Run after scripts/seed_review_accounts.py.
Self-cleaning: anything it creates (a like, a private note) is removed at the end.
Secret read from <book-tracker>/.env.review; never printed. Tokens never printed.

    python qa/live_checks.py [--api https://book-tracker-stitch.onrender.com]
"""
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

REPO = pathlib.Path(__file__).resolve().parent.parent
API = sys.argv[sys.argv.index("--api") + 1] if "--api" in sys.argv else "https://book-tracker-stitch.onrender.com"
SECRET = re.search(r"^REVIEW_LOGIN_SECRET=(.+)$", (REPO / ".env.review").read_text(encoding="utf-8"), re.M).group(1).strip()

results = []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")[:200]


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{' - ' + detail if detail else ''}")


def login(email):
    code, body = call("POST", "/auth/review-login", body={"email": email, "secret": SECRET})
    if code != 200:
        print(f"login {email} -> {code}")
        sys.exit(3)
    return body["access_token"], body["user"]


def main():
    code, ver = call("GET", "/version")
    print(f"version: {ver}")

    r_tok, reader = login("review.reader@trackmyread.com")
    f_tok, friend = login("review.friend@trackmyread.com")

    # --- 1. friends feed: reader follows friend (mutual) -> friend's public notes present, mutual flagged, newest-first
    code, feed = call("GET", "/notes/friends-feed", r_tok)
    friend_posts = [n for n in (feed or []) if isinstance(feed, list) and n.get("user", {}).get("id") == friend["id"]]
    check("1a friends-feed 200 as reader", code == 200, f"{len(feed) if isinstance(feed, list) else feed} posts")
    check("1b friend's public notes appear", len(friend_posts) >= 1, f"{len(friend_posts)} from review.friend")
    check("1c mutual follow flagged on author", all(n["user"].get("is_mutual") for n in friend_posts) if friend_posts else False)
    stamps = [n["created_at"] for n in friend_posts]
    check("1d within the mutual group: newest first", stamps == sorted(stamps, reverse=True), f"{stamps}")
    check("1e note-card shape keys present",
          all({"likes_count", "comments_count", "liked_by_me", "user_has_liked", "user", "book"} <= set(n) for n in (feed or [])))
    print("     (mutual-before-non-mutual ordering needs a third, non-mutual account - covered by pytest, not provable with two review users)")

    # --- 2. /notes/me liked_by_me is real, not hardcoded True
    code, mine = call("GET", "/notes/me", r_tok)
    check("2a /notes/me 200", code == 200 and isinstance(mine, list) and len(mine) >= 2, f"{len(mine) if isinstance(mine, list) else mine} notes")
    liked_created = None
    if isinstance(mine, list) and len(mine) >= 2:
        target = next((n for n in mine if not n["liked_by_me"]), None)
        check("2b at least one own note reads liked_by_me=false (was always true before sprint 2)", target is not None)
        if target:
            call("POST", f"/notes/{target['id']}/like", r_tok)
            liked_created = target["id"]
            _, mine2 = call("GET", "/notes/me", r_tok)
            by_id = {n["id"]: n for n in mine2}
            others = [n for n in mine2 if n["id"] != target["id"] and n["id"] not in {x["id"] for x in mine if x["liked_by_me"]}]
            check("2c liked note -> liked_by_me=true and user_has_liked=true",
                  by_id[target["id"]]["liked_by_me"] is True and by_id[target["id"]]["user_has_liked"] is True)
            check("2d other un-liked notes stay false", all(n["liked_by_me"] is False for n in others), f"{len(others)} others")

    # --- 3. private note never reaches circle activity
    code, groups = call("GET", "/groups/my", r_tok)
    circle = next((g for g in (groups or []) if isinstance(groups, list) and g.get("name") == "Review Circle"), None)
    check("3a reader is in Review Circle", circle is not None)
    private_id = None
    if circle:
        code, note = call("POST", "/notes/", r_tok, {"text": "QA live check - private note, auto-deleted", "is_public": False})
        private_id = note.get("id") if isinstance(note, dict) else None
        check("3b private note created", code == 201 and private_id, f"id {private_id}")
        code, act = call("GET", f"/groups/{circle['id']}/activity", f_tok)
        items = act if isinstance(act, list) else (act or {}).get("items", act) if isinstance(act, dict) else []
        blob = json.dumps(items)
        check("3c circle activity (seen by friend) has no note_posted for the private note",
              code == 200 and f'"note_id": {private_id}' not in blob and "auto-deleted" not in blob,
              f"activity {code}, {len(items) if isinstance(items, list) else '?'} events")

    # --- 4. insights months
    code, ins = call("GET", "/reading-activity/insights", r_tok)
    months = [m["month"] for m in (ins or {}).get("monthly_pages", [])] if isinstance(ins, dict) else []
    today = dt.date.today()
    expected, y, m = [], today.year, today.month
    for _ in range(12):
        expected.append(f"{y}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    expected.reverse()
    check("4a monthly_pages = 12 consecutive calendar months ending this month", months == expected, f"{months[0] if months else '-'} .. {months[-1] if months else '-'}")
    check("4b streak fields present", isinstance(ins, dict) and {"current_streak", "longest_streak"} <= set(ins),
          f"current {ins.get('current_streak') if isinstance(ins, dict) else '-'}, longest {ins.get('longest_streak') if isinstance(ins, dict) else '-'}")

    # --- 5. auth hardening still live (sprint 1)
    code, _ = call("DELETE", "/books/1")
    check("5a anonymous DELETE /books/1 -> 401", code == 401, str(code))

    # --- cleanup
    if liked_created:
        c, _ = call("DELETE", f"/notes/{liked_created}/like", r_tok)
        print(f"cleanup: unlike note {liked_created} -> {c}")
    if private_id:
        c, _ = call("DELETE", f"/notes/{private_id}", r_tok)
        print(f"cleanup: delete private note {private_id} -> {c}")

    passed = sum(ok for _, ok, _ in results)
    print(f"\nLIVE CHECKS: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
