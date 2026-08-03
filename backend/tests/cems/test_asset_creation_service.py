"""Tests for AssetCreationService covering every creation invariant.

Each of these cases used to reach the database and fail there — as an
opaque HTTP 422 or 500 — leaving the user unable to add fixed equipment
with no indication of why.
"""

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.exceptions.cems import (
    AssetCategoryNotFoundError,
    AssetNameRequiredError,
    DuplicateSerialNumberError,
)
from backend.models.cems_category import AssetCategory
from backend.models.cems_fixed_asset import AssetStatus, FixedAsset
from backend.models.user import User
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_category_repository import CategoryRepository
from backend.services.cems_asset_creation_service import AssetCreationService


def _build_service(session: AsyncSession) -> AssetCreationService:
    return AssetCreationService(
        asset_repo=AssetRepository(session),
        category_repo=CategoryRepository(session),
    )


def _payload(category_id: uuid.UUID, **overrides) -> dict:
    """Return a valid create-asset payload, with optional field overrides."""
    data = {
        "name": "Cordless Drill",
        "serial_number": "SN-NEW-001",
        "category_id": category_id,
        "project_id": None,
        "purchase_date": None,
        "warranty_expiry": None,
        "notes": None,
        "current_custodian_id": None,
        "current_warehouse_id": None,
        "current_location": None,
        "status": AssetStatus.ACTIVE,
    }
    data.update(overrides)
    return data


@pytest.mark.asyncio
async def test_create_asset_persists_and_logs_history(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_category: AssetCategory,
):
    service = _build_service(async_session)

    asset = await service.create_asset(
        _payload(seed_category.id), actor_id=seed_users["admin"].id,
    )

    assert asset.id is not None
    assert asset.name == "Cordless Drill"
    assert asset.serial_number == "SN-NEW-001"
    assert asset.category_id == seed_category.id

    history = await AssetRepository(async_session).get_history(asset.id)
    assert len(history) == 1
    assert history[0].action == "ASSET_CREATED"
    assert history[0].actor_id == seed_users["admin"].id


@pytest.mark.asyncio
async def test_create_asset_trims_name_and_serial_number(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_category: AssetCategory,
):
    service = _build_service(async_session)

    asset = await service.create_asset(
        _payload(seed_category.id, name="  Ladder  ", serial_number="  SN-TRIM  "),
        actor_id=seed_users["admin"].id,
    )

    assert asset.name == "Ladder"
    assert asset.serial_number == "SN-TRIM"


@pytest.mark.asyncio
async def test_create_asset_rejects_missing_category(
    async_session: AsyncSession,
    seed_users: dict[str, User],
):
    """A missing category_id previously produced a bare 422 from pydantic."""
    service = _build_service(async_session)

    with pytest.raises(AssetCategoryNotFoundError):
        await service.create_asset(
            _payload(category_id=None), actor_id=seed_users["admin"].id,
        )


@pytest.mark.asyncio
async def test_create_asset_rejects_unknown_category(
    async_session: AsyncSession,
    seed_users: dict[str, User],
):
    service = _build_service(async_session)

    with pytest.raises(AssetCategoryNotFoundError):
        await service.create_asset(
            _payload(uuid.uuid4()), actor_id=seed_users["admin"].id,
        )


@pytest.mark.asyncio
async def test_create_asset_rejects_duplicate_serial_number(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_category: AssetCategory,
    seed_asset: FixedAsset,
):
    """The UI used to copy the name into serial_number, which is UNIQUE."""
    service = _build_service(async_session)

    with pytest.raises(DuplicateSerialNumberError) as exc_info:
        await service.create_asset(
            _payload(seed_category.id, serial_number=seed_asset.serial_number),
            actor_id=seed_users["admin"].id,
        )

    assert seed_asset.serial_number in exc_info.value.detail


@pytest.mark.asyncio
async def test_create_asset_rejects_blank_name(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_category: AssetCategory,
):
    service = _build_service(async_session)

    with pytest.raises(AssetNameRequiredError):
        await service.create_asset(
            _payload(seed_category.id, name="   "), actor_id=seed_users["admin"].id,
        )


@pytest.mark.asyncio
async def test_create_asset_generates_serial_when_blank(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_category: AssetCategory,
):
    """The inventory UI no longer collects a serial number: a blank value is
    expected and the service generates a unique internal one so the UNIQUE,
    NOT NULL column stays satisfied."""
    service = _build_service(async_session)

    asset = await service.create_asset(
        _payload(seed_category.id, serial_number="   "),
        actor_id=seed_users["admin"].id,
    )

    assert asset.serial_number
    assert asset.serial_number.startswith("AUTO-")


@pytest.mark.asyncio
async def test_create_asset_generates_serial_when_omitted(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_category: AssetCategory,
):
    """Two assets created without a serial number get distinct generated ones."""
    service = _build_service(async_session)

    payload = _payload(seed_category.id)
    del payload["serial_number"]

    first = await service.create_asset(payload, actor_id=seed_users["admin"].id)
    second_payload = _payload(seed_category.id, name="Second")
    del second_payload["serial_number"]
    second = await service.create_asset(second_payload, actor_id=seed_users["admin"].id)

    assert first.serial_number != second.serial_number
