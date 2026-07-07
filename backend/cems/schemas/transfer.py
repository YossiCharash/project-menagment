import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict
from sqlalchemy import inspect as sa_inspect

from backend.cems.models.transfer import ReturnStatus, TransferStatus


def _is_relationship_loaded(orm_obj, attribute_name: str) -> bool:
    """Return True iff the SQLAlchemy relationship is already eager-loaded.

    Accessing an unloaded relationship inside an async session triggers
    a synchronous lazy-load that raises ``MissingGreenlet``. This helper
    lets schemas safely skip the access when the data isn't there.
    """
    try:
        state = sa_inspect(orm_obj)
    except Exception:
        return False
    return attribute_name not in state.unloaded


class TransferCreate(BaseModel):
    asset_id: uuid.UUID
    to_user_id: int
    to_warehouse_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    # When True, the backend sends the recipient an email containing a
    # stateless JWT link they can click to confirm receipt without logging in.
    send_email_notification: bool = False


class TransferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    asset_id: uuid.UUID
    # Denormalised asset fields so the UI can render name + photo without a
    # separate lookup. Populated via the ORM relationship on the Transfer model.
    asset_name: Optional[str] = None
    asset_photo_url: Optional[str] = None
    asset_serial_number: Optional[str] = None
    # Nullable: originating employee is absent when the asset comes from a
    # warehouse with no prior custodian.
    from_user_id: Optional[int]
    to_user_id: int
    from_warehouse_id: Optional[uuid.UUID]
    to_warehouse_id: Optional[uuid.UUID]
    initiated_by_id: int
    initiated_at: datetime
    status: TransferStatus
    recipient_signature_id: Optional[uuid.UUID]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    # Set by the create endpoint when an email-confirmation link was dispatched.
    # Optional so existing callers (list/get) remain compatible.
    email_sent: Optional[bool] = None

    @classmethod
    def model_validate(cls, obj, **kwargs):  # type: ignore[override]
        instance = super().model_validate(obj, **kwargs)
        # Only touch the relationship if SQLAlchemy already eager-loaded it.
        # In async sessions, accessing an unloaded relationship raises
        # MissingGreenlet — callers that need the asset fields must use
        # selectinload(Transfer.asset) before passing to this validator.
        if _is_relationship_loaded(obj, "asset") and obj.asset is not None:
            instance.asset_name = obj.asset.name
            instance.asset_photo_url = obj.asset.photo_url
            instance.asset_serial_number = obj.asset.serial_number
        return instance


class CompleteTransferRequest(BaseModel):
    signature_hash: str
    ip_address: Optional[str] = None


# ---------- Public (no-auth) confirmation flow ----------

class TransferConfirmRead(BaseModel):
    """Read-model for the public confirmation preview page."""

    id: uuid.UUID
    asset_name: str
    asset_serial_number: Optional[str] = None
    from_user_name: Optional[str] = None
    to_user_name: str
    initiated_at: datetime
    status: TransferStatus
    notes: Optional[str] = None


class TransferConfirmResultRead(BaseModel):
    confirmed: bool
    asset_name: str


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
    returned_by_id: int
    warehouse_id: uuid.UUID
    return_warehouse_id: Optional[uuid.UUID]
    manager_id: Optional[int]
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
    requested_by_id: int
    approved_by_id: Optional[int]
    reason: str
    disposal_method: str
    what_happened: Optional[str] = None
    supplier_name: Optional[str] = None
    status: str
    requested_at: datetime
    approved_at: Optional[datetime]
    notes: Optional[str]


class ApproveRetirementRequest(BaseModel):
    notes: Optional[str] = None
