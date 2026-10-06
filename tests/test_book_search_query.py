"""The Google Books query builder (`_build_query`).

Why this file exists
====================
`_build_query` had **no test at all**, and it shipped a defect that made book search return
nothing: it joined the subject qualifier with a literal "+", which the HTTP client percent-
encodes to %2B inside the parameter value, so Google received a plus character rather than a
separator and matched zero volumes.

Measured against the live Google Books API on 2026-10-06:

    "the midnight library"                  -> 3056 results
    "the midnight library+subject:fiction"  ->    0 results   (what we were sending)
    "the midnight library subject:fiction"  ->  301 results

What these tests do and do not establish
----------------------------------------
They pin the SHAPE of the string we hand to Google. They cannot prove Google likes it — no
test here makes a network call. The live-API numbers above are the evidence for the shape, and
re-measuring them is a production check, not a unit test.
"""
import pytest

from app.routers.googlebooks_router import GENRE_SUBJECTS, _build_query


class TestSeparator:
    """The defect that broke search: a literal '+' inside the query value."""

    def test_no_literal_plus_is_ever_emitted(self):
        # Every genre chip, plus the no-chip case. A '+' here is percent-encoded by httpx and
        # Google then matches nothing, which is exactly how search died.
        built = [_build_query("the midnight library", g) for g in list(GENRE_SUBJECTS) + [None, "all"]]
        assert len(built) == len(GENRE_SUBJECTS) + 2, "the sweep must cover every genre plus the two no-chip cases"
        offenders = [b for b in built if "+" in b]
        assert offenders == [], f"a literal '+' reaches Google as %2B and matches nothing: {offenders[:3]}"

    def test_genre_chip_uses_a_space_before_the_qualifier(self):
        assert "fiction" in GENRE_SUBJECTS, "control: the fixture genre must exist, or this asserts nothing"
        q = _build_query("the midnight library", "fiction")
        assert q == f"the midnight library subject:{GENRE_SUBJECTS['fiction']}"


class TestDefaultBias:
    """No genre chip means no qualifier: the fiction bias returned the wrong non-fiction book."""

    @pytest.mark.parametrize("genre", [None, "", "all"])
    def test_no_chip_sends_the_readers_words_unqualified(self, genre):
        assert _build_query("end times fascism", genre) == "end times fascism"

    def test_a_chip_still_filters(self):
        # Dropping the DEFAULT bias must not drop the chip — that is a feature, not the bug.
        q = _build_query("end times fascism", "fiction")
        assert q.endswith(f"subject:{GENRE_SUBJECTS['fiction']}")
        assert q.startswith("end times fascism ")


class TestExistingRulesStillHold:
    """Rules 1 and 2 predate the defect and must survive the fix."""

    def test_isbn_shortcut_is_untouched(self):
        assert _build_query("9780441172719", None) == "isbn:9780441172719"
        assert _build_query("9780441172719", "fiction") == "isbn:9780441172719"

    @pytest.mark.parametrize("typed", [
        "inauthor:herbert", "intitle:dune", "subject:history",
        "isbn:9780441172719", "inpublisher:penguin",
    ])
    def test_a_qualifier_the_reader_typed_is_respected_as_is(self, typed):
        assert _build_query(typed, "fiction") == typed

    def test_whitespace_is_trimmed(self):
        assert _build_query("  dune  ", None) == "dune"
