from __future__ import annotations
from datetime import datetime, date as date_type, timezone
from sqlalchemy import String, Date, DateTime, Boolean, ForeignKey, Integer, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class QuoteProject(Base):
    """Project in the Price Quotes area - can become a real Project when approved"""
    __tablename__ = "quote_projects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("quote_projects.id"), nullable=True, index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    quote_subject_id: Mapped[int | None] = mapped_column(ForeignKey("quote_subjects.id"), nullable=True, index=True)

    # For profitability display (כמה אני ירוויח לכל פרויקט)
    expected_start_date: Mapped[date_type | None] = mapped_column(Date, default=None)
    expected_income: Mapped[float | None] = mapped_column(Numeric(14, 2), default=None)
    expected_expenses: Mapped[float | None] = mapped_column(Numeric(14, 2), default=None)
    num_residents: Mapped[int | None] = mapped_column(Integer, default=None)

    # draft | approved - when approved, converted_project_id is set
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)  # draft, approved
    converted_project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    parent: Mapped["QuoteProject | None"] = relationship("QuoteProject", remote_side=[id], back_populates="children")
    children: Mapped[list["QuoteProject"]] = relationship("QuoteProject", back_populates="parent", cascade="all, delete-orphan")
    quote_subject: Mapped["QuoteSubject | None"] = relationship("QuoteSubject", back_populates="quote_projects", lazy="joined")
    quote_buildings: Mapped[list["QuoteBuilding"]] = relationship(
        "QuoteBuilding", back_populates="quote_project", cascade="all, delete-orphan", order_by="QuoteBuilding.sort_order, QuoteBuilding.id"
    )
    quote_lines: Mapped[list["QuoteLine"]] = relationship("QuoteLine", back_populates="quote_project", cascade="all, delete-orphan")
