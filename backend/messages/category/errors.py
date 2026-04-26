"""User-facing error messages for the Category domain.

All strings shown in the UI when a category operation fails live here as
class attributes (plain messages) or ``@staticmethod`` formatters
(parameterised messages). Hebrew strings are preserved byte-for-byte — do
not translate or rephrase without a product decision.
"""

from __future__ import annotations


class CategoryErrorMessages:
    """Static registry of user-facing category error strings."""

    # --- plain messages -------------------------------------------------
    DELETED_SUCCESSFULLY = "Category deleted successfully"
    NOT_FOUND = "Category not found"
    PARENT_NOT_FOUND = "קטגוריית אב לא נמצאה"
    PARENT_INACTIVE = "לא ניתן ליצור תת-קטגוריה תחת קטגוריה לא פעילה"
    DUPLICATE_NAME_UNDER_PARENT = (
        "קטגוריה עם שם זה כבר קיימת תחת אותה קטגוריית אב"
    )
    NAME_NOT_EDITABLE = (
        "לא ניתן לערוך את שם הקטגוריה. "
        "אם צריך לשנות את השם, יש למחוק את הקטגוריה הישנה וליצור חדשה."
    )
    GENERIC_FK_DEPENDENCY = (
        "לא ניתן למחוק קטגוריה זו בגלל תלויות במערכת. "
        "יש לבדוק אם יש עסקאות, תבניות מחזוריות או פריטים אחרים הקשורים לקטגוריה זו."
    )

    # --- formatted messages --------------------------------------------

    @staticmethod
    def suppliers_blocking_delete(
        transaction_count: int, supplier_names: list[str]
    ) -> str:
        """Message shown when suppliers in the category have transactions."""
        names = ", ".join(supplier_names)
        return (
            f"לא ניתן למחוק קטגוריה זו כי יש {transaction_count} "
            f"עסקאות הקשורות לספקים בקטגוריה זו. הספקים: {names}"
        )

    @staticmethod
    def direct_transactions_blocking_delete(count: int) -> str:
        """Message shown when transactions reference the category directly."""
        tx_word_suffix = CategoryErrorMessages._plural_suffix(count, "ות", "ה")
        ref_word_suffix = CategoryErrorMessages._plural_suffix(count, "ות", "ה")
        return (
            f"לא ניתן למחוק קטגוריה זו כי יש {count} "
            f"עסק{tx_word_suffix} שמתייחס{ref_word_suffix} ישירות לקטגוריה זו"
        )

    @staticmethod
    def recurring_templates_blocking_delete(count: int) -> str:
        """Message shown when recurring templates reference the category."""
        template_word_suffix = CategoryErrorMessages._plural_suffix(count, "יות", "")
        ref_word_suffix = CategoryErrorMessages._plural_suffix(count, "ות", "ת")
        return (
            f"לא ניתן למחוק קטגוריה זו כי יש {count} "
            f"תבנית{template_word_suffix} מחזורית שמתייחס{ref_word_suffix} לקטגוריה זו"
        )

    @staticmethod
    def suppliers_still_referencing(supplier_names: list[str]) -> str:
        """FK-violation fallback message shown when suppliers still reference the row."""
        count = len(supplier_names)
        suffix = CategoryErrorMessages._plural_suffix(count, "ים", "")
        names = ", ".join(supplier_names)
        return (
            f"לא ניתן למחוק קטגוריה זו כי יש {count} "
            f"ספק{suffix} שמתייחס{suffix} לקטגוריה זו: {names}"
        )

    # --- private helpers -----------------------------------------------

    @staticmethod
    def _plural_suffix(count: int, plural: str, singular: str) -> str:
        """Return ``plural`` when ``count > 1`` else ``singular``."""
        return plural if count > 1 else singular
