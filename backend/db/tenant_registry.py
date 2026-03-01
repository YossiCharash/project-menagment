"""
Dynamic tenant database connection pool registry (Singleton).

Maintains a cache of per-tenant SQLAlchemy async engines so that each
tenant database gets its own connection pool, created on first access
and reused thereafter.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator, Dict
from urllib.parse import urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from backend.core.config import settings

logger = logging.getLogger(__name__)


def _build_tenant_url(db_name: str) -> str:
    """Replace the database component of MASTER_DATABASE_URL with *db_name*."""
    parsed = urlparse(settings.MASTER_DATABASE_URL)
    # parsed.path is "/<database_name>"
    replaced = parsed._replace(path=f"/{db_name}")
    return urlunparse(replaced)


class TenantRegistry:
    """Thread-safe singleton that manages per-tenant async engines.

    Usage::

        registry = TenantRegistry.get_instance()
        async with registry.get_session("bms_tenant_acme") as session:
            ...
    """

    _instance: TenantRegistry | None = None
    _pools: Dict[str, AsyncEngine]

    def __init__(self) -> None:
        self._pools = {}

    @classmethod
    def get_instance(cls) -> TenantRegistry:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def get_engine(self, db_name: str) -> AsyncEngine:
        """Return (or lazily create) an async engine for *db_name*."""
        if db_name not in self._pools:
            url = _build_tenant_url(db_name)
            engine = create_async_engine(
                url,
                echo=False,
                future=True,
                pool_size=5,
                max_overflow=10,
                pool_pre_ping=True,
                pool_recycle=60,
            )
            self._pools[db_name] = engine
            logger.info("Created engine pool for tenant database: %s", db_name)
        return self._pools[db_name]

    @asynccontextmanager
    async def get_session(self, db_name: str) -> AsyncIterator[AsyncSession]:
        """Yield an AsyncSession bound to the tenant's database engine."""
        engine = await self.get_engine(db_name)
        session_factory = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
        async with session_factory() as session:
            yield session

    def evict(self, slug: str) -> None:
        """Remove a cached engine for the given slug (db_name key).

        Accepts either a slug or the full db_name.  The stored key is
        the db_name (``bms_tenant_<slug_underscored>``), so we try both.
        """
        db_name = f"bms_tenant_{slug.replace('-', '_')}"
        removed = self._pools.pop(db_name, None) or self._pools.pop(slug, None)
        if removed is not None:
            logger.info("Evicted engine pool for: %s", db_name)

    async def close_all(self) -> None:
        """Dispose of every cached engine -- call on application shutdown."""
        for db_name, engine in list(self._pools.items()):
            await engine.dispose()
            logger.info("Disposed engine pool for: %s", db_name)
        self._pools.clear()
