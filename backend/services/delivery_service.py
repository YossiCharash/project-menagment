from __future__ import annotations
from datetime import datetime, timezone
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.delivery import Delivery, DeliveryStatus
from backend.models.apartment_activity import ActivityKind
from backend.repositories.delivery_repository import DeliveryRepository
from backend.repositories.apartment_repository import ApartmentRepository
from backend.services.apartment_activity_service import ApartmentActivityService
from backend.schemas.delivery import DeliveryCreate, DeliveryUpdate
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


class DeliveryService:
    """Business logic for deliveries/packages (משלוחים) held at the desk."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.delivery_repository = DeliveryRepository(db)
        self.apartment_repository = ApartmentRepository(db)
        self.activity_service = ApartmentActivityService(db)

    async def list_for_apartment(self, apartment_id: int) -> List[Delivery]:
        await self._ensure_apartment_exists(apartment_id)
        return await self.delivery_repository.list_by_apartment(apartment_id)

    async def create_delivery(self, data: DeliveryCreate) -> Delivery:
        """Register a new package and record a DELIVERY activity entry."""
        await self._ensure_apartment_exists(data.apartment_id)
        if not data.title or not data.title.strip():
            raise ValueError(BuildingReceptionErrorMessages.DELIVERY_TITLE_REQUIRED)
        delivery = Delivery(
            apartment_id=data.apartment_id,
            title=data.title.strip(),
            kind=(data.kind or "").strip() or None,
            meta=(data.meta or "").strip() or None,
            status=DeliveryStatus.PENDING,
        )
        created = await self.delivery_repository.create(delivery)
        await self.activity_service.record(
            data.apartment_id,
            ActivityKind.DELIVERY,
            f"התקבל משלוח: {created.title}",
        )
        return created

    async def mark_delivered(self, delivery_id: int) -> Delivery:
        """Mark a pending package as handed to the resident (status + received_at)."""
        delivery = await self.delivery_repository.get(delivery_id)
        if not delivery:
            raise ValueError(
                BuildingReceptionErrorMessages.delivery_not_found_by_id(delivery_id)
            )
        if delivery.status == DeliveryStatus.DELIVERED:
            raise ValueError(BuildingReceptionErrorMessages.DELIVERY_ALREADY_DELIVERED)
        delivery.status = DeliveryStatus.DELIVERED
        delivery.received_at = datetime.now(timezone.utc).replace(tzinfo=None)
        return await self.delivery_repository.update(delivery)

    async def update_delivery(self, delivery_id: int, data: DeliveryUpdate) -> Delivery:
        """Edit a delivery's title / kind / details / status."""
        delivery = await self._get_delivery(delivery_id)
        update_data = data.model_dump(exclude_unset=True)
        if "title" in update_data and update_data["title"]:
            delivery.title = update_data["title"].strip()
        if "kind" in update_data:
            delivery.kind = (update_data["kind"] or "").strip() or None
        if "meta" in update_data:
            delivery.meta = (update_data["meta"] or "").strip() or None
        if "status" in update_data and update_data["status"]:
            delivery.status = update_data["status"]
            if delivery.status == DeliveryStatus.DELIVERED and delivery.received_at is None:
                delivery.received_at = datetime.now(timezone.utc).replace(tzinfo=None)
        return await self.delivery_repository.update(delivery)

    async def delete_delivery(self, delivery_id: int) -> None:
        """Remove a delivery record from the desk."""
        await self.delivery_repository.delete(await self._get_delivery(delivery_id))

    async def _get_delivery(self, delivery_id: int) -> Delivery:
        delivery = await self.delivery_repository.get(delivery_id)
        if not delivery:
            raise ValueError(
                BuildingReceptionErrorMessages.delivery_not_found_by_id(delivery_id)
            )
        return delivery

    # --- private helpers -----------------------------------------------

    async def _ensure_apartment_exists(self, apartment_id: int) -> None:
        apartment = await self.apartment_repository.get(apartment_id)
        if not apartment:
            raise ValueError(
                BuildingReceptionErrorMessages.apartment_not_found_by_id(apartment_id)
            )
