"""Verify a newly created API service before anything points at it (F-68 region migration).

    python qa/verify_new_service.py https://book-tracker-sg.onrender.com

Read-only: every request is a GET, except the review-login POST that issues a QA token. It never
writes reader data. Safe to run against the new service while the old one still serves everyone.

Checks, in order of what would stop the migration:
  1. it answers, and reports the same commit as the live service
  2. database time per request has actually collapsed (the whole point of the move)
  3. the login token from the old service is accepted here (SECRET_KEY was copied correctly)
  4. web push keys match the old service (VAPID pair copied correctly)
  5. it is not scheduling reminders (RUN_SCHEDULER=0 until cutover)
  6. the review accounts and their data are visible, i.e. it is the same database
Exit code 0 only if every check passes.
"""
import os
import re
import sys
import time
import urllib.request
import urllib.error
import json
import statistics
from pathlib import Path

OLD = "https://book-tracker-stitch.onrender.com"
REVIEW_READER = "review.reader@trackmyread.com"
REPO = Path(__file__).resolve().parent.parent

ok_count = fail_count = 0


def report(ok, label, detail=""):
    global ok_count, fail_count
    print(f"[{'PASS' if ok else 'FAIL'}] {label}{(' - ' + detail) if detail else ''}")   # ASCII: the Windows console is cp1252
    if ok:
        ok_count += 1
    else:
        fail_count += 1
    return ok


def call(base, path, token=None, method="GET", body=None, timeout=60):
    req = urllib.request.Request(base + path, method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, data=data, timeout=timeout) as r:
            return r.status, dict(r.headers), json.loads(r.read() or b"null"), (time.perf_counter() - started) * 1000
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), None, (time.perf_counter() - started) * 1000


def read_secret():
    if os.getenv("REVIEW_LOGIN_SECRET"):
        return os.getenv("REVIEW_LOGIN_SECRET").strip()
    f = REPO / ".env.review"
    if f.exists():
        m = re.search(r'^(?:export\s+)?REVIEW_LOGIN_SECRET=["\']?([^"\'\r\n]+)', f.read_text(encoding="utf-8"), re.M)
        if m:
            return m.group(1).strip()
    return None


def db_ms(headers):
    """Database milliseconds and query count from the Server-Timing header."""
    m = re.search(r'db;dur=([\d.]+);desc="(\d+) queries"', headers.get("server-timing", "") or headers.get("Server-Timing", ""))
    return (float(m.group(1)), int(m.group(2))) if m else (None, None)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    new = sys.argv[1].rstrip("/")
    if "trackmyread.com" in new and "api." not in new:
        print("refusing: that looks like the web app, not an API service")
        return 2
    print(f"new service: {new}\nold service: {OLD}\n")

    # 1. alive, and same code
    status, _, version, _ = call(new, "/version")
    report(status == 200, "answers /version", f"HTTP {status}")
    _, _, old_version, _ = call(OLD, "/version")
    same = version and old_version and version.get("commit") == old_version.get("commit")
    report(bool(same), "same commit as the live service",
           f"new {str(version and version.get('commit'))[:7]} vs old {str(old_version and old_version.get('commit'))[:7]}")

    secret = read_secret()
    if not secret:
        report(False, "REVIEW_LOGIN_SECRET available", "set it or create .env.review; the rest needs a token")
        return 1

    # token issued by the OLD service, deliberately: it proves SECRET_KEY matches
    status, _, auth, _ = call(OLD, "/auth/review-login", method="POST",
                              body={"email": REVIEW_READER, "secret": secret})
    if not report(status == 200 and auth, "got a QA token from the old service", f"HTTP {status}"):
        return 1
    token = auth["access_token"]

    # 3. SECRET_KEY copied correctly
    status, headers, me, _ = call(new, "/profile/me", token=token)
    report(status == 200, "the old service's token is accepted here (SECRET_KEY matches)",
           f"HTTP {status}" + ("" if status == 200 else " - a different SECRET_KEY signs every reader out"))

    # 2. the point of the migration
    samples = []
    for _ in range(5):
        _, h, _, total = call(new, "/profile/me", token=token)
        ms, q = db_ms(h)
        if ms is not None:
            samples.append((ms, q, total))
    if samples:
        med_db = statistics.median(s[0] for s in samples)
        queries = samples[0][1]
        med_total = statistics.median(s[2] for s in samples)
        per_query = med_db / queries if queries else None
        report(per_query is not None and per_query < 20,
               "database is in the same region (per-query time)",
               f"{med_db:.0f} ms over {queries} queries = {per_query:.0f} ms each; end-to-end {med_total:.0f} ms"
               + ("" if per_query and per_query < 20 else " - expected 1-2 ms each; this service is NOT co-located"))
    else:
        report(False, "database is in the same region (per-query time)", "no Server-Timing header")

    # 4. VAPID pair copied
    _, _, key_new, _ = call(new, "/notifications/vapid-public-key", token=token)
    _, _, key_old, _ = call(OLD, "/notifications/vapid-public-key", token=token)
    report(bool(key_new) and key_new == key_old,
           "web push key matches the old service (VAPID pair copied)",
           "identical" if key_new == key_old else "DIFFERENT - every existing web push subscription would stop")

    # 6. same database
    status, _, ubs, _ = call(new, "/userbooks/", token=token)
    report(status == 200 and isinstance(ubs, list) and len(ubs) > 0,
           "same database (the review account's books are here)",
           f"{len(ubs) if isinstance(ubs, list) else '?'} books")

    # 5. not scheduling
    print("\n[note] RUN_SCHEDULER cannot be read over HTTP. Confirm in the dashboard that the new "
          "service has RUN_SCHEDULER=0 until cutover, or readers get each reminder twice.")

    print(f"\n{ok_count} passed, {fail_count} failed")
    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
