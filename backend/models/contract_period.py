from __future__ import annotations
from datetime import datetime, date
from sqlalchemy import String, Date, DateTime, ForeignKey, Numeric, Text, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class ContractPeriod(Base):
    """
    Represents a contract period for a project. When a contract/year ends,
    the data is archived here and a new contract period starts in the main project.
    """
    __tablename__ = "contract_periods"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    
    # Link to the main project (the base project that continues across contract periods)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    project: Mapped["Project"] = relationship(back_populates="contract_periods")
    
    # Contract period details
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date] = mapped_column(Date, index=True)
    
    # Year this contract period belongs to (for grouping by year)
    contract_year: Mapped[int] = mapped_column(Integer, index=True)
    
    # Index within the year (1, 2, 3...) for multiple contracts in same year
    year_index: Mapped[int] = mapped_column(Integer, default=1, index=True)
    
    # Financial summary (calculated when contract ends)
    total_income: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total_expense: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total_profit: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    
    # Budgets snapshot (JSON stored as text)
    budgets_snapshot: Mapped[str | None] = mapped_column(Text, default=None)
    
    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Note: Transactions are not stored here - they remain linked to the project
    # but we filter them by date range when viewing contract periods

