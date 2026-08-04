"""Tests for WarehouseNotificationService.

Uses the shared in-memory SQLite fixtures from conftest.py. EmailService's
SMTP method is monkey-patched so no real email is sent.
"""

import uuid
from datetime import datetime
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.messages.cems.warehouse.emails import (
    ERROR_EMAIL_SEND_FAILED,
    ERROR_EMPLOYEE_HAS_NO_EMAIL,
    ERROR_EMPLOYEE_NOT_FOUND,
    ERROR_NO_PENDING_ITEMS,
    ERROR_WAREHOUSE_NOT_FOUND,
)
from backend.models.cems_transfer import Transfer, TransferStatus
from backend.repositories.cems_transfer_repository import TransferRepository
from backend.repositories.cems_user_repository import UserRepository
from backend.repositories.cems_warehouse_repository import WarehouseRepository
from backend.services.cems_warehouse_notification_service import (
    WarehouseNotificationService,
)
from backend.services.email_service import EmailService


# ─── Helpers ──────────────────────────────────────────────────────────────


def _build_service(
    session: AsyncSession,
    send_result: bool = True,
) -> tuple[WarehouseNotificationService, AsyncMock]:
    """Construct the service with EmailService._send_email mocked."""
    email_service = EmailService()
    send_mock = AsyncMock(return_value=send_result)
    email_service._send_email = send_mock  # type: ignore[assignment]
    service = WarehouseNotificationService(
        email_service=email_service,
        transfer_repo=TransferRepository(session),
        warehouse_repo=WarehouseRepository(session),
        user_repo=UserRepository(session),
    )
    return service, send_mock


async def _create_pending_transfer(
    session: AsyncSession,
    *,
    asset_id: uuid.UUID,
    from_user_id: int,
    to_user_id: int,
    from_warehouse_id: uuid.UUID,
) -> Transfer:
    transfer = Transfer(
        id=uuid.uuid4(),
        asset_id=asset_id,
        from_user_id=from_user_id,
        to_user_id=to_user_id,
        from_warehouse_id=from_warehouse_id,
        initiated_by_id=from_user_id,
        initiated_at=datetime.utcnow(),
        status=TransferStatus.PENDING,
    )
    session.add(transfer)
    await session.flush()
    return transfer


# ─── Tests ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notify_success_returns_count_and_calls_send(
    async_session, seed_users, seed_warehouse, seed_asset
):
    warehouse = seed_warehouse["warehouse"]
    employee = seed_users["recipient"]
    manager = seed_users["manager"]
    await _create_pending_transfer(
        async_session,
        asset_id=seed_asset.id,
        from_user_id=manager.id,
        to_user_id=employee.id,
        from_warehouse_id=warehouse.id,
    )

    service, send_mock = _build_service(async_session, send_result=True)
    count = await service.notify_employee_about_pending_items(
        warehouse_id=warehouse.id,
        employee_user_id=employee.id,
    )

    assert count == 1
    send_mock.assert_awaited_once()
    call_kwargs = send_mock.await_args.kwargs
    assert call_kwargs["to_email"] == employee.email
    assert warehouse.name in call_kwargs["subject"]
    # The serial number is internal and must never reach the user; the pending
    # item is identified by its name in the email body.
    assert seed_asset.name in call_kwargs["body"]
    assert seed_asset.serial_number not in call_kwargs["body"]


@pytest.mark.asyncio
async def test_notify_zero_pending_raises_400(
    async_session, seed_users, seed_warehouse
):
    warehouse = seed_warehouse["warehouse"]
    employee = seed_users["recipient"]

    service, send_mock = _build_service(async_session)
    with pytest.raises(HTTPException) as exc:
        await service.notify_employee_about_pending_items(
            warehouse_id=warehouse.id,
            employee_user_id=employee.id,
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == ERROR_NO_PENDING_ITEMS
    send_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_employee_without_email_raises_400(
    async_session, seed_users, seed_warehouse
):
    warehouse = seed_warehouse["warehouse"]
    employee = seed_users["recipient"]
    employee.email = ""
    await async_session.flush()

    service, send_mock = _build_service(async_session)
    with pytest.raises(HTTPException) as exc:
        await service.notify_employee_about_pending_items(
            warehouse_id=warehouse.id,
            employee_user_id=employee.id,
        )
    assert exc.value.status_code == 400
    assert ERROR_EMPLOYEE_HAS_NO_EMAIL in exc.value.detail
    send_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_warehouse_missing_raises_404(async_session, seed_users):
    service, send_mock = _build_service(async_session)
    with pytest.raises(HTTPException) as exc:
        await service.notify_employee_about_pending_items(
            warehouse_id=uuid.uuid4(),
            employee_user_id=seed_users["recipient"].id,
        )
    assert exc.value.status_code == 404
    assert ERROR_WAREHOUSE_NOT_FOUND in exc.value.detail
    send_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_employee_missing_raises_404(async_session, seed_warehouse):
    warehouse = seed_warehouse["warehouse"]
    service, send_mock = _build_service(async_session)
    with pytest.raises(HTTPException) as exc:
        await service.notify_employee_about_pending_items(
            warehouse_id=warehouse.id,
            employee_user_id=999_999,
        )
    assert exc.value.status_code == 404
    assert ERROR_EMPLOYEE_NOT_FOUND in exc.value.detail
    send_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_email_send_failure_raises_502(
    async_session, seed_users, seed_warehouse, seed_asset
):
    warehouse = seed_warehouse["warehouse"]
    employee = seed_users["recipient"]
    manager = seed_users["manager"]
    await _create_pending_transfer(
        async_session,
        asset_id=seed_asset.id,
        from_user_id=manager.id,
        to_user_id=employee.id,
        from_warehouse_id=warehouse.id,
    )

    service, send_mock = _build_service(async_session, send_result=False)
    with pytest.raises(HTTPException) as exc:
        await service.notify_employee_about_pending_items(
            warehouse_id=warehouse.id,
            employee_user_id=employee.id,
        )
    assert exc.value.status_code == 502
    assert ERROR_EMAIL_SEND_FAILED in exc.value.detail
    send_mock.assert_awaited_once()
