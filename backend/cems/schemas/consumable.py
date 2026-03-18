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


class ConsumableItemRead(ConsumableItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    quantity: Decimal
    created_at: datetime
    updated_at: datetime


class ConsumeStockRequest(BaseModel):
    quantity: Decimal
    project_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class ConsumptionLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_id: uuid.UUID
    consumed_by_id: uuid.UUID
    project_id: Optional[uuid.UUID]
    quantity_consumed: Decimal
    consumed_at: datetime
    notes: Optional[str]
