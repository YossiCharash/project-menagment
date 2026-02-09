from __future__ import annotations
from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.quote_structure_item import QuoteStructureItem


class QuoteStructureRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self, include_inactive: bool = False) -> List[QuoteStructureItem]:
        """List all quote structure items, optionally including inactive."""
        query = select(QuoteStructureItem).order_by(QuoteStructureItem.sort_order, QuoteStructureItem.name)
        if not include_inactive:
            query = query.where(QuoteStructureItem.is_active == True)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get(self, item_id: int) -> QuoteStructureItem | None:
        """Get quote structure item by ID."""
        result = await self.db.execute(
            select(QuoteStructureItem).where(QuoteStructureItem.id == item_id)
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> QuoteStructureItem | None:
        """Get quote structure item by exact name."""
        result = await self.db.execute(
            select(QuoteStructureItem).where(QuoteStructureItem.name == name).limit(1)
        )
        return result.scalar_one_or_none()

    async def create(self, item: QuoteStructureItem) -> QuoteStructureItem:
        """Create a new quote structure item."""
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def update(self, item: QuoteStructureItem) -> QuoteStructureItem:
        """Update an existing quote structure item."""
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def delete(self, item: QuoteStructureItem) -> None:
        """Delete a quote structure item."""
        await self.db.delete(item)
        await self.db.commit()
