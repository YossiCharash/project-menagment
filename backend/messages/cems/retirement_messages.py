"""User-facing strings related to asset retirements."""

NOT_FOUND = "Retirement request not found."
NOT_PENDING = "Retirement request is not pending."
APPROVER_NOT_FOUND = "Approver user not found."
UNAUTHORIZED = "Only Admin or Manager can approve retirements."


def request_history_note(reason: str, disposal_method: str) -> str:
    return f"סיבה: {reason}. שיטת סילוק: {disposal_method}."


def approved_history_note(reason: str, disposal_method: str, notes: str | None) -> str:
    notes_clause = notes or "ללא"
    return (
        f"פרישה אושרה. סיבה: {reason}. "
        f"שיטת סילוק: {disposal_method}. "
        f"הערות: {notes_clause}."
    )


def rejected_history_note(reason: str) -> str:
    return f"פרישה נדחתה. סיבה: {reason}"
