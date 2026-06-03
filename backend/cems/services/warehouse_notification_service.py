"""Warehouse → employee notification service.

Sends a Hebrew email listing the equipment (pending transfers) waiting for
a specific employee in a specific warehouse.

Design:
- Dependency injection of repositories + email service (Dependency Inversion).
- One public method, each step in its own private method (Single Responsibility,
  every function does one mission per project CLAUDE.md).
- All strings live in `backend.cems.messages.warehouse.emails`.
"""

import uuid
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.cems.messages.warehouse.emails import (
    ERROR_EMAIL_SEND_FAILED,
    ERROR_EMPLOYEE_HAS_NO_EMAIL,
    ERROR_EMPLOYEE_NOT_FOUND,
    ERROR_NO_PENDING_ITEMS,
    ERROR_WAREHOUSE_NOT_FOUND,
    PendingItemLine,
    WarehousePendingItemsEmailTemplate,
)
from backend.cems.models.transfer import Transfer, TransferStatus
from backend.cems.models.warehouse import Warehouse
from backend.cems.repositories.transfer_repository import TransferRepository
from backend.cems.repositories.user_repository import UserRepository
from backend.cems.repositories.warehouse_repository import WarehouseRepository
from backend.models.user import User
from backend.services.email_service import EmailService


class WarehouseNotificationService:
    """Coordinates sending pending-items notifications to employees."""

    def __init__(
        self,
        email_service: EmailService,
        transfer_repo: TransferRepository,
        warehouse_repo: WarehouseRepository,
        user_repo: UserRepository,
    ) -> None:
        self._email_service = email_service
        self._transfer_repo = transfer_repo
        self._warehouse_repo = warehouse_repo
        self._user_repo = user_repo

    async def notify_employee_about_pending_items(
        self,
        warehouse_id: uuid.UUID,
        employee_user_id: int,
    ) -> int:
        """Send an email to the employee listing items waiting in the warehouse.

        Returns the number of items mentioned in the email.
        Raises HTTPException on any failure with a detailed Hebrew message.
        """
        warehouse = await self._load_warehouse(warehouse_id)
        employee = await self._load_employee(employee_user_id)
        self._ensure_employee_has_email(employee)
        items, manager_name = await self._collect_pending_items(
            warehouse=warehouse,
            employee_user_id=employee_user_id,
        )
        if not items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ERROR_NO_PENDING_ITEMS,
            )
        await self._send(
            employee=employee,
            warehouse=warehouse,
            items=items,
            manager_name=manager_name,
        )
        return len(items)

    # ─── Private steps ────────────────────────────────────────────────────

    async def _load_warehouse(self, warehouse_id: uuid.UUID) -> Warehouse:
        warehouse = await self._warehouse_repo.get_by_id(warehouse_id)
        if warehouse is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{ERROR_WAREHOUSE_NOT_FOUND} (מזהה: {warehouse_id})",
            )
        return warehouse

    async def _load_employee(self, employee_user_id: int) -> User:
        employee = await self._user_repo.get_by_id(employee_user_id)
        if employee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{ERROR_EMPLOYEE_NOT_FOUND} (מזהה: {employee_user_id})",
            )
        return employee

    @staticmethod
    def _ensure_employee_has_email(employee: User) -> None:
        if not employee.email or not employee.email.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{ERROR_EMPLOYEE_HAS_NO_EMAIL} "
                    f"(שם העובד: {employee.full_name or 'לא ידוע'})"
                ),
            )

    async def _collect_pending_items(
        self,
        warehouse: Warehouse,
        employee_user_id: int,
    ) -> tuple[List[PendingItemLine], Optional[str]]:
        """Load pending transfers for the employee that originate from this warehouse.

        Eager-loads the related asset to avoid N+1. Also resolves the warehouse
        manager's full name (used in the email body).
        """
        session = self._transfer_repo._session  # async session shared by repos
        stmt = (
            select(Transfer)
            .options(selectinload(Transfer.asset))
            .where(
                Transfer.to_user_id == employee_user_id,
                Transfer.status == TransferStatus.PENDING,
                Transfer.from_warehouse_id == warehouse.id,
            )
            .order_by(Transfer.initiated_at.desc())
        )
        result = await session.execute(stmt)
        transfers: List[Transfer] = list(result.scalars().all())

        items: List[PendingItemLine] = []
        for transfer in transfers:
            asset = transfer.asset
            if asset is None:
                continue
            items.append(
                PendingItemLine(
                    name=asset.name,
                    serial_number=asset.serial_number,
                    initiated_at=transfer.initiated_at,
                )
            )

        manager_name = await self._resolve_manager_name(warehouse.current_manager_id)
        return items, manager_name

    async def _resolve_manager_name(self, manager_id: Optional[int]) -> Optional[str]:
        if manager_id is None:
            return None
        manager = await self._user_repo.get_by_id(manager_id)
        return manager.full_name if manager else None

    async def _send(
        self,
        employee: User,
        warehouse: Warehouse,
        items: List[PendingItemLine],
        manager_name: Optional[str],
    ) -> None:
        subject = WarehousePendingItemsEmailTemplate.subject(warehouse.name)
        body = WarehousePendingItemsEmailTemplate.body(
            employee_full_name=employee.full_name,
            warehouse_name=warehouse.name,
            warehouse_location=warehouse.location,
            items=items,
            warehouse_manager_name=manager_name,
        )
        sent_ok = await self._email_service._send_email(
            to_email=employee.email,
            subject=subject,
            body=body,
        )
        if not sent_ok:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    f"{ERROR_EMAIL_SEND_FAILED} "
                    f"(נמען: {employee.email}, מחסן: {warehouse.name})"
                ),
            )
