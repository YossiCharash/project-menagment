"""
TenantProvisioningService — provisions a brand-new tenant database.

Steps:
  1. Test connectivity to the supplied db_url.
  2. Run init_database() to create all tenant tables.
  3. Seed the first Admin user via seed_tenant_database().
  4. Save the Tenant record in the master DB.
  5. Register the new engine in TenantEngineRegistry.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text

from backend.core.config import _normalize_database_uri
from backend.db.init_db import init_database
from backend.db.tenant_registry import tenant_registry
from backend.master.models import Tenant
from backend.master.schemas import TenantCreate

logger = logging.getLogger(__name__)


class TenantProvisioningService:
    def __init__(self, master_db: AsyncSession) -> None:
        self.master_db = master_db

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def provision(
        self, data: TenantCreate, created_by: int | None = None
    ) -> Tenant:
        """
        Provision a new tenant:
        1. Verify DB connectivity.
        2. Create tenant schema.
        3. Seed admin user.
        4. Persist Tenant record.
        5. Register engine in registry.
        """
        db_url = _normalize_database_uri(data.db_url)

        # 1. Test connection
        await self._test_connection(db_url)

        # 2. Init schema
        await self._init_schema(db_url)

        # 3. Seed admin
        await self._seed_admin(db_url, data.admin_email, data.admin_password, data.admin_name)

        # 4. Save record in master DB
        tenant = Tenant(
            slug=data.slug,
            admin_email=data.admin_email,
            admin_name=data.admin_name,
            db_url=db_url,
            status="active",
            created_by=created_by,
            provisioned_at=datetime.now(timezone.utc),
        )
        self.master_db.add(tenant)
        await self.master_db.flush()   # assigns tenant.id without committing
        await self.master_db.refresh(tenant)

        # 5. Register engine
        await tenant_registry.register(tenant.id, db_url)

        logger.info(
            "Tenant '%s' (id=%s) provisioned successfully", tenant.slug, tenant.id
        )
        return tenant

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    async def _test_connection(self, db_url: str) -> None:
        test_engine = create_async_engine(
            db_url, echo=False, future=True, pool_size=1, max_overflow=0
        )
        try:
            async with test_engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception as exc:
            raise ValueError(f"Cannot connect to database at '{db_url}': {exc}") from exc
        finally:
            await test_engine.dispose()

    async def _init_schema(self, db_url: str) -> None:
        eng = create_async_engine(db_url, echo=False, future=True)
        try:
            await init_database(eng)
        finally:
            await eng.dispose()

    async def _seed_admin(
        self, db_url: str, email: str, password: str, name: str
    ) -> None:
        from backend.core.seed import seed_tenant_database

        eng = create_async_engine(db_url, echo=False, future=True)
        session_maker = async_sessionmaker(
            bind=eng,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
        try:
            async with session_maker() as session:
                await seed_tenant_database(session, email, password, name)
                await session.commit()
        finally:
            await eng.dispose()
