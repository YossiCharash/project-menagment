"""Tests for TransferService covering the full transfer lifecycle."""

import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.models.fixed_asset import AssetStatus, FixedAsset
from backend.cems.models.signature import Signature, SignatureType
from backend.cems.models.transfer import Transfer, TransferStatus
from backend.cems.models.user import User
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.transfer_repository import TransferRepository
from backend.cems.services.transfer_service import TransferService


def _build_service(session: AsyncSession) -> TransferService:
    return TransferService(
        asset_repo=AssetRepository(session),
        transfer_repo=TransferRepository(session),
    )


@pytest.mark.asyncio
async def test_transfer_creates_pending_record(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    service = _build_service(async_session)
    transfer = await service.transfer_asset(
        asset_id=seed_asset.id,
        from_user_id=seed_users["employee"].id,
        to_user_id=seed_users["recipient"].id,
        to_warehouse_id=seed_warehouse["warehouse"].id,
        initiated_by_id=seed_users["manager"].id,
    )

    assert transfer.status == TransferStatus.PENDING
    assert transfer.asset_id == seed_asset.id
    assert transfer.from_user_id == seed_users["employee"].id
    assert transfer.to_user_id == seed_users["recipient"].id


@pytest.mark.asyncio
async def test_transfer_sets_asset_in_transfer(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    service = _build_service(async_session)
    await service.transfer_asset(
        asset_id=seed_asset.id,
        from_user_id=seed_users["employee"].id,
        to_user_id=seed_users["recipient"].id,
        to_warehouse_id=seed_warehouse["warehouse"].id,
        initiated_by_id=seed_users["manager"].id,
    )

    repo = AssetRepository(async_session)
    asset = await repo.get_by_id(seed_asset.id)
    assert asset is not None
    assert asset.status == AssetStatus.IN_TRANSFER


@pytest.mark.asyncio
async def test_complete_transfer_requires_correct_recipient(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    service = _build_service(async_session)
    transfer = await service.transfer_asset(
        asset_id=seed_asset.id,
        from_user_id=seed_users["employee"].id,
        to_user_id=seed_users["recipient"].id,
        to_warehouse_id=seed_warehouse["warehouse"].id,
        initiated_by_id=seed_users["manager"].id,
    )

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await service.complete_transfer(
            transfer_id=transfer.id,
            recipient_id=seed_users["employee"].id,  # wrong user
            signature_hash="abc123",
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_complete_transfer_creates_signature(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    service = _build_service(async_session)
    transfer = await service.transfer_asset(
        asset_id=seed_asset.id,
        from_user_id=seed_users["employee"].id,
        to_user_id=seed_users["recipient"].id,
        to_warehouse_id=seed_warehouse["warehouse"].id,
        initiated_by_id=seed_users["manager"].id,
    )

    completed = await service.complete_transfer(
        transfer_id=transfer.id,
        recipient_id=seed_users["recipient"].id,
        signature_hash="sig_hash_value",
        ip_address="192.168.1.1",
    )

    assert completed.recipient_signature_id is not None

    sig = await async_session.get(Signature, completed.recipient_signature_id)
    assert sig is not None
    assert sig.signer_id == seed_users["recipient"].id
    assert sig.signature_type == SignatureType.TRANSFER_RECEIPT
    assert sig.signature_hash == "sig_hash_value"
    assert sig.ip_address == "192.168.1.1"


@pytest.mark.asyncio
async def test_complete_transfer_updates_asset_custodian(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    service = _build_service(async_session)
    transfer = await service.transfer_asset(
        asset_id=seed_asset.id,
        from_user_id=seed_users["employee"].id,
        to_user_id=seed_users["recipient"].id,
        to_warehouse_id=seed_warehouse["warehouse"].id,
        initiated_by_id=seed_users["manager"].id,
    )

    await service.complete_transfer(
        transfer_id=transfer.id,
        recipient_id=seed_users["recipient"].id,
        signature_hash="hash",
    )

    repo = AssetRepository(async_session)
    asset = await repo.get_by_id(seed_asset.id)
    assert asset is not None
    assert asset.current_custodian_id == seed_users["recipient"].id
    assert asset.current_warehouse_id == seed_warehouse["warehouse"].id
    assert asset.status == AssetStatus.ACTIVE


@pytest.mark.asyncio
async def test_complete_transfer_logs_history(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    service = _build_service(async_session)
    transfer = await service.transfer_asset(
        asset_id=seed_asset.id,
        from_user_id=seed_users["employee"].id,
        to_user_id=seed_users["recipient"].id,
        to_warehouse_id=seed_warehouse["warehouse"].id,
        initiated_by_id=seed_users["manager"].id,
    )

    await service.complete_transfer(
        transfer_id=transfer.id,
        recipient_id=seed_users["recipient"].id,
        signature_hash="hash",
    )

    repo = AssetRepository(async_session)
    history = await repo.get_history(seed_asset.id)
    actions = [h.action for h in history]
    assert "TRANSFER_INITIATED" in actions
    assert "TRANSFER_COMPLETED" in actions


@pytest.mark.asyncio
async def test_reject_transfer_restores_asset_status(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    service = _build_service(async_session)
    transfer = await service.transfer_asset(
        asset_id=seed_asset.id,
        from_user_id=seed_users["employee"].id,
        to_user_id=seed_users["recipient"].id,
        to_warehouse_id=seed_warehouse["warehouse"].id,
        initiated_by_id=seed_users["manager"].id,
    )

    rejected = await service.reject_transfer(
        transfer_id=transfer.id,
        rejected_by_id=seed_users["manager"].id,
        reason="Not needed",
    )

    assert rejected.status == TransferStatus.REJECTED

    repo = AssetRepository(async_session)
    asset = await repo.get_by_id(seed_asset.id)
    assert asset is not None
    assert asset.status == AssetStatus.ACTIVE
