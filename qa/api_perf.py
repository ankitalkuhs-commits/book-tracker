"""
Sampled API latency baseline for production, as review.reader. Read-only (GET only).
Follows qa/RULES_OF_ENGAGEMENT.md: <= 5 req/s sequential, one small concurrency probe of 5.

    python qa/api_perf.py [--api https://book-tracker-stitch.onrender.com] [--samples 8]

Writes qa/reports/api-perf-<YYYY-MM-DD>.md and .json. Secret from REVIEW_LOGIN_SECRET or .env.review; never printed.
"""
import concurrent.futures as cf
import datetime as dt
import json
import os
import pathlib
import re
import statistics
import sys
import time

import requests

REPO = pathlib.Path(__file__).resolve().parent.parent
API = sys.argv[sys.argv.index("--api") + 1] if "--api" in sys.argv else "https://book-tracker-stitch.onrender.com"
SAMPLES = int(sys.argv[sys.argv.index("--samples") + 1]) if "--samples" in sys.argv else 8


def secret():
    if os.getenv("REVIEW_LOGIN_SECRET"):
        return os.environ["REVIEW_LOGIN_SECRET"].strip()
    m = re.search(r"^REVIEW_LOGIN_SECRET=(.+)$", (REPO / ".env.review").read_text(encoding="utf-8"), re.M)
    return m.group(1).strip() if m else None


def timed(session, method, path, **kw):
    t0 = time.perf_counter()
    try:
        r = session.request(method, API + path, timeout=90, **kw)
        return (time.perf_counter() - t0) * 1000, r.status_code, len(r.content), r
    except requests.RequestException as e:
        return (time.perf_counter() - t0) * 1000, f"ERR {type(e).__name__}", 0, None


def pct(values, p):
    if not values:
        return None
    s = sorted(values)
    return s[min(len(s) - 1, round(p / 100 * (len(s) - 1)))]


def main():
    sec = secret()
    if not sec:
        print("REVIEW_LOGIN_SECRET not set (env or .env.review)")
        sys.exit(2)

    s = requests.Session()
    # Cold-start probe before anything else wakes the service.
    cold_ms, cold_status, _, _ = timed(s, "GET", "/version")

    ms, status, _, r = timed(s, "POST", "/auth/review-login",
                             json={"email": "review.reader@trackmyread.com", "secret": sec})
    if status != 200:
        print(f"login failed: {status}")
        sys.exit(3)
    login_ms = ms
    token = r.json()["access_token"]
    s.headers["Authorization"] = f"Bearer {token}"
    del token

    # Resolve ids owned by the review accounts (never real users').
    me = s.get(API + "/profile/me", timeout=90).json()
    friend_id = 111
    ubs = s.get(API + "/userbooks/", timeout=90).json()
    ub = ubs[0] if ubs else None
    notes = s.get(API + "/notes/me", timeout=90).json()
    note = notes[0] if notes else None
    groups = s.get(API + "/groups/my", timeout=90).json()
    circle = next((g for g in groups if g.get("name") == "Review Circle"), None)

    paths = [
        "/", "/version",
        "/profile/me", f"/profile/{friend_id}",
        "/userbooks/", "/userbooks/friends/currently-reading", f"/userbooks/user/{friend_id}",
        "/notes/feed", "/notes/friends-feed", "/notes/me", f"/notes/user/{friend_id}",
        "/books/recommendations", "/books/search?q=hobbit", "/books/?limit=50",
        "/api/googlebooks/search?query=dune",
        "/users/search?q=review", "/users/following", f"/users/{friend_id}/stats",
        "/follow/following", "/follow/followers",
        "/reading-activity/daily", "/reading-activity/insights", f"/reading-activity/user/{friend_id}/daily",
        "/notifications/unread-count", "/notifications/history", "/notifications/prefs",
        "/groups/my", "/groups/my/pending", "/groups/invites/pending", "/groups/discover",
        "/import/covers-status",
    ]
    if ub:
        paths += [f"/userbooks/{ub['id']}", f"/notes/userbook/{ub['id']}", f"/books/{ub['book']['id']}"]
    if note:
        paths += [f"/notes/{note['id']}/comments"]
    if circle:
        g = circle["id"]
        paths += [f"/groups/{g}", f"/groups/{g}/members", f"/groups/{g}/posts", f"/groups/{g}/leaderboard",
                  f"/groups/{g}/goal", f"/groups/{g}/activity", f"/groups/{g}/pending"]

    rows = []
    for path in paths:
        times, statuses, size = [], set(), 0
        for _ in range(SAMPLES):
            ms, status, nbytes, _ = timed(s, "GET", path)
            times.append(ms)
            statuses.add(status)
            size = nbytes
            time.sleep(0.25)  # <= 4 req/s
        rows.append({
            "path": path,
            "status": sorted(map(str, statuses)),
            "bytes": size,
            "p50_ms": round(statistics.median(times)),
            "p95_ms": round(pct(times, 95)),
            "max_ms": round(max(times)),
        })
        print(f"{rows[-1]['p50_ms']:>6} p50  {rows[-1]['p95_ms']:>6} p95  {rows[-1]['status']}  {size:>7}B  {path}")

    # One gentle concurrency probe: 5 parallel, 20 total, on the three heaviest reads.
    conc = {}
    for path in ["/notes/feed", "/reading-activity/insights", "/books/recommendations"]:
        with cf.ThreadPoolExecutor(max_workers=5) as ex:
            results = list(ex.map(lambda _: timed(s, "GET", path)[:2], range(20)))
        t = [ms for ms, _ in results]
        conc[path] = {"p50_ms": round(statistics.median(t)), "p95_ms": round(pct(t, 95)),
                      "errors": sum(1 for _, st in results if st != 200)}
        time.sleep(2)

    today = dt.date.today().isoformat()
    out = REPO / "qa" / "reports"
    out.mkdir(parents=True, exist_ok=True)
    data = {"api": API, "date": today, "samples": SAMPLES, "cold_version_ms": round(cold_ms),
            "cold_version_status": cold_status, "login_ms": round(login_ms), "rows": rows, "concurrency_5x20": conc}
    (out / f"api-perf-{today}.json").write_text(json.dumps(data, indent=2), encoding="utf-8")

    slow = sorted(rows, key=lambda r: -r["p95_ms"])
    md = [f"# API latency baseline — {today}", "",
          f"API `{API}` · {SAMPLES} sequential samples per endpoint (GET, as review.reader) · measured from Pune, IN.", "",
          f"- First request (`/version`, may include Render cold start): **{round(cold_ms)} ms** ({cold_status})",
          f"- `POST /auth/review-login`: {round(login_ms)} ms", "",
          "| p50 ms | p95 ms | max ms | status | bytes | endpoint |", "|---:|---:|---:|---|---:|---|"]
    md += [f"| {r['p50_ms']} | {r['p95_ms']} | {r['max_ms']} | {', '.join(r['status'])} | {r['bytes']} | `{r['path']}` |" for r in slow]
    md += ["", "## Concurrency probe (5 parallel × 20)", "", "| endpoint | p50 ms | p95 ms | errors |", "|---|---:|---:|---:|"]
    md += [f"| `{p}` | {v['p50_ms']} | {v['p95_ms']} | {v['errors']} |" for p, v in conc.items()]
    (out / f"api-perf-{today}.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"\nwrote qa/reports/api-perf-{today}.md")


if __name__ == "__main__":
    main()
