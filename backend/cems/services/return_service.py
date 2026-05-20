import uuid
from typing import Optional

from backend.cems.core.exceptions import (
    AssetNotFoundError,
    ReturnWarehouseNotFoundError,
    WarehouseNotFoundError,
    WarehouseReturnNotFoundError,
    WarehouseReturnNotPendingError,
    WarehouseReturnUnauthorizedError,
)
from backend.cems.core.exceptions.asset_exceptions import AssetNotReturnableError
from backend.cems.messages import history_actions, return_messages
from backend.cems.models.base import _utc_now
from backend.cems.models.fixed_asset import AssetStatus
from backend.cems.models.signature import SignatureType
from backend.cems.models.transfer import ReturnStatus, WarehouseReturn
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.transfer_repository import TransferRepository
from backend.cems.repositories.warehouse_repository import WarehouseRepository

_RETURNABLE_STATUSES = (AssetStatus.ACTIVE, AssetStatus.IN_WAREHOUSE)


class ReturnService:
    """Handles warehouse-return requests and manager approvals."""

    def __init__(
        self,
        asset_repo: AssetRepository,
        transfer_repo: TransferRepository,
        warehouse_repo: WarehouseRepository,
    ) -> None:
        self._asset_repo = asset_repo
        self._transfer_repo = transfer_repo
        self._warehouse_repo = warehouse_repo

    async def request_return(
        self,
        asset_id: uuid.UUID,
        returned_by_id: uuid.UUID,
        warehouse_id: uuid.UUID,
        reason: Optional[str] = None,
    ) -> WarehouseReturn:
        asset = await self._asset_repo.get_by_id(asset_id)
        if asset is None:
            raise AssetNotFoundError()

        if asset.status not in _RETURNABLE_STATUSES:
            raise AssetNotReturnableError(asset.status.value)

        warehouse = await self._warehouse_repo.get_by_id(warehouse_id)
        if warehouse is None:
            raise WarehouseNotFoundError()

        warehouse_return = await self._transfer_repo.create_return(
            {
                "asset_id": asset_id,
                "returned_by_id": returned_by_id,
                "warehouse_id": warehouse_id,
                "status": ReturnStatus.PENDING,
                "return_reason": reason,
            }
        )

        await self._asset_repo.log_history(
            asset_id=asset_id,
            action=history_actions.RETURN_REQUESTED,
            actor_id=returned_by_id,
            notes=return_messages.request_history_note(reason),
        )

        return warehouse_return

    async def approve_return(
        self,
        return_id: uuid.UUID,
        manager_id: uuid.UUID,
        signature_hash: str,
        ip_address: Optional[str],
        return_warehouse_id: uuid.UUID,
    ) -> WarehouseReturn:
        warehouse_return = await self._transfer_repo.get_return_by_id(return_id)
        if warehouse_return is None:
            raise WarehouseReturnNotFoundError()

        if warehouse_return.status != ReturnStatus.PENDING:
            raise WarehouseReturnNotPendingError()

        warehouse = await self._warehouse_repo.get_by_id(warehouse_return.warehouse_id)
        if warehouse is None or warehouse.current_manager_id != manager_id:
            raise WarehouseReturnUnauthorizedError()

        target_warehouse = await self._warehouse_repo.get_by_id(return_warehouse_id)
        if target_warehouse is None:
            raise ReturnWarehouseNotFoundError()

        signature = await self._transfer_repo.create_signature(
            {
                "signer_id": manager_id,
                "signature_hash": signature_hash,
                "signature_type": SignatureType.WAREHOUSE_RETURN,
                "reference_id": return_id,
                "ip_address": ip_address,
            }
        )

        warehouse_return.status = ReturnStatus.APPROVED
        warehouse_return.manager_id = manager_id
        warehouse_return.manager_signature_id = signature.id
        warehouse_return.return_warehouse_id = return_warehouse_id
        warehouse_return.resolved_at = _utc_now()
        await self._transfer_repo._session.flush()

        await self._asset_repo.update(
            warehouse_return.asset_id,
            {
                "current_custodian_id": None,
                "current_warehouse_id": return_warehouse_id,
                "status": AssetStatus.IN_WAREHOUSE,
            },
        )

        await self._asset_repo.log_history(
            asset_id=warehouse_return.asset_id,
            action=history_actions.RETURNED_TO_WAREHOUSE,
            actor_id=manager_id,
            from_custodian_id=warehouse_return.returned_by_id,
            to_warehouse_id=return_warehouse_id,
            notes=return_messages.approved_history_note(warehouse_return.return_reason),
        )

        return warehouse_return
