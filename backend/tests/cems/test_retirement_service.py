"""Tests for RetirementService covering the asset retirement lifecycle."""

import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.cems_fixed_asset import AssetStatus, FixedAsset
from backend.models.cems_retirement import AssetRetirement, RetirementStatus
from backend.models.cems_user import User
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_transfer_repository import TransferRepository
from backend.repositories.cems_user_repository import UserRepository
from backend.services.cems_retirement_service import RetirementService


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

    from backend.core.exceptions.cems import ApprovalForbiddenError

    # Employee should not be allowed to approve
    with pytest.raises(ApprovalForbiddenError) as exc_info:
        await service.approve_retirement(
            retirement_id=retirement.id,
            manager_id=seed_users["employee"].id,
        )

    assert exc_info.value.http_status == 403


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


@pytest.mark.asyncio
async def test_request_retirement_persists_what_happened_and_supplier(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
):
    service = _build_service(async_session)
    retirement = await service.request_retirement(
        asset_id=seed_asset.id,
        requested_by_id=seed_users["employee"].id,
        reason="Return to vendor",
        disposal_method="RETURN_TO_SUPPLIER",
        what_happened="Defective on arrival",
        supplier_name="Acme Tools Ltd",
    )

    assert retirement.what_happened == "Defective on arrival"
    assert retirement.supplier_name == "Acme Tools Ltd"


@pytest.mark.asyncio
async def test_request_retirement_missing_asset_raises_domain_error(
    async_session: AsyncSession,
    seed_users: dict[str, User],
):
    from backend.core.exceptions.cems import AssetNotFoundError

    service = _build_service(async_session)
    with pytest.raises(AssetNotFoundError) as exc_info:
        await service.request_retirement(
            asset_id=uuid.uuid4(),
            requested_by_id=seed_users["employee"].id,
            reason="x",
            disposal_method="y",
        )
    assert exc_info.value.http_status == 404


@pytest.mark.asyncio
async def test_request_retirement_ineligible_status_raises_domain_error(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
):
    from backend.core.exceptions.cems import AssetNotEligibleForRetirementError

    # Move the asset to a status that forbids retirement.
    repo = AssetRepository(async_session)
    await repo.update(seed_asset.id, {"status": AssetStatus.RETIRED})

    service = _build_service(async_session)
    with pytest.raises(AssetNotEligibleForRetirementError) as exc_info:
        await service.request_retirement(
            asset_id=seed_asset.id,
            requested_by_id=seed_users["employee"].id,
            reason="x",
            disposal_method="y",
        )
    assert exc_info.value.http_status == 409


@pytest.mark.asyncio
async def test_reject_retirement_non_pending_raises_domain_error(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
):
    from backend.core.exceptions.cems import RetirementRequestNotPendingError

    service = _build_service(async_session)
    retirement = await service.request_retirement(
        asset_id=seed_asset.id,
        requested_by_id=seed_users["employee"].id,
        reason="Broken",
        disposal_method="Scrap",
    )
    await service.approve_retirement(
        retirement_id=retirement.id,
        manager_id=seed_users["manager"].id,
    )

    with pytest.raises(RetirementRequestNotPendingError):
        await service.reject_retirement(
            retirement_id=retirement.id,
            manager_id=seed_users["manager"].id,
            reason="too late",
        )


@pytest.mark.asyncio
async def test_delete_archived_asset_removes_retired_asset(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
):
    service = _build_service(async_session)
    retirement = await service.request_retirement(
        asset_id=seed_asset.id,
        requested_by_id=seed_users["employee"].id,
        reason="Obsolete",
        disposal_method="Scrap",
    )
    await service.approve_retirement(
        retirement_id=retirement.id,
        manager_id=seed_users["admin"].id,
    )

    await service.delete_archived_asset(
        asset_id=seed_asset.id,
        manager_id=seed_users["admin"].id,
    )

    repo = AssetRepository(async_session)
    assert await repo.get_by_id(seed_asset.id) is None


@pytest.mark.asyncio
async def test_delete_archived_asset_requires_retired_status(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
):
    from backend.core.exceptions.cems import AssetNotInArchiveError

    service = _build_service(async_session)
    # seed_asset is ACTIVE, not RETIRED
    with pytest.raises(AssetNotInArchiveError) as exc_info:
        await service.delete_archived_asset(
            asset_id=seed_asset.id,
            manager_id=seed_users["admin"].id,
        )
    assert exc_info.value.http_status == 409


@pytest.mark.asyncio
async def test_delete_archived_asset_forbidden_for_non_admin(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
):
    from backend.core.exceptions.cems import AssetPermanentDeleteForbiddenError

    service = _build_service(async_session)
    retirement = await service.request_retirement(
        asset_id=seed_asset.id,
        requested_by_id=seed_users["employee"].id,
        reason="Obsolete",
        disposal_method="Scrap",
    )
    await service.approve_retirement(
        retirement_id=retirement.id,
        manager_id=seed_users["admin"].id,
    )

    # Manager (not Admin) must not be able to permanently delete.
    with pytest.raises(AssetPermanentDeleteForbiddenError) as exc_info:
        await service.delete_archived_asset(
            asset_id=seed_asset.id,
            manager_id=seed_users["manager"].id,
        )
    assert exc_info.value.http_status == 403
