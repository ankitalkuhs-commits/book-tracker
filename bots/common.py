"""Shared plumbing for the four bot voices: the label, the token, the two API calls.

Design constraints this file exists to keep (spec R-05a, R-07, R-08, R-15):

* **The R-05a label is a fixed string built here, never by the language model.** One
  module-level literal, `LABEL_TEMPLATE`, and one function that appends it. C-01/C-02/C-02a.
* **No database.** The only I/O is `requests` against the public API. C-04a.
* **Nothing secret is ever logged.** `log()` is the only output path and it prints what it
  is given; no caller passes it a response body, a header or a token. GitHub masks secrets
  in public logs on a best-effort basis only, so masking is not treated as a control
  (architecture Security review 6). C-12.
* **No retries.** A 409 or a 429 fails the run and nothing is tried again: the server owns
  dedup and the cap, and a retry would either double-post or hammer the cap. C-05.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

import requests

# ── The R-05a label ──────────────────────────────────────────────────────────
#
# E-2, decided: an em dash, a space, then `automated post from @<handle>`. Lower-case
# "automated", no trailing punctuation. This is the ONLY place the form is written down,
# and it is a plain literal so that no code path can build it from model output.
LABEL_TEMPLATE = "— automated post from @{handle}"

# Derived, so the prefix can never drift from the template above.
LABEL_PREFIX = LABEL_TEMPLATE[: LABEL_TEMPLATE.index("{")]

# ── Accounts ─────────────────────────────────────────────────────────────────
#
# handle is what appears in the label; email is what /auth/bot-login is given.
ACCOUNTS: Dict[str, Dict[str, str]] = {
    "bestseller": {"handle": "TMRBot", "email": "tmrbot@trackmyread.com"},
    "prompt": {"handle": "TMRPrompts", "email": "tmrprompts@trackmyread.com"},
    "quote": {"handle": "TMRQuotes", "email": "tmrquotes@trackmyread.com"},
    "circles": {"handle": "TMRCircles", "email": "tmrcircles@trackmyread.com"},
}

CONTENT_TYPES = tuple(ACCOUNTS)

DEFAULT_API_BASE = "https://api.trackmyread.com"

HTTP_TIMEOUT = 20


class BotError(RuntimeError):
    """Any reason this run must stop. Carries a status code when one is known."""

    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.status = status


def api_base() -> str:
    return os.environ.get("TMR_API_BASE", DEFAULT_API_BASE).rstrip("/")


def label_line(handle: str) -> str:
    """The exact R-05a line for one account. `handle` is given without the `@`."""
    return LABEL_TEMPLATE.format(handle=handle)


def append_label(body: str, handle: str) -> str:
    """Append the R-05a line to finished body text.

    Called *after* every content source (the model included) has had its say, so a model
    that returns nothing still yields a labelled post — C-02.
    """
    return (body or "").rstrip() + "\n\n" + label_line(handle)


def log(*parts: Any) -> None:
    """The only output path. Callers pass status codes, counts and ids — never a body."""
    print(" ".join(str(p) for p in parts), flush=True)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def since_window(days: int) -> str:
    """The `since` query value for a no-repeat window, as the API's naive-UTC ISO form."""
    return (utcnow() - timedelta(days=days)).replace(tzinfo=None).isoformat()


# ── HTTP ─────────────────────────────────────────────────────────────────────
#
# One seam. Every test double replaces this function, so nothing in this package can reach
# the network by accident.
def _request(
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    timeout: int = HTTP_TIMEOUT,
):
    return requests.request(
        method, url, headers=headers, params=params, json=json_body, timeout=timeout
    )


def _auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": "Bearer " + token}


def login(content_type: str) -> str:
    """Exchange BOT_LOGIN_SECRET for a 15-minute token (R-08).

    The secret is read from the environment and passed straight into the request body. It
    is never logged, and neither is the token that comes back.
    """
    account = ACCOUNTS[content_type]
    secret = os.environ.get("BOT_LOGIN_SECRET")
    if not secret:
        raise BotError("BOT_LOGIN_SECRET is not set")

    resp = _request(
        "POST",
        api_base() + "/auth/bot-login",
        json_body={"email": account["email"], "secret": secret},
    )
    status = resp.status_code
    if status != 200:
        # 404 -> the route is not enabled on this service; 401 -> wrong secret or not a bot
        # row. Both are fatal and neither is retried. The body is deliberately not shown.
        raise BotError("bot-login failed", status)
    token = (resp.json() or {}).get("access_token")
    if not token:
        raise BotError("bot-login returned no access_token", status)
    log("login ok status", status)
    return token


def posted_keys(token: str, content_type: str, window_days: Optional[int]) -> List[str]:
    """The dedup_keys already used for this content type inside the no-repeat window.

    `window_days=None` asks for the whole history and sends no `since` — that is the
    bestseller rule, "never posted twice, across all lists" (R-15), as opposed to the
    prompt's 60 days and the quote's 180.

    Called BEFORE anything is composed and before any model call is spent (C-05a).
    """
    params: Dict[str, Any] = {"content_type": content_type}
    if window_days is not None:
        params["since"] = since_window(window_days)
    resp = _request(
        "GET",
        api_base() + "/bots/posted",
        headers=_auth_header(token),
        params=params,
    )
    if resp.status_code != 200:
        raise BotError("GET /bots/posted failed", resp.status_code)
    keys = (resp.json() or {}).get("dedup_keys") or []
    log("posted keys status", resp.status_code, "count", len(keys))
    return list(keys)


def get_json(token: str, path: str, params: Optional[Dict[str, Any]] = None):
    resp = _request("GET", api_base() + path, headers=_auth_header(token), params=params)
    if resp.status_code != 200:
        raise BotError("GET " + path + " failed", resp.status_code)
    log("GET", path, "status", resp.status_code)
    return resp.json()


def post_note(
    token: str,
    *,
    text: str,
    dedup_key: str,
    quote: Optional[str] = None,
    image_url: Optional[str] = None,
) -> int:
    """Create the post. One attempt, ever.

    `is_public` is passed **explicitly**: `notes_router.py`'s F-17 default makes an omitted
    key private, so leaving it out would publish nothing at all (C-03).

    `dedup_key` is passed on the same request, so the `bot_post` row is written inside the
    note's own transaction (R-15). There is no second call for a run to die between.
    """
    body: Dict[str, Any] = {
        "text": text,
        "is_public": True,
        "dedup_key": dedup_key,
    }
    if quote is not None:
        body["quote"] = quote
    if image_url is not None:
        body["image_url"] = image_url

    resp = _request(
        "POST", api_base() + "/notes/", headers=_auth_header(token), json_body=body
    )
    status = resp.status_code
    if status == 409:
        # The key was taken between the GET and the POST — a re-dispatch, a retried
        # workflow, or two runs racing. The server created no note. Fail; never retry.
        raise BotError("duplicate dedup_key", status)
    if status == 429:
        # The server cap (R-13). Never retry into it.
        raise BotError("bot post cap reached", status)
    if status != 201:
        raise BotError("POST /notes/ failed", status)

    note_id = (resp.json() or {}).get("id")
    log("posted status", status, "note", note_id, "key", dedup_key)
    return note_id


# ── Pools ────────────────────────────────────────────────────────────────────

_CONTENT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "content")


def load_pool(filename: str) -> List[Dict[str, Any]]:
    """Read a checked-in content pool. JSON on disk is the only source (R-10, E-6)."""
    import json

    with open(os.path.join(_CONTENT_DIR, filename), "r", encoding="utf-8") as fh:
        return json.load(fh)


def first_unused(pool: Iterable[Dict[str, Any]], prefix: str, used: Iterable[str]):
    """The first pool entry whose `<prefix>:<id>` key is not in `used`, or None."""
    taken = set(used)
    for entry in pool:
        if "{}:{}".format(prefix, entry["id"]) not in taken:
            return entry
    return None


def run_guarded(fn) -> int:
    """Wrap a voice's body: BotError is a loud, non-retrying failure."""
    try:
        fn()
    except BotError as exc:
        log("FAILED:", exc, "status", exc.status)
        return 1
    return 0


def main_for(fn) -> None:
    sys.exit(run_guarded(fn))
