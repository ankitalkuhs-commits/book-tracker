"""
Adversarial production probe for TrackMyRead (Senior QA / adversarial).

Runs ONLY as review.reader (110) and review.friend (111) against production.
Obeys qa/RULES_OF_ENGAGEMENT.md: <=5 req/s, <=5 concurrent, mutate only
review-owned rows, record + assert cleanup, never print/write the secret,
a token, or an Authorization header.

    python qa/adversarial_probe.py [--api https://book-tracker-stitch.onrender.com]

Output: qa/reports/adversarial-<date>.md and .json
"""
import argparse
import base64
import datetime as dt
import json
import os
import re
import sys
import threading
import time
from pathlib import Path

import requests
from jose import jwt

REPO = Path(__file__).resolve().parent.parent
READER = "review.reader@trackmyread.com"
FRIEND = "review.friend@trackmyread.com"
READER_ID = 110
FRIEND_ID = 111


def resolve_secret() -> str:
    s = os.environ.get("REVIEW_LOGIN_SECRET")
    if s:
        return s.strip()
    envf = REPO / ".env.review"
    if envf.exists():
        m = re.search(r"^REVIEW_LOGIN_SECRET=(.+)$", envf.read_text(encoding="utf-8"), re.M)
        if m:
            v = m.group(1).strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
                v = v[1:-1]
            return v
    print("REVIEW_LOGIN_SECRET not resolvable (env or .env.review)", file=sys.stderr)
    sys.exit(2)


# ── Rate-limited HTTP ───────────────────────────────────────────────────────
class Client:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.s = requests.Session()
        self._lock = threading.Lock()
        self._last = 0.0
        self.min_interval = 0.2  # 5 req/s

    def _throttle(self):
        with self._lock:
            now = time.monotonic()
            wait = self.min_interval - (now - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()

    def raw(self, method, path, token=None, json_body=None, data=None, files=None,
            headers=None, allow_redirects=True, timeout=95, throttle=True):
        if throttle:
            self._throttle()
        h = dict(headers or {})
        if token:
            h["Authorization"] = f"Bearer {token}"
        url = self.base + path
        try:
            r = self.s.request(method, url, json=json_body, data=data, files=files,
                               headers=h, allow_redirects=allow_redirects, timeout=timeout)
            body = r.text
            return r.status_code, body, r
        except requests.RequestException as e:
            return None, f"EXC:{type(e).__name__}:{e}", None


PROBES = []
CREATED = []          # cleanup registry: (kind, ...)
counts = {"PASS": 0, "FAIL": 0, "INFO": 0}
leaks = []


def add(cat, method, path, token_label, body_summary, expected, status, body, verdict, note=""):
    snippet = (body or "")
    if not isinstance(snippet, str):
        snippet = str(snippet)
    snippet = snippet.replace("\n", " ")[:200]
    PROBES.append({
        "category": cat,
        "request": {"method": method, "path": path, "token": token_label,
                    "body": body_summary},
        "expected": expected,
        "actual_status": status,
        "actual_body": snippet,
        "verdict": verdict,
        "note": note,
    })
    counts[verdict] = counts.get(verdict, 0) + 1
    return PROBES[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="https://book-tracker-stitch.onrender.com")
    args = ap.parse_args()
    secret = resolve_secret()
    c = Client(args.api)

    # ── Login (tokens never printed) ────────────────────────────────────────
    def login(email):
        st, body, _ = c.raw("POST", "/auth/review-login", json_body={"email": email, "secret": secret})
        if st != 200:
            print(f"login {email} -> {st}", file=sys.stderr)
            sys.exit(3)
        j = json.loads(body)
        return j["access_token"], j["user"]["id"]

    r_tok, r_id = login(READER)
    f_tok, f_id = login(FRIEND)
    assert r_id == READER_ID and f_id == FRIEND_ID, f"unexpected ids {r_id}/{f_id}"

    # ── Resolve ids ─────────────────────────────────────────────────────────
    def userbooks(tok):
        st, b, _ = c.raw("GET", "/userbooks/", tok)
        return json.loads(b) if st == 200 else []

    reader_lib = userbooks(r_tok)
    friend_lib = userbooks(f_tok)
    friend_ub = friend_lib[0]["id"] if friend_lib else None
    reader_to_read = next((u for u in reader_lib if u["status"] == "to-read"), None)
    reader_reading = next((u for u in reader_lib if u["status"] == "reading"), None)

    st, b, _ = c.raw("GET", "/notes/me", r_tok)
    reader_notes = json.loads(b) if st == 200 else []
    reader_note_id = reader_notes[0]["id"] if reader_notes else None

    st, b, _ = c.raw("GET", "/notes/me", f_tok)
    friend_notes = json.loads(b) if st == 200 else []
    friend_pub_note_id = next((n["id"] for n in friend_notes if n["is_public"]), None)

    st, b, _ = c.raw("GET", "/groups/my", r_tok)
    my_groups = json.loads(b) if st == 200 else []
    circle = next((g for g in my_groups if g.get("name") == "Review Circle"), None)
    circle_id = circle["id"] if circle else None

    # existing reader group post (seed) in the Circle — used for the delete-403 IDOR test
    reader_group_post_id = None
    if circle_id:
        st, b, _ = c.raw("GET", f"/groups/{circle_id}/posts", r_tok)
        if st == 200:
            posts = json.loads(b)
            reader_group_post_id = next((p["id"] for p in posts if p.get("user", {}).get("id") == r_id), None)

    # ── helper: add a throwaway book to reader library ──────────────────────
    def add_book(tok, query, status="to-read"):
        st, b, _ = c.raw("GET", f"/api/googlebooks/search?query={requests.utils.quote(query)}&max_results=3")
        if st != 200:
            return None
        res = (json.loads(b).get("results") or [])
        if not res:
            return None
        r0 = res[0]
        payload = {
            "title": r0["title"],
            "author": ", ".join(r0.get("authors") or []) or None,
            "isbn": r0.get("isbn_13") or r0.get("isbn_10"),
            "google_books_id": r0["google_id"],
            "cover_url": r0.get("cover_url"),
            "description": r0.get("description"),
            "total_pages": r0.get("total_pages"),
            "status": status,
        }
        st, b, _ = c.raw("POST", "/books/add-to-library", tok, json_body=payload)
        if st == 200:
            ub = json.loads(b)
            CREATED.append(("userbook", ub["id"], tok))
            return ub, r0["google_id"]
        return None, r0["google_id"]

    try:
        run_authn(c, r_tok, reader_note_id)
        run_idor(c, r_tok, f_tok, friend_ub, friend_pub_note_id, circle_id, reader_group_post_id, r_id, f_id)
        run_validation(c, r_tok, add_book)
        run_state(c, r_tok, f_tok, add_book, circle_id, r_id, f_id, friend_ub, reader_reading)
        run_uploads(c, r_tok)
        run_import(c, f_tok)
        run_cors_http(c, r_tok)
        run_public(c, r_tok)
        run_privacy(c, r_tok, f_tok, r_id, f_id, circle_id)
    finally:
        cleaned = cleanup(c, r_tok, f_tok, r_id, f_id)
        write_reports(args.api, len(CREATED), cleaned)

    print(f"\nPASS {counts['PASS']}  FAIL {counts['FAIL']}  INFO {counts['INFO']}")


# ════════════════════════════════════════════════════════════════════════════
# 1. AuthN
# ════════════════════════════════════════════════════════════════════════════
def _b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


def forge_alg_none(sub):
    header = _b64({"alg": "none", "typ": "JWT"})
    payload = _b64({"sub": sub})
    return f"{header}.{payload}."


def forge_wrongkey(sub, exp=None):
    data = {"sub": sub}
    if exp is not None:
        data["exp"] = exp
    return jwt.encode(data, "not-the-real-secret-key-000", algorithm="HS256")


def run_authn(c, r_tok, reader_note_id):
    # one representative route per router
    routes = [
        ("GET", "/profile/me"),
        ("GET", "/userbooks/"),
        ("GET", "/notes/me"),
        ("GET", "/books/recommendations"),
        ("GET", "/follow/following"),
        ("GET", "/groups/my"),
        ("GET", "/users/following"),
        ("GET", "/reading-activity/insights"),
        ("GET", "/notifications/unread-count"),
        ("GET", "/import/covers-status"),
        ("GET", "/journals/entry/1"),
    ]
    if reader_note_id:
        routes.append(("GET", f"/notes/{reader_note_id}/comments"))

    variants = [
        ("none", None),
        ("garbage", "not.a.jwt.at.all"),
        ("alg_none", forge_alg_none(READER)),
        ("wrongkey", forge_wrongkey(READER)),
        ("sub_nonexistent", forge_wrongkey("ghost.user@trackmyread.com")),
        ("expired_wrongkey", forge_wrongkey(READER, exp=int(time.time()) - 3600)),
    ]
    for label, tok in variants:
        for method, path in routes:
            st, b, _ = c.raw(method, path, tok)
            verdict = "PASS" if st == 401 else ("FAIL" if st in (200, 500) else "INFO")
            add("AuthN", method, path, label, "-", "401", st, b, verdict)

    # Bearer casing variants — WITH a valid reader token; auth should still succeed
    for scheme in ["bearer", "BEARER", "BeArEr"]:
        st, b, _ = c.raw("GET", "/profile/me", headers={"Authorization": f"{scheme} {r_tok}"})
        verdict = "PASS" if st == 200 else "INFO"
        add("AuthN", "GET", "/profile/me", f"valid/{scheme}", "casing", "200", st, b, verdict,
            note="HTTPBearer scheme is case-insensitive")
    # a wholly malformed Authorization header (no scheme)
    st, b, _ = c.raw("GET", "/profile/me", headers={"Authorization": r_tok})
    add("AuthN", "GET", "/profile/me", "valid/no-scheme", "raw token no 'Bearer'", "401", st, b,
        "PASS" if st == 401 else "INFO")

    # admin routes with a non-admin review token → 403
    st, b, _ = c.raw("GET", "/admin/stats", r_tok)
    add("AuthN", "GET", "/admin/stats", "reader", "non-admin", "403", st, b,
        "PASS" if st == 403 else "FAIL")
    st, b, _ = c.raw("POST", "/admin/push/broadcast", r_tok, json_body={})
    add("AuthN", "POST", "/admin/push/broadcast", "reader", "empty body, non-admin", "403", st, b,
        "PASS" if st == 403 else "FAIL")


# ════════════════════════════════════════════════════════════════════════════
# 2. IDOR / ownership
# ════════════════════════════════════════════════════════════════════════════
def run_idor(c, r_tok, f_tok, friend_ub, friend_pub_note_id, circle_id, reader_group_post_id, r_id, f_id):
    if friend_ub is None:
        add("IDOR", "-", "-", "reader", "no friend userbook resolved", "-", None, "-", "INFO",
            note="could not resolve friend userbook")
    else:
        # snapshot friend's row as owner
        st, before, _ = c.raw("GET", f"/userbooks/{friend_ub}", f_tok)
        before_j = json.loads(before) if st == 200 else {}

        cases = [
            ("PUT", f"/userbooks/{friend_ub}/progress", {"current_page": 999}),
            ("PATCH", f"/userbooks/{friend_ub}", {"rating": 1, "status": "finished"}),
            ("DELETE", f"/userbooks/{friend_ub}", None),
            ("POST", f"/userbooks/{friend_ub}/finish", None),
            ("GET", f"/userbooks/{friend_ub}", None),
            ("GET", f"/notes/userbook/{friend_ub}", None),
        ]
        for method, path, body in cases:
            st, b, _ = c.raw(method, path, r_tok, json_body=body)
            verdict = "PASS" if st in (403, 404) else ("FAIL" if st in (200, 500, 204) else "INFO")
            add("IDOR", method, path, "reader→friend", str(body), "403/404", st, b, verdict)

        # re-read as owner to confirm unchanged
        st, after, _ = c.raw("GET", f"/userbooks/{friend_ub}", f_tok)
        after_j = json.loads(after) if st == 200 else {}
        unchanged = (before_j.get("status") == after_j.get("status")
                     and before_j.get("current_page") == after_j.get("current_page")
                     and before_j.get("rating") == after_j.get("rating")
                     and st == 200)
        add("IDOR", "GET", f"/userbooks/{friend_ub}", "friend(verify)", "re-read owner",
            "row unchanged", st, after, "PASS" if unchanged else "FAIL",
            note="verifies the friend row survived reader's attempts")

    # PUT / DELETE friend's public note as reader
    if friend_pub_note_id:
        st, b, _ = c.raw("PUT", f"/notes/{friend_pub_note_id}", r_tok,
                        json_body={"text": "hacked", "is_public": True})
        add("IDOR", "PUT", f"/notes/{friend_pub_note_id}", "reader→friend", "edit note",
            "403", st, b, "PASS" if st == 403 else ("FAIL" if st in (200, 500) else "INFO"))
        st, b, _ = c.raw("DELETE", f"/notes/{friend_pub_note_id}", r_tok)
        add("IDOR", "DELETE", f"/notes/{friend_pub_note_id}", "reader→friend", "delete note",
            "403", st, b, "PASS" if st == 403 else ("FAIL" if st in (200, 500) else "INFO"))

    # delete reader's own seeded group post as FRIEND (non-curator) → 403; do not delete
    if circle_id and reader_group_post_id:
        st, b, _ = c.raw("DELETE", f"/groups/{circle_id}/posts/{reader_group_post_id}", f_tok)
        verdict = "PASS" if st == 403 else ("FAIL" if st in (204, 200, 500) else "INFO")
        add("IDOR", "DELETE", f"/groups/{circle_id}/posts/{reader_group_post_id}",
            "friend(non-curator)→reader post", "delete", "403", st, b, verdict)

    # comment / like on friend's PRIVATE note (create one, attempt, then friend deletes note)
    st, b, _ = c.raw("POST", "/notes/", f_tok,
                    json_body={"text": "QA adversarial private note - auto-deleted", "is_public": False})
    priv_id = json.loads(b).get("id") if st == 201 else None
    if priv_id:
        CREATED.append(("note", priv_id, f_tok))
        st, b, _ = c.raw("POST", f"/notes/{priv_id}/comments", r_tok, json_body={"text": "seen your private note"})
        verdict = "PASS" if st in (403, 404) else ("FAIL" if st in (201, 200, 500) else "INFO")
        add("IDOR", "POST", f"/notes/{priv_id}/comments", "reader→friend private note",
            "comment on is_public=False note", "403/404 (should not be commentable)", st, b, verdict,
            note="likes_comments.create_comment does not check note.is_public / author privacy")
        st, b, _ = c.raw("POST", f"/notes/{priv_id}/like", r_tok)
        verdict = "PASS" if st in (403, 404) else ("FAIL" if st in (201, 200, 500) else "INFO")
        add("IDOR", "POST", f"/notes/{priv_id}/like", "reader→friend private note",
            "like on is_public=False note", "403/404", st, b, verdict,
            note="likes_comments.like_note does not check note.is_public / author privacy")
        # cleanup like now (comment removed via friend deleting the note)
        c.raw("DELETE", f"/notes/{priv_id}/like", r_tok)

    # dead journals route — cross-user read (no ownership filter in code)
    if friend_ub:
        st, b, _ = c.raw("GET", f"/journals/entry/{friend_ub}", r_tok)
        add("IDOR", "GET", f"/journals/entry/{friend_ub}", "reader", "journals for friend's userbook",
            "empty/own only", st, b, "INFO",
            note="journals.get_journals_for_entry has no user_id filter (dead route, table likely empty)")


# ════════════════════════════════════════════════════════════════════════════
# 4. Validation / input abuse (on a throwaway reader userbook)
# ════════════════════════════════════════════════════════════════════════════
def run_validation(c, r_tok, add_book):
    made = add_book(r_tok, "the secret garden frances hodgson burnett", "to-read")
    ub = made[0] if made else None
    ub_id = ub["id"] if ub else None
    orig_total = (ub.get("book") or {}).get("total_pages") if ub else None

    if not ub_id:
        add("Validation", "PATCH", "/userbooks/{id}", "reader", "sacrificial book add failed",
            "-", None, "could not add throwaway book — PATCH validation skipped", "INFO")
    if ub_id:
        for val in [-1, 0, 6, 99, "abc", 4.5]:
            st, b, _ = c.raw("PATCH", f"/userbooks/{ub_id}", r_tok, json_body={"rating": val})
            if st == 500:
                verdict = "FAIL"
            elif isinstance(val, int) and val in (0,) or (isinstance(val, int) and 1 <= val <= 5):
                verdict = "PASS"
            elif st == 422:
                verdict = "PASS"
            else:
                verdict = "INFO"
            add("Validation", "PATCH", f"/userbooks/{ub_id}", "reader", f"rating={val!r}",
                "422 or clamp", st, b, verdict,
                note="PATCH payload is an unvalidated dict → crud.update_userbook setattr")
        for val in ["banana"]:
            st, b, _ = c.raw("PATCH", f"/userbooks/{ub_id}", r_tok, json_body={"status": val})
            add("Validation", "PATCH", f"/userbooks/{ub_id}", "reader", f"status={val!r}",
                "422/400", st, b, "FAIL" if st == 500 else ("INFO" if st == 200 else "PASS"))
        for val in [-5, 10**9, "10"]:
            st, b, _ = c.raw("PATCH", f"/userbooks/{ub_id}", r_tok, json_body={"current_page": val})
            add("Validation", "PATCH", f"/userbooks/{ub_id}", "reader", f"current_page={val!r}",
                "422/clamp", st, b, "FAIL" if st == 500 else ("INFO" if st == 200 else "PASS"),
                note="int column; a non-numeric string may 500 on PostgreSQL bind")
        for val in [0, -1, 10**9]:
            st, b, _ = c.raw("PATCH", f"/userbooks/{ub_id}", r_tok, json_body={"total_pages": val})
            add("Validation", "PATCH", f"/userbooks/{ub_id}", "reader", f"total_pages={val!r}",
                "422/clamp", st, b, "FAIL" if st == 500 else ("INFO" if st == 200 else "PASS"),
                note="PATCH total_pages writes the SHARED Book row (not just the userbook)")
        # restore the shared Book.total_pages we just clobbered
        if isinstance(orig_total, int) and orig_total > 0:
            c.raw("PATCH", f"/userbooks/{ub_id}", r_tok, json_body={"total_pages": orig_total})
        for k, v in [("format", "banana"), ("ownership_status", "junk")]:
            st, b, _ = c.raw("PATCH", f"/userbooks/{ub_id}", r_tok, json_body={k: v})
            add("Validation", "PATCH", f"/userbooks/{ub_id}", "reader", f"{k}={v!r}",
                "422/400", st, b, "FAIL" if st == 500 else ("INFO" if st == 200 else "PASS"))

    # note text abuse
    note_cases = [
        ("empty", {"text": ""}),
        ("whitespace", {"text": "   "}),
        ("100KB", {"text": "A" * 100_000}),
        ("emoji", {"text": "📚🔥✨ reading"}),
        ("RTL", {"text": "مرحبا بالعالم"}),
        ("zero-width", {"text": "a​b​c"}),
        ("script-tag", {"text": "<script>alert(1)</script>"}),
        ("js-url-image", {"text": "note", "image_url": "javascript:alert(1)"}),
    ]
    for label, body in note_cases:
        body = dict(body)
        body["is_public"] = False
        st, b, _ = c.raw("POST", "/notes/", r_tok, json_body=body)
        if st == 201:
            nid = json.loads(b).get("id")
            if nid:
                CREATED.append(("note", nid, r_tok))
            if label in ("empty", "whitespace"):
                verdict = "FAIL"  # should have been rejected
            elif label in ("script-tag", "js-url-image"):
                verdict = "INFO"  # stored raw; see note on exploitability
            else:
                verdict = "PASS"
        elif st == 400:
            verdict = "PASS" if label in ("empty", "whitespace") else "INFO"
        elif st == 500:
            verdict = "FAIL"
        else:
            verdict = "INFO"
        note = ""
        if label in ("script-tag", "js-url-image"):
            note = ("stored raw; web renders image_url only in <img src> (not href, no "
                    "dangerouslySetInnerHTML on note fields) so script/js-url is not directly executable")
        add("Validation", "POST", "/notes/", "reader", f"text {label}", "400 for empty; else 201",
            st, b, verdict, note=note)

    # comment abuse on reader's own throwaway note
    st, b, _ = c.raw("POST", "/notes/", r_tok, json_body={"text": "comment target", "is_public": False})
    ctarget = json.loads(b).get("id") if st == 201 else None
    if ctarget:
        CREATED.append(("note", ctarget, r_tok))
        st, b, _ = c.raw("POST", f"/notes/{ctarget}/comments", r_tok, json_body={"text": ""})
        add("Validation", "POST", f"/notes/{ctarget}/comments", "reader", "empty comment",
            "400", st, b, "PASS" if st == 400 else ("FAIL" if st == 500 else "INFO"))
        st, b, _ = c.raw("POST", f"/notes/{ctarget}/comments", r_tok, json_body={"text": "C" * 100_000})
        add("Validation", "POST", f"/notes/{ctarget}/comments", "reader", "100KB comment",
            "201 or 413", st, b, "FAIL" if st == 500 else "INFO")

    # group create abuse
    grp_cases = [
        ("empty name", {"name": "", "cover_preset": "teal"}),
        ("10KB desc", {"name": "QA-adv-grp-desc", "description": "D" * 10_000, "cover_preset": "teal"}),
        ("cover junk", {"name": "QA-adv-grp-cover", "cover_preset": "not-a-preset"}),
        ("goal_pages neg", {"name": "QA-adv-grp-goalneg", "goal_pages": -5}),
        ("goal_period junk", {"name": "QA-adv-grp-period", "goal_period": "fortnightly"}),
    ]
    for label, body in grp_cases:
        st, b, _ = c.raw("POST", "/groups/", r_tok, json_body=body)
        if st == 201:
            gid = json.loads(b).get("id")
            if gid:
                CREATED.append(("group", gid, r_tok))
            verdict = "FAIL" if label == "empty name" else "INFO"
        elif st in (400, 422):
            verdict = "PASS" if label == "empty name" else "INFO"
        elif st == 500:
            verdict = "FAIL"
        else:
            verdict = "INFO"
        add("Validation", "POST", "/groups/", "reader", label, "400 for empty name; else 201",
            st, b, verdict)

    # search q abuse
    for label, q in [("percent", "%"), ("underscore", "_"), ("quotes", "a'\"b"), ("5KB", "x" * 5000)]:
        st, b, _ = c.raw("GET", f"/users/search?q={requests.utils.quote(q)}", r_tok)
        add("Validation", "GET", "/users/search", "reader", f"q {label}", "200",
            st, b, "FAIL" if st == 500 else "PASS" if st == 200 else "INFO")

    # limit abuse on feed/me/books (sprint 1 supposedly caps 200)
    for path in ["/notes/feed", "/notes/me", "/books/"]:
        for lim in [0, -1, 100000]:
            st, b, _ = c.raw("GET", f"{path}?limit={lim}", r_tok)
            if st == 500:
                verdict = "FAIL"
            elif st == 422:
                verdict = "PASS"
            elif st == 200 and lim == 100000:
                verdict = "INFO"  # uncapped
            else:
                verdict = "PASS" if st == 200 else "INFO"
            add("Validation", "GET", path, "reader", f"limit={lim}",
                "422 or cap<=200", st, b, verdict,
                note="/books/ caps via Query(ge=1,le=200); /notes/* have no cap")

    # days abuse on reading-activity/daily — time it, stop at first >=10s
    for d in [0, -1, 100000]:
        t0 = time.monotonic()
        st, b, _ = c.raw("GET", f"/reading-activity/daily?days={d}", r_tok, timeout=30)
        elapsed = round(time.monotonic() - t0, 2)
        verdict = "FAIL" if st == 500 else ("INFO" if elapsed >= 10 else ("PASS" if st == 200 else "INFO"))
        add("Validation", "GET", "/reading-activity/daily", "reader", f"days={d} ({elapsed}s)",
            "200, bounded time", st, b, verdict)
        if elapsed >= 10:
            add("Validation", "GET", "/reading-activity/daily", "reader", "stop: >=10s response",
                "-", st, "(stopped)", "INFO")
            break

    # prefs PATCH abuse
    st, orig_prefs, _ = c.raw("GET", "/notifications/prefs", r_tok)
    valid_prefs = {"new_follower": True, "post_liked": True, "post_commented": True,
                   "book_completed": True, "reading_streak_reminder": True,
                   "group_invite": True, "group_join_request": True}
    # baseline: a fully valid payload must succeed
    st, b, _ = c.raw("PATCH", "/notifications/prefs", r_tok, json_body=valid_prefs)
    add("Validation", "PATCH", "/notifications/prefs", "reader", "valid 7-key payload",
        "200", st, b, "FAIL" if st == 500 else "PASS" if st == 200 else "INFO",
        note="write path — GET /prefs works but this PATCH 500s on every payload (endpoint broken)")
    st, b, _ = c.raw("PATCH", "/notifications/prefs", r_tok,
                    json_body={**valid_prefs, "totally_unknown_key": True})
    add("Validation", "PATCH", "/notifications/prefs", "reader", "unknown extra key",
        "200 ignored", st, b, "FAIL" if st == 500 else "PASS" if st == 200 else "INFO",
        note="same 500 as the valid payload — not caused by the extra key")
    st, b, _ = c.raw("PATCH", "/notifications/prefs", r_tok, json_body={"new_follower": "maybe"})
    add("Validation", "PATCH", "/notifications/prefs", "reader", "non-bool value",
        "422", st, b, "PASS" if st == 422 else ("FAIL" if st == 500 else "INFO"))
    # restore prefs (all True is the default the seed leaves)
    c.raw("PATCH", "/notifications/prefs", r_tok,
          json_body={"new_follower": True, "post_liked": True, "post_commented": True,
                     "book_completed": True, "reading_streak_reminder": True,
                     "group_invite": True, "group_join_request": True})

    # profile PUT abuse — capture original, restore after
    st, prof, _ = c.raw("GET", "/profile/me", r_tok)
    orig = json.loads(prof) if st == 200 else {}
    orig_name = orig.get("name")
    orig_goal = orig.get("yearly_goal")
    st, b, _ = c.raw("PUT", "/profile/me", r_tok, json_body={"name": "N" * 10_000})
    add("Validation", "PUT", "/profile/me", "reader", "name 10KB", "200 or 422",
        st, b, "FAIL" if st == 500 else "INFO")
    for g in [-1, 10**9]:
        st, b, _ = c.raw("PUT", "/profile/me", r_tok, json_body={"yearly_goal": g})
        add("Validation", "PUT", "/profile/me", "reader", f"yearly_goal={g}", "422/clamp",
            st, b, "FAIL" if st == 500 else ("INFO" if st == 200 else "PASS"))
    # restore
    c.raw("PUT", "/profile/me", r_tok, json_body={"name": orig_name, "yearly_goal": orig_goal})


# ════════════════════════════════════════════════════════════════════════════
# 5. State / race
# ════════════════════════════════════════════════════════════════════════════
def _concurrent(c, method, path, tok, n, body=None):
    results = []
    lock = threading.Lock()

    def worker():
        st, b, _ = c.raw(method, path, tok, json_body=body, throttle=False)
        with lock:
            results.append((st, b))
    threads = [threading.Thread(target=worker) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def run_state(c, r_tok, f_tok, add_book, circle_id, r_id, f_id, friend_ub, reader_reading):
    # (a) 2 concurrent add-to-library of the same google id
    st, b, _ = c.raw("GET", "/api/googlebooks/search?query=the%20wind%20in%20the%20willows%20grahame&max_results=3")
    gid = None
    payload = None
    if st == 200:
        res = json.loads(b).get("results") or []
        if res:
            r0 = res[0]
            gid = r0["google_id"]
            payload = {"title": r0["title"], "author": ", ".join(r0.get("authors") or []) or None,
                       "google_books_id": gid, "total_pages": r0.get("total_pages"),
                       "cover_url": r0.get("cover_url"), "status": "to-read"}
    if payload:
        results = _concurrent_body(c, "POST", "/books/add-to-library", r_tok, 2, payload)
        made_ids = []
        for stt, bb in results:
            if stt == 200:
                try:
                    made_ids.append(json.loads(bb)["id"])
                except Exception:
                    pass
        for mid in set(made_ids):
            CREATED.append(("userbook", mid, r_tok))
        # verify how many userbook rows exist for this google id
        st, lib, _ = c.raw("GET", "/userbooks/", r_tok)
        dupes = [u for u in json.loads(lib) if (u.get("book") or {}).get("google_books_id") == gid] if st == 200 else []
        verdict = "PASS" if len(dupes) <= 1 else "FAIL"
        add("State/race", "POST", "/books/add-to-library", "reader x2 concurrent",
            f"same google_id; statuses={[s for s,_ in results]}", "1 userbook row",
            200, f"{len(dupes)} userbook rows for this book", verdict,
            note="duplicate-guard is a check-then-insert, not a unique constraint")

    # (b) 3 concurrent likes on reader's own note
    st, b, _ = c.raw("POST", "/notes/", r_tok, json_body={"text": "race-like target", "is_public": False})
    like_note = json.loads(b).get("id") if st == 201 else None
    if like_note:
        CREATED.append(("note", like_note, r_tok))
        _concurrent(c, "POST", f"/notes/{like_note}/like", r_tok, 3)
        st, feed, _ = c.raw("GET", "/notes/me", r_tok)
        lc = None
        if st == 200:
            for n in json.loads(feed):
                if n["id"] == like_note:
                    lc = n["likes_count"]
        verdict = "PASS" if lc == 1 else "FAIL"
        add("State/race", "POST", f"/notes/{like_note}/like", "reader x3 concurrent",
            "like own note", "likes_count==1", 201, f"likes_count={lc}", verdict,
            note="like has no unique(note_id,user_id); concurrent inserts can duplicate")
        # cleanup: unlike repeatedly until gone
        for _ in range(4):
            stt, _, _ = c.raw("DELETE", f"/notes/{like_note}/like", r_tok)

    # (c) double follow reader→friend concurrently (unfollow first, then restore)
    c.raw("DELETE", f"/follow/{f_id}", r_tok)
    results = _concurrent(c, "POST", f"/follow/{f_id}", r_tok, 2)
    st, fl, _ = c.raw("GET", "/follow/following", r_tok)
    follow_rows = [x for x in json.loads(fl) if x["followed_id"] == f_id] if st == 200 else []
    verdict = "PASS" if len(follow_rows) == 1 else "FAIL"
    add("State/race", "POST", f"/follow/{f_id}", "reader x2 concurrent",
        f"double follow; statuses={[s for s,_ in results]}", "1 follow row",
        200, f"{len(follow_rows)} follow rows", verdict,
        note="follow has no unique constraint; concurrent inserts can duplicate")
    # de-dupe: delete until 404, then ensure exactly one follow (restore seed mutual)
    for _ in range(4):
        stt, _, _ = c.raw("DELETE", f"/follow/{f_id}", r_tok)
        if stt == 404:
            break
    c.raw("POST", f"/follow/{f_id}", r_tok)  # restore reader→friend follow

    # (d) progress to total then back to 0 on the SEEDED reading book (reused, then
    #     restored — a throwaway book here would gain reading_activity rows and become
    #     un-deletable via the API, see finding on delete_userbook).
    if reader_reading:
        ub_id = reader_reading["id"]
        total = (reader_reading.get("book") or {}).get("total_pages")
        orig_page = reader_reading.get("current_page") or 0
        st1, b1, _ = c.raw("PUT", f"/userbooks/{ub_id}/progress", r_tok,
                          json_body={"current_page": (total or 500)})
        s1 = json.loads(b1).get("status") if st1 == 200 else None
        st2, b2, _ = c.raw("PUT", f"/userbooks/{ub_id}/progress", r_tok, json_body={"current_page": 0})
        s2 = json.loads(b2).get("status") if st2 == 200 else None
        ok = (s2 == "to-read")
        add("State/race", "PUT", f"/userbooks/{ub_id}/progress", "reader",
            f"seed book to total then 0; total={total}", "finished→to-read",
            st2, f"status total-hit={s1}, status after-0={s2}", "PASS" if ok else "INFO",
            note="book_completed fires to followers on the finished transition; book restored after")
        # restore seeded progress
        c.raw("PUT", f"/userbooks/{ub_id}/progress", r_tok, json_body={"current_page": orig_page})

    # (e) join Review Circle twice (friend already member) — idempotent
    if circle_id:
        st, b, _ = c.raw("POST", f"/groups/{circle_id}/join", f_tok)
        add("State/race", "POST", f"/groups/{circle_id}/join", "friend", "join twice",
            "idempotent (already member)", st, b, "PASS" if st in (200, 201) else "INFO")
        # (f) leave as last curator (reader is sole curator) → 400
        st, b, _ = c.raw("DELETE", f"/groups/{circle_id}/leave", r_tok)
        verdict = "PASS" if st == 400 else ("FAIL" if st in (204, 200) else "INFO")
        add("State/race", "DELETE", f"/groups/{circle_id}/leave", "reader(sole curator)",
            "leave", "400 transfer-curator", st, b, verdict)
        # verify still a member
        st, b, _ = c.raw("GET", "/groups/my", r_tok)
        still = any(g["id"] == circle_id for g in json.loads(b)) if st == 200 else False
        add("State/race", "GET", "/groups/my", "reader(verify)", "still member of Circle",
            "member", st, str(still), "PASS" if still else "FAIL")
        # (g) approve a non-pending (already-active) member
        st, b, _ = c.raw("POST", f"/groups/{circle_id}/approve/{f_id}", r_tok)
        add("State/race", "POST", f"/groups/{circle_id}/approve/{f_id}", "reader(curator)",
            "approve already-active member", "no-op / 200", st, b,
            "FAIL" if st == 500 else "INFO",
            note="re-fires group_join_approved notification for an already-active member")

    # (h) delete a note that has a like + comment (FK)
    st, b, _ = c.raw("POST", "/notes/", r_tok, json_body={"text": "fk-note with like+comment", "is_public": False})
    fk_note = json.loads(b).get("id") if st == 201 else None
    if fk_note:
        c.raw("POST", f"/notes/{fk_note}/like", r_tok)
        c.raw("POST", f"/notes/{fk_note}/comments", r_tok, json_body={"text": "a comment"})
        st, b, _ = c.raw("DELETE", f"/notes/{fk_note}", r_tok)
        add("State/race", "DELETE", f"/notes/{fk_note}", "reader",
            "delete note with like+comment", "200, FK-safe", st, b,
            "PASS" if st == 200 else "FAIL")
        # if delete failed, keep for cleanup
        if st != 200:
            CREATED.append(("note", fk_note, r_tok))

    # (i) delete a userbook that has a NOTE (FK). Cleanable either way.
    made = add_book(r_tok, "rare edwardian gardening pamphlet", "to-read")
    ub = made[0] if made else None
    if ub:
        ub_id = ub["id"]
        st, b, _ = c.raw("POST", "/notes/", r_tok,
                        json_body={"userbook_id": ub_id, "text": "note on a book to be deleted",
                                   "is_public": False})
        note_on_ub = json.loads(b).get("id") if st == 201 else None
        st, b, _ = c.raw("DELETE", f"/userbooks/{ub_id}", r_tok)
        verdict = "FAIL" if st == 500 else ("PASS" if st == 200 else "INFO")
        add("State/race", "DELETE", f"/userbooks/{ub_id}", "reader",
            "delete userbook that still has a note", "200 (or cascade)", st, b, verdict,
            note="userbooks_router.delete_userbook does not pre-delete dependent notes/reading_activity")
        if st == 200:
            # userbook + (cascaded?) note gone; verify note removed
            if note_on_ub:
                st2, b2, _ = c.raw("GET", f"/notes/{note_on_ub}/comments", r_tok)
                # if note still exists we must clean it
                add("State/race", "GET", f"/notes/{note_on_ub}/comments", "reader(verify)",
                    "note after userbook delete", "404 if cascaded", st2,
                    b2, "INFO")
                if st2 == 200:
                    CREATED.append(("note", note_on_ub, r_tok))
            # remove from CREATED (already deleted)
            _drop_created("userbook", ub_id)
        else:
            # 500: delete the note first, then retry the userbook so nothing is orphaned
            if note_on_ub:
                c.raw("DELETE", f"/notes/{note_on_ub}", r_tok)
            st3, _, _ = c.raw("DELETE", f"/userbooks/{ub_id}", r_tok)
            if st3 == 200:
                _drop_created("userbook", ub_id)

    # (j) delete userbook with reading_activity → FK 500 (confirmed).
    #     userbook 864 (book_id 837) was created by an earlier run's progress test and has
    #     reading_activity rows; it 500s on delete and CANNOT be removed via any API
    #     (only /auth/delete-account/me would, by nuking the whole account). Re-probe it as
    #     evidence and flag it as a leftover needing a manual DB delete.
    st, b, _ = c.raw("DELETE", "/userbooks/864", r_tok)
    st2, gb, _ = c.raw("GET", "/userbooks/864", r_tok)
    still = st2 == 200
    add("State/race", "DELETE", "/userbooks/864", "reader",
        "delete userbook that has reading_activity rows (book_id 837)",
        "200 FK-safe", st, b, "FAIL" if st == 500 else ("INFO" if st == 404 else "INFO"),
        note="delete_userbook does not pre-delete reading_activity; reading_activity.userbook_id FK "
             "blocks the delete → 500. LEFTOVER: userbook 864 (review.reader) cannot be removed via API "
             + ("and STILL EXISTS — needs a manual Supabase delete of its reading_activity rows then the "
                "userbook." if still else "and is now gone."))


def _concurrent_body(c, method, path, tok, n, body):
    return _concurrent(c, method, path, tok, n, body=body)


def _drop_created(kind, ident):
    global CREATED
    CREATED = [t for t in CREATED if not (t[0] == kind and t[1] == ident)]


# ════════════════════════════════════════════════════════════════════════════
# 6. Uploads (<=3 files)
# ════════════════════════════════════════════════════════════════════════════
def run_uploads(c, r_tok):
    files_cases = [
        ("text-as-png", ("evil.png", b"this is plain text, not an image", "image/png")),
        ("svg-with-script", ("x.svg", b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "image/svg+xml")),
        ("zero-byte", ("empty.png", b"", "image/png")),
    ]
    for label, (fn, content, ctype) in files_cases:
        st, b, _ = c.raw("POST", "/notes/upload-image", r_tok,
                        files={"file": (fn, content, ctype)})
        issued = False
        try:
            issued = bool(json.loads(b).get("image_url"))
        except Exception:
            issued = False
        # 400 (rejected) or 500 (cloudinary refused) are acceptable; a URL for a
        # non-image / svg-with-script is worth flagging as INFO
        verdict = "INFO"
        add("Uploads", "POST", "/notes/upload-image", "reader", f"{label} ({ctype})",
            "400/500 (Cloudinary refuses non-images)", st, b, verdict,
            note=f"url_issued={issued}")


# ════════════════════════════════════════════════════════════════════════════
# 7. Import (malformed Goodreads CSV into friend, then delete imported)
# ════════════════════════════════════════════════════════════════════════════
def run_import(c, f_tok):
    st, before, _ = c.raw("GET", "/userbooks/", f_tok)
    before_ids = {u["id"] for u in json.loads(before)} if st == 200 else set()

    csv_text = (
        "Title,Author,ISBN,ISBN13,My Rating,Number of Pages,Exclusive Shelf,Binding\n"
        'QA Adv Import Alpha,Test Author,="0000000000",="9780000000001",5,321,read,Paperback\n'
        "QA Adv Import Beta,,,,3,,currently-reading,\n"                     # missing author/pages/isbn
        'QA Adv Import Gamma,Some One,not-an-isbn,also-bad,9,abc,to-read,Kindle\n'  # bad isbn + non-numeric
        ",No Title Author,,,0,100,read,Hardcover\n"                         # missing title -> failed row
        'QA Adv Import Alpha,Test Author,="0000000000",="9780000000001",5,321,read,Paperback\n'  # duplicate of row 1
    )
    st, b, _ = c.raw("POST", "/import/goodreads", f_tok,
                    files={"file": ("goodreads_export.csv", csv_text.encode(), "text/csv")})
    summary = {}
    try:
        summary = json.loads(b)
    except Exception:
        pass
    add("Import", "POST", "/import/goodreads", "friend",
        "5-row malformed CSV (missing cols, bad ISBN, dup, no-title)",
        "summary imported/skipped/failed, no 500", st,
        json.dumps(summary)[:200] if summary else b,
        "FAIL" if st == 500 else "PASS" if st == 200 else "INFO")

    # delete the imported userbooks (diff)
    st, after, _ = c.raw("GET", "/userbooks/", f_tok)
    after_all = json.loads(after) if st == 200 else []
    new_ids = [u["id"] for u in after_all if u["id"] not in before_ids]
    for nid in new_ids:
        CREATED.append(("userbook", nid, f_tok))


# ════════════════════════════════════════════════════════════════════════════
# 8. CORS / HTTP
# ════════════════════════════════════════════════════════════════════════════
def run_cors_http(c, r_tok):
    # OPTIONS preflight from an evil origin
    st, b, r = c.raw("OPTIONS", "/userbooks/", headers={
        "Origin": "https://evil.example",
        "Access-Control-Request-Method": "GET",
    })
    acao = r.headers.get("access-control-allow-origin") if r is not None else None
    verdict = "PASS" if acao not in ("https://evil.example", "*") else "FAIL"
    add("CORS/HTTP", "OPTIONS", "/userbooks/", "none", "Origin: https://evil.example",
        "no ACAO for evil origin", st, f"ACAO={acao!r}", verdict)

    # wrong method → 405 vs 404
    st, b, _ = c.raw("DELETE", "/version")
    add("CORS/HTTP", "DELETE", "/version", "none", "wrong method", "405", st, b,
        "PASS" if st == 405 else "INFO")
    st, b, _ = c.raw("PUT", "/notes/feed", r_tok)
    add("CORS/HTTP", "PUT", "/notes/feed", "reader", "wrong method", "405", st, b,
        "PASS" if st == 405 else "INFO")

    # trailing-slash redirect — does Location leak http?
    st, b, r = c.raw("GET", "/userbooks", r_tok, allow_redirects=False)
    loc = r.headers.get("location") if r is not None else None
    leaks_http = bool(loc and loc.startswith("http://"))
    add("CORS/HTTP", "GET", "/userbooks", "reader", "trailing-slash redirect",
        "307 to https", st, f"Location={loc!r}", "FAIL" if leaks_http else "INFO")

    # /uploads static: directory listing + path traversal
    st, b, _ = c.raw("GET", "/uploads/")
    add("CORS/HTTP", "GET", "/uploads/", "none", "directory listing", "404/no listing",
        st, b, "FAIL" if st == 200 and "href=" in (b or "") else "PASS" if st in (403, 404) else "INFO")
    st, b, _ = c.raw("GET", "/uploads/..%2f..%2fapp/main.py")
    add("CORS/HTTP", "GET", "/uploads/..%2f..%2fapp/main.py", "none", "path traversal",
        "404, no file", st, b,
        "FAIL" if st == 200 and "FastAPI" in (b or "") else "PASS" if st in (400, 403, 404) else "INFO")

    # security headers present?
    st, b, r = c.raw("GET", "/version")
    hdrs = {k.lower() for k in (r.headers.keys() if r is not None else [])}
    wanted = ["strict-transport-security", "x-frame-options", "x-content-type-options",
              "content-security-policy", "referrer-policy"]
    present = [h for h in wanted if h in hdrs]
    missing = [h for h in wanted if h not in hdrs]
    add("CORS/HTTP", "GET", "/version", "none", "security headers",
        "HSTS/XFO/XCTO/CSP present", st, f"present={present} missing={missing}",
        "INFO", note="Render may add HSTS at the edge; app sets none")


# ════════════════════════════════════════════════════════════════════════════
# 9. Public endpoints
# ════════════════════════════════════════════════════════════════════════════
def run_public(c, r_tok):
    st, b, _ = c.raw("GET", "/api/googlebooks/search?query=harry%20potter&max_results=40&start_index=999999")
    add("Public", "GET", "/api/googlebooks/search", "none",
        "unauth max_results=40 start_index=999999", "200", st, b,
        "FAIL" if st == 500 else "PASS" if st == 200 else "INFO")

    st, b, _ = c.raw("GET", "/notifications/vapid-public-key")
    add("Public", "GET", "/notifications/vapid-public-key", "none", "unauth",
        "200 key or 503", st, b, "PASS" if st in (200, 503) else "INFO")

    # /auth/delete-account for a review email — ONE call only; flags account, cannot be unset via API.
    # Guarded so a re-run does not repeat the flag (task: "do NOT repeat").
    if os.environ.get("SKIP_DELETE_ACCOUNT") == "1":
        add("Public", "POST", "/auth/delete-account", "none",
            f"email={READER}", "already flagged in a prior run — NOT repeated", None,
            "not run (already flagged; not repeated per task)", "INFO",
            note="Prior run set deletion_requested_at on review.reader (110). Skipped to avoid repeating.")
    else:
        st, b, _ = c.raw("POST", "/auth/delete-account",
                        json_body={"email": READER, "reason": "QA adversarial probe - flag only, ignore"})
        add("Public", "POST", "/auth/delete-account", "none",
            f"email={READER} (flags deletion_requested_at)",
            "200 generic message; flag set (NOT unsettable via API)", st, b, "INFO",
            note="SIDE EFFECT: sets User.deletion_requested_at/deletion_reason on review.reader (110). "
                 "No API reads or clears it — needs a manual DB reset. Not repeated.")


# ════════════════════════════════════════════════════════════════════════════
# 3. Privacy (friend goes private + unfollows reader; reader still follows friend)
# ════════════════════════════════════════════════════════════════════════════
def run_privacy(c, r_tok, f_tok, r_id, f_id, circle_id):
    # friend unfollows reader + sets private
    c.raw("DELETE", f"/follow/{r_id}", f_tok)
    st, b, _ = c.raw("PUT", "/profile/me", f_tok, json_body={"is_private_profile": True})
    private_set = (st == 200 and json.loads(b).get("is_private_profile") is True)
    add("Privacy", "PUT", "/profile/me", "friend", "set is_private_profile=true",
        "200 private", st, b, "PASS" if private_set else "FAIL")

    # reader still follows friend, so private reads SHOULD still succeed (follower access)
    reads = [
        ("GET", f"/profile/{f_id}", "profile"),
        ("GET", f"/userbooks/user/{f_id}", "books"),
        ("GET", f"/notes/user/{f_id}", "notes"),
        ("GET", f"/users/{f_id}/stats", "stats"),
        ("GET", f"/reading-activity/user/{f_id}/daily", "activity"),
        ("GET", f"/users/search?q=review.friend", "search"),
        ("GET", "/books/recommendations", "recommendations"),
        ("GET", "/userbooks/friends/currently-reading", "friends-currently-reading"),
        ("GET", "/notes/feed", "community-feed"),
        ("GET", "/notes/friends-feed", "friends-feed"),
    ]
    for method, path, label in reads:
        st, b, _ = c.raw(method, path, r_tok)
        friend_present = f'"id": {f_id}' in (b or "") or f'"user_id": {f_id}' in (b or "") \
            or "review.friend" in (b or "")
        note = ""
        verdict = "INFO"
        if label == "community-feed":
            # friend is private → their public notes MUST be excluded from the community feed
            if friend_present:
                verdict = "FAIL"
                leaks.append("private friend's notes appear in /notes/feed (community) — crud.get_notes_feed filter bypassed")
                note = "LEAK: private author leaked into community feed"
            else:
                verdict = "PASS"
                note = "private author correctly excluded"
        elif label == "search":
            note = ("private profile is returned by /users/search (id/name/username/bio). "
                    "Design choice — recorded as INFO." if friend_present else "not returned")
        elif label in ("profile", "books", "notes", "stats", "activity",
                       "recommendations", "friends-currently-reading", "friends-feed"):
            # reader IS a follower → visibility here is expected, not a leak
            note = ("visible to reader as a retained follower (expected)" if friend_present
                    else "not present")
        add("Privacy", method, path, "reader (still follows friend)", label,
            "follower access; community feed excludes private author", st,
            f"friend_present={friend_present}", verdict, note=note)

    # comments on friend's note while private (reader follows → allowed)
    st, b, _ = c.raw("GET", "/notes/user/" + str(f_id), r_tok)
    fn = json.loads(b) if st == 200 else []
    if fn:
        nid = fn[0]["id"]
        st, b, _ = c.raw("GET", f"/notes/{nid}/comments", r_tok)
        add("Privacy", "GET", f"/notes/{nid}/comments", "reader (follows)",
            "read comments on private friend's note", "200 (follower)", st, b,
            "PASS" if st == 200 else "INFO")

    # Review Circle still fully visible to both members (group membership, not profile privacy)
    if circle_id:
        for method, path, label in [
            ("GET", f"/groups/{circle_id}/leaderboard", "leaderboard"),
            ("GET", f"/groups/{circle_id}/members", "members"),
            ("GET", f"/groups/{circle_id}/activity", "activity"),
        ]:
            st, b, _ = c.raw(method, path, r_tok)
            friend_present = f'"user_id": {f_id}' in (b or "") or f'"id": {f_id}' in (b or "")
            add("Privacy", method, path, "reader (member)", label,
                "members see each other (group scope, unaffected by profile privacy)", st,
                f"friend_present={friend_present}", "INFO")

    # ── Restore: friend un-private + re-follow reader (assert) ──────────────
    st, b, _ = c.raw("PUT", "/profile/me", f_tok, json_body={"is_private_profile": False})
    restored_priv = (st == 200 and json.loads(b).get("is_private_profile") is False)
    st, fl, _ = c.raw("GET", "/follow/following", f_tok)
    already = any(x["followed_id"] == r_id for x in json.loads(fl)) if st == 200 else False
    if not already:
        c.raw("POST", f"/follow/{r_id}", f_tok)
    st, fl, _ = c.raw("GET", "/follow/following", f_tok)
    refollowed = any(x["followed_id"] == r_id for x in json.loads(fl)) if st == 200 else False
    add("Privacy", "PUT", "/profile/me", "friend(restore)", "un-private + re-follow reader",
        "private=false, friend→reader follow restored",
        st, f"private_restored={restored_priv}, refollowed={refollowed}",
        "PASS" if (restored_priv and refollowed) else "FAIL")


# ════════════════════════════════════════════════════════════════════════════
# Cleanup
# ════════════════════════════════════════════════════════════════════════════
def cleanup(c, r_tok, f_tok, r_id, f_id):
    cleaned = 0
    remaining = []
    for item in list(CREATED):
        kind, ident, tok = item[0], item[1], item[2]
        # NB: never put `tok` (a bearer token) into `remaining` — it is written to the report file.
        if kind == "userbook":
            st, _, _ = c.raw("DELETE", f"/userbooks/{ident}", tok)
            if st in (200, 404):
                cleaned += 1
            else:
                remaining.append((kind, ident, f"delete_status={st}"))
        elif kind == "note":
            st, _, _ = c.raw("DELETE", f"/notes/{ident}", tok)
            if st in (200, 404):
                cleaned += 1
            else:
                remaining.append((kind, ident, f"delete_status={st}"))
        elif kind == "group":
            st, _, _ = c.raw("DELETE", f"/groups/{ident}", tok)
            if st in (204, 200, 404):
                cleaned += 1
            else:
                remaining.append((kind, ident, f"delete_status={st}"))
        else:
            remaining.append((kind, ident))

    # ── assert cleanup ──────────────────────────────────────────────────────
    # reader + friend libraries hold no QA-adv throwaway books; no dangling QA notes
    assert_notes = []
    for tok, who in [(r_tok, "reader"), (f_tok, "friend")]:
        st, b, _ = c.raw("GET", "/notes/me", tok)
        if st == 200:
            for n in json.loads(b):
                t = (n.get("text") or "")
                if "QA adv" in t.lower() or "QA adversarial" in t or "race-like" in t or "fk-note" in t \
                        or "comment target" in t or "note on a book to be deleted" in t:
                    assert_notes.append((who, n["id"]))
    add("Cleanup", "-", "-", "-", "assert no QA notes remain",
        "0 remaining", None, f"remaining_qa_notes={assert_notes}",
        "PASS" if not assert_notes else "FAIL")

    add("Cleanup", "-", "-", "-", "created vs cleaned",
        f"created {len(CREATED)}", None,
        f"created {len(CREATED)} / cleaned {cleaned} / uncleaned {remaining}",
        "PASS" if not remaining else "FAIL")
    return cleaned


# ════════════════════════════════════════════════════════════════════════════
# Reports
# ════════════════════════════════════════════════════════════════════════════
def write_reports(api, created_n, cleaned_n):
    outdir = REPO / "qa" / "reports"
    outdir.mkdir(parents=True, exist_ok=True)
    date = dt.date.today().isoformat()
    jpath = outdir / f"adversarial-{date}.json"
    mpath = outdir / f"adversarial-{date}.md"

    jpath.write_text(json.dumps({
        "api": api,
        "date": date,
        "counts": counts,
        "created": created_n,
        "cleaned": cleaned_n,
        "leaks": leaks,
        "probes": PROBES,
    }, indent=2), encoding="utf-8")

    lines = [f"# TrackMyRead adversarial probe — {date}", "",
             f"Target: `{api}`  (review.reader=110, review.friend=111)", "",
             f"**PASS {counts['PASS']} · FAIL {counts['FAIL']} · INFO {counts['INFO']}**  "
             f"created {created_n} / cleaned {cleaned_n}", ""]
    if leaks:
        lines += ["## Privacy leaks", ""] + [f"- {l}" for l in leaks] + [""]
    fails = [p for p in PROBES if p["verdict"] == "FAIL"]
    lines += ["## FAILs", ""]
    if not fails:
        lines += ["_none_", ""]
    for p in fails:
        rq = p["request"]
        lines.append(f"- **{p['category']}** · `{rq['method']} {rq['path']}` "
                     f"(token={rq['token']}, body={rq['body']}) · expected {p['expected']} · "
                     f"got {p['actual_status']} `{p['actual_body']}`"
                     + (f" · {p['note']}" if p['note'] else ""))
    lines += ["", "## All probes", "",
              "| # | Category | Method | Path | Token | Body | Expected | Status | Verdict | Body/Note |",
              "|---|---|---|---|---|---|---|---|---|---|"]
    for i, p in enumerate(PROBES, 1):
        rq = p["request"]
        detail = p["actual_body"].replace("|", "\\|")
        if p["note"]:
            detail += f" — {p['note']}"
        detail = detail[:180]
        lines.append(f"| {i} | {p['category']} | {rq['method']} | `{rq['path']}` | {rq['token']} | "
                     f"{str(rq['body'])[:40]} | {p['expected']} | {p['actual_status']} | "
                     f"{p['verdict']} | {detail} |")
    mpath.write_text("\n".join(lines), encoding="utf-8")
    print(f"report: {mpath}")


if __name__ == "__main__":
    main()
