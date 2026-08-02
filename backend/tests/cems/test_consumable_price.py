"""Tests for the optional unit_price field on consumable items."""

from decimal import Decimal

import pytest

from backend.api.v1 import cems_consumables
from backend.models.cems_category import AssetCategory
from backend.models.cems_user import User
from backend.schemas.cems_consumable import ConsumableItemCreate, ConsumableItemUpdate


@pytest.mark.asyncio
async def test_create_consumable_with_price(
    async_session,
    seed_users: dict[str, User],
    seed_warehouse: dict,
    seed_category: AssetCategory,
):
    payload = ConsumableItemCreate(
        name="Cable",
        category_id=seed_category.id,
        warehouse_id=seed_warehouse["warehouse"].id,
        unit="m",
        quantity=Decimal("50"),
        unit_price=Decimal("12.50"),
    )
    item = await cems_consumables.create_consumable(
        payload=payload, db=async_session, current_user=seed_users["admin"],
    )
    assert item.unit_price == Decimal("12.50")


@pytest.mark.asyncio
async def test_create_consumable_without_price_defaults_null(
    async_session,
    seed_users: dict[str, User],
    seed_warehouse: dict,
    seed_category: AssetCategory,
):
    payload = ConsumableItemCreate(
        name="Tape",
        category_id=seed_category.id,
        warehouse_id=seed_warehouse["warehouse"].id,
        unit="roll",
    )
    item = await cems_consumables.create_consumable(
        payload=payload, db=async_session, current_user=seed_users["admin"],
    )
    assert item.unit_price is None


@pytest.mark.asyncio
async def test_update_consumable_price(
    async_session,
    seed_users: dict[str, User],
    seed_consumable,
):
    updated = await cems_consumables.update_consumable(
        item_id=seed_consumable.id,
        payload=ConsumableItemUpdate(unit_price=Decimal("9.99")),
        db=async_session,
        current_user=seed_users["admin"],
    )
    assert updated.unit_price == Decimal("9.99")

    # Clearing the price back to null is supported.
    cleared = await cems_consumables.update_consumable(
        item_id=seed_consumable.id,
        payload=ConsumableItemUpdate(unit_price=None),
        db=async_session,
        current_user=seed_users["admin"],
    )
    assert cleared.unit_price is None
