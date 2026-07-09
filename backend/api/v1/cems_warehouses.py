import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.v1.cems_deps import get_current_user, get_db, get_employee_warehouse_filter, require_admin, require_admin_or_manager, require_any_cems_role, RequireWarehouseManager
from backend.models.cems_user import User
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_consumable_repository import ConsumableRepository
from backend.repositories.cems_transfer_repository import TransferRepository
from backend.repositories.cems_user_repository import UserRepository
from backend.repositories.cems_warehouse_repository import WarehouseRepository
from backend.schemas.cems_fixed_asset import FixedAssetRead
from backend.services.cems_warehouse_notification_service import WarehouseNotificationService
from backend.services.email_service import EmailService
from backend.schemas.cems_warehouse import (
    ChangeManagerRequest,
    ManagerHistoryReadWithNames,
    WarehouseCreate,
    WarehouseProjectsUpdate,
    WarehouseRead,
    WarehouseUpdate,
)
from backend.services.cems_warehouse_service import WarehouseService
from backend.models.user import User as UserModel

router = APIRouter(prefix="/warehouses", tags=["CEMS Warehouses"])


def _is_relationship_loaded(orm_obj, attribute_name: str) -> bool:
    """Return True iff the SQLAlchemy relationship is already eager-loaded.

    Accessing an unloaded ``lazy="raise"`` relationship inside an async
    session raises, so this guard lets the mapper skip the access when the
    parent was not eager-loaded.
    """
    try:
        state = sa_inspect(orm_obj)
    except Exception:
        return False
    return attribute_name not in state.unloaded


def _warehouse_to_read(warehouse) -> WarehouseRead:
    """Convert a Warehouse ORM instance to WarehouseRead, populating project
    and parent fields."""
    data = WarehouseRead.model_validate(warehouse)
    data.project_ids = [p.id for p in warehouse.projects]
    data.project_names = [p.name for p in warehouse.projects]
    # parent_id comes from the column (always available); parent_name is only
    # resolvable when the `parent` relationship was eager-loaded.
    if _is_relationship_loaded(warehouse, "parent") and warehouse.parent is not None:
        data.parent_name = warehouse.parent.name
    return data


@router.get("", response_model=List[WarehouseRead])
async def list_warehouses(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[WarehouseRead]:
    repo = WarehouseRepository(db)

    # Employees only see their assigned warehouse
    if current_user.cems_role == "Employee":
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
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
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
    if data.get("parent_id") == warehouse_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="מחסן אינו יכול להיות אב של עצמו.",
        )
    warehouse = await repo.update(warehouse_id, data)
    if warehouse is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found.")
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found.")


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found.")
    await repo.set_warehouse_projects(warehouse_id, payload.project_ids)
    warehouse = await repo.get_with_projects(warehouse_id)
    return _warehouse_to_read(warehouse)


@router.post("/{warehouse_id}/notify-employee/{employee_user_id}")
async def notify_employee_about_pending_items(
    warehouse_id: uuid.UUID,
    employee_user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireWarehouseManager()),
) -> dict:
    """Email the employee a list of equipment waiting for them in this warehouse."""
    service = WarehouseNotificationService(
        email_service=EmailService(),
        transfer_repo=TransferRepository(db),
        warehouse_repo=WarehouseRepository(db),
        user_repo=UserRepository(db),
    )
    items_count = await service.notify_employee_about_pending_items(
        warehouse_id=warehouse_id,
        employee_user_id=employee_user_id,
    )
    return {"sent": True, "items_count": items_count}


@router.get("/{warehouse_id}/inventory", response_model=List[FixedAssetRead])
async def warehouse_inventory(
    warehouse_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[FixedAssetRead]:
    asset_repo = AssetRepository(db)
    assets = await asset_repo.get_by_warehouse(warehouse_id, skip, limit)
    return [FixedAssetRead.model_validate(a) for a in assets]
