import logging
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Master engine — used for super-admin operations and tenant-table lookups
# ---------------------------------------------------------------------------
master_engine = create_async_engine(
    settings.MASTER_DATABASE_URL,
    echo=False,
    future=True,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=60,  # Recycle every 60 s — prevents cloud idle-timeout drops
    pool_reset_on_return="commit",
)

MasterAsyncSessionLocal = async_sessionmaker(
    bind=master_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

# Backward-compat aliases (used by main.py / init_db / seed)
engine = master_engine
AsyncSessionLocal = MasterAsyncSessionLocal


# ---------------------------------------------------------------------------
# Master DB session dependency
# ---------------------------------------------------------------------------
async def get_master_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session for the master (super-admin) database."""
    async with MasterAsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            try:
                await session.close()
            except Exception as close_exc:
                logger.warning(
                    "Master session close failed (connection may be stale): %s", close_exc
                )


# ---------------------------------------------------------------------------
# Tenant DB session dependency
# ---------------------------------------------------------------------------
async def get_tenant_db(tenant_id: int) -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session for a specific tenant's database."""
    from backend.db.tenant_registry import tenant_registry
    from fastapi import HTTPException, status as http_status

    session_maker = tenant_registry.get_session_maker(tenant_id)
    if session_maker is None:
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Tenant service not available",
        )

    async with session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            try:
                await session.close()
            except Exception as close_exc:
                logger.warning(
                    "Tenant session close failed (tenant=%s): %s", tenant_id, close_exc
                )


# ---------------------------------------------------------------------------
# Legacy get_db — routes to master DB (kept for backward compatibility)
# ---------------------------------------------------------------------------
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Legacy alias — yields a session from the master database."""
    async for session in get_master_db():
        yield session
