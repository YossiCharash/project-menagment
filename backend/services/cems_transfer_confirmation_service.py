"""Service that orchestrates the email-link confirmation flow for transfers.

Responsibility: turn a pending Transfer into a confirmation email containing
a stateless JWT link, and translate clicks on that link back into a
``TransferService.complete_transfer`` call.

Design notes
------------
* Single Responsibility — this class does NOT mutate transfer/asset state
  directly; it delegates to ``TransferService.complete_transfer`` so the
  existing tested logic remains the single source of truth.
* Dependency Inversion — every collaborator (email service, transfer
  service, repositories) is injected via the constructor. No singletons.
* Every public step is broken into a focused private method so each
  function does ONE thing and stays well under 50 lines.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from jose import ExpiredSignatureError, JWTError, jwt

from backend.messages.cems.transfer.emails import (
    ERROR_EMPLOYEE_HAS_NO_EMAIL_FOR_CONFIRM,
    ERROR_TOKEN_EXPIRED,
    ERROR_TOKEN_INVALID,
    ERROR_TRANSFER_ALREADY_COMPLETED,
    ERROR_TRANSFER_NOT_FOUND,
    TransferConfirmationEmailTemplate,
)
from backend.models.cems_transfer import Transfer, TransferStatus
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_transfer_repository import TransferRepository
from backend.repositories.cems_user_repository import UserRepository
from backend.services.cems__signature_factory import create_signature_hash
from backend.services.cems_transfer_service import TransferService
from backend.core.config import settings
from backend.services.email_service import EmailService

logger = logging.getLogger(__name__)

# ---------- Token configuration ----------

TOKEN_TYPE_CLAIM: str = "transfer_confirm"
TOKEN_EXPIRY_HOURS: int = 24 * 7  # 7 days
SIGNATURE_ACTION: str = "transfer_email_confirm"


class TransferConfirmationService:
    """Orchestrates sending a confirmation email and acting on its link click."""

    def __init__(
        self,
        email_service: EmailService,
        transfer_service: TransferService,
        transfer_repo: TransferRepository,
        asset_repo: AssetRepository,
        user_repo: UserRepository,
    ) -> None:
        self._email_service = email_service
        self._transfer_service = transfer_service
        self._transfer_repo = transfer_repo
        self._asset_repo = asset_repo
        self._user_repo = user_repo

    # ────────────────────────────── Public API ──────────────────────────────

    async def send_confirmation_email(
        self,
        transfer_id: uuid.UUID,
        frontend_base_url: str,
    ) -> bool:
        """Compose and dispatch the confirmation email. Returns True on success."""
        transfer = await self._load_transfer(transfer_id)
        asset = await self._load_asset(transfer.asset_id)
        employee = await self._load_employee(transfer.to_user_id)
        if not employee.email:
            logger.warning(
                "Cannot send transfer confirmation: employee %s has no email.",
                employee.id,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_EMPLOYEE_HAS_NO_EMAIL_FOR_CONFIRM,
            )

        from_user_name = await self._load_from_user_name(transfer.from_user_id)
        token = self._encode_token(transfer.id)
        link = self._build_link(frontend_base_url, token)
        subject, body = self._compose_email(
            employee_full_name=employee.full_name or employee.email,
            asset_name=asset.name,
            from_user_name=from_user_name,
            confirmation_link=link,
        )
        return await self._dispatch_email(employee.email, subject, body)

    async def confirm_via_token(
        self,
        token: str,
        ip_address: Optional[str] = None,
    ) -> Transfer:
        """Decode token, validate, and complete the underlying transfer."""
        transfer_id = self._decode_token(token)
        transfer = await self._load_transfer(transfer_id)
        self._ensure_transfer_is_pending(transfer)
        signature_hash = create_signature_hash(
            user_id=transfer.id,
            action=f"{SIGNATURE_ACTION}:{token[:16]}",
        )
        return await self._transfer_service.complete_transfer(
            transfer_id=transfer.id,
            recipient_id=transfer.to_user_id,
            signature_hash=signature_hash,
            ip_address=ip_address,
        )

    async def load_preview(self, token: str) -> tuple[Transfer, str, Optional[str], str]:
        """Decode the token and return data the public preview page needs.

        Returns (transfer, asset_name, asset_serial_number, employee_full_name).
        """
        transfer_id = self._decode_token(token)
        transfer = await self._load_transfer(transfer_id)
        asset = await self._load_asset(transfer.asset_id)
        employee = await self._load_employee(transfer.to_user_id)
        return (
            transfer,
            asset.name,
            asset.serial_number,
            employee.full_name or employee.email or "",
        )

    async def resolve_from_user_name(
        self, from_user_id: Optional[int]
    ) -> Optional[str]:
        """Public helper used by the preview endpoint to render the source user."""
        return await self._load_from_user_name(from_user_id)

    # ────────────────────────────── Private steps ──────────────────────────

    def _encode_token(self, transfer_id: uuid.UUID) -> str:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS)
        payload = {
            "transfer_id": str(transfer_id),
            "type": TOKEN_TYPE_CLAIM,
            "exp": expires_at,
            "iat": datetime.now(timezone.utc),
        }
        return jwt.encode(
            payload,
            settings.JWT_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM,
        )

    def _decode_token(self, token: str) -> uuid.UUID:
        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
            )
        except ExpiredSignatureError as exc:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail=ERROR_TOKEN_EXPIRED,
            ) from exc
        except JWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_TOKEN_INVALID,
            ) from exc

        if payload.get("type") != TOKEN_TYPE_CLAIM:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_TOKEN_INVALID,
            )

        raw_transfer_id = payload.get("transfer_id")
        if not raw_transfer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_TOKEN_INVALID,
            )
        try:
            return uuid.UUID(str(raw_transfer_id))
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_TOKEN_INVALID,
            ) from exc

    async def _load_transfer(self, transfer_id: uuid.UUID) -> Transfer:
        transfer = await self._transfer_repo.get_by_id(transfer_id)
        if transfer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ERROR_TRANSFER_NOT_FOUND,
            )
        return transfer

    async def _load_asset(self, asset_id: uuid.UUID):
        asset = await self._asset_repo.get_by_id(asset_id)
        if asset is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ERROR_TRANSFER_NOT_FOUND,
            )
        return asset

    async def _load_employee(self, user_id: int):
        employee = await self._user_repo.get_by_id(user_id)
        if employee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ERROR_TRANSFER_NOT_FOUND,
            )
        return employee

    async def _load_from_user_name(self, from_user_id: Optional[int]) -> Optional[str]:
        if from_user_id is None:
            return None
        user = await self._user_repo.get_by_id(from_user_id)
        if user is None:
            return None
        return user.full_name or user.email

    @staticmethod
    def _ensure_transfer_is_pending(transfer: Transfer) -> None:
        if transfer.status != TransferStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_TRANSFER_ALREADY_COMPLETED,
            )

    @staticmethod
    def _build_link(frontend_base_url: str, token: str) -> str:
        base = frontend_base_url.rstrip("/")
        return f"{base}/confirm-transfer/{token}"

    @staticmethod
    def _compose_email(
        employee_full_name: str,
        asset_name: str,
        from_user_name: Optional[str],
        confirmation_link: str,
    ) -> tuple[str, str]:
        subject = TransferConfirmationEmailTemplate.subject(asset_name)
        body = TransferConfirmationEmailTemplate.body(
            employee_full_name=employee_full_name,
            asset_name=asset_name,
            from_user_name=from_user_name,
            confirmation_link=confirmation_link,
            expires_hours=TOKEN_EXPIRY_HOURS,
        )
        return subject, body

    async def _dispatch_email(self, to_email: str, subject: str, body: str) -> bool:
        try:
            return await self._email_service._send_email(to_email, subject, body)
        except Exception as send_error:  # pragma: no cover - defensive
            logger.error(
                "Transfer confirmation email dispatch failed for %s: %s",
                to_email,
                send_error,
                exc_info=True,
            )
            return False
