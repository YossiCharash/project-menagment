import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from backend.cems.models.fixed_asset import AssetStatus


class FixedAssetBase(BaseModel):
    name: str
    serial_number: str
    category_id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    notes: Optional[str] = None


class FixedAssetCreate(FixedAssetBase):
    current_custodian_id: Optional[uuid.UUID] = None
    current_warehouse_id: Optional[uuid.UUID] = None
    status: AssetStatus = AssetStatus.ACTIVE


class FixedAssetUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    notes: Optional[str] = None


class FixedAssetRead(FixedAssetBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: AssetStatus
    current_custodian_id: Optional[uuid.UUID]
    current_warehouse_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime


class AssetHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    asset_id: uuid.UUID
    action: str
    actor_id: uuid.UUID
    from_custodian_id: Optional[uuid.UUID]
    to_custodian_id: Optional[uuid.UUID]
    from_warehouse_id: Optional[uuid.UUID]
    to_warehouse_id: Optional[uuid.UUID]
    notes: Optional[str]
    timestamp: datetime


class RetireAssetRequest(BaseModel):
    reason: str
    disposal_method: str
