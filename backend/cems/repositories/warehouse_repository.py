import uuid
from typing import List, Optional

from sqlalchemy import delete as sql_delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.cems.models.warehouse import ManagerHistory, Warehouse, WarehouseProject
from backend.cems.repositories.base_repository import BaseRepository


class WarehouseRepository(BaseRepository[Warehouse]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Warehouse, session)

    async def get_with_projects(self, warehouse_id: uuid.UUID) -> Optional[Warehouse]:
        stmt = (
            select(Warehouse)
            .options(selectinload(Warehouse.projects))
            .where(Warehouse.id == warehouse_id)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_manager(self, manager_id: uuid.UUID) -> Optional[Warehouse]:
        stmt = select(Warehouse).where(Warehouse.current_manager_id == manager_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def set_warehouse_projects(
        self, warehouse_id: uuid.UUID, project_ids: List[uuid.UUID]
    ) -> None:
        """Replace all project associations for a warehouse with the given project IDs."""
        await self._session.execute(
            sql_delete(WarehouseProject).where(WarehouseProject.warehouse_id == warehouse_id)
        )
        for pid in project_ids:
            self._session.add(WarehouseProject(warehouse_id=warehouse_id, project_id=pid))
        await self._session.flush()

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
