from __future__ import annotations
from datetime import date, datetime
from sqlalchemy import Date, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class DeletedRecurringInstance(Base):
    """Track manually deleted recurring transaction instances to prevent regeneration"""
    __tablename__ = "deleted_recurring_instances"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    recurring_template_id: Mapped[int] = mapped_column(ForeignKey("recurring_transaction_templates.id"), index=True)
    tx_date: Mapped[date] = mapped_column(Date, index=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationship to template
    recurring_template: Mapped["RecurringTransactionTemplate"] = relationship()

    def __repr__(self):
        return f"<DeletedRecurringInstance template_id={self.recurring_template_id} tx_date={self.tx_date}>"

