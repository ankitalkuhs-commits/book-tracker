"""Forward this service's traffic to another base URL (F-68 region migration).

Render cannot move a service between regions, and it cannot move a service's `onrender.com`
address either, so the Oregon -> Singapore move means a second service on a new address. Readers
whose installed Android app has the old address compiled in keep calling the old one. With
`API_REDIRECT_BASE` set, the old service stops serving and forwards them instead.

- **307**, not 308: it preserves the method and body (a POST stays a POST) and is not cached
  permanently, so removing the variable restores normal service immediately.
- `/version` still answers locally, so the old service can be identified and health-checked.
- Unset (the normal case) this middleware does nothing at all.

Even with the extra hop, a forwarded reader is faster than before the move: the hop costs one
round trip (~0.3 s from India to Oregon), while the queries it saves cost ~0.2 s *each* and a page
makes 5-12 of them.
"""
import os
from urllib.parse import urlsplit

PASS_THROUGH = frozenset({"/version"})


class RedirectModeMiddleware:
    """Pure ASGI middleware, like the others in main.py."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        base = (os.getenv("API_REDIRECT_BASE") or "").strip().rstrip("/")
        if scope["type"] != "http" or not base or scope.get("path") in PASS_THROUGH:
            return await self.app(scope, receive, send)

        # Only ever forward to the configured host, never to anything a caller supplies.
        parts = urlsplit(base)
        if parts.scheme not in ("http", "https") or not parts.netloc:
            return await self.app(scope, receive, send)

        query = scope.get("query_string", b"").decode("latin-1")
        location = f"{base}{scope.get('path', '/')}" + (f"?{query}" if query else "")
        await send({
            "type": "http.response.start",
            "status": 307,
            "headers": [
                (b"location", location.encode("latin-1")),
                (b"content-length", b"0"),
                (b"cache-control", b"no-store"),
            ],
        })
        await send({"type": "http.response.body", "body": b""})
