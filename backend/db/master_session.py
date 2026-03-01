"""
Async engine and session factory for the master database (bms_master).

Follows the same pattern as session.py but targets the master database
which stores Tenant and CEOCredential records.
"""
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.core.config import settings

master_engine = create_async_engine(
    settings.MASTER_DATABASE_URL,
    echo=False,
    future=True,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=60,
)

AsyncMasterSessionLocal = async_sessionmaker(
    bind=master_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_master_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a master-database session."""
    async with AsyncMasterSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
