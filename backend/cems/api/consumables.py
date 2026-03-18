import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db, require_admin_or_manager
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

router = APIRouter(prefix="/consumables", tags=["CEMS Consumables"])


@router.get("", response_model=List[ConsumableItemRead])
async def list_consumables(
    warehouse_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ConsumableItemRead]:
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
    data = payload.model_dump(exclude_unset=True)
    item = await repo.update(item_id, data)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")
    return ConsumableItemRead.model_validate(item)


@router.post("/{item_id}/consume", response_model=ConsumptionLogRead, status_code=201)
async def consume_stock(
    item_id: uuid.UUID,
    payload: ConsumeStockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    item.warehouse_id = payload.to_warehouse_id
    await db.flush()
    return ConsumableItemRead.model_validate(item)


@router.get("/{item_id}/history", response_model=List[ConsumptionLogRead])
async def consumption_history(
    item_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ConsumptionLogRead]:
    repo = ConsumableRepository(db)
    logs = await repo.get_consumption_history(item_id, skip, limit)
    return [ConsumptionLogRead.model_validate(l) for l in logs]


@router.get("/low-stock", response_model=List[ConsumableItemRead])
async def low_stock_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ConsumableItemRead]:
    repo = ConsumableRepository(db)
    items = await repo.get_low_stock_items()
    return [ConsumableItemRead.model_validate(i) for i in items]
