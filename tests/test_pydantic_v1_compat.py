"""F-49 class guard: production runs Pydantic 1.10 / FastAPI 0.95, and a Pydantic v2 API call
(`.model_dump()`, `.model_validate()`, `__fields_set__`'s v2 cousin, `model_config`, or
`field_validator`) silently raises `AttributeError` -> 500 with no test ever exercising it,
exactly how F-49 (`PATCH /notifications/prefs`) shipped broken. This scans every app/**/*.py
file for those v2-only names so the next one is caught before it ships."""
import os
import re

import pydantic

FORBIDDEN_PATTERNS = (
    re.compile(r"model_dump\("),
    re.compile(r"model_validate\("),
    re.compile(r"model_fields_set"),
    re.compile(r"model_config"),
    re.compile(r"field_validator"),
)

_APP_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")


def _app_files():
    for dirpath, _dirnames, filenames in os.walk(_APP_ROOT):
        for fname in filenames:
            if fname.endswith(".py"):
                yield os.path.join(dirpath, fname)


def test_no_pydantic_v2_api_in_app():
    hits = []
    for path in _app_files():
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            lines = fh.readlines()
        for lineno, line in enumerate(lines, start=1):
            for pattern in FORBIDDEN_PATTERNS:
                if pattern.search(line):
                    hits.append(f"{path}:{lineno}: {line.strip()}")
    assert hits == [], "Pydantic v2-only API found in the v1 stack:\n" + "\n".join(hits)


def test_installed_pydantic_is_v1():
    # The system Python has Pydantic 2.11; this must be run from the project .venv, which
    # pins fastapi==0.95.2 -> pydantic<2, matching production.
    assert pydantic.VERSION.startswith("1."), (
        f"Expected Pydantic 1.x (production is pinned to fastapi==0.95.2, which requires "
        f"pydantic<2); got {pydantic.VERSION}. Run tests from the project .venv."
    )
