"""Repository for user notifications."""
from datetime import datetime
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models.user_notification import UserNotification


class NotificationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, notification: UserNotification) -> UserNotification:
        self.db.add(notification)
        await self.db.flush()
        await self.db.refresh(notification)
        return notification

    async def list_for_user(
        self,
        user_id: int,
        *,
        unread_only: bool = False,
        type_filter: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[UserNotification]:
        q = (
            select(UserNotification)
            .options(
                selectinload(UserNotification.from_user),
                selectinload(UserNotification.task),
            )
            .where(UserNotification.user_id == user_id)
        )
        if unread_only:
            q = q.where(UserNotification.read_at.is_(None))
        if type_filter:
            q = q.where(UserNotification.type == type_filter)
        q = q.order_by(UserNotification.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(q)
        return list(result.unique().scalars().all())

    async def get_by_id(self, notification_id: int, user_id: int) -> UserNotification | None:
        result = await self.db.execute(
            select(UserNotification)
            .options(
                selectinload(UserNotification.from_user),
                selectinload(UserNotification.task),
            )
            .where(
                UserNotification.id == notification_id,
                UserNotification.user_id == user_id,
            )
        )
        return result.unique().scalar_one_or_none()

    async def count_unread(self, user_id: int) -> int:
        result = await self.db.execute(
            select(func.count(UserNotification.id)).where(
                UserNotification.user_id == user_id,
                UserNotification.read_at.is_(None),
            )
        )
        return result.scalar() or 0

    async def mark_read(self, notification: UserNotification) -> UserNotification:
        notification.read_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(notification)
        return notification

    async def mark_unread(self, notification: UserNotification) -> UserNotification:
        notification.read_at = None
        await self.db.flush()
        await self.db.refresh(notification)
        return notification
