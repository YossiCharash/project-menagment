"""Reorder request endpoints for the CEMS consumable inventory module."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.v1.cems_deps import (
    get_current_user,
    get_db,
    require_admin_or_manager,
    require_any_cems_role,
)
from backend.core.exceptions.cems import (
    ConsumableItemNotFoundError,
    NonPositiveQuantityError,
    ReorderAlreadyCancelledError,
    ReorderAlreadyReceivedError,
    ReorderInvalidTransitionError,
    ReorderNotFoundError,
)
from backend.messages.cems import reorder_messages
from backend.models.cems_base import _utc_now
from backend.models.cems_consumable import ConsumableItem
from backend.models.cems_reorder import ReorderRequest, ReorderStatus
from backend.models.user import User


class ReorderRequestCreate(BaseModel):
    item_id: uuid.UUID
    quantity_requested: Decimal
    supplier: Optional[str] = None
    notes: Optional[str] = None


class MarkOrderedPayload(BaseModel):
    supplier: Optional[str] = None
    notes: Optional[str] = None


class MarkReceivedPayload(BaseModel):
    quantity_received: Decimal
    notes: Optional[str] = None


class ReorderRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_id: uuid.UUID
    item_name: str = ""
    requested_by_id: int
    quantity_requested: Decimal
    supplier: Optional[str]
    notes: Optional[str]
    status: str
    requested_at: datetime
    ordered_at: Optional[datetime]
    received_at: Optional[datetime]
    received_by_id: Optional[int]
    quantity_received: Optional[Decimal]

    @classmethod
    def from_model(cls, obj: ReorderRequest) -> "ReorderRequestRead":
        data = cls.model_validate(obj)
        data.item_name = obj.item.name if obj.item else ""
        return data


async def _get_reorder_or_404(db: AsyncSession, reorder_id: uuid.UUID) -> ReorderRequest:
    stmt = (
        select(ReorderRequest)
        .options(selectinload(ReorderRequest.item))
        .where(ReorderRequest.id == reorder_id)
    )
    result = await db.execute(stmt)
    reorder = result.scalar_one_or_none()
    if reorder is None:
        raise ReorderNotFoundError()
    return reorder


router = APIRouter(prefix="/reorders", tags=["CEMS Reorders"])


@router.post("", response_model=ReorderRequestRead, status_code=201)
async def create_reorder_request(
    payload: ReorderRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> ReorderRequestRead:
    item = await db.get(ConsumableItem, payload.item_id)
    if item is None:
        raise ConsumableItemNotFoundError()

    if payload.quantity_requested <= 0:
        raise NonPositiveQuantityError()

    reorder = ReorderRequest(
        item_id=payload.item_id,
        requested_by_id=current_user.id,
        quantity_requested=payload.quantity_requested,
        supplier=payload.supplier,
        notes=payload.notes,
        status=ReorderStatus.PENDING,
    )
    db.add(reorder)
    await db.flush()

    loaded = await _get_reorder_or_404(db, reorder.id)
    return ReorderRequestRead.from_model(loaded)


@router.get("", response_model=List[ReorderRequestRead])
async def list_reorder_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    item_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[ReorderRequestRead]:
    stmt = (
        select(ReorderRequest)
        .options(selectinload(ReorderRequest.item))
        .order_by(ReorderRequest.requested_at.desc())
    )

    if status_filter:
        stmt = stmt.where(ReorderRequest.status == status_filter)
    if item_id:
        stmt = stmt.where(ReorderRequest.item_id == item_id)

    result = await db.execute(stmt)
    reorders = result.scalars().all()
    return [ReorderRequestRead.from_model(r) for r in reorders]


@router.post("/{reorder_id}/mark-ordered", response_model=ReorderRequestRead)
async def mark_reorder_ordered(
    reorder_id: uuid.UUID,
    payload: MarkOrderedPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> ReorderRequestRead:
    reorder = await _get_reorder_or_404(db, reorder_id)

    if reorder.status != ReorderStatus.PENDING:
        raise ReorderInvalidTransitionError(reorder.status.value, target="ordered")

    reorder.status = ReorderStatus.ORDERED
    reorder.ordered_at = _utc_now()
    if payload.supplier is not None:
        reorder.supplier = payload.supplier
    if payload.notes is not None:
        reorder.notes = payload.notes

    await db.flush()
    reorder = await _get_reorder_or_404(db, reorder_id)
    return ReorderRequestRead.from_model(reorder)


@router.post("/{reorder_id}/mark-received", response_model=ReorderRequestRead)
async def mark_reorder_received(
    reorder_id: uuid.UUID,
    payload: MarkReceivedPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> ReorderRequestRead:
    reorder = await _get_reorder_or_404(db, reorder_id)

    if reorder.status != ReorderStatus.ORDERED:
        raise ReorderInvalidTransitionError(reorder.status.value, target="received")

    if payload.quantity_received <= 0:
        # Reuse the reorder-specific message instead of the generic one.
        from backend.core.exceptions.cems.base import CEMSValidationError
        raise CEMSValidationError(reorder_messages.QUANTITY_RECEIVED_POSITIVE)

    reorder.status = ReorderStatus.RECEIVED
    reorder.received_at = _utc_now()
    reorder.received_by_id = current_user.id
    reorder.quantity_received = payload.quantity_received
    if payload.notes is not None:
        reorder.notes = payload.notes

    item = await db.get(ConsumableItem, reorder.item_id)
    if item is not None:
        item.quantity += payload.quantity_received
        db.add(item)

    await db.flush()
    reorder = await _get_reorder_or_404(db, reorder_id)
    return ReorderRequestRead.from_model(reorder)


@router.post("/{reorder_id}/cancel", response_model=ReorderRequestRead)
async def cancel_reorder(
    reorder_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> ReorderRequestRead:
    reorder = await _get_reorder_or_404(db, reorder_id)

    if reorder.status == ReorderStatus.RECEIVED:
        raise ReorderAlreadyReceivedError()

    if reorder.status == ReorderStatus.CANCELLED:
        raise ReorderAlreadyCancelledError()

    reorder.status = ReorderStatus.CANCELLED
    await db.flush()
    reorder = await _get_reorder_or_404(db, reorder_id)
    return ReorderRequestRead.from_model(reorder)
