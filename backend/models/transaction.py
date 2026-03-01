from __future__ import annotations
from typing import TYPE_CHECKING
from datetime import datetime, date, timezone
from enum import Enum
from sqlalchemy import String, Date, DateTime, ForeignKey, Numeric, Text, Boolean, TypeDecorator, Index
from sqlalchemy.dialects.postgresql import ENUM as PgENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base

if TYPE_CHECKING:
    from backend.models.project import Project
    from backend.models.document import Document


class TransactionType(str, Enum):
    INCOME = "Income"
    EXPENSE = "Expense"


class ExpenseCategory(str, Enum):
    CLEANING = "ניקיון"
    ELECTRICITY = "חשמל"
    INSURANCE = "ביטוח"
    GARDENING = "גינון"
    OTHER = "אחר"


# Payment method: PostgreSQL enum; app exposes Hebrew, DB may have English or Hebrew.
class PaymentMethod(str, Enum):
    """PostgreSQL payment_method enum values (Hebrew). API/display use Hebrew."""
    STANDING_ORDER = "הוראת קבע"
    CREDIT = "אשראי"
    CHECK = "שיק"
    CASH = "מזומן"
    BANK_TRANSFER = "העברה בנקאית"
    CENTRALIZED_YEAR_END = "גבייה מרוכזת סוף שנה"


_PAYMENT_METHOD_DB_VALUES = [e.name for e in PaymentMethod] + [e.value for e in PaymentMethod]
_PAYMENT_ENGLISH_TO_HEBREW = {e.name: e.value for e in PaymentMethod}
_PAYMENT_HEBREW_TO_ENGLISH = {e.value: e.name for e in PaymentMethod}
_PAYMENT_HEBREW_VALUES_SET = frozenset(e.value for e in PaymentMethod)


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
        if value is None:
            return None
        s = str(value).strip()
        if not s:
            return None
        if s in _PAYMENT_ENGLISH_TO_HEBREW:
            return s
        return _PAYMENT_HEBREW_TO_ENGLISH.get(s, s)

    @staticmethod
    def _to_hebrew(value):
        if value is None:
            return None
        s = str(value).strip()
        if not s:
            return None
        if s in _PAYMENT_HEBREW_VALUES_SET:
            return s
        return _PAYMENT_ENGLISH_TO_HEBREW.get(s, s)


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        # Composite indexes for common query patterns
        Index("ix_transactions_project_type_date", "project_id", "type", "tx_date"),
        Index("ix_transactions_project_category_type_date", "project_id", "category_id", "type", "tx_date"),
        Index("ix_transactions_project_period", "project_id", "period_start_date", "period_end_date"),
        Index("ix_transactions_project_fund_date", "project_id", "from_fund", "tx_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    project: Mapped["Project"] = relationship(back_populates="transactions")

    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True, index=True)
    supplier: Mapped["Supplier | None"] = relationship("Supplier", back_populates="transactions", lazy="selectin")

    recurring_template_id: Mapped[int | None] = mapped_column(ForeignKey("recurring_transaction_templates.id"), index=True, nullable=True)
    recurring_template: Mapped["RecurringTransactionTemplate | None"] = relationship()

    tx_date: Mapped[date] = mapped_column(Date, index=True)
    type: Mapped[str] = mapped_column(String(20), index=True, default=TransactionType.EXPENSE.value)
    amount: Mapped[float] = mapped_column(Numeric(14, 2))
    description: Mapped[str | None] = mapped_column(Text, default=None)

    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    category: Mapped["Category | None"] = relationship(lazy="selectin")
    # category proxy removed as category is now the relationship object
    # PostgreSQL enum; accepts both English/Hebrew on load, always exposes Hebrew str to app.
    payment_method: Mapped[str | None] = mapped_column(PaymentMethodType(), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    is_exceptional: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_generated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    file_path: Mapped[str | None] = mapped_column(String(500), default=None)

    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)) # לדוגמה, חישוב מתוך שדות קיימים

    # Relationship to documents linked to this transaction via direct FK
    documents: Mapped[list["Document"]] = relationship(
        "Document",
        primaryjoin="Document.transaction_id == Transaction.id",
        foreign_keys="Document.transaction_id",
        viewonly=True,
        lazy="selectin",
    )
    
    # Relationship to user who created the transaction
    created_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_user_id], lazy="selectin")
    
    # Fund-related fields
    from_fund: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    # Period-based transaction fields
    period_start_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    period_end_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)