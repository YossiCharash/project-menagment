"""Task repository for Task Management Calendar."""
from datetime import datetime
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models.task import Task


class TaskRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, task: Task) -> Task:
        self.db.add(task)
        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def list(
        self,
        assigned_to_user_id: int | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[Task]:
        q = (
            select(Task)
            .options(selectinload(Task.assigned_user))
            .order_by(Task.start_time)
        )
        if assigned_to_user_id is not None:
            q = q.where(Task.assigned_to_user_id == assigned_to_user_id)
        if start is not None and end is not None:
            q = q.where(
                or_(
                    and_(Task.start_time.is_(None), Task.end_time.is_(None)),
                    and_(Task.end_time >= start, Task.start_time <= end)
                )
            )
        elif start is not None:
            q = q.where(or_(Task.start_time.is_(None), Task.end_time >= start))
        elif end is not None:
            q = q.where(or_(Task.start_time.is_(None), Task.start_time <= end))
        result = await self.db.execute(q)
        return list(result.unique().scalars().all())

    async def get(self, task_id: int) -> Task | None:
        result = await self.db.execute(
            select(Task)
            .options(selectinload(Task.assigned_user), selectinload(Task.attachments))
            .where(Task.id == task_id)
        )
        return result.unique().scalar_one_or_none()

    async def update(self, task: Task) -> Task:
        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def delete(self, task: Task) -> None:
        await self.db.delete(task)
        await self.db.flush()
