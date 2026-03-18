import uuid
from typing import Optional

from fastapi import HTTPException, status

from backend.cems.models.fixed_asset import AssetStatus
from backend.cems.models.signature import SignatureType
from backend.cems.models.transfer import Transfer, TransferStatus
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.transfer_repository import TransferRepository
from backend.cems.services._signature_factory import create_signature_hash


class TransferService:
    """Orchestrates the full lifecycle of an asset transfer.

    Depends on repository abstractions (constructor-injected) so
    the service is testable in isolation with mocks / in-memory repos.
    """

    def __init__(
        self,
        asset_repo: AssetRepository,
        transfer_repo: TransferRepository,
    ) -> None:
        self._asset_repo = asset_repo
        self._transfer_repo = transfer_repo

    async def transfer_asset(
        self,
        asset_id: uuid.UUID,
        from_user_id: uuid.UUID,
        to_user_id: uuid.UUID,
        to_warehouse_id: Optional[uuid.UUID],
        initiated_by_id: uuid.UUID,
        notes: Optional[str] = None,
    ) -> Transfer:
        asset = await self._asset_repo.get_by_id(asset_id)
        if asset is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found.",
            )

        if asset.status != AssetStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Asset is not transferable (current status: {asset.status.value}).",
            )

        if asset.current_custodian_id != from_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="from_user_id does not match the current custodian of the asset.",
            )

        active_transfers = await self._transfer_repo.get_active_transfers_for_asset(asset_id)
        if active_transfers:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Asset already has an active transfer in progress.",
            )

        # Mark asset as in-transfer
        await self._asset_repo.update(asset_id, {"status": AssetStatus.IN_TRANSFER})

        transfer = await self._transfer_repo.create(
            {
                "asset_id": asset_id,
                "from_user_id": from_user_id,
                "to_user_id": to_user_id,
                "from_warehouse_id": asset.current_warehouse_id,
                "to_warehouse_id": to_warehouse_id,
                "initiated_by_id": initiated_by_id,
                "status": TransferStatus.PENDING,
                "notes": notes,
            }
        )

        await self._asset_repo.log_history(
            asset_id=asset_id,
            action="TRANSFER_INITIATED",
            actor_id=initiated_by_id,
            from_custodian_id=from_user_id,
            to_custodian_id=to_user_id,
            from_warehouse_id=asset.current_warehouse_id,
            to_warehouse_id=to_warehouse_id,
            notes=notes,
        )

        return transfer

    async def complete_transfer(
        self,
        transfer_id: uuid.UUID,
        recipient_id: uuid.UUID,
        signature_hash: str,
        ip_address: Optional[str] = None,
    ) -> Transfer:
        transfer = await self._transfer_repo.get_by_id(transfer_id)
        if transfer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transfer not found.",
            )

        if transfer.status != TransferStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Transfer is not pending (current status: {transfer.status.value}).",
            )

        if transfer.to_user_id != recipient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the designated recipient can complete this transfer.",
            )

        signature = await self._transfer_repo.create_signature(
            {
                "signer_id": recipient_id,
                "signature_hash": signature_hash,
                "signature_type": SignatureType.TRANSFER_RECEIPT,
                "reference_id": transfer_id,
                "ip_address": ip_address,
            }
        )

        await self._transfer_repo.update(
            transfer_id,
            {
                "status": TransferStatus.COMPLETED,
                "recipient_signature_id": signature.id,
            },
        )

        await self._asset_repo.update(
            transfer.asset_id,
            {
                "current_custodian_id": transfer.to_user_id,
                "current_warehouse_id": transfer.to_warehouse_id,
                "status": AssetStatus.ACTIVE,
            },
        )

        await self._asset_repo.log_history(
            asset_id=transfer.asset_id,
            action="TRANSFER_COMPLETED",
            actor_id=recipient_id,
            from_custodian_id=transfer.from_user_id,
            to_custodian_id=transfer.to_user_id,
            from_warehouse_id=transfer.from_warehouse_id,
            to_warehouse_id=transfer.to_warehouse_id,
            notes=f"Transfer {transfer_id} completed with signature.",
        )

        # Re-fetch to get updated state
        return await self._transfer_repo.get_by_id(transfer_id)  # type: ignore[return-value]

    async def reject_transfer(
        self,
        transfer_id: uuid.UUID,
        rejected_by_id: uuid.UUID,
        reason: str,
    ) -> Transfer:
        transfer = await self._transfer_repo.get_by_id(transfer_id)
        if transfer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transfer not found.",
            )

        if transfer.status != TransferStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Transfer is not pending (current status: {transfer.status.value}).",
            )

        await self._transfer_repo.update(
            transfer_id,
            {"status": TransferStatus.REJECTED, "notes": reason},
        )

        # Restore asset to ACTIVE
        await self._asset_repo.update(
            transfer.asset_id,
            {"status": AssetStatus.ACTIVE},
        )

        await self._asset_repo.log_history(
            asset_id=transfer.asset_id,
            action="TRANSFER_REJECTED",
            actor_id=rejected_by_id,
            notes=f"Transfer {transfer_id} rejected. Reason: {reason}",
        )

        return await self._transfer_repo.get_by_id(transfer_id)  # type: ignore[return-value]
