import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db, require_admin, require_admin_or_manager
from backend.cems.models.user import User
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.consumable_repository import ConsumableRepository
from backend.cems.repositories.user_repository import UserRepository
from backend.cems.repositories.warehouse_repository import WarehouseRepository
from backend.cems.schemas.fixed_asset import FixedAssetRead
from backend.cems.schemas.warehouse import (
    ChangeManagerRequest,
    WarehouseCreate,
    WarehouseProjectsUpdate,
    WarehouseRead,
    WarehouseUpdate,
)
from backend.cems.services.warehouse_service import WarehouseService

router = APIRouter(prefix="/warehouses", tags=["CEMS Warehouses"])


def _warehouse_to_read(warehouse) -> WarehouseRead:
    """Convert a Warehouse ORM instance to WarehouseRead, populating project fields."""
    data = WarehouseRead.model_validate(warehouse)
    data.project_ids = [p.id for p in warehouse.projects]
    data.project_names = [p.name for p in warehouse.projects]
    return data


@router.get("", response_model=List[WarehouseRead])
async def list_warehouses(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[WarehouseRead]:
    repo = WarehouseRepository(db)
    warehouses = await repo.get_all(skip, limit)
    return [_warehouse_to_read(w) for w in warehouses]


@router.post("", response_model=WarehouseRead, status_code=201)
async def create_warehouse(
    payload: WarehouseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> WarehouseRead:
    repo = WarehouseRepository(db)
    warehouse = await repo.create(payload.model_dump())
    return _warehouse_to_read(warehouse)


@router.put("/{warehouse_id}", response_model=WarehouseRead)
async def update_warehouse(
    warehouse_id: uuid.UUID,
    payload: WarehouseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> WarehouseRead:
    repo = WarehouseRepository(db)
    data = payload.model_dump(exclude_unset=True)
    warehouse = await repo.update(warehouse_id, data)
    if warehouse is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found.")
    return _warehouse_to_read(warehouse)


@router.post("/{warehouse_id}/change-manager", response_model=WarehouseRead)
async def change_manager(
    warehouse_id: uuid.UUID,
    payload: ChangeManagerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> WarehouseRead:
    warehouse_repo = WarehouseRepository(db)
    user_repo = UserRepository(db)
    service = WarehouseService(warehouse_repo, user_repo)
    warehouse = await service.change_manager(
        warehouse_id=warehouse_id,
        new_manager_id=payload.new_manager_id,
        changed_by_id=current_user.id,
        reason=payload.reason,
    )
    return _warehouse_to_read(warehouse)


@router.put("/{warehouse_id}/projects", response_model=WarehouseRead)
async def update_warehouse_projects(
    warehouse_id: uuid.UUID,
    payload: WarehouseProjectsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> WarehouseRead:
    repo = WarehouseRepository(db)
    warehouse = await repo.get_by_id(warehouse_id)
    if warehouse is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found.")
    await repo.set_warehouse_projects(warehouse_id, payload.project_ids)
    warehouse = await repo.get_with_projects(warehouse_id)
    return _warehouse_to_read(warehouse)


@router.get("/{warehouse_id}/inventory", response_model=List[FixedAssetRead])
async def warehouse_inventory(
    warehouse_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[FixedAssetRead]:
    asset_repo = AssetRepository(db)
    assets = await asset_repo.get_by_warehouse(warehouse_id, skip, limit)
    return [FixedAssetRead.model_validate(a) for a in assets]
