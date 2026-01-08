from __future__ import annotations
from datetime import datetime, date
from enum import Enum
from sqlalchemy import String, Date, DateTime, ForeignKey, Numeric, Text, Boolean, Enum as SAEnum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.associationproxy import association_proxy

from backend.db.base import Base
from backend.models.category import Category
from backend.models.transaction import PaymentMethod


class RecurringFrequency(str, Enum):
    MONTHLY = "Monthly"


class RecurringEndType(str, Enum):
    NO_END = "No End"
    AFTER_OCCURRENCES = "After Occurrences"
    ON_DATE = "On Date"


class RecurringTransactionTemplate(Base):
    __tablename__ = "recurring_transaction_templates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    project: Mapped["Project"] = relationship(back_populates="recurring_templates")

    # Transaction details
    description: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(20), index=True)  # Income/Expense
    amount: Mapped[float] = mapped_column(Numeric(14, 2))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    category_obj: Mapped["Category | None"] = relationship(lazy="selectin")

    @property
    def category(self) -> str | None:
        return self.category_obj.name if self.category_obj else None

    notes: Mapped[str | None] = mapped_column(Text, default=None)
    
    # Supplier relationship (optional for Income transactions)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True, index=True)
    supplier: Mapped["Supplier | None"] = relationship("Supplier", lazy="selectin")

    # Payment method
    payment_method: Mapped[str | None] = mapped_column(SAEnum(PaymentMethod, name="payment_method", create_constraint=True, native_enum=True), nullable=True)

    # Recurring settings
    frequency: Mapped[str] = mapped_column(SAEnum(RecurringFrequency, name="recurring_frequency", create_constraint=True, native_enum=True), default=RecurringFrequency.MONTHLY.value)
    day_of_month: Mapped[int] = mapped_column(Integer, default=1)  # Day 1-31
    start_date: Mapped[date] = mapped_column(Date, index=True)
    
    # End settings
    end_type: Mapped[str] = mapped_column(SAEnum(RecurringEndType, name="recurring_end_type", create_constraint=True, native_enum=True), default=RecurringEndType.NO_END.value)
    end_date: Mapped[date | None] = mapped_column(Date, default=None)
    max_occurrences: Mapped[int | None] = mapped_column(Integer, default=None)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    
    # User who created the template
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_user_id], lazy="selectin")

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Note: No relationship to generated_transactions defined here
    # Access generated transactions via query: 
    # select(Transaction).where(Transaction.recurring_template_id == self.id)
    # The relationship is only one-way from Transaction.recurring_template
