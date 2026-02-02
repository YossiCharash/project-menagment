from __future__ import annotations
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class QuoteLine(Base):
    """A selected item from quote structure in a quote project, with optional amount"""
    __tablename__ = "quote_lines"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    quote_project_id: Mapped[int] = mapped_column(ForeignKey("quote_projects.id"), index=True)
    quote_structure_item_id: Mapped[int] = mapped_column(ForeignKey("quote_structure_items.id"), index=True)
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), default=None)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    quote_project: Mapped["QuoteProject"] = relationship("QuoteProject", back_populates="quote_lines")
    quote_structure_item: Mapped["QuoteStructureItem"] = relationship("QuoteStructureItem", back_populates="quote_lines")
