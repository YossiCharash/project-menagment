import uuid
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.cems.models.warehouse import Area, ManagerHistory, Warehouse
from backend.cems.repositories.base_repository import BaseRepository


class WarehouseRepository(BaseRepository[Warehouse]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Warehouse, session)

    async def get_with_areas(self, warehouse_id: uuid.UUID) -> Optional[Warehouse]:
        stmt = (
            select(Warehouse)
            .options(selectinload(Warehouse.areas))
            .where(Warehouse.id == warehouse_id)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_manager(self, manager_id: uuid.UUID) -> Optional[Warehouse]:
        stmt = select(Warehouse).where(Warehouse.current_manager_id == manager_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_area(self, data: dict) -> Area:
        area = Area(**data)
        self._session.add(area)
        await self._session.flush()
        return area

    async def get_area(self, area_id: uuid.UUID) -> Optional[Area]:
        return await self._session.get(Area, area_id)

    async def get_areas_by_warehouse(self, warehouse_id: uuid.UUID) -> List[Area]:
        stmt = select(Area).where(Area.warehouse_id == warehouse_id)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def create_manager_history(self, data: dict) -> ManagerHistory:
        entry = ManagerHistory(**data)
        self._session.add(entry)
        await self._session.flush()
        return entry

    async def get_manager_history(
        self, warehouse_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> List[ManagerHistory]:
        stmt = (
            select(ManagerHistory)
            .where(ManagerHistory.warehouse_id == warehouse_id)
            .order_by(ManagerHistory.changed_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
