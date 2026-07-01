from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.apartment import Apartment
from backend.repositories.apartment_repository import ApartmentRepository
from backend.schemas.apartment import ApartmentUpdate
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


class ApartmentService:
    """Business logic for apartments (דירות)."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.apartment_repository = ApartmentRepository(db)

    async def get_apartment(self, apartment_id: int) -> Apartment:
        apartment = await self.apartment_repository.get(apartment_id)
        if not apartment:
            raise ValueError(
                BuildingReceptionErrorMessages.apartment_not_found_by_id(apartment_id)
            )
        return apartment

    async def get_apartment_detail(self, apartment_id: int) -> Apartment:
        apartment = await self.apartment_repository.get_with_details(apartment_id)
        if not apartment:
            raise ValueError(
                BuildingReceptionErrorMessages.apartment_not_found_by_id(apartment_id)
            )
        return apartment

    async def update_apartment(self, apartment_id: int, data: ApartmentUpdate) -> Apartment:
        apartment = await self.get_apartment(apartment_id)
        update_data = data.model_dump(exclude_unset=True)
        if "floor" in update_data and update_data["floor"] is not None:
            apartment.floor = update_data["floor"]
        if "unit_number" in update_data and update_data["unit_number"]:
            apartment.unit_number = update_data["unit_number"].strip()
        if "label" in update_data:
            apartment.label = (update_data["label"] or "").strip() or None
        if "is_common_area" in update_data and update_data["is_common_area"] is not None:
            apartment.is_common_area = update_data["is_common_area"]
        await self.apartment_repository.update(apartment)
        return await self.apartment_repository.get_with_details(apartment_id)
