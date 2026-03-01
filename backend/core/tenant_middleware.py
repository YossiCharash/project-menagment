"""
Starlette middleware that resolves the current tenant from the request.

Resolution order:
  1. ``X-Tenant-Slug`` header
  2. Subdomain of the ``Host`` header (e.g. ``acme.example.com`` -> ``acme``)

Results are cached in memory with a 60-second TTL to avoid hitting
the master database on every request.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional, Tuple

from fastapi.responses import JSONResponse
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from backend.db.master_session import AsyncMasterSessionLocal
from backend.models.tenant import Tenant

logger = logging.getLogger(__name__)

_SKIP_PATHS: Tuple[str, ...] = (
    "/api/v1/ceo",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
)

_LOCALHOST_HOSTS = frozenset({"localhost", "127.0.0.1"})

# slug -> (Tenant | None, timestamp)
_TENANT_CACHE_TTL_SECONDS = 60
_tenant_cache: Dict[str, Tuple[Optional[Any], float]] = {}


def _extract_slug(request: Request) -> Optional[str]:
    """Return a tenant slug from the request, or None."""
    # 1. Explicit header
    header_slug = request.headers.get("x-tenant-slug")
    if header_slug:
        return header_slug.strip().lower()

    # 2. Subdomain
    host = request.headers.get("host", "")
    hostname = host.split(":")[0]  # strip port

    if hostname in _LOCALHOST_HOSTS:
        return None

    parts = hostname.split(".")
    if len(parts) >= 3:
        # e.g. "acme.example.com" -> subdomain = "acme"
        return parts[0].lower()

    return None


async def _lookup_tenant(slug: str) -> Optional[Tenant]:
    """Check the in-memory cache, then fall back to a master-DB query."""
    now = time.monotonic()

    cached = _tenant_cache.get(slug)
    if cached is not None:
        tenant_obj, cached_at = cached
        if now - cached_at < _TENANT_CACHE_TTL_SECONDS:
            return tenant_obj

    # Cache miss or stale -- query master DB
    async with AsyncMasterSessionLocal() as session:
        stmt = select(Tenant).where(Tenant.slug == slug)
        result = await session.execute(stmt)
        tenant = result.scalar_one_or_none()

    _tenant_cache[slug] = (tenant, now)
    return tenant


class TenantMiddleware(BaseHTTPMiddleware):
    """Attach the active ``Tenant`` object to ``request.state.tenant``."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.scope.get("path", "")

        # Skip paths that do not require tenant context
        if any(path.startswith(prefix) for prefix in _SKIP_PATHS):
            return await call_next(request)

        slug = _extract_slug(request)
        if slug is None:
            logger.debug("No tenant slug resolved for %s — passing through without tenant context", path)
            return await call_next(request)

        tenant = await _lookup_tenant(slug)
        if tenant is None or tenant.status != "active":
            return JSONResponse(
                {"detail": "Tenant not found or inactive"}, status_code=404
            )

        request.state.tenant = tenant
        return await call_next(request)
