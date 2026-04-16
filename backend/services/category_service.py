"""
Category service.

Encapsulates all category business rules so that endpoint handlers are thin
HTTP adapters. All data access is delegated to repositories; no raw SQL is
executed here. Services raise domain exceptions (``backend.services.exceptions``);
endpoints translate them to HTTP status codes.

Each public method has a single orchestration responsibility and delegates
each discrete check/step to a named private helper. Private helpers do
exactly one thing — their name says what.
"""

from __future__ import annotations

from typing import Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.category import Category
from backend.models.supplier import Supplier
from backend.repositories.category_repository import CategoryRepository
from backend.repositories.supplier_repository import SupplierRepository
from backend.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    SupplierWithTransactionCountOut,
)
from backend.services.audit_service import AuditService
from backend.services.exceptions import (
    DependencyExistsError,
    DuplicateEntityError,
    EntityNotFoundError,
    ValidationError,
)


# User-facing Hebrew messages. These are shown in the UI; do not translate
# or rephrase without a product decision.
PARENT_CATEGORY_NOT_FOUND_MSG = "קטגוריית אב לא נמצאה"
PARENT_CATEGORY_INACTIVE_MSG = (
    "לא ניתן ליצור תת-קטגוריה תחת קטגוריה לא פעילה"
)
DUPLICATE_NAME_UNDER_PARENT_MSG = (
    "קטגוריה עם שם זה כבר קיימת תחת אותה קטגוריית אב"
)
CATEGORY_NAME_NOT_EDITABLE_MSG = (
    "לא ניתן לערוך את שם הקטגוריה. "
    "אם צריך לשנות את השם, יש למחוק את הקטגוריה הישנה וליצור חדשה."
)
CATEGORY_NOT_FOUND_MSG = "Category not found"
GENERIC_FK_DEPENDENCY_MSG = (
    "לא ניתן למחוק קטגוריה זו בגלל תלויות במערכת. "
    "יש לבדוק אם יש עסקאות, תבניות מחזוריות או פריטים אחרים הקשורים לקטגוריה זו."
)


def _plural_suffix(count: int, plural: str, singular: str) -> str:
    """Return ``plural`` when ``count > 1`` else ``singular`` — mirrors the UI wording."""
    return plural if count > 1 else singular


def _format_suppliers_blocking_delete_msg(
    transaction_count: int, supplier_names: list[str]
) -> str:
    """Format the Hebrew error shown when suppliers in the category have transactions."""
    names = ", ".join(supplier_names)
    return (
        f"לא ניתן למחוק קטגוריה זו כי יש {transaction_count} "
        f"עסקאות הקשורות לספקים בקטגוריה זו. הספקים: {names}"
    )


def _format_direct_transactions_blocking_delete_msg(count: int) -> str:
    """Format the Hebrew error shown when transactions reference the category directly."""
    tx_word_suffix = _plural_suffix(count, "ות", "ה")
    ref_word_suffix = _plural_suffix(count, "ות", "ה")
    return (
        f"לא ניתן למחוק קטגוריה זו כי יש {count} "
        f"עסק{tx_word_suffix} שמתייחס{ref_word_suffix} ישירות לקטגוריה זו"
    )


def _format_recurring_templates_blocking_delete_msg(count: int) -> str:
    """Format the Hebrew error shown when recurring templates reference the category."""
    template_word_suffix = _plural_suffix(count, "יות", "")
    ref_word_suffix = _plural_suffix(count, "ות", "ת")
    return (
        f"לא ניתן למחוק קטגוריה זו כי יש {count} "
        f"תבנית{template_word_suffix} מחזורית שמתייחס{ref_word_suffix} לקטגוריה זו"
    )


def _format_suppliers_still_referencing_msg(supplier_names: list[str]) -> str:
    """Format the Hebrew error shown in the FK-violation fallback for suppliers."""
    count = len(supplier_names)
    suffix = _plural_suffix(count, "ים", "")
    names = ", ".join(supplier_names)
    return (
        f"לא ניתן למחוק קטגוריה זו כי יש {count} "
        f"ספק{suffix} שמתייחס{suffix} לקטגוריה זו: {names}"
    )


def _is_foreign_key_violation(error: Exception) -> bool:
    """Heuristic: does ``error`` look like a Postgres FK-violation from asyncpg?"""
    error_lower = str(error).lower()
    return (
        "foreign key" in error_lower
        or "violates foreign key constraint" in error_lower
        or "asyncpg" in error_lower
    )


class CategoryService:
    """All category business rules and orchestration.

    Endpoints create an instance per request (``CategoryService(db)``) and
    call exactly one public method. The service coordinates repositories,
    audit logging, and validation; it raises domain exceptions on failure.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._categories = CategoryRepository(db)
        self._suppliers = SupplierRepository(db)
        self._audit = AuditService(db)

    # --------------------------------------------------------------
    # Read
    # --------------------------------------------------------------

    async def list_categories(
        self, include_inactive: bool, as_tree: bool
    ) -> list[Category]:
        """Return categories, optionally filtered and optionally as a tree."""
        if as_tree:
            return await self._categories.list_tree(include_inactive=include_inactive)
        return await self._categories.list(include_inactive=include_inactive)

    async def get_category_by_id(self, category_id: int) -> Category:
        """Return the category with the given id or raise ``EntityNotFoundError``."""
        return await self._load_category_or_raise(category_id)

    async def get_suppliers_with_transaction_counts_for_category(
        self, category_id: int
    ) -> list[SupplierWithTransactionCountOut]:
        """Return each supplier in the category together with its transaction count."""
        category = await self._load_category_or_raise(category_id)
        suppliers = await self._suppliers.list_suppliers_by_category_id(category_id)
        if not suppliers:
            return []
        counts_by_supplier = await self._suppliers.count_transactions_per_supplier_ids(
            [s.id for s in suppliers]
        )
        return self._build_supplier_count_dtos(suppliers, counts_by_supplier, category.name)

    # --------------------------------------------------------------
    # Create
    # --------------------------------------------------------------

    async def create_category(self, data: CategoryCreate, user_id: int) -> Category:
        """Validate and persist a new category, then log the create event."""
        await self._validate_parent_exists_and_active(data.parent_id)
        await self._validate_name_is_unique_under_parent(data.name, data.parent_id)
        created = await self._persist_new_category(data)
        await self._log_category_created(user_id, created)
        return created

    # --------------------------------------------------------------
    # Update
    # --------------------------------------------------------------

    async def update_category(
        self, category_id: int, data: CategoryUpdate, user_id: int
    ) -> Category:
        """Apply an allowed update (``is_active`` only) and log the update event."""
        category = await self._load_category_or_raise(category_id)
        update_fields = data.model_dump(exclude_unset=True)
        self._reject_name_changes(update_fields)
        updated = await self._apply_is_active_change(category, update_fields)
        await self._log_category_updated(user_id, updated)
        return updated

    # --------------------------------------------------------------
    # Delete
    # --------------------------------------------------------------

    async def delete_category(self, category_id: int, user_id: int) -> None:
        """Run all pre-delete dependency checks, then remove the category."""
        category = await self._load_category_or_raise(category_id)
        suppliers = await self._suppliers.list_suppliers_by_category_id(category_id)
        await self._reject_if_suppliers_have_transactions(suppliers)
        await self._clear_category_from_childless_suppliers(suppliers)
        await self._reject_if_direct_transactions_exist(category_id)
        await self._reject_if_recurring_templates_exist(category_id)
        await self._log_category_deleted(user_id, category)
        await self._remove_category_with_fk_fallback(category, suppliers, category_id)

    # --------------------------------------------------------------
    # Private helpers — each does one thing
    # --------------------------------------------------------------

    async def _load_category_or_raise(self, category_id: int) -> Category:
        category = await self._categories.get(category_id)
        if not category:
            raise EntityNotFoundError(CATEGORY_NOT_FOUND_MSG)
        return category

    async def _validate_parent_exists_and_active(self, parent_id: int | None) -> None:
        if parent_id is None:
            return
        parent = await self._categories.get(parent_id)
        if not parent:
            raise EntityNotFoundError(PARENT_CATEGORY_NOT_FOUND_MSG)
        if not parent.is_active:
            raise ValidationError(PARENT_CATEGORY_INACTIVE_MSG)

    async def _validate_name_is_unique_under_parent(
        self, name: str, parent_id: int | None
    ) -> None:
        existing = await self._categories.get_by_name(name, parent_id=parent_id)
        if existing:
            raise DuplicateEntityError(DUPLICATE_NAME_UNDER_PARENT_MSG)

    async def _persist_new_category(self, data: CategoryCreate) -> Category:
        entity = Category(**data.model_dump())
        return await self._categories.create(entity)

    async def _log_category_created(self, user_id: int, category: Category) -> None:
        await self._audit.log_action(
            user_id=user_id,
            action="create",
            entity="category",
            entity_id=str(category.id),
            details={"name": category.name, "parent_id": category.parent_id},
        )

    def _reject_name_changes(self, update_fields: dict) -> None:
        if "name" in update_fields:
            raise ValidationError(CATEGORY_NAME_NOT_EDITABLE_MSG)

    async def _apply_is_active_change(
        self, category: Category, update_fields: dict
    ) -> Category:
        for key, value in update_fields.items():
            setattr(category, key, value)
        return await self._categories.update(category)

    async def _log_category_updated(self, user_id: int, category: Category) -> None:
        await self._audit.log_action(
            user_id=user_id,
            action="update",
            entity="category",
            entity_id=str(category.id),
            details={"name": category.name},
        )

    async def _reject_if_suppliers_have_transactions(
        self, suppliers: list[Supplier]
    ) -> None:
        if not suppliers:
            return
        supplier_ids = [s.id for s in suppliers]
        transaction_count = (
            await self._suppliers.count_total_transactions_for_suppliers(supplier_ids)
        )
        if transaction_count > 0:
            supplier_names = [s.name for s in suppliers]
            raise DependencyExistsError(
                _format_suppliers_blocking_delete_msg(transaction_count, supplier_names)
            )

    async def _clear_category_from_childless_suppliers(
        self, suppliers: list[Supplier]
    ) -> None:
        if not suppliers:
            return
        await self._suppliers.set_category_id_to_null_for_suppliers(
            [s.id for s in suppliers]
        )

    async def _reject_if_direct_transactions_exist(self, category_id: int) -> None:
        count = await self._categories.count_transactions_referencing_category(category_id)
        if count > 0:
            raise DependencyExistsError(
                _format_direct_transactions_blocking_delete_msg(count)
            )

    async def _reject_if_recurring_templates_exist(self, category_id: int) -> None:
        count = await self._categories.count_recurring_templates_referencing_category(
            category_id
        )
        if count > 0:
            raise DependencyExistsError(
                _format_recurring_templates_blocking_delete_msg(count)
            )

    async def _log_category_deleted(self, user_id: int, category: Category) -> None:
        await self._audit.log_action(
            user_id=user_id,
            action="delete",
            entity="category",
            entity_id=str(category.id),
            details={"name": category.name},
        )

    async def _remove_category_with_fk_fallback(
        self,
        category: Category,
        suppliers_before_delete: list[Supplier],
        category_id: int,
    ) -> None:
        try:
            await self._categories.delete(category)
        except Exception as exc:  # noqa: BLE001 — we re-raise non-FK errors
            if not _is_foreign_key_violation(exc):
                raise
            await self._raise_fk_violation_as_domain_error(
                suppliers_before_delete, category_id
            )

    async def _raise_fk_violation_as_domain_error(
        self, suppliers_before_delete: list[Supplier], category_id: int
    ) -> None:
        if suppliers_before_delete:
            raise DependencyExistsError(
                _format_suppliers_still_referencing_msg(
                    [s.name for s in suppliers_before_delete]
                )
            )
        tx_count = await self._categories.count_transactions_referencing_category(
            category_id
        )
        template_count = (
            await self._categories.count_recurring_templates_referencing_category(
                category_id
            )
        )
        if tx_count > 0:
            raise DependencyExistsError(
                _format_direct_transactions_blocking_delete_msg(tx_count)
            )
        if template_count > 0:
            raise DependencyExistsError(
                _format_recurring_templates_blocking_delete_msg(template_count)
            )
        raise DependencyExistsError(GENERIC_FK_DEPENDENCY_MSG)

    @staticmethod
    def _build_supplier_count_dtos(
        suppliers: Iterable[Supplier],
        counts_by_supplier: dict[int, int],
        category_name: str,
    ) -> list[SupplierWithTransactionCountOut]:
        return [
            SupplierWithTransactionCountOut(
                id=supplier.id,
                name=supplier.name,
                category=category_name,
                transaction_count=counts_by_supplier.get(supplier.id, 0),
            )
            for supplier in suppliers
        ]
