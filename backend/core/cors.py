"""
CORS origin validation extracted from main.py.

The origin-checking logic was duplicated in PreflightCORSMiddleware._origin_allowed
and the add_security_headers middleware. This module provides a single source of
truth for determining whether an origin is allowed.
"""

from __future__ import annotations

import re

from backend.core.config import settings

_CORS_LOCALHOST_RE = re.compile(
    r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", re.IGNORECASE
)


def is_origin_allowed(origin: str | None) -> bool:
    """Return True if the given origin is in the allowed CORS list.

    Checks:
      1. Localhost / 127.0.0.1 with any port
      2. Exact match in settings.CORS_ORIGINS
      3. www / non-www variants of ziposystem.co.il
    """
    if not origin or not origin.strip():
        return False

    normalized = origin.strip().rstrip("/")

    if _CORS_LOCALHOST_RE.match(normalized):
        return True

    if normalized in settings.CORS_ORIGINS:
        return True

    # Check www / non-www variants
    with_www = normalized.replace(
        "https://ziposystem.co.il", "https://www.ziposystem.co.il"
    )
    without_www = normalized.replace(
        "https://www.ziposystem.co.il", "https://ziposystem.co.il"
    )

    if with_www in settings.CORS_ORIGINS or without_www in settings.CORS_ORIGINS:
        return True

    return False
