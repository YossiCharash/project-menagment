from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.building import Building
from backend.models.apartment import Apartment
from backend.repositories.building_repository import BuildingRepository
from backend.repositories.apartment_repository import ApartmentRepository
from backend.repositories.building_project_repository import BuildingProjectRepository
from backend.schemas.building import BuildingCreate, BuildingUpdate
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


# Common-area labels generated when a building has shared areas (לובי / חניון / מחסן).
COMMON_AREA_LABELS = ("לובי", "חניון", "מחסן")
# Floor counting starts at 1; common areas live on the conceptual ground floor.
FIRST_FLOOR = 1
COMMON_AREA_FLOOR = 0


class BuildingService:
    """Business logic for buildings (בניינים), including apartment auto-generation."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.building_repository = BuildingRepository(db)
        self.apartment_repository = ApartmentRepository(db)
        self.project_repository = BuildingProjectRepository(db)

    async def get_building(self, building_id: int) -> Building:
        building = await self.building_repository.get(building_id)
        if not building:
            raise ValueError(
                BuildingReceptionErrorMessages.building_not_found_by_id(building_id)
            )
        return building

    async def list_buildings(self) -> List[Building]:
        return await self.building_repository.list()

    async def create_building(self, data: BuildingCreate) -> Building:
        """Create a building and auto-generate its apartments and common areas."""
        self._validate_building_input(data)
        await self._ensure_project_exists(data.project_id)
        building = Building(
            name=data.name.strip(),
            address=(data.address or "").strip() or None,
            compound_name=(data.compound_name or "").strip() or None,
            project_id=data.project_id,
            floors_count=data.floors_count,
            units_per_floor=data.units_per_floor,
            has_common_areas=data.has_common_areas,
        )
        created = await self.building_repository.create(building)

        apartments = self._build_apartments(created.id, data)
        if apartments:
            await self.apartment_repository.create_many(apartments)

        return await self.building_repository.get(created.id)

    async def update_building(self, building_id: int, data: BuildingUpdate) -> Building:
        building = await self.get_building(building_id)
        update_data = data.model_dump(exclude_unset=True)
        if "name" in update_data and update_data["name"]:
            building.name = update_data["name"].strip()
        if "address" in update_data:
            building.address = (update_data["address"] or "").strip() or None
        if "compound_name" in update_data:
            building.compound_name = (update_data["compound_name"] or "").strip() or None
        if "floors_count" in update_data and update_data["floors_count"] is not None:
            building.floors_count = update_data["floors_count"]
        if "units_per_floor" in update_data and update_data["units_per_floor"] is not None:
            building.units_per_floor = update_data["units_per_floor"]
        if "has_common_areas" in update_data and update_data["has_common_areas"] is not None:
            building.has_common_areas = update_data["has_common_areas"]
        if "project_id" in update_data:
            await self._ensure_project_exists(update_data["project_id"])
            building.project_id = update_data["project_id"]
        await self.building_repository.update(building)
        return await self.building_repository.get(building_id)

    async def _ensure_project_exists(self, project_id: int | None) -> None:
        if project_id is None:
            return
        project = await self.project_repository.get(project_id)
        if not project:
            raise ValueError(
                BuildingReceptionErrorMessages.project_not_found_by_id(project_id)
            )

    async def delete_building(self, building_id: int) -> None:
        building = await self.get_building(building_id)
        await self.building_repository.delete(building)

    # --- private helpers -----------------------------------------------

    def _validate_building_input(self, data: BuildingCreate) -> None:
        if not data.name or not data.name.strip():
            raise ValueError(BuildingReceptionErrorMessages.BUILDING_NAME_REQUIRED)
        if data.floors_count < 0:
            raise ValueError(BuildingReceptionErrorMessages.INVALID_FLOORS_COUNT)
        if data.units_per_floor < 0:
            raise ValueError(BuildingReceptionErrorMessages.INVALID_UNITS_PER_FLOOR)

    def _build_apartments(self, building_id: int, data: BuildingCreate) -> List[Apartment]:
        """Generate the apartment rows for a freshly created building.

        Residential units: floors_count × units_per_floor, numbered
        sequentially in ascending order across all floors starting from
        ``first_unit_number`` (e.g. first=1 → 1, 2, 3, …). Common areas are
        appended on the ground floor when ``has_common_areas`` is set.
        """
        apartments = self._build_residential_units(building_id, data)
        if data.has_common_areas:
            apartments.extend(self._build_common_areas(building_id))
        return apartments

    def _build_residential_units(
        self, building_id: int, data: BuildingCreate
    ) -> List[Apartment]:
        apartments: List[Apartment] = []
        last_floor = FIRST_FLOOR + data.floors_count - 1
        next_unit_number = data.first_unit_number
        for floor in range(FIRST_FLOOR, last_floor + 1):
            for _ in range(1, data.units_per_floor + 1):
                apartments.append(
                    Apartment(
                        building_id=building_id,
                        floor=floor,
                        unit_number=str(next_unit_number),
                        is_common_area=False,
                    )
                )
                next_unit_number += 1
        return apartments

    def _build_common_areas(self, building_id: int) -> List[Apartment]:
        return [
            Apartment(
                building_id=building_id,
                floor=COMMON_AREA_FLOOR,
                unit_number=label,
                label=label,
                is_common_area=True,
            )
            for label in COMMON_AREA_LABELS
        ]
