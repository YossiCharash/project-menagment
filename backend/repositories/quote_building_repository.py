from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.models import QuoteBuilding, QuoteApartment, QuoteLine, QuoteStructureItem


class QuoteBuildingRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, building_id: int) -> QuoteBuilding | None:
        result = await self.db.execute(
            select(QuoteBuilding)
            .options(
                selectinload(QuoteBuilding.quote_lines).selectinload(QuoteLine.quote_structure_item),
                selectinload(QuoteBuilding.quote_apartments),
            )
            .where(QuoteBuilding.id == building_id)
        )
        return result.scalar_one_or_none()

    async def list_by_quote_project(self, quote_project_id: int) -> List[QuoteBuilding]:
        result = await self.db.execute(
            select(QuoteBuilding)
            .options(
                selectinload(QuoteBuilding.quote_lines).selectinload(QuoteLine.quote_structure_item),
                selectinload(QuoteBuilding.quote_apartments),
            )
            .where(QuoteBuilding.quote_project_id == quote_project_id)
            .order_by(QuoteBuilding.sort_order, QuoteBuilding.id)
        )
        return list(result.scalars().all())

    async def create(self, b: QuoteBuilding) -> QuoteBuilding:
        self.db.add(b)
        await self.db.commit()
        await self.db.refresh(b)
        return b

    async def update(self, b: QuoteBuilding) -> QuoteBuilding:
        await self.db.commit()
        await self.db.refresh(b)
        return b

    async def delete(self, b: QuoteBuilding) -> None:
        await self.db.delete(b)
        await self.db.commit()


class QuoteApartmentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_by_building(self, quote_building_id: int) -> List[QuoteApartment]:
        result = await self.db.execute(
            select(QuoteApartment)
            .where(QuoteApartment.quote_building_id == quote_building_id)
            .order_by(QuoteApartment.sort_order, QuoteApartment.id)
        )
        return list(result.scalars().all())

    async def create(self, apt: QuoteApartment) -> QuoteApartment:
        self.db.add(apt)
        await self.db.commit()
        await self.db.refresh(apt)
        return apt

    async def update(self, apt: QuoteApartment) -> QuoteApartment:
        await self.db.commit()
        await self.db.refresh(apt)
        return apt

    async def delete(self, apt: QuoteApartment) -> None:
        await self.db.delete(apt)
        await self.db.commit()

    async def get(self, apt_id: int) -> QuoteApartment | None:
        result = await self.db.execute(select(QuoteApartment).where(QuoteApartment.id == apt_id))
        return result.scalar_one_or_none()
