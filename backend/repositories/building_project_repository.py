from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.models.building_project import BuildingProject
from backend.models.building import Building


class BuildingProjectRepository:
    """Data access for reception-desk projects (פרויקטים) grouping buildings."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, project_id: int) -> BuildingProject | None:
        # Eager-load buildings AND their apartments so the project serializer's
        # per-building apartment counts don't trigger async lazy IO.
        result = await self.db.execute(
            select(BuildingProject)
            .options(selectinload(BuildingProject.buildings).selectinload(Building.apartments))
            .where(BuildingProject.id == project_id)
        )
        return result.scalar_one_or_none()

    async def list(self) -> List[BuildingProject]:
        result = await self.db.execute(
            select(BuildingProject)
            .options(selectinload(BuildingProject.buildings).selectinload(Building.apartments))
            .order_by(BuildingProject.name, BuildingProject.id)
        )
        return list(result.scalars().all())

    async def create(self, project: BuildingProject) -> BuildingProject:
        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def update(self, project: BuildingProject) -> BuildingProject:
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def delete(self, project: BuildingProject) -> None:
        await self.db.delete(project)
        await self.db.commit()
