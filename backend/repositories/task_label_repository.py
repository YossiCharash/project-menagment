"""Task label repository."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.task import TaskLabel


class TaskLabelRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_all(self) -> list[TaskLabel]:
        result = await self.db.execute(select(TaskLabel).order_by(TaskLabel.name))
        return list(result.scalars().all())

    async def get_by_id(self, label_id: int) -> TaskLabel | None:
        result = await self.db.execute(select(TaskLabel).where(TaskLabel.id == label_id))
        return result.scalar_one_or_none()

    async def get_by_ids(self, ids: list[int]) -> list[TaskLabel]:
        if not ids:
            return []
        result = await self.db.execute(select(TaskLabel).where(TaskLabel.id.in_(ids)))
        return list(result.scalars().all())

    async def create(self, label: TaskLabel) -> TaskLabel:
        self.db.add(label)
        await self.db.flush()
        await self.db.refresh(label)
        return label

    async def update(self, label: TaskLabel) -> TaskLabel:
        await self.db.flush()
        await self.db.refresh(label)
        return label

    async def delete(self, label: TaskLabel) -> None:
        await self.db.delete(label)
        await self.db.flush()
