from __future__ import annotations
from datetime import datetime, date
from sqlalchemy import String, Date, DateTime, ForeignKey, Numeric, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.associationproxy import association_proxy

from backend.db.base import Base
from backend.models.category import Category


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    project: Mapped["Project"] = relationship(back_populates="budgets")
    
    category: Mapped[str] = mapped_column(String(50), index=True)  # ExpenseCategory enum value
    amount: Mapped[float] = mapped_column(Numeric(14, 2))  # Total budget amount
    period_type: Mapped[str] = mapped_column(String(20), default="Annual")  # "Annual" or "Monthly"
    start_date: Mapped[date] = mapped_column(Date, index=True)  # When budget period starts
    end_date: Mapped[date | None] = mapped_column(Date, default=None)  # When budget period ends (for annual budgets)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

