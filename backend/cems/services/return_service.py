import uuid
from typing import Optional

from fastapi import HTTPException, status

from backend.cems.models.base import _utc_now
from backend.cems.models.fixed_asset import AssetStatus
from backend.cems.models.signature import SignatureType
from backend.cems.models.transfer import ReturnStatus, WarehouseReturn
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.transfer_repository import TransferRepository
from backend.cems.repositories.warehouse_repository import WarehouseRepository


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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found.",
            )

        if asset.status not in (AssetStatus.ACTIVE, AssetStatus.IN_WAREHOUSE):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Asset cannot be returned (current status: {asset.status.value}).",
            )

        warehouse = await self._warehouse_repo.get_by_id(warehouse_id)
        if warehouse is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Warehouse not found.",
            )

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
            action="RETURN_REQUESTED",
            actor_id=returned_by_id,
            notes=f"Return to warehouse requested. Reason: {reason or 'N/A'}",
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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Warehouse return not found.",
            )

        if warehouse_return.status != ReturnStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Return is not pending.",
            )

        # Validate manager owns the warehouse
        warehouse = await self._warehouse_repo.get_by_id(warehouse_return.warehouse_id)
        if warehouse is None or warehouse.current_manager_id != manager_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the warehouse manager can approve returns.",
            )

        # Validate the target warehouse exists
        target_warehouse = await self._warehouse_repo.get_by_id(return_warehouse_id)
        if target_warehouse is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Return warehouse not found.",
            )

        signature = await self._transfer_repo.create_signature(
            {
                "signer_id": manager_id,
                "signature_hash": signature_hash,
                "signature_type": SignatureType.WAREHOUSE_RETURN,
                "reference_id": return_id,
                "ip_address": ip_address,
            }
        )

        now = _utc_now()
        warehouse_return.status = ReturnStatus.APPROVED
        warehouse_return.manager_id = manager_id
        warehouse_return.manager_signature_id = signature.id
        warehouse_return.return_warehouse_id = return_warehouse_id
        warehouse_return.resolved_at = now
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
            action="RETURNED_TO_WAREHOUSE",
            actor_id=manager_id,
            from_custodian_id=warehouse_return.returned_by_id,
            to_warehouse_id=return_warehouse_id,
            notes=f"Return approved by manager. Return reason: {warehouse_return.return_reason or 'N/A'}",
        )

        return warehouse_return
