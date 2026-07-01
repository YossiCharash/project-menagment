from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.authorized_vehicle import AuthorizedVehicle
from backend.repositories.authorized_vehicle_repository import AuthorizedVehicleRepository
from backend.repositories.apartment_repository import ApartmentRepository
from backend.schemas.authorized_vehicle import AuthorizedVehicleCreate, AuthorizedVehicleUpdate
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


class AuthorizedVehicleService:
    """Business logic for authorized vehicles (רכבים מורשים)."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.vehicle_repository = AuthorizedVehicleRepository(db)
        self.apartment_repository = ApartmentRepository(db)

    async def list_for_apartment(self, apartment_id: int) -> List[AuthorizedVehicle]:
        await self._ensure_apartment_exists(apartment_id)
        return await self.vehicle_repository.list_by_apartment(apartment_id)

    async def create_vehicle(self, data: AuthorizedVehicleCreate) -> AuthorizedVehicle:
        await self._ensure_apartment_exists(data.apartment_id)
        if not data.plate or not data.plate.strip():
            raise ValueError(BuildingReceptionErrorMessages.VEHICLE_PLATE_REQUIRED)
        if not data.owner_name or not data.owner_name.strip():
            raise ValueError(BuildingReceptionErrorMessages.VEHICLE_OWNER_REQUIRED)
        vehicle = AuthorizedVehicle(
            apartment_id=data.apartment_id,
            plate=data.plate.strip(),
            model=(data.model or "").strip() or None,
            owner_name=data.owner_name.strip(),
            parking_spot=(data.parking_spot or "").strip() or None,
        )
        return await self.vehicle_repository.create(vehicle)

    async def update_vehicle(self, vehicle_id: int, data: AuthorizedVehicleUpdate) -> AuthorizedVehicle:
        """Edit an authorized vehicle's plate / model / owner / parking spot."""
        vehicle = await self._get_vehicle(vehicle_id)
        update_data = data.model_dump(exclude_unset=True)
        if "plate" in update_data and update_data["plate"]:
            vehicle.plate = update_data["plate"].strip()
        if "model" in update_data:
            vehicle.model = (update_data["model"] or "").strip() or None
        if "owner_name" in update_data and update_data["owner_name"]:
            vehicle.owner_name = update_data["owner_name"].strip()
        if "parking_spot" in update_data:
            vehicle.parking_spot = (update_data["parking_spot"] or "").strip() or None
        return await self.vehicle_repository.update(vehicle)

    async def delete_vehicle(self, vehicle_id: int) -> None:
        await self.vehicle_repository.delete(await self._get_vehicle(vehicle_id))

    async def _get_vehicle(self, vehicle_id: int) -> AuthorizedVehicle:
        vehicle = await self.vehicle_repository.get(vehicle_id)
        if not vehicle:
            raise ValueError(
                BuildingReceptionErrorMessages.vehicle_not_found_by_id(vehicle_id)
            )
        return vehicle

    # --- private helpers -----------------------------------------------

    async def _ensure_apartment_exists(self, apartment_id: int) -> None:
        apartment = await self.apartment_repository.get(apartment_id)
        if not apartment:
            raise ValueError(
                BuildingReceptionErrorMessages.apartment_not_found_by_id(apartment_id)
            )
