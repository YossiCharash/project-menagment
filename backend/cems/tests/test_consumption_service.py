"""Tests for ConsumptionService covering stock consumption and alerting."""

import uuid
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.models.consumable import AlertType, ConsumableItem, StockAlert
from backend.cems.models.user import User
from backend.cems.repositories.consumable_repository import ConsumableRepository
from backend.cems.services.alert_service import AlertService
from backend.cems.services.consumption_service import ConsumptionService


def _build_service(session: AsyncSession) -> ConsumptionService:
    repo = ConsumableRepository(session)
    alert_svc = AlertService(repo)
    return ConsumptionService(repo, alert_svc)


@pytest.mark.asyncio
async def test_consume_stock_reduces_quantity(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_consumable: ConsumableItem,
):
    service = _build_service(async_session)
    await service.consume_stock(
        item_id=seed_consumable.id,
        consumer_id=seed_users["employee"].id,
        quantity=Decimal("25.0000"),
    )

    repo = ConsumableRepository(async_session)
    item = await repo.get_by_id(seed_consumable.id)
    assert item is not None
    assert item.quantity == Decimal("75.0000")


@pytest.mark.asyncio
async def test_consume_stock_creates_log(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_consumable: ConsumableItem,
    seed_project,
):
    service = _build_service(async_session)
    log = await service.consume_stock(
        item_id=seed_consumable.id,
        consumer_id=seed_users["employee"].id,
        quantity=Decimal("5.0000"),
        project_id=seed_project.id,
        notes="Used on site",
    )

    assert log.item_id == seed_consumable.id
    assert log.consumed_by_id == seed_users["employee"].id
    assert log.quantity_consumed == Decimal("5.0000")
    assert log.project_id == seed_project.id
    assert log.notes == "Used on site"


@pytest.mark.asyncio
async def test_consume_stock_raises_on_insufficient_quantity(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_consumable: ConsumableItem,
):
    service = _build_service(async_session)

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await service.consume_stock(
            item_id=seed_consumable.id,
            consumer_id=seed_users["employee"].id,
            quantity=Decimal("999.0000"),
        )

    assert exc_info.value.status_code == 409
    assert "Insufficient stock" in exc_info.value.detail


@pytest.mark.asyncio
async def test_consume_stock_triggers_low_stock_alert(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_consumable: ConsumableItem,
):
    service = _build_service(async_session)

    # Consume nearly all stock, bringing quantity to 5 which is below threshold of 10
    await service.consume_stock(
        item_id=seed_consumable.id,
        consumer_id=seed_users["employee"].id,
        quantity=Decimal("95.0000"),
    )

    stmt = select(StockAlert).where(
        StockAlert.item_id == seed_consumable.id,
        StockAlert.resolved.is_(False),
    )
    result = await async_session.execute(stmt)
    alerts = list(result.scalars().all())

    assert len(alerts) == 1
    assert alerts[0].alert_type == AlertType.LOW_STOCK
    assert alerts[0].quantity_at_alert == Decimal("5.0000")


@pytest.mark.asyncio
async def test_consume_stock_does_not_duplicate_alert(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_consumable: ConsumableItem,
):
    service = _build_service(async_session)

    # First consumption triggers alert (quantity -> 5)
    await service.consume_stock(
        item_id=seed_consumable.id,
        consumer_id=seed_users["employee"].id,
        quantity=Decimal("95.0000"),
    )

    # Second consumption should NOT create a duplicate alert (quantity -> 3)
    await service.consume_stock(
        item_id=seed_consumable.id,
        consumer_id=seed_users["employee"].id,
        quantity=Decimal("2.0000"),
    )

    stmt = select(StockAlert).where(
        StockAlert.item_id == seed_consumable.id,
        StockAlert.resolved.is_(False),
    )
    result = await async_session.execute(stmt)
    alerts = list(result.scalars().all())

    assert len(alerts) == 1  # Still only one alert
