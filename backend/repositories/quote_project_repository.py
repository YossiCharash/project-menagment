from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from backend.models import QuoteProject, QuoteLine, QuoteStructureItem, QuoteBuilding, QuoteApartment


class QuoteProjectRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(
        self,
        parent_id: int | None = None,
        project_id: int | None = None,
        status: str | None = None,
    ) -> List[QuoteProject]:
        query = select(QuoteProject).options(
            selectinload(QuoteProject.quote_lines).selectinload(QuoteLine.quote_structure_item),
            selectinload(QuoteProject.quote_buildings).selectinload(QuoteBuilding.quote_lines).selectinload(QuoteLine.quote_structure_item),
            selectinload(QuoteProject.quote_buildings).selectinload(QuoteBuilding.quote_apartments),
            selectinload(QuoteProject.children),
        )
        if project_id is not None:
            query = query.where(QuoteProject.project_id == project_id)
        elif parent_id is not None:
            query = query.where(QuoteProject.parent_id == parent_id)
        else:
            query = query.where(QuoteProject.parent_id.is_(None), QuoteProject.project_id.is_(None))
        if status:
            query = query.where(QuoteProject.status == status)
        query = query.order_by(QuoteProject.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get(self, quote_project_id: int) -> QuoteProject | None:
        result = await self.db.execute(
            select(QuoteProject)
            .options(
                selectinload(QuoteProject.quote_lines).selectinload(QuoteLine.quote_structure_item),
                selectinload(QuoteProject.quote_buildings).selectinload(QuoteBuilding.quote_lines).selectinload(QuoteLine.quote_structure_item),
                selectinload(QuoteProject.quote_buildings).selectinload(QuoteBuilding.quote_apartments),
                selectinload(QuoteProject.children),
                selectinload(QuoteProject.parent),
            )
            .where(QuoteProject.id == quote_project_id)
        )
        return result.scalar_one_or_none()

    async def get_by_converted_project_id(self, project_id: int) -> QuoteProject | None:
        """Get the quote project that was converted to this project (accepted quote)."""
        result = await self.db.execute(
            select(QuoteProject).where(QuoteProject.converted_project_id == project_id)
        )
        return result.scalar_one_or_none()

    async def get_children_count(self, quote_project_id: int) -> int:
        result = await self.db.execute(
            select(func.count(QuoteProject.id)).where(QuoteProject.parent_id == quote_project_id)
        )
        return result.scalar_one() or 0

    async def create(self, qp: QuoteProject) -> QuoteProject:
        self.db.add(qp)
        await self.db.commit()
        await self.db.refresh(qp)
        return qp

    async def update(self, qp: QuoteProject) -> QuoteProject:
        await self.db.flush()
        await self.db.refresh(qp)
        return qp

    async def delete(self, qp: QuoteProject) -> None:
        await self.db.delete(qp)
        await self.db.commit()
