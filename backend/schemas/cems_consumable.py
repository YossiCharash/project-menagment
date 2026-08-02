import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ConsumableItemBase(BaseModel):
    name: str
    category_id: uuid.UUID
    warehouse_id: uuid.UUID
    unit: str
    low_stock_threshold: Decimal = Decimal("0")
    reorder_quantity: Decimal = Decimal("0")
    unit_price: Optional[Decimal] = None
    image_url: Optional[str] = None


class ConsumableItemCreate(ConsumableItemBase):
    quantity: Decimal = Decimal("0")


class ConsumableItemUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    warehouse_id: Optional[uuid.UUID] = None
    unit: Optional[str] = None
    low_stock_threshold: Optional[Decimal] = None
    reorder_quantity: Optional[Decimal] = None
    quantity: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    image_url: Optional[str] = None


class ConsumableItemRead(ConsumableItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    quantity: Decimal
    created_at: datetime
    updated_at: datetime


class ConsumeStockRequest(BaseModel):
    quantity: Decimal
    project_id: Optional[int] = None  # FK → projects.id (main-system project, integer)
    notes: Optional[str] = None


class ConsumptionLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_id: uuid.UUID
    consumed_by_id: int                      # FK → users.id (integer)
    consumed_by_name: Optional[str] = None   # resolved User.full_name
    project_id: Optional[int]                # FK → projects.id (main-system project, integer)
    project_name: Optional[str] = None       # resolved Project.name
    quantity_consumed: Decimal
    consumed_at: datetime
    notes: Optional[str]


class ConsumableMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_id: uuid.UUID
    from_warehouse_id: Optional[uuid.UUID]
    to_warehouse_id: Optional[uuid.UUID]
    quantity: Decimal
    action: str
    actor_id: Optional[int]
    notes: Optional[str]
    moved_at: datetime
