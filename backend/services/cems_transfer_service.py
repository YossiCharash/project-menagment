import uuid
from typing import Optional

from backend.core.exceptions.cems import (
    AssetAlreadyHasActiveTransferError,
    AssetNotFoundError,
    AssetNotTransferableError,
    AssetUnassignedError,
    TransferNotFoundError,
    TransferNotPendingError,
    TransferRecipientMismatchError,
)
from backend.messages.cems import history_actions, transfer_messages
from backend.models.cems_fixed_asset import AssetStatus
from backend.models.cems_signature import SignatureType
from backend.models.cems_transfer import Transfer, TransferStatus
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_transfer_repository import TransferRepository


class TransferService:
    """Orchestrates the full lifecycle of an asset transfer."""

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
        to_user_id: int,
        to_warehouse_id: Optional[uuid.UUID],
        initiated_by_id: int,
        notes: Optional[str] = None,
    ) -> Transfer:
        asset = await self._asset_repo.get_by_id(asset_id)
        if asset is None:
            raise AssetNotFoundError()

        if asset.status != AssetStatus.ACTIVE:
            raise AssetNotTransferableError(asset.status.value)

        from_user_id = asset.current_custodian_id
        if from_user_id is None:
            raise AssetUnassignedError()

        active_transfers = await self._transfer_repo.get_active_transfers_for_asset(asset_id)
        if active_transfers:
            raise AssetAlreadyHasActiveTransferError()

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
            action=history_actions.TRANSFER_INITIATED,
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
            raise TransferNotFoundError()

        if transfer.status != TransferStatus.PENDING:
            raise TransferNotPendingError(transfer.status.value)

        if transfer.to_user_id != recipient_id:
            raise TransferRecipientMismatchError()

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
            action=history_actions.TRANSFER_COMPLETED,
            actor_id=recipient_id,
            from_custodian_id=transfer.from_user_id,
            to_custodian_id=transfer.to_user_id,
            from_warehouse_id=transfer.from_warehouse_id,
            to_warehouse_id=transfer.to_warehouse_id,
            notes=transfer_messages.COMPLETED_SIGNED_HISTORY_NOTE,
        )

        return await self._transfer_repo.get_by_id(transfer_id)  # type: ignore[return-value]

    async def reject_transfer(
        self,
        transfer_id: uuid.UUID,
        rejected_by_id: uuid.UUID,
        reason: str,
    ) -> Transfer:
        transfer = await self._transfer_repo.get_by_id(transfer_id)
        if transfer is None:
            raise TransferNotFoundError()

        if transfer.status != TransferStatus.PENDING:
            raise TransferNotPendingError(transfer.status.value)

        await self._transfer_repo.update(
            transfer_id,
            {"status": TransferStatus.REJECTED, "notes": reason},
        )

        await self._asset_repo.update(
            transfer.asset_id,
            {"status": AssetStatus.ACTIVE},
        )

        await self._asset_repo.log_history(
            asset_id=transfer.asset_id,
            action=history_actions.TRANSFER_REJECTED,
            actor_id=rejected_by_id,
            notes=transfer_messages.rejected_history_note(reason),
        )

        return await self._transfer_repo.get_by_id(transfer_id)  # type: ignore[return-value]
