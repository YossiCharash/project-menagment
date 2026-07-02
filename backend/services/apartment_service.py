from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.apartment import Apartment
from backend.repositories.apartment_repository import ApartmentRepository
from backend.repositories.building_repository import BuildingRepository
from backend.schemas.apartment import ApartmentCreate, ApartmentUpdate
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


class ApartmentService:
    """Business logic for apartments (דירות)."""

    # Optional free-text fields on an apartment that share the same
    # "trim, empty -> None" normalization. Declared once so create/update
    # never duplicate the per-field strip logic (DRY / single source of truth).
    OPTIONAL_TEXT_FIELDS = (
        "label",
        "owner_name",
        "owner_phone",
        "management_company_name",
        "management_company_phone",
        "attorneys",
        "equipment",
        "notes",
    )

    def __init__(self, db: AsyncSession):
        self.db = db
        self.apartment_repository = ApartmentRepository(db)
        self.building_repository = BuildingRepository(db)

    @staticmethod
    def _normalize_optional_text(raw_value: str | None) -> str | None:
        """Trim a free-text field, collapsing empty/whitespace-only input to None."""
        return (raw_value or "").strip() or None

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
            is_common_area=data.is_common_area,
            **{
                field: self._normalize_optional_text(getattr(data, field))
                for field in self.OPTIONAL_TEXT_FIELDS
            },
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
        if "is_common_area" in update_data and update_data["is_common_area"] is not None:
            apartment.is_common_area = update_data["is_common_area"]
        self._apply_optional_text_fields(apartment, update_data)
        await self.apartment_repository.update(apartment)
        return await self.apartment_repository.get_with_details(apartment_id)

    def _apply_optional_text_fields(self, apartment: Apartment, update_data: dict) -> None:
        """Apply any present optional text field, normalizing empty strings to None.

        Only keys explicitly sent by the caller (present in ``update_data``) are
        touched, so an omitted field keeps its stored value while an empty string
        clears it back to None.
        """
        for field in self.OPTIONAL_TEXT_FIELDS:
            if field in update_data:
                setattr(apartment, field, self._normalize_optional_text(update_data[field]))
