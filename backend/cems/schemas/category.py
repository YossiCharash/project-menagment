import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AssetCategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    warehouse_id: Optional[uuid.UUID] = None


class AssetCategoryCreate(AssetCategoryBase):
    pass


class AssetCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    warehouse_id: Optional[uuid.UUID] = None


class AssetCategoryRead(AssetCategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    warehouse_name: Optional[str] = None

    @classmethod
    def from_orm_with_warehouse(cls, obj: object) -> "AssetCategoryRead":
        """Build a read schema from an ORM instance, populating warehouse_name
        from the eagerly loaded ``warehouse`` relationship."""
        data = cls.model_validate(obj)
        warehouse = getattr(obj, "warehouse", None)
        if warehouse is not None:
            data.warehouse_name = warehouse.name
        return data
