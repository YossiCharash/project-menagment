import uuid
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status

from backend.cems.models.consumable import AlertType, ConsumableItem, ConsumptionLog, StockAlert
from backend.cems.repositories.consumable_repository import ConsumableRepository
from backend.cems.services.alert_service import AlertService


class ConsumptionService:
    """Handles stock consumption and triggers low-stock alerts."""

    def __init__(
        self,
        consumable_repo: ConsumableRepository,
        alert_service: AlertService,
    ) -> None:
        self._consumable_repo = consumable_repo
        self._alert_service = alert_service

    async def consume_stock(
        self,
        item_id: uuid.UUID,
        consumer_id: uuid.UUID,
        quantity: Decimal,
        project_id: Optional[uuid.UUID] = None,
        notes: Optional[str] = None,
    ) -> ConsumptionLog:
        if quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quantity must be positive.",
            )

        item = await self._consumable_repo.get_by_id(item_id)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Consumable item not found.",
            )

        if item.quantity < quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Insufficient stock. Available: {item.quantity}, requested: {quantity}.",
            )

        # Atomic quantity reduction
        updated_item = await self._consumable_repo.adjust_quantity(item_id, -quantity)

        log = await self._consumable_repo.create_consumption_log(
            {
                "item_id": item_id,
                "consumed_by_id": consumer_id,
                "project_id": project_id,
                "quantity_consumed": quantity,
                "notes": notes,
            }
        )

        # Check alert threshold after consumption
        if updated_item is not None:
            await self._alert_service.check_and_create_alerts(updated_item)

        return log
