import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db, require_admin_or_manager
from backend.cems.models.transfer import TransferStatus
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
    TransferCreate,
    TransferRead,
    WarehouseReturnCreate,
    WarehouseReturnRead,
)
from backend.cems.services.retirement_service import RetirementService
from backend.cems.services.return_service import ReturnService
from backend.cems.services.transfer_service import TransferService

router = APIRouter(prefix="/transfers", tags=["CEMS Transfers"])


# ---------- Transfers ----------

@router.post("", response_model=TransferRead, status_code=201)
async def initiate_transfer(
    payload: TransferCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransferRead:
    asset_repo = AssetRepository(db)
    transfer_repo = TransferRepository(db)
    service = TransferService(asset_repo, transfer_repo)
    transfer = await service.transfer_asset(
        asset_id=payload.asset_id,
        from_user_id=payload.from_user_id,
        to_user_id=payload.to_user_id,
        to_warehouse_id=payload.to_warehouse_id,
        initiated_by_id=current_user.id,
        notes=payload.notes,
    )
    return TransferRead.model_validate(transfer)


@router.get("", response_model=List[TransferRead])
async def list_transfers(
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


@router.get("/{transfer_id}", response_model=TransferRead)
async def get_transfer(
    transfer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransferRead:
    repo = TransferRepository(db)
    transfer = await repo.get_by_id(transfer_id)
    if transfer is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer not found.")
    return TransferRead.model_validate(transfer)


@router.post("/{transfer_id}/complete", response_model=TransferRead)
async def complete_transfer(
    transfer_id: uuid.UUID,
    payload: CompleteTransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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


# ---------- Warehouse Returns ----------

@router.post("/returns", response_model=WarehouseReturnRead, status_code=201)
async def request_return(
    payload: WarehouseReturnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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


@router.post("/returns/{return_id}/approve", response_model=WarehouseReturnRead)
async def approve_return(
    return_id: uuid.UUID,
    payload: ApproveReturnRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WarehouseReturnRead:
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


# ---------- Retirements ----------

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
