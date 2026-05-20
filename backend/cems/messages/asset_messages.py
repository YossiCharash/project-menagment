"""User-facing strings related to fixed assets."""

NOT_FOUND = "Asset not found."


def not_transferable(current_status: str) -> str:
    return f"Asset is not transferable (current status: {current_status})."


def not_retirable(current_status: str) -> str:
    return f"Asset cannot be retired (current status: {current_status})."


def not_returnable(current_status: str) -> str:
    return f"Asset cannot be returned (current status: {current_status})."


def not_assignable(current_status: str) -> str:
    return (
        f"ניתן להקצות רק נכסים שאינם מוקצים לעובד "
        f"(סטטוס נוכחי: {current_status})."
    )


UNASSIGNED = (
    "הנכס אינו מוקצה לעובד כלשהו ולא ניתן להעבירו. יש להקצות אותו תחילה."
)

ALREADY_ACTIVE_TRANSFER = "Asset already has an active transfer in progress."


def created_history_note(name: str, serial_number: str) -> str:
    return f"נכס '{name}' נוצר עם מס' סידורי '{serial_number}'."


def updated_history_note(fields: list[str]) -> str:
    return f"שדות שעודכנו: {fields}"


PHOTO_UPDATED_HISTORY_NOTE = "תמונת ציוד עודכנה"
