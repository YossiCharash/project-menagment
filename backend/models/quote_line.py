from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class QuoteLine(Base):
    """A selected item from quote structure in a quote building, with optional amount."""
    __tablename__ = "quote_lines"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    quote_project_id: Mapped[int | None] = mapped_column(ForeignKey("quote_projects.id"), nullable=True, index=True)  # legacy
    quote_building_id: Mapped[int | None] = mapped_column(ForeignKey("quote_buildings.id"), nullable=True, index=True)
    quote_structure_item_id: Mapped[int] = mapped_column(ForeignKey("quote_structure_items.id"), index=True)
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), default=None)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    quote_project: Mapped["QuoteProject | None"] = relationship("QuoteProject", back_populates="quote_lines")
    quote_building: Mapped["QuoteBuilding | None"] = relationship("QuoteBuilding", back_populates="quote_lines")
    quote_structure_item: Mapped["QuoteStructureItem"] = relationship("QuoteStructureItem", back_populates="quote_lines")
