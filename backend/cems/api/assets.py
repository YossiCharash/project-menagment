import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import (
    check_warehouse_manager_access,
    get_current_user,
    get_db,
    get_employee_warehouse_filter,
    require_admin_or_manager,
    require_any_cems_role,
)
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
from backend.cems.schemas.transfer import ApproveRetirementRequest, RetirementRead
from backend.cems.services.retirement_service import RetirementService
from backend.models import User


class MoveAssetRequest(PydanticBaseModel):
    to_warehouse_id: uuid.UUID
    notes: Optional[str] = None


class RejectRetirementRequest(PydanticBaseModel):
    reason: str

router = APIRouter(prefix="/assets", tags=["CEMS Assets"])


@router.get("", response_model=List[FixedAssetRead])
async def list_assets(
    warehouse_id: Optional[uuid.UUID] = Query(None),
    project_id: Optional[int] = Query(None),
    status_filter: Optional[AssetStatus] = Query(None, alias="status"),
    category_id: Optional[uuid.UUID] = Query(None),
    custodian_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[FixedAssetRead]:
    # Employees are restricted to their assigned warehouse.
    if current_user.cems_role == "Employee":
        employee_wh = get_employee_warehouse_filter(current_user)
        if employee_wh is None:
            return []
        warehouse_id = employee_wh

    repo = AssetRepository(db)
    assets = await repo.get_filtered(
        warehouse_id=warehouse_id,
        project_id=project_id,
        status=status_filter,
        category_id=category_id,
        custodian_id=custodian_id,
        search=search,
        skip=skip,
        limit=limit,
    )
    return [FixedAssetRead.model_validate(a) for a in assets]


@router.get("/expiring-warranties", response_model=List[FixedAssetRead])
async def expiring_warranties(
    days: int = Query(30, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> List[FixedAssetRead]:
    repo = AssetRepository(db)
    assets = await repo.get_expiring_warranties(days)
    return [FixedAssetRead.model_validate(a) for a in assets]


# ── Retirement Management ────────────────────────────────────────────────────
# These routes use the literal prefix "/retirements" and MUST be registered
# before the parameterised "/{asset_id}" route so that FastAPI does not
# attempt to parse "retirements" as a UUID.


@router.get("/retirements", response_model=List[RetirementRead])
async def list_retirements(
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> List[RetirementRead]:
    """Return retirement requests, optionally filtered by status."""
    transfer_repo = TransferRepository(db)
    if status_filter:
        retirements = await transfer_repo.get_retirements_by_status(
            status_filter, skip, limit,
        )
    else:
        from sqlalchemy import select as sa_select

        from backend.cems.models.retirement import AssetRetirement

        stmt = (
            sa_select(AssetRetirement)
            .order_by(AssetRetirement.requested_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        retirements = list(result.scalars().all())
    return [RetirementRead.model_validate(r) for r in retirements]


@router.post("/retirements/{retirement_id}/approve", response_model=RetirementRead)
async def approve_retirement(
    retirement_id: uuid.UUID,
    payload: ApproveRetirementRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> RetirementRead:
    """Approve a pending retirement request and mark the asset as RETIRED."""
    service = RetirementService(
        AssetRepository(db), TransferRepository(db), UserRepository(db),
    )
    retirement = await service.approve_retirement(
        retirement_id=retirement_id,
        manager_id=current_user.id,
        notes=payload.notes,
    )
    return RetirementRead.model_validate(retirement)


@router.post("/retirements/{retirement_id}/reject", response_model=RetirementRead)
async def reject_retirement(
    retirement_id: uuid.UUID,
    payload: RejectRetirementRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> RetirementRead:
    """Reject a pending retirement request with a reason."""
    service = RetirementService(
        AssetRepository(db), TransferRepository(db), UserRepository(db),
    )
    retirement = await service.reject_retirement(
        retirement_id=retirement_id,
        manager_id=current_user.id,
        reason=payload.reason,
    )
    return RetirementRead.model_validate(retirement)


# ── Single Asset by ID ───────────────────────────────────────────────────────


@router.get("/{asset_id}", response_model=FixedAssetRead)
async def get_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
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
    if payload.current_warehouse_id is not None:
        await check_warehouse_manager_access(payload.current_warehouse_id, current_user, db)
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
    asset = await repo.get_by_id(asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    if asset.current_warehouse_id is not None:
        await check_warehouse_manager_access(asset.current_warehouse_id, current_user, db)
    data = payload.model_dump(exclude_unset=True)
    asset = await repo.update(asset_id, data)
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
    current_user: User = Depends(require_any_cems_role),
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
    if asset.current_warehouse_id is not None:
        await check_warehouse_manager_access(asset.current_warehouse_id, current_user, db)
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
    current_user: User = Depends(require_any_cems_role),
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
