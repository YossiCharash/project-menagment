from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class Apartment(Base):
    """Apartment or common area (דירה / שטח משותף) within a building."""
    __tablename__ = "apartments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), index=True)
    floor: Mapped[int] = mapped_column(Integer, default=0)
    unit_number: Mapped[str] = mapped_column(String(32))
    label: Mapped[str | None] = mapped_column(String(255), default=None)  # תווית: לובי / חניון / מחסן
    is_common_area: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    building: Mapped["Building"] = relationship("Building", back_populates="apartments")
    tenants: Mapped[list["Tenant"]] = relationship(
        "Tenant", back_populates="apartment", cascade="all, delete-orphan"
    )
    keys: Mapped[list["ApartmentKey"]] = relationship(
        "ApartmentKey", back_populates="apartment", cascade="all, delete-orphan"
    )
    vehicles: Mapped[list["AuthorizedVehicle"]] = relationship(
        "AuthorizedVehicle", back_populates="apartment", cascade="all, delete-orphan"
    )
    deliveries: Mapped[list["Delivery"]] = relationship(
        "Delivery", back_populates="apartment", cascade="all, delete-orphan"
    )
    activities: Mapped[list["ApartmentActivity"]] = relationship(
        "ApartmentActivity", back_populates="apartment", cascade="all, delete-orphan"
    )
