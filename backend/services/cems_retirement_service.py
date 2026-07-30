import uuid
from typing import Optional

from sqlalchemy import delete as sql_delete

from backend.models.cems_base import _utc_now
from backend.models.cems_document import CemsDocument
from backend.models.cems_fixed_asset import AssetStatus
from backend.models.cems_retirement import AssetRetirement, RetirementStatus
from backend.models.cems_transfer import Transfer, WarehouseReturn
from backend.models.cems_user import UserRole
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_transfer_repository import TransferRepository
from backend.repositories.cems_user_repository import UserRepository
from backend.core.exceptions.cems import (
    ApprovalForbiddenError,
    ApproverNotFoundError,
    AssetNotEligibleForRetirementError,
    AssetNotFoundError,
    AssetNotInArchiveError,
    AssetPermanentDeleteForbiddenError,
    RetirementRequestNotFoundError,
    RetirementRequestNotPendingError,
)

# Entity discriminator used by the polymorphic `cems_documents` table to
# associate a document row with a fixed asset. There is no real FK, so the
# service is responsible for deleting matching rows on hard-delete.
_FIXED_ASSET_DOCUMENT_ENTITY_TYPE = "fixed_asset"

# Asset statuses from which a retirement request may be opened.
_RETIREMENT_ELIGIBLE_STATUSES = (AssetStatus.ACTIVE, AssetStatus.IN_WAREHOUSE)


class RetirementService:
    """Manages the full retirement lifecycle of a fixed asset.

    The service is framework-agnostic: it raises the domain exceptions from
    ``backend.core.exceptions.cems`` and never references FastAPI. The API
    layer translates those exceptions into HTTP responses.
    """

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
        requested_by_id: int,
        reason: str,
        disposal_method: str,
        what_happened: Optional[str] = None,
        supplier_name: Optional[str] = None,
    ) -> AssetRetirement:
        """Open a pending retirement request for an eligible asset.

        Raises ``AssetNotFoundError`` when the asset is missing and
        ``AssetNotEligibleForRetirementError`` when its status forbids
        retirement.
        """
        asset = await self._asset_repo.get_by_id(asset_id)
        if asset is None:
            raise AssetNotFoundError()

        if asset.status not in _RETIREMENT_ELIGIBLE_STATUSES:
            raise AssetNotEligibleForRetirementError(
                f"לא ניתן להעביר את הנכס לארכיון: סטטוס הנכס '{asset.status.value}' "
                "אינו מאפשר בקשת גריטה."
            )

        retirement = await self._transfer_repo.create_retirement(
            {
                "asset_id": asset_id,
                "requested_by_id": requested_by_id,
                "reason": reason,
                "disposal_method": disposal_method,
                "what_happened": what_happened,
                "supplier_name": supplier_name,
                "status": RetirementStatus.PENDING,
            }
        )

        await self._asset_repo.log_history(
            asset_id=asset_id,
            action="RETIREMENT_REQUESTED",
            actor_id=requested_by_id,
            notes=f"סיבה: {reason}. שיטת סילוק: {disposal_method}.",
        )

        return retirement

    async def approve_retirement(
        self,
        retirement_id: uuid.UUID,
        manager_id: int,
        notes: Optional[str] = None,
    ) -> AssetRetirement:
        """Approve a pending retirement request and mark the asset RETIRED.

        Raises ``RetirementRequestNotFoundError`` /
        ``RetirementRequestNotPendingError`` for invalid requests,
        ``ApproverNotFoundError`` when the approver is missing, and
        ``ApprovalForbiddenError`` when the approver lacks authority.
        """
        retirement = await self._load_pending_retirement(retirement_id)
        await self._require_approval_authority(manager_id)

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
            notes=f"פרישה אושרה. סיבה: {retirement.reason}. "
                  f"שיטת סילוק: {retirement.disposal_method}. "
                  f"הערות: {notes or 'ללא'}.",
        )

        return retirement

    async def reject_retirement(
        self,
        retirement_id: uuid.UUID,
        manager_id: int,
        reason: str,
    ) -> AssetRetirement:
        """Reject a pending retirement request with a reason.

        Records the rejection, stamps the approver/timestamp, and logs a
        history entry on the related asset. Raises
        ``RetirementRequestNotFoundError`` /
        ``RetirementRequestNotPendingError`` for invalid requests.
        """
        retirement = await self._load_pending_retirement(retirement_id)

        retirement.status = RetirementStatus.REJECTED
        retirement.approved_by_id = manager_id
        retirement.approved_at = _utc_now()
        retirement.notes = reason
        await self._transfer_repo._session.flush()

        await self._asset_repo.log_history(
            asset_id=retirement.asset_id,
            action="RETIREMENT_REJECTED",
            actor_id=manager_id,
            notes=f"פרישה נדחתה. סיבה: {reason}",
        )

        return retirement

    async def delete_archived_asset(
        self,
        asset_id: uuid.UUID,
        manager_id: int,
    ) -> None:
        """Permanently delete a RETIRED asset and every dependent row.

        Only an Admin may hard-delete. All dependent rows — asset history,
        transfers, warehouse returns, retirement requests, and the polymorphic
        documents — are deleted explicitly here rather than relying on database
        ``ON DELETE CASCADE``. The cascade constraints are applied by a manual
        SQL migration that may not have run on a given database; deleting the
        children in the service makes the operation succeed regardless.

        Raises ``AssetNotFoundError`` when the asset is missing,
        ``AssetNotInArchiveError`` when it is not RETIRED, and
        ``AssetPermanentDeleteForbiddenError`` when the caller is not Admin.
        """
        asset = await self._asset_repo.get_by_id(asset_id)
        if asset is None:
            raise AssetNotFoundError()

        if asset.status != AssetStatus.RETIRED:
            raise AssetNotInArchiveError(
                f"לא ניתן למחוק את הנכס לצמיתות: סטטוס הנכס '{asset.status.value}' "
                "אינו ארכיון (RETIRED)."
            )

        await self._require_permanent_delete_authority(manager_id)

        session = self._asset_repo._session

        # Remove polymorphic document rows (no FK, so no cascade).
        await session.execute(
            sql_delete(CemsDocument).where(
                CemsDocument.entity_type == _FIXED_ASSET_DOCUMENT_ENTITY_TYPE,
                CemsDocument.entity_id == asset_id,
            )
        )

        # Remove the FK-dependent child rows that have no ORM delete-orphan
        # cascade, so the delete does not depend on the database having
        # ON DELETE CASCADE in place. (Asset history IS covered by the ORM
        # ``delete-orphan`` cascade on ``FixedAsset.history`` below.)
        for child_model in (Transfer, WarehouseReturn, AssetRetirement):
            await session.execute(
                sql_delete(child_model).where(child_model.asset_id == asset_id)
            )

        # Delete the asset itself; the ORM cascade removes its history rows.
        await self._asset_repo.delete(asset_id)
        await session.flush()

    # ---------- private helpers ----------

    async def _load_pending_retirement(
        self, retirement_id: uuid.UUID
    ) -> AssetRetirement:
        """Load a retirement request and assert it is still PENDING."""
        retirement = await self._transfer_repo.get_retirement_by_id(retirement_id)
        if retirement is None:
            raise RetirementRequestNotFoundError()
        if retirement.status != RetirementStatus.PENDING:
            raise RetirementRequestNotPendingError()
        return retirement

    async def _require_approval_authority(self, manager_id: int) -> None:
        """Assert the acting user may approve/reject retirements."""
        approver = await self._user_repo.get_by_id(manager_id)
        if approver is None:
            raise ApproverNotFoundError()

        is_main_admin = approver.role == "Admin"
        is_cems_authority = approver.cems_role in (
            UserRole.ADMIN.value,
            UserRole.MANAGER.value,
        )
        if not (is_main_admin or is_cems_authority):
            raise ApprovalForbiddenError()

    async def _require_permanent_delete_authority(self, manager_id: int) -> None:
        """Assert the acting user is an Admin allowed to hard-delete."""
        user = await self._user_repo.get_by_id(manager_id)
        if user is None:
            raise ApproverNotFoundError()

        is_main_admin = user.role == "Admin"
        is_cems_admin = user.cems_role == UserRole.ADMIN.value
        if not (is_main_admin or is_cems_admin):
            raise AssetPermanentDeleteForbiddenError()
