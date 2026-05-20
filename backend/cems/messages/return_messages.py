"""User-facing strings related to warehouse returns."""

NOT_FOUND = "Warehouse return not found."
NOT_PENDING = "Return is not pending."
UNAUTHORIZED = "Only the warehouse manager can approve returns."
RETURN_WAREHOUSE_NOT_FOUND = "Return warehouse not found."
RETURN_NOT_FOUND_SHORT = "Return not found."


def request_history_note(reason: str | None) -> str:
    reason_clause = reason or "לא צוינה"
    return f"בקשת החזרה למחסן. סיבה: {reason_clause}"


def approved_history_note(reason: str | None) -> str:
    reason_clause = reason or "לא צוינה"
    return f"החזרה אושרה על ידי מנהל. סיבת החזרה: {reason_clause}"
