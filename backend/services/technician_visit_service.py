from __future__ import annotations
from datetime import datetime, timezone
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.technician_visit import TechnicianVisit, TechnicianVisitStatus
from backend.models.apartment_activity import ActivityKind
from backend.repositories.technician_visit_repository import TechnicianVisitRepository
from backend.repositories.apartment_repository import ApartmentRepository
from backend.services.apartment_activity_service import ApartmentActivityService
from backend.schemas.technician_visit import TechnicianVisitCreate, TechnicianVisitUpdate
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


class TechnicianVisitService:
    """Business logic for technician visits (כניסות טכנאים) at the desk."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.technician_visit_repository = TechnicianVisitRepository(db)
        self.apartment_repository = ApartmentRepository(db)
        self.activity_service = ApartmentActivityService(db)

    async def list_for_apartment(self, apartment_id: int) -> List[TechnicianVisit]:
        await self._ensure_apartment_exists(apartment_id)
        return await self.technician_visit_repository.list_by_apartment(apartment_id)

    async def create_visit(self, data: TechnicianVisitCreate) -> TechnicianVisit:
        """Register a technician entering an apartment and record a TECHNICIAN activity entry."""
        await self._ensure_apartment_exists(data.apartment_id)
        if not data.name or not data.name.strip():
            raise ValueError(BuildingReceptionErrorMessages.TECHNICIAN_NAME_REQUIRED)
        name = data.name.strip()
        role = (data.role or "").strip() or None
        visit = TechnicianVisit(
            apartment_id=data.apartment_id,
            name=name,
            role=role,
            phone=(data.phone or "").strip() or None,
            note=(data.note or "").strip() or None,
            status=TechnicianVisitStatus.INSIDE,
            entered_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        created = await self.technician_visit_repository.create(visit)
        activity_text = f"כניסת טכנאי: {name}"
        if role:
            activity_text += f" ({role})"
        await self.activity_service.record(
            data.apartment_id,
            ActivityKind.TECHNICIAN,
            activity_text,
        )
        return created

    async def mark_left(self, visit_id: int) -> TechnicianVisit:
        """Mark a technician as having left the apartment (status + left_at)."""
        visit = await self.technician_visit_repository.get(visit_id)
        if not visit:
            raise ValueError(
                BuildingReceptionErrorMessages.technician_visit_not_found_by_id(visit_id)
            )
        if visit.status == TechnicianVisitStatus.LEFT:
            raise ValueError(BuildingReceptionErrorMessages.TECHNICIAN_ALREADY_LEFT)
        visit.status = TechnicianVisitStatus.LEFT
        visit.left_at = datetime.now(timezone.utc).replace(tzinfo=None)
        updated = await self.technician_visit_repository.update(visit)
        await self.activity_service.record(
            visit.apartment_id,
            ActivityKind.TECHNICIAN,
            f"יציאת טכנאי: {visit.name}",
        )
        return updated

    async def update_visit(self, visit_id: int, data: TechnicianVisitUpdate) -> TechnicianVisit:
        """Edit a technician visit's name / role / phone / note / status."""
        visit = await self._get_visit(visit_id)
        update_data = data.model_dump(exclude_unset=True)
        if "name" in update_data and update_data["name"]:
            visit.name = update_data["name"].strip()
        if "role" in update_data:
            visit.role = (update_data["role"] or "").strip() or None
        if "phone" in update_data:
            visit.phone = (update_data["phone"] or "").strip() or None
        if "note" in update_data:
            visit.note = (update_data["note"] or "").strip() or None
        if "status" in update_data and update_data["status"]:
            visit.status = update_data["status"]
            if visit.status == TechnicianVisitStatus.LEFT and visit.left_at is None:
                visit.left_at = datetime.now(timezone.utc).replace(tzinfo=None)
        return await self.technician_visit_repository.update(visit)

    async def delete_visit(self, visit_id: int) -> None:
        """Remove a technician visit record from the desk."""
        await self.technician_visit_repository.delete(await self._get_visit(visit_id))

    async def _get_visit(self, visit_id: int) -> TechnicianVisit:
        visit = await self.technician_visit_repository.get(visit_id)
        if not visit:
            raise ValueError(
                BuildingReceptionErrorMessages.technician_visit_not_found_by_id(visit_id)
            )
        return visit

    # --- private helpers -----------------------------------------------

    async def _ensure_apartment_exists(self, apartment_id: int) -> None:
        apartment = await self.apartment_repository.get(apartment_id)
        if not apartment:
            raise ValueError(
                BuildingReceptionErrorMessages.apartment_not_found_by_id(apartment_id)
            )
