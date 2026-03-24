"""Reorder request endpoints for the CEMS consumable inventory module.

Manages the full reorder lifecycle: PENDING -> ORDERED -> RECEIVED (or CANCELLED).
When a reorder is marked as RECEIVED, the consumable item's quantity is updated
to reflect the received stock.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.cems.api.deps import (
    get_current_user,
    get_db,
    require_admin_or_manager,
    require_any_cems_role,
)
from backend.cems.models.base import _utc_now
from backend.cems.models.consumable import ConsumableItem
from backend.cems.models.reorder import ReorderRequest, ReorderStatus
from backend.models.user import User

# ── Schemas ──────────────────────────────────────────────────────────────────


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


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _get_reorder_or_404(
    db: AsyncSession, reorder_id: uuid.UUID
) -> ReorderRequest:
    """Load a ReorderRequest by ID with its item relationship, or raise 404."""
    stmt = (
        select(ReorderRequest)
        .options(selectinload(ReorderRequest.item))
        .where(ReorderRequest.id == reorder_id)
    )
    result = await db.execute(stmt)
    reorder = result.scalar_one_or_none()
    if reorder is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reorder request not found.",
        )
    return reorder


# ── Router ───────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/reorders", tags=["CEMS Reorders"])


@router.post("", response_model=ReorderRequestRead, status_code=201)
async def create_reorder_request(
    payload: ReorderRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> ReorderRequestRead:
    """Create a new reorder request for a consumable item."""
    item = await db.get(ConsumableItem, payload.item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consumable item not found.",
        )

    if payload.quantity_requested <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantity requested must be positive.",
        )

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

    # Reload with relationship for the response
    loaded = await _get_reorder_or_404(db, reorder.id)
    return ReorderRequestRead.from_model(loaded)


@router.get("", response_model=List[ReorderRequestRead])
async def list_reorder_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    item_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[ReorderRequestRead]:
    """List reorder requests with optional status and item_id filters."""
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
    """Mark a PENDING reorder as ORDERED (order placed with supplier)."""
    reorder = await _get_reorder_or_404(db, reorder_id)

    if reorder.status != ReorderStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot mark as ordered: current status is {reorder.status.value}.",
        )

    reorder.status = ReorderStatus.ORDERED
    reorder.ordered_at = _utc_now()
    if payload.supplier is not None:
        reorder.supplier = payload.supplier
    if payload.notes is not None:
        reorder.notes = payload.notes

    await db.flush()
    return ReorderRequestRead.from_model(reorder)


@router.post("/{reorder_id}/mark-received", response_model=ReorderRequestRead)
async def mark_reorder_received(
    reorder_id: uuid.UUID,
    payload: MarkReceivedPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> ReorderRequestRead:
    """Mark an ORDERED reorder as RECEIVED and update the consumable item's stock."""
    reorder = await _get_reorder_or_404(db, reorder_id)

    if reorder.status != ReorderStatus.ORDERED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot mark as received: current status is {reorder.status.value}.",
        )

    if payload.quantity_received <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantity received must be positive.",
        )

    reorder.status = ReorderStatus.RECEIVED
    reorder.received_at = _utc_now()
    reorder.received_by_id = current_user.id
    reorder.quantity_received = payload.quantity_received
    if payload.notes is not None:
        reorder.notes = payload.notes

    # Update the consumable item's quantity
    item = await db.get(ConsumableItem, reorder.item_id)
    if item is not None:
        item.quantity += payload.quantity_received
        db.add(item)

    await db.flush()
    return ReorderRequestRead.from_model(reorder)


@router.post("/{reorder_id}/cancel", response_model=ReorderRequestRead)
async def cancel_reorder(
    reorder_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> ReorderRequestRead:
    """Cancel a reorder request (only if not yet received)."""
    reorder = await _get_reorder_or_404(db, reorder_id)

    if reorder.status == ReorderStatus.RECEIVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot cancel a reorder that has already been received.",
        )

    if reorder.status == ReorderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reorder request is already cancelled.",
        )

    reorder.status = ReorderStatus.CANCELLED
    await db.flush()
    return ReorderRequestRead.from_model(reorder)
