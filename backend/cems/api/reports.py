import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db
from backend.cems.models.consumable import ConsumableItem, StockAlert
from backend.cems.models.fixed_asset import AssetStatus, FixedAsset
from backend.cems.models.transfer import Transfer, TransferStatus, WarehouseReturn, ReturnStatus
from backend.cems.models.user import User
from backend.cems.models.warehouse import Warehouse
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.consumable_repository import ConsumableRepository
from backend.cems.repositories.transfer_repository import TransferRepository
from backend.cems.schemas.alerts import DashboardSummary, StockAlertRead, WarehouseSummary
from backend.cems.schemas.fixed_asset import FixedAssetRead
from backend.cems.schemas.transfer import TransferRead

router = APIRouter(prefix="/reports", tags=["CEMS Reports"])


@router.get("/dashboard", response_model=DashboardSummary)
async def dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummary:
    # Total fixed assets by status
    status_counts: dict[AssetStatus, int] = {}
    for s in AssetStatus:
        stmt = select(func.count()).select_from(FixedAsset).where(FixedAsset.status == s)
        result = await db.execute(stmt)
        status_counts[s] = result.scalar_one()

    total = sum(status_counts.values())

    # Total consumables
    stmt = select(func.count()).select_from(ConsumableItem)
    total_consumables = (await db.execute(stmt)).scalar_one()

    # Low stock
    stmt = select(func.count()).select_from(ConsumableItem).where(
        ConsumableItem.quantity <= ConsumableItem.low_stock_threshold
    )
    low_stock = (await db.execute(stmt)).scalar_one()

    # Pending transfers
    stmt = select(func.count()).select_from(Transfer).where(
        Transfer.status == TransferStatus.PENDING
    )
    pending_transfers = (await db.execute(stmt)).scalar_one()

    # Pending returns
    stmt = select(func.count()).select_from(WarehouseReturn).where(
        WarehouseReturn.status == ReturnStatus.PENDING
    )
    pending_returns = (await db.execute(stmt)).scalar_one()

    # Unresolved alerts
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
    current_user: User = Depends(get_current_user),
) -> WarehouseSummary:
    warehouse = await db.get(Warehouse, warehouse_id)
    if warehouse is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found.")

    # Assets directly linked to this warehouse
    stmt = select(func.count()).select_from(FixedAsset).where(
        FixedAsset.current_warehouse_id == warehouse_id
    )
    total_assets = (await db.execute(stmt)).scalar_one()

    # Consumables directly linked to this warehouse
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
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[FixedAssetRead]:
    repo = AssetRepository(db)
    assets = await repo.get_by_status(AssetStatus.RETIRED, skip, limit)
    return [FixedAssetRead.model_validate(a) for a in assets]


@router.get("/transfers", response_model=List[TransferRead])
async def transfer_report(
    status_filter: Optional[TransferStatus] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
) -> List[StockAlertRead]:
    repo = ConsumableRepository(db)
    alerts = await repo.get_unresolved_alerts()
    return [StockAlertRead.model_validate(a) for a in alerts]
