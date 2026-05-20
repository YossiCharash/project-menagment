"""User-facing strings related to asset transfers."""

NOT_FOUND = "Transfer not found."


def not_pending(current_status: str) -> str:
    return f"Transfer is not pending (current status: {current_status})."


RECIPIENT_MISMATCH = "Only the designated recipient can complete this transfer."

COMPLETED_SIGNED_HISTORY_NOTE = "העברה הושלמה עם חתימה."


def rejected_history_note(reason: str) -> str:
    return f"העברה נדחתה. סיבה: {reason}"
