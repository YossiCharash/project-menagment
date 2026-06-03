"""Hebrew error messages for the CEMS retirement / archive workflow.

Strings are grouped by topic in a single class so call sites import a
namespace rather than loose constants (per project CLAUDE.md: "All
messages in message organized by topic").
"""

from __future__ import annotations


class RetirementErrorMessages:
    """User-facing Hebrew error messages for retirement / archive flows."""

    ASSET_NOT_FOUND: str = "הנכס המבוקש לא נמצא במערכת."

    ASSET_NOT_ELIGIBLE_FOR_RETIREMENT: str = (
        "לא ניתן להעביר את הנכס לארכיון: סטטוס הנכס אינו מאפשר בקשת גריטה."
    )

    RETIREMENT_REQUEST_NOT_FOUND: str = "בקשת הגריטה המבוקשת לא נמצאה."

    RETIREMENT_REQUEST_NOT_PENDING: str = (
        "בקשת הגריטה אינה ממתינה לאישור — אין אפשרות לאשר או לדחות אותה."
    )

    APPROVER_USER_NOT_FOUND: str = "המשתמש המאשר לא נמצא במערכת."

    APPROVAL_FORBIDDEN: str = (
        "אין לך הרשאה לאשר או לדחות בקשת גריטה. נדרש תפקיד מנהל או אדמין."
    )

    ASSET_NOT_IN_ARCHIVE: str = (
        "לא ניתן למחוק את הנכס לצמיתות: הנכס אינו בסטטוס ארכיון (RETIRED)."
    )

    PERMANENT_DELETE_FORBIDDEN: str = (
        "אין לך הרשאה למחוק לצמיתות נכס מהארכיון. נדרש תפקיד אדמין."
    )
