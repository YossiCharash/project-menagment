from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.models import Category


class CategoryRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

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
        """Get category by ID"""
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
            # If explicitly None, only match categories without parent
            query = query.where(Category.parent_id.is_(None))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_name_global(self, name: str) -> Category | None:
        """Get the first category with the given name, regardless of parent"""
        query = select(Category).where(Category.name == name).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, category: Category) -> Category:
        """Create a new category"""
        self.db.add(category)
        await self.db.commit()
        # Reload with children relationship eagerly loaded to avoid lazy loading issues
        # This ensures the children list is available for the response model
        result = await self.db.execute(
            select(Category)
            .options(selectinload(Category.children))
            .where(Category.id == category.id)
        )
        return result.scalar_one()

    async def update(self, category: Category) -> Category:
        """Update an existing category"""
        await self.db.commit()
        # Re-fetch with children loaded to support response model
        return await self.get(category.id)

    async def delete(self, category: Category) -> None:
        """Permanently delete a category"""
        await self.db.delete(category)
        await self.db.commit()

