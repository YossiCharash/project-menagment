from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from backend.models import Category
from backend.models.transaction import Transaction
from backend.models.recurring_transaction import RecurringTransactionTemplate
from backend.repositories.base import BaseRepository


class CategoryRepository(BaseRepository[Category]):
    model = Category

    async def list(self, include_inactive: bool = False) -> List[Category]:
        """List all categories, optionally including inactive ones"""
        query = select(Category).options(selectinload(Category.children))
        if not include_inactive:
            query = query.where(Category.is_active == True)
        query = query.order_by(Category.parent_id.nulls_first(), Category.name)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def list_tree(self, include_inactive: bool = False) -> List[Category]:
        """List categories as a tree structure (only top-level parents)"""
        query = select(Category).where(Category.parent_id.is_(None)).options(selectinload(Category.children))
        if not include_inactive:
            query = query.where(Category.is_active == True)
        query = query.order_by(Category.name)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get(self, category_id: int) -> Category | None:
        """Get category by ID with children eagerly loaded"""
        result = await self.db.execute(
            select(Category)
            .options(selectinload(Category.children))
            .where(Category.id == category_id)
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str, parent_id: int | None = None) -> Category | None:
        """Get category by name, optionally filtered by parent"""
        query = select(Category).where(Category.name == name)
        if parent_id is not None:
            query = query.where(Category.parent_id == parent_id)
        elif parent_id is None:
            query = query.where(Category.parent_id.is_(None))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_name_global(self, name: str) -> Category | None:
        """Get the first category with the given name, regardless of parent"""
        query = select(Category).where(Category.name == name).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, entity: Category) -> Category:
        """Create a new category and reload with children"""
        self.db.add(entity)
        await self.db.commit()
        result = await self.db.execute(
            select(Category)
            .options(selectinload(Category.children))
            .where(Category.id == entity.id)
        )
        return result.scalar_one()

    async def update(self, entity: Category) -> Category:
        """Update an existing category"""
        await self.db.commit()
        return await self.get(entity.id)

    async def count_transactions_referencing_category(self, category_id: int) -> int:
        """Count transactions whose ``category_id`` equals the given id."""
        query = select(func.count(Transaction.id)).where(
            Transaction.category_id == category_id
        )
        result = await self.db.execute(query)
        return int(result.scalar_one() or 0)

    async def count_recurring_templates_referencing_category(self, category_id: int) -> int:
        """Count recurring-transaction templates whose ``category_id`` equals the given id."""
        query = select(func.count(RecurringTransactionTemplate.id)).where(
            RecurringTransactionTemplate.category_id == category_id
        )
        result = await self.db.execute(query)
        return int(result.scalar_one() or 0)
