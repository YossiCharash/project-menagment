from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from backend.core.config import settings

engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    echo=False,
    future=True,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=60,  # Recycle every 60s so connections never hit cloud idle timeout (e.g. Render)
    pool_reset_on_return="commit",
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
            try:
                await session.close()
            except Exception as close_exc:
                # Do not raise: response may already have been sent; raising would cause
                # "RuntimeError: Caught handled exception, but response already started."
                import logging
                logging.getLogger(__name__).warning(
                    "Session close failed (connection may be stale): %s", close_exc
                )
