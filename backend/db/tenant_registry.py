"""
TenantEngineRegistry — keeps one (AsyncEngine, async_sessionmaker) pair per tenant.

Lifecycle:
  - Startup: load_all_tenants() loads every active tenant from the master DB.
  - New tenant provisioned: register() adds a new engine on the fly.
  - Tenant suspended/deleted: unregister() disposes the engine and removes it.
"""
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

logger = logging.getLogger(__name__)


class TenantEngineRegistry:
    def __init__(self) -> None:
        self._engines: dict[int, tuple[AsyncEngine, async_sessionmaker]] = {}

    # ------------------------------------------------------------------
    # Startup loader
    # ------------------------------------------------------------------
    async def load_all_tenants(self, master_db: AsyncSession) -> None:
        """Load every *active* tenant from the master DB and register their engines."""
        from backend.master.models import Tenant
        from sqlalchemy import select

        try:
            result = await master_db.execute(
                select(Tenant).where(Tenant.status == "active")
            )
            tenants = result.scalars().all()
            for tenant in tenants:
                await self.register(tenant.id, tenant.db_url)
            logger.info("Loaded %d active tenant(s) into registry", len(tenants))
        except Exception as exc:
            # Table may not exist on first run — that's OK
            logger.warning(
                "Could not load tenants from master DB (table may not exist yet): %s", exc
            )

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------
    def get_session_maker(self, tenant_id: int) -> Optional[async_sessionmaker]:
        entry = self._engines.get(tenant_id)
        return entry[1] if entry else None

    def get_engine(self, tenant_id: int) -> Optional[AsyncEngine]:
        entry = self._engines.get(tenant_id)
        return entry[0] if entry else None

    # ------------------------------------------------------------------
    # Mutations
    # ------------------------------------------------------------------
    async def register(self, tenant_id: int, db_url: str) -> None:
        """Create and store an engine + session-maker for the given tenant."""
        if tenant_id in self._engines:
            return  # already registered
        try:
            eng = create_async_engine(
                db_url,
                echo=False,
                future=True,
                pool_size=5,
                max_overflow=10,
                pool_pre_ping=True,
                pool_recycle=60,
                pool_reset_on_return="commit",
            )
            session_maker = async_sessionmaker(
                bind=eng,
                class_=AsyncSession,
                expire_on_commit=False,
                autoflush=False,
                autocommit=False,
            )
            self._engines[tenant_id] = (eng, session_maker)
            logger.info("Registered engine for tenant %d", tenant_id)
        except Exception as exc:
            logger.error("Failed to register engine for tenant %d: %s", tenant_id, exc)
            raise

    async def unregister(self, tenant_id: int) -> None:
        """Dispose the engine and remove the tenant from the registry."""
        entry = self._engines.pop(tenant_id, None)
        if entry:
            eng, _ = entry
            await eng.dispose()
            logger.info("Unregistered engine for tenant %d", tenant_id)


# Singleton — imported everywhere that needs tenant DB routing
tenant_registry = TenantEngineRegistry()
