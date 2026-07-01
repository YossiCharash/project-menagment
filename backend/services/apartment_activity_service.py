from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.apartment_activity import ApartmentActivity
from backend.repositories.apartment_activity_repository import ApartmentActivityRepository
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


class ApartmentActivityService:
    """Business logic for the per-apartment activity timeline (יומן פעילות).

    Acts as the single place that appends timeline entries, so every other
    desk service (keys, tenants, deliveries) records history through one path
    instead of duplicating ``ApartmentActivity(...)`` construction.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.activity_repository = ApartmentActivityRepository(db)

    async def record(self, apartment_id: int, kind: str, text: str) -> ApartmentActivity:
        """Append a single activity entry for an apartment."""
        if not text or not text.strip():
            raise ValueError(BuildingReceptionErrorMessages.APARTMENT_NOT_FOUND)
        activity = ApartmentActivity(
            apartment_id=apartment_id,
            kind=kind,
            text=text.strip(),
        )
        return await self.activity_repository.create(activity)

    async def list_for_apartment(self, apartment_id: int) -> List[ApartmentActivity]:
        return await self.activity_repository.list_by_apartment(apartment_id)
