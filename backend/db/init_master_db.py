"""
Initialize the master database schema and seed CEO credentials.

This module creates only master-specific tables (Tenant, CEOCredential)
using their own ``MasterBase.metadata`` so that tenant application
tables are never touched.
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, AsyncSession

from backend.core.config import settings
from backend.core.security import hash_password
from backend.models.tenant import MasterBase, CEOCredential

logger = logging.getLogger(__name__)


async def init_master_database(engine: AsyncEngine) -> None:
    """Create master-only tables (tenants, ceo_credentials)."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(MasterBase.metadata.create_all)
        logger.info("Master database tables created successfully")
    except Exception as exc:
        logger.error("Failed to initialize master database: %s", exc)
        raise


async def seed_ceo_credentials(
    master_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Ensure the default CEO credential row exists in bms_master."""
    async with master_session_factory() as session:
        stmt = select(CEOCredential).where(
            CEOCredential.email == settings.CEO_EMAIL
        )
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing is not None:
            logger.info("CEO credential already exists for %s", settings.CEO_EMAIL)
            return

        ceo = CEOCredential(
            email=settings.CEO_EMAIL,
            password_hash=hash_password(settings.CEO_PASSWORD),
        )
        session.add(ceo)
        await session.commit()
        logger.info("Created CEO credential for %s", settings.CEO_EMAIL)
