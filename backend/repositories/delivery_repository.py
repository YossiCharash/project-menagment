from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models.delivery import Delivery


class DeliveryRepository:
    """Data access for deliveries/packages (משלוחים)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, delivery_id: int) -> Delivery | None:
        result = await self.db.execute(
            select(Delivery).where(Delivery.id == delivery_id)
        )
        return result.scalar_one_or_none()

    async def list_by_apartment(self, apartment_id: int) -> List[Delivery]:
        result = await self.db.execute(
            select(Delivery)
            .where(Delivery.apartment_id == apartment_id)
            .order_by(Delivery.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, delivery: Delivery) -> Delivery:
        self.db.add(delivery)
        await self.db.commit()
        await self.db.refresh(delivery)
        return delivery

    async def update(self, delivery: Delivery) -> Delivery:
        await self.db.commit()
        await self.db.refresh(delivery)
        return delivery

    async def delete(self, delivery: Delivery) -> None:
        await self.db.delete(delivery)
        await self.db.commit()
