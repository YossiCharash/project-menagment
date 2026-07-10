from __future__ import annotations
from typing import List
import os
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.models.transaction import PaymentMethod, Transaction
from backend.repositories.transaction_repository import TransactionRepository
from backend.repositories.project_repository import ProjectRepository
from backend.services.validators import resolve_category


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

    async def _validate_and_build(self, data: dict) -> Transaction:
        """Validate data-integrity invariants on a single row and build a Transaction (unpersisted).

        Only data-integrity checks remain: category required when not from_fund,
        period_start_date <= period_end_date. All business gates (date-vs-contract,
        period overlap, duplicate detection) are intentionally absent.
        """
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

        if data.get('period_start_date') and data.get('period_end_date'):
            if data['period_start_date'] > data['period_end_date']:
                raise ValueError("תאריך התחלה חייב להיות לפני תאריך סיום")

        if "payment_method" in data:
            data["payment_method"] = normalize_payment_method_for_db(data.get("payment_method"))

        return Transaction(**data)

    async def create(self, **data) -> Transaction:
        tx = await self._validate_and_build(data)
        return await self.transactions.create(tx)

    async def create_batch(self, rows: list[dict]) -> list[Transaction]:
        """Validate all rows and add_all + flush atomically."""
        from sqlalchemy import select

        built: list[Transaction] = []

        for idx, row in enumerate(rows, start=1):
            try:
                tx = await self._validate_and_build(dict(row))
            except ValueError as e:
                raise ValueError(f"שורה {idx}: {e}") from e
            built.append(tx)

        self.db.add_all(built)
        await self.db.flush()
        # One bulk SELECT instead of a refresh() per row: the selectin relationships
        # (category/supplier/user/documents) load in a handful of queries for the whole
        # batch, where per-row refresh cost ~5 round-trips per transaction and pushed
        # large batches toward client timeouts.
        ids = [tx.id for tx in built]
        result = await self.db.execute(select(Transaction).where(Transaction.id.in_(ids)))
        result.scalars().all()  # populates relationships on the identity-mapped instances
        return built

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
