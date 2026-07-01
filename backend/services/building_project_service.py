from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.building_project import BuildingProject
from backend.repositories.building_project_repository import BuildingProjectRepository
from backend.schemas.building_project import BuildingProjectCreate, BuildingProjectUpdate
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


class BuildingProjectService:
    """Business logic for reception-desk projects (פרויקטים) grouping buildings."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.project_repository = BuildingProjectRepository(db)

    async def get_project(self, project_id: int) -> BuildingProject:
        project = await self.project_repository.get(project_id)
        if not project:
            raise ValueError(
                BuildingReceptionErrorMessages.project_not_found_by_id(project_id)
            )
        return project

    async def list_projects(self) -> List[BuildingProject]:
        return await self.project_repository.list()

    async def create_project(self, data: BuildingProjectCreate) -> BuildingProject:
        if not data.name or not data.name.strip():
            raise ValueError(BuildingReceptionErrorMessages.PROJECT_NAME_REQUIRED)
        project = BuildingProject(
            name=data.name.strip(),
            description=(data.description or "").strip() or None,
        )
        created = await self.project_repository.create(project)
        # Re-fetch with buildings eager-loaded so serialization of the (empty)
        # buildings list does not trigger async lazy IO.
        return await self.project_repository.get(created.id)

    async def update_project(self, project_id: int, data: BuildingProjectUpdate) -> BuildingProject:
        project = await self.get_project(project_id)
        update_data = data.model_dump(exclude_unset=True)
        if "name" in update_data and update_data["name"]:
            project.name = update_data["name"].strip()
        if "description" in update_data:
            project.description = (update_data["description"] or "").strip() or None
        await self.project_repository.update(project)
        return await self.project_repository.get(project_id)

    async def delete_project(self, project_id: int) -> None:
        """Delete a project; its buildings are detached (project_id set to NULL)."""
        project = await self.get_project(project_id)
        for building in project.buildings:
            building.project_id = None
        await self.project_repository.delete(project)
