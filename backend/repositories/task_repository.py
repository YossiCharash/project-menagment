"""Task repository for Task Management Calendar."""
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models.task import Task, TaskAttachment


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
        employee_id: int | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[Task]:
        q = (
            select(Task)
            .options(selectinload(Task.employee))
            .order_by(Task.start_time)
        )
        if employee_id is not None:
            q = q.where(Task.employee_id == employee_id)
        if start is not None:
            q = q.where(Task.end_time >= start)
        if end is not None:
            q = q.where(Task.start_time <= end)
        result = await self.db.execute(q)
        return list(result.unique().scalars().all())

    async def get(self, task_id: int) -> Task | None:
        result = await self.db.execute(
            select(Task)
            .options(selectinload(Task.employee), selectinload(Task.attachments))
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
