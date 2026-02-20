"""
Shared validation logic extracted from services and endpoints.

This module resolves three DRY violations:

1. **Contract date validation** -- duplicated in TransactionService.create,
   RecurringTransactionService.create_template, RecurringTransactionService.update_template,
   and the transactions endpoint (create_transaction, update_transaction).

2. **Category resolution** -- duplicated in TransactionService._resolve_category
   and RecurringTransactionService._resolve_category.

3. **get_uploads_dir** -- duplicated in transactions.py and projects.py endpoints.

SRP: Each function validates one concern.
OCP: New validation rules can be added as new functions without modifying existing ones.
"""

from __future__ import annotations

import os
from datetime import date

from backend.core.config import settings
from backend.repositories.contract_period_repository import ContractPeriodRepository
from backend.repositories.project_repository import ProjectRepository
from backend.repositories.category_repository import CategoryRepository


async def get_first_contract_start(
    db,
    project_id: int,
) -> date | None:
    """Return the earliest contract start date for a project.

    Checks ContractPeriod table first, then falls back to Project.start_date.
    This logic was duplicated in TransactionService, RecurringTransactionService,
    and the transactions endpoint.
    """
    period_repo = ContractPeriodRepository(db)
    first_start = await period_repo.get_earliest_start_date(project_id)
    if first_start is not None:
        return first_start

    project = await ProjectRepository(db).get_by_id(project_id)
    if not project or not project.start_date:
        return None

    s = project.start_date
    return s.date() if hasattr(s, "date") else s


def validate_date_not_before_contract(
    tx_date: date,
    first_contract_start: date | None,
    entity_label: str = "עסקה",
) -> None:
    """Raise ValueError if tx_date is before the first contract start.

    Args:
        tx_date: The date to validate.
        first_contract_start: The earliest contract start, or None to skip.
        entity_label: Hebrew label for error messages (e.g. "עסקה", "תבנית מחזורית").
    """
    if first_contract_start and tx_date < first_contract_start:
        raise ValueError(
            f"לא ניתן ליצור {entity_label} לפני תאריך תחילת החוזה הראשון. "
            f"תאריך תחילת החוזה הראשון: {first_contract_start.strftime('%d/%m/%Y')}, "
            f"תאריך ה{entity_label}: {tx_date.strftime('%d/%m/%Y')}"
        )


async def resolve_category(
    db,
    *,
    category_id: int | None = None,
    category_name: str | None = None,
    allow_missing: bool = False,
):
    """Validate and resolve a category by ID or name.

    This was duplicated in TransactionService._resolve_category and
    RecurringTransactionService._resolve_category.

    Returns:
        The resolved Category object, or None if allow_missing and not found.

    Raises:
        ValueError: If category is not found (and allow_missing=False) or inactive.
    """
    category_repo = CategoryRepository(db)
    category = None

    if category_id is not None:
        category = await category_repo.get(category_id)
        if not category and not allow_missing:
            raise ValueError("קטגוריה שנבחרה לא קיימת יותר במערכת.")
    elif category_name is not None:
        category = await category_repo.get_by_name_global(category_name)
        if not category and not allow_missing:
            raise ValueError(f"לא נמצאה קטגוריה בשם '{category_name}'")

    if category and not category.is_active:
        raise ValueError(
            f"קטגוריה '{category.name}' לא פעילה. "
            f"יש להפעיל את הקטגוריה בהגדרות לפני יצירת העסקה."
        )

    return category


def get_uploads_dir() -> str:
    """Get absolute path to uploads directory, resolving relative paths.

    This was duplicated in transactions.py and projects.py endpoints.
    """
    if os.path.isabs(settings.FILE_UPLOAD_DIR):
        return settings.FILE_UPLOAD_DIR

    # Resolve relative to the backend directory
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.abspath(os.path.join(backend_dir, settings.FILE_UPLOAD_DIR))
