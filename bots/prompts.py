"""@TMRPrompts — the Reading Prompt (R-10).

The question comes from `bots/content/prompts.json`, a checked-in list. **Nothing here
calls a language model**: R-10 says the prompt pool is the repository's, and C-16 asserts
that structurally over this file's AST.

The 60-day no-repeat window is enforced by asking `GET /bots/posted` first, so the pool is
filtered before anything is composed.

Pool sizing (K-13): `@TMRPrompts` carries up to **three** slots a week — Tuesday, Saturday,
and Thursday whenever the circle roundup's privacy floor does not fire (E-3). Over a
60-day window that is `ceil(60/7) * 3 + 1 = 28` distinct prompts at minimum; the PM's
stated floor is 40. C-13 derives the first number from the workflow and this constant,
C-13a pins the constant, and C-13b pins the PM's floor.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from . import common

CONTENT_TYPE = "prompt"
NO_REPEAT_DAYS = 60
POOL_FILE = "prompts.json"


def load_prompts() -> List[Dict[str, Any]]:
    return common.load_pool(POOL_FILE)


def choose(used_keys: Iterable[str]) -> Optional[Dict[str, Any]]:
    return common.first_unused(load_prompts(), CONTENT_TYPE, used_keys)


def compose(entry: Dict[str, Any]) -> str:
    # R-05a withdrawn 2026-09-29: the pool entry is the whole post, nothing is appended.
    return entry["text"]


def post_prompt(token: Optional[str] = None) -> int:
    """Post one prompt. Also the Thursday fallback path for `bots.circles` (E-3), which is
    why it takes an optional token rather than always minting its own."""
    token = token or common.login(CONTENT_TYPE)
    used = common.posted_keys(token, CONTENT_TYPE, NO_REPEAT_DAYS)
    entry = choose(used)
    if entry is None:
        raise common.BotError(
            "every prompt in the pool was used inside the last "
            "{} days".format(NO_REPEAT_DAYS)
        )
    return common.post_note(
        token,
        text=compose(entry),
        dedup_key="{}:{}".format(CONTENT_TYPE, entry["id"]),
    )


def run() -> None:
    post_prompt()


if __name__ == "__main__":  # pragma: no cover - exercised as a subprocess
    common.main_for(run)
