import uuid
from typing import Optional

from backend.configurations.cems.roles import CEMS_ADMIN, CEMS_MANAGER, MAIN_ADMIN
from backend.core.exceptions.cems import (
    AssetNotFoundError,
    AssetNotRetirableError,
    RetirementApproverNotFoundError,
    RetirementNotFoundError,
    RetirementNotPendingError,
    RetirementUnauthorizedError,
)
from backend.messages.cems import history_actions, retirement_messages
from backend.models.cems_base import _utc_now
from backend.models.cems_fixed_asset import AssetStatus
from backend.models.cems_retirement import AssetRetirement, RetirementStatus
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_transfer_repository import TransferRepository
from backend.repositories.cems_user_repository import UserRepository

_RETIRABLE_STATUSES = (AssetStatus.ACTIVE, AssetStatus.IN_WAREHOUSE)


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
            raise AssetNotFoundError()

        if asset.status not in _RETIRABLE_STATUSES:
            raise AssetNotRetirableError(asset.status.value)

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
            action=history_actions.RETIREMENT_REQUESTED,
            actor_id=requested_by_id,
            notes=retirement_messages.request_history_note(reason, disposal_method),
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
            raise RetirementNotFoundError()

        if retirement.status != RetirementStatus.PENDING:
            raise RetirementNotPendingError()

        approver = await self._user_repo.get_by_id(manager_id)
        if approver is None:
            raise RetirementApproverNotFoundError()

        is_main_admin = approver.role == MAIN_ADMIN
        is_cems_authority = approver.cems_role in (CEMS_ADMIN, CEMS_MANAGER)
        if not (is_main_admin or is_cems_authority):
            raise RetirementUnauthorizedError()

        retirement.status = RetirementStatus.APPROVED
        retirement.approved_by_id = manager_id
        retirement.approved_at = _utc_now()
        if notes:
            retirement.notes = notes
        await self._transfer_repo._session.flush()

        await self._asset_repo.update(
            retirement.asset_id,
            {"status": AssetStatus.RETIRED},
        )

        await self._asset_repo.log_history(
            asset_id=retirement.asset_id,
            action=history_actions.ASSET_RETIRED,
            actor_id=manager_id,
            notes=retirement_messages.approved_history_note(
                retirement.reason, retirement.disposal_method, notes,
            ),
        )

        return retirement

    async def reject_retirement(
        self,
        retirement_id: uuid.UUID,
        manager_id: uuid.UUID,
        reason: str,
    ) -> AssetRetirement:
        retirement = await self._transfer_repo.get_retirement_by_id(retirement_id)
        if retirement is None:
            raise RetirementNotFoundError()

        if retirement.status != RetirementStatus.PENDING:
            raise RetirementNotPendingError()

        retirement.status = RetirementStatus.REJECTED
        retirement.approved_by_id = manager_id
        retirement.approved_at = _utc_now()
        retirement.notes = reason
        await self._transfer_repo._session.flush()

        await self._asset_repo.log_history(
            asset_id=retirement.asset_id,
            action=history_actions.RETIREMENT_REJECTED,
            actor_id=manager_id,
            notes=retirement_messages.rejected_history_note(reason),
        )

        return retirement
