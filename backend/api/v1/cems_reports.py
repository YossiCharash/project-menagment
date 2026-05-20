import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.v1.cems_deps import (
    get_current_user,
    get_db,
    require_admin_or_manager,
    require_any_cems_role,
    RequireWarehouseManager,
)
from backend.configurations.cems.pagination import (
    DEFAULT_LIMIT,
    DEFAULT_SKIP,
    MAX_LIMIT,
    MIN_LIMIT,
)
from backend.core.exceptions.cems import WarehouseNotFoundError
from backend.models.cems_consumable import ConsumableItem, StockAlert
from backend.models.cems_fixed_asset import AssetStatus, FixedAsset
from backend.models.cems_transfer import (
    ReturnStatus,
    Transfer,
    TransferStatus,
    WarehouseReturn,
)
from backend.models.cems_user import User
from backend.models.cems_warehouse import Warehouse
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_consumable_repository import ConsumableRepository
from backend.repositories.cems_transfer_repository import TransferRepository
from backend.schemas.cems_alerts import DashboardSummary, StockAlertRead, WarehouseSummary
from backend.schemas.cems_fixed_asset import FixedAssetRead
from backend.schemas.cems_transfer import TransferRead

router = APIRouter(prefix="/reports", tags=["CEMS Reports"])


@router.get("/dashboard", response_model=DashboardSummary)
async def dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> DashboardSummary:
    status_counts: dict[AssetStatus, int] = {}
    for s in AssetStatus:
        stmt = select(func.count()).select_from(FixedAsset).where(FixedAsset.status == s)
        result = await db.execute(stmt)
        status_counts[s] = result.scalar_one()

    total = sum(status_counts.values())

    stmt = select(func.count()).select_from(ConsumableItem)
    total_consumables = (await db.execute(stmt)).scalar_one()

    stmt = select(func.count()).select_from(ConsumableItem).where(
        ConsumableItem.quantity <= ConsumableItem.low_stock_threshold
    )
    low_stock = (await db.execute(stmt)).scalar_one()

    stmt = select(func.count()).select_from(Transfer).where(
        Transfer.status == TransferStatus.PENDING
    )
    pending_transfers = (await db.execute(stmt)).scalar_one()

    stmt = select(func.count()).select_from(WarehouseReturn).where(
        WarehouseReturn.status == ReturnStatus.PENDING
    )
    pending_returns = (await db.execute(stmt)).scalar_one()

    stmt = select(func.count()).select_from(StockAlert).where(StockAlert.resolved.is_(False))
    unresolved_alerts = (await db.execute(stmt)).scalar_one()

    return DashboardSummary(
        total_fixed_assets=total,
        active_assets=status_counts.get(AssetStatus.ACTIVE, 0),
        in_transfer_assets=status_counts.get(AssetStatus.IN_TRANSFER, 0),
        in_warehouse_assets=status_counts.get(AssetStatus.IN_WAREHOUSE, 0),
        retired_assets=status_counts.get(AssetStatus.RETIRED, 0),
        total_consumables=total_consumables,
        low_stock_count=low_stock,
        pending_transfers=pending_transfers,
        pending_returns=pending_returns,
        unresolved_alerts=unresolved_alerts,
    )


@router.get("/warehouse/{warehouse_id}", response_model=WarehouseSummary)
async def warehouse_report(
    warehouse_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireWarehouseManager()),
) -> WarehouseSummary:
    warehouse = await db.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise WarehouseNotFoundError()

    stmt = select(func.count()).select_from(FixedAsset).where(
        FixedAsset.current_warehouse_id == warehouse_id
    )
    total_assets = (await db.execute(stmt)).scalar_one()

    stmt = select(func.count()).select_from(ConsumableItem).where(
        ConsumableItem.warehouse_id == warehouse_id
    )
    total_consumables = (await db.execute(stmt)).scalar_one()

    stmt = select(func.count()).select_from(ConsumableItem).where(
        ConsumableItem.warehouse_id == warehouse_id,
        ConsumableItem.quantity <= ConsumableItem.low_stock_threshold,
    )
    low_stock_items = (await db.execute(stmt)).scalar_one()

    stmt = select(func.count()).select_from(WarehouseReturn).where(
        WarehouseReturn.warehouse_id == warehouse_id,
        WarehouseReturn.status == ReturnStatus.PENDING,
    )
    pending_returns = (await db.execute(stmt)).scalar_one()

    return WarehouseSummary(
        warehouse_id=warehouse_id,
        warehouse_name=warehouse.name,
        total_assets_in_warehouse=total_assets,
        total_consumables=total_consumables,
        low_stock_items=low_stock_items,
        pending_returns=pending_returns,
    )


@router.get("/retired-assets", response_model=List[FixedAssetRead])
async def retired_assets(
    skip: int = Query(DEFAULT_SKIP, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=MIN_LIMIT, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> List[FixedAssetRead]:
    repo = AssetRepository(db)
    assets = await repo.get_by_status(AssetStatus.RETIRED, skip, limit)
    return [FixedAssetRead.model_validate(a) for a in assets]


@router.get("/transfers", response_model=List[TransferRead])
async def transfer_report(
    status_filter: Optional[TransferStatus] = Query(None, alias="status"),
    skip: int = Query(DEFAULT_SKIP, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=MIN_LIMIT, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> List[TransferRead]:
    repo = TransferRepository(db)
    if status_filter:
        transfers = await repo.get_by_status(status_filter, skip, limit)
    else:
        transfers = await repo.get_all(skip, limit)
    return [TransferRead.model_validate(t) for t in transfers]


@router.get("/alerts", response_model=List[StockAlertRead])
async def alerts_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> List[StockAlertRead]:
    repo = ConsumableRepository(db)
    alerts = await repo.get_unresolved_alerts()
    return [StockAlertRead.model_validate(a) for a in alerts]
