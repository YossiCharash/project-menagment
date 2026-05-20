import uuid
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import (
    get_current_user,
    get_db,
    get_employee_warehouse_filter,
    require_admin,
    require_admin_or_manager,
    require_any_cems_role,
    RequireWarehouseManager,
)
from backend.cems.configurations.pagination import (
    DEFAULT_LIMIT,
    DEFAULT_MANAGER_HISTORY_LIMIT,
    DEFAULT_SKIP,
    MAX_LIMIT,
    MAX_MANAGER_HISTORY_LIMIT,
    MIN_LIMIT,
)
from backend.cems.configurations.roles import CEMS_EMPLOYEE
from backend.cems.core.exceptions import WarehouseNotFoundError
from backend.cems.models.user import User
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.consumable_repository import ConsumableRepository
from backend.cems.repositories.user_repository import UserRepository
from backend.cems.repositories.warehouse_repository import WarehouseRepository
from backend.cems.schemas.fixed_asset import FixedAssetRead
from backend.cems.schemas.warehouse import (
    ChangeManagerRequest,
    ManagerHistoryReadWithNames,
    WarehouseCreate,
    WarehouseProjectsUpdate,
    WarehouseRead,
    WarehouseUpdate,
)
from backend.cems.services.warehouse_service import WarehouseService
from backend.models.user import User as UserModel

router = APIRouter(prefix="/warehouses", tags=["CEMS Warehouses"])


def _warehouse_to_read(warehouse) -> WarehouseRead:
    data = WarehouseRead.model_validate(warehouse)
    data.project_ids = [p.id for p in warehouse.projects]
    data.project_names = [p.name for p in warehouse.projects]
    return data


@router.get("", response_model=List[WarehouseRead])
async def list_warehouses(
    skip: int = Query(DEFAULT_SKIP, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=MIN_LIMIT, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[WarehouseRead]:
    repo = WarehouseRepository(db)

    if current_user.cems_role == CEMS_EMPLOYEE:
        employee_wh = get_employee_warehouse_filter(current_user)
        if employee_wh is None:
            return []
        warehouse = await repo.get_with_projects(employee_wh)
        return [_warehouse_to_read(warehouse)] if warehouse else []

    warehouses = await repo.get_all_with_projects(skip, limit)
    return [_warehouse_to_read(w) for w in warehouses]


@router.post("", response_model=WarehouseRead, status_code=201)
async def create_warehouse(
    payload: WarehouseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> WarehouseRead:
    repo = WarehouseRepository(db)
    warehouse = await repo.create(payload.model_dump())
    warehouse = await repo.get_with_projects(warehouse.id)
    return _warehouse_to_read(warehouse)


@router.get("/{warehouse_id}/manager-history", response_model=List[ManagerHistoryReadWithNames])
async def get_manager_history(
    warehouse_id: uuid.UUID,
    skip: int = Query(DEFAULT_SKIP, ge=0),
    limit: int = Query(
        DEFAULT_MANAGER_HISTORY_LIMIT, ge=MIN_LIMIT, le=MAX_MANAGER_HISTORY_LIMIT
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[ManagerHistoryReadWithNames]:
    repo = WarehouseRepository(db)
    records = await repo.get_manager_history(warehouse_id, skip, limit)

    user_ids: set[int] = set()
    for record in records:
        if record.previous_manager_id is not None:
            user_ids.add(record.previous_manager_id)
        user_ids.add(record.new_manager_id)
        user_ids.add(record.changed_by_id)

    user_name_map: dict[int, str] = {}
    if user_ids:
        stmt = select(UserModel).where(UserModel.id.in_(user_ids))
        result = await db.execute(stmt)
        user_name_map = {u.id: u.full_name for u in result.scalars().all()}

    enriched: List[ManagerHistoryReadWithNames] = []
    for record in records:
        item = ManagerHistoryReadWithNames.model_validate(record)
        item.previous_manager_name = (
            user_name_map.get(record.previous_manager_id)
            if record.previous_manager_id is not None
            else None
        )
        item.new_manager_name = user_name_map.get(record.new_manager_id, "")
        item.changed_by_name = user_name_map.get(record.changed_by_id, "")
        enriched.append(item)

    return enriched


@router.put("/{warehouse_id}", response_model=WarehouseRead)
async def update_warehouse(
    warehouse_id: uuid.UUID,
    payload: WarehouseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireWarehouseManager()),
) -> WarehouseRead:
    repo = WarehouseRepository(db)
    data = payload.model_dump(exclude_unset=True)
    warehouse = await repo.update(warehouse_id, data)
    if warehouse is None:
        raise WarehouseNotFoundError()
    warehouse = await repo.get_with_projects(warehouse_id)
    return _warehouse_to_read(warehouse)


@router.delete("/{warehouse_id}", status_code=204)
async def delete_warehouse(
    warehouse_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> None:
    repo = WarehouseRepository(db)
    deleted = await repo.delete(warehouse_id)
    if not deleted:
        raise WarehouseNotFoundError()


@router.post("/{warehouse_id}/change-manager", response_model=WarehouseRead)
async def change_manager(
    warehouse_id: uuid.UUID,
    payload: ChangeManagerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> WarehouseRead:
    repo = WarehouseRepository(db)
    user_repo = UserRepository(db)
    service = WarehouseService(repo, user_repo)
    warehouse = await service.change_manager(
        warehouse_id=warehouse_id,
        new_manager_id=payload.new_manager_id,
        changed_by_id=current_user.id,
        reason=payload.reason,
    )
    warehouse = await repo.get_with_projects(warehouse.id)
    return _warehouse_to_read(warehouse)


@router.put("/{warehouse_id}/projects", response_model=WarehouseRead)
async def update_warehouse_projects(
    warehouse_id: uuid.UUID,
    payload: WarehouseProjectsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireWarehouseManager()),
) -> WarehouseRead:
    repo = WarehouseRepository(db)
    warehouse = await repo.get_by_id(warehouse_id)
    if warehouse is None:
        raise WarehouseNotFoundError()
    await repo.set_warehouse_projects(warehouse_id, payload.project_ids)
    warehouse = await repo.get_with_projects(warehouse_id)
    return _warehouse_to_read(warehouse)


@router.get("/{warehouse_id}/inventory", response_model=List[FixedAssetRead])
async def warehouse_inventory(
    warehouse_id: uuid.UUID,
    skip: int = Query(DEFAULT_SKIP, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=MIN_LIMIT, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[FixedAssetRead]:
    asset_repo = AssetRepository(db)
    assets = await asset_repo.get_by_warehouse(warehouse_id, skip, limit)
    return [FixedAssetRead.model_validate(a) for a in assets]
