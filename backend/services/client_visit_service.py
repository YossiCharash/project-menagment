from __future__ import annotations
from datetime import datetime, timezone
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.client_visit import ClientVisit, ClientVisitStatus
from backend.models.apartment_activity import ActivityKind
from backend.repositories.client_visit_repository import ClientVisitRepository
from backend.repositories.apartment_repository import ApartmentRepository
from backend.services.apartment_activity_service import ApartmentActivityService
from backend.schemas.client_visit import ClientVisitCreate, ClientVisitUpdate
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


def _to_naive_utc(value: datetime | None) -> datetime | None:
    """Normalise an incoming datetime to naive UTC (the desk's storage convention).

    Timezone-aware values (e.g. an ISO string carrying ``Z``) are converted to
    UTC and stripped of tzinfo; naive values are assumed to already be UTC.
    """
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


class ClientVisitService:
    """Business logic for client arrivals (הגעות לקוחות) at the desk.

    Owns both the manual lifecycle (register / immediate-exit / edit / delete)
    and the automatic expiry pass that turns an apartment vacant once a visit's
    ``expected_until`` has passed.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.client_visit_repository = ClientVisitRepository(db)
        self.apartment_repository = ApartmentRepository(db)
        self.activity_service = ApartmentActivityService(db)

    async def list_for_apartment(self, apartment_id: int) -> List[ClientVisit]:
        await self._ensure_apartment_exists(apartment_id)
        return await self.client_visit_repository.list_by_apartment(apartment_id)

    async def create_visit(self, data: ClientVisitCreate) -> ClientVisit:
        """Register a client arriving at an apartment and record a CLIENT activity."""
        await self._ensure_apartment_exists(data.apartment_id)
        if data.arrived_at is None:
            raise ValueError(BuildingReceptionErrorMessages.CLIENT_ARRIVAL_REQUIRED)
        name = (data.name or "").strip() or None
        visit = ClientVisit(
            apartment_id=data.apartment_id,
            name=name,
            arrived_at=_to_naive_utc(data.arrived_at),
            expected_until=_to_naive_utc(data.expected_until),
            note=(data.note or "").strip() or None,
            status=ClientVisitStatus.PRESENT,
        )
        created = await self.client_visit_repository.create(visit)
        await self.activity_service.record(
            data.apartment_id,
            ActivityKind.CLIENT,
            f"הגעת לקוח: {name}" if name else "הגעת לקוח",
        )
        return created

    async def mark_left(self, visit_id: int) -> ClientVisit:
        """Immediate exit (יציאה מיידית): mark the client as having left now."""
        visit = await self._get_visit(visit_id)
        if visit.status == ClientVisitStatus.LEFT:
            raise ValueError(BuildingReceptionErrorMessages.CLIENT_ALREADY_LEFT)
        visit.status = ClientVisitStatus.LEFT
        visit.left_at = datetime.now(timezone.utc).replace(tzinfo=None)
        updated = await self.client_visit_repository.update(visit)
        await self._record_departure(visit)
        return updated

    async def update_visit(self, visit_id: int, data: ClientVisitUpdate) -> ClientVisit:
        """Edit a client arrival's name / times / note / status."""
        visit = await self._get_visit(visit_id)
        update_data = data.model_dump(exclude_unset=True)
        if "name" in update_data:
            visit.name = (update_data["name"] or "").strip() or None
        if "arrived_at" in update_data and update_data["arrived_at"] is not None:
            visit.arrived_at = _to_naive_utc(update_data["arrived_at"])
        if "expected_until" in update_data:
            visit.expected_until = _to_naive_utc(update_data["expected_until"])
        if "note" in update_data:
            visit.note = (update_data["note"] or "").strip() or None
        if "status" in update_data and update_data["status"]:
            visit.status = update_data["status"]
            if visit.status == ClientVisitStatus.LEFT and visit.left_at is None:
                visit.left_at = datetime.now(timezone.utc).replace(tzinfo=None)
        return await self.client_visit_repository.update(visit)

    async def delete_visit(self, visit_id: int) -> None:
        """Remove a client-arrival record from the desk."""
        await self.client_visit_repository.delete(await self._get_visit(visit_id))

    async def expire_due_visits(self, apartment_ids: List[int] | None = None) -> int:
        """Auto-flip every active visit whose ``expected_until`` has passed.

        The single source of the auto-vacancy behaviour: once a visit's end
        time is reached it becomes ``left`` and the apartment reads פנויה. Runs
        from both the on-read reconcile (scoped to an apartment/building) and
        the background scheduler (``apartment_ids=None`` → all apartments).
        Returns the number of visits expired.
        """
        due_visits = await self.client_visit_repository.list_due(apartment_ids)
        for visit in due_visits:
            visit.status = ClientVisitStatus.LEFT
            visit.left_at = visit.expected_until
            await self.client_visit_repository.update(visit)
            await self._record_departure(visit, automatic=True)
        return len(due_visits)

    # --- private helpers -----------------------------------------------

    async def _record_departure(self, visit: ClientVisit, automatic: bool = False) -> None:
        base = "סיום הגעת לקוח אוטומטי" if automatic else "יציאת לקוח"
        text = f"{base}: {visit.name}" if visit.name else base
        await self.activity_service.record(visit.apartment_id, ActivityKind.CLIENT, text)

    async def _get_visit(self, visit_id: int) -> ClientVisit:
        visit = await self.client_visit_repository.get(visit_id)
        if not visit:
            raise ValueError(
                BuildingReceptionErrorMessages.client_visit_not_found_by_id(visit_id)
            )
        return visit

    async def _ensure_apartment_exists(self, apartment_id: int) -> None:
        apartment = await self.apartment_repository.get(apartment_id)
        if not apartment:
            raise ValueError(
                BuildingReceptionErrorMessages.apartment_not_found_by_id(apartment_id)
            )
