from __future__ import annotations
from datetime import datetime, date
from sqlalchemy import String, Date, DateTime, ForeignKey, Numeric, Text, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class Fund(Base):
    __tablename__ = "funds"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), unique=True, index=True)
    project: Mapped["Project"] = relationship(back_populates="fund")
    
    current_balance: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    monthly_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    last_monthly_addition: Mapped[date | None] = mapped_column(Date, default=None)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
