from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from backend.models.building import Building
from backend.models.apartment import Apartment


class BuildingRepository:
    """Data access for buildings (בניינים) and their apartments."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, building_id: int) -> Building | None:
        # Eager-load every apartment collection the building-overview serializer
        # reads (current tenant + key/vehicle/delivery/client/technician counts),
        # so no lazy IO is triggered during async response serialization.
        result = await self.db.execute(
            select(Building)
            .options(
                selectinload(Building.apartments).selectinload(Apartment.tenants),
                selectinload(Building.apartments).selectinload(Apartment.keys),
                selectinload(Building.apartments).selectinload(Apartment.vehicles),
                selectinload(Building.apartments).selectinload(Apartment.deliveries),
                selectinload(Building.apartments).selectinload(Apartment.client_visits),
                selectinload(Building.apartments).selectinload(Apartment.technician_visits),
            )
            .where(Building.id == building_id)
        )
        return result.scalar_one_or_none()

    async def list(self) -> List[Building]:
        result = await self.db.execute(
            select(Building)
            .options(selectinload(Building.apartments))
            .order_by(Building.name, Building.id)
        )
        return list(result.scalars().all())

    async def count_apartments(self, building_id: int) -> int:
        result = await self.db.execute(
            select(func.count(Apartment.id)).where(Apartment.building_id == building_id)
        )
        return int(result.scalar_one() or 0)

    async def create(self, building: Building) -> Building:
        self.db.add(building)
        await self.db.commit()
        await self.db.refresh(building)
        return building

    async def update(self, building: Building) -> Building:
        await self.db.commit()
        await self.db.refresh(building)
        return building

    async def delete(self, building: Building) -> None:
        await self.db.delete(building)
        await self.db.commit()
