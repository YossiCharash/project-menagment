from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models.authorized_vehicle import AuthorizedVehicle


class AuthorizedVehicleRepository:
    """Data access for authorized vehicles (רכבים מורשים)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, vehicle_id: int) -> AuthorizedVehicle | None:
        result = await self.db.execute(
            select(AuthorizedVehicle).where(AuthorizedVehicle.id == vehicle_id)
        )
        return result.scalar_one_or_none()

    async def list_by_apartment(self, apartment_id: int) -> List[AuthorizedVehicle]:
        result = await self.db.execute(
            select(AuthorizedVehicle)
            .where(AuthorizedVehicle.apartment_id == apartment_id)
            .order_by(AuthorizedVehicle.plate, AuthorizedVehicle.id)
        )
        return list(result.scalars().all())

    async def create(self, vehicle: AuthorizedVehicle) -> AuthorizedVehicle:
        self.db.add(vehicle)
        await self.db.commit()
        await self.db.refresh(vehicle)
        return vehicle

    async def update(self, vehicle: AuthorizedVehicle) -> AuthorizedVehicle:
        await self.db.commit()
        await self.db.refresh(vehicle)
        return vehicle

    async def delete(self, vehicle: AuthorizedVehicle) -> None:
        await self.db.delete(vehicle)
        await self.db.commit()
