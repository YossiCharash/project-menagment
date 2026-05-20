import uuid
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.cems_consumable import ConsumableItem, ConsumptionLog, StockAlert
from backend.models.cems_consumable_movement import ConsumableMovementLog
from backend.repositories.cems_base_repository import BaseRepository


class ConsumableRepository(BaseRepository[ConsumableItem]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(ConsumableItem, session)

    async def get_filtered(
        self,
        warehouse_id: Optional[uuid.UUID] = None,
        category_id: Optional[uuid.UUID] = None,
        low_stock_only: bool = False,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[ConsumableItem]:
        """Return consumable items matching all supplied filters simultaneously.

        Each non-None parameter narrows the result set (AND semantics).
        When low_stock_only is True, only items at or below their threshold are returned.
        """
        stmt = select(ConsumableItem)

        if warehouse_id is not None:
            stmt = stmt.where(ConsumableItem.warehouse_id == warehouse_id)
        if category_id is not None:
            stmt = stmt.where(ConsumableItem.category_id == category_id)
        if low_stock_only:
            stmt = stmt.where(
                ConsumableItem.quantity <= ConsumableItem.low_stock_threshold
            )
        if search:
            stmt = stmt.where(ConsumableItem.name.ilike(f"%{search}%"))

        stmt = stmt.order_by(ConsumableItem.name.asc()).offset(skip).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

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

    async def create_movement_log(self, data: dict) -> ConsumableMovementLog:
        log = ConsumableMovementLog(**data)
        self._session.add(log)
        await self._session.flush()
        return log

    async def get_movement_history(
        self, item_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> List[ConsumableMovementLog]:
        stmt = (
            select(ConsumableMovementLog)
            .where(ConsumableMovementLog.item_id == item_id)
            .order_by(ConsumableMovementLog.moved_at.desc())
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

    async def find_matching_in_warehouse(
        self,
        warehouse_id: uuid.UUID,
        name: str,
        category_id: uuid.UUID,
    ) -> Optional[ConsumableItem]:
        """Return an existing item in *warehouse_id* that shares the same name and category."""
        stmt = select(ConsumableItem).where(
            ConsumableItem.warehouse_id == warehouse_id,
            ConsumableItem.name == name,
            ConsumableItem.category_id == category_id,
        )
        result = await self._session.execute(stmt)
        return result.scalars().first()
