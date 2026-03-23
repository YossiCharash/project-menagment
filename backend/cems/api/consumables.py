import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db, get_employee_warehouse_filter, require_admin_or_manager, require_any_cems_role, check_warehouse_manager_access
from backend.cems.models.user import User
from backend.cems.repositories.consumable_repository import ConsumableRepository
from backend.cems.schemas.consumable import (
    ConsumeStockRequest,
    ConsumableItemCreate,
    ConsumableItemRead,
    ConsumableItemUpdate,
    ConsumptionLogRead,
)
from backend.cems.services.alert_service import AlertService
from backend.cems.services.consumption_service import ConsumptionService


class MoveConsumableRequest(PydanticBaseModel):
    to_warehouse_id: uuid.UUID


class TransferConsumableRequest(PydanticBaseModel):
    to_warehouse_id: uuid.UUID
    quantity: Decimal

router = APIRouter(prefix="/consumables", tags=["CEMS Consumables"])


@router.get("", response_model=List[ConsumableItemRead])
async def list_consumables(
    warehouse_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[ConsumableItemRead]:
    # Employees are restricted to their assigned warehouse
    if current_user.cems_role == "Employee":
        employee_wh = get_employee_warehouse_filter(current_user)
        if employee_wh is None:
            return []
        warehouse_id = employee_wh

    repo = ConsumableRepository(db)
    if warehouse_id:
        items = await repo.get_by_warehouse(warehouse_id)
    else:
        items = await repo.get_all(skip, limit)
    return [ConsumableItemRead.model_validate(i) for i in items]


@router.post("", response_model=ConsumableItemRead, status_code=201)
async def create_consumable(
    payload: ConsumableItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> ConsumableItemRead:
    await check_warehouse_manager_access(payload.warehouse_id, current_user, db)
    repo = ConsumableRepository(db)
    item = await repo.create(payload.model_dump())
    return ConsumableItemRead.model_validate(item)


@router.put("/{item_id}", response_model=ConsumableItemRead)
async def update_consumable(
    item_id: uuid.UUID,
    payload: ConsumableItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> ConsumableItemRead:
    repo = ConsumableRepository(db)
    item = await repo.get_by_id(item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")
    await check_warehouse_manager_access(item.warehouse_id, current_user, db)
    data = payload.model_dump(exclude_unset=True)
    item = await repo.update(item_id, data)
    return ConsumableItemRead.model_validate(item)


@router.post("/{item_id}/consume", response_model=ConsumptionLogRead, status_code=201)
async def consume_stock(
    item_id: uuid.UUID,
    payload: ConsumeStockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> ConsumptionLogRead:
    repo = ConsumableRepository(db)
    alert_svc = AlertService(repo)
    service = ConsumptionService(repo, alert_svc)
    log = await service.consume_stock(
        item_id=item_id,
        consumer_id=current_user.id,
        quantity=payload.quantity,
        project_id=payload.project_id,
        notes=payload.notes,
    )
    return ConsumptionLogRead.model_validate(log)


@router.post("/{item_id}/move", response_model=ConsumableItemRead)
async def move_consumable(
    item_id: uuid.UUID,
    payload: MoveConsumableRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> ConsumableItemRead:
    repo = ConsumableRepository(db)
    item = await repo.get_by_id(item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consumable item not found.")
    await check_warehouse_manager_access(item.warehouse_id, current_user, db)
    item.warehouse_id = payload.to_warehouse_id
    await db.flush()
    return ConsumableItemRead.model_validate(item)


@router.post("/{item_id}/transfer", response_model=ConsumableItemRead)
async def transfer_consumable(
    item_id: uuid.UUID,
    payload: TransferConsumableRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> ConsumableItemRead:
    """Transfer a partial quantity of a consumable item to another warehouse.

    The source item's quantity is reduced by *payload.quantity*. The target
    warehouse receives the quantity on an existing item with the same name and
    category, or a new item is created if none exists.
    """
    repo = ConsumableRepository(db)

    source = await repo.get_by_id(item_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consumable item not found.")

    if payload.quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be positive.")

    if source.quantity < payload.quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Insufficient stock. Available: {source.quantity}, requested: {payload.quantity}.",
        )

    if source.warehouse_id == payload.to_warehouse_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and target warehouse must be different.",
        )

    await check_warehouse_manager_access(source.warehouse_id, current_user, db)

    # Decrement source item
    await repo.adjust_quantity(item_id, -payload.quantity)

    # Credit target warehouse — find matching item or create a new one
    target = await repo.find_matching_in_warehouse(
        payload.to_warehouse_id, source.name, source.category_id
    )
    if target is not None:
        await repo.adjust_quantity(target.id, payload.quantity)
    else:
        await repo.create(
            {
                "name": source.name,
                "category_id": source.category_id,
                "warehouse_id": payload.to_warehouse_id,
                "quantity": payload.quantity,
                "unit": source.unit,
                "low_stock_threshold": source.low_stock_threshold,
                "reorder_quantity": source.reorder_quantity,
            }
        )

    updated_source = await repo.get_by_id(item_id)
    return ConsumableItemRead.model_validate(updated_source)


@router.get("/{item_id}/history", response_model=List[ConsumptionLogRead])
async def consumption_history(
    item_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[ConsumptionLogRead]:
    repo = ConsumableRepository(db)
    logs = await repo.get_consumption_history(item_id, skip, limit)
    return [ConsumptionLogRead.model_validate(l) for l in logs]


@router.get("/low-stock", response_model=List[ConsumableItemRead])
async def low_stock_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> List[ConsumableItemRead]:
    repo = ConsumableRepository(db)
    items = await repo.get_low_stock_items()
    return [ConsumableItemRead.model_validate(i) for i in items]
