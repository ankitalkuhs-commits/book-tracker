"""@TMRCircles — the Circle Roundup (R-11), and its Thursday fallback (E-3).

What it may say, and what it may not:

* **Public circles only.** A private circle contributes nothing, not even to a count.
* **Aggregate counts only.** No reader name, no username, no profile link, no circle name.
  The only proper noun in the post is a book title.
* **A k-anonymity floor**: a title is named only when at least `MIN_READERS` readers across
  at least `MIN_CIRCLES` public circles are reading it. E-3, decided: the floor does not
  move, and below it the roundup is **not** softened or reworded — Thursday posts a second
  `@TMRPrompts` prompt instead, subject to the same 60-day window.

It reads this through the same public API it posts with, as an ordinary signed-in account,
so it can only see what any reader can see. `GET /groups/discover` is the endpoint that
lists public circles a caller has not joined; a bot has joined none, so it sees them all.
(Architecture's "GET /groups/public" names a route that does not exist — see the build
notes.)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from . import common, prompts

CONTENT_TYPE = "circles"

# E-3: the privacy floor. Lowering these is not an option that exists.
MIN_READERS = 3
MIN_CIRCLES = 2


def _public_circles(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [r for r in rows if not r.get("is_private")]


def summarise(rows: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Aggregate public circles into the one fact the roundup reports, or None below the
    floor. Returns counts and a book title only — never anything identifying."""
    public = _public_circles(rows)
    active = sum(1 for r in public if (r.get("member_count") or 0) > 0)

    tally: Dict[str, Tuple[int, int]] = {}
    for row in public:
        book = row.get("current_book") or {}
        title = (book.get("title") or "").strip()
        if not title:
            continue
        readers, circles = tally.get(title, (0, 0))
        tally[title] = (readers + (row.get("member_count") or 0), circles + 1)

    # The floor is applied FIRST, then the winner is picked from what survives. Picking the
    # most-read title and then testing it would suppress a perfectly publishable roundup
    # whenever the busiest title happens to sit in a single circle.
    eligible = {
        title: counts
        for title, counts in tally.items()
        if counts[0] >= MIN_READERS and counts[1] >= MIN_CIRCLES
    }
    if not eligible:
        return None

    # Most readers wins; ties broken by circle count, then title, so the post is stable.
    title, (readers, circles) = max(
        eligible.items(), key=lambda kv: (kv[1][0], kv[1][1], kv[0])
    )
    return {"active": active, "title": title, "readers": readers, "circles": circles}


def compose(summary: Dict[str, Any]) -> str:
    body = (
        "This week in Literary Circles: {active} circles are active, and the book turning "
        "up most often is {title} - {readers} readers across {circles} circles. "
        "Browse circles from the Circles tab.".format(**summary)
    )
    return common.append_label(body, common.ACCOUNTS[CONTENT_TYPE]["handle"])


def week_key(now=None) -> str:
    now = now or common.utcnow()
    year, week, _ = now.isocalendar()
    return "{}-W{:02d}".format(year, week)


def run() -> None:
    token = common.login(CONTENT_TYPE)
    rows = common.get_json(token, "/groups/discover")
    summary = summarise(rows or [])

    if summary is None:
        # Below the floor. Not softened, not reworded, not posted. E-3.
        common.log("circle roundup below the privacy floor; posting a prompt instead")
        prompts.post_prompt()
        return

    common.post_note(
        token,
        text=compose(summary),
        dedup_key="{}:{}".format(CONTENT_TYPE, week_key()),
    )


if __name__ == "__main__":  # pragma: no cover - exercised as a subprocess
    common.main_for(run)
