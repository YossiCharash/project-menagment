"""Hebrew error messages for the CEMS fixed-asset creation flow.

Strings are grouped by topic in a single class so call sites import a
namespace rather than loose constants (per project CLAUDE.md: "All
messages in message organized by topic").
"""

from __future__ import annotations


class AssetCreationErrorMessages:
    """User-facing Hebrew error messages for creating a fixed asset."""

    ASSET_NAME_REQUIRED: str = "שם הפריט הוא שדה חובה ליצירת פריט ציוד קבוע."

    SERIAL_NUMBER_REQUIRED: str = (
        "מספר סידורי הוא שדה חובה ליצירת פריט ציוד קבוע."
    )

    SERIAL_NUMBER_ALREADY_EXISTS_TEMPLATE: str = (
        "כבר קיים פריט ציוד עם מספר סידורי '{serial_number}'. "
        "המספר הסידורי חייב להיות ייחודי — יש להזין מספר אחר."
    )

    CATEGORY_NOT_FOUND: str = (
        "הקטגוריה שנבחרה אינה קיימת במערכת. יש לבחור קטגוריה קיימת מהרשימה."
    )

    @classmethod
    def serial_number_already_exists(cls, serial_number: str) -> str:
        """Return the duplicate-serial message naming the conflicting value."""
        return cls.SERIAL_NUMBER_ALREADY_EXISTS_TEMPLATE.format(
            serial_number=serial_number,
        )
