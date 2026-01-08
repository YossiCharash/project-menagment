from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.project import Project


class ProjectRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, project_id: int) -> Project | None:
        res = await self.db.execute(select(Project).where(Project.id == project_id))
        return res.scalar_one_or_none()

    async def create(self, project: Project) -> Project:
        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def update(self, project: Project) -> Project:
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def delete(self, project: Project) -> None:
        await self.db.delete(project)
        await self.db.commit()

    async def list(self, include_archived: bool = False, only_archived: bool = False) -> list[Project]:
        stmt = select(Project)
        if only_archived:
            stmt = stmt.where(Project.is_active == False)  # noqa: E712
        elif not include_archived:
            stmt = stmt.where(Project.is_active == True)  # noqa: E712
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def archive(self, project: Project) -> Project:
        project.is_active = False
        return await self.update(project)

    async def restore(self, project: Project) -> Project:
        project.is_active = True
        return await self.update(project)

    async def get_payments_of_monthly_tenants(self, project_id):
        res = await self.db.execute(
            select(func.sum(Project.budget_monthly)).where(Project.id == project_id)
        )
        return res.scalar() or 0.0

    async def get_subprojects(self, project_id: int):
        """Get all subprojects for a given parent project"""
        stmt = select(Project).where(Project.relation_project == project_id, Project.is_active == True)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())
