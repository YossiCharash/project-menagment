import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from backend.cems.models.transfer import ReturnStatus, TransferStatus


class TransferCreate(BaseModel):
    asset_id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    to_warehouse_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class TransferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    asset_id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    from_warehouse_id: Optional[uuid.UUID]
    to_warehouse_id: Optional[uuid.UUID]
    initiated_by_id: uuid.UUID
    initiated_at: datetime
    status: TransferStatus
    recipient_signature_id: Optional[uuid.UUID]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class CompleteTransferRequest(BaseModel):
    signature_hash: str
    ip_address: Optional[str] = None


class RejectTransferRequest(BaseModel):
    reason: str


# ---------- Warehouse Return ----------

class WarehouseReturnCreate(BaseModel):
    asset_id: uuid.UUID
    warehouse_id: uuid.UUID
    reason: Optional[str] = None


class WarehouseReturnRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    asset_id: uuid.UUID
    returned_by_id: uuid.UUID
    warehouse_id: uuid.UUID
    return_warehouse_id: Optional[uuid.UUID]
    manager_id: Optional[uuid.UUID]
    status: ReturnStatus
    manager_signature_id: Optional[uuid.UUID]
    return_reason: Optional[str]
    requested_at: datetime
    resolved_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class ApproveReturnRequest(BaseModel):
    return_warehouse_id: uuid.UUID
    signature_hash: str
    ip_address: Optional[str] = None


# ---------- Retirement ----------

class RetirementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    asset_id: uuid.UUID
    requested_by_id: uuid.UUID
    approved_by_id: Optional[uuid.UUID]
    reason: str
    disposal_method: str
    status: str
    requested_at: datetime
    approved_at: Optional[datetime]
    notes: Optional[str]


class ApproveRetirementRequest(BaseModel):
    notes: Optional[str] = None
