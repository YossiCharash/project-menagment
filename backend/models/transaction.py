from __future__ import annotations
from typing import TYPE_CHECKING
from datetime import datetime, date
from enum import Enum
from sqlalchemy import String, Date, DateTime, ForeignKey, Numeric, Text, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates, reconstructor
from sqlalchemy.ext.associationproxy import association_proxy

from backend.db.base import Base
from backend.models.category import Category

if TYPE_CHECKING:
    from backend.models.project import Project
    from backend.models.supplier import Supplier
    from backend.models.recurring_transaction import RecurringTransactionTemplate
    from backend.models.supplier_document import SupplierDocument
    from backend.models.user import User


class TransactionType(str, Enum):
    INCOME = "Income"
    EXPENSE = "Expense"


class ExpenseCategory(str, Enum):
    CLEANING = "ניקיון"
    ELECTRICITY = "חשמל"
    INSURANCE = "ביטוח"
    GARDENING = "גינון"
    OTHER = "אחר"


class PaymentMethod(str, Enum):
    STANDING_ORDER = "הוראת קבע"
    CREDIT = "אשראי"
    CHECK = "שיק"
    CASH = "מזומן"
    BANK_TRANSFER = "העברה בנקאית"
    CENTRALIZED_YEAR_END = "גבייה מרוכזת סוף שנה"


class Transaction(Base):
    __tablename__ = "transactions"

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
    payment_method: Mapped[str | None] = mapped_column(SAEnum(PaymentMethod, name="payment_method", create_constraint=True, native_enum=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    is_exceptional: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_generated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    file_path: Mapped[str | None] = mapped_column(String(500), default=None)

    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow) # לדוגמה, חישוב מתוך שדות קיימים

    # Relationship to supplier documents linked to this transaction
    documents: Mapped[list["SupplierDocument"]] = relationship("SupplierDocument", back_populates="transaction", lazy="selectin")
    
    # Relationship to user who created the transaction
    created_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_user_id], lazy="selectin")
    
    # Fund-related fields
    from_fund: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    # Period-based transaction fields
    period_start_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    period_end_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)