import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
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
from backend.cems.services.photo_storage import store_photo, validate_photo
from backend.cems.services.retirement_service import RetirementService
from backend.core.exceptions.cems import RetirementError
from backend.models import User


def _raise_http_from_retirement_error(error: RetirementError) -> None:
    """Translate a domain ``RetirementError`` into an HTTPException.

    Single-responsibility helper that keeps the service layer free of
    FastAPI primitives while presenting the Hebrew detail message to the
    client at the appropriate HTTP status code.
    """
    raise HTTPException(status_code=error.http_status, detail=error.detail)


class MoveAssetRequest(PydanticBaseModel):
    """Move an asset either to a warehouse or to a free-text location.

    Exactly one destination is expected; the endpoint requires at least one
    of ``to_warehouse_id`` / ``to_location`` to be supplied.
    """

    to_warehouse_id: Optional[uuid.UUID] = None
    to_location: Optional[str] = None
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
    try:
        retirement = await service.approve_retirement(
            retirement_id=retirement_id,
            manager_id=current_user.id,
            notes=payload.notes,
        )
    except RetirementError as error:
        _raise_http_from_retirement_error(error)
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
    try:
        retirement = await service.reject_retirement(
            retirement_id=retirement_id,
            manager_id=current_user.id,
            reason=payload.reason,
        )
    except RetirementError as error:
        _raise_http_from_retirement_error(error)
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
        notes=f"נכס '{asset.name}' נוצר עם מס' סידורי '{asset.serial_number}'.",
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    if asset.current_warehouse_id is not None:
        await check_warehouse_manager_access(asset.current_warehouse_id, current_user, db)
    data = payload.model_dump(exclude_unset=True)
    asset = await repo.update(asset_id, data)
    await repo.log_history(
        asset_id=asset_id,
        action="ASSET_UPDATED",
        actor_id=current_user.id,
        notes=f"שדות שעודכנו: {list(data.keys())}",
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


async def _move_asset_to_warehouse(
    asset,
    to_warehouse_id: uuid.UUID,
    notes: Optional[str],
    repo: AssetRepository,
    actor_id: int,
) -> None:
    """Relocate an asset into a warehouse, clearing any free-text location."""
    from_warehouse_id = asset.current_warehouse_id
    from_custodian_id = asset.current_custodian_id
    asset.current_warehouse_id = to_warehouse_id
    asset.current_location = None
    asset.current_custodian_id = None
    asset.status = AssetStatus.IN_WAREHOUSE
    await repo.log_history(
        asset_id=asset.id,
        action="WAREHOUSE_MOVE",
        actor_id=actor_id,
        from_custodian_id=from_custodian_id,
        from_warehouse_id=from_warehouse_id,
        to_warehouse_id=to_warehouse_id,
        notes=notes,
    )


async def _move_asset_to_location(
    asset,
    to_location: str,
    notes: Optional[str],
    repo: AssetRepository,
    actor_id: int,
) -> None:
    """Relocate an asset to a free-text place that is not a warehouse."""
    from_warehouse_id = asset.current_warehouse_id
    from_custodian_id = asset.current_custodian_id
    asset.current_warehouse_id = None
    asset.current_location = to_location
    asset.current_custodian_id = None
    asset.status = AssetStatus.IN_WAREHOUSE
    location_note = f"מיקום: {to_location}"
    combined_notes = f"{location_note}. {notes}" if notes else location_note
    await repo.log_history(
        asset_id=asset.id,
        action="LOCATION_MOVE",
        actor_id=actor_id,
        from_custodian_id=from_custodian_id,
        from_warehouse_id=from_warehouse_id,
        notes=combined_notes,
    )


@router.post("/{asset_id}/move", response_model=FixedAssetRead)
async def move_asset(
    asset_id: uuid.UUID,
    payload: MoveAssetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> FixedAssetRead:
    if payload.to_warehouse_id is None and payload.to_location is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="יש לספק יעד להעברה: מחסן (to_warehouse_id) או מיקום חופשי (to_location).",
        )

    repo = AssetRepository(db)
    asset = await repo.get_by_id(asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")

    # Only guard against the source warehouse's manager when the asset is
    # currently in a warehouse.
    if asset.current_warehouse_id is not None:
        await check_warehouse_manager_access(asset.current_warehouse_id, current_user, db)

    if payload.to_warehouse_id is not None:
        await _move_asset_to_warehouse(
            asset, payload.to_warehouse_id, payload.notes, repo, current_user.id,
        )
    else:
        await _move_asset_to_location(
            asset, payload.to_location, payload.notes, repo, current_user.id,
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    if asset.status not in (AssetStatus.IN_WAREHOUSE, AssetStatus.ACTIVE) or (
        asset.status == AssetStatus.ACTIVE and asset.current_custodian_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"ניתן להקצות רק נכסים שאינם מוקצים לעובד (סטטוס נוכחי: {asset.status.value}).",
        )
    from_warehouse_id = asset.current_warehouse_id
    asset.current_custodian_id = payload.to_user_id
    asset.status = AssetStatus.ACTIVE
    await repo.log_history(
        asset_id=asset.id,
        action="ASSIGNED_TO_EMPLOYEE",
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
    """Upload or replace the primary photo for a fixed asset. Uses S3 if configured, otherwise local disk."""
    content = await file.read()
    validate_photo(file.filename, content)

    repo = AssetRepository(db)
    asset = await repo.get_by_id(asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")

    new_photo_url = store_photo(
        prefix="asset_photos",
        existing_url=asset.photo_url,
        file_bytes=content,
        filename=file.filename,
        content_type=file.content_type,
    )

    asset = await repo.update(asset_id, {"photo_url": new_photo_url})
    await repo.log_history(
        asset_id=asset_id,
        action="PHOTO_UPDATED",
        actor_id=current_user.id,
        notes="תמונת ציוד עודכנה",
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
    try:
        retirement = await service.request_retirement(
            asset_id=asset_id,
            requested_by_id=current_user.id,
            reason=payload.reason,
            disposal_method=payload.disposal_method,
            what_happened=payload.what_happened,
            supplier_name=payload.supplier_name,
        )
    except RetirementError as error:
        _raise_http_from_retirement_error(error)
    return RetirementRead.model_validate(retirement)


@router.delete("/{asset_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanently_delete_archived_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> None:
    """Permanently delete an archived asset and all its dependent rows.

    Only Admin or Manager may call this endpoint.  The asset MUST already
    be ``RETIRED`` — attempting to hard-delete a live asset returns 409.
    """
    service = RetirementService(
        AssetRepository(db), TransferRepository(db), UserRepository(db),
    )
    try:
        await service.delete_archived_asset(
            asset_id=asset_id,
            manager_id=current_user.id,
        )
    except RetirementError as error:
        _raise_http_from_retirement_error(error)
