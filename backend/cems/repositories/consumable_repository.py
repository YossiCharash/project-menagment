import uuid
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.models.consumable import ConsumableItem, ConsumptionLog, StockAlert
from backend.cems.repositories.base_repository import BaseRepository


class ConsumableRepository(BaseRepository[ConsumableItem]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(ConsumableItem, session)

    async def get_by_warehouse(self, warehouse_id: uuid.UUID) -> List[ConsumableItem]:
        stmt = select(ConsumableItem).where(ConsumableItem.warehouse_id == warehouse_id)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_low_stock_items(self) -> List[ConsumableItem]:
        stmt = select(ConsumableItem).where(
            ConsumableItem.quantity <= ConsumableItem.low_stock_threshold
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def adjust_quantity(self, item_id: uuid.UUID, delta: Decimal) -> Optional[ConsumableItem]:
        """Atomically adjust quantity using an UPDATE statement."""
        stmt = (
            update(ConsumableItem)
            .where(ConsumableItem.id == item_id)
            .values(quantity=ConsumableItem.quantity + delta)
            .returning(ConsumableItem.id)
        )
        result = await self._session.execute(stmt)
        row = result.first()
        if row is None:
            return None
        await self._session.flush()
        return await self.get_by_id(item_id)

    async def create_consumption_log(self, data: dict) -> ConsumptionLog:
        log = ConsumptionLog(**data)
        self._session.add(log)
        await self._session.flush()
        return log

    async def get_consumption_history(
        self, item_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> List[ConsumptionLog]:
        stmt = (
            select(ConsumptionLog)
            .where(ConsumptionLog.item_id == item_id)
            .order_by(ConsumptionLog.consumed_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def create_alert(self, data: dict) -> StockAlert:
        alert = StockAlert(**data)
        self._session.add(alert)
        await self._session.flush()
        return alert

    async def get_unresolved_alerts(
        self, item_id: Optional[uuid.UUID] = None
    ) -> List[StockAlert]:
        stmt = select(StockAlert).where(StockAlert.resolved.is_(False))
        if item_id is not None:
            stmt = stmt.where(StockAlert.item_id == item_id)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_alert_by_id(self, alert_id: uuid.UUID) -> Optional[StockAlert]:
        return await self._session.get(StockAlert, alert_id)
