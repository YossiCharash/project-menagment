import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile
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
from backend.configurations.cems.file_uploads import ASSET_PHOTO_PREFIX
from backend.configurations.cems.pagination import (
    DEFAULT_LIMIT,
    DEFAULT_SKIP,
    MAX_LIMIT,
    MIN_LIMIT,
)
from backend.configurations.cems.roles import CEMS_EMPLOYEE
from backend.configurations.cems.warranty import DEFAULT_WARRANTY_DAYS_AHEAD
from backend.core.exceptions.cems import AssetNotAssignableError, AssetNotFoundError
from backend.messages.cems import asset_messages, history_actions
from backend.models.cems_fixed_asset import AssetStatus
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_transfer_repository import TransferRepository
from backend.repositories.cems_user_repository import UserRepository
from backend.schemas.cems_fixed_asset import (
    AssetHistoryRead,
    FixedAssetCreate,
    FixedAssetRead,
    FixedAssetUpdate,
    RetireAssetRequest,
)
from backend.schemas.cems_transfer import ApproveRetirementRequest, RetirementRead
from backend.services.cems_photo_storage import store_photo, validate_photo
from backend.services.cems_retirement_service import RetirementService
from backend.models import User


class MoveAssetRequest(PydanticBaseModel):
    to_warehouse_id: uuid.UUID
    notes: Optional[str] = None


class RejectRetirementRequest(PydanticBaseModel):
    reason: str


class AssignAssetRequest(PydanticBaseModel):
    to_user_id: int
    notes: Optional[str] = None


router = APIRouter(prefix="/assets", tags=["CEMS Assets"])


@router.get("", response_model=List[FixedAssetRead])
async def list_assets(
    warehouse_id: Optional[uuid.UUID] = Query(None),
    project_id: Optional[int] = Query(None),
    status_filter: Optional[AssetStatus] = Query(None, alias="status"),
    category_id: Optional[uuid.UUID] = Query(None),
    custodian_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(DEFAULT_SKIP, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=MIN_LIMIT, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[FixedAssetRead]:
    if current_user.cems_role == CEMS_EMPLOYEE:
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
    days: int = Query(DEFAULT_WARRANTY_DAYS_AHEAD, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> List[FixedAssetRead]:
    repo = AssetRepository(db)
    assets = await repo.get_expiring_warranties(days)
    return [FixedAssetRead.model_validate(a) for a in assets]


# Retirement routes MUST be registered before "/{asset_id}" so that
# FastAPI does not try to parse "retirements" as a UUID.


@router.get("/retirements", response_model=List[RetirementRead])
async def list_retirements(
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = Query(DEFAULT_SKIP, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=MIN_LIMIT, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> List[RetirementRead]:
    transfer_repo = TransferRepository(db)
    if status_filter:
        retirements = await transfer_repo.get_retirements_by_status(
            status_filter, skip, limit,
        )
    else:
        from sqlalchemy import select as sa_select

        from backend.models.cems_retirement import AssetRetirement

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
    service = RetirementService(
        AssetRepository(db), TransferRepository(db), UserRepository(db),
    )
    retirement = await service.reject_retirement(
        retirement_id=retirement_id,
        manager_id=current_user.id,
        reason=payload.reason,
    )
    return RetirementRead.model_validate(retirement)


@router.get("/{asset_id}", response_model=FixedAssetRead)
async def get_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> FixedAssetRead:
    repo = AssetRepository(db)
    asset = await repo.get_by_id(asset_id)
    if asset is None:
        raise AssetNotFoundError()
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
        action=history_actions.ASSET_CREATED,
        actor_id=current_user.id,
        notes=asset_messages.created_history_note(asset.name, asset.serial_number),
    )
    return FixedAssetRead.model_validate(asset)


@router.put("/{asset_id}", response_model=FixedAssetRead)
@router.patch("/{asset_id}", response_model=FixedAssetRead)
async def update_asset(
    asset_id: uuid.UUID,
    payload: FixedAssetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> FixedAssetRead:
    repo = AssetRepository(db)
    asset = await repo.get_by_id(asset_id)
    if asset is None:
        raise AssetNotFoundError()
    if asset.current_warehouse_id is not None:
        await check_warehouse_manager_access(asset.current_warehouse_id, current_user, db)
    data = payload.model_dump(exclude_unset=True)
    asset = await repo.update(asset_id, data)
    await repo.log_history(
        asset_id=asset_id,
        action=history_actions.ASSET_UPDATED,
        actor_id=current_user.id,
        notes=asset_messages.updated_history_note(list(data.keys())),
    )
    return FixedAssetRead.model_validate(asset)


@router.get("/{asset_id}/history", response_model=List[AssetHistoryRead])
async def asset_history(
    asset_id: uuid.UUID,
    skip: int = Query(DEFAULT_SKIP, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=MIN_LIMIT, le=MAX_LIMIT),
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
        raise AssetNotFoundError()
    if asset.current_warehouse_id is not None:
        await check_warehouse_manager_access(asset.current_warehouse_id, current_user, db)
    from_warehouse_id = asset.current_warehouse_id
    from_custodian_id = asset.current_custodian_id
    asset.current_warehouse_id = payload.to_warehouse_id
    asset.current_custodian_id = None
    asset.status = AssetStatus.IN_WAREHOUSE
    await repo.log_history(
        asset_id=asset.id,
        action=history_actions.WAREHOUSE_MOVE,
        actor_id=current_user.id,
        from_custodian_id=from_custodian_id,
        from_warehouse_id=from_warehouse_id,
        to_warehouse_id=payload.to_warehouse_id,
        notes=payload.notes,
    )
    return FixedAssetRead.model_validate(asset)


@router.post("/{asset_id}/assign", response_model=FixedAssetRead)
async def assign_asset(
    asset_id: uuid.UUID,
    payload: AssignAssetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> FixedAssetRead:
    repo = AssetRepository(db)
    asset = await repo.get_by_id(asset_id)
    if asset is None:
        raise AssetNotFoundError()
    is_assignable = (
        asset.status in (AssetStatus.IN_WAREHOUSE, AssetStatus.ACTIVE)
        and not (asset.status == AssetStatus.ACTIVE and asset.current_custodian_id is not None)
    )
    if not is_assignable:
        raise AssetNotAssignableError(asset.status.value)
    from_warehouse_id = asset.current_warehouse_id
    asset.current_custodian_id = payload.to_user_id
    asset.status = AssetStatus.ACTIVE
    await repo.log_history(
        asset_id=asset.id,
        action=history_actions.ASSIGNED_TO_EMPLOYEE,
        actor_id=current_user.id,
        to_custodian_id=payload.to_user_id,
        from_warehouse_id=from_warehouse_id,
        notes=payload.notes,
    )
    return FixedAssetRead.model_validate(asset)


@router.post("/{asset_id}/upload-photo", response_model=FixedAssetRead)
async def upload_asset_photo(
    asset_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> FixedAssetRead:
    content = await file.read()
    validate_photo(file.filename, content)

    repo = AssetRepository(db)
    asset = await repo.get_by_id(asset_id)
    if asset is None:
        raise AssetNotFoundError()

    new_photo_url = store_photo(
        prefix=ASSET_PHOTO_PREFIX,
        existing_url=asset.photo_url,
        file_bytes=content,
        filename=file.filename,
        content_type=file.content_type,
    )

    asset = await repo.update(asset_id, {"photo_url": new_photo_url})
    await repo.log_history(
        asset_id=asset_id,
        action=history_actions.PHOTO_UPDATED,
        actor_id=current_user.id,
        notes=asset_messages.PHOTO_UPDATED_HISTORY_NOTE,
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
