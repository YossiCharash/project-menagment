from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class BuildingProject(Base):
    """Reception-desk project (פרויקט) grouping several buildings.

    Kept separate from the system-wide finance/tasks ``Project`` model — this is
    purely a desk-level container so a complex/site can hold multiple buildings.
    """
    __tablename__ = "building_projects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    buildings: Mapped[list["Building"]] = relationship(
        "Building", back_populates="project", order_by="Building.name"
    )
