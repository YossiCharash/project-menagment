from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from backend.repositories.supplier_repository import SupplierRepository
from backend.models.supplier import Supplier
from backend.repositories.category_repository import CategoryRepository


class SupplierService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.supplier_repository = SupplierRepository(db)
        self.category_repository = CategoryRepository(db)

    async def _resolve_category(
        self,
        *,
        category_id: int | None = None,
        category_name: str | None = None,
        allow_missing: bool = True # Default to allowing missing/none for suppliers as category is optional
    ):
        category = None
        if category_id is not None:
            category = await self.category_repository.get(category_id)
            if not category and not allow_missing:
                raise ValueError("קטגוריה שנבחרה לא קיימת יותר במערכת.")
        elif category_name is not None:
            # Try to find by name
            category = await self.category_repository.get_by_name_global(category_name)
            
            # If provided string but not found, currently we just return None (optional category)
            # OR we could auto-create it if that's desired behavior?
            # For now, let's stick to matching existing categories or None
            
        if category and not category.is_active:
            raise ValueError(f"קטגוריה '{category.name}' לא פעילה. יש להפעיל את הקטגוריה בהגדרות.")
        
        return category

    async def create(self, **data) -> Supplier:
        # Resolve category
        category_id = data.get('category_id')
        category_name = data.get('category')
        
        # If category is string (name), try to resolve it
        resolved_category = await self._resolve_category(
            category_id=category_id, 
            category_name=category_name if isinstance(category_name, str) else None
        )
        
        # Update data with resolved id
        if resolved_category:
            data['category_id'] = resolved_category.id
        else:
            data['category_id'] = None
            
        # Remove string category from data if present to avoid init error
        if 'category' in data:
            del data['category']
            
        supplier = Supplier(**data)
        return await self.supplier_repository.create(supplier)

    async def update(self, supplier_id: int, **data) -> Supplier:
        supplier = await self.supplier_repository.get(supplier_id)
        if not supplier:
             return None

        # Resolve category if provided
        if 'category_id' in data or 'category' in data:
            category_id = data.get('category_id')
            category_name = data.get('category')
            
            resolved_category = await self._resolve_category(
                category_id=category_id,
                category_name=category_name if isinstance(category_name, str) else None
            )
            
            data['category_id'] = resolved_category.id if resolved_category else None
            
            # Cleanup
            if 'category' in data:
                del data['category']

        for k, v in data.items():
            setattr(supplier, k, v)
            
        return await self.supplier_repository.update(supplier)

