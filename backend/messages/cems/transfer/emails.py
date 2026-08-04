"""Hebrew email templates and error constants for the transfer confirmation flow.

Single Responsibility: this module is the sole source of user-facing Hebrew
strings for the transfer-confirmation feature. Services and routes import
from here instead of hard-coding strings.
"""

from typing import Optional


# ---------- Error constants ----------

ERROR_TOKEN_INVALID: str = "קישור האישור אינו תקין."
ERROR_TOKEN_EXPIRED: str = "תוקף קישור האישור פג. יש לבקש קישור חדש מהמנהל."
ERROR_TRANSFER_ALREADY_COMPLETED: str = "ההעברה כבר אושרה או הושלמה בעבר."
ERROR_TRANSFER_NOT_FOUND: str = "לא נמצאה העברה תואמת לקישור האישור."
ERROR_EMPLOYEE_HAS_NO_EMAIL_FOR_CONFIRM: str = (
    "לא ניתן לשלוח אימייל אישור: כתובת האימייל של העובד אינה מוגדרת."
)


class TransferConfirmationEmailTemplate:
    """Builds the Hebrew subject + body for the transfer-confirmation email.

    Stateless helper. Kept as a class (per project guideline that every
    function lives in a class) and gives a single place to evolve copy.
    """

    @staticmethod
    def subject(asset_name: str) -> str:
        return f"אישור קבלת ציוד: {asset_name}"

    @staticmethod
    def body(
        employee_full_name: str,
        asset_name: str,
        from_user_name: Optional[str],
        confirmation_link: str,
        expires_hours: int,
    ) -> str:
        from_line = (
            f"נמסר על ידי: {from_user_name}\n" if from_user_name else ""
        )
        return (
            f"שלום {employee_full_name},\n\n"
            f"הועברה לידיך בקשה לקבלת הציוד הבא:\n"
            f"שם הציוד: {asset_name}\n"
            f"{from_line}"
            f"\nכדי לאשר את קבלת הציוד, לחצו על הקישור הבא:\n"
            f"{confirmation_link}\n\n"
            f"שימו לב: הקישור תקף למשך {expires_hours} שעות.\n"
            f"אם לא ביקשתם לקבל את הציוד, אנא התעלמו מהודעה זו ופנו למנהל.\n\n"
            f"בברכה,\n"
            f"צוות המערכת"
        )
