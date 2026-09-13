# app/routers/meta_router.py
"""Deployment metadata. No auth, no database — see architecture.md Security Review."""
import os

from fastapi import APIRouter

router = APIRouter(tags=["meta"])


@router.get("/version")
def get_version():
    """
    Which build is actually running. Render injects these three on every
    git-backed deploy; they are absent locally and in tests, where all three
    come back null.
    """
    return {
        "commit": os.getenv("RENDER_GIT_COMMIT"),
        "service": os.getenv("RENDER_SERVICE_NAME"),
        "branch": os.getenv("RENDER_GIT_BRANCH"),
    }
