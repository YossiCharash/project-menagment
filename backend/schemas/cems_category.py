from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class AssetCategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    warehouse_id: Optional[uuid.UUID] = None
    parent_id: Optional[uuid.UUID] = None


class AssetCategoryCreate(AssetCategoryBase):
    pass


class AssetCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    warehouse_id: Optional[uuid.UUID] = None
    parent_id: Optional[uuid.UUID] = None
    position: Optional[int] = None


class AssetCategoryRead(AssetCategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    image_url: Optional[str] = None
    position: int = 0
    created_at: datetime
    updated_at: datetime
    warehouse_name: Optional[str] = None
    children_count: int = 0
    items_count: int = 0

    @classmethod
    def from_orm_with_warehouse(
        cls,
        obj: object,
        *,
        children_count: int = 0,
        items_count: int = 0,
    ) -> AssetCategoryRead:
        """Build a read schema from an ORM instance, populating warehouse_name
        from the eagerly loaded ``warehouse`` relationship."""
        data = cls.model_validate(obj)
        warehouse = getattr(obj, "warehouse", None)
        if warehouse is not None:
            data.warehouse_name = warehouse.name
        data.children_count = children_count
        data.items_count = items_count
        return data


class AssetCategoryTreeNode(BaseModel):
    """Recursive schema representing a single node in the category tree."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    position: int = 0
    parent_id: Optional[uuid.UUID] = None
    children_count: int = 0
    items_count: int = 0
    children: list[AssetCategoryTreeNode] = []


class CategoryItemRead(BaseModel):
    """Unified schema for items (assets or consumables) belonging to a category."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: Literal["asset", "consumable"]
    status: Optional[str] = None
    quantity: Optional[str] = None
    unit: Optional[str] = None
    photo_url: Optional[str] = None
    warehouse_name: Optional[str] = None
