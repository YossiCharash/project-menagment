import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.v1.cems_deps import (
    check_warehouse_manager_access,
    get_current_user,
    get_db,
    get_employee_warehouse_filter,
    require_admin_or_manager,
    require_any_cems_role,
)
from backend.models.cems_consumable_movement import ConsumableMovementAction
from backend.models.cems_user import User
from backend.repositories.cems_consumable_repository import ConsumableRepository
from backend.schemas.cems_consumable import (
    ConsumeStockRequest,
    ConsumableItemCreate,
    ConsumableItemRead,
    ConsumableItemUpdate,
    ConsumableMovementRead,
    ConsumptionLogRead,
)
from backend.services.cems_alert_service import AlertService
from backend.services.cems_consumption_service import ConsumptionService
from backend.services.cems_photo_storage import store_photo, validate_photo


class MoveConsumableRequest(PydanticBaseModel):
    to_warehouse_id: uuid.UUID


class TransferConsumableRequest(PydanticBaseModel):
    to_warehouse_id: uuid.UUID
    quantity: Decimal

router = APIRouter(prefix="/consumables", tags=["CEMS Consumables"])


@router.get("", response_model=List[ConsumableItemRead])
async def list_consumables(
    warehouse_id: Optional[uuid.UUID] = Query(None),
    category_id: Optional[uuid.UUID] = Query(None),
    low_stock_only: bool = Query(False, alias="low_stock"),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[ConsumableItemRead]:
    # Employees are restricted to their assigned warehouse.
    if current_user.cems_role == "Employee":
        employee_wh = get_employee_warehouse_filter(current_user)
        if employee_wh is None:
            return []
        warehouse_id = employee_wh

    repo = ConsumableRepository(db)
    items = await repo.get_filtered(
        warehouse_id=warehouse_id,
        category_id=category_id,
        low_stock_only=low_stock_only,
        search=search,
        skip=skip,
        limit=limit,
    )
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
    old_wh = item.warehouse_id
    qty_at_move = item.quantity
    item.warehouse_id = payload.to_warehouse_id
    await db.flush()
    await repo.create_movement_log(
        {
            "item_id": item.id,
            "from_warehouse_id": old_wh,
            "to_warehouse_id": payload.to_warehouse_id,
            "quantity": qty_at_move,
            "action": ConsumableMovementAction.MOVE,
            "actor_id": current_user.id,
        }
    )
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

    source_wh_id = source.warehouse_id

    # Decrement source item
    await repo.adjust_quantity(item_id, -payload.quantity)

    # Log TRANSFER_OUT from the source perspective
    await repo.create_movement_log(
        {
            "item_id": source.id,
            "from_warehouse_id": source_wh_id,
            "to_warehouse_id": payload.to_warehouse_id,
            "quantity": payload.quantity,
            "action": ConsumableMovementAction.TRANSFER_OUT,
            "actor_id": current_user.id,
        }
    )

    # Credit target warehouse — find matching item or create a new one
    target = await repo.find_matching_in_warehouse(
        payload.to_warehouse_id, source.name, source.category_id
    )
    if target is not None:
        await repo.adjust_quantity(target.id, payload.quantity)
    else:
        target = await repo.create(
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

    # Log TRANSFER_IN from the target perspective
    await repo.create_movement_log(
        {
            "item_id": target.id,
            "from_warehouse_id": source_wh_id,
            "to_warehouse_id": payload.to_warehouse_id,
            "quantity": payload.quantity,
            "action": ConsumableMovementAction.TRANSFER_IN,
            "actor_id": current_user.id,
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
    rows = await repo.get_consumption_history(item_id, skip, limit)
    return [
        _serialize_consumption_log(log, consumer_name, project_name)
        for (log, consumer_name, project_name) in rows
    ]


def _serialize_consumption_log(log, consumer_name, project_name) -> ConsumptionLogRead:
    """Build a ConsumptionLogRead enriched with the consumer and project names.

    ``get_consumption_history`` resolves the consumer and project names via
    scalar joins, so the withdrawal report can show *who* consumed the stock
    and *for which project* without loading the related ORM entities.
    """
    return ConsumptionLogRead(
        id=log.id,
        item_id=log.item_id,
        consumed_by_id=log.consumed_by_id,
        consumed_by_name=consumer_name,
        project_id=log.project_id,
        project_name=project_name,
        quantity_consumed=log.quantity_consumed,
        consumed_at=log.consumed_at,
        notes=log.notes,
    )


@router.get("/{item_id}/movements", response_model=List[ConsumableMovementRead])
async def consumable_movements(
    item_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[ConsumableMovementRead]:
    repo = ConsumableRepository(db)
    logs = await repo.get_movement_history(item_id, skip, limit)
    return [
        ConsumableMovementRead.model_validate(
            {
                "id": l.id,
                "item_id": l.item_id,
                "from_warehouse_id": l.from_warehouse_id,
                "to_warehouse_id": l.to_warehouse_id,
                "quantity": l.quantity,
                "action": l.action.value if hasattr(l.action, "value") else str(l.action),
                "actor_id": l.actor_id,
                "notes": l.notes,
                "moved_at": l.moved_at,
            }
        )
        for l in logs
    ]


@router.get("/low-stock", response_model=List[ConsumableItemRead])
async def low_stock_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> List[ConsumableItemRead]:
    repo = ConsumableRepository(db)
    items = await repo.get_low_stock_items()
    return [ConsumableItemRead.model_validate(i) for i in items]


@router.post("/{item_id}/upload-photo", response_model=ConsumableItemRead)
async def upload_consumable_photo(
    item_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> ConsumableItemRead:
    """Upload or replace the photo for a consumable item. Uses S3 if configured, otherwise local disk."""
    content = await file.read()
    validate_photo(file.filename, content)

    repo = ConsumableRepository(db)
    item = await repo.get_by_id(item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consumable item not found.")
    await check_warehouse_manager_access(item.warehouse_id, current_user, db)

    new_image_url = store_photo(
        prefix="consumable_photos",
        existing_url=item.image_url,
        file_bytes=content,
        filename=file.filename,
        content_type=file.content_type,
    )
    item = await repo.update(item_id, {"image_url": new_image_url})
    return ConsumableItemRead.model_validate(item)
