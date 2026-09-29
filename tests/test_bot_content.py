"""Sprint 4F, package P5 — the bot package and its CI (tests.md C-01..C-23b).

Amended 2026-09-29 (package P6, branch `fix/bot-post-parity`): C-01, C-02 and C-02a are
DELETED — they asserted R-05a's in-text label, which the PM withdrew. C-01b asserts the
absence instead, and C-23/C-23a/C-23b cover R-17's linked book.

No network. Every NYT / Gemini / API call is a monkeypatched double, and the one seam they
all go through is `bots.common._request`, so a call this file has not doubled raises rather
than reaching the internet.

K-07 (non-vacuity): the imports below and the `callable` assertion at module scope are the
red-first guard. Before `bots/` existed, collecting this file was a **collection error**,
never `0 passed`.
"""
import ast
import json
import math
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta

import pytest
import yaml

from bots import bestsellers, circles, common, prompts, quotes

assert callable(common.post_note)
assert callable(common.add_to_library)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOTS_DIR = os.path.join(REPO_ROOT, "bots")
WORKFLOW_DIR = os.path.join(REPO_ROOT, ".github", "workflows")
BOT_WORKFLOW = os.path.join(WORKFLOW_DIR, "tmr-bots.yml")

API = "https://api.trackmyread.com"

SECRET_SENTINEL = "SEKRIT-SECRET"
TOKEN_SENTINEL = "SEKRIT-TOKEN"
BODY_SENTINEL = "SEKRIT-BODY"


# ── Doubles ──────────────────────────────────────────────────────────────────


class FakeResponse:
    def __init__(self, status_code, payload=None, url=""):
        self.status_code = status_code
        self._payload = payload
        # Every response carries the body sentinel, so C-12 fails the moment any code path
        # prints a response body.
        self.text = BODY_SENTINEL + " " + json.dumps(payload if payload is not None else {})
        self.url = url

    def json(self):
        return self._payload


class FakeApi:
    """One callable standing in for `bots.common._request`."""

    def __init__(
        self,
        *,
        posted=None,
        note_status=201,
        discover=None,
        nyt_books=None,
        nyt_error=None,
        library_status=201,
    ):
        # dedup_key -> naive-UTC instant it was used
        self.posted = dict(posted or {})
        self.note_status = note_status
        self.discover = [] if discover is None else discover
        self.nyt_books = [] if nyt_books is None else nyt_books
        self.nyt_error = nyt_error
        self.calls = []
        self.note_bodies = []
        self.posted_since = {}
        # POST /books/add-to-library — the reader path the bestseller voice reuses.
        self.library_status = library_status
        self.library_bodies = []

    def __call__(self, method, url, *, headers=None, params=None, json_body=None, timeout=None):
        self.calls.append((method, url))
        params = params or {}

        if url.endswith("/auth/bot-login"):
            assert json_body["secret"] == SECRET_SENTINEL
            return FakeResponse(200, {"access_token": TOKEN_SENTINEL})

        if url.endswith("/bots/posted"):
            content_type = params["content_type"]
            since = params.get("since")
            self.posted_since[content_type] = since
            cutoff = datetime.fromisoformat(since) if since else None
            keys = [
                key
                for key, used_at in self.posted.items()
                if key.split(":", 1)[0] == content_type
                and (cutoff is None or used_at >= cutoff)
            ]
            return FakeResponse(200, {"dedup_keys": sorted(keys)})

        if method == "POST" and url.endswith("/books/add-to-library"):
            self.library_bodies.append(json_body)
            if self.library_status in (200, 201):
                return FakeResponse(
                    self.library_status, {"id": 700 + len(self.library_bodies)}
                )
            return FakeResponse(self.library_status, {"detail": "refused"})

        if method == "POST" and url.endswith("/notes/"):
            self.note_bodies.append(json_body)
            if self.note_status == 201:
                return FakeResponse(201, {"id": 900 + len(self.note_bodies)})
            return FakeResponse(self.note_status, {"detail": "refused"})

        if "/groups/discover" in url:
            return FakeResponse(200, self.discover)

        if "api.nytimes.com" in url:
            if self.nyt_error is not None:
                raise self.nyt_error
            return FakeResponse(200, {"results": {"books": self.nyt_books}})

        if "covers.openlibrary.org" in url:
            return FakeResponse(404, {}, url=url)

        if "googleapis.com" in url:
            return FakeResponse(200, {"items": []})

        raise AssertionError("undoubled call escaped the test: %s %s" % (method, url))

    # Convenience
    def keys_posted(self):
        return [b["dedup_key"] for b in self.note_bodies]


def install(monkeypatch, fake, teaser="A tense, funny, very short teaser."):
    monkeypatch.setattr(common, "_request", fake)
    monkeypatch.setenv("BOT_LOGIN_SECRET", SECRET_SENTINEL)
    monkeypatch.setenv("NYT_API_KEY", "nyt-key")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-key")

    calls = {"n": 0}

    def _teaser(book):
        calls["n"] += 1
        if isinstance(teaser, Exception):
            raise teaser
        return teaser

    monkeypatch.setattr(bestsellers, "generate_teaser", _teaser)
    fake.teaser_calls = calls
    return fake


def nyt_book(isbn, title="A Book", rank=1, description="A first sentence. A second one."):
    return {
        "primary_isbn13": isbn,
        "title": title,
        "author": "An Author",
        "rank": rank,
        "weeks_on_list": 4,
        "description": description,
        "book_image": "http://example.com/%s.jpg" % isbn,
    }


def circle(name="Public Circle", members=2, title="Tomorrow and Tomorrow", private=False):
    return {
        "id": abs(hash(name)) % 1000,
        "name": name,
        "is_private": private,
        "member_count": members,
        "current_book": {"id": 1, "title": title, "author": "An Author"},
    }


ABOVE_FLOOR = [circle("Circle A", 2), circle("Circle B", 1)]


def run_all_four(monkeypatch, fake=None):
    """Run every content type once against one double; return it."""
    fake = fake or FakeApi(nyt_books=[nyt_book("9780000000001")], discover=ABOVE_FLOOR)
    install(monkeypatch, fake)
    for run in (bestsellers.run, prompts.run, quotes.run, circles.run):
        run()
    return fake


# ── 6.1 The in-text label — R-05a, WITHDRAWN by PM decision 2026-09-29 ───────
#
# R-05a required every bot post to end with `— automated post from @<handle>`. The PM
# withdrew it on 2026-09-29 after seeing the first live post; the line was stripped from
# that post by hand and removed from the code here.
#
# C-01 (the exact E-2 string), C-02 (appended after generation) and C-02a (never model
# generated) asserted the withdrawn requirement and are GONE — see build-notes-4f-p6.md.
# What replaces them is C-01b below, which asserts the absence, because the requirement was
# withdrawn deliberately and a later reader re-adding "just a small disclaimer line" would
# be reversing a PM decision rather than fixing an oversight.


class TestNoInTextLabel:
    def test_no_post_carries_an_automated_post_line(self, monkeypatch):
        """C-01b (MUT-4F-100) — R-05a is withdrawn: no voice appends anything to its own text."""
        fake = run_all_four(monkeypatch)
        assert len(fake.note_bodies) == 4, fake.keys_posted()

        for body in fake.note_bodies:
            text = body["text"]
            # Control: the post says something, so this is not passing on empty strings.
            assert text.strip(), body["dedup_key"]
            lowered = text.lower()
            assert "automated post from" not in lowered, body["dedup_key"]
            assert "automated account" not in lowered, body["dedup_key"]
            # No trailing handle line of any dash flavour.
            for dash in ("—", "–", "-"):
                assert not text.rstrip().endswith(dash + " @TMRBot"), body["dedup_key"]

        # ...and the plumbing that used to build it is gone from the package, so no voice
        # can pick it up again by importing it.
        for name in ("append_label", "label_line", "LABEL_TEMPLATE", "LABEL_PREFIX"):
            assert not hasattr(common, name), name
        blob = "".join(_read(p) for p in _bots_sources())
        assert "automated post from" not in blob.lower()


def _read(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def _bots_sources():
    files = []
    for dirpath, _dirnames, filenames in os.walk(BOTS_DIR):
        for name in sorted(filenames):
            if name.endswith(".py"):
                files.append(os.path.join(dirpath, name))
    return files


# ── 6.2 Posting through the API — R-07 ───────────────────────────────────────


class TestPosting:
    def test_is_public_true_in_every_body(self, monkeypatch):
        """C-03 — F-17's default makes an omitted key PRIVATE."""
        fake = run_all_four(monkeypatch)
        assert len(fake.note_bodies) == 4
        for body in fake.note_bodies:
            assert body.get("is_public") is True, body.get("dedup_key")

    def test_dedup_key_shape_for_every_type(self, monkeypatch):
        """C-04."""
        fake = run_all_four(monkeypatch)
        assert len(fake.note_bodies) == 4
        pattern = re.compile(r"^(bestseller|prompt|quote|circles):.+$")
        prefixes = []
        for body in fake.note_bodies:
            key = body.get("dedup_key")
            assert key is not None, body
            assert pattern.match(key), key
            prefixes.append(key.split(":", 1)[0])
        # Each voice used its own prefix: a quote must never be filed under `prompt:`.
        assert sorted(prefixes) == ["bestseller", "circles", "prompt", "quote"]

    def test_bots_package_has_no_database_access(self):
        """C-04a — (a) by AST, (b) by a real import in a poisoned subprocess."""
        sources = _bots_sources()
        assert len(sources) >= 6, sources  # control: the walker actually found the package

        assert _db_violations_in_package() == []

        # Control (rule 3): the detector fires on a synthetic driver import.
        synthetic = ast.parse("from sqlalchemy import create_engine\nx = create_engine(os.getenv('DATABASE_URL'))")
        assert _db_violations(synthetic, "synthetic.py") != []

        script = (
            "import sys; sys.modules['sqlalchemy'] = None; "
            "import bots.bestsellers, bots.prompts, bots.quotes, bots.circles, bots.common"
        )
        ok = subprocess.run(
            [sys.executable, "-c", script], cwd=REPO_ROOT, capture_output=True
        )
        assert ok.returncode == 0, ok.stderr.decode("utf-8", "replace")[-800:]

        # Control (b): the same subprocess with an app module appended must fail, so the
        # poisoning is proved to work.
        bad = subprocess.run(
            [sys.executable, "-c", script + "; import app.crud"],
            cwd=REPO_ROOT,
            capture_output=True,
        )
        assert bad.returncode != 0

    def test_429_and_409_fail_the_run_without_retry(self, monkeypatch):
        """C-05."""
        for status in (429, 409):
            fake = FakeApi(note_status=status)
            install(monkeypatch, fake)
            assert common.run_guarded(prompts.run) == 1, status
            assert len(fake.note_bodies) == 1, (status, fake.note_bodies)

    def test_candidates_filtered_before_the_model_call(self, monkeypatch):
        """C-05a — one model call, not one per skipped book."""
        books = [nyt_book("978000000%04d" % n, rank=n) for n in range(1, 16)]
        survivor = books[-1]["primary_isbn13"]
        used = {
            "bestseller:" + b["primary_isbn13"]: datetime(2020, 1, 1)
            for b in books
            if b["primary_isbn13"] != survivor
        }
        fake = FakeApi(posted=used, nyt_books=books)
        install(monkeypatch, fake)
        bestsellers.run()
        assert fake.teaser_calls["n"] == 1, fake.teaser_calls
        assert fake.keys_posted() == ["bestseller:" + survivor]

    def test_nothing_secret_is_logged(self, monkeypatch, capsys):
        """C-12."""
        fake = run_all_four(monkeypatch)
        captured = capsys.readouterr()
        blob = captured.out + captured.err

        # Control: output was captured at all, and it carries the operational facts.
        assert "posted status 201" in blob
        assert "note 90" in blob

        for sentinel in (SECRET_SENTINEL, TOKEN_SENTINEL, BODY_SENTINEL):
            assert sentinel not in blob, sentinel
        assert "Authorization" not in blob
        assert "Bearer" not in blob

        # Synthetic positive (rule 3 / architecture Security review 6): the detector finds
        # a leak when there is one.
        leaky = "status 500 " + FakeResponse(500, {"detail": "x"}).text
        assert _leak_hits(leaky) == [BODY_SENTINEL]
        assert _leak_hits(blob) == []
        assert len(fake.note_bodies) == 4


def _leak_hits(text):
    return [s for s in (SECRET_SENTINEL, TOKEN_SENTINEL, BODY_SENTINEL) if s in text]


FORBIDDEN_MODULES = {
    "sqlalchemy",
    "sqlmodel",
    "psycopg2",
    "psycopg",
    "asyncpg",
    "app.database",
    "app.models",
    "app.crud",
}
CONNECTION_ENV_NAME = "DATABASE" + "_URL"


def _db_violations(tree, path):
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if alias.name in FORBIDDEN_MODULES or root in FORBIDDEN_MODULES:
                    out.append("%s: %s" % (path, alias.name))
        elif isinstance(node, ast.ImportFrom):
            name = node.module or ""
            root = name.split(".")[0]
            if name in FORBIDDEN_MODULES or root in FORBIDDEN_MODULES:
                out.append("%s: %s" % (path, name))
        elif isinstance(node, ast.Name) and node.id == "create_engine":
            out.append("%s: create_engine" % path)
        elif isinstance(node, ast.Constant) and node.value == CONNECTION_ENV_NAME:
            out.append("%s: %s" % (path, CONNECTION_ENV_NAME))
    return out


def _db_violations_in_package():
    out = []
    for path in _bots_sources():
        out.extend(_db_violations(ast.parse(_read(path)), os.path.relpath(path, REPO_ROOT)))
    return out


# ── 6.3 Content — R-09..R-12, R-15 ───────────────────────────────────────────


class TestBestsellers:
    def test_gemini_failure_falls_back_to_the_description(self, monkeypatch):
        """C-06."""
        book = nyt_book(
            "9780000000003",
            description="A quiet novel about a long winter. It goes on for some time.",
        )
        fake = FakeApi(nyt_books=[book])
        install(monkeypatch, fake, teaser=RuntimeError("gemini is down"))
        assert common.run_guarded(bestsellers.run) == 0
        assert len(fake.note_bodies) == 1
        text = fake.note_bodies[0]["text"]
        assert "A quiet novel about a long winter." in text
        assert "It goes on for some time" not in text  # the FIRST sentence only
        teaser_line = "A quiet novel about a long winter."
        assert len(teaser_line.split()) <= bestsellers.MAX_TEASER_WORDS
        # R-05a withdrawn 2026-09-29: the post now ENDS on the teaser, with nothing after
        # it. This was `assert text.endswith("<the R-05a line>")`.
        assert text.rstrip().endswith(teaser_line), repr(text[-60:])

    def test_nyt_failure_posts_nothing_and_exits_zero(self, monkeypatch):
        """C-07 — a skipped day, not a fabricated one."""
        fake = FakeApi(nyt_error=RuntimeError("NYT 503"))
        install(monkeypatch, fake)
        assert common.run_guarded(bestsellers.run) == 0
        assert fake.note_bodies == []

    def test_legacy_editorial_post_isbn_is_not_reposted(self, monkeypatch):
        """C-09 — the server's answer is `editorial_post` UNION `bot_post` (B-29)."""
        legacy = "9780000000009"
        books = [nyt_book(legacy, title="Already Posted", rank=1),
                 nyt_book("9780000000010", title="Fresh", rank=2)]
        fake = FakeApi(posted={"bestseller:" + legacy: datetime(2019, 5, 1)}, nyt_books=books)
        install(monkeypatch, fake)
        bestsellers.run()
        assert fake.keys_posted() == ["bestseller:9780000000010"]
        assert "bestseller:" + legacy not in fake.keys_posted()


# ── 6.3a The linked book — PM change 2 of 2026-09-29 ─────────────────────────
#
# The feed's `book` object comes from `note.userbook -> book` and from nothing else, so a
# post with no `userbook_id` renders with no cover and no title — which is what made the
# first live bot post read as a different kind of object in the feed. The bestseller voice
# now takes the reader's own `POST /books/add-to-library` path and passes the `userbook_id`
# it gets back. The other three voices have no book and pass none.


class TestLinkedBook:
    def test_bestseller_links_the_book_and_drops_the_loose_image(self, monkeypatch):
        """C-23 (MUT-4F-101) — the post carries the userbook the library call created."""
        book = nyt_book("9780000000021", title="The Linked One")
        fake = FakeApi(nyt_books=[book])
        install(monkeypatch, fake)
        bestsellers.run()

        # The library call happened, with the real book's real values — an assertion that
        # only says "a call happened" would pass on an empty payload.
        assert len(fake.library_bodies) == 1, fake.library_bodies
        sent = fake.library_bodies[0]
        assert sent["title"] == "The Linked One"
        assert sent["author"] == "An Author"
        assert sent["isbn"] == "9780000000021"
        assert sent["cover_url"] == "https://example.com/9780000000021.jpg"
        assert sent["status"] == "to-read", (
            "a 'reading' or rated 'finished' row would put the bot into "
            "GET /userbooks/friends/currently-reading and into recommendations"
        )

        # ...and the note carries THAT userbook id, not a truthy placeholder.
        assert len(fake.note_bodies) == 1
        posted = fake.note_bodies[0]
        assert posted["userbook_id"] == 701, posted
        # The cover is the book's now, so it is not also attached to the post.
        assert "image_url" not in posted, posted

    def test_a_failed_link_still_posts_with_the_cover_attached(self, monkeypatch):
        """C-23a (MUT-4F-102) — a book that will not link is not a reason to lose the post."""
        book = nyt_book("9780000000022", title="The Unlinkable")
        fake = FakeApi(nyt_books=[book], library_status=400)   # "already in your library"
        install(monkeypatch, fake)
        assert common.run_guarded(bestsellers.run) == 0

        assert len(fake.note_bodies) == 1, fake.note_bodies
        posted = fake.note_bodies[0]
        assert "userbook_id" not in posted, posted
        assert posted["image_url"] == "https://example.com/9780000000022.jpg", posted
        assert "The Unlinkable" in posted["text"]

    def test_the_other_three_voices_link_nothing(self, monkeypatch):
        """C-23b (MUT-4F-103) — a prompt, a quote and a roundup have no book, and none is invented."""
        fake = FakeApi(discover=ABOVE_FLOOR)
        install(monkeypatch, fake)
        for run in (prompts.run, quotes.run, circles.run):
            run()

        assert fake.library_bodies == [], fake.library_bodies
        assert len(fake.note_bodies) == 3, fake.keys_posted()
        for posted in fake.note_bodies:
            assert "userbook_id" not in posted, posted["dedup_key"]
        # Control: the roundup DID name a book in its text — so "no linked book" is a
        # decision about the card, not an artefact of there being nothing to link.
        roundup = [b for b in fake.note_bodies if b["dedup_key"].startswith("circles:")]
        assert len(roundup) == 1 and "Tomorrow and Tomorrow" in roundup[0]["text"]


class TestDedupWindows:
    def test_prompt_60_days_quote_180_days(self, monkeypatch):
        """C-08 — the window the bot asks for is what excludes the older key."""
        now = datetime.utcnow()
        fake = FakeApi(
            posted={
                "prompt:1": now - timedelta(days=30),
                "prompt:2": now - timedelta(days=61),
                "quote:1": now - timedelta(days=179),
                "quote:2": now - timedelta(days=181),
            }
        )
        install(monkeypatch, fake)
        prompts.run()
        quotes.run()

        # 30 days ago is inside the 60-day window, so prompt 1 is excluded; 61 days ago is
        # outside it, so prompt 2 comes back into play and is the one chosen.
        assert fake.keys_posted() == ["prompt:2", "quote:2"]

        for content_type, days in (("prompt", 60), ("quote", 180)):
            sent = datetime.fromisoformat(fake.posted_since[content_type])
            assert abs((now - timedelta(days=days)) - sent) < timedelta(minutes=5), (
                content_type,
                sent,
            )


class TestCircles:
    def test_roundup_names_nobody(self, monkeypatch):
        """C-10."""
        rows = [
            {
                "id": 1,
                "name": "Delhi Readers",
                "is_private": False,
                "member_count": 2,
                "creator_name": "Priya",
                "current_book": {"id": 1, "title": "Tomorrow and Tomorrow"},
                "members": [{"name": "Priya", "username": "priya_r"}],
            },
            {
                "id": 2,
                "name": "Night Shift",
                "is_private": False,
                "member_count": 1,
                "creator_name": "Arjun",
                "current_book": {"id": 1, "title": "Tomorrow and Tomorrow"},
            },
            {
                "id": 3,
                "name": "The Secret Book Club",
                "is_private": True,
                "member_count": 40,
                "creator_name": "Meera",
                "current_book": {"id": 9, "title": "A Private Choice"},
            },
        ]
        fake = FakeApi(discover=rows)
        install(monkeypatch, fake)
        circles.run()
        text = fake.note_bodies[0]["text"]

        # Control: it says something, and it says the public title.
        assert text.strip()
        assert "Tomorrow and Tomorrow" in text

        for forbidden in ("Priya", "priya_r", "Arjun", "Meera", "The Secret Book Club",
                          "A Private Choice", "Delhi Readers", "Night Shift"):
            assert forbidden not in text, forbidden

    def test_below_the_floor_posts_a_prompt_not_a_roundup(self, monkeypatch):
        """C-11 — E-3: not softened, not reworded. A prompt instead."""
        cases = [
            # (rows, expect_roundup)
            ([circle("A", 1), circle("B", 1)], False),   # 2 readers / 2 circles
            ([circle("A", 3)], False),                    # 3 readers / 1 circle
            ([circle("A", 2), circle("B", 1)], True),     # 3 readers / 2 circles
        ]
        for rows, expect_roundup in cases:
            fake = FakeApi(discover=rows)
            install(monkeypatch, fake)
            circles.run()
            assert len(fake.note_bodies) == 1, rows
            body = fake.note_bodies[0]
            key, text = body["dedup_key"], body["text"]
            # R-05a withdrawn 2026-09-29: these two branches were told apart by the trailing
            # handle line. With no label, the body itself has to carry the difference, which
            # is a stronger assertion than the one it replaces — a roundup mislabelled as a
            # prompt used to be caught by the handle and is now caught by the content.
            if expect_roundup:
                assert key.startswith("circles:"), key
                assert "circles are active" in text, text
                assert "Literary Circles" in text, text
            else:
                assert key.startswith("prompt:"), key
                assert "circles are active" not in text
                assert "Literary Circles" not in text

    def test_fallback_prompt_obeys_the_same_60_day_window(self, monkeypatch):
        """C-11a — E-3: the fallback is subject to R-10's window too."""
        fake = FakeApi(
            discover=[circle("A", 1)],
            posted={"prompt:1": datetime.utcnow() - timedelta(days=5)},
        )
        install(monkeypatch, fake)
        circles.run()
        assert fake.keys_posted() == ["prompt:2"]
        assert fake.posted_since["prompt"] is not None


# ── The pools ────────────────────────────────────────────────────────────────


def _bot_workflow():
    return yaml.safe_load(_read(BOT_WORKFLOW))


def _on_block(doc):
    # PyYAML resolves the bare key `on` to the boolean True (YAML 1.1).
    return doc.get("on", doc.get(True))


def _day_to_type():
    """The workflow's own day -> content-type map, read out of its `case` block."""
    doc = _bot_workflow()
    steps = doc["jobs"]["post"]["steps"]
    script = "".join(s.get("run", "") for s in steps if s.get("id") == "pick")
    mapping = {}
    for day, content_type in re.findall(r"^\s*([0-7])\)\s*TYPE=(\w+)\s*;;", script, re.M):
        mapping[int(day)] = content_type
    return mapping


def _slots_per_week(content_types):
    """How many scheduled runs a week can end up posting one of `content_types`.

    Derived, never typed: the crons come from the workflow's schedule and the day -> type
    map comes from the same file's dispatch block.
    """
    day_map = _day_to_type()
    crons = _on_block(_bot_workflow())["schedule"]
    slots = 0
    for entry in crons:
        dow = entry["cron"].split()[4]
        # cron dow: 0 and 7 are both Sunday; `date -u +%u` calls Sunday 7.
        day = 7 if dow in ("0", "7") else int(dow)
        if day_map.get(day) in content_types:
            slots += 1
    return slots


class TestPools:
    def test_prompt_pool_is_sufficient_for_the_worst_case(self):
        """C-13 (K-13) — nothing in this assertion is a literal."""
        # Thursday counts because the circle roundup falls through to a prompt (E-3).
        slots_per_week = _slots_per_week({"prompt", "circles"})
        window_days = prompts.NO_REPEAT_DAYS
        required = math.ceil(window_days / 7) * slots_per_week + 1
        pool = prompts.load_prompts()
        assert len(pool) >= required, (
            "the prompt pool holds %d; a %d-day no-repeat window across %d slots a week "
            "needs at least %d" % (len(pool), window_days, slots_per_week, required)
        )

    def test_window_and_slot_count_are_what_the_pm_decided(self):
        """C-13a — stops C-13 being satisfied by shrinking the window instead."""
        assert prompts.NO_REPEAT_DAYS == 60
        assert quotes.NO_REPEAT_DAYS == 180
        assert _slots_per_week({"prompt", "circles"}) == 3

    def test_prompt_pool_meets_the_pm_floor(self):
        """C-13b — the PM's stated floor, visible in the test."""
        assert len(prompts.load_prompts()) >= 40

    def test_pool_ids_are_unique_and_stable(self):
        """C-14 — a duplicate id makes the no-repeat window a lie."""
        for pool in (prompts.load_prompts(), quotes.load_quotes()):
            ids = [entry["id"] for entry in pool]
            assert all(isinstance(i, (int, str)) for i in ids)
            assert len(set(ids)) == len(ids)
            texts = [entry["text"] for entry in pool]
            assert len(set(texts)) == len(texts)

    def test_quotes_are_public_domain_by_data(self):
        """C-15 (E-6) — the only thing that can enforce this is the data."""
        pool = quotes.load_quotes()
        assert len(pool) >= 27, len(pool)
        for entry in pool:
            for field in ("author", "work", "year"):
                assert entry.get(field), entry["id"]
            assert isinstance(entry["year"], int), entry["id"]
            assert entry["year"] <= quotes.PUBLIC_DOMAIN_YEAR_CEILING, (
                entry["id"],
                entry["year"],
            )

    def test_prompts_ask_and_instruct(self):
        """C-16 (R-10) — and the file is the only source."""
        for entry in prompts.load_prompts():
            assert "?" in entry["text"], entry["id"]
            assert re.search(r"\bpost\b", entry["text"], re.I), entry["id"]

        tree = ast.parse(_read(os.path.join(BOTS_DIR, "prompts.py")))
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                name = getattr(node, "module", None) or ""
                names = [a.name for a in node.names] + [name]
                assert not any(n.startswith("google") for n in names), names
            if isinstance(node, ast.Call):
                func = node.func
                label = getattr(func, "attr", None) or getattr(func, "id", "")
                assert "generate" not in label, label


# ── 6.4 The workflow and its secrets — R-09, R-14 ────────────────────────────

R09_CRONS = [
    "30 13 * * 1",
    "30 13 * * 2",
    "30 13 * * 3",
    "30 13 * * 4",
    "30 13 * * 5",
    "30 05 * * 6",
    "30 05 * * 0",
]

ALLOWED_SECRETS = {
    "BOT_LOGIN_SECRET",
    "NYT_API_KEY",
    "GEMINI_API_KEY",
    "GITHUB_TOKEN",
    "EXPO_TOKEN",
}
BOT_WORKFLOW_SECRETS = {"BOT_LOGIN_SECRET", "NYT_API_KEY", "GEMINI_API_KEY"}


def _workflow_files():
    return [
        os.path.join(WORKFLOW_DIR, name)
        for name in sorted(os.listdir(WORKFLOW_DIR))
        if name.endswith((".yml", ".yaml"))
    ]


def _bot_steps():
    return _bot_workflow()["jobs"]["post"]["steps"]


def _step_index(predicate):
    for i, step in enumerate(_bot_steps()):
        if predicate(step):
            return i
    return -1


class TestWorkflow:
    def test_seven_crons_match_the_r09_table(self):
        """C-17."""
        schedule = _on_block(_bot_workflow())["schedule"]
        crons = [entry["cron"] for entry in schedule]
        assert len(crons) == 7, crons          # a duplicated cron must fail
        assert set(crons) == set(R09_CRONS), sorted(crons)
        assert "type" in _on_block(_bot_workflow())["workflow_dispatch"]["inputs"]

    def test_kill_switch_is_the_first_step(self):
        """C-18 — the headline proof of R-14."""
        steps = _bot_steps()
        first = steps[0]
        condition = str(first.get("if", ""))
        assert "vars.BOT_ENABLED" in condition, condition
        assert "!= 'true'" in condition, condition
        assert "exit 1" in first.get("run", ""), first.get("run")
        # And it says why, in the log, without a deploy.
        assert "BOT_ENABLED" in first.get("run", "")

        post_index = _step_index(lambda s: "python -m bots." in s.get("run", ""))
        assert post_index > 0, post_index
        assert _step_index(lambda s: "vars.BOT_ENABLED" in str(s.get("if", ""))) == 0

    def test_jitter_precedes_the_post(self):
        """C-19."""
        jitter = _step_index(lambda s: "RANDOM % 1500" in s.get("run", ""))
        post = _step_index(lambda s: "python -m bots." in s.get("run", ""))
        assert jitter >= 0, "no 0-25 minute jitter step"
        assert post >= 0
        assert jitter < post, (jitter, post)

    def test_only_three_secrets_and_never_a_database_url(self):
        """C-21 — see the build notes for why this is a *use* check, not a grep."""
        files = _workflow_files()
        assert len(files) >= 3, files  # control: the walker found the workflows

        all_refs = set()
        for path in files:
            all_refs |= set(re.findall(r"secrets\.([A-Za-z_][A-Za-z0-9_]*)", _read(path)))
        assert all_refs, "control: no secret reference found anywhere"
        assert all_refs <= ALLOWED_SECRETS, sorted(all_refs - ALLOWED_SECRETS)

        bot_refs = set(re.findall(r"secrets\.([A-Za-z_][A-Za-z0-9_]*)", _read(BOT_WORKFLOW)))
        assert bot_refs == BOT_WORKFLOW_SECRETS, sorted(bot_refs)

        hits = []
        for dirpath, _dirs, names in os.walk(os.path.join(REPO_ROOT, ".github")):
            for name in sorted(names):
                path = os.path.join(dirpath, name)
                hits.extend(_connection_uses(_read_text_or_empty(path),
                                             os.path.relpath(path, REPO_ROOT)))
        assert hits == [], hits

        # Control (rule 3): the detector fires on a synthetic injection.
        synthetic = "    env:\n      %s: ${{ secrets.%s }}\n" % (
            CONNECTION_ENV_NAME, CONNECTION_ENV_NAME
        )
        assert _connection_uses(synthetic, "synthetic.yml") != []

        # No env entry in the bot workflow points a *_URL at a database.
        bot_text = _read(BOT_WORKFLOW)
        assert not re.search(r"^\s*\w*_URL:\s*.*postgres", bot_text, re.M | re.I)

    def test_editorial_bot_is_still_present_and_unscheduled(self):
        """C-22 — deleted only after two successful production runs, not in this sprint."""
        assert os.path.exists(os.path.join(REPO_ROOT, "editorial_bot.py")) is True

        for path in _workflow_files():
            assert "editorial_bot" not in _read(path), path

        # No *executable* reference under app/. Comments explaining the removed route are
        # allowed; a call is not.
        offenders = []
        for dirpath, _dirs, names in os.walk(os.path.join(REPO_ROOT, "app")):
            for name in sorted(names):
                if not name.endswith(".py"):
                    continue
                path = os.path.join(dirpath, name)
                tree = ast.parse(_read(path))
                for node in ast.walk(tree):
                    if isinstance(node, ast.Constant) and isinstance(node.value, str):
                        if "editorial_bot" in node.value and not _is_docstring(tree, node):
                            offenders.append(os.path.relpath(path, REPO_ROOT))
                    if isinstance(node, (ast.Import, ast.ImportFrom)):
                        names_ = [a.name for a in node.names] + [
                            getattr(node, "module", None) or ""
                        ]
                        if any("editorial_bot" in n for n in names_):
                            offenders.append(os.path.relpath(path, REPO_ROOT))
        assert offenders == [], offenders


def _is_docstring(tree, node):
    for parent in ast.walk(tree):
        if isinstance(parent, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            body = getattr(parent, "body", [])
            if body and isinstance(body[0], ast.Expr) and body[0].value is node:
                return True
    return False


def _read_text_or_empty(path):
    try:
        return _read(path)
    except (UnicodeDecodeError, OSError):
        return ""


def _connection_uses(text, path):
    """A database connection string being *used*, as opposed to a comment forbidding one.

    Three shapes, all of them real uses: a secrets/vars reference, a YAML mapping key, and
    a shell assignment.
    """
    out = []
    name = re.escape(CONNECTION_ENV_NAME)
    patterns = (
        r"(?:secrets|vars|env)\.%s\b" % name,
        r"^\s*%s\s*:" % name,
        r"\b%s\s*=" % name,
    )
    for lineno, line in enumerate(text.splitlines(), start=1):
        for pattern in patterns:
            if re.search(pattern, line, re.I | re.M):
                out.append("%s:%d" % (path, lineno))
                break
    return out
