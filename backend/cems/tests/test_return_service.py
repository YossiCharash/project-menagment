"""Tests for ReturnService — focused on the reject_return flow."""

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.models.fixed_asset import AssetStatus, FixedAsset
from backend.cems.models.transfer import ReturnStatus
from backend.cems.models.user import User
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.transfer_repository import TransferRepository
from backend.cems.repositories.warehouse_repository import WarehouseRepository
from backend.cems.services.return_service import ReturnService


def _build_service(session: AsyncSession) -> ReturnService:
    return ReturnService(
        asset_repo=AssetRepository(session),
        transfer_repo=TransferRepository(session),
        warehouse_repo=WarehouseRepository(session),
    )


async def _make_pending_return(
    service: ReturnService,
    asset: FixedAsset,
    returned_by_id: int,
    warehouse_id: uuid.UUID,
):
    return await service.request_return(
        asset_id=asset.id,
        returned_by_id=returned_by_id,
        warehouse_id=warehouse_id,
        reason="Initial reason",
    )


@pytest.mark.asyncio
async def test_reject_return_marks_record_rejected(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    service = _build_service(async_session)
    wr = await _make_pending_return(
        service,
        asset=seed_asset,
        returned_by_id=seed_users["employee"].id,
        warehouse_id=seed_warehouse["warehouse"].id,
    )

    rejected = await service.reject_return(
        return_id=wr.id,
        manager_id=seed_users["manager"].id,
        reason="Wrong warehouse",
    )

    assert rejected.status == ReturnStatus.REJECTED
    assert rejected.manager_id == seed_users["manager"].id
    assert rejected.resolved_at is not None
    assert "Wrong warehouse" in (rejected.return_reason or "")

    # Asset status must not have changed (it was never moved on reject).
    asset_repo = AssetRepository(async_session)
    asset = await asset_repo.get_by_id(seed_asset.id)
    assert asset is not None
    assert asset.status == AssetStatus.ACTIVE


@pytest.mark.asyncio
async def test_reject_return_raises_404_for_unknown_id(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_warehouse: dict,
):
    service = _build_service(async_session)

    with pytest.raises(HTTPException) as exc_info:
        await service.reject_return(
            return_id=uuid.uuid4(),
            manager_id=seed_users["manager"].id,
            reason="any",
        )

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_reject_return_raises_409_when_not_pending(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    service = _build_service(async_session)
    wr = await _make_pending_return(
        service,
        asset=seed_asset,
        returned_by_id=seed_users["employee"].id,
        warehouse_id=seed_warehouse["warehouse"].id,
    )

    # First rejection succeeds; second must fail with 409.
    await service.reject_return(
        return_id=wr.id,
        manager_id=seed_users["manager"].id,
        reason="first",
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.reject_return(
            return_id=wr.id,
            manager_id=seed_users["manager"].id,
            reason="second",
        )

    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_reject_return_forbidden_for_non_owning_manager(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    service = _build_service(async_session)
    wr = await _make_pending_return(
        service,
        asset=seed_asset,
        returned_by_id=seed_users["employee"].id,
        warehouse_id=seed_warehouse["warehouse"].id,
    )

    # admin user is not the warehouse's current_manager_id → 403.
    with pytest.raises(HTTPException) as exc_info:
        await service.reject_return(
            return_id=wr.id,
            manager_id=seed_users["admin"].id,
            reason="trying as admin (wrong manager)",
        )

    assert exc_info.value.status_code == 403
