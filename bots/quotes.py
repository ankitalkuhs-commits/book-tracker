"""@TMRQuotes — Margin Notes (R-12, E-6).

**Public-domain works only**, from `bots/content/quotes.json`, checked in and never model
generated. Every entry carries `author`, `work` and `year`, and every `year` is 1928 or
earlier — the only thing that can enforce E-6 is the data itself, so C-15 asserts it there.

180-day no-repeat window, enforced the same way the prompt's 60-day one is.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from . import common

CONTENT_TYPE = "quote"
NO_REPEAT_DAYS = 180
POOL_FILE = "quotes.json"

# E-6: the pool is public domain by data. Anything published after this year is out.
PUBLIC_DOMAIN_YEAR_CEILING = 1928


def load_quotes() -> List[Dict[str, Any]]:
    return common.load_pool(POOL_FILE)


def choose(used_keys: Iterable[str]) -> Optional[Dict[str, Any]]:
    return common.first_unused(load_quotes(), CONTENT_TYPE, used_keys)


def compose(entry: Dict[str, Any]) -> str:
    attribution = "{} — {} ({})".format(entry["author"], entry["work"], entry["year"])
    return common.append_label(attribution, common.ACCOUNTS[CONTENT_TYPE]["handle"])


def run() -> None:
    token = common.login(CONTENT_TYPE)
    used = common.posted_keys(token, CONTENT_TYPE, NO_REPEAT_DAYS)
    entry = choose(used)
    if entry is None:
        raise common.BotError(
            "every quote in the pool was used inside the last "
            "{} days".format(NO_REPEAT_DAYS)
        )
    common.post_note(
        token,
        text=compose(entry),
        quote=entry["text"],
        dedup_key="{}:{}".format(CONTENT_TYPE, entry["id"]),
    )


if __name__ == "__main__":  # pragma: no cover - exercised as a subprocess
    common.main_for(run)
