"""Multi-line duplicate-detection and period-overlap messages.

Kept separate from ``errors`` because these formatters produce multi-line
Hebrew text assembled from transaction data; isolating them keeps both
files focused on a single responsibility.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from backend.messages.transaction.errors import TransactionErrorMessages

if TYPE_CHECKING:
    from backend.models.transaction import Transaction


class TransactionDuplicateMessages:
    """Formatters for duplicate-detection and period-overlap error text."""

    @staticmethod
    def duplicate_detected_error(duplicate_lines: list[str]) -> str:
        """Format the multi-line Hebrew error shown when an exact duplicate is detected."""
        return (
            f"{TransactionErrorMessages.DUPLICATE_DETECTED_SHORT}!\n\n"
            f"קיימת עסקה עם אותם פרטים:\n"
            + "\n".join(duplicate_lines)
            + "\n\n"
            f"אם זה תשלום שונה, אנא שנה את התאריך או הסכום.\n"
            f"אם זה אותו תשלום, אנא בדוק את הרשומות הקיימות."
        )

    @staticmethod
    def period_overlap_error(
        period_start: date,
        period_end: date,
        overlapping: list["Transaction"],
    ) -> str:
        """Format the multi-line Hebrew error shown when period-overlap is detected."""
        fmt_start = period_start.strftime("%d/%m/%Y")
        fmt_end = period_end.strftime("%d/%m/%Y")
        msg = (
            f"לא ניתן ליצור עסקה לתקופה {fmt_start} – {fmt_end}:\n"
            "כל קטגוריה יכולה להכיל עסקה אחת בלבד לכל תקופה.\n\n"
            "עסקאות קיימות שחופפות:\n"
        )
        for tx in overlapping:
            msg += "• " + TransactionDuplicateMessages._format_overlap_line(tx) + "\n"
        msg += "\nלפתרון: ערוך את העסקה הקיימת, או בחר תקופה / קטגוריה שאינה חופפת."
        return msg

    @staticmethod
    def duplicate_summary_line(
        tx_id: int, tx_date: date, supplier_name: str | None
    ) -> str:
        """Format a single line describing one duplicate transaction."""
        line = f"עסקה #{tx_id} מתאריך {tx_date}"
        if supplier_name:
            line += f" לספק {supplier_name}"
        return line

    # --- private helpers -----------------------------------------------

    @staticmethod
    def _format_overlap_line(tx: "Transaction") -> str:
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
        return " | ".join(parts)
