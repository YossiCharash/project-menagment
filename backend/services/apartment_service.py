from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.apartment import Apartment
from backend.repositories.apartment_repository import ApartmentRepository
from backend.repositories.building_repository import BuildingRepository
from backend.schemas.apartment import ApartmentCreate, ApartmentUpdate
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


class ApartmentService:
    """Business logic for apartments (דירות)."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.apartment_repository = ApartmentRepository(db)
        self.building_repository = BuildingRepository(db)

    async def create_apartment(self, data: ApartmentCreate) -> Apartment:
        """Add a single apartment/area to an existing building (floor add)."""
        building = await self.building_repository.get(data.building_id)
        if not building:
            raise ValueError(
                BuildingReceptionErrorMessages.building_not_found_by_id(data.building_id)
            )
        if not data.unit_number or not data.unit_number.strip():
            raise ValueError(BuildingReceptionErrorMessages.APARTMENT_UNIT_REQUIRED)
        apartment = Apartment(
            building_id=data.building_id,
            floor=data.floor,
            unit_number=data.unit_number.strip(),
            label=(data.label or "").strip() or None,
            is_common_area=data.is_common_area,
        )
        created = await self.apartment_repository.create(apartment)
        return await self.apartment_repository.get_with_details(created.id)

    async def delete_apartment(self, apartment_id: int) -> None:
        """Delete a specific apartment (and its keys/tenants/etc. via cascade)."""
        apartment = await self.get_apartment(apartment_id)
        await self.apartment_repository.delete(apartment)

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
