import uuid
from typing import Any, Generic, List, Optional, Type, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    """Generic async CRUD repository.

    Follows the Repository pattern: encapsulates all data-access logic
    behind a clean interface so that services never touch SQLAlchemy
    directly.  Each specialised repository inherits this base and adds
    domain-specific query methods.
    """

    def __init__(self, model: Type[ModelT], session: AsyncSession) -> None:
        self._model = model
        self._session = session

    async def get_by_id(self, entity_id: Any) -> Optional[ModelT]:
        return await self._session.get(self._model, entity_id)

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[ModelT]:
        stmt = select(self._model).offset(skip).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, data: dict) -> ModelT:
        instance = self._model(**data)
        self._session.add(instance)
        await self._session.flush()
        return instance

    async def update(self, entity_id: Any, data: dict) -> Optional[ModelT]:
        instance = await self.get_by_id(entity_id)
        if instance is None:
            return None
        for key, value in data.items():
            if hasattr(instance, key):
                setattr(instance, key, value)
        await self._session.flush()
        return instance

    async def delete(self, entity_id: Any) -> bool:
        instance = await self.get_by_id(entity_id)
        if instance is None:
            return False
        await self._session.delete(instance)
        await self._session.flush()
        return True

    async def exists(self, entity_id: Any) -> bool:
        instance = await self.get_by_id(entity_id)
        return instance is not None
