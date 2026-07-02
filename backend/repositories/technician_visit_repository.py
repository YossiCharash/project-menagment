from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models.technician_visit import TechnicianVisit


class TechnicianVisitRepository:
    """Data access for technician visits (כניסות טכנאים)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, visit_id: int) -> TechnicianVisit | None:
        result = await self.db.execute(
            select(TechnicianVisit).where(TechnicianVisit.id == visit_id)
        )
        return result.scalar_one_or_none()

    async def list_by_apartment(self, apartment_id: int) -> List[TechnicianVisit]:
        result = await self.db.execute(
            select(TechnicianVisit)
            .where(TechnicianVisit.apartment_id == apartment_id)
            .order_by(TechnicianVisit.entered_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, visit: TechnicianVisit) -> TechnicianVisit:
        self.db.add(visit)
        await self.db.commit()
        await self.db.refresh(visit)
        return visit

    async def update(self, visit: TechnicianVisit) -> TechnicianVisit:
        await self.db.commit()
        await self.db.refresh(visit)
        return visit

    async def delete(self, visit: TechnicianVisit) -> None:
        await self.db.delete(visit)
        await self.db.commit()
