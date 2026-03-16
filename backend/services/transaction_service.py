from __future__ import annotations
from typing import List
import os
from uuid import uuid4
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date

from backend.core.config import settings
from backend.models.transaction import PaymentMethod, Transaction
from backend.repositories.transaction_repository import TransactionRepository
from backend.repositories.project_repository import ProjectRepository
from backend.services.validators import (
    get_first_contract_start,
    validate_date_not_before_contract,
    resolve_category,
)


def normalize_payment_method_for_db(value: str | None) -> str | None:
    """Convert PaymentMethod enum name (e.g. CENTRALIZED_YEAR_END) to DB value (Hebrew).
    PostgreSQL payment_method enum uses Hebrew values; API/frontend may send enum names."""
    if value is None or value == "":
        return value
    try:
        return PaymentMethod[value].value
    except KeyError:
        return value  # already a value (Hebrew) or unknown, leave as-is


class TransactionService:
    def __init__(self, db: AsyncSession):
        self.transactions = TransactionRepository(db)
        self.db = db
        os.makedirs(settings.FILE_UPLOAD_DIR, exist_ok=True)

    async def check_duplicate_transaction(
        self,
        project_id: int,
        tx_date: date,
        amount: float,
        supplier_id: int | None = None,
        type: str = "Expense"
    ) -> List[Transaction]:
        """Check for duplicate transactions with same date, amount, and optionally supplier"""
        from sqlalchemy import select, and_

        query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.tx_date == tx_date,
                Transaction.amount == amount,
                Transaction.type == type
            )
        )

        if supplier_id is not None:
            query = query.where(Transaction.supplier_id == supplier_id)

        result = await self.transactions.db.execute(query)
        return list(result.scalars().all())

    async def check_period_overlap(
        self,
        project_id: int,
        category_id: int | None,
        period_start: date,
        period_end: date,
        exclude_tx_id: int | None = None
    ):
        from sqlalchemy import select, and_

        if not category_id:
            return

        query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.category_id == category_id,
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                Transaction.period_start_date <= period_end,
                Transaction.period_end_date >= period_start
            )
        )

        if exclude_tx_id:
            query = query.where(Transaction.id != exclude_tx_id)

        result = await self.transactions.db.execute(query)
        overlapping = list(result.scalars().all())

        if overlapping:
            fmt_start = period_start.strftime("%d/%m/%Y")
            fmt_end = period_end.strftime("%d/%m/%Y")

            msg = (
                f"לא ניתן ליצור עסקה לתקופה {fmt_start} – {fmt_end}:\n"
                "כל קטגוריה יכולה להכיל עסקה אחת בלבד לכל תקופה.\n\n"
                "עסקאות קיימות שחופפות:\n"
            )

            for tx in overlapping:
                tx_start = tx.period_start_date.strftime("%d/%m/%Y")
                tx_end = tx.period_end_date.strftime("%d/%m/%Y")
                amount_fmt = f"₪{tx.amount:,.2f}" if tx.amount is not None else ""

                parts = [f"עסקה #{tx.id}"]
                if tx.category and tx.category.name:
                    parts.append(f"קטגוריה: {tx.category.name}")
                parts.append(f"{tx_start} – {tx_end}")
                if amount_fmt:
                    parts.append(amount_fmt)
                if tx.supplier and tx.supplier.name:
                    parts.append(f"ספק: {tx.supplier.name}")
                if tx.description:
                    parts.append(tx.description)

                msg += "• " + " | ".join(parts) + "\n"

            msg += "\nלפתרון: ערוך את העסקה הקיימת, או בחר תקופה / קטגוריה שאינה חופפת."
            raise ValueError(msg)

    async def create(self, **data) -> Transaction:
        project_id = data.get('project_id')
        tx_date = data.get('tx_date')

        # Validate transaction date against first contract start
        first_start: date | None = None
        if project_id:
            first_start = await get_first_contract_start(self.db, project_id)
        if tx_date:
            validate_date_not_before_contract(tx_date, first_start)

        # Validate category
        from_fund = data.get('from_fund', False)
        category_id = data.get('category_id')

        resolved_category = None
        if category_id is not None:
            resolved_category = await resolve_category(
                self.db, category_id=category_id, allow_missing=from_fund
            )
        elif not from_fund:
            raise ValueError("קטגוריה היא שדה חובה. יש לבחור קטגוריה מהרשימה.")

        data['category_id'] = resolved_category.id if resolved_category else None

        # Check period overlap if dates provided
        allow_overlap = data.pop('allow_overlap', False)
        if data.get('period_start_date') and data.get('period_end_date'):
            if data['period_start_date'] > data['period_end_date']:
                raise ValueError("תאריך התחלה חייב להיות לפני תאריך סיום")
            if first_start is None and project_id:
                first_start = await get_first_contract_start(self.db, project_id)
            if first_start:
                ps, pe = data['period_start_date'], data['period_end_date']
                validate_date_not_before_contract(ps, first_start, "עסקה תאריכית (התחלה)")
                validate_date_not_before_contract(pe, first_start, "עסקה תאריכית (סיום)")
            if not allow_overlap:
                await self.check_period_overlap(
                    project_id=data['project_id'],
                    category_id=data['category_id'],
                    period_start=data['period_start_date'],
                    period_end=data['period_end_date']
                )

        # Check for duplicate transactions
        allow_duplicate = data.pop('allow_duplicate', False)

        if data.get('type') == 'Expense' and not from_fund and not allow_duplicate:
            duplicates = await self.check_duplicate_transaction(
                project_id=data['project_id'],
                tx_date=data['tx_date'],
                amount=data['amount'],
                supplier_id=data.get('supplier_id'),
                type='Expense'
            )
            if duplicates:
                duplicate_details = []
                for dup in duplicates:
                    dup_info = f"עסקה #{dup.id} מתאריך {dup.tx_date}"
                    if dup.supplier_id:
                        from backend.repositories.supplier_repository import SupplierRepository
                        supplier_repo = SupplierRepository(self.transactions.db)
                        supplier = await supplier_repo.get(dup.supplier_id)
                        if supplier:
                            dup_info += f" לספק {supplier.name}"
                    duplicate_details.append(dup_info)

                raise ValueError(
                    f"זוהתה עסקה כפולה!\n\n"
                    f"קיימת עסקה עם אותם פרטים:\n" + "\n".join(duplicate_details) + "\n\n"
                    f"אם זה תשלום שונה, אנא שנה את התאריך או הסכום.\n"
                    f"אם זה אותו תשלום, אנא בדוק את הרשומות הקיימות."
                )

        # Normalize payment_method
        if "payment_method" in data:
            data["payment_method"] = normalize_payment_method_for_db(data.get("payment_method"))

        tx = Transaction(**data)
        return await self.transactions.create(tx)

    async def attach_file(self, tx: Transaction, file: UploadFile | None) -> Transaction:
        if not file:
            return tx

        import asyncio
        from backend.services.s3_service import S3Service

        await file.seek(0)

        s3 = S3Service()

        file_url = await asyncio.to_thread(
            s3.upload_file,
            prefix="transactions",
            file_obj=file.file,
            filename=file.filename or "transaction-file",
            content_type=file.content_type,
        )
        tx.file_path = file_url
        return await self.transactions.update(tx)

    async def list_by_project(
        self,
        project_id: int,
        user_id: int | None = None
    ) -> List[dict]:
        """List transactions for a project with user info and category loaded via JOIN."""
        from backend.services.audit_service import AuditService

        project_repo = ProjectRepository(self.db)
        project = await project_repo.get_by_id(project_id)
        project_name = project.name if project else f"Project {project_id}"

        if user_id:
            audit_service = AuditService(self.db)
            await audit_service.log_transaction_action(
                user_id=user_id,
                action='view_list',
                transaction_id=project_id,
                details={'project_id': project_id, 'project_name': project_name}
            )

        project_start_date = project.start_date if project else None
        project_end_date = project.end_date if project else None

        if project_start_date and hasattr(project_start_date, 'date'):
            project_start_date = project_start_date.date()
        if project_end_date and hasattr(project_end_date, 'date'):
            project_end_date = project_end_date.date()

        return await self.transactions.list_by_project_with_users(
            project_id=project_id,
            project_start_date=project_start_date,
            project_end_date=project_end_date
        )
