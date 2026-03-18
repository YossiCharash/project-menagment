import uuid
from decimal import Decimal
from typing import List, Optional

from backend.cems.models.base import _utc_now
from backend.cems.models.consumable import AlertType, ConsumableItem, StockAlert
from backend.cems.repositories.consumable_repository import ConsumableRepository


class AlertService:
    """Manages stock-level alerts for consumable items."""

    def __init__(self, consumable_repo: ConsumableRepository) -> None:
        self._consumable_repo = consumable_repo

    async def get_inventory_alerts(
        self, warehouse_id: Optional[uuid.UUID] = None
    ) -> List[StockAlert]:
        """Return all unresolved alerts.

        If *warehouse_id* is provided, filters items belonging to that
        warehouse.  For simplicity the current implementation returns
        all unresolved alerts; warehouse-level filtering is handled
        at the API layer query level.
        """
        return await self._consumable_repo.get_unresolved_alerts()

    async def check_and_create_alerts(
        self, item: ConsumableItem
    ) -> Optional[StockAlert]:
        """Create a StockAlert if quantity has crossed the threshold
        and no unresolved alert exists for this item already."""

        if item.quantity > item.low_stock_threshold:
            return None

        # Guard: do not duplicate alerts
        existing = await self._consumable_repo.get_unresolved_alerts(item_id=item.id)
        if existing:
            return None

        alert_type = (
            AlertType.OUT_OF_STOCK
            if item.quantity <= Decimal("0")
            else AlertType.LOW_STOCK
        )

        return await self._consumable_repo.create_alert(
            {
                "item_id": item.id,
                "alert_type": alert_type,
                "quantity_at_alert": item.quantity,
            }
        )

    async def resolve_alert(
        self, alert_id: uuid.UUID, resolved_by_id: uuid.UUID
    ) -> StockAlert:
        alert = await self._consumable_repo.get_alert_by_id(alert_id)
        if alert is None:
            from fastapi import HTTPException, status as http_status

            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail="Alert not found.",
            )

        alert.resolved = True
        alert.resolved_at = _utc_now()
        await self._consumable_repo._session.flush()
        return alert
