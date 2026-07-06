"""Task repository for Task Management Calendar."""
from __future__ import annotations
from datetime import datetime, date, timezone
from sqlalchemy import select, or_, and_, exists, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models.task import Task, TaskParticipant, TaskStatus


class TaskRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _visible_to_user_clause(user_id: int):
        """Tasks in a user's calendar: owned by them OR they are an invited participant."""
        return or_(
            Task.assigned_to_user_id == user_id,
            exists().where(TaskParticipant.task_id == Task.id).where(TaskParticipant.user_id == user_id),
        )

    async def create(self, task: Task) -> Task:
        self.db.add(task)
        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def list(
        self,
        assigned_to_user_id: int | None = None,
        for_user_id: int | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        include_archived: bool = False,
    ) -> list[Task]:
        q = (
            select(Task)
            .options(
                selectinload(Task.assigned_user),
                selectinload(Task.attachments),
                selectinload(Task.labels),
                selectinload(Task.participants).selectinload(TaskParticipant.user),
            )
            .order_by(Task.start_time)
        )
        if not include_archived:
            q = q.where(Task.is_archived == False)
        if for_user_id is not None:
            # Show tasks where user is owner OR invited participant (like Outlook)
            q = q.where(self._visible_to_user_clause(for_user_id))
        elif assigned_to_user_id is not None:
            # Admin filtering by a user: owner OR invited participant, so a task the
            # user merely attends (assigned to someone else) still shows in their calendar.
            q = q.where(self._visible_to_user_clause(assigned_to_user_id))
        if start is not None and end is not None:
            q = q.where(
                or_(
                    and_(Task.start_time.is_(None), Task.end_time.is_(None)),
                    and_(Task.end_time >= start, Task.start_time <= end),
                    # Recurring series that started on/before the range end and
                    # haven't ended yet may project occurrences INTO this range,
                    # even though their stored (first) occurrence is in the past.
                    # The frontend expands the actual occurrences per range.
                    and_(
                        Task.recurrence_rule != "",
                        Task.start_time <= end,
                        or_(
                            Task.recurrence_end_date.is_(None),
                            Task.recurrence_end_date >= start.date(),
                        ),
                    ),
                )
            )
        elif start is not None:
            q = q.where(
                or_(
                    Task.start_time.is_(None),
                    Task.end_time >= start,
                    Task.recurrence_rule != "",
                )
            )
        elif end is not None:
            q = q.where(or_(Task.start_time.is_(None), Task.start_time <= end))
        result = await self.db.execute(q)
        return list(result.unique().scalars().all())

    async def list_by_apartment(self, apartment_id: int) -> list[Task]:
        """Non-archived tasks linked to a reception-desk apartment, newest first."""
        result = await self.db.execute(
            select(Task)
            .options(selectinload(Task.assigned_user))
            .where(Task.apartment_id == apartment_id)
            .where(Task.is_archived == False)  # noqa: E712
            .order_by(Task.start_time.is_(None), Task.start_time)
        )
        return list(result.unique().scalars().all())

    async def count_open_by_apartment_ids(self, apartment_ids: list[int]) -> dict[int, int]:
        """Count non-archived, non-completed ("open") tasks per apartment.

        Returns a ``{apartment_id: open_task_count}`` mapping in a single grouped
        query. Apartments with no open tasks are simply absent from the mapping.
        """
        if not apartment_ids:
            return {}
        result = await self.db.execute(
            select(Task.apartment_id, func.count(Task.id))
            .where(Task.apartment_id.in_(apartment_ids))
            .where(Task.is_archived == False)  # noqa: E712
            .where(Task.status != TaskStatus.COMPLETED)
            .group_by(Task.apartment_id)
        )
        return {apartment_id: count for apartment_id, count in result.all()}

    async def get(self, task_id: int) -> Task | None:
        result = await self.db.execute(
            select(Task)
            .options(
                selectinload(Task.assigned_user),
                selectinload(Task.attachments),
                selectinload(Task.labels),
                selectinload(Task.participants).selectinload(TaskParticipant.user),
            )
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

    async def list_archived(
        self,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        assigned_to_user_id: int | None = None,
        for_user_id: int | None = None,
    ) -> list[Task]:
        q = (
            select(Task)
            .options(
                selectinload(Task.assigned_user),
                selectinload(Task.attachments),
                selectinload(Task.labels),
                selectinload(Task.participants).selectinload(TaskParticipant.user),
            )
            .where(Task.is_archived == True)
            .order_by(Task.archived_at.desc())
        )
        if for_user_id is not None:
            q = q.where(self._visible_to_user_clause(for_user_id))
        elif assigned_to_user_id is not None:
            q = q.where(self._visible_to_user_clause(assigned_to_user_id))
        if date_from is not None:
            q = q.where(Task.archived_at >= date_from)
        if date_to is not None:
            q = q.where(Task.archived_at <= date_to)
        result = await self.db.execute(q)
        return list(result.unique().scalars().all())

    async def list_super_tasks(self) -> list[Task]:
        """Return non-archived, non-completed super tasks, oldest first."""
        q = (
            select(Task)
            .options(
                selectinload(Task.assigned_user),
                selectinload(Task.attachments),
                selectinload(Task.labels),
                selectinload(Task.participants).selectinload(TaskParticipant.user),
            )
            .where(Task.is_super_task == True)   # noqa: E712
            .where(Task.is_archived == False)     # noqa: E712
            .where(Task.status != TaskStatus.COMPLETED)
            .order_by(Task.created_at.asc())
        )
        result = await self.db.execute(q)
        return list(result.unique().scalars().all())

    async def list_backlog(
        self,
        assigned_to_user_id: int | None = None,
        for_user_id: int | None = None,
    ) -> list[Task]:
        """Return non-archived, non-completed backlog tasks. Member sees own/invited; Admin can filter by user."""
        q = (
            select(Task)
            .options(
                selectinload(Task.assigned_user),
                selectinload(Task.attachments),
                selectinload(Task.labels),
                selectinload(Task.participants).selectinload(TaskParticipant.user),
            )
            .where(Task.is_backlog == True)   # noqa: E712
            .where(Task.is_archived == False)  # noqa: E712
            .where(Task.status != TaskStatus.COMPLETED)
            .order_by(Task.created_at.asc())
        )
        if for_user_id is not None:
            q = q.where(self._visible_to_user_clause(for_user_id))
        elif assigned_to_user_id is not None:
            q = q.where(self._visible_to_user_clause(assigned_to_user_id))
        result = await self.db.execute(q)
        return list(result.unique().scalars().all())

    async def archive_completed_tasks(self) -> int:
        today_midnight = datetime.combine(date.today(), datetime.min.time())
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        stmt = (
            update(Task)
            .where(
                Task.status == TaskStatus.COMPLETED,
                Task.completed_at.isnot(None),
                Task.completed_at < today_midnight,
                Task.is_archived == False,
            )
            .values(is_archived=True, archived_at=now)
            .execution_options(synchronize_session=False)
        )
        result = await self.db.execute(stmt)
        await self.db.flush()
        return result.rowcount
