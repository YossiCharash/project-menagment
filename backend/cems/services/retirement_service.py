import uuid
from typing import Optional

from fastapi import HTTPException, status

from backend.cems.models.base import _utc_now
from backend.cems.models.fixed_asset import AssetStatus
from backend.cems.models.retirement import AssetRetirement, RetirementStatus
from backend.cems.models.user import UserRole
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.transfer_repository import TransferRepository
from backend.cems.repositories.user_repository import UserRepository


class RetirementService:
    """Manages the full retirement lifecycle of a fixed asset."""

    def __init__(
        self,
        asset_repo: AssetRepository,
        transfer_repo: TransferRepository,
        user_repo: UserRepository,
    ) -> None:
        self._asset_repo = asset_repo
        self._transfer_repo = transfer_repo
        self._user_repo = user_repo

    async def request_retirement(
        self,
        asset_id: uuid.UUID,
        requested_by_id: uuid.UUID,
        reason: str,
        disposal_method: str,
    ) -> AssetRetirement:
        asset = await self._asset_repo.get_by_id(asset_id)
        if asset is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found.",
            )

        if asset.status not in (AssetStatus.ACTIVE, AssetStatus.IN_WAREHOUSE):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Asset cannot be retired (current status: {asset.status.value}).",
            )

        retirement = await self._transfer_repo.create_retirement(
            {
                "asset_id": asset_id,
                "requested_by_id": requested_by_id,
                "reason": reason,
                "disposal_method": disposal_method,
                "status": RetirementStatus.PENDING,
            }
        )

        await self._asset_repo.log_history(
            asset_id=asset_id,
            action="RETIREMENT_REQUESTED",
            actor_id=requested_by_id,
            notes=f"Reason: {reason}. Disposal: {disposal_method}.",
        )

        return retirement

    async def approve_retirement(
        self,
        retirement_id: uuid.UUID,
        manager_id: uuid.UUID,
        notes: Optional[str] = None,
    ) -> AssetRetirement:
        retirement = await self._transfer_repo.get_retirement_by_id(retirement_id)
        if retirement is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Retirement request not found.",
            )

        if retirement.status != RetirementStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Retirement request is not pending.",
            )

        # Validate authority: must be ADMIN or MANAGER
        approver = await self._user_repo.get_by_id(manager_id)
        if approver is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Approver user not found.",
            )

        is_main_admin = approver.role == "Admin"
        is_cems_authority = approver.cems_role in (UserRole.ADMIN.value, UserRole.MANAGER.value)
        if not (is_main_admin or is_cems_authority):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Admin or Manager can approve retirements.",
            )

        now = _utc_now()
        retirement.status = RetirementStatus.APPROVED
        retirement.approved_by_id = manager_id
        retirement.approved_at = now
        if notes:
            retirement.notes = notes
        await self._transfer_repo._session.flush()

        await self._asset_repo.update(
            retirement.asset_id,
            {"status": AssetStatus.RETIRED},
        )

        await self._asset_repo.log_history(
            asset_id=retirement.asset_id,
            action="ASSET_RETIRED",
            actor_id=manager_id,
            notes=f"Approved retirement. Reason: {retirement.reason}. "
                  f"Disposal: {retirement.disposal_method}. "
                  f"Notes: {notes or 'N/A'}.",
        )

        return retirement
