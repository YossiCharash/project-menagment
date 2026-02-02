from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models import QuoteStructureItem


class QuoteStructureRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self, include_inactive: bool = False) -> List[QuoteStructureItem]:
        query = select(QuoteStructureItem)
        if not include_inactive:
            query = query.where(QuoteStructureItem.is_active == True)
        query = query.order_by(QuoteStructureItem.sort_order, QuoteStructureItem.name)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get(self, item_id: int) -> QuoteStructureItem | None:
        result = await self.db.execute(select(QuoteStructureItem).where(QuoteStructureItem.id == item_id))
        return result.scalar_one_or_none()

    async def create(self, item: QuoteStructureItem) -> QuoteStructureItem:
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def update(self, item: QuoteStructureItem) -> QuoteStructureItem:
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def delete(self, item: QuoteStructureItem) -> None:
        await self.db.delete(item)
        await self.db.commit()
