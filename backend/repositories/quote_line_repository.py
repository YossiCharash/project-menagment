from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.models import QuoteLine, QuoteStructureItem


class QuoteLineRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_by_quote_project(self, quote_project_id: int) -> List[QuoteLine]:
        result = await self.db.execute(
            select(QuoteLine)
            .options(selectinload(QuoteLine.quote_structure_item))
            .where(QuoteLine.quote_project_id == quote_project_id)
            .order_by(QuoteLine.sort_order, QuoteLine.id)
        )
        return list(result.scalars().all())

    async def get(self, line_id: int) -> QuoteLine | None:
        result = await self.db.execute(
            select(QuoteLine)
            .options(selectinload(QuoteLine.quote_structure_item))
            .where(QuoteLine.id == line_id)
        )
        return result.scalar_one_or_none()

    async def create(self, line: QuoteLine) -> QuoteLine:
        self.db.add(line)
        await self.db.commit()
        await self.db.refresh(line)
        return line

    async def update(self, line: QuoteLine) -> QuoteLine:
        await self.db.commit()
        await self.db.refresh(line)
        return line

    async def delete(self, line: QuoteLine) -> None:
        await self.db.delete(line)
        await self.db.commit()

    async def delete_by_quote_project(self, quote_project_id: int) -> None:
        result = await self.db.execute(select(QuoteLine).where(QuoteLine.quote_project_id == quote_project_id))
        for line in result.scalars().all():
            await self.db.delete(line)
        await self.db.commit()
