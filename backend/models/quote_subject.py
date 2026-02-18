from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class QuoteSubject(Base):
    """Quote subject (נושא הצעה) – project-like info for a quote: address, num_apartments, num_buildings, notes.
    Not the same as real Project; every quote must be linked to a quote_subject."""
    __tablename__ = "quote_subjects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    address: Mapped[str | None] = mapped_column(String(255), default=None)
    num_apartments: Mapped[int | None] = mapped_column(Integer, default=None)
    num_buildings: Mapped[int | None] = mapped_column(Integer, default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    quote_projects: Mapped[list["QuoteProject"]] = relationship(
        "QuoteProject", back_populates="quote_subject"
    )
