"""Repository for task checklist items."""
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.task import TaskChecklistItem


class TaskChecklistRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_task(self, task_id: int) -> list[TaskChecklistItem]:
        result = await self.db.execute(
            select(TaskChecklistItem)
            .options(
                selectinload(TaskChecklistItem.assigned_user),
                selectinload(TaskChecklistItem.handled_by_user),
            )
            .where(TaskChecklistItem.task_id == task_id)
            .order_by(TaskChecklistItem.sort_order)
        )
        return list(result.scalars().all())

    async def get_by_id(self, item_id: int) -> TaskChecklistItem | None:
        result = await self.db.execute(
            select(TaskChecklistItem)
            .options(
                selectinload(TaskChecklistItem.assigned_user),
                selectinload(TaskChecklistItem.handled_by_user),
            )
            .where(TaskChecklistItem.id == item_id)
        )
        return result.scalar_one_or_none()

    async def get_next_sort_order(self, task_id: int) -> int:
        result = await self.db.execute(
            select(func.coalesce(func.max(TaskChecklistItem.sort_order), -1))
            .where(TaskChecklistItem.task_id == task_id)
        )
        return (result.scalar() or -1) + 1

    async def create(self, item: TaskChecklistItem) -> TaskChecklistItem:
        self.db.add(item)
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def update(self, item: TaskChecklistItem) -> TaskChecklistItem:
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def delete(self, item: TaskChecklistItem) -> None:
        await self.db.delete(item)
        await self.db.flush()

    async def get_summary(self, task_id: int) -> dict:
        """Returns {total, completed} counts for a task's checklist."""
        total_result = await self.db.execute(
            select(func.count()).where(TaskChecklistItem.task_id == task_id)
        )
        completed_result = await self.db.execute(
            select(func.count())
            .where(TaskChecklistItem.task_id == task_id)
            .where(TaskChecklistItem.is_completed == True)  # noqa: E712
        )
        total = total_result.scalar() or 0
        completed = completed_result.scalar() or 0
        return {"total": total, "completed": completed}
