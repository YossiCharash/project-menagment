"""Tests for RetirementService covering the asset retirement lifecycle."""

import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.models.fixed_asset import AssetStatus, FixedAsset
from backend.cems.models.retirement import AssetRetirement, RetirementStatus
from backend.cems.models.user import User
from backend.cems.repositories.asset_repository import AssetRepository
from backend.cems.repositories.transfer_repository import TransferRepository
from backend.cems.repositories.user_repository import UserRepository
from backend.cems.services.retirement_service import RetirementService


def _build_service(session: AsyncSession) -> RetirementService:
    return RetirementService(
        asset_repo=AssetRepository(session),
        transfer_repo=TransferRepository(session),
        user_repo=UserRepository(session),
    )


@pytest.mark.asyncio
async def test_request_retirement_creates_pending_record(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
):
    service = _build_service(async_session)
    retirement = await service.request_retirement(
        asset_id=seed_asset.id,
        requested_by_id=seed_users["employee"].id,
        reason="End of useful life",
        disposal_method="Recycling",
    )

    assert retirement.status == RetirementStatus.PENDING
    assert retirement.asset_id == seed_asset.id
    assert retirement.requested_by_id == seed_users["employee"].id
    assert retirement.reason == "End of useful life"
    assert retirement.disposal_method == "Recycling"
    assert retirement.approved_by_id is None
    assert retirement.approved_at is None


@pytest.mark.asyncio
async def test_approve_retirement_requires_authority(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
):
    service = _build_service(async_session)
    retirement = await service.request_retirement(
        asset_id=seed_asset.id,
        requested_by_id=seed_users["employee"].id,
        reason="Broken",
        disposal_method="Disposal",
    )

    from fastapi import HTTPException

    # Employee should not be allowed to approve
    with pytest.raises(HTTPException) as exc_info:
        await service.approve_retirement(
            retirement_id=retirement.id,
            manager_id=seed_users["employee"].id,
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_approve_retirement_marks_asset_retired(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
):
    service = _build_service(async_session)
    retirement = await service.request_retirement(
        asset_id=seed_asset.id,
        requested_by_id=seed_users["employee"].id,
        reason="Obsolete",
        disposal_method="Donation",
    )

    approved = await service.approve_retirement(
        retirement_id=retirement.id,
        manager_id=seed_users["manager"].id,
    )

    assert approved.status == RetirementStatus.APPROVED
    assert approved.approved_by_id == seed_users["manager"].id
    assert approved.approved_at is not None

    repo = AssetRepository(async_session)
    asset = await repo.get_by_id(seed_asset.id)
    assert asset is not None
    assert asset.status == AssetStatus.RETIRED


@pytest.mark.asyncio
async def test_approve_retirement_logs_history_with_reason(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
):
    service = _build_service(async_session)
    retirement = await service.request_retirement(
        asset_id=seed_asset.id,
        requested_by_id=seed_users["employee"].id,
        reason="Water damage",
        disposal_method="Scrap",
    )

    await service.approve_retirement(
        retirement_id=retirement.id,
        manager_id=seed_users["admin"].id,
        notes="Confirmed by inspection",
    )

    repo = AssetRepository(async_session)
    history = await repo.get_history(seed_asset.id)
    actions = [h.action for h in history]
    assert "RETIREMENT_REQUESTED" in actions
    assert "ASSET_RETIRED" in actions

    # The retirement approval history entry should contain the reason
    retired_entry = next(h for h in history if h.action == "ASSET_RETIRED")
    assert "Water damage" in retired_entry.notes
    assert "Confirmed by inspection" in retired_entry.notes
