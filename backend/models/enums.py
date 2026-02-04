"""Shared enums for models. Stored here to avoid circular imports."""
from enum import Enum

from sqlalchemy import TypeDecorator
from sqlalchemy.dialects.postgresql import ENUM as PgENUM


class PaymentMethod(str, Enum):
    """PostgreSQL payment_method enum values (Hebrew). API/display use Hebrew."""
    STANDING_ORDER = "הוראת קבע"
    CREDIT = "אשראי"
    CHECK = "שיק"
    CASH = "מזומן"
    BANK_TRANSFER = "העברה בנקאית"
    CENTRALIZED_YEAR_END = "גבייה מרוכזת סוף שנה"


# PgENUM must accept both on read: DB may have English (CHECK) or Hebrew (שיק) in rows.
# On write we send only English (process_bind_param).
_PAYMENT_METHOD_DB_VALUES = [e.name for e in PaymentMethod] + [e.value for e in PaymentMethod]

_ENGLISH_TO_HEBREW = {e.name: e.value for e in PaymentMethod}
_HEBREW_TO_ENGLISH = {e.value: e.name for e in PaymentMethod}


class PaymentMethodType(TypeDecorator):
    """
    Column type for payment_method: DB enum has English labels; app exposes Hebrew.
    On write: convert Hebrew (or English name) -> English for DB.
    On read: convert English from DB -> Hebrew for app (and accept legacy Hebrew if present).
    """
    impl = PgENUM(
        *_PAYMENT_METHOD_DB_VALUES,
        name="payment_method",
        create_type=False,
    )
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return self._to_english(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return self._to_hebrew(value)

    @staticmethod
    def _to_english(value):
        """Convert to DB enum label (English)."""
        if value is None:
            return None
        s = str(value).strip()
        if not s:
            return None
        # Already English (enum name)
        if s in _ENGLISH_TO_HEBREW:
            return s
        # Hebrew value -> English name
        return _HEBREW_TO_ENGLISH.get(s, s)

    @staticmethod
    def _to_hebrew(value):
        """Convert DB value to app display (Hebrew)."""
        if value is None:
            return None
        s = str(value).strip()
        if not s:
            return None
        # Already Hebrew (legacy or display)
        if s in (e.value for e in PaymentMethod):
            return s
        # English name -> Hebrew
        return _ENGLISH_TO_HEBREW.get(s, s)
