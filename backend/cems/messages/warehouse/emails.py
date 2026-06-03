"""Hebrew email templates for warehouse notifications.

All user-facing strings live here (per project CLAUDE.md: messages organized
by topic). The template class exposes pure static methods so it has no state
and a single responsibility: building the subject/body for the
"pending items waiting at a warehouse" notification.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional


# ─── Hebrew error message constants (used by the service layer) ───────────

ERROR_WAREHOUSE_NOT_FOUND: str = (
    "המחסן המבוקש לא נמצא במערכת. ודא שמזהה המחסן תקין ונסה שנית."
)
ERROR_EMPLOYEE_NOT_FOUND: str = (
    "העובד המבוקש לא נמצא במערכת. ודא שמזהה העובד תקין ונסה שנית."
)
ERROR_EMPLOYEE_HAS_NO_EMAIL: str = (
    "לא ניתן לשלוח התראה: לעובד אין כתובת אימייל מוגדרת במערכת."
)
ERROR_NO_PENDING_ITEMS: str = "אין פריטים ממתינים לעובד במחסן זה"
ERROR_EMAIL_SEND_FAILED: str = "כשל בשליחת המייל"


@dataclass(frozen=True)
class PendingItemLine:
    """Single equipment row shown inside the email body."""

    name: str
    serial_number: str
    initiated_at: Optional[datetime] = None


class WarehousePendingItemsEmailTemplate:
    """Builds the subject and body for the pending-items notification email.

    Single responsibility: format Hebrew text. No I/O, no DB, no SMTP.
    """

    _SUBJECT_PREFIX: str = "פריטים ממתינים לאיסוף"
    _DATE_FORMAT: str = "%d/%m/%Y %H:%M"

    @staticmethod
    def subject(warehouse_name: str) -> str:
        """Build the email subject line for a given warehouse."""
        if not warehouse_name:
            warehouse_name = "מחסן"
        return f"{WarehousePendingItemsEmailTemplate._SUBJECT_PREFIX} - {warehouse_name}"

    @staticmethod
    def body(
        employee_full_name: str,
        warehouse_name: str,
        warehouse_location: Optional[str],
        items: List[PendingItemLine],
        warehouse_manager_name: Optional[str] = None,
    ) -> str:
        """Build the plain-text Hebrew body. EmailService wraps it in RTL HTML."""
        greeting_name = employee_full_name or "שלום"
        location_line = (
            f"מיקום המחסן: {warehouse_location}\n"
            if warehouse_location else ""
        )
        manager_line = (
            f"מנהל המחסן: {warehouse_manager_name}\n"
            if warehouse_manager_name else ""
        )
        items_block = WarehousePendingItemsEmailTemplate._format_items(items)
        return (
            f"שלום {greeting_name},\n\n"
            f"ממתינים לך פריטים לאיסוף במחסן \"{warehouse_name}\".\n"
            f"{location_line}"
            f"{manager_line}"
            f"\nרשימת הפריטים הממתינים ({len(items)}):\n"
            f"{items_block}\n"
            f"נא לגשת למחסן בהקדם לאיסוף הפריטים.\n\n"
            f"בברכה,\n"
            f"מערכת ניהול המלאי"
        )

    @staticmethod
    def _format_items(items: List[PendingItemLine]) -> str:
        """Render the items list as an RTL-friendly bullet list."""
        if not items:
            return "  (אין פריטים)"
        lines: List[str] = []
        for index, item in enumerate(items, start=1):
            initiated_text = (
                f" (הועבר בתאריך: "
                f"{item.initiated_at.strftime(WarehousePendingItemsEmailTemplate._DATE_FORMAT)})"
                if item.initiated_at else ""
            )
            lines.append(
                f"  {index}. {item.name} - מס' סידורי: {item.serial_number}{initiated_text}"
            )
        return "\n".join(lines)
