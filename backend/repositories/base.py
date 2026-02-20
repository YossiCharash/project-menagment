"""
Base repository providing common CRUD operations for all repositories.

All concrete repositories should inherit from BaseRepository[T] where T is
the SQLAlchemy model type. This eliminates duplicated get_by_id / create /
update / delete boilerplate across 20+ repository classes.

Design decisions:
  - Uses a generic type parameter so callers get correct return types.
  - The Protocol (IRepository) is separated from the concrete implementation
    so services can depend on the abstraction (DIP).
  - commit() is called inside each method for backward-compatibility with
    existing code that does not manage transactions externally.
"""

from __future__ import annotations

from typing import Generic, TypeVar, Protocol, Sequence, runtime_checkable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


@runtime_checkable
class IRepository(Protocol[T]):
    """Abstract repository contract. Services depend on this, not on concrete repos."""

    async def get_by_id(self, entity_id: int) -> T | None: ...
    async def create(self, entity: T) -> T: ...
    async def update(self, entity: T) -> T: ...
    async def delete(self, entity: T) -> None: ...


class BaseRepository(Generic[T]):
    """Concrete generic repository with shared CRUD logic.

    Subclasses must set ``model`` as a class attribute pointing to the
    SQLAlchemy mapped class.

    Example::

        class ProjectRepository(BaseRepository[Project]):
            model = Project
    """

    model: type[T]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, entity_id: int) -> T | None:
        result = await self.db.execute(
            select(self.model).where(self.model.id == entity_id)  # type: ignore[attr-defined]
        )
        return result.scalar_one_or_none()

    async def create(self, entity: T) -> T:
        self.db.add(entity)
        await self.db.commit()
        await self.db.refresh(entity)
        return entity

    async def update(self, entity: T) -> T:
        self.db.add(entity)
        await self.db.commit()
        await self.db.refresh(entity)
        return entity

    async def delete(self, entity: T) -> None:
        await self.db.delete(entity)
        await self.db.commit()
