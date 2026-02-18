from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class QuoteBuilding(Base):
    """Building (בניין) within a quote – each has its own address, residents/apartments, and calculation method."""
    __tablename__ = "quote_buildings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    quote_project_id: Mapped[int] = mapped_column(ForeignKey("quote_projects.id"), index=True)
    address: Mapped[str | None] = mapped_column(String(255), default=None)
    num_residents: Mapped[int | None] = mapped_column(Integer, default=None)
    # by_residents = שווה בשווה (split by number of residents)
    # by_apartment_size = לפי גודל הדירה (split by apartment sizes)
    calculation_method: Mapped[str] = mapped_column(String(30), default="by_residents", index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    quote_project: Mapped["QuoteProject"] = relationship("QuoteProject", back_populates="quote_buildings")
    quote_lines: Mapped[list["QuoteLine"]] = relationship(
        "QuoteLine", back_populates="quote_building", cascade="all, delete-orphan"
    )
    quote_apartments: Mapped[list["QuoteApartment"]] = relationship(
        "QuoteApartment", back_populates="quote_building", cascade="all, delete-orphan"
    )


class QuoteApartment(Base):
    """Apartment size entry for a building when calculation_method is by_apartment_size."""
    __tablename__ = "quote_apartments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    quote_building_id: Mapped[int] = mapped_column(ForeignKey("quote_buildings.id"), index=True)
    size_sqm: Mapped[float] = mapped_column(Numeric(10, 2))  # גודל בדירוג מ"ר
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    quote_building: Mapped["QuoteBuilding"] = relationship("QuoteBuilding", back_populates="quote_apartments")
