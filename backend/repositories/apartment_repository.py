from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.models.apartment import Apartment
from backend.models.apartment_key import ApartmentKey


class ApartmentRepository:
    """Data access for apartments (דירות) and their related desk records."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, apartment_id: int) -> Apartment | None:
        result = await self.db.execute(
            select(Apartment).where(Apartment.id == apartment_id)
        )
        return result.scalar_one_or_none()

    async def get_with_details(self, apartment_id: int) -> Apartment | None:
        result = await self.db.execute(
            select(Apartment)
            .options(
                selectinload(Apartment.tenants),
                selectinload(Apartment.keys).selectinload(ApartmentKey.transfers),
                selectinload(Apartment.vehicles),
                selectinload(Apartment.deliveries),
                selectinload(Apartment.technician_visits),
                selectinload(Apartment.client_visits),
                selectinload(Apartment.activities),
                selectinload(Apartment.documents),
            )
            .where(Apartment.id == apartment_id)
        )
        return result.scalar_one_or_none()

    async def list_by_building(self, building_id: int) -> List[Apartment]:
        result = await self.db.execute(
            select(Apartment)
            .where(Apartment.building_id == building_id)
            .order_by(Apartment.floor, Apartment.unit_number, Apartment.id)
        )
        return list(result.scalars().all())

    async def create(self, apartment: Apartment) -> Apartment:
        self.db.add(apartment)
        await self.db.commit()
        await self.db.refresh(apartment)
        return apartment

    async def create_many(self, apartments: List[Apartment]) -> List[Apartment]:
        """Persist many apartments in a single transaction (auto-generation)."""
        self.db.add_all(apartments)
        await self.db.commit()
        return apartments

    async def update(self, apartment: Apartment) -> Apartment:
        await self.db.commit()
        await self.db.refresh(apartment)
        return apartment

    async def delete(self, apartment: Apartment) -> None:
        await self.db.delete(apartment)
        await self.db.commit()
