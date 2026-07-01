from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class AuthorizedVehicle(Base):
    """Vehicle (רכב מורשה) authorized to park for a given apartment."""
    __tablename__ = "authorized_vehicles"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id"), index=True)
    plate: Mapped[str] = mapped_column(String(32), index=True)  # מספר רישוי
    model: Mapped[str | None] = mapped_column(String(255), default=None)
    owner_name: Mapped[str] = mapped_column(String(255))
    parking_spot: Mapped[str | None] = mapped_column(String(64), default=None)  # מספר חניה
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    apartment: Mapped["Apartment"] = relationship("Apartment", back_populates="vehicles")
