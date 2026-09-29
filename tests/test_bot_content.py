"""Sprint 4F, package P5 — the bot package and its CI (tests.md C-01..C-22).

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

assert callable(common.label_line)

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


# ── 6.1 The label — R-05a ────────────────────────────────────────────────────


class TestLabel:
    def test_every_post_ends_with_the_exact_e2_string(self, monkeypatch):
        """C-01."""
        # The form lives in exactly one constant, and it is this one (E-2).
        assert common.LABEL_TEMPLATE == "— automated post from @{handle}"

        fake = run_all_four(monkeypatch)
        assert len(fake.note_bodies) == 4, fake.keys_posted()

        expected_handles = {
            "bestseller": "TMRBot",
            "prompt": "TMRPrompts",
            "quote": "TMRQuotes",
            "circles": "TMRCircles",
        }
        seen = set()
        for body in fake.note_bodies:
            content_type = body["dedup_key"].split(":", 1)[0]
            seen.add(content_type)
            handle = expected_handles[content_type]
            text = body["text"]
            tail = "\n— automated post from @" + handle
            assert text.endswith(tail), (content_type, repr(text[-60:]))
            # em dash, not a hyphen and not an en dash
            assert "- automated post from @" not in text
            assert "– automated post from @" not in text
            # lower-case, no trailing punctuation, no trailing whitespace
            assert "Automated post from @" not in text
            assert text == text.rstrip()
            assert not text.endswith(".")
        assert seen == set(expected_handles), seen

    def test_line_is_appended_after_generation(self, monkeypatch):
        """C-02 — a model that returns nothing still yields a labelled post."""
        # The seam itself: nothing to label is still labelled. `append_label` is called
        # after every content source has had its say, so there is no path on which an
        # empty generation produces an unlabelled post.
        assert common.append_label("", "TMRBot").endswith(
            "\n— automated post from @TMRBot"
        )
        assert common.append_label("body", "TMRBot").startswith("body")

        for teaser in ("", "A teaser — with its own em dash — inside it."):
            fake = FakeApi(nyt_books=[nyt_book("9780000000002")])
            install(monkeypatch, fake, teaser=teaser)
            bestsellers.run()
            text = fake.note_bodies[-1]["text"]
            assert text.endswith("\n— automated post from @TMRBot"), repr(text[-60:])
            assert text.count(common.LABEL_PREFIX) == 1, repr(text)

    def test_line_is_never_model_generated(self):
        """C-02a — the label is a module-level literal, not built from model output."""
        source = _read(os.path.join(BOTS_DIR, "common.py"))
        tree = ast.parse(source)

        found = [
            node
            for node in tree.body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(t, ast.Name) and t.id == "LABEL_TEMPLATE" for t in node.targets
            )
            and isinstance(node.value, ast.Constant)
            and isinstance(node.value.value, str)
        ]
        assert len(found) == 1, "LABEL_TEMPLATE must be one module-level string literal"

        # Nothing anywhere in bots/ builds a LABEL* name from anything but that literal.
        assert _label_violations_in_package() == []

        # Control (rule 3): the detector fires on a synthetic model-built label.
        synthetic = ast.parse('LABEL_TEMPLATE = model.generate("write a disclaimer")')
        assert _label_violations(synthetic) == ["LABEL_TEMPLATE"]


def _read(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def _label_violations(tree):
    """Names containing LABEL assigned anything other than a string literal (or a slice of
    LABEL_TEMPLATE, which is how LABEL_PREFIX is kept from drifting)."""
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if not (isinstance(target, ast.Name) and "LABEL" in target.id):
                continue
            value = node.value
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                continue
            if (
                isinstance(value, ast.Subscript)
                and isinstance(value.value, ast.Name)
                and value.value.id == "LABEL_TEMPLATE"
            ):
                continue
            out.append(target.id)
    return out


def _bots_sources():
    files = []
    for dirpath, _dirnames, filenames in os.walk(BOTS_DIR):
        for name in sorted(filenames):
            if name.endswith(".py"):
                files.append(os.path.join(dirpath, name))
    return files


def _label_violations_in_package():
    out = []
    for path in _bots_sources():
        out.extend(_label_violations(ast.parse(_read(path))))
    return out


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
        assert text.endswith("\n— automated post from @TMRBot")

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
            if expect_roundup:
                assert key.startswith("circles:"), key
                assert text.endswith("\n— automated post from @TMRCircles")
            else:
                assert key.startswith("prompt:"), key
                assert text.endswith("\n— automated post from @TMRPrompts")
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
