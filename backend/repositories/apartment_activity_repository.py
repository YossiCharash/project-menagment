from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models.apartment_activity import ApartmentActivity


class ApartmentActivityRepository:
    """Data access for the per-apartment activity timeline (יומן פעילות)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, activity_id: int) -> ApartmentActivity | None:
        result = await self.db.execute(
            select(ApartmentActivity).where(ApartmentActivity.id == activity_id)
        )
        return result.scalar_one_or_none()

    async def list_by_apartment(self, apartment_id: int) -> List[ApartmentActivity]:
        result = await self.db.execute(
            select(ApartmentActivity)
            .where(ApartmentActivity.apartment_id == apartment_id)
            .order_by(ApartmentActivity.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, activity: ApartmentActivity) -> ApartmentActivity:
        self.db.add(activity)
        await self.db.commit()
        await self.db.refresh(activity)
        return activity

    async def delete(self, activity: ApartmentActivity) -> None:
        await self.db.delete(activity)
        await self.db.commit()
