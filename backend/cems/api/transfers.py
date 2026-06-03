import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db, require_admin_or_manager, require_any_cems_role, check_warehouse_manager_access
from backend.cems.models.transfer import ReturnStatus, TransferStatus
from backend.cems.models.user import User
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.transfer_repository import TransferRepository
from backend.cems.repositories.user_repository import UserRepository
from backend.cems.repositories.warehouse_repository import WarehouseRepository
from backend.cems.schemas.transfer import (
    ApproveRetirementRequest,
    ApproveReturnRequest,
    CompleteTransferRequest,
    RejectTransferRequest,
    RetirementRead,
    TransferConfirmRead,
    TransferConfirmResultRead,
    TransferCreate,
    TransferRead,
    WarehouseReturnCreate,
    WarehouseReturnRead,
)
from backend.cems.services.retirement_service import RetirementService
from backend.cems.services.return_service import ReturnService
from backend.cems.services.transfer_confirmation_service import (
    TransferConfirmationService,
)
from backend.cems.services.transfer_service import TransferService
from backend.core.config import settings
from backend.services.email_service import EmailService
from fastapi import Request

router = APIRouter(prefix="/transfers", tags=["CEMS Transfers"])


# ---------- Transfers ----------

def _build_confirmation_service(db: AsyncSession) -> TransferConfirmationService:
    """Wire up the confirmation service with all its dependencies.

    Single place for the injection graph so endpoints stay slim and the
    service's Dependency-Inversion contract is honored.
    """
    asset_repo = AssetRepository(db)
    transfer_repo = TransferRepository(db)
    user_repo = UserRepository(db)
    transfer_service = TransferService(asset_repo, transfer_repo)
    return TransferConfirmationService(
        email_service=EmailService(),
        transfer_service=transfer_service,
        transfer_repo=transfer_repo,
        asset_repo=asset_repo,
        user_repo=user_repo,
    )


@router.post("", response_model=TransferRead, status_code=201)
async def initiate_transfer(
    payload: TransferCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> TransferRead:
    asset_repo = AssetRepository(db)
    transfer_repo = TransferRepository(db)
    service = TransferService(asset_repo, transfer_repo)
    transfer = await service.transfer_asset(
        asset_id=payload.asset_id,
        to_user_id=payload.to_user_id,
        to_warehouse_id=payload.to_warehouse_id,
        initiated_by_id=current_user.id,
        notes=payload.notes,
    )

    email_sent: Optional[bool] = None
    if payload.send_email_notification:
        try:
            confirmation_service = _build_confirmation_service(db)
            email_sent = await confirmation_service.send_confirmation_email(
                transfer_id=transfer.id,
                frontend_base_url=settings.FRONTEND_URL,
            )
        except HTTPException:
            # Surface validation errors (e.g. employee has no email) to the
            # caller so the UI can show a clear Hebrew message.
            raise
        except Exception:  # noqa: BLE001 — never roll back the transfer on email failure
            import logging as _logging
            _logging.getLogger(__name__).exception(
                "Transfer %s created but confirmation email failed", transfer.id
            )
            email_sent = False

    result = TransferRead.model_validate(transfer)
    if payload.send_email_notification:
        result.email_sent = bool(email_sent)
    return result


@router.get("", response_model=List[TransferRead])
async def list_transfers(
    status_filter: Optional[TransferStatus] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[TransferRead]:
    repo = TransferRepository(db)
    if status_filter:
        transfers = await repo.get_by_status(status_filter, skip, limit)
    else:
        transfers = await repo.get_all(skip, limit)
    return [TransferRead.model_validate(t) for t in transfers]


# ---------- Warehouse Returns ----------
# NOTE: These routes use static path segments (/returns, /retirements) and
# MUST be declared before the catch-all /{transfer_id} routes below so that
# FastAPI does not greedily match them as a transfer_id UUID path param.

@router.post("/returns", response_model=WarehouseReturnRead, status_code=201)
async def request_return(
    payload: WarehouseReturnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> WarehouseReturnRead:
    asset_repo = AssetRepository(db)
    transfer_repo = TransferRepository(db)
    warehouse_repo = WarehouseRepository(db)
    service = ReturnService(asset_repo, transfer_repo, warehouse_repo)
    wr = await service.request_return(
        asset_id=payload.asset_id,
        returned_by_id=current_user.id,
        warehouse_id=payload.warehouse_id,
        reason=payload.reason,
    )
    return WarehouseReturnRead.model_validate(wr)


@router.get("/returns", response_model=List[WarehouseReturnRead])
async def list_returns(
    status_filter: Optional[ReturnStatus] = Query(None, alias="status"),
    warehouse_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[WarehouseReturnRead]:
    repo = TransferRepository(db)
    if status_filter is not None:
        returns = await repo.get_returns_by_status(status_filter, warehouse_id, skip, limit)
    else:
        returns = await repo.get_all_returns(skip, limit)
    return [WarehouseReturnRead.model_validate(r) for r in returns]


@router.get("/returns/{return_id}", response_model=WarehouseReturnRead)
async def get_return(
    return_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> WarehouseReturnRead:
    repo = TransferRepository(db)
    wr = await repo.get_return_by_id(return_id)
    if wr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Return not found.")
    return WarehouseReturnRead.model_validate(wr)


@router.post("/returns/{return_id}/approve", response_model=WarehouseReturnRead)
async def approve_return(
    return_id: uuid.UUID,
    payload: ApproveReturnRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> WarehouseReturnRead:
    from backend.cems.models.transfer import WarehouseReturn as WarehouseReturnModel

    wr_record = await db.get(WarehouseReturnModel, return_id)
    if wr_record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Return not found.")
    await check_warehouse_manager_access(wr_record.warehouse_id, current_user, db)
    asset_repo = AssetRepository(db)
    transfer_repo = TransferRepository(db)
    warehouse_repo = WarehouseRepository(db)
    service = ReturnService(asset_repo, transfer_repo, warehouse_repo)
    wr = await service.approve_return(
        return_id=return_id,
        manager_id=current_user.id,
        signature_hash=payload.signature_hash,
        ip_address=payload.ip_address,
        return_warehouse_id=payload.return_warehouse_id,
    )
    return WarehouseReturnRead.model_validate(wr)


@router.post("/returns/{return_id}/reject", response_model=WarehouseReturnRead)
async def reject_return(
    return_id: uuid.UUID,
    payload: RejectTransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> WarehouseReturnRead:
    from backend.cems.models.transfer import WarehouseReturn as WarehouseReturnModel

    wr_record = await db.get(WarehouseReturnModel, return_id)
    if wr_record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Return not found.")
    await check_warehouse_manager_access(wr_record.warehouse_id, current_user, db)
    asset_repo = AssetRepository(db)
    transfer_repo = TransferRepository(db)
    warehouse_repo = WarehouseRepository(db)
    service = ReturnService(asset_repo, transfer_repo, warehouse_repo)
    wr = await service.reject_return(
        return_id=return_id,
        manager_id=current_user.id,
        reason=payload.reason,
    )
    return WarehouseReturnRead.model_validate(wr)


# ---------- Retirements ----------

@router.get("/retirements", response_model=List[RetirementRead])
async def list_retirements(
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[RetirementRead]:
    repo = TransferRepository(db)
    if status_filter:
        retirements = await repo.get_retirements_by_status(status_filter, skip, limit)
    else:
        retirements = await repo.get_all_retirements(skip, limit)
    return [RetirementRead.model_validate(r) for r in retirements]


@router.get("/retirements/{retirement_id}", response_model=RetirementRead)
async def get_retirement(
    retirement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> RetirementRead:
    repo = TransferRepository(db)
    retirement = await repo.get_retirement_by_id(retirement_id)
    if retirement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retirement not found.")
    return RetirementRead.model_validate(retirement)


@router.post("/retirements/{retirement_id}/approve", response_model=RetirementRead)
async def approve_retirement(
    retirement_id: uuid.UUID,
    payload: ApproveRetirementRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> RetirementRead:
    asset_repo = AssetRepository(db)
    transfer_repo = TransferRepository(db)
    user_repo = UserRepository(db)
    service = RetirementService(asset_repo, transfer_repo, user_repo)
    retirement = await service.approve_retirement(
        retirement_id=retirement_id,
        manager_id=current_user.id,
        notes=payload.notes,
    )
    return RetirementRead.model_validate(retirement)


@router.post("/retirements/{retirement_id}/reject", response_model=RetirementRead)
async def reject_retirement(
    retirement_id: uuid.UUID,
    payload: RejectTransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> RetirementRead:
    asset_repo = AssetRepository(db)
    transfer_repo = TransferRepository(db)
    user_repo = UserRepository(db)
    service = RetirementService(asset_repo, transfer_repo, user_repo)
    retirement = await service.reject_retirement(
        retirement_id=retirement_id,
        manager_id=current_user.id,
        reason=payload.reason,
    )
    return RetirementRead.model_validate(retirement)


# ---------- Public confirmation (no auth) ----------
# These endpoints are intentionally unauthenticated: the JWT token in the URL
# is itself the authorization. They MUST be declared before /{transfer_id}
# routes so FastAPI does not greedily match "confirm" as a UUID path param.

@router.get("/confirm/{token}", response_model=TransferConfirmRead)
async def get_transfer_confirm_preview(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> TransferConfirmRead:
    confirmation_service = _build_confirmation_service(db)
    transfer, asset_name, asset_serial, employee_name = (
        await confirmation_service.load_preview(token)
    )
    from_user_name = await confirmation_service.resolve_from_user_name(
        transfer.from_user_id
    )
    return TransferConfirmRead(
        id=transfer.id,
        asset_name=asset_name,
        asset_serial_number=asset_serial,
        from_user_name=from_user_name,
        to_user_name=employee_name,
        initiated_at=transfer.initiated_at,
        status=transfer.status,
        notes=transfer.notes,
    )


@router.post("/confirm/{token}", response_model=TransferConfirmResultRead)
async def confirm_transfer_via_link(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TransferConfirmResultRead:
    confirmation_service = _build_confirmation_service(db)
    client_ip = request.client.host if request.client else None
    transfer = await confirmation_service.confirm_via_token(
        token=token,
        ip_address=client_ip,
    )
    asset_repo = AssetRepository(db)
    asset = await asset_repo.get_by_id(transfer.asset_id)
    return TransferConfirmResultRead(
        confirmed=True,
        asset_name=asset.name if asset else "",
    )


# ---------- Transfers: catch-all by transfer_id ----------

@router.get("/{transfer_id}", response_model=TransferRead)
async def get_transfer(
    transfer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> TransferRead:
    repo = TransferRepository(db)
    transfer = await repo.get_by_id(transfer_id)
    if transfer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer not found.")
    return TransferRead.model_validate(transfer)


@router.post("/{transfer_id}/complete", response_model=TransferRead)
async def complete_transfer(
    transfer_id: uuid.UUID,
    payload: CompleteTransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> TransferRead:
    asset_repo = AssetRepository(db)
    transfer_repo = TransferRepository(db)
    service = TransferService(asset_repo, transfer_repo)
    transfer = await service.complete_transfer(
        transfer_id=transfer_id,
        recipient_id=current_user.id,
        signature_hash=payload.signature_hash,
        ip_address=payload.ip_address,
    )
    return TransferRead.model_validate(transfer)


@router.post("/{transfer_id}/reject", response_model=TransferRead)
async def reject_transfer(
    transfer_id: uuid.UUID,
    payload: RejectTransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> TransferRead:
    asset_repo = AssetRepository(db)
    transfer_repo = TransferRepository(db)
    service = TransferService(asset_repo, transfer_repo)
    transfer = await service.reject_transfer(
        transfer_id=transfer_id,
        rejected_by_id=current_user.id,
        reason=payload.reason,
    )
    return TransferRead.model_validate(transfer)
