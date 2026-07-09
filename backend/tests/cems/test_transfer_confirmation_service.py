"""Tests for ``TransferConfirmationService``.

Uses the existing CEMS conftest fixtures (in-memory aiosqlite). The
``EmailService._send_email`` coroutine is monkey-patched so no SMTP traffic
ever leaves the test process.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from backend.messages.cems.transfer.emails import (
    ERROR_TOKEN_EXPIRED,
    ERROR_TOKEN_INVALID,
    ERROR_TRANSFER_ALREADY_COMPLETED,
    ERROR_TRANSFER_NOT_FOUND,
)
from backend.models.cems_fixed_asset import FixedAsset
from backend.models.cems_transfer import TransferStatus
from backend.models.cems_user import User
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_transfer_repository import TransferRepository
from backend.repositories.cems_user_repository import UserRepository
from backend.services.cems_transfer_confirmation_service import (
    TOKEN_TYPE_CLAIM,
    TransferConfirmationService,
)
from backend.services.cems_transfer_service import TransferService
from backend.core.config import settings
from backend.services.email_service import EmailService


# ────────────────────────────── helpers ──────────────────────────────

def _build_email_service(send_return_value: bool = True) -> EmailService:
    email_service = EmailService()
    email_service._send_email = AsyncMock(return_value=send_return_value)  # type: ignore[assignment]
    return email_service


def _build_service(
    session: AsyncSession,
    email_service: EmailService | None = None,
) -> TransferConfirmationService:
    asset_repo = AssetRepository(session)
    transfer_repo = TransferRepository(session)
    user_repo = UserRepository(session)
    transfer_service = TransferService(asset_repo, transfer_repo)
    return TransferConfirmationService(
        email_service=email_service or _build_email_service(),
        transfer_service=transfer_service,
        transfer_repo=transfer_repo,
        asset_repo=asset_repo,
        user_repo=user_repo,
    )


async def _create_pending_transfer(
    session: AsyncSession,
    asset: FixedAsset,
    users: dict[str, User],
    warehouse: dict,
):
    service = TransferService(
        asset_repo=AssetRepository(session),
        transfer_repo=TransferRepository(session),
    )
    return await service.transfer_asset(
        asset_id=asset.id,
        to_user_id=users["recipient"].id,
        to_warehouse_id=warehouse["warehouse"].id,
        initiated_by_id=users["manager"].id,
    )


# ────────────────────────────── tests ──────────────────────────────

@pytest.mark.asyncio
async def test_encode_decode_roundtrip(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    transfer = await _create_pending_transfer(
        async_session, seed_asset, seed_users, seed_warehouse
    )
    service = _build_service(async_session)

    token = service._encode_token(transfer.id)
    decoded_id = service._decode_token(token)

    assert decoded_id == transfer.id


@pytest.mark.asyncio
async def test_expired_token_raises_410(async_session: AsyncSession):
    service = _build_service(async_session)
    expired_payload = {
        "transfer_id": str(uuid.uuid4()),
        "type": TOKEN_TYPE_CLAIM,
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
    }
    expired_token = jwt.encode(
        expired_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.confirm_via_token(expired_token)

    assert exc_info.value.status_code == 410
    assert exc_info.value.detail == ERROR_TOKEN_EXPIRED


@pytest.mark.asyncio
async def test_invalid_token_raises_400(async_session: AsyncSession):
    service = _build_service(async_session)

    with pytest.raises(HTTPException) as exc_info:
        await service.confirm_via_token("not-a-real-jwt")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == ERROR_TOKEN_INVALID


@pytest.mark.asyncio
async def test_wrong_claim_type_raises_400(async_session: AsyncSession):
    service = _build_service(async_session)
    bad_payload = {
        "transfer_id": str(uuid.uuid4()),
        "type": "password_reset",  # wrong type
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    bad_token = jwt.encode(
        bad_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.confirm_via_token(bad_token)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == ERROR_TOKEN_INVALID


@pytest.mark.asyncio
async def test_transfer_not_found_raises_404(async_session: AsyncSession):
    service = _build_service(async_session)
    payload = {
        "transfer_id": str(uuid.uuid4()),
        "type": TOKEN_TYPE_CLAIM,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    token = jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.confirm_via_token(token)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == ERROR_TRANSFER_NOT_FOUND


@pytest.mark.asyncio
async def test_already_completed_transfer_raises_400(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    transfer = await _create_pending_transfer(
        async_session, seed_asset, seed_users, seed_warehouse
    )
    service = _build_service(async_session)
    token = service._encode_token(transfer.id)

    # First confirm — succeeds.
    await service.confirm_via_token(token)

    # Second confirm on the same token — should fail because no longer pending.
    with pytest.raises(HTTPException) as exc_info:
        await service.confirm_via_token(token)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == ERROR_TRANSFER_ALREADY_COMPLETED


@pytest.mark.asyncio
async def test_successful_confirm_marks_transfer_completed(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    transfer = await _create_pending_transfer(
        async_session, seed_asset, seed_users, seed_warehouse
    )
    service = _build_service(async_session)
    token = service._encode_token(transfer.id)

    confirmed = await service.confirm_via_token(token, ip_address="10.0.0.1")

    assert confirmed.status == TransferStatus.COMPLETED
    assert confirmed.recipient_signature_id is not None


@pytest.mark.asyncio
async def test_send_confirmation_email_invokes_email_service(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    transfer = await _create_pending_transfer(
        async_session, seed_asset, seed_users, seed_warehouse
    )
    email_service = _build_email_service(send_return_value=True)
    service = _build_service(async_session, email_service=email_service)

    result = await service.send_confirmation_email(
        transfer_id=transfer.id,
        frontend_base_url="https://example.test",
    )

    assert result is True
    email_service._send_email.assert_awaited_once()  # type: ignore[attr-defined]
    call_args = email_service._send_email.call_args  # type: ignore[attr-defined]
    to_email = call_args.args[0] if call_args.args else call_args.kwargs.get("to_email")
    assert to_email == seed_users["recipient"].email
    body = call_args.args[2] if len(call_args.args) >= 3 else call_args.kwargs.get("body")
    assert "https://example.test/confirm-transfer/" in body


@pytest.mark.asyncio
async def test_send_confirmation_email_returns_false_when_smtp_fails(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_asset: FixedAsset,
    seed_warehouse: dict,
):
    transfer = await _create_pending_transfer(
        async_session, seed_asset, seed_users, seed_warehouse
    )
    email_service = _build_email_service(send_return_value=False)
    service = _build_service(async_session, email_service=email_service)

    result = await service.send_confirmation_email(
        transfer_id=transfer.id,
        frontend_base_url="https://example.test",
    )

    assert result is False
