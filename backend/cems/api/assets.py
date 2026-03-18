import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db, require_admin_or_manager
from backend.cems.models.fixed_asset import AssetStatus
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.transfer_repository import TransferRepository
from backend.cems.repositories.user_repository import UserRepository
from backend.cems.schemas.fixed_asset import (
    AssetHistoryRead,
    FixedAssetCreate,
    FixedAssetRead,
    FixedAssetUpdate,
    RetireAssetRequest,
)
from backend.cems.schemas.transfer import RetirementRead
from backend.cems.services.retirement_service import RetirementService
from backend.models import User


class MoveAssetRequest(PydanticBaseModel):
    to_warehouse_id: uuid.UUID
    notes: Optional[str] = None

router = APIRouter(prefix="/assets", tags=["CEMS Assets"])


@router.get("", response_model=List[FixedAssetRead])
async def list_assets(
    warehouse_id: Optional[uuid.UUID] = Query(None),
    project_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[AssetStatus] = Query(None, alias="status"),
    custodian_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[FixedAssetRead]:
    repo = AssetRepository(db)
    if warehouse_id:
        assets = await repo.get_by_warehouse(warehouse_id, skip, limit)
    elif project_id:
        assets = await repo.get_by_project(project_id, skip, limit)
    elif status_filter:
        assets = await repo.get_by_status(status_filter, skip, limit)
    elif custodian_id:
        assets = await repo.get_by_custodian(custodian_id, skip, limit)
    else:
        assets = await repo.get_all(skip, limit)
    return [FixedAssetRead.model_validate(a) for a in assets]


@router.get("/expiring-warranties", response_model=List[FixedAssetRead])
async def expiring_warranties(
    days: int = Query(30, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[FixedAssetRead]:
    repo = AssetRepository(db)
    assets = await repo.get_expiring_warranties(days)
    return [FixedAssetRead.model_validate(a) for a in assets]


@router.get("/{asset_id}", response_model=FixedAssetRead)
async def get_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FixedAssetRead:
    repo = AssetRepository(db)
    asset = await repo.get_by_id(asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    return FixedAssetRead.model_validate(asset)


@router.post("", response_model=FixedAssetRead, status_code=201)
async def create_asset(
    payload: FixedAssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> FixedAssetRead:
    repo = AssetRepository(db)
    asset = await repo.create(payload.model_dump())
    await repo.log_history(
        asset_id=asset.id,
        action="ASSET_CREATED",
        actor_id=current_user.id,
        notes=f"Asset '{asset.name}' created with serial '{asset.serial_number}'.",
    )
    return FixedAssetRead.model_validate(asset)


@router.put("/{asset_id}", response_model=FixedAssetRead)
async def update_asset(
    asset_id: uuid.UUID,
    payload: FixedAssetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> FixedAssetRead:
    repo = AssetRepository(db)
    data = payload.model_dump(exclude_unset=True)
    asset = await repo.update(asset_id, data)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    await repo.log_history(
        asset_id=asset_id,
        action="ASSET_UPDATED",
        actor_id=current_user.id,
        notes=f"Updated fields: {list(data.keys())}",
    )
    return FixedAssetRead.model_validate(asset)


@router.get("/{asset_id}/history", response_model=List[AssetHistoryRead])
async def asset_history(
    asset_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AssetHistoryRead]:
    repo = AssetRepository(db)
    entries = await repo.get_history(asset_id, skip, limit)
    return [AssetHistoryRead.model_validate(e) for e in entries]


@router.post("/{asset_id}/move", response_model=FixedAssetRead)
async def move_asset(
    asset_id: uuid.UUID,
    payload: MoveAssetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> FixedAssetRead:
    repo = AssetRepository(db)
    asset = await repo.get_by_id(asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    from_warehouse_id = asset.current_warehouse_id
    asset.current_warehouse_id = payload.to_warehouse_id
    await repo.log_history(
        asset_id=asset.id,
        action="WAREHOUSE_MOVE",
        actor_id=current_user.id,
        from_warehouse_id=from_warehouse_id,
        to_warehouse_id=payload.to_warehouse_id,
        notes=payload.notes,
    )
    return FixedAssetRead.model_validate(asset)


@router.post("/{asset_id}/retire", response_model=RetirementRead, status_code=201)
async def retire_asset(
    asset_id: uuid.UUID,
    payload: RetireAssetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RetirementRead:
    asset_repo = AssetRepository(db)
    transfer_repo = TransferRepository(db)
    user_repo = UserRepository(db)
    service = RetirementService(asset_repo, transfer_repo, user_repo)
    retirement = await service.request_retirement(
        asset_id=asset_id,
        requested_by_id=current_user.id,
        reason=payload.reason,
        disposal_method=payload.disposal_method,
    )
    return RetirementRead.model_validate(retirement)
