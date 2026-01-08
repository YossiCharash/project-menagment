from __future__ import annotations
from datetime import datetime, date
from sqlalchemy import String, Date, DateTime, ForeignKey, Numeric, Text, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class ArchivedContract(Base):
    """
    Read-only archive table for closed contract periods.
    This ensures historical data is preserved and cannot be modified.
    """
    __tablename__ = "archived_contracts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    
    # Link to original contract period (for reference)
    contract_period_id: Mapped[int] = mapped_column(Integer, index=True, unique=True)
    
    # Link to the project
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    
    # Contract period details (copied from contract_periods)
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date] = mapped_column(Date, index=True)
    contract_year: Mapped[int] = mapped_column(Integer, index=True)
    year_index: Mapped[int] = mapped_column(Integer, default=1, index=True)
    
    # Financial summary (snapshot at time of archiving)
    total_income: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total_expense: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total_profit: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    
    # Budgets snapshot (JSON stored as text)
    budgets_snapshot: Mapped[str | None] = mapped_column(Text, default=None)
    
    # Transaction count snapshot
    transaction_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Metadata
    archived_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    archived_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    
    # Read-only flag (enforced at application level)
    is_read_only: Mapped[bool] = mapped_column(Boolean, default=True)

