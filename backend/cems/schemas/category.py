import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AssetCategoryBase(BaseModel):
    name: str
    description: Optional[str] = None


class AssetCategoryCreate(AssetCategoryBase):
    pass


class AssetCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class AssetCategoryRead(AssetCategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
