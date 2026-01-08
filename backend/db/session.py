from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from backend.core.config import settings

engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    echo=False,
    future=True,
    pool_size=10,
    max_overflow=20,
    # pool_pre_ping removed - causes greenlet issues with asyncpg in SQLAlchemy 2.0
    # Connection validation is handled by pool_recycle instead
    pool_recycle=3600,   # Recycle connections after 1 hour
    pool_reset_on_return='commit',  # Reset connections on return to pool
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
