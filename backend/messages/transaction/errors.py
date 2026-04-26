"""User-facing error messages for the Transaction domain.

Plain messages are class attributes; parameterised messages are
``@staticmethod`` formatters. Hebrew strings appear in the UI verbatim — do
not translate or rephrase without a product decision.
"""

from __future__ import annotations


class TransactionErrorMessages:
    """Static registry of user-facing transaction error strings."""

    PROJECT_NOT_FOUND = "Project not found"
    SUPPLIER_NOT_FOUND = "Supplier not found"
    TRANSACTION_NOT_FOUND = "Transaction not found"
    SUPPLIER_INACTIVE_ON_CREATE = "Cannot create transaction with inactive supplier"
    SUPPLIER_INACTIVE_ON_UPDATE = "Cannot update transaction with inactive supplier"
    SUPPLIER_REQUIRED_FOR_EXPENSE = "Supplier is required for expense transactions"
    CATEGORY_REQUIRED = "קטגוריה היא שדה חובה. יש לבחור קטגוריה מהרשימה."
    FUND_NOT_FOUND = "Fund not found for this project"
    PERIOD_START_AFTER_END = "תאריך התחלה חייב להיות לפני תאריך סיום"
    CANNOT_CLEAR_CATEGORY = (
        "לא ניתן להסיר קטגוריה מעסקה רגילה. "
        "רק עסקאות קופה יכולות להיות ללא קטגוריה."
    )
    DUPLICATE_DETECTED_SHORT = "זוהתה עסקה כפולה"
    ROLLBACK_NO_CREATOR = (
        "Cannot rollback: transaction has no creator (legacy). Use delete instead."
    )
    ROLLBACK_NOT_CREATOR = "Only the creator can rollback this transaction"
    ROLLBACK_HAS_DOCUMENTS = (
        "Cannot rollback transaction that has documents; use delete instead"
    )
