from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class Building(Base):
    """Building (בניין) managed by the reception desk – holds apartments and common areas."""
    __tablename__ = "buildings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    address: Mapped[str | None] = mapped_column(String(255), default=None)
    compound_name: Mapped[str | None] = mapped_column(String(255), default=None)  # שם המתחם
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("building_projects.id"), default=None, index=True
    )
    floors_count: Mapped[int] = mapped_column(Integer, default=0)
    units_per_floor: Mapped[int] = mapped_column(Integer, default=0)
    has_common_areas: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    project: Mapped["BuildingProject | None"] = relationship(
        "BuildingProject", back_populates="buildings"
    )
    apartments: Mapped[list["Apartment"]] = relationship(
        "Apartment", back_populates="building", cascade="all, delete-orphan"
    )
